"""영수증 사진 vision 추출 — 2026-08-25 결정(docs/AI-Sessions/wiki/decisions/
2026-08-25-receipt-ocr-payment-autofill-decision.md). 새 Azure 리소스/RBAC 없이 기존
Azure OpenAI 배포(기본 gpt-5.4-mini, Settings.receipt_vision_deployment)에 이미지를 그대로
보내 구조화 추출한다 — 이 레포의 유일한 기존 컨벤션(app/rag/generation.py::verify_answer,
app/personalization/graph.py)을 그대로 따른다: response_format={"type": "json_object"} +
수동 json.loads, try/except 없이 위로 전파(예외 처리는 호출부 라우터의 몫).

트러블슈팅 STEP 1-A(2026-08-26): HEIC는 Azure OpenAI vision이 지원하지 않는 경우가 흔한데,
iPhone 기본 사진 포맷이 HEIC라 "영수증을 못 읽는다" 증상의 가장 유력한 원인이었다. vision
호출 직전에만 JPEG로 변환하고, Blob에 저장되는 원본(app/core/storage.py)은 건드리지 않는다
— 원본 보존이 이 기능의 핵심 요구사항이라는 기존 결정을 그대로 유지.

트러블슈팅 STEP 1-B(2026-08-26): 프롬프트가 "쉼표 없이 숫자만"을 요구하지만, 한국 영수증은
"15,000원"처럼 쉼표/통화기호가 흔해 LLM이 그대로 베껴 쓰는 경우가 있다. 이 값이 그대로
ReceiptExtractOut(amount: int | None)에 들어가면 pydantic ValidationError로 500이 난다 —
여기서 정규식으로 쉼표/원표시/공백을 제거한 뒤 int() 시도, 실패하면 null-fallback(다른
필드는 채워지고 금액만 사용자가 직접 입력).

인식률 저하 원인 조사(docs/wedding/refactor/bug-todo.md, 2026-08-27) 기반 개선(2026-08-28):
1) vision 호출에 image_url.detail을 명시하지 않으면 기본값 "auto"로 처리되어 텍스트 밀도가
   높은 영수증에서 저해상도 처리로 작은 글자가 뭉개질 수 있다 — "high"로 고정.
2) EXIF Orientation 보정이 HEIC 변환 경로에만 있고 JPEG/PNG/WebP는 원본 그대로 통과했다 —
   세로로 찍은 사진이 회전된 채 인식될 수 있어, 모든 포맷을 Pillow로 열어
   ImageOps.exif_transpose()로 방향을 실제 픽셀에 반영한 뒤 재인코딩하는 공용 파이프라인으로
   확장했다. Blob에 저장되는 원본(app/core/storage.py로 넘어가는 바이트)은 이 보정과 무관하게
   그대로 유지된다 — 보정은 vision 호출 직전 사본에만 적용(기존 원본 보존 원칙 유지).
3) 프롬프트가 "총액"만 지시해 한국 영수증 특유의 "공급가액/부가세 별도 표기", "받은금액/
   거스름돈", 여러 날짜(발행일/결제일/예약일) 병기 상황에서 총액이 아닌 다른 숫자·날짜를 뽑을
   위험이 있었다 — 명시적 가이드 문구를 추가.

트러블슈팅 STEP 2(2026-08-28): #108(azure.identity.aio 크레덴셜 수정) 이후에도 여전히
100% 실패하고 있었다 — 원인은 완전히 별개였다. Azure OpenAI가 `response_format={"type":
"json_object"}`를 쓰려면 messages 어딘가에 "json"이라는 단어가 (대소문자 무관) 반드시
있어야 하는데(400 Bad Request로 즉시 거부), `_EXTRACT_PROMPT`가 전부 한국어라 "json"이 단
한 번도 등장하지 않았다. staging 실측(kubectl logs)으로 재확인: `openai.BadRequestError:
... "'messages' must contain the word 'json' in some form..."`. "출력 스키마" 문구를
"아래 JSON 스키마 그대로 응답하세요"로 바꿔 해결 — 다른 로직은 그대로."""

import base64
import io
import json
import re
from datetime import date

import pillow_heif
from openai import AsyncAzureOpenAI
from PIL import Image, ImageOps, UnidentifiedImageError

pillow_heif.register_heif_opener()

# vision 호출 직전 재인코딩에 쓸 Pillow 포맷 — HEIC/HEIF는 Azure OpenAI vision이 지원하지
# 않는 경우가 흔해 여기서 JPEG로 강제 변환하고, 그 외는 원래 포맷을 유지한 채 방향만 보정한다.
_VISION_ENCODE_FORMAT_BY_CONTENT_TYPE = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
    "image/heic": "JPEG",
    "image/heif": "JPEG",
}

