"""route→generate→validate 그래프의 validate 노드 — 13_personalization_router_agent_design.md
§1-4의 4개 규칙. LLM 호출 없는 순수 함수(챗 그래프의 verify와 달리 구조적으로 기계 검증 가능한
규칙이라 LLM이 필요 없다는 게 설계 문서의 명시적 근거).

체크리스트·타임라인은 완전히 분리된 테이블이라는 이번 프로젝트 전체의 원칙(11_v3_to_v4_diff.md
§1-3)대로, 검증도 두 도메인에 독립적으로 적용한다 — 합쳐서 "둘 중 하나에라도 있으면 통과"로
보지 않는다. 체크리스트엔 활성 카테고리 A 항목이 있고 타임라인엔 A 항목이 없으면 타임라인
쪽만 실패한다."""

import re
from typing import get_args

from app.schemas.common import CategoryCode

MIN_DDAY_OFFSET_DAYS = -400
MAX_DDAY_OFFSET_DAYS = 60

_VALID_CATEGORY_CODES: frozenset[str] = frozenset(get_args(CategoryCode))

# 제목 중복 판정에서 무시할 문자(공백·구두점·괄호류). 2026-08-29 중복 항목 버그 —
# 예전엔 (category_code, title) 원문 완전 일치만 중복으로 봐서, "예식장 계약"과 "예식장계약",
# "본식 D-30 리허설"과 "본식 D-30 리허설 " 같은 표기 차이가 그대로 두 행이 됐다. 특히
# 재생성은 보호 행(살아남는 행)과 새 행을 나란히 남기므로 이 정도 표기 차이만으로도 사용자
# 눈에는 같은 항목이 두 개 보인다.
_TITLE_NOISE_PATTERN = re.compile(r"""[\s\-–—_·・:;,.!?~()\[\]{}'"“”‘’]+""")


def normalize_title(title: str | None) -> str:
    """제목 중복 판정 전용 정규화 키 — 표시용 문자열은 절대 이 값으로 바꾸지 않는다(DB에
    저장되는 title은 언제나 원문 그대로다). 공백·구두점을 지우고 casefold만 한다: 의미가
    다른 항목을 같다고 볼 위험이 거의 없는 최소한의 정규화만 하고, 어미 차이("계약" vs
    "계약하기") 같은 의미 수준 유사도는 프롬프트(app/personalization/prompts.py의
    protected_items 지시)에 맡긴다."""
    return _TITLE_NOISE_PATTERN.sub("", title or "").casefold()


def title_key(category_code: str | None, title: str | None) -> tuple[str | None, str]:
    """중복 판정 키 — 카테고리가 다르면 같은 제목이어도 중복이 아니라는 기존 규칙은 그대로다."""
    return (category_code, normalize_title(title))


def _validate_category_membership(
    domain_label: str, active_categories: set[str], items: list[dict]
) -> list[str]:
    """규칙 (1): category_code가 ENUM 안에 있고, 해당 웨딩의 활성 카테고리에 속하는가.

    트러블슈팅 STEP 3(2026-08-26): category_code=null 허용은 타임라인의 "범용 일정" 개념
    전용이다 — 체크리스트엔 그런 개념이 없어 반드시 카테고리에 속해야 한다. 이 함수가 두
    도메인에 공유돼 예전엔 체크리스트도 null을 그냥 통과시켰고, 그 결과 row 생성 단계
    (_checklist_row_from_draft)가 `None not in active_categories`로 항상 True가 되어
    아무 로그도 없이 조용히 항목이 사라졌다."""
    errors = []
    for item in items:
        code = item.get("category_code")
        if code is None:
            if domain_label == "CHECKLIST":
                errors.append(f"{domain_label}: category_code가 없는 항목이 있습니다.")
            continue  # 타임라인 범용 항목(category_code=null)은 이 규칙 대상이 아님
        if code not in _VALID_CATEGORY_CODES or code not in active_categories:
            errors.append(
                f"{domain_label}: category_code={code!r}가 ENUM 또는 활성 카테고리 밖입니다."
            )
    return errors


