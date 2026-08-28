# 배포본 API 계약 (openapi.json 실측)

- 출처: `GET https://20-249-52-148.nip.io/openapi.json` — HTTP 200, 45,796 B
- title `메리맵 API` · version `0.1.0` · OpenAPI `3.1.0`
- 경로 24개 · 오퍼레이션 31개 · 스키마 49개
- **securitySchemes 없음** — 쿠키 인증이 스펙에 선언돼 있지 않다
- **배포본 커밋 = `b4615af`** (2026-08-24 클러스터 실측, [`08` §1](08-cluster-runtime.md)) —
  `origin/backend`(`6c29ea0`) 대비 🆕 **37커밋 뒤**이고, 소스 기반 문서의 분석 기준 **보다도 이전**이다

> 🔍 **4차 점검(2026-08-25)** — 코드 6c29ea0 대비 팩트체크. 수정 0건 / 미검증 1건. 상세는 README 「4차 점검 이력」.
> - `openapi.deployed.json` 을 파싱해 대조: paths 24 · operations 31 · schemas 49 · 45,796 B · `securitySchemes` 없음 —
>   본문 엔드포인트 31개·스키마 49개·필드/필수/enum/제약(`default='mid'`, `minLength=8`, `exclusiveMinimum=0.0`,
>   `minimum=0.0`) 전부 일치, 불일치 0건.
> - `git rev-list --count b4615af..6c29ea0` = **37**(머지 포함, `--no-merges` 23) 확인. 계약 diff
>   (`git diff --stat b4615af..6c29ea0 -- routers schemas models alembic`)는 7파일 +178/−4 —
>   `routers/personalization.py`·`routers/chat.py`·`schemas/chat.py`·`schemas/personalization.py`·`schemas/common.py`·
>   `models/chat.py`·`alembic/.../4de56b422020_add_chat_messages_user_rating.py`. 즉 배포본에 없는 오퍼레이션은
>   `POST /api/v1/personalization/regenerate`(`routers/personalization.py:26`)와
>   `POST /api/v1/chat/sessions/{session_id}/messages/{message_id}/feedback`(`routers/chat.py:99`) 2개, 스키마만 바뀐 것은
>   `ChatSessionCreate.category_code: CategoryCode | None = None`(`schemas/chat.py:15`)과 `ChatMessageOut.user_rating`
>   (`schemas/chat.py:44`) — 아래 🚨 문단의 「소스 33 ↔ 배포 31 = 차이 2」와 정확히 맞는다.
>   「소스 33」의 셈법: `@router.*` 데코레이터 35개 − `include_in_schema=False` 인 OAuth 2개(`routers/auth.py:135`, `:172`).
> - **2026-08-25T08:43Z 재실측**: `GET https://20-249-52-148.nip.io/openapi.json` → 200 · 45,796 B · 저장본과 **바이트 동일**
>   (오퍼레이션 추가 0·삭제 0), `GET /api/v1/health` → 200 `{"status":"ok"}`. **배포본은 여전히 `b4615af` 계약이다.**
> - 미검증 1건: 아래 「그 사이 `origin/backend` 는 16커밋 움직였다」는 2차 재수집 시점의 과거 수치라 재현 불가(현재 기준 총 37 만 확인).

> ✅ **2026-08-24 재수집 — 이 덤프는 여전히 유효하다.** 같은 URL 을 다시 받아 저장본
> `openapi.deployed.json` 과 오퍼레이션 단위로 비교했다: **paths 24 · operations 31 · `info.version`
> `0.1.0` · 45,796 B — 추가 0건 · 삭제 0건.** 그 사이 `origin/backend` 는 16커밋 움직였다.