# 텍스트 밀도가 높은 영수증 이미지는 "high"를 명시해야 저해상도(auto 기본값)로 뭉개지지 않는다.
_VISION_IMAGE_DETAIL = "high"

_EXTRACT_PROMPT = """영수증 사진에서 아래 4개 필드를 뽑으세요. 읽을 수 없거나 확신할 수 없는
필드는 null로 두세요 — 추측해서 채우지 마세요.

- item_name: 무엇을 구매/계약했는지 한 줄 요약(예: "스튜디오 촬영 계약금")
- vendor_name: 상호명
- amount: 실제로 결제된 총액(원화 정수, 쉼표/원 표시 없이 숫자만).
  - "공급가액"/"부가세"가 따로 표기돼 있으면 그 둘의 합계(="합계"/"총 결제금액"/"결제금액")를
    쓰고, 공급가액이나 부가세만 단독으로 쓰지 마세요.
  - "받은금액"/"거스름돈"이 함께 있으면 실제 결제액(받은금액-거스름돈, 보통 "합계"와 동일)을
    쓰고 받은금액 자체를 쓰지 마세요.
- paid_date: 실제 결제(수납)일(YYYY-MM-DD). 발행일/예약일/방문일 등 다른 날짜가 함께 있으면
  결제일을 우선하고, 결제일을 구분할 수 없으면 null로 두세요.

아래 JSON 스키마 그대로 응답하세요: {"item_name": "...", "vendor_name": "...", "amount": 123456,
"paid_date": "2026-08-25"} — 4개 키 전부 포함하고, 모르는 값은 null로 넣으세요."""


class ReceiptImageDecodeError(Exception):
    """이미지 디코딩·재인코딩 실패 — 손상된 파일 등. 호출부(라우터)가 이 타입만 구분해
    사용자에게 재촬영을 안내하는 422로 변환한다(그 외 실패는 기존처럼 500)."""


def _to_vision_payload(image_bytes: bytes, content_type: str) -> tuple[bytes, str]:
    """모든 포맷을 Pillow로 열어 EXIF Orientation을 실제 픽셀에 반영한 뒤 재인코딩한다.
    HEIC/HEIF는 JPEG로 강제 변환하고, 그 외는 원래 포맷을 유지한다. 알 수 없는 content_type은
    보정 없이 그대로 통과시킨다(업로드 라우터가 이미 허용 목록으로 걸러주므로 방어적 처리)."""
    output_format = _VISION_ENCODE_FORMAT_BY_CONTENT_TYPE.get(content_type)
    if output_format is None:
        return image_bytes, content_type
    try:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes)))
        if output_format == "JPEG":
            image = image.convert("RGB")
        buffer = io.BytesIO()
        image.save(buffer, format=output_format)
    except (UnidentifiedImageError, OSError) as exc:
        raise ReceiptImageDecodeError("이미지를 디코딩하지 못했습니다.") from exc
    vision_content_type = "image/jpeg" if output_format == "JPEG" else content_type
    return buffer.getvalue(), vision_content_type


async def extract_receipt_fields(
    client: AsyncAzureOpenAI, deployment: str, image_bytes: bytes, content_type: str
) -> dict[str, str | int | None]:
    vision_bytes, vision_content_type = _to_vision_payload(image_bytes, content_type)
    encoded = base64.b64encode(vision_bytes).decode("ascii")
    response = await client.chat.completions.create(
        model=deployment,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _EXTRACT_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{vision_content_type};base64,{encoded}",
                            "detail": _VISION_IMAGE_DETAIL,
                        },
                    },
                ],
            }
        ],
    )
    parsed = json.loads(response.choices[0].message.content)
    return {
        "item_name": parsed.get("item_name"),
        "vendor_name": parsed.get("vendor_name"),
        "amount": _parse_amount(parsed.get("amount")),
        "paid_date": _parse_date(parsed.get("paid_date")),
    }


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        # LLM이 스키마를 어기고 다른 형식을 낼 수 있다 — 날짜 파싱 실패는 "모르겠다"와 동치로
        # 취급(전체 추출을 실패시키지 않음, 사용자가 폼에서 직접 채우면 됨).
        return None


_AMOUNT_NOISE_PATTERN = re.compile(r"[,\s원₩]")


def _parse_amount(value: str | float | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    cleaned = _AMOUNT_NOISE_PATTERN.sub("", value)
    try:
        return int(cleaned)
    except ValueError:
        # 날짜와 동일한 취급 — 금액 파싱 실패로 전체 추출을 실패시키지 않고, 이 필드만
        # null로 두어 사용자가 직접 입력하게 한다.
        return None
