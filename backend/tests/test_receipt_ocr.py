"""app/services/receipt_ocr.py — 영수증 vision 추출. Azure OpenAI 클라이언트 모킹은
test_chat_graph.py가 세운 선례를 따른다(MagicMock + AsyncMock(chat.completions.create))."""

import json
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.receipt_ocr import extract_receipt_fields


def _client_returning(payload: dict) -> MagicMock:
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]
    )
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=response)
    return client


class TestExtractReceiptFields:
    @pytest.mark.asyncio
    async def test_parses_all_fields_when_fully_readable(self):
        client = _client_returning(
            {
                "item_name": "스튜디오 촬영 계약금",
                "vendor_name": "메리스튜디오",
                "amount": 500000,
                "paid_date": "2026-08-25",
            }
        )

        result = await extract_receipt_fields(client, "chat-mini", b"fake-bytes", "image/jpeg")

        assert result == {
            "item_name": "스튜디오 촬영 계약금",
            "vendor_name": "메리스튜디오",
            "amount": 500000,
            "paid_date": date(2026, 8, 25),
        }

    @pytest.mark.asyncio
    async def test_missing_fields_become_none_not_guessed(self):
        client = _client_returning(
            {"item_name": None, "vendor_name": None, "amount": None, "paid_date": None}
        )

        result = await extract_receipt_fields(client, "chat-mini", b"fake-bytes", "image/jpeg")

        assert result == {
            "item_name": None,
            "vendor_name": None,
            "amount": None,
            "paid_date": None,
        }

    @pytest.mark.asyncio
    async def test_unparseable_date_falls_back_to_none_instead_of_raising(self):
        client = _client_returning(
            {
                "item_name": "부케 대여",
                "vendor_name": "플라워샵",
                "amount": 80000,
                "paid_date": "2026년 8월 25일",
            }
        )

        result = await extract_receipt_fields(client, "chat-mini", b"fake-bytes", "image/jpeg")

        assert result["paid_date"] is None
        assert result["amount"] == 80000

    @pytest.mark.asyncio
    async def test_sends_image_as_base64_data_url_with_given_content_type(self):
        client = _client_returning(
            {"item_name": None, "vendor_name": None, "amount": None, "paid_date": None}
        )

        await extract_receipt_fields(client, "chat-mini", b"\x89PNG\r\n", "image/png")

        call_kwargs = client.chat.completions.create.call_args.kwargs
        assert call_kwargs["model"] == "chat-mini"
        assert call_kwargs["response_format"] == {"type": "json_object"}
        image_block = call_kwargs["messages"][0]["content"][1]
        assert image_block["type"] == "image_url"
        assert image_block["image_url"]["url"].startswith("data:image/png;base64,")