> 🔧 **2026-08-24 표 렌더링 결함 127행 수정.** 아래 스키마 표의 타입 칸에 `enum(VENUE|SDM)` ·
> `integer | null` 처럼 **이스케이프 안 된 `|`** 가 들어 있어 그 행들이 4칸이 아니라 5~13칸으로
> 렌더링되고 있었다(설명 칸이 잘려 나갔다). GFM 명세대로 셀 안의 파이프는 **`\|` 로 이스케이프**해야
> 한다 — **인라인 코드 안에서도 마찬가지다.** 수정은 이스케이프 339개 추가뿐이고 **내용은 한 글자도
> 바뀌지 않았다**(파이프 이스케이프를 제거하면 수정 전 파일과 완전히 동일함을 확인).
> **openapi 를 다시 표로 옮길 때 같은 함정이 재발한다** — 옮긴 뒤 표 열 수를 한 번 세어 본다.
> **「배포본이 안 움직였다」를 매번 이 방식으로 확인한다**(§재실측 명령은 [`08` §8](08-cluster-runtime.md)).
>
> 🚨 그래서 **소스 기준 33개 ↔ 배포 노출 31개** 로 차이가 **2개**로 늘었다(이전 1개) —
> 개인화 재생성 + **챗 👍👎 평가**. 스키마만 바뀐 변경(전역 상담 `null`,
> `ChatMessageOut.user_rating`)은 **이 개수에 안 잡힌다**는 점을 다시 확인했다.

> ⭐ **이 문서가 다른 문서보다 옳았던 지점이 있다.** 아래 `ChatSessionCreate` 는 `category_code` 를
> **필수(O)** 로 적고 있는데, `01`·`04`·`07` 은 소스를 근거로 「`null` = 전역 상담」이라고 적었다.
> **배포본 기준으로는 이 문서가 맞다** — nullable 로 바꾼 커밋이 배포본보다 뒤다(`08` §3.1).
> **소스 기반 문서와 이 문서가 어긋나면, 「지금 호출되는가」에 대해서는 이 문서를 믿는다.**

## 엔드포인트

### `POST /api/v1/auth/login`
- tag: auth · operationId: `login_api_v1_auth_login_post`
- 요청 바디 `application/json` → **LoginRequest** (필수)
- 응답:
    - `200` application/json → **AuthUserOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `POST /api/v1/auth/logout`
- tag: auth · operationId: `logout_api_v1_auth_logout_post`
- 응답:
    - `204` (본문 없음) — Successful Response

### `GET /api/v1/auth/me`
- tag: auth · operationId: `get_me_api_v1_auth_me_get`
- 응답:
    - `200` application/json → **AuthUserOut** — Successful Response

### `POST /api/v1/auth/signup`
- tag: auth · operationId: `signup_api_v1_auth_signup_post`
- 요청 바디 `application/json` → **SignupRequest** (필수)
- 응답:
    - `201` application/json → **AuthUserOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/benchmarks/compare`
- tag: budget · operationId: `compare_benchmark_api_v1_benchmarks_compare_get`
- 파라미터 `category_code` (query) string — 필수
- 파라미터 `item_code` (query) string — 필수
- 파라미터 `amount` (query) integer — 필수
- 응답:
    - `200` application/json → **BenchmarkCompareOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/benchmarks/total-average`
- tag: budget · operationId: `get_total_budget_placeholder_api_v1_benchmarks_total_average_get`
- 파라미터 `region_code` (query) enum(SEOUL_GANGNAM|SEOUL_OTHER|BUSAN|INCHEON|DAEGU|DAEJEON|GWANGJU|ULSAN|GYEONGGI|CHUNGCHEONG|JEOLLA|GYEONGSANG|GANGWON|JEJU|NATIONWIDE|METRO|NON_METRO) — 필수
- 응답:
    - `200` application/json → **TotalBudgetPlaceholderOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/categories`
- tag: category · operationId: `list_categories_api_v1_categories_get`
- 응답:
    - `200` application/json → **CategoryListOut** — Successful Response

### `POST /api/v1/chat/sessions`
- tag: chat · operationId: `create_chat_session_api_v1_chat_sessions_post`
- 요청 바디 `application/json` → **ChatSessionCreate** (필수)
- 응답:
    - `201` application/json → **ChatSessionOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/chat/sessions/{session_id}/messages`
- tag: chat · operationId: `list_chat_messages_route_api_v1_chat_sessions__session_id__messages_get`
- 파라미터 `session_id` (path) string(uuid) — 필수
- 응답:
    - `200` application/json → **ChatMessageListOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `POST /api/v1/chat/sessions/{session_id}/messages`
