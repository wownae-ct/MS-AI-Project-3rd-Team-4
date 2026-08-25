"""영수증 사진 vision 추출 — 2026-08-25 결정(docs/AI-Sessions/wiki/decisions/
2026-08-25-receipt-ocr-payment-autofill-decision.md). 새 Azure 리소스/RBAC 없이 기존
Azure OpenAI 배포(기본 gpt-5.4-mini, Settings.receipt_vision_deployment)에 이미지를 그대로
보내 구조화 추출한다 — 이 레포의 유일한 기존 컨벤션(app/rag/generation.py::verify_answer,
app/personalization/graph.py)을 그대로 따른다: response_format={"type": "json_object"} +
수동 json.loads, try/except 없이 위로 전파(예외 처리는 호출부 라우터의 몫)."""

import base64
import json
from datetime import date

from openai import AsyncAzureOpenAI

_EXTRACT_PROMPT = """영수증 사진에서 아래 4개 필드를 뽑으세요. 읽을 수 없거나 확신할 수 없는
필드는 null로 두세요 — 추측해서 채우지 마세요.

- item_name: 무엇을 구매/계약했는지 한 줄 요약(예: "스튜디오 촬영 계약금")
- vendor_name: 상호명
- amount: 총액(원화 정수, 쉼표/원 표시 없이 숫자만)
- paid_date: 결제일(YYYY-MM-DD)

출력 스키마: {"item_name": "...", "vendor_name": "...", "amount": 123456,
"paid_date": "2026-08-25"} — 4개 키 전부 포함하고, 모르는 값은 null로 넣으세요."""


async def extract_receipt_fields(
    client: AsyncAzureOpenAI, deployment: str, image_bytes: bytes, content_type: str
) -> dict[str, str | int | None]:
    encoded = base64.b64encode(image_bytes).decode("ascii")
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
                        "image_url": {"url": f"data:{content_type};base64,{encoded}"},
                    },
                ],
            }
        ],
    )
    parsed = json.loads(response.choices[0].message.content)
    return {
        "item_name": parsed.get("item_name"),
        "vendor_name": parsed.get("vendor_name"),
        "amount": parsed.get("amount"),
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
