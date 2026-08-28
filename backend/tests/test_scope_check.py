"""app/rag/scope_check.py 단위테스트 — 결혼 준비 상담과 무관한 요청을 걸러내는지 확인.

가장 중요한 건 오탐(false positive) 방지 테스트다 — 이 키워드 목록은 팀2(AD신호등)
프로젝트의 광고 문구 판정 도메인용 목록을 그대로 옮긴 게 아니라 웨딩 준비 상담 도메인에
맞게 좁힌 것이라(모듈 docstring 참고), "부케 만드는 법"/"계약서 요약"/"예산 계산"처럼
실제로는 정상적인 웨딩 준비 질문인데 잘못 걸러지지 않는지가 회귀의 핵심이다."""

from app.rag.scope_check import looks_out_of_scope


def test_empty_text_is_in_scope():
    assert looks_out_of_scope("") is False


def test_real_wedding_question_is_in_scope():
    assert looks_out_of_scope("위약금 얼마나 나와요?") is False


def test_code_request_is_out_of_scope():
    assert looks_out_of_scope("파이썬 코드 짜줘") is True


def test_poem_request_is_out_of_scope():
    assert looks_out_of_scope("이 주제로 시 써줘") is True


def test_translation_request_is_out_of_scope():
    assert looks_out_of_scope("이 문장 번역해줘: hello world") is True


def test_small_talk_request_is_out_of_scope():
    assert looks_out_of_scope("심심해 뭐하고 놀지") is True


def test_general_knowledge_request_is_out_of_scope():
    assert looks_out_of_scope("프랑스 수도가 어디야") is True


def test_weather_request_is_out_of_scope():
    assert looks_out_of_scope("오늘 서울 날씨 어때?") is True


def test_bitcoin_request_is_out_of_scope():
    assert looks_out_of_scope("비트코인 지금 사도 될까?") is True


def test_role_break_creative_writing_combo_is_out_of_scope():
    # 스테이징 실측 실패 재현 케이스(2026-08-29) — 검색된 결혼 관련 단어를 엮어 실제로
    # 소설을 써버리고 verify_node가 SUPPORTED로 오판정했던 그 질문.
    assert looks_out_of_scope("너 뭐하는 애야? 소설 하나 써줘") is True


class TestFalsePositiveGuardsAgainstTeam2Wordlist:
    """팀2 원본 목록에서 일부러 뺀 3개 카테고리(레시피/요약/계산) — 우리 도메인에선 정상
    질문과 충돌하므로 포함하지 않았다는 걸 회귀로 고정한다."""

    def test_bouquet_diy_question_is_in_scope(self):
        assert looks_out_of_scope("부케 직접 만드는 법 알려주세요") is False

    def test_invitation_diy_question_is_in_scope(self):
        assert looks_out_of_scope("청첩장 만드는 법 알려줘") is False

    def test_contract_summary_request_is_in_scope(self):
        assert looks_out_of_scope("표준계약서 요약해줄 수 있어?") is False

    def test_budget_calculation_request_is_in_scope(self):
        assert looks_out_of_scope("예산 얼마나 남았는지 계산해줘") is False