- tag: chat · operationId: `send_chat_message_api_v1_chat_sessions__session_id__messages_post`
- 파라미터 `session_id` (path) string(uuid) — 필수
- 요청 바디 `application/json` → **ChatMessageCreate** (필수)
- 응답:
    - `200` application/json → **any** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/checklist-items`
- tag: checklist · operationId: `get_checklist_items_api_v1_checklist_items_get`
- 파라미터 `category_code` (query) string | null — 선택
- 파라미터 `item_type` (query) string | null — 선택
- 응답:
    - `200` application/json → **ChecklistListOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `POST /api/v1/checklist-items`
- tag: checklist · operationId: `post_checklist_item_api_v1_checklist_items_post`
- 요청 바디 `application/json` → **ChecklistItemCreate** (필수)
- 응답:
    - `201` application/json → **ChecklistItemOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `PATCH /api/v1/checklist-items/{item_id}`
- tag: checklist · operationId: `patch_checklist_item_api_v1_checklist_items__item_id__patch`
- 파라미터 `item_id` (path) string — 필수
- 요청 바디 `application/json` → **ChecklistItemPatch** (필수)
- 응답:
    - `200` application/json → **ChecklistItemPatchOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/dashboard/summary`
- tag: dashboard · operationId: `dashboard_summary_api_v1_dashboard_summary_get`
- 응답:
    - `200` application/json → **DashboardSummaryOut** — Successful Response

### `POST /api/v1/feedback-reports`
- tag: feedback · operationId: `create_feedback_report_route_api_v1_feedback_reports_post`
- 요청 바디 `application/json` → **FeedbackReportCreate** (필수)
- 응답:
    - `201` application/json → **FeedbackReportOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/health`
- tag: health · operationId: `health_api_v1_health_get`
- 응답:
    - `200` application/json → **object** — Successful Response

### `GET /api/v1/payments`
- tag: budget · operationId: `list_payments_api_v1_payments_get`
- 파라미터 `category_code` (query) string | null — 선택
- 파라미터 `status` (query) string | null — 선택
- 응답:
    - `200` application/json → **PaymentListOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `POST /api/v1/payments`
- tag: budget · operationId: `create_payment_api_v1_payments_post`
- 요청 바디 `application/json` → **PaymentCreate** (필수)
- 응답:
    - `201` application/json → **PaymentOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/payments/upcoming`
- tag: budget · operationId: `list_upcoming_payments_api_v1_payments_upcoming_get`
- 파라미터 `days` (query) integer — 선택 · default=30
- 응답:
    - `200` application/json → **UpcomingPaymentListOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `PATCH /api/v1/payments/{payment_id}`
- tag: budget · operationId: `update_payment_api_v1_payments__payment_id__patch`
- 파라미터 `payment_id` (path) string — 필수
- 요청 바디 `application/json` → **PaymentUpdate** (필수)
- 응답:
    - `200` application/json → **PaymentOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `DELETE /api/v1/payments/{payment_id}`
- tag: budget · operationId: `delete_payment_api_v1_payments__payment_id__delete`
- 파라미터 `payment_id` (path) string — 필수
- 응답:
    - `204` (본문 없음) — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/reports/me`
- tag: dashboard · operationId: `get_my_report_api_v1_reports_me_get`
- 응답:
    - `200` application/json → **ReportOut** — Successful Response

### `GET /api/v1/timeline-items`
- tag: timeline · operationId: `get_timeline_items_api_v1_timeline_items_get`
- 파라미터 `category_code` (query) string | null — 선택
- 응답:
    - `200` application/json → **TimelineListOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `POST /api/v1/timeline-items`
- tag: timeline · operationId: `post_timeline_item_api_v1_timeline_items_post`
- 요청 바디 `application/json` → **TimelineItemCreate** (필수)
- 응답:
    - `201` application/json → **TimelineItemOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `PATCH /api/v1/timeline-items/{item_id}`
- tag: timeline · operationId: `patch_timeline_item_api_v1_timeline_items__item_id__patch`
- 파라미터 `item_id` (path) string — 필수
- 요청 바디 `application/json` → **TimelineItemPatch** (필수)
- 응답:
    - `200` application/json → **TimelineItemOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/vendor-cases`