def _validate_category_coverage(
    domain_label: str,
    active_categories: set[str],
    items: list[dict],
    protected_titles: set[tuple] | None = None,
) -> list[str]:
    """규칙 (2): 활성 카테고리마다 항목이 1개 이상 있는가(도메인별 독립 적용).

    2026-08-30 결정 — "있는가"의 판정 대상에 **protected_items도 포함**한다. 재생성 후에도
    DB에 그대로 남는 행이 protected_items이므로, 그 카테고리에 보호 행이 있으면 사용자 화면
    기준으로는 이미 "항목이 1개 이상 있는" 상태다. 예전엔 새 초안만 셌는데, 바로 앞 단계인
    `deduplicate_titles()`가 보호 행과 제목이 겹치는 초안 항목을 드롭하므로 **표준 항목을 이미
    완료 체크해 둔 카테고리는 초안이 0건이 되어 상시 BLOCKED**가 됐다(staging 실측: test05
    계정 GIFT 보호 4/6·HOMEWARE 3/5 → 매 재생성마다 BLOCKED). 즉 "앱을 열심히 쓸수록 재생성이
    더 자주 실패하는" 구조였다.

    ⚠️ 이 완화만 단독으로 넣으면 안 된다 — 커버리지를 통과한 카테고리의 초안이 0건이면
    app/services/personalization.py가 그 카테고리에 새 행을 하나도 안 만드는데,
    `_delete_unprotected_items`는 카테고리 스코프 없이 미보호 행을 지우므로 **항목 수가
    순감**한다(수정 전 카탈로그 25행 → 수정 후 보호 8행 같은 식). 그래서 같은 커밋에서 병합
    쪽이 "초안이 빈 카테고리는 카탈로그로 보충"하도록 함께 고쳤다 — 둘은 반드시 짝으로 유지할 것."""
    covered = {item.get("category_code") for item in items if item.get("category_code") is not None}
    # protected_titles는 (category_code, title) 튜플 집합이다. TIMELINE 범용 항목의
    # category_code=None은 어떤 활성 카테고리도 커버하지 못하므로 초안 쪽과 같은 규칙으로 건다.
    covered |= {code for code, _ in (protected_titles or ()) if code is not None}
    missing = active_categories - covered
    return [
        f"{domain_label}: 활성 카테고리 {code}에 생성된 항목이 없습니다."
        for code in sorted(missing)
    ]


def _validate_has_title(domain_label: str, items: list[dict]) -> list[str]:
    """규칙 (5, 2026-08-26 레드팀 감사 3라운드 MEDIUM #6 추가): title이 비어 있지 않은가.
    이전엔 이 규칙이 없어 LLM이 title을 빠뜨린 항목도 SUCCESS로 통과시켰다 — 그 뒤
    app/services/personalization.py의 row 생성 코드가 item["title"]을 직접 인덱싱하다
    KeyError로 죽고, 그 예외가 run_personalization의 광범위 except에 잡혀 도메인 전체가
    validate→generate 재시도 기회 없이 곧장 카탈로그 폴백으로 버려졌다. 여기서 먼저 걸러야
    재시도 루프(retry_feedback)가 "title을 채워서 다시 만들라"고 정확히 교정 요청할 수 있다."""
    return [
        f"{domain_label}: title이 비어 있는 항목이 있습니다(인덱스 {i})."
        for i, item in enumerate(items)
        if not item.get("title")
    ]


def _validate_no_duplicate_titles(
    domain_label: str, items: list[dict], protected_titles: set[tuple] | None = None
) -> list[str]:
    """규칙 (4): 같은 카테고리 내 제목 중복이 없는가 — protected_titles(사용자가 이미 직접
    수정한 기존 행의 (category_code, title))도 처음부터 seen에 넣어 같이 검사한다
    (2026-08-26 레드팀 감사 3라운드 MEDIUM #7 — 이전엔 새로 만든 항목끼리만 중복을 봐서,
    LLM이 보호 항목과 제목이 겹치는 새 항목을 만들어도 안 걸러졌다).

    2026-08-28 결정(red-bug.md #9-2) 이후로는 `deduplicate_titles()`가 validate 호출 전에
    먼저 중복을 드롭하므로, 정상 경로에서는 이 규칙이 사실상 발동하지 않는다 — 그래도
    남겨두는 이유는 (a) dedup을 거치지 않고 이 함수를 직접 부르는 다른 호출부가 생기더라도
    안전망이 되도록, (b) dedup 로직 자체에 버그가 있어 중복이 새어 들어온 경우를 여전히
    잡아내도록 하기 위함이다."""
    errors = []
    seen: set[tuple] = {title_key(code, title) for code, title in (protected_titles or ())}
    for item in items:
        key = title_key(item.get("category_code"), item.get("title"))
        if key in seen:
            # 에러 문구에는 정규화 키가 아니라 원문 제목을 그대로 보여준다 — 이 문자열이
            # retry_feedback으로 LLM에게 되돌아가므로(prompts.py::_retry_feedback_note)
            # 실제로 만든 제목과 글자가 달라지면 교정 지시가 무의미해진다.
            errors.append(
                f"{domain_label}: category_code={item.get('category_code')!r}에 "
                f"제목 중복 {item.get('title')!r}"
            )
        seen.add(key)
    return errors


