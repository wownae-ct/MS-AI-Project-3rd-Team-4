"""route→generate→validate 그래프의 validate 노드 — 13_personalization_router_agent_design.md
§1-4의 4개 규칙. LLM 호출 없는 순수 함수(챗 그래프의 verify와 달리 구조적으로 기계 검증 가능한
규칙이라 LLM이 필요 없다는 게 설계 문서의 명시적 근거).

체크리스트·타임라인은 완전히 분리된 테이블이라는 이번 프로젝트 전체의 원칙(11_v3_to_v4_diff.md
§1-3)대로, 검증도 두 도메인에 독립적으로 적용한다 — 합쳐서 "둘 중 하나에라도 있으면 통과"로
보지 않는다. 체크리스트엔 활성 카테고리 A 항목이 있고 타임라인엔 A 항목이 없으면 타임라인
쪽만 실패한다."""

from typing import get_args

from app.schemas.common import CategoryCode

MIN_DDAY_OFFSET_DAYS = -400
MAX_DDAY_OFFSET_DAYS = 60

_VALID_CATEGORY_CODES: frozenset[str] = frozenset(get_args(CategoryCode))


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
    domain_label: str, active_categories: set[str], items: list[dict]
) -> list[str]:
    """규칙 (2): 활성 카테고리마다 항목이 1개 이상 있는가(도메인별 독립 적용)."""
    covered = {item.get("category_code") for item in items if item.get("category_code") is not None}
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
    seen: set[tuple] = set(protected_titles or ())
    for item in items:
        key = (item.get("category_code"), item.get("title"))
        if key in seen:
            errors.append(f"{domain_label}: category_code={key[0]!r}에 제목 중복 {key[1]!r}")
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

    반환값 (kept, dropped) — kept는 validate에 그대로 넘길 정제된 목록, dropped는 호출부가
    관측성(로그)을 위해서만 쓴다(2026-08-24 "null-string category_code" 버그가 무로깅으로
    3번 재발했던 전례를 따라, 이 자동 교정도 발동 시 반드시 로그를 남기도록 호출부에 위임)."""
    kept: list[dict] = []
    dropped: list[dict] = []
    seen: set[tuple] = set(protected_titles or ())
    for item in items:
        key = (item.get("category_code"), item.get("title"))
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
    errors += _validate_category_coverage("CHECKLIST", active_categories, items)
    errors += _validate_has_title("CHECKLIST", items)
    errors += _validate_no_duplicate_titles("CHECKLIST", items, protected_titles)
    return errors


def validate_timeline_items(
    active_categories: set[str], items: list[dict], protected_titles: set[tuple] | None = None
) -> list[str]:
    """체크리스트 규칙 + 규칙 (3): default_dday_offset_days가 -400~60 범위인가(타임라인 전용
    필드라 이 도메인에만 적용)."""
    errors = _validate_category_membership("TIMELINE", active_categories, items)
    errors += _validate_category_coverage("TIMELINE", active_categories, items)
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