- tag: vendor-case · operationId: `list_vendor_cases_api_v1_vendor_cases_get`
- 파라미터 `category_code` (query) string — 필수
- 파라미터 `case_type` (query) string | null — 선택
- 응답:
    - `200` application/json → **VendorCaseListOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/wedding-categories`
- tag: wedding · operationId: `list_wedding_categories_api_v1_wedding_categories_get`
- 응답:
    - `200` application/json → **WeddingCategoriesOut** — Successful Response

### `PUT /api/v1/wedding-categories`
- tag: wedding · operationId: `update_wedding_categories_api_v1_wedding_categories_put`
- 요청 바디 `application/json` → **WeddingCategoriesUpdate** (필수)
- 응답:
    - `200` application/json → **WeddingCategoriesOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `POST /api/v1/weddings`
- tag: wedding · operationId: `create_wedding_api_v1_weddings_post`
- 요청 바디 `application/json` → **WeddingCreate** (필수)
- 응답:
    - `201` application/json → **WeddingOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

### `GET /api/v1/weddings/me`
- tag: wedding · operationId: `get_wedding_api_v1_weddings_me_get`
- 응답:
    - `200` application/json → **WeddingOut** — Successful Response

### `PATCH /api/v1/weddings/me`
- tag: wedding · operationId: `update_wedding_api_v1_weddings_me_patch`
- 요청 바디 `application/json` → **WeddingUpdate** (필수)
- 응답:
    - `200` application/json → **WeddingOut** — Successful Response
    - `422` application/json → **HTTPValidationError** — Validation Error

## 스키마 정의

### `AuthUserOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `id` | string(uuid4) | O |  |
| `email` | string | O |  |
| `display_name` | string \| null | O |  |
| `has_wedding` | boolean | O |  |

### `BenchmarkCompareOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `category_code` | enum(VENUE\|SDM) | O |  |
| `item_code` | string | O |  |
| `region_code` | string | O |  |
| `survey_month` | string(date) | O |  |
| `your_amount` | integer | O |  |
| `median_price` | integer | O |  |
| `min_price` | integer \| null | O |  |
| `max_price` | integer \| null | O |  |
| `sample_count` | integer \| null | O |  |
| `percentile_label` | enum(낮음\|평균\|높음) | O |  |
| `ratio_to_median` | number | O |  |
| `source_url` | string | O |  |

### `BudgetSummaryOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `total_budget` | integer | O |  |
| `total_paid` | integer | O |  |
| `remaining_budget` | integer | O |  |

### `CategoryCompletionOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `progress_rate` | number | O |  |

### `CategoryListOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `categories` | CategoryOut[] | O |  |

### `CategoryOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `name_ko` | string | O |  |
| `display_order` | integer | O |  |
| `tier` | enum(FOCUS\|MOCKUP) | O |  |
| `has_cost` | boolean | O |  |
| `has_benchmark` | boolean | O |  |
| `has_vendor_cases` | boolean | O |  |
| `allows_custom_tag` | boolean | O |  |

### `ChatMessageCreate`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `content` | string | O |  |

### `ChatMessageListOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `messages` | ChatMessageOut[] | O |  |

### `ChatMessageOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `id` | string | O |  |
| `role` | enum(user\|assistant) | O |  |
| `content` | string | O |  |
| `citations` | CitationOut[] \| null | - |  |
| `verification` | VerificationOut \| null | - |  |
| `created_at` | string(date-time) | O |  |

### `ChatSessionCreate`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |

### `ChatSessionOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `id` | string(uuid) | O |  |
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `title` | string \| null | O |  |
| `created_at` | string(date-time) | O |  |

### `ChecklistItemCreate`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `item_type` | enum(CONTRACT_TERM\|EXTRA_COST\|PREP) | O |  |
| `group_label` | string | O |  |
| `title` | string | O |  |
| `body` | string \| null | - |  |
| `priority` | string | - | default='mid' |
| `option_group` | string \| null | - |  |
| `tag` | string \| null | - |  |

### `ChecklistItemOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `id` | string(uuid) | O |  |
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `item_type` | enum(CONTRACT_TERM\|EXTRA_COST\|PREP) | O |  |
| `option_group` | string \| null | O |  |
| `origin` | enum(LLM\|USER) | O |  |
| `status` | enum(TODO\|DOING\|SKIP\|DONE) \| enum(LISTED\|COMPARING\|ORDERED\|DELIVERED) | O |  |
| `group_label` | string | O |  |
| `title` | string | O |  |
| `body` | string \| null | O |  |
| `priority` | string | O |  |
| `source_tier` | enum(OFFICIAL\|NEWS\|INDUSTRY\|CONSENSUS) \| null | O |  |
| `source_label` | string \| null | O |  |
| `source_url` | string \| null | O |  |
| `tag` | string \| null | O |  |
| `memo` | string \| null | O |  |