def deduplicate_titles(
    items: list[dict], protected_titles: set[tuple] | None = None
) -> tuple[list[dict], list[dict]]:
    """2026-08-28 결정(red-bug.md #9-2) — 같은 배치 안에서 LLM이 (category_code, title)이
    같은 항목을 두 번 이상 만드는 경우, 예전에는 `_validate_no_duplicate_titles`가 이를 잡아
    도메인 전체를 BLOCKED시켰다(항목 하나의 중복 때문에 정상 생성된 나머지 항목까지 카탈로그
    폴백으로 버려지는 과한 벌칙). 이제는 뒤에 나온 중복만 드롭하고 먼저 나온 항목(및
    protected_items — 사용자가 이미 수정한 기존 행)은 그대로 채택한다.

    이 함수를 호출하면 validate가 순수 구조 검증만 한다는 원래 설계 원칙
    (13_personalization_router_agent_design.md §1-4)이 "일부 자동 교정"으로 성격이 바뀐다 —
    의도된 변경이며 그 문서에도 함께 기록돼 있다.

    2026-08-29부터 비교 키는 원문이 아니라 `title_key()`(공백·구두점 제거 + casefold)다 —
    표기만 다른 사실상 같은 항목이 중복 판정을 빠져나가던 구멍을 막는다. protected_titles는
    호출부가 원문 튜플 그대로 넘기면 되고(정규화는 이 함수가 한다), 반환되는 항목 dict의
    title은 언제나 원문 그대로다.

    반환값 (kept, dropped) — kept는 validate에 그대로 넘길 정제된 목록, dropped는 호출부가
    관측성(로그)을 위해서만 쓴다(2026-08-24 "null-string category_code" 버그가 무로깅으로
    3번 재발했던 전례를 따라, 이 자동 교정도 발동 시 반드시 로그를 남기도록 호출부에 위임)."""
    kept: list[dict] = []
    dropped: list[dict] = []
    seen: set[tuple] = {title_key(code, title) for code, title in (protected_titles or ())}
    for item in items:
        key = title_key(item.get("category_code"), item.get("title"))
        if key in seen:
            dropped.append(item)
            continue
        seen.add(key)
        kept.append(item)
    return kept, dropped


def validate_checklist_items(
    active_categories: set[str], items: list[dict], protected_titles: set[tuple] | None = None
) -> list[str]:
    errors = _validate_category_membership("CHECKLIST", active_categories, items)
    errors += _validate_category_coverage("CHECKLIST", active_categories, items, protected_titles)
    errors += _validate_has_title("CHECKLIST", items)
    errors += _validate_no_duplicate_titles("CHECKLIST", items, protected_titles)
    return errors


def validate_timeline_items(
    active_categories: set[str], items: list[dict], protected_titles: set[tuple] | None = None
) -> list[str]:
    """체크리스트 규칙 + 규칙 (3): default_dday_offset_days가 -400~60 범위인가(타임라인 전용
    필드라 이 도메인에만 적용)."""
    errors = _validate_category_membership("TIMELINE", active_categories, items)
    errors += _validate_category_coverage("TIMELINE", active_categories, items, protected_titles)
    errors += _validate_has_title("TIMELINE", items)
    errors += _validate_no_duplicate_titles("TIMELINE", items, protected_titles)
    for item in items:
        offset = item.get("default_dday_offset_days")
        if offset is not None and not (MIN_DDAY_OFFSET_DAYS <= offset <= MAX_DDAY_OFFSET_DAYS):
            errors.append(
                f"TIMELINE: default_dday_offset_days={offset}가 "
                f"[{MIN_DDAY_OFFSET_DAYS},{MAX_DDAY_OFFSET_DAYS}] 범위 밖입니다."
            )
    return errors


