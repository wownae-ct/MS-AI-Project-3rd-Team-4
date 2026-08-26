"""app/personalization/prompts.py의 few-shot 관련 회귀 테스트 — 2026-08-24 버그 수정 3건이
계속 유지되는지 확인한다: (1) MEETING/GIFT가 대표 예시 1개뿐이라 LLM이 확률적으로 카테고리를
통째로 누락시키던 문제, (2) TIMELINE few-shot이 카탈로그 전체를 그대로 노출해 서로 다른 웨딩
프로필인데도 결과가 거의 동일하게 나오던 문제(개인화 저다양성), (3) null 항목을 사람이 읽는
텍스트 라벨("범용"→"null" 두 번 다 재발)로 표시해 LLM이 그 라벨을 category_code 값으로
착각하던 문제 — few-shot을 실제 JSON으로 바꿔 구조적으로 해결."""

import json

from app.core.timeline_catalog import TIMELINE_CATALOG
from app.personalization.prompts import (
    _MOCKUP_CATEGORY_CODES,
    _MOCKUP_FEW_SHOT_SAMPLE_SIZE,
    _build_checklist_few_shot,
    _build_timeline_few_shot,
    build_contract_citation_menu,
    build_generate_prompt,
)
from app.rag.retrieval import RetrievedChunk


class TestChecklistFewShotSampleSize:
    def test_each_mockup_category_appears_at_least_three_times(self):
        few_shot = _build_checklist_few_shot()
        for category_code in (
            "MEETING",
            "GIFT",
            "HOMEWARE",
            "INVITATION",
            "HONEYMOON",
            "HOMENEW",
            "ETC",
        ):
            assert few_shot.count(f"[{category_code}]") >= 3


class TestChecklistFewShotVenueSdmBalance:
    """2026-08-25 버그 회귀 방지 — VENUE/SDM few-shot이 CHECKLIST_FALLBACK_CATALOG(전부
    CONTRACT_TERM)만 재사용해 LLM이 EXTRA_COST/PREP 예시를 한 번도 못 보고, "40% 이상" 규칙과
    맞물려 실계정 재현으로 VENUE/SDM 체크리스트가 27/27 CONTRACT_TERM으로 나온 회귀가 있었다.
    few-shot에 두 item_type이 실제로 섞여 나오는지 확인한다."""

    def test_venue_and_sdm_few_shot_include_non_contract_term_items(self):
        few_shot = _build_checklist_few_shot()
        for category_code in ("VENUE", "SDM"):
            for item_type in ("EXTRA_COST", "PREP"):
                assert f"[{category_code}] ({item_type})" in few_shot


def _parse_timeline_few_shot_entries() -> list[dict]:
    """첫 줄(헤더 설명)을 제외한 나머지를 JSON 한 줄씩 파싱한다."""
    lines = _build_timeline_few_shot().splitlines()
    return [json.loads(line) for line in lines[1:]]


class TestTimelineFewShotDiversity:
    def test_mockup_categories_are_capped(self):
        # 2026-08-24 버그 회귀 방지: MOCKUP 카테고리는 카탈로그에 더 많이 있어도 few-shot엔
        # _MOCKUP_FEW_SHOT_SAMPLE_SIZE개까지만 노출돼야 한다 — LLM이 "그대로 베낄 답"을
        # 통째로 받는 걸 막는 핵심 장치.
        entries = _parse_timeline_few_shot_entries()
        for category_code in _MOCKUP_CATEGORY_CODES:
            count = sum(1 for entry in entries if entry["category_code"] == category_code)
            assert count <= _MOCKUP_FEW_SHOT_SAMPLE_SIZE

    def test_venue_sdm_and_universal_items_are_shown_in_full(self):
        # VENUE/SDM/범용(None) 항목은 시간축 뼈대라 줄이지 않는다 — 카탈로그의 실제 개수와
        # few-shot에 노출된 개수가 정확히 같아야 한다. None 카테고리 개수가 일치한다는 건
        # json.loads가 실제 JSON null(파이썬 None)로 파싱했다는 뜻이기도 하다 — 문자열
        # "null"이었다면 이 비교가 실패한다(아래 버그 수정 3 테스트와 이중 보장).
        entries = _parse_timeline_few_shot_entries()
        for category_code in (None, "VENUE", "SDM"):
            catalog_count = sum(
                1 for item in TIMELINE_CATALOG if item.category_code == category_code
            )
            few_shot_count = sum(1 for entry in entries if entry["category_code"] == category_code)
            assert few_shot_count == catalog_count