### `ChecklistItemPatch`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `status` | enum(TODO\|DOING\|SKIP\|DONE) \| enum(LISTED\|COMPARING\|ORDERED\|DELIVERED) \| null | - |  |
| `memo` | string \| null | - |  |

### `ChecklistItemPatchOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `id` | string(uuid) | O |  |
| `status` | enum(TODO\|DOING\|SKIP\|DONE) \| enum(LISTED\|COMPARING\|ORDERED\|DELIVERED) | O |  |
| `memo` | string \| null | O |  |
| `updated_at` | string(date-time) | O |  |

### `ChecklistListOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `items` | ChecklistItemOut[] | O |  |

### `CitationOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `chunk_id` | integer | O |  |
| `title` | string | O |  |
| `source_tier` | enum(OFFICIAL\|NEWS\|INDUSTRY\|CONSENSUS) | O |  |
| `source_url` | string \| null | O |  |

### `DashboardCategoryOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `name_ko` | string | O |  |
| `tier` | enum(FOCUS\|MOCKUP) | O |  |
| `is_active` | boolean | O |  |
| `planned_budget` | integer | O |  |
| `paid_amount` | integer | O |  |
| `progress_rate` | number | O |  |

### `DashboardSummaryOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `wedding_date` | string(date) | O |  |
| `d_day` | integer | O |  |
| `total_budget` | integer | O |  |
| `total_paid` | integer | O |  |
| `total_planned` | integer | O |  |
| `remaining_budget` | integer | O |  |
| `categories` | DashboardCategoryOut[] | O |  |
| `upcoming_items` | DashboardUpcomingItemOut[] | O |  |

### `DashboardUpcomingItemOut`
> timeline_items(날짜 있음)와 checklist_items(날짜 없음, 진행상태만)를 합친 결과라 source에 따라 채워지는 필드가 다르다 — timeline은 target_date/d_day, checklist는 status (03_API_spec.md #25 응답 예시). category_code는 timeline_items 쪽이 범용 항목이면 null일 수 있어(app/models/timeline.py) optional로 둔다.
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `source` | enum(timeline\|checklist) | O |  |
| `id` | string(uuid) | O |  |
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) \| null | - |  |
| `title` | string | O |  |
| `target_date` | string(date) \| null | - |  |
| `d_day` | integer \| null | - |  |
| `status` | string \| null | - |  |

### `FeedbackReportCreate`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `target_type` | enum(CHAT_MESSAGE\|CHECKLIST_ITEM\|TIMELINE_ITEM) | O |  |
| `target_id` | string(uuid) | O |  |
| `reason_category` | enum(부정확함\|부적절함\|도움안됨\|편향/차별적\|기타) | O |  |
| `comment` | string \| null | - |  |

### `FeedbackReportOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `id` | string(uuid) | O |  |
| `status` | enum(OPEN\|REVIEWED\|RESOLVED) | O |  |
| `created_at` | string(date-time) | O |  |

### `HTTPValidationError`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `detail` | ValidationError[] | - |  |

### `LoginRequest`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `email` | string(email) | O |  |
| `password` | string | O |  |

### `PaymentCreate`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `item_name` | string | O |  |
| `payment_type` | enum(DEPOSIT\|INTERIM\|BALANCE\|ETC) | O |  |
| `vendor_name` | string \| null | - |  |
| `contact_name` | string \| null | - |  |
| `contact_phone` | string \| null | - |  |
| `amount` | integer | O | exclusiveMinimum=0.0 |
| `due_date` | string(date) \| null | - |  |

### `PaymentListOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `payments` | PaymentOut[] | O |  |

### `PaymentOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `id` | string(uuid) | O |  |
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `item_name` | string | O |  |
| `payment_type` | enum(DEPOSIT\|INTERIM\|BALANCE\|ETC) | O |  |
| `vendor_name` | string \| null | O |  |
| `contact_name` | string \| null | O |  |
| `contact_phone` | string \| null | O |  |
| `amount` | integer | O |  |
| `due_date` | string(date) \| null | O |  |
| `paid_date` | string(date) \| null | O |  |
| `status` | enum(PLANNED\|PAID\|CANCELED) | O |  |
| `receipt_url` | string \| null | O |  |
| `memo` | string \| null | O |  |

