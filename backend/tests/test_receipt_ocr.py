"""app/services/receipt_ocr.py — 영수증 vision 추출. Azure OpenAI 클라이언트 모킹은
test_chat_graph.py가 세운 선례를 따른다(MagicMock + AsyncMock(chat.completions.create)).

2026-08-28 개선(detail 고정, 전 포맷 EXIF 보정) 이후로는 vision 호출 전에 모든 이미지가
실제로 Pillow를 왕복하므로, 기존처럼 `b"fake-bytes"`/`b"\\x89PNG\\r\\n"` 같은 가짜 바이트를
쓰면 디코딩 자체가 실패한다 — 아래 헬퍼로 항상 실제로 인코딩된 이미지를 사용한다."""

import base64
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


def _fake_image_bytes(
    image_format: str, size: tuple[int, int] = (1, 1), orientation: int | None = None
) -> bytes:
    """실제로 인코딩된 최소 이미지 바이트. orientation이 주어지면 EXIF Orientation 태그를
    실어 보낸다(예: 6 = "표시하려면 90도 시계방향 회전 필요")."""
    image = Image.new("RGB", size, color=(200, 100, 50))
    buffer = io.BytesIO()
    if orientation is None:
        image.save(buffer, format=image_format)
    else:
        exif = image.getexif()
        exif[0x0112] = orientation  # Orientation 태그
        image.save(buffer, format=image_format, exif=exif)
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

        result = await extract_receipt_fields(
            client, "chat-mini", _fake_image_bytes("JPEG"), "image/jpeg"
        )

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

        result = await extract_receipt_fields(
            client, "chat-mini", _fake_image_bytes("JPEG"), "image/jpeg"
        )

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

        result = await extract_receipt_fields(
            client, "chat-mini", _fake_image_bytes("JPEG"), "image/jpeg"
        )

        assert result["paid_date"] is None
        assert result["amount"] == 80000

    @pytest.mark.asyncio
    async def test_sends_image_as_base64_data_url_with_given_content_type(self):
        client = _client_returning(
            {"item_name": None, "vendor_name": None, "amount": None, "paid_date": None}
        )

        await extract_receipt_fields(client, "chat-mini", _fake_image_bytes("PNG"), "image/png")

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
    async def test_non_heic_image_keeps_its_own_format(self):
        client = _client_returning(
            {"item_name": None, "vendor_name": None, "amount": None, "paid_date": None}
        )

        await extract_receipt_fields(client, "chat-mini", _fake_image_bytes("PNG"), "image/png")

        call_kwargs = client.chat.completions.create.call_args.kwargs
        image_block = call_kwargs["messages"][0]["content"][1]
        assert image_block["image_url"]["url"].startswith("data:image/png;base64,")

    @pytest.mark.asyncio
    async def test_corrupted_heic_raises_decode_error_instead_of_crashing_vision_call(self):
        client = _client_returning({})

        with pytest.raises(ReceiptImageDecodeError):
            await extract_receipt_fields(client, "chat-mini", b"not-a-real-heic-file", "image/heic")

        client.chat.completions.create.assert_not_called()


class TestVisionCallQuality:
    """2026-08-28 개선 — docs/wedding/refactor/bug-todo.md의 인식률 저하 원인 조사 반영:
    (1) detail="high" 명시, (2) 모든 포맷에 EXIF Orientation 보정, (3) 비-HEIC 포맷도 손상
    시 명확한 에러로 처리."""

    @pytest.mark.asyncio
    async def test_vision_call_requests_high_detail(self):
        client = _client_returning(
            {"item_name": None, "vendor_name": None, "amount": None, "paid_date": None}
        )

        await extract_receipt_fields(client, "chat-mini", _fake_image_bytes("JPEG"), "image/jpeg")

        call_kwargs = client.chat.completions.create.call_args.kwargs
        image_block = call_kwargs["messages"][0]["content"][1]
        assert image_block["image_url"]["detail"] == "high"

    @pytest.mark.asyncio
    async def test_exif_orientation_is_applied_before_vision_call(self):
        """가로 2 x 세로 3 이미지에 Orientation=6("90도 시계방향 회전 필요")을 실어 보내면,
        보정 후에는 실제로 가로 3 x 세로 2로 회전되어 인코딩돼야 한다 — 세로로 찍은 사진이
        회전된 채로 vision 모델에 들어가는 걸 막는 회귀 테스트."""
        client = _client_returning(
            {"item_name": None, "vendor_name": None, "amount": None, "paid_date": None}
        )
        rotated_bytes = _fake_image_bytes("JPEG", size=(2, 3), orientation=6)

        await extract_receipt_fields(client, "chat-mini", rotated_bytes, "image/jpeg")

        call_kwargs = client.chat.completions.create.call_args.kwargs
        image_block = call_kwargs["messages"][0]["content"][1]
        data_url = image_block["image_url"]["url"]
        encoded = data_url.split(",", 1)[1]
        decoded_image = Image.open(io.BytesIO(base64.b64decode(encoded)))
        assert decoded_image.size == (3, 2)

    @pytest.mark.asyncio
    async def test_corrupted_non_heic_image_raises_decode_error(self):
        client = _client_returning({})

        with pytest.raises(ReceiptImageDecodeError):
            await extract_receipt_fields(client, "chat-mini", b"not-a-real-jpeg-file", "image/jpeg")

        client.chat.completions.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_prompt_text_contains_the_word_json(self):
        """트러블슈팅 STEP 2(2026-08-28) 회귀 테스트 — Azure OpenAI는
        response_format={"type": "json_object"}를 쓸 때 messages 어딘가에 "json"이라는
        단어(대소문자 무관)가 없으면 400 Bad Request로 거부한다(실제 staging에서 100% 실패로
        재현됨). 이 테스트는 실 API를 안 쳐서 그 400 자체는 재현 못 하지만, 프롬프트가 순수
        한국어로 다시 바뀌어 "json" 단어가 빠지는 회귀는 여기서 바로 잡는다."""
        client = _client_returning(
            {"item_name": None, "vendor_name": None, "amount": None, "paid_date": None}
        )

        await extract_receipt_fields(client, "chat-mini", _fake_image_bytes("JPEG"), "image/jpeg")

        call_kwargs = client.chat.completions.create.call_args.kwargs
        assert call_kwargs["response_format"] == {"type": "json_object"}
        text_block = call_kwargs["messages"][0]["content"][0]
        assert "json" in text_block["text"].lower()


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

        result = await extract_receipt_fields(
            client, "chat-mini", _fake_image_bytes("JPEG"), "image/jpeg"
        )

        assert result["amount"] == 15000

    @pytest.mark.asyncio
    async def test_plain_int_amount_passes_through_unchanged(self):
        client = _client_returning(
            {"item_name": None, "vendor_name": None, "amount": 500000, "paid_date": None}
        )

        result = await extract_receipt_fields(
            client, "chat-mini", _fake_image_bytes("JPEG"), "image/jpeg"
        )

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

        result = await extract_receipt_fields(
            client, "chat-mini", _fake_image_bytes("JPEG"), "image/jpeg"
        )

        assert result["amount"] is None
        assert result["item_name"] == "드레스 피팅"
        assert result["paid_date"] == date(2026, 8, 25)