class TestTimelineFewShotIsValidJson:
    def test_every_line_after_header_parses_as_valid_json(self):
        # 2026-08-24 버그 회귀 방지(수정 3) — 이전 두 시도(사람이 읽는 텍스트 라벨 "범용"→
        # "null")는 둘 다 LLM이 라벨 문자열을 category_code 값으로 착각하는 문제가 재발했다.
        # few-shot을 실제 JSON으로 바꿔서 이 클래스의 버그 자체를 구조적으로 막는다 — 각 줄이
        # 유효한 JSON으로 파싱되고 필드가 출력 스키마와 일치해야 한다.
        entries = _parse_timeline_few_shot_entries()
        assert len(entries) > 0
        for entry in entries:
            assert set(entry.keys()) == {"category_code", "title", "default_dday_offset_days"}

    def test_no_natural_language_placeholder_anywhere(self):
        few_shot = _build_timeline_few_shot()
        assert "범용" not in few_shot


class TestGenerateRetryFeedback:
    """2026-08-25 결정 — validate→generate 재시도 시 반려 사유를 프롬프트에 주입."""

    def test_no_retry_feedback_by_default(self):
        prompt = build_generate_prompt(["CHECKLIST"], {}, {})
        assert "[재시도]" not in prompt

    def test_retry_feedback_appears_when_provided_for_affected_domain(self):
        prompt = build_generate_prompt(
            ["CHECKLIST"],
            {},
            {},
            retry_feedback={"CHECKLIST": ["활성 카테고리 MEETING에 생성된 항목이 없습니다"]},
        )
        assert "[재시도]" in prompt
        assert "CHECKLIST: 활성 카테고리 MEETING에 생성된 항목이 없습니다" in prompt

    def test_retry_feedback_omits_domains_not_affected_this_round(self):
        # TIMELINE은 이번 재시도의 affected_domains에 없으므로(예: 이미 SUCCESS라 재생성 대상이
        # 아님) 그 에러가 프롬프트에 섞이면 안 된다.
        prompt = build_generate_prompt(
            ["CHECKLIST"],
            {},
            {},
            retry_feedback={
                "CHECKLIST": ["문제 A"],
                "TIMELINE": ["이건 안 보여야 함"],
            },
        )
        assert "문제 A" in prompt
        assert "이건 안 보여야 함" not in prompt

    def test_empty_error_list_produces_no_feedback_section(self):
        # SUCCESS였던 도메인은 validation_errors에 빈 리스트로 남아있을 수 있다 — 그런 경우
        # [재시도] 섹션 자체가 안 생겨야 한다(빈 불릿만 찍히는 것 방지).
        prompt = build_generate_prompt(["CHECKLIST"], {}, {}, retry_feedback={"CHECKLIST": []})
        assert "[재시도]" not in prompt


class TestContractCitationMenu:
    """체크리스트 CONTRACT_TERM 항목에 DS3(표준계약서) RAG 근거를 다는 기능 — LLM은 번호
    (source_ref_id)만 고르고 실제 label/url 문구는 코드가 채운다(생성-시-환각 방지)."""

    def test_no_chunks_returns_none(self):
        assert build_contract_citation_menu([]) is None

    def test_menu_lists_chunk_id_title_and_content(self):
        chunk = RetrievedChunk(
            chunk_id=42,
            content="계약금은 예식비용의 10%를 초과할 수 없다.",
            title="공정위 예식장이용 표준약관(제10030호)",
            source_tier="OFFICIAL",
            source_url="https://example.com/venue-terms",
        )
        menu = build_contract_citation_menu([chunk])
        assert "[42]" in menu
        assert "공정위 예식장이용 표준약관(제10030호)" in menu
        assert "계약금은 예식비용의 10%를 초과할 수 없다." in menu

    def test_generate_prompt_includes_citation_menu_only_when_checklist_included(self):
        # 출력 스키마 설명 자체에도 "[근거 자료] 번호"라는 고정 문구가 항상 있으므로, 실제
        # 인용 메뉴 본문에서만 나오는 문장으로 구분해서 검사한다.
        _MENU_MARKER = "관련 있으면 source_ref_id에"
        chunk = RetrievedChunk(
            chunk_id=1, content="내용", title="제목", source_tier="OFFICIAL", source_url=None
        )
        with_checklist = build_generate_prompt(["CHECKLIST"], {}, {}, contract_citations=[chunk])
        assert _MENU_MARKER in with_checklist

        without_citations = build_generate_prompt(["CHECKLIST"], {}, {})
        assert _MENU_MARKER not in without_citations

        timeline_only = build_generate_prompt(["TIMELINE"], {}, {}, contract_citations=[chunk])
        assert _MENU_MARKER not in timeline_only

    def test_generate_prompt_output_schema_mentions_source_ref_id(self):
        prompt = build_generate_prompt(["CHECKLIST"], {}, {})
        assert "source_ref_id" in prompt