### `PaymentUpdate`
> 부분 수정 — 보낸 필드만 갱신(app/services/wedding.py의 WeddingUpdate와 동일 원칙). 03_API_spec.md #20 예시는 납부 완료 처리(status/paid_date/receipt_url)만 보이지만, 다른 필드도 PATCH로 정정 가능해야 해서(예: 금액 오기입) 전체 컬럼을 optional로 연다.
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) \| null | - |  |
| `item_name` | string \| null | - |  |
| `payment_type` | enum(DEPOSIT\|INTERIM\|BALANCE\|ETC) \| null | - |  |
| `vendor_name` | string \| null | - |  |
| `contact_name` | string \| null | - |  |
| `contact_phone` | string \| null | - |  |
| `amount` | integer \| null | - |  |
| `due_date` | string(date) \| null | - |  |
| `paid_date` | string(date) \| null | - |  |
| `status` | enum(PLANNED\|PAID\|CANCELED) \| null | - |  |
| `receipt_url` | string \| null | - |  |
| `memo` | string \| null | - |  |

### `RecommendedCheckOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `checklist_item_id` | string(uuid) | O |  |
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `title` | string | O |  |
| `priority` | string | O |  |

### `ReportOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `budget_summary` | BudgetSummaryOut | O |  |
| `category_completion` | CategoryCompletionOut[] | O |  |
| `upcoming_payments` | UpcomingPaymentOut[] | O |  |
| `next_recommended_checks` | RecommendedCheckOut[] | O |  |

### `SignupRequest`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `email` | string(email) | O |  |
| `password` | string | O | minLength=8 |
| `display_name` | string | O |  |

### `TimelineItemCreate`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) \| null | - |  |
| `title` | string | O |  |
| `target_date` | string(date) | O |  |

### `TimelineItemOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `id` | string(uuid) | O |  |
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) \| null | O |  |
| `origin` | enum(LLM\|USER) | O |  |
| `title` | string | O |  |
| `target_date` | string(date) | O |  |
| `default_dday_offset_days` | integer \| null | O |  |
| `status` | enum(TODO\|DONE) | O |  |
| `date_overridden` | boolean | O |  |
| `is_overdue` | boolean | O |  |

### `TimelineItemPatch`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `target_date` | string(date) \| null | - |  |
| `status` | enum(TODO\|DONE) \| null | - |  |

### `TimelineListOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `items` | TimelineItemOut[] | O |  |

### `TotalBudgetPlaceholderOut`
> 비교 대상 금액(your_amount)도 카테고리도 없다 — 온보딩 중 아직 웨딩이 생성되기 전에 지역만으로 슬라이더 플레이스홀더 값을 미리 보여주기 위한 것뿐이라 BenchmarkCompareOut의 percentile_label/ratio_to_median처럼 "내 금액과 비교"하는 필드는 애초에 없다.
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `region_code` | string | O |  |
| `survey_month` | string(date) | O |  |
| `median_price` | integer | O |  |
| `min_price` | integer \| null | O |  |
| `max_price` | integer \| null | O |  |
| `sample_count` | integer \| null | O |  |
| `source_url` | string | O |  |

### `UpcomingPaymentListOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `days` | integer | O |  |
| `payments` | UpcomingPaymentOut[] | O |  |

### `UpcomingPaymentOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `id` | string(uuid) | O |  |
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `item_name` | string | O |  |
| `amount` | integer | O |  |
| `due_date` | string(date) | O |  |
| `d_day` | integer | O |  |

### `ValidationError`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `loc` | string \| integer[] | O |  |
| `msg` | string | O |  |
| `type` | string | O |  |
| `input` | any | - |  |
| `ctx` | object | - |  |

### `VendorCaseListOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `category_code` | enum(VENUE\|SDM) | O |  |
| `disclaimer` | string | O |  |
| `cases` | VendorCaseOut[] | O |  |

### `VendorCaseOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `id` | integer | O |  |
| `case_type` | enum(GOOD\|BAD) | O |  |
| `case_label` | string | O |  |
| `situation` | string | O |  |
| `key_lesson` | string | O |  |
| `related_item_type` | enum(CONTRACT_TERM\|EXTRA_COST\|PREP) \| null | O |  |
| `source_tier` | enum(OFFICIAL\|NEWS\|INDUSTRY\|CONSENSUS) | O |  |

### `VerificationOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `verdict` | enum(SUPPORTED\|WEAK\|GENERAL) | O |  |
| `reason` | string | O |  |

### `WeddingCategoriesOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `categories` | WeddingCategoryOut[] | O |  |