def protected_titles_for_domain(protected_items: dict, domain: str) -> set[tuple]:
    """공개 함수(2026-08-28부터, red-bug.md #9-2) — 원래는 이 모듈 내부에서만 쓰던 헬퍼였으나,
    `app/personalization/graph.py::validate_node`가 validate 호출 전에 `deduplicate_titles()`로
    먼저 중복을 드롭할 때도 같은 protected_titles 집합이 필요해져 공유한다."""
    return {(item["category_code"], item["title"]) for item in protected_items.get(domain) or []}


def validate_personalization_draft(
    active_categories: set[str],
    affected_domains: list[str],
    checklist_draft: list[dict] | None,
    timeline_draft: list[dict] | None,
    protected_items: dict | None = None,
) -> dict[str, list[str]]:
    """affected_domains에 실제로 포함된 도메인만 검증한다 — route가 CHECKLIST만 골랐으면
    TIMELINE 기존 행은 이번 실행의 검증 대상이 아니다(온보딩만 다루는 이번 라운드는 항상
    양쪽 다 포함되지만, 그래프 자체는 FIELD_UPDATED의 부분 선택도 지원하도록 일반적으로 짠다).

    반환값은 {"CHECKLIST": [...], "TIMELINE": [...]} — affected_domains에 포함된 도메인만
    키로 존재하고, 각 값은 그 도메인만의 에러 리스트다. **도메인별로 독립된 결과를 유지하는 게
    이 함수의 핵심 계약**이다(2026-08-24 버그 수정: 이전엔 두 도메인 에러를 하나의 flat list로
    합쳐 반환해서, 호출자가 "에러가 하나라도 있으면 전부 BLOCKED"로 판단할 수밖에 없었다 —
    CHECKLIST만 실패해도 이미 정상 통과한 TIMELINE까지 폴백 카탈로그로 버려지는 버그로 이어졌다.
    호출자(`app/personalization/graph.py::validate_node`)가 이 딕셔너리를 그대로 도메인별
    validation_status로 변환해 두 도메인의 SUCCESS/BLOCKED 판정을 서로 독립적으로 유지한다."""
    protected_items = protected_items or {}
    result: dict[str, list[str]] = {}
    if "CHECKLIST" in affected_domains:
        result["CHECKLIST"] = validate_checklist_items(
            active_categories,
            checklist_draft or [],
            protected_titles_for_domain(protected_items, "CHECKLIST"),
        )
    if "TIMELINE" in affected_domains:
        result["TIMELINE"] = validate_timeline_items(
            active_categories,
            timeline_draft or [],
            protected_titles_for_domain(protected_items, "TIMELINE"),
        )
    return result


def group_checklist_by_category(items: list[dict]) -> dict[str, list[dict]]:
    """category_code별로 항목을 묶는다. `app/personalization/graph.py`의 generate_node(재시도
    시 이미 성공한 카테고리를 carry-forward하려고 이전 draft를 다시 카테고리별로 나눠야 함)와
    이 아래의 `validate_checklist_by_category` 둘 다 이 함수를 쓴다 — 묶는 로직이 두 곳에
    따로 있으면 한쪽만 고치고 잊어버리는 드리프트가 생기기 쉽다."""
    grouped: dict[str, list[dict]] = {}
    for item in items:
        grouped.setdefault(item.get("category_code"), []).append(item)
    return grouped


