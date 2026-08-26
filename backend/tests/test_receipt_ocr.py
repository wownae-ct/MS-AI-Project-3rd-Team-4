"""app/services/receipt_ocr.py — 영수증 vision 추출. Azure OpenAI 클라이언트 모킹은
test_chat_graph.py가 세운 선례를 따른다(MagicMock + AsyncMock(chat.completions.create))."""

import io
import json
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pillow_heif
import pytest
from PIL import Image

from app.services.receipt_ocr import ReceiptImageDecodeError, extract_receipt_fields


def _fake_heic_bytes() -> bytes:
    """PIL로 만든 1x1 이미지를 pillow-heif로 실제 HEIC 인코딩한 바이트 — 디코딩 경로를
    실제로 왕복시켜 검증하기 위함(가짜 content_type만 붙인 JPEG가 아님)."""
    image = Image.new("RGB", (1, 1), color=(200, 100, 50))
    buffer = io.BytesIO()
    pillow_heif.from_pillow(image).save(buffer)
    return buffer.getvalue()


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


class TestHeicConversion:
    """STEP 1-A — HEIC/HEIF는 vision 호출 전에 JPEG로 변환돼야 한다(Azure OpenAI vision이
    HEIC를 공식 지원하지 않는 경우가 흔함, iPhone 기본 사진 포맷이라 실사용 영향이 큼)."""

    @pytest.mark.asyncio
    async def test_heic_image_is_converted_to_jpeg_before_vision_call(self):
        client = _client_returning(
            {"item_name": None, "vendor_name": None, "amount": None, "paid_date": None}
        )

        await extract_receipt_fields(client, "chat-mini", _fake_heic_bytes(), "image/heic")

        call_kwargs = client.chat.completions.create.call_args.kwargs
        image_block = call_kwargs["messages"][0]["content"][1]
        assert image_block["image_url"]["url"].startswith("data:image/jpeg;base64,")

    @pytest.mark.asyncio
    async def test_non_heic_image_passes_through_unconverted(self):
        client = _client_returning(
            {"item_name": None, "vendor_name": None, "amount": None, "paid_date": None}
        )

        await extract_receipt_fields(client, "chat-mini", b"\x89PNG\r\n", "image/png")

        call_kwargs = client.chat.completions.create.call_args.kwargs
        image_block = call_kwargs["messages"][0]["content"][1]
        assert image_block["image_url"]["url"].startswith("data:image/png;base64,")

    @pytest.mark.asyncio
    async def test_corrupted_heic_raises_decode_error_instead_of_crashing_vision_call(self):
        client = _client_returning({})

        with pytest.raises(ReceiptImageDecodeError):
            await extract_receipt_fields(client, "chat-mini", b"not-a-real-heic-file", "image/heic")

        client.chat.completions.create.assert_not_called()


class TestAmountParsing:
    """STEP 1-B — 한국 영수증은 금액에 쉼표/원표시가 흔하다. 프롬프트가 숫자만 요구해도
    LLM이 그대로 베낄 수 있어, ReceiptExtractOut(amount: int | None)로 가기 전에 정리한다."""

    @pytest.mark.asyncio
    async def test_amount_with_comma_and_currency_symbol_is_parsed_to_int(self):
        client = _client_returning(
            {
                "item_name": "부케",
                "vendor_name": "플라워샵",
                "amount": "15,000원",
                "paid_date": None,
            }
        )

        result = await extract_receipt_fields(client, "chat-mini", b"fake-bytes", "image/jpeg")

        assert result["amount"] == 15000

    @pytest.mark.asyncio
    async def test_plain_int_amount_passes_through_unchanged(self):
        client = _client_returning(
            {"item_name": None, "vendor_name": None, "amount": 500000, "paid_date": None}
        )

        result = await extract_receipt_fields(client, "chat-mini", b"fake-bytes", "image/jpeg")

        assert result["amount"] == 500000

    @pytest.mark.asyncio
    async def test_unparseable_amount_falls_back_to_none_other_fields_still_filled(self):
        client = _client_returning(
            {
                "item_name": "드레스 피팅",
                "vendor_name": "메리스튜디오",
                "amount": "약 오십만원",
                "paid_date": "2026-08-25",
            }
        )

        result = await extract_receipt_fields(client, "chat-mini", b"fake-bytes", "image/jpeg")

        assert result["amount"] is None
        assert result["item_name"] == "드레스 피팅"
        assert result["paid_date"] == date(2026, 8, 25)
