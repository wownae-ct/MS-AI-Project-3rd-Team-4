# 02 · 스키마 사전 (필드 수준)

> 코드 기준 `backend` **`6c29ea0`** (2026-08-24 3차 재분석 · 직전 기준 `e3496e7` 대비 **4커밋**) · `app/schemas/` 15파일 전수.
> 🆕 **3차 재분석 (`e3496e7` → `6c29ea0`, PR #57 4커밋).** 이 문서의 내용은 **바뀌지 않았다** — 바뀐 파일이 `app/personalization/prompts.py` 와 그 테스트뿐이라 라우터·스키마·모델·마이그레이션 diff 가 **0** 이다(실측). 수치도 재측정에서 동일하다(엔드포인트 **35**·OpenAPI 노출 **33** · 마이그레이션 **13** · 스키마 **15**파일 · 모델 **10**개(파일 기준 — `__tablename__` 클래스는 **15**) · 카테고리 **9**). 무엇이 바뀌었는지는 [`04` §5.6-c](04-ai-chat-rag.md).
> ⚠️ **`6c29ea0` 는 「코드」기준이지 배포본이 아니다.** 배포본(staging)은 **`b4615af`** 로 이보다 **한참 이전**이고 `origin/backend` 대비 **37커밋 뒤**다 — [`08` §1](08-cluster-runtime.md). 「코드에 있다」와 「호출된다」를 따로 센다.
> **목적** — TypeScript 타입을 그대로 뽑아 쓸 수 있을 만큼 정확한 필드 사전.
> 🔍 **4차 점검(2026-08-25)** — 코드 6c29ea0 대비 팩트체크. 수정 7건 / 미검증 2건. 상세는 README 「4차 점검 이력」.

## 0. 전체에 적용되는 사실 [실측]

- **`alias` / `serialization_alias` 사용 0건** → **필드명이 곧 JSON 키다.** camelCase 변환 없음, 전부 snake_case.
- **금액 필드는 예외 없이 `int`** — `Decimal`·`float` 금액 0건. 원 단위 정수라 TS `number` 로 안전.
  `float` 는 비율 3곳뿐(`ratio_to_median`, `progress_rate`×2).
- **`model_config` 는 단 2곳** — `AuthUserOut`, `WeddingOut`. 둘 다 `{"from_attributes": True}` 뿐.
- **`Field(...)` 호출은 8건, 그중 제약은 6건뿐**(`min_length=8`×1 · `gt=0`×4 · `ge=0`×1; 나머지 2건은 `primary_goals`/`done_so_far` 의 `default_factory=list`). 문자열 길이 검증이 사실상 없다(`password` 의 `min_length=8` 이 유일).

### `X | None` 과 `X | None = None` 을 구분할 것

| 파이썬 | JSON | TS |
|---|---|---|
| `X \| None` (기본값 **없음**) | 키가 **항상 존재**, 값이 null 일 수 있음 | `field: T \| null` |
| `X \| None = None` | 키가 **빠질 수 있음** | `field?: T \| null` |

응답 스키마는 대체로 전자, 요청 스키마는 후자다.

---

## 1. `common.py` — Literal 원본 (프론트 유니온 타입의 출처)

| 타입 | 값 (전부) |
|---|---|
| **`CategoryCode`** | `MEETING` `VENUE` `SDM` `GIFT` `HOMEWARE` `INVITATION` `HONEYMOON` `HOMENEW` `ETC` — **9개** |
| `BenchmarkCategoryCode` | `VENUE` `SDM` — 2개 |
| **`RegionCode`** | `SEOUL_GANGNAM` `SEOUL_OTHER` `BUSAN` `INCHEON` `DAEGU` `DAEJEON` `GWANGJU` `ULSAN` `GYEONGGI` `CHUNGCHEONG` `JEOLLA` `GYEONGSANG` `GANGWON` `JEJU` `NATIONWIDE` `METRO` `NON_METRO` — **17개**(세분 14 + 집계 폴백 3) |
| `CategoryTier` | `FOCUS` `MOCKUP` |
| `SourceTier` | `OFFICIAL` `NEWS` `INDUSTRY` `CONSENSUS` |
| `ItemType` | `CONTRACT_TERM` `EXTRA_COST` `PREP` |
| `Origin` | `LLM` `USER` |
| `GeneralChecklistStatus` | `TODO` `DOING` `SKIP` `DONE` |
| `HomewareChecklistStatus` | `LISTED` `COMPARING` `ORDERED` `DELIVERED` |
| **`ChecklistStatus`** | 위 둘의 **합집합 8값** ⚠️ |
| `PaymentType` | `DEPOSIT` `INTERIM` `BALANCE` `ETC` |
| `PaymentStatus` | `PLANNED` `PAID` `CANCELED` |
| `MilestoneStatus` | `TODO` `DONE` |
| `CaseType` | `GOOD` `BAD` |
| `Verdict` | `SUPPORTED` `WEAK` `GENERAL` |
| **`ChatRole`** | `user` `assistant` — ⚠️ **소문자** |
| 🆕 **`ChatRating`** | `GOOD` `BAD` — 👍👎 평가. `chat_messages.user_rating` CHECK 와 1:1 |
| 🆕 **`ChatStage`** | `retrieve` `generate` `verify` — ⚠️ **소문자**. SSE `stage` 이벤트 값이자 그래프 노드 이름 |
| `FeedbackTargetType` | `CHAT_MESSAGE` `CHECKLIST_ITEM` `TIMELINE_ITEM` |
| **`FeedbackReasonCategory`** | `부정확함` `부적절함` `도움안됨` `편향/차별적` `기타` — ⚠️ **한국어, 슬래시 포함** |
| `FeedbackStatus` | `OPEN` `REVIEWED` `RESOLVED` |
| `PersonalizationDomain` | `CHECKLIST` `TIMELINE` |

**v4.0 흔적** — `common.py:6-10`: *"v4.0(2026-08-24): 7개 → 9개(HOMENEW/ETC 신설)"*.

🚨 **`ChecklistStatus` 는 합집합이라 타입만으로 검증되지 않는다.**
`HOMEWARE` 는 `LISTED/COMPARING/ORDERED/DELIVERED`, 나머지 8개는 `TODO/DOING/SKIP/DONE`.
실제 유효성은 서비스가 판정(422 `INVALID_STATUS_FOR_CATEGORY`).
→ **프론트도 `category_code` 에 따라 상태 선택지를 갈라야 한다.**

---

## 2. `auth.py`

`from pydantic import UUID4 as UUID` — ⚠️ **여기만 UUID 버전4 형식 검증**이 걸린다(다른 파일은 `uuid.UUID`).

### `SignupRequest` (요청)
| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `email` | `EmailStr` | ✅ | 이메일 형식 |
| `password` | `str` | ✅ | **`min_length=8`** (OWASP 최소 권고) |
| `display_name` | `str` | ✅ | — |

### `LoginRequest` (요청)
`email: EmailStr` ✅ · `password: str` ✅ (**길이 제약 없음**)

### `AuthUserOut` (응답) — signup · login · `GET /auth/me` **셋이 동일**
| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `UUID4` | |
| `email` | `str` | 출력은 `EmailStr` 아님 |
| `display_name` | `str \| None` | nullable, **키는 항상 존재** |
| `has_wedding` | `bool` | ⚠️ **signup 응답은 항상 `false` 하드코딩** |

---

## 3. `wedding.py`

### 로컬 Literal
| 타입 | 값 |
|---|---|
| `DatePrecision` | `EXACT` `APPROX_H2_THIS_YEAR` `APPROX_H1_NEXT_YEAR` `APPROX_H2_NEXT_YEAR` `NO_PLAN` |
| `UserRole` | `BRIDE` `GROOM` |
| `TastePreference` | `MINIMAL` `BUDGET` `GRAND` `BALANCED` |
| `VenuePriority` | `FOOD` `LOCATION` `PARKING` `CAPACITY` |
| `SdmPriority` | `DRESS` `PHOTO` `MAKEUP` |

#### `DatePrecision` — 서버가 저장하는 **대표 날짜** (`services/wedding.py:45-60` `approximate_wedding_date`)

`EXACT` 가 아니면 프론트는 날짜를 **보내지 않는다**(버킷만 고른다). 서버가 아래로 환산해
`wedding_date` 에 저장하고, 이후 D-day·타임라인 55항목의 `target_date` 가 전부 이 값에서 역산된다.

| 값 | 저장되는 `wedding_date` |
|---|---|
| `EXACT` | 프론트가 보낸 값 (**이때만 필수** — 없으면 `422`) |
| `APPROX_H2_THIS_YEAR` | 그 해 **10-01** |
| `APPROX_H1_NEXT_YEAR` | 익년 **03-15** |
| `APPROX_H2_NEXT_YEAR` | 익년 **09-15** |
| `NO_PLAN` | 오늘 + **18개월**, 그 달 **1일** |

**화면에는 환산된 날짜를 "정확한 날짜"처럼 노출하지 않는다** — "올해 하반기 중" 같은 버킷 라벨로
보여준다. 다만 `GET /weddings/me.wedding_date` 는 항상 **환산된 실제 날짜**를 내려주므로,
`wedding_date_precision !== "EXACT"` 이면 그 값을 라벨로 바꿔 그려야 한다.

> 🚨 **11~12월 경계 결함.** `APPROX_H2_THIS_YEAR` 은 **10-01 고정**이라, 11~12월에 온보딩하면서
> "올해 하반기"를 고르면 **이미 지난 날짜**가 저장된다 → `d_day` 음수 · 타임라인 전 항목
> `is_overdue=true`. ~~**프론트가 방어할 수 없다**~~ → 🔍 **2026-08-25 정정: 방어할 수 있다.** `POST` 는 `EXACT` 일 때만 클라이언트
> 날짜를 존중하고(`services/wedding.py:87-91`), `PATCH` 는 `precision` 만 보내면 날짜를 유지한다(`:156-158`, 아래 §5 의 결함 그 자체).
> 이 둘을 조합해 **`POST`(EXACT+대표일) → `PATCH`(precision)** 2단계로 저장 데이터까지 바로잡는다 —
> 구현·순서 근거는 [`BACKEND_REQUEST.md` §4](BACKEND_REQUEST.md). 백엔드 하한 처리(안 A/B)는 선택 사항으로 남겼다.

### `WeddingCreate` (요청 · `POST /weddings`)
| 필드 | 타입 | 필수 | 기본값 | 제약 |
|---|---|---|---|---|
| `user_role` | `UserRole` | ✅ | — | |
| `wedding_date` | `date \| None` | | `None` | ↓ validator |
| `wedding_date_precision` | `DatePrecision` | ✅ | — | |
| `total_budget` | `int \| None` | | `None` | **`gt=0`** |
| `total_budget_unsure` | `bool` | | `False` | |
| `region_code` | **`str`** ⚠️ | ✅ | — | **Literal 아님 — 자유 문자열** |
| `guest_count` | `int \| None` | | `None` | 제약 없음 |
| `guest_count_unsure` | `bool` | | `False` | |
| `taste_preference` | `TastePreference \| None` | | `None` | |
| `venue_priority` | `VenuePriority \| None` | | `None` | |
| `sdm_priority` | `SdmPriority \| None` | | `None` | |
| `primary_goals` | `list[str]` | | `[]` | |
| `done_so_far` | `list[CategoryCode]` | | `[]` | ⚠️ **DB 에 저장되지 않는다**(`Wedding(...)` 생성자에 안 넘김 — `services/wedding.py:96-109`; `weddings.done_so_far` JSONB 컬럼은 비어 있음) **— 하지만 1회성으로는 쓰인다** ↓ |

✅ **`done_so_far` 는 온보딩 타임라인 초기 상태에 반영된다** — `run_personalization(..., done_so_far=payload.done_so_far)`(`services/wedding.py:145`) → `generate_timeline_items`(`services/timeline.py:18-31`) 가 해당 카테고리 항목 중 `target_date < 오늘` 인 것만 `status=DONE` 으로 만든다. `schemas/wedding.py:35-37`·`models/wedding.py:97-100` 의 "timeline_items 가 아직 없어 처리하지 않는다 TODO" 주석은 **낡은 것**(구현 완료 후 주석만 남음). 이후 PATCH/재생성 경로엔 넘기지 않는다(`routers/personalization.py:6`).

**`@model_validator(mode="after")` 교차 규칙 2개** → 위반 시 **422**:
1. `wedding_date_precision == "EXACT"` 인데 `wedding_date` 없음
2. `total_budget_unsure == False` 인데 `total_budget` 없음

### `WeddingUpdate` (요청 · `PATCH /weddings/me`)
전 필드 optional(`= None`). `total_budget` 은 **`gt=0`** 유지.
⚠️ **`user_role`·`done_so_far` 는 수정 불가.**
⚠️ **`WeddingCreate` 의 교차 검증이 여기엔 없다.** `update_wedding`(`services/wedding.py:153-158`)은 `model_dump(exclude_unset=True)` 로 온 값을 `setattr` 할 뿐이라 —
- `wedding_date_precision` 만 `APPROX_*`/`NO_PLAN` 으로 바꾸면 **`wedding_date` 가 재환산되지 않고 이전 값이 그대로 남는다**(POST 의 `approximate_wedding_date` 는 PATCH 경로에서 호출되지 않음). 반대로 `EXACT` 로 바꾸면서 날짜를 안 보내도 이전(환산) 날짜가 남는다.
- `wedding_date: null`/`total_budget: null` 을 **명시적으로** 보내면 `exclude_unset` 을 통과해 NOT NULL 컬럼(`models/wedding.py:78,82`)에 `None` 이 들어가 DB 오류 → 500 이 예상된다(미실측). 프론트는 두 키를 **null 로 보내지 말 것**.

### `WeddingOut` (응답) — `POST` · `GET /me` · `PATCH /me` **셋 동일**
| 필드 | 타입 |
|---|---|
| `id` | `UUID` |
| `user_role` | `UserRole` |
| `wedding_date` | **`date`** ⚠️ **non-null** (입력은 nullable인데 출력은 아님) |
| `wedding_date_precision` | `DatePrecision` |
| `total_budget` | **`int`** ⚠️ **non-null** (입력은 nullable) |
| `total_budget_unsure` | `bool` |
| `region_code` | `str` |
| `guest_count` | `int \| None` |
| `guest_count_unsure` | `bool` |
| `taste_preference` / `venue_priority` / `sdm_priority` | 각 Literal \| `None` |
| `primary_goals` | `list[str] \| None` |
| `created_at` | **`datetime`** |

✅ **`wedding_date`/`total_budget` 의 non-null 은 코드상 안전하다**(4차 점검에서 확인).
`create_wedding`(`services/wedding.py:87-93`)이 `precision != EXACT` 면 `approximate_wedding_date` 로,
`total_budget_unsure=True` 면 `_resolve_total_budget`(`services/wedding.py:63-75`, 지역 `TOTAL/TOTAL` 벤치마크 중앙값)로
**항상 실제 값을 채워 저장**하고, DB 도 두 컬럼이 **NOT NULL** 이다(`models/wedding.py:78,82` → [03](03-data-model.md) §3.3).
⚠️ 단 `total_budget_unsure=True` 인데 해당 지역 벤치마크가 없으면 **`422 TOTAL_BUDGET_UNAVAILABLE`** 로 온보딩이 실패한다 —
프론트는 이 코드를 "직접 입력으로 유도" 로 처리해야 한다. 남은 위험은 PATCH 경로(위 `WeddingUpdate` 참조)뿐이다.

### `WeddingCategoryOut` (응답 중첩)
`category_code` · `name_ko` · `tier` · `is_active` · `planned_budget`(int) · `paid_amount`(int) ·
**`remaining`**(int) · `selected_options: list[str] | None` · `display_order` · `has_benchmark` · `has_vendor_cases`

⚠️ `DashboardCategoryOut` 과 **다른 스키마**다 — 이쪽엔 `remaining`/`selected_options`/`display_order`/`has_*` 가
있고 `progress_rate` 가 **없다**.

### `WeddingCategoryUpdateItem` (요청 중첩 · `PUT /wedding-categories`)
| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `category_code` | `CategoryCode` | ✅ | |
| `is_active` | `bool` | ✅ | |
| `planned_budget` | `int` | ✅ | **`ge=0`** (0 허용 — payment 의 `gt=0` 과 다름) |
| `display_order` | `int` | ✅ | |
| `selected_options` | `list[str] \| None` | | |
| `skip_reason` | `str \| None` | | ⚠️ **요청에만 있고 응답엔 없다** — 보낸 값을 되읽을 수 없다 |

`WeddingCategoriesUpdate` = `{categories: [...]}` · **`PUT`(전체 교체)**.

---

## 4. `category.py`

### `CategoryOut`
`code`(9값) · `name_ko` · `display_order` · `tier` · `has_cost` · `has_benchmark` ·
`has_vendor_cases` · `allows_custom_tag` — **전부 필수**.

DB 테이블이 아니라 백엔드 상수를 그대로 응답 → **숫자 PK `id` 가 없다.**
`CategoryListOut` = `{categories: CategoryOut[]}`. **인증 불필요.**

---

## 5. `payment.py`

### `PaymentOut` (응답)
| 필드 | 타입 |
|---|---|
| `id` | `UUID` |
| `category_code` | `CategoryCode` |
| `item_name` | `str` |
| `payment_type` | `PaymentType` |
| `vendor_name` / `contact_name` / `contact_phone` | `str \| None` (**패턴 검증 없음**) |
| `amount` | `int` |
| `due_date` / `paid_date` | **`date`** \| None |
| `status` | `PaymentStatus` |
| `receipt_url` | `str \| None` (⚠️ **URL 타입 아님, 그냥 str**) |
| `memo` | `str \| None` |

`contact_*`/`receipt_url` 은 [프로토타입 반영] 컬럼. 영수증은 **파일 업로드가 아니라 URL 입력**이다.

### `PaymentCreate` (요청)
`category_code` ✅ · `item_name` ✅ · `payment_type` ✅ · `vendor_name?` · `contact_name?` ·
`contact_phone?` · **`amount: int` `Field(gt=0)`** ✅ · `due_date?`
⚠️ 생성 시 `status`·`paid_date`·`receipt_url`·`memo` 는 **못 보낸다**(서버 기본값).

### `PaymentUpdate` (요청 · PATCH) — **전 컬럼 optional**
12개 전부 `X | None = None`. `amount` 는 `Field(default=None, gt=0)`.
⚠️ **`None` 을 "지우기"로 쓸 수 없다** — 안 보낸 것과 구분 불가(`exclude_unset` 방식).

### `UpcomingPaymentOut`
`id` · `category_code` · `item_name` · `amount`(int) · **`due_date: date`(여기선 non-null)** · `d_day: int`
`UpcomingPaymentListOut` = `{days: int(요청값 에코), payments: [...]}`

**교차 참조** — `ReportOut.upcoming_payments` 가 이 타입을 **그대로 재사용**한다.

---

## 6. `checklist.py`

v3 의 `checklist_items`(마스터) + `checklist_progress` 분리가 **폐지**되고 웨딩별 행 1개에 `status` 가
직접 있다. 그래서 **`id` 가 int → UUID 로 바뀌었다.**

### `ChecklistItemOut` (응답 · GET 목록 · POST 201)
`id: UUID` · `category_code`(non-null) · `item_type` · `option_group: str|None` · `origin` ·
`status: ChecklistStatus` · `group_label` · `title` · `body: str|None` ·
**`priority: str`** ⚠️ **Literal 아님** · `source_tier: SourceTier|None` · `source_label: str|None` ·
`source_url: str|None` · `tag: str|None` · `memo: str|None`

**전부 기본값이 없다** → JSON 키가 항상 존재. TS 는 `field: T | null`(옵셔널 `?` 아님).

> `source_tier` 가 **null 이면 「AI 추천」** 이라는 프론트 계약이 백엔드 코드에 명시돼 있다
> → [04](04-ai-chat-rag.md) §5.6

### `ChecklistItemPatch` (요청) — `status?` · `memo?`
### `ChecklistItemPatchOut` (PATCH 응답) — ⚠️ **전체가 아니라 4필드만**
`id: UUID` · `status` · `memo: str|None` · **`updated_at: datetime`**

> ⚠️ **`updated_at` 을 "마지막 수정 시각"으로 표시하면 안 된다** — 실제로는 갱신되지 않는다.
> → [03](03-data-model.md) §5

### `ChecklistItemCreate` (요청 · POST)
`category_code` ✅ · `item_type` ✅ · `group_label` ✅ · `title` ✅ · `body?` ·
**`priority: str = "mid"`** · `option_group?` · `tag?`
⚠️ `status`·`origin` 은 요청에 없다(서버가 정함).
⚠️ **기본값 `"mid"` 가 `priority` 어휘의 유일한 코드상 근거**다(DB CHECK 는 `high/mid/low`).

---

## 7. `timeline.py`

⚠️ **`phase_label`("D-11M")은 응답에 없다** — 컬럼 자체를 안 만들고 **프론트가 `default_dday_offset_days`
에서 계산**하기로 결정됐다(2026-08-23).
⚠️ **`is_overdue` 는 저장하지 않고 조회 시점에 서버가 계산**해 내려준다.

### `TimelineItemOut` (응답 · GET · PATCH · POST 201 **셋 다 동일**)
`id: UUID` · `category_code: CategoryCode|None`(범용 항목 허용) · `origin` · `title` ·
**`target_date: date`**(non-null) · `default_dday_offset_days: int|None` ·
`status: MilestoneStatus` · `date_overridden: bool` · `is_overdue: bool`

### `TimelineItemPatch` — `target_date?` · `status?`
### `TimelineItemCreate` — `category_code?` · `title` ✅ · **`target_date: date`** ✅

---

## 8. `chat.py`

### `ChatSessionCreate` — `category_code: CategoryCode | None = None`
**`None` = 전역 상담**(하단 탭바), 값 있으면 카테고리 상세 서브탭.

### `ChatSessionOut` — `id: UUID` · `category_code: CategoryCode|None` · `title: str|None`(⚠️ **항상 null**) · `created_at: datetime`

### `CitationOut` (중첩)
`chunk_id: int` · `title: str` · `source_tier: SourceTier` · `source_url: str | None`
⚠️ **`content`(스니펫)가 없다** → [04](04-ai-chat-rag.md) §3.2

### `VerificationOut` — `verdict: Verdict` · `reason: str`

### `ChatMessageOut`
| 필드 | 타입 | 기본값 |
|---|---|---|
| `id` | **`str`** ⚠️ UUID 아님 | — |
| `role` | `ChatRole` (`user`/`assistant` **소문자**) | — |
| `content` | `str` | — |
| `citations` | `list[CitationOut] \| None` | `None` |
| `verification` | `VerificationOut \| None` | `None` |
| 🆕 `user_rating` | `ChatRating \| None` (`GOOD`/`BAD`) | `None` |
| `created_at` | **`datetime`** | — |

🚨 **`user_rating` 은 배포본 응답에 아직 없다**(2026-08-24 재실측: 배포본 `ChatMessageOut.properties`
= `id·role·content·citations·verification·created_at`). **optional 로 읽고 `undefined` = 미평가로 다룬다.**

`ChatMessageListOut` = `{messages: [...]}` · `ChatMessageCreate` = `{content: str}`

### 🆕 `ChatMessageRatingCreate` / `ChatMessageRatingOut` (PR #55)
`ChatMessageRatingCreate` = `{rating: ChatRating}` — 요청 바디.
`ChatMessageRatingOut` = `{message_id: str`(⚠️ **UUID 아님** — `str(message.id)`)`, rating: ChatRating}`.

### SSE 이벤트 페이로드 — ⚠️ **`response_model` 이 없어 OpenAPI 로는 못 얻는다**
| 이벤트 | 모델 | 필드 |
|---|---|---|
| 🆕 `stage` | `StageEventData` | `stage: ChatStage` (`retrieve`/`generate`/`verify`) |
| 🆕 `retry` | `RetryEventData` | `reason: str` |
| `token` | `TokenEventData` | `delta: str` |
| `citations` | `CitationsEventData` | `citations: CitationOut[]` |
| `verification` | `VerificationEventData` | `verdict`, `reason` |
| `done` | `DoneEventData` | `message_id: str`(⚠️ UUID 아님), `latency_ms: int` |
| `error` | `ErrorEventData` | `code: str`, `message: str` |

**이벤트가 5종 → 7종이 됐다**(PR #53·#54). 🚨 **둘 다 배포본에는 없다** — 안 와도 동작해야 한다.
`stage`·`retry` 의 **정확한 발생 순서와 횟수**는 [`04` §1.2-a](04-ai-chat-rag.md) 에 있다
(`stage` 는 3회가 아니라 **최대 6회** 온다 — 재검색 시 3노드를 다시 지난다).

관측된 `error.code`: **`RATE_LIMITED`** · **`UPSTREAM_LLM_ERROR`**.
🚨 **스트림 시작 후엔 HTTP 상태를 못 바꾸므로 429·타임아웃도 이 이벤트로만 온다** —
**프론트는 200 응답 안에서 error 이벤트를 반드시 처리해야 한다.**

---

## 9. `dashboard.py` — S2 화면 전체를 이 응답 하나로 그린다

### `DashboardCategoryOut` (중첩)
`category_code` · `name_ko` · `tier` · `is_active` · `planned_budget`(int) · `paid_amount`(int) ·
**`progress_rate: float`**

### `DashboardUpcomingItemOut` (중첩) — ⚠️ **판별 유니온으로 옮길 것**
| 필드 | 타입 | 기본값 |
|---|---|---|
| **`source`** | **`Literal["timeline","checklist"]`** (소문자) | — |
| `id` | `UUID` | — |
| `category_code` | `CategoryCode \| None` | `None` |
| `title` | `str` | — |
| `target_date` | **`date`** \| None | `None` |
| `d_day` | `int \| None` | `None` |
| `status` | **`str`** ⚠️ Literal 아님 \| None | `None` |

🚨 **`source` 에 따라 채워지는 필드가 다르다** — `timeline` → `target_date`/`d_day`,
`checklist` → `status`. **TS 에서는 `source` 로 구분하는 discriminated union 이 맞다.**

### `DashboardSummaryOut` (루트)
`wedding_date: date`(non-null) · `d_day: int` · `total_budget` · `total_paid` · **`total_planned`** ·
`remaining_budget` (전부 int) · `categories: [...]` · `upcoming_items: [...]`

`remaining_budget = total_budget - total_paid`. `categories` 는 **`is_active=true` 만** 포함.

---

## 10. `report.py` — S5 마이 리포트

- `BudgetSummaryOut` — `total_budget` · `total_paid` · `remaining_budget` (전부 int)
  ⚠️ `DashboardSummaryOut` 과 달리 **`total_planned` 이 없다.**
- `CategoryCompletionOut` — `category_code` · **`progress_rate: float`**
- `RecommendedCheckOut` — **`checklist_item_id: UUID`** · `category_code` · `title` · **`priority: str`**
- `ReportOut` — `budget_summary` · `category_completion[]` · **`upcoming_payments: UpcomingPaymentOut[]`**(payment.py 재사용) · `next_recommended_checks[]`

> ⚠️ **`report.py:2-3` 의 docstring 이 코드보다 낡았다** — *"checklist_item_id/default_dday_offset 의 int
> 타입은 v3.0 잔재 버그"* 라고 경고하지만, **현재 `checklist_item_id` 는 이미 `UUID` 이고
> `default_dday_offset` 필드는 존재하지 않는다.** 버그는 고쳐졌고 경고문만 남았다.

---

## 11. `benchmark.py`

로컬 Literal: **`PercentileLabel = Literal["낮음", "평균", "높음"]`** ⚠️ **한국어 3값**.
기준: 0.9 미만 낮음 / 0.9~1.1 평균 / 1.1 초과 높음.

### `BenchmarkCompareOut`
`category_code`(VENUE|SDM) · `item_code` · **`region_code: str`**(Literal 아님) ·
**`survey_month: date`** · `your_amount` · `median_price` (int) ·
`min_price`/`max_price`/`sample_count` (각 `int|None`) ·
**`percentile_label`**(한국어) · **`ratio_to_median: float`** · `source_url: str`

### `TotalBudgetPlaceholderOut`
`region_code` · **`survey_month: date`** · `median_price` · `min_price?` · `max_price?` ·
`sample_count?` · `source_url`
→ 온보딩 중(웨딩 생성 전) 슬라이더 플레이스홀더용이라 `your_amount`·`percentile_label`·
`ratio_to_median` 이 **애초에 없다.**

---

## 12. `vendor_case.py`

### `VendorCaseOut`
**`id: int`** ⚠️ UUID 아님 · `case_type`(GOOD|BAD) · `case_label` · `situation` · `key_lesson` ·
`related_item_type: ItemType|None` · `source_tier`

### `VendorCaseListOut`
`category_code: BenchmarkCategoryCode`(**VENUE|SDM 만**) ·
**`disclaimer: str`** — 서버 상수. **프론트가 반드시 노출해야 하는 고지문**:
> `"아래 사례는 여러 실제 사례를 재구성한 예시이며 특정 업체를 지칭하지 않습니다."`
· `cases: VendorCaseOut[]`

---

## 13. `feedback.py`

### `FeedbackReportCreate` (요청)
`target_type: FeedbackTargetType` ✅ · `target_id: UUID` ✅ ·
**`reason_category: FeedbackReasonCategory`**(⚠️ **한국어 5값**) ✅ · `comment: str|None = None`

### `FeedbackReportOut` — `id: UUID` · `status: FeedbackStatus` · `created_at: datetime`

---

## 14. `personalization.py`

### `PersonalizationRegenerateRequest`
`domains: list[PersonalizationDomain]` ✅
**`@field_validator`** — ① 빈 배열 → `"domains는 최소 1개 이상 선택해야 합니다."`
② 중복 → `"domains에 중복된 값이 있습니다."` → 둘 다 **422**

### `PersonalizationRegenerateOut`
`ai_invocation_id: UUID` ·
**`status: str`** ⚠️ Literal 아님 — 주석에 값 명시: **`SUCCESS | BLOCKED | FAILED`**(프론트 유니온의 근거) ·
**`affected_domains: list[str]`** ⚠️ `PersonalizationDomain` 이 아니라 `str` (요청은 좁고 응답은 넓은 비대칭)

---

## 15. 🚨 TS 로 옮길 때 반드시 볼 5가지

### 15.1 `id` 타입이 3종으로 갈린다
대부분 `UUID`(문자열)지만 —
`ChatMessageOut.id: str` · `DoneEventData.message_id: str` ·
`CitationOut.chunk_id: **int**` · `VendorCaseOut.id: **int**`.
`auth` 만 `UUID4` 로 **형식까지 검증**한다.

### 15.2 `date` vs `datetime`
**`datetime`(ISO 타임스탬프)은 5곳뿐** — `ChatSessionOut.created_at` · `ChatMessageOut.created_at` ·
`ChecklistItemPatchOut.updated_at` · `FeedbackReportOut.created_at` · `WeddingOut.created_at`.

**나머지 날짜는 전부 `date`(`YYYY-MM-DD`)** — `wedding_date` · `target_date` · `due_date` ·
`paid_date` · `survey_month`.
🚨 **`new Date("2026-08-24")` 로 파싱하면 UTC 자정으로 해석돼 타임존 오프셋 버그가 난다.**

### 15.3 Literal 로 안 묶인 자유 문자열
`priority`(checklist/report) · `DashboardUpcomingItemOut.status` ·
`PersonalizationRegenerateOut.status`/`affected_domains` · `region_code`(wedding 3곳, benchmark 응답) ·
`receipt_url` · `contact_phone`.
→ **프론트에서 유니온으로 좁히면 백엔드가 안 지키는 계약을 짊어지게 된다.** 넓게 받고 런타임에 좁힐 것.

### 15.4 `region_code` 검증 비대칭
`GET /benchmarks/total-average` 만 `RegionCode` Literal(17값)로 **422** 를 낸다.
`WeddingCreate.region_code` 는 그냥 `str` 이라 오타가 그대로 저장된다. 🚨 **그런데 404 로 터지지도 않는다** — `resolve_region_fallback_chain`(`services/benchmark.py:22-31`)이 모르는 값을 `_METRO_REGIONS` 에 없다는 이유로 **`NON_METRO`(비수도권) → `NATIONWIDE`** 로 조용히 폴백하므로, `GET /benchmarks/compare` 와 `total_budget_unsure=True` 온보딩의 예산 자동 채움이 **엉뚱한 지역(비수도권) 평균**을 돌려준다. 데이터가 전 체인에 없을 때만 `404 BENCHMARK_NOT_AVAILABLE`(`routers/budget.py:165-170`). **프론트가 `RegionCode` 17값으로 좁혀 보내는 것이 유일한 방어다.**

### 15.5 겹치지만 다른 스키마 쌍
| A | B | 차이 |
|---|---|---|
| `DashboardCategoryOut` | `WeddingCategoryOut` | A 는 `progress_rate`, B 는 `remaining`/`selected_options`/`display_order`/`has_*` |
| `DashboardSummaryOut.budget` | `BudgetSummaryOut` | B 에는 `total_planned` 이 **없다** |

**공용 타입으로 합치지 말 것.**