def validate_checklist_by_category(
    active_categories: set[str], items: list[dict], protected_titles: set[tuple] | None = None
) -> tuple[dict[str, str], dict[str, list[str]]]:
    """카테고리별로 독립적인 SUCCESS/BLOCKED를 낸다(2026-08-30 결정, red-bug.md #9-11).

    2026-08-29(#129)가 도메인(CHECKLIST/TIMELINE) 결합 호출을 쪼갠 뒤에도, CHECKLIST 단독
    호출 하나가 여전히 활성 카테고리 전부(최대 9개)를 한 응답에 커버해야 하는 구조는 그대로라
    "일부 카테고리만 만들고 스스로 다 했다고 판단"하는 실패가 남아 있었다(staging 실측:
    배포 이후 CHECKLIST 도메인 80% 확률로 BLOCKED). 근본 수정은 generate 쪽에서 카테고리
    단위로 독립 LLM 호출을 보내는 것(graph.py::_generate_checklist_category_draft)이고,
    여기 validate 쪽은 그 결과를 판정할 때 "도메인 전체가 SUCCESS냐"가 아니라 "카테고리
    하나하나가 SUCCESS냐"를 봐야 `app/services/personalization.py`가 실패한 카테고리만
    카탈로그로 채우고 성공한 카테고리의 LLM 결과는 살릴 수 있다.

    `validate_checklist_items`를 고치지 않고 그대로 재사용한다 — "활성 카테고리 1개짜리
    도메인"으로 카테고리마다 한 번씩 돌리는 것만으로 카테고리 단위 판정을 얻을 수 있다
    (규칙 (2) 커버리지가 `active_categories - covered`라 집합을 1개짜리로 주면 자동으로
    그 카테고리 하나만의 커버리지를 본다). 제목 중복 규칙은 애초에 같은 카테고리 안에서만
    성립하므로(규칙 (4) 문서 참고), 카테고리별로 나눠 검사해도 전체를 한 번에 검사한 것과
    결과가 같다."""
    grouped = group_checklist_by_category(items)
    status: dict[str, str] = {}
    errors: dict[str, list[str]] = {}
    for category in active_categories:
        category_errors = validate_checklist_items(
            {category}, grouped.get(category, []), protected_titles
        )
        status[category] = "BLOCKED" if category_errors else "SUCCESS"
        errors[category] = category_errors
    return status, errors


def validate_timeline_by_category(
    active_categories: set[str], items: list[dict], protected_titles: set[tuple] | None = None
) -> tuple[dict[str, str], dict[str, list[str]]]:
    """TIMELINE 카테고리별 독립 SUCCESS/BLOCKED — `validate_checklist_by_category`(2026-08-30
    #9-11)와 같은 패턴을 TIMELINE에도 적용한다(2026-08-30 2차).

    #9-11이 CHECKLIST만 카테고리 단위로 쪼갠 뒤에도 TIMELINE은 도메인 단위 그대로 남았고,
    그 이유는 `category_code=None` 범용 항목 때문에 "카테고리 하나만 요청하는 호출"이 안
    맞아서였다. 그런데 같은 날 TIMELINE 결정론화로 **범용 항목이 LLM 생성 대상에서 완전히
    빠지면서** 그 걸림돌이 사라졌다 — 이제 LLM이 만드는 타임라인 항목은 전부 실제 카테고리를
    가지므로 CHECKLIST와 동일하게 쪼갤 수 있다.

    쪼개야 하는 이유는 실측으로 확인됐다: staging에서 보호 항목이 **하나도 없는** 계정
    (test1431)도 GIFT/HOMENEW/HOMEWARE/HONEYMOON 누락으로 BLOCKED됐다 — 보호 항목 dedup으로는
    설명이 안 되고, "활성 9개 카테고리를 한 응답에 담다가 일부만 만들고 멈추는" #9-11과 같은
    실패다. 도메인 단위 폴백은 그 1개 때문에 나머지 8개 카테고리의 LLM 결과까지 전부 버리므로
    피해도 CHECKLIST보다 크다.

    `validate_timeline_items`를 그대로 재사용한다 — 이유는 `validate_checklist_by_category`
    docstring과 동일(활성 카테고리 1개짜리 도메인으로 돌리면 그 카테고리만의 판정이 나온다).
    offset 범위 규칙(규칙 3)은 항목 단위라 카테고리별로 나눠 검사해도 결과가 같다."""
    grouped = group_checklist_by_category(items)
    status: dict[str, str] = {}
    errors: dict[str, list[str]] = {}
    for category in active_categories:
        category_errors = validate_timeline_items(
            {category}, grouped.get(category, []), protected_titles
        )
        status[category] = "BLOCKED" if category_errors else "SUCCESS"
        errors[category] = category_errors
    return status, errors
