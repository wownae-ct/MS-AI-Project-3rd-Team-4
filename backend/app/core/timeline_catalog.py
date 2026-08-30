"""타임라인 결정론적 카탈로그 — docs/wedding/ing/ds7-timeline-seed-data-prep.md 완성본 55항목 +
ETC/HOMENEW 신규 저작 10항목 + MEETING/GIFT 표본 보강 3항목(2026-08-24 버그 수정 2건) +
2026-08-30 상세도 보강 16항목 = 총 84항목(아래 참고).

v4.0에서 이 상수는 두 가지 역할을 겸한다: (1) `13_personalization_router_agent_design.md` §2가
정의하는 개인화 라우터 에이전트의 `validate` 실패 시 타임라인 폴백, (2) 개인화 라우터 에이전트
자체가 아직 이 세션 범위 밖이므로(2026-08-24 시점 checklist/timeline 스토리지 계층만 구현),
지금 당장은 온보딩 시 타임라인을 생성하는 유일한 경로이기도 하다 — 나중에 LLM 개인화가
붙으면 `route`가 `TIMELINE`을 선택했을 때만 이 카탈로그 대신 LLM `generate`를 타도록 확장하면
된다(스키마 변경 없음, `origin` 컬럼이 이미 이 구분을 담을 준비가 돼 있음).

phase_label(구 "D-11M" 라벨)은 컬럼으로 저장하지 않는다 — 프론트가 default_dday_offset_days로
공식 계산한다(2026-08-23 세션 결정, 13번 문서 §3). 그래서 이 카탈로그도 offset만 갖고 있다.

**2026-08-24 버그 수정**: 원본 55항목엔 ETC/HOMENEW 카테고리 항목이 0개였다. 이 카탈로그가
`app/personalization/prompts.py::_build_timeline_few_shot()`의 LLM few-shot 예시로도 쓰이기
때문에, ETC/HOMENEW가 활성 카테고리인 웨딩은 few-shot에 두 카테고리 예시가 전혀 없어 LLM이
해당 카테고리 항목을 만들지 않았고, `app/personalization/validation.py`의 카테고리 커버리지
규칙(활성 카테고리마다 항목 ≥1개)을 통과 못 해 `validate`가 거의 항상 BLOCKED로 떨어져
`run_personalization`이 도메인 전체를 이 카탈로그 그대로(개인화 없이) 폴백시키는 버그가 있었다
(`ai_invocations.error_message`로 실증: "TIMELINE: 활성 카테고리 ETC/HOMENEW에 생성된 항목이
없습니다"). `CHECKLIST_FALLBACK_CATALOG`가 24→59항목 확장으로 이미 고친 것과 같은 문제라 같은
패턴(CONSENSUS 항목, 카테고리당 5개)으로 대응한다. 새 항목은 기존 55항목을 재배치하지 않고
끝에 추가했다(display_order 56~65) — 실제 표시 순서는 API가 `target_date` 기준으로 정렬하므로
(`app/services/timeline.py::list_timeline_items`) 파일 내 물리적 위치는 기능에 영향 없다.

**2026-08-24 버그 수정 2**: 위 수정을 실계정으로 재검증하는 중 별개의 문제가 드러났다 —
`_build_timeline_few_shot()`는 이 카탈로그 전체를 그대로 few-shot으로 흘려보내는데, 원래
MEETING이 1개(display_order 2)·GIFT가 2개(11, 18)뿐이라 노출되는 예시가 너무 적어 LLM이
두 카테고리를 통째로 누락시키는 사례가 나왔다(ETC/HOMENEW가 0개였던 것의 완화판 — 개수가
0은 아니지만 표본이 적어 확률적으로 계속 재현됨). MEETING 2개·GIFT 1개를 추가해 각각 3개로
맞췄다(display_order 66~68) — `CHECKLIST_FALLBACK_CATALOG`의 MOCKUP 카테고리당 5개 기준엔
못 미치지만, few-shot 노출 표본을 늘려 누락 확률을 낮추는 게 목적이라 3개로 충분하다고 판단.

**2026-08-30 상세도 보강**: checklist_catalog.py의 MOCKUP 카테고리 콘텐츠 + 실제 결혼 준비
타임라인 자료(계약금 D-10~12M/잔금 D-1~2W 클러스터 등)를 근거로 16항목을 추가했다(display_order
69~84) — VENUE/SDM에 "잔금 납부" 이벤트가 통째로 빠져 있던 구조적 공백을 메웠고(계약금만
있고 잔금이 없었음), 나머지 7개 MOCKUP 카테고리(특히 MEETING/GIFT/HOMEWARE/INVITATION/
HONEYMOON/HOMENEW)의 표본 개수도 3~5개 → 5~7개로 늘려 실제 준비 과정의 세부 단계(원판 구매,
함/이바지, 이사·전입신고 등)를 반영했다."""

from dataclasses import dataclass

from app.schemas.common import CategoryCode


@dataclass(frozen=True)
class TimelineTemplateItem:
    category_code: CategoryCode | None  # None = 카테고리 무관 범용 일정
    title: str
    dday_offset_days: int  # 본식 기준 며칠 전(음수)/당일(0)/이후(양수)
    display_order: int


