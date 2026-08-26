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
필드는 채워지고 금액만 사용자가 직접 입력)."""

import base64
import io
import json
import re
from datetime import date

import pillow_heif
from openai import AsyncAzureOpenAI
from PIL import Image, UnidentifiedImageError

pillow_heif.register_heif_opener()

_HEIC_CONTENT_TYPES = {"image/heic", "image/heif"}

_EXTRACT_PROMPT = """영수증 사진에서 아래 4개 필드를 뽑으세요. 읽을 수 없거나 확신할 수 없는
필드는 null로 두세요 — 추측해서 채우지 마세요.

- item_name: 무엇을 구매/계약했는지 한 줄 요약(예: "스튜디오 촬영 계약금")
- vendor_name: 상호명
- amount: 총액(원화 정수, 쉼표/원 표시 없이 숫자만)
- paid_date: 결제일(YYYY-MM-DD)

출력 스키마: {"item_name": "...", "vendor_name": "...", "amount": 123456,
"paid_date": "2026-08-25"} — 4개 키 전부 포함하고, 모르는 값은 null로 넣으세요."""


class ReceiptImageDecodeError(Exception):
    """HEIC/HEIF 디코딩·JPEG 재인코딩 실패 — 손상된 파일 등. 호출부(라우터)가 이 타입만
    구분해 사용자에게 재촬영을 안내하는 422로 변환한다(그 외 실패는 기존처럼 500)."""


def _to_vision_payload(image_bytes: bytes, content_type: str) -> tuple[bytes, str]:
    """HEIC/HEIF는 JPEG로 변환해 반환하고, 그 외 포맷은 그대로 통과시킨다."""
    if content_type not in _HEIC_CONTENT_TYPES:
        return image_bytes, content_type
    try:
        image = Image.open(io.BytesIO(image_bytes))
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="JPEG")
    except (UnidentifiedImageError, OSError) as exc:
        raise ReceiptImageDecodeError("HEIC 이미지를 디코딩하지 못했습니다.") from exc
    return buffer.getvalue(), "image/jpeg"


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
                        "image_url": {"url": f"data:{vision_content_type};base64,{encoded}"},
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