### `WeddingCategoriesUpdate`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `categories` | WeddingCategoryUpdateItem[] | O |  |

### `WeddingCategoryOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `name_ko` | string | O |  |
| `tier` | enum(FOCUS\|MOCKUP) | O |  |
| `is_active` | boolean | O |  |
| `planned_budget` | integer | O |  |
| `paid_amount` | integer | O |  |
| `remaining` | integer | O |  |
| `selected_options` | string[] \| null | O |  |
| `display_order` | integer | O |  |
| `has_benchmark` | boolean | O |  |
| `has_vendor_cases` | boolean | O |  |

### `WeddingCategoryUpdateItem`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `category_code` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC) | O |  |
| `is_active` | boolean | O |  |
| `planned_budget` | integer | O | minimum=0.0 |
| `display_order` | integer | O |  |
| `selected_options` | string[] \| null | - |  |
| `skip_reason` | string \| null | - |  |

### `WeddingCreate`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `user_role` | enum(BRIDE\|GROOM) | O |  |
| `wedding_date` | string(date) \| null | - |  |
| `wedding_date_precision` | enum(EXACT\|APPROX_H2_THIS_YEAR\|APPROX_H1_NEXT_YEAR\|APPROX_H2_NEXT_YEAR\|NO_PLAN) | O |  |
| `total_budget` | integer \| null | - |  |
| `total_budget_unsure` | boolean | - | default=False |
| `region_code` | string | O |  |
| `guest_count` | integer \| null | - |  |
| `guest_count_unsure` | boolean | - | default=False |
| `taste_preference` | enum(MINIMAL\|BUDGET\|GRAND\|BALANCED) \| null | - |  |
| `venue_priority` | enum(FOOD\|LOCATION\|PARKING\|CAPACITY) \| null | - |  |
| `sdm_priority` | enum(DRESS\|PHOTO\|MAKEUP) \| null | - |  |
| `primary_goals` | string[] | - |  |
| `done_so_far` | enum(MEETING\|VENUE\|SDM\|GIFT\|HOMEWARE\|INVITATION\|HONEYMOON\|HOMENEW\|ETC)[] | - |  |

### `WeddingOut`
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `id` | string(uuid) | O |  |
| `user_role` | enum(BRIDE\|GROOM) | O |  |
| `wedding_date` | string(date) | O |  |
| `wedding_date_precision` | enum(EXACT\|APPROX_H2_THIS_YEAR\|APPROX_H1_NEXT_YEAR\|APPROX_H2_NEXT_YEAR\|NO_PLAN) | O |  |
| `total_budget` | integer | O |  |
| `total_budget_unsure` | boolean | O |  |
| `region_code` | string | O |  |
| `guest_count` | integer \| null | O |  |
| `guest_count_unsure` | boolean | O |  |
| `taste_preference` | enum(MINIMAL\|BUDGET\|GRAND\|BALANCED) \| null | O |  |
| `venue_priority` | enum(FOOD\|LOCATION\|PARKING\|CAPACITY) \| null | O |  |
| `sdm_priority` | enum(DRESS\|PHOTO\|MAKEUP) \| null | O |  |
| `primary_goals` | string[] \| null | O |  |
| `created_at` | string(date-time) | O |  |

### `WeddingUpdate`
> 부분 수정 — 보낸 필드만 갱신(03_API_spec.md #8).
| 필드 | 타입 | 필수 | 제약/기본값 |
|---|---|---|---|
| `wedding_date` | string(date) \| null | - |  |
| `wedding_date_precision` | enum(EXACT\|APPROX_H2_THIS_YEAR\|APPROX_H1_NEXT_YEAR\|APPROX_H2_NEXT_YEAR\|NO_PLAN) \| null | - |  |
| `total_budget` | integer \| null | - |  |
| `total_budget_unsure` | boolean \| null | - |  |
| `region_code` | string \| null | - |  |
| `guest_count` | integer \| null | - |  |
| `guest_count_unsure` | boolean \| null | - |  |
| `taste_preference` | enum(MINIMAL\|BUDGET\|GRAND\|BALANCED) \| null | - |  |
| `venue_priority` | enum(FOOD\|LOCATION\|PARKING\|CAPACITY) \| null | - |  |
| `sdm_priority` | enum(DRESS\|PHOTO\|MAKEUP) \| null | - |  |
| `primary_goals` | string[] \| null | - |  |