TIMELINE_CATALOG: tuple[TimelineTemplateItem, ...] = (
    # D-12M
    TimelineTemplateItem(None, "결혼 날짜 후보 확정", -365, 1),
    TimelineTemplateItem("MEETING", "상견례 진행", -365, 2),
    TimelineTemplateItem(None, "예산 총액 설정", -365, 3),
    TimelineTemplateItem("VENUE", "예식장 투어 시작", -365, 4),
    # D-11M
    TimelineTemplateItem("VENUE", "예식장 계약", -330, 5),
    TimelineTemplateItem("SDM", "스드메 업체 리서치 시작", -330, 6),
    # D-10M
    TimelineTemplateItem("SDM", "스드메(스튜디오·드레스·메이크업) 투어", -300, 7),
    TimelineTemplateItem("SDM", "웨딩플래너 계약(대행 이용 시)", -300, 8),
    # D-9M
    TimelineTemplateItem("SDM", "스드메 계약", -270, 9),
    TimelineTemplateItem("SDM", "예복(턱시도) 업체 리서치", -270, 10),
    # D-8M
    TimelineTemplateItem("GIFT", "예물 구매", -240, 11),
    TimelineTemplateItem("SDM", "예복 계약", -240, 12),
    # D-7M
    TimelineTemplateItem(None, "하객 명단 초안 작성", -210, 13),
    TimelineTemplateItem("INVITATION", "청첩장 디자인 시안 검토", -210, 14),
    # D-6M
    TimelineTemplateItem("HONEYMOON", "신혼여행지 결정", -180, 15),
    TimelineTemplateItem("SDM", "스튜디오 촬영 컨셉 확정", -180, 16),
    # D-5M
    TimelineTemplateItem("HONEYMOON", "신혼여행 항공권·숙박 예약", -150, 17),
    TimelineTemplateItem("GIFT", "예단 준비", -150, 18),
    # D-4M
    TimelineTemplateItem("SDM", "스튜디오 촬영 진행", -120, 19),
    TimelineTemplateItem("INVITATION", "청첩장 인쇄 발주", -120, 20),
    TimelineTemplateItem("HOMEWARE", "혼수 리스트 작성", -120, 21),
    # D-3M
    TimelineTemplateItem(None, "신혼집 계약(전세·매매)", -90, 22),
    TimelineTemplateItem("HOMEWARE", "혼수 가구 구매", -90, 23),
    # D-2M
    TimelineTemplateItem("INVITATION", "청첩장 발송 시작", -60, 24),
    TimelineTemplateItem("HOMEWARE", "혼수 가전 구매", -60, 25),
    TimelineTemplateItem("SDM", "드레스 1차 가봉", -60, 26),
    # D-1M
    TimelineTemplateItem("VENUE", "예식장 최종 미팅(순서·타임테이블 확정)", -30, 27),
    TimelineTemplateItem("INVITATION", "답례품 준비", -30, 28),
    TimelineTemplateItem(None, "신혼집 입주", -30, 29),
    TimelineTemplateItem("SDM", "드레스 2차 가봉", -30, 30),
    TimelineTemplateItem("SDM", "헤어메이크업 리허설(헤메 테스트)", -30, 31),
    TimelineTemplateItem("INVITATION", "청첩장 발송 마무리", -30, 32),
    # D-2W
    TimelineTemplateItem("VENUE", "예식 진행 순서(식순) 최종 확인", -14, 33),
    TimelineTemplateItem("VENUE", "사회자·주례 섭외 확정", -14, 34),
    TimelineTemplateItem("VENUE", "축가·축사자 확정", -14, 35),
    TimelineTemplateItem("VENUE", "예식장 최종 하객 인원 통보(개런티)", -14, 36),
    TimelineTemplateItem("HONEYMOON", "여권 유효기간·비자 최종 확인", -14, 37),
    # D-1W
    TimelineTemplateItem(None, "혼인신고 서류 준비", -7, 38),
    TimelineTemplateItem("SDM", "예복·드레스 최종 픽업 일정 확인", -7, 39),
    TimelineTemplateItem("VENUE", "부케·부토니아 예약 확인", -7, 40),
    TimelineTemplateItem("HONEYMOON", "신혼여행 짐 싸기 시작", -7, 41),
    TimelineTemplateItem("VENUE", "축의금 봉투·방명록 준비", -7, 42),
    TimelineTemplateItem("VENUE", "폐백 음식·이바지 준비(진행 시)", -7, 43),
    # D-3D
    TimelineTemplateItem("SDM", "혼주 한복 최종 확인", -3, 44),
    TimelineTemplateItem("VENUE", "외부업체(스냅·DVD) 컨택 최종 확인", -3, 45),
    TimelineTemplateItem(None, "신랑신부 컨디션 관리(수면·식단)", -3, 46),
    # D-1D
    TimelineTemplateItem("VENUE", "예식장 리허설", -1, 47),
    TimelineTemplateItem(None, "준비물 최종 체크(속옷·양말·소품)", -1, 48),
    TimelineTemplateItem("VENUE", "하객 동선 안내 자료 최종 점검", -1, 49),
    # D-DAY
    TimelineTemplateItem("VENUE", "예식 진행", 0, 50),
    TimelineTemplateItem("VENUE", "폐백", 0, 51),
    TimelineTemplateItem("HONEYMOON", "신혼여행 출국", 0, 52),
    # D+POST
    TimelineTemplateItem(None, "혼인신고", 3, 53),
    TimelineTemplateItem("INVITATION", "답례품 발송/전달", 7, 54),
    TimelineTemplateItem(None, "신혼여행 후 감사인사·리뷰 작성", 14, 55),
    # ===== HOMENEW — CONSENSUS 5개(v4.0 신규 카테고리, 2026-08-24 버그 수정으로 추가) =====
    TimelineTemplateItem("HOMENEW", "신혼집 예산·희망 지역 설정", -270, 56),
    TimelineTemplateItem("HOMENEW", "신혼집 매물 투어 시작", -240, 57),
    TimelineTemplateItem("HOMENEW", "등기부등본·중개수수료 확인 후 계약", -90, 58),
    TimelineTemplateItem("HOMENEW", "인테리어·도배·장판 시공", -45, 59),
    TimelineTemplateItem("HOMENEW", "신혼집 잔금 납부", -14, 60),
    # ===== ETC — CONSENSUS 5개(v4.0 신규 카테고리, 2026-08-24 버그 수정으로 추가) =====
    TimelineTemplateItem("ETC", "예산 관리 방식(앱·스프레드시트) 정하기", -330, 61),
    TimelineTemplateItem("ETC", "결혼 준비 진행 상황 중간 점검", -180, 62),
    TimelineTemplateItem("ETC", "업체별 담당자 연락처 정리", -14, 63),
    TimelineTemplateItem("ETC", "우천 등 돌발상황 대비 대안 확인", -7, 64),
    TimelineTemplateItem("ETC", "계약서·영수증 자료 최종 정리", -1, 65),
    # ===== MEETING/GIFT few-shot 표본 보강(2026-08-24, 별도 버그 수정) — 원래 MEETING 1개/
    # GIFT 2개뿐이라 app/personalization/prompts.py::_build_timeline_few_shot()(카탈로그 전체를
    # 그대로 few-shot으로 씀)에 노출되는 예시가 너무 적어, LLM이 이 두 카테고리를 통째로 누락시켜
    # validate의 카테고리 커버리지 규칙에 걸리는 사례가 실계정 재현으로 확인됐다. =====
    TimelineTemplateItem("MEETING", "상견례 날짜·장소 조율", -365, 66),
    TimelineTemplateItem("MEETING", "상견례 후 준비 로드맵 공유", -350, 67),
    TimelineTemplateItem("GIFT", "예물 각인·사이즈 최종 확인", -120, 68),
    # ===== 2026-08-30 상세도 보강 — checklist_catalog.py의 MOCKUP 카테고리 내용 + 실제 결혼 준비
    # 타임라인 자료(계약금 D-10~12M / 잔금 D-1~2W 클러스터 등) 기반 신규 저작. VENUE/SDM은
    # "잔금 납부"가 통째로 빠져 있던 구조적 공백을 메움. =====
    TimelineTemplateItem("VENUE", "예식장 잔금 납부", -14, 69),
    TimelineTemplateItem("VENUE", "폐백실·신부대기실 등 부대공간 이용 여부 최종 확인", -30, 70),
    TimelineTemplateItem("SDM", "웨딩앨범 원판 구매·앨범 디자인 시안 선택", -60, 71),
    TimelineTemplateItem("SDM", "스드메 잔금 납부", -14, 72),
    TimelineTemplateItem("MEETING", "예물·예단 형식(현금·예단비·생략) 상견례 전 합의", -365, 73),
    TimelineTemplateItem("MEETING", "신혼집 마련 방식·부담 비율 상견례 전 조율", -365, 74),
    TimelineTemplateItem("GIFT", "예물 예산·브랜드 후보 리서치", -270, 75),
    TimelineTemplateItem("GIFT", "함(이바지) 준비 및 전달 일정 조율", -7, 76),
    TimelineTemplateItem("HOMEWARE", "신혼집 평수·구조 확정 후 혼수 배치 계획 수립", -100, 77),
    TimelineTemplateItem("HOMEWARE", "가전·가구 배송·설치 일정 최종 조율", -21, 78),
    TimelineTemplateItem("INVITATION", "모바일 청첩장 제작·문구 확정", -90, 79),
    TimelineTemplateItem("INVITATION", "발송 인원 기준 하객 명단 최종 확정", -70, 80),
    TimelineTemplateItem("HONEYMOON", "여행자보험 가입", -30, 81),
    TimelineTemplateItem("HONEYMOON", "환전·여행 경비 준비", -14, 82),
    TimelineTemplateItem("HOMENEW", "이사업체 예약 및 견적 비교", -40, 83),
    TimelineTemplateItem("HOMENEW", "전입신고·주소 변경(우편물·은행 등)", 7, 84),
)
