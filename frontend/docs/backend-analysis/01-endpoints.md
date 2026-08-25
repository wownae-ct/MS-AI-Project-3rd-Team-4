# 01 · 엔드포인트 전수 — 35개

> 코드 기준 `backend` **`6c29ea0`** (2026-08-24 3차 재분석 · 직전 기준 `e3496e7` 대비 **4커밋**). 경로는 전부 `app/main.py:92-103` 이 붙이는 **`/api/v1`** 프리픽스 포함.
> 🆕 **3차 재분석 (`e3496e7` → `6c29ea0`, PR #57 4커밋).** 이 문서의 내용은 **바뀌지 않았다** — 바뀐 파일이 `app/personalization/prompts.py` 와 그 테스트뿐이라 라우터·스키마·모델·마이그레이션 diff 가 **0** 이다(실측). 수치도 재측정에서 동일하다(엔드포인트 **35**·OpenAPI 노출 **33** · 마이그레이션 **13** · 스키마 **15**파일 · 모델 **10**개 · 카테고리 **9**). 무엇이 바뀌었는지는 [`04` §5.6-c](04-ai-chat-rag.md).
> ⚠️ **`6c29ea0` 는 「코드」기준이지 배포본이 아니다.** 배포본(staging)은 **`b4615af`** 로 이보다 **한참 이전**이고 `origin/backend` 대비 **37커밋 뒤**다 — [`08` §1](08-cluster-runtime.md). 「코드에 있다」와 「호출된다」를 따로 센다.
> 🔍 **4차 점검(2026-08-25)** — 코드 6c29ea0 대비 팩트체크. 수정 9건 / 미검증 0건. 상세는 README 「4차 점검 이력」.
> 배포본에는 이 중 **2개가 없다** — 개인화 재생성(→ README §2-3) · **챗 👍👎 평가**(§4 끝). 배포본 노출은 **31개**로 고정돼 있다(2026-08-24 재실측, 변동 없음).

## 0. 총계

**35개** = `@router.<method>` 데코레이터 실측(`6c29ea0` 재측정 — `e3496e7` 과 동일). 그중 **2개는 `include_in_schema=False`**(OAuth 리다이렉트)라
`/docs`·`openapi.json` 에는 **33개**만 보인다(4차 재실측 `app.openapi()`: paths **26** · operations **33**). **직전 기준 `df4a8ff` 의 34개에서 1개 늘었다** — 챗 👍👎 평가(§4 끝).

🚨 **배포본은 여전히 31개다**(2026-08-24 재실측: paths 24 · operations 31, 저장본 `openapi.deployed.json` 과 **완전 동일**).
차이 2개 = 개인화 재생성 + 챗 평가. 33 − 31 = 2 로 수치가 맞는다.

| 라우터 | `APIRouter(...)` | 개수 |
|---|---|---|
| `health.py` | `tags=["health"]` | 1 |
| `auth.py` | **`prefix="/auth"`**, `tags=["auth"]` | 6 |
| `wedding.py` | `tags=["wedding"]` | 5 |
| `category.py` | `tags=["category"]` | 1 |
| `budget.py` | `tags=["budget"]` | 7 |
| `vendor_case.py` | `tags=["vendor-case"]` | 1 |
| `checklist.py` | `tags=["checklist"]` | 3 |
| `timeline.py` | `tags=["timeline"]` | 3 |
| `chat.py` | `tags=["chat"]` | **4** |
| `dashboard.py` | `tags=["dashboard"]` | 2 |
| `feedback.py` | `tags=["feedback"]` | 1 |
| `personalization.py` | `tags=["personalization"]` | 1 |

### 인증 분포 — 프론트에 가장 중요한 표

| 의존성 | 개수 | 엔드포인트 |
|---|---|---|
| **없음** | **8** | `/health` · `/auth/signup` · `/auth/login` · `/auth/logout` · `/auth/{provider}/login` · `/auth/{provider}/callback` · `/categories` · `/vendor-cases` |
| `Depends(get_current_user)` | **3** | `GET /auth/me` · `POST /weddings` · `GET /benchmarks/total-average` |
| `Depends(get_current_wedding)` | **24** | 나머지 전부 |

→ **로그인·온보딩 없이 쓸 수 있는 데이터 API 는 `/categories` 와 `/vendor-cases` 둘뿐이다.**

---

## 1. 모든 엔드포인트에 적용되는 공통 계약

### 1.1 인증 — 쿠키 세션 (`app/deps.py:16-45`)

- **`get_current_user`** — 쿠키 `wr_session` 을 읽는다. 없으면 `401 UNAUTHORIZED "로그인이 필요합니다."`(`deps.py:25`), 만료·폐기면 `401 UNAUTHORIZED "세션이 만료됐거나 유효하지 않습니다."`(`deps.py:28`).
- **`get_current_wedding`** — `get_current_user` 를 먼저 거친 뒤 그 사용자의 웨딩을 조회. 없으면 `404 WEDDING_NOT_FOUND "웨딩 프로필이 아직 없습니다. 온보딩을 먼저 진행하세요."`(`deps.py:42-44`).
- → **`get_current_wedding` 을 쓰는 24개는 401 과 404 를 둘 다 던진다.** 아래 표에서는 **"공통 401/404"** 로 줄여 적는다.
- **`wedding_id` 를 URL·바디로 받는 엔드포인트는 하나도 없다** — 항상 세션에서 서버가 유도한다.

**프론트 분기 계약이 코드 주석에 명시돼 있다**(`deps.py:21`, `:37`):
- `401` → **S0 로그인**으로 이동
- `404 WEDDING_NOT_FOUND` → **S1 온보딩**으로 이동

### 1.2 에러 포맷 (`app/core/errors.py:8-15`, `main.py:66-89`)

모든 에러 바디는 `{"error": {"code": "...", "message": "...", ...extra}}`.
Pydantic 검증 실패는 전부 **`422 VALIDATION_ERROR`** 로 통일된다(message = 첫 오류의 `msg`, **영어일 수 있음**).
`api_error` 포맷이 아닌 `HTTPException`(라우팅 404 등)은 `INTERNAL_ERROR` 로 감싸진다.

### 1.3 CORS (`main.py:56-63`)

`allow_origins=["http://localhost:5173"]` 정확히 하나 + SWA 정규식, `allow_credentials=True`.
→ **모든 요청에 `credentials: "include"` 필수.** dev 서버는 반드시 `localhost`(127.0.0.1 은 차단).

---

## 2. health — 1개

| 메서드 + 경로 | 인증 | 응답 | 비고 |
|---|---|---|---|
| `GET /api/v1/health` | 없음 | `200` `{"status":"ok"}` | `response_model` 없음. `/healthz`·`/readyz` 는 **없다** |

---

## 3. auth — 6개 (`prefix="/auth"`)

### `POST /api/v1/auth/signup` — `auth.py:61-82`
- 인증 없음 · 바디 **`SignupRequest`** `{email: EmailStr, password: str(min 8), display_name: str}`
- **201** + **`Set-Cookie: wr_session`** · 응답 `AuthUserOut`
- 에러 `409 EMAIL_ALREADY_EXISTS` · `422`
- ⚠️ 응답의 `has_wedding` 은 **항상 `false` 하드코딩**(`auth.py:81`)

### `POST /api/v1/auth/login` — `auth.py:85-106`
- 인증 없음 · 바디 **`LoginRequest`** `{email, password}` (password 길이 제약 **없음**)
- **200** + `Set-Cookie` · 응답 `AuthUserOut` (`has_wedding` 은 **실제 조회값**)
- 에러 `401 INVALID_CREDENTIALS` — **이메일 없음/비번 틀림을 의도적으로 구분하지 않는다**

### `POST /api/v1/auth/logout` — `auth.py:109-121`
- 인증 **불필요**(쿠키 없어도 성공 — idempotent) · **204** 무바디 · 쿠키 삭제
- 현재 토큰 **하나만** 폐기. 다른 기기 세션은 유지

### `GET /api/v1/auth/me` — `auth.py:124-132`
- **`Depends(get_current_user)`** · 응답 `AuthUserOut` · 에러 `401`

### `GET /api/v1/auth/{provider}/login` — `auth.py:135-169` · **`include_in_schema=False`**
- 인증 없음 · 경로 `provider` — 지원값 **`GOOGLE`·`NAVER` 2종**(`.upper()` 로 대소문자 무관)
- **307 리다이렉트** → IdP 인가 URL + **`wr_oauth_state` 쿠키(Max-Age 600초)**
- 에러 `404 NOT_FOUND "지원하지 않는 로그인 방식입니다: {provider}"`
- 🚨 **`fetch` 로 부르면 안 된다** — `window.location.href` 로 전체 페이지 이동

### `GET /api/v1/auth/{provider}/callback` — `auth.py:172-244` · **`include_in_schema=False`**
- 쿼리 `code?`, `state?`, `error?` (전부 선택)
- 성공 → `Set-Cookie: wr_session` + **`FRONTEND_BASE_URL` 루트(`/`)로 리다이렉트**
- **JSON 에러를 던지지 않는다.** 실패는 전부 `{FRONTEND_BASE_URL}/login?oauth_error=<코드>`

| `oauth_error` | 조건 | line |
|---|---|---|
| `unsupported_provider` | 미지원 provider | 189 |
| `denied` | 사용자 거부 또는 `code` 없음 | 191 |
| `state_missing` | state 쿠키 없음(10분 초과 포함) | 195 |
| `state_invalid` | state 쿠키 파싱 실패 | 199 |
| `state_mismatch` | state 불일치(CSRF 의심) | 201 |
| `upstream_failed` | IdP 네트워크/타임아웃 | 229 |
| `EMAIL_ALREADY_EXISTS` / `SOCIAL_ACCOUNT_ALREADY_LINKED` / `UPSTREAM_LLM_ERROR` | 서비스 에러코드가 그대로 실림 | 222-223 |
| `UNKNOWN_ERROR` | 코드 추출 실패 폴백 | 222 |

⚠️ **대소문자가 섞여 있다** — 앞 6개는 소문자 snake, 나머지는 SCREAMING. 매핑 테이블에 그대로 넣을 것.
→ **프론트에 `/login` 라우트가 반드시 있어야 한다.**

---

## 4. wedding — 5개

### `POST /api/v1/weddings` — `wedding.py:34-40`
- **`Depends(get_current_user)`** (온보딩 시점엔 웨딩이 없으므로)
- 바디 **`WeddingCreate`** (→ [02-schemas](02-schemas.md))
  - 교차 검증 2개: `precision=="EXACT"` 인데 `wedding_date` 없음 → 422 / `total_budget_unsure==false` 인데 `total_budget` 없음 → 422
- **201** · 응답 `WeddingOut`
- 에러 `401` · `409 WEDDING_ALREADY_EXISTS` · **`422 TOTAL_BUDGET_UNAVAILABLE`**
- **부작용** — `wedding_categories` 9행 생성 + **개인화 LLM 으로 체크리스트·타임라인 생성**
- 🚨 **앱에서 가장 느린 요청이다** → [04-ai-chat-rag](04-ai-chat-rag.md) §5

### `GET /api/v1/weddings/me` — `wedding.py:43-45`
`get_current_wedding` · 응답 `WeddingOut` · 공통 401/404

### `PATCH /api/v1/weddings/me` — `wedding.py:48-54`
- 바디 **`WeddingUpdate`**(전 필드 optional, `exclude_unset`) · 응답 `WeddingOut`
- **부작용** — 날짜 단독 변경이면 결정론적 재계산만(**빠름**), 그 외 필드 변경은 **개인화 LLM 재트리거**(느림)

### `GET /api/v1/wedding-categories` — `wedding.py:57-62`
응답 `WeddingCategoriesOut` = `{categories: WeddingCategoryOut[]}` · 공통 401/404

### `PUT /api/v1/wedding-categories` — `wedding.py:65-72`
- **`PUT`(전체 교체)** · 바디 `{categories: WeddingCategoryUpdateItem[]}`
- 에러: 공통 401/404 · `404 CATEGORY_NOT_FOUND` ·
  **`400 BUDGET_EXCEEDED`** (9개 **전체** 합 > `total_budget`, `is_active` 무관) ·
  **`400 BUDGET_BELOW_PAID`** — ⭐ **`error` 객체에 `category_code`·`min_required` 추가 필드가 온다**
  (전체 35개 중 **유일하게 extra 를 갖는 에러** — 예산 편집 UI 에서 이 값을 쓰라는 설계)
- 🆕 **개인화 재생성은 「활성 집합이 바뀔 때만」 돈다** (`services/wedding.py:322`
  `if newly_active != previously_active:`). **예산만 바꾸는 저장은 LLM 호출이 없어 빠르다** —
  S6 슬라이더 저장과 온보딩 카테고리 On/Off 는 **로딩 UX 를 다르게 가도 된다.**
  ⚠️ 카테고리를 **끄면서 `planned_budget` 을 0 으로 안 내리면** 그 값이 여전히 합산돼
  `BUDGET_EXCEEDED` 가 난다(위 검증이 `is_active` 무관이기 때문). 끌 때 예산도 함께 0 으로 보낸다.

---

### `POST /api/v1/chat/sessions/{session_id}/messages/{message_id}/feedback` (PR #55)

✅ **이제 코드 기준선에 들어왔다**(`6c29ea0`, `routers/chat.py:99-111`). 총계 **35개**의 그 1개다.
🚨 **배포본에는 여전히 없다** — 2026-08-24 재실측에서도 배포 노출은 31개로 변동이 없었다.

- 인증 **`Depends(get_current_wedding)`** — 세션·메시지 소유권을 웨딩 단위로 확인한다
- 바디 `{rating: "GOOD"|"BAD"}` · 응답 `{message_id: str, rating: "GOOD"|"BAD"}`
  ⚠️ **응답의 `message_id` 는 UUID 가 아니라 문자열**이다(`str(message.id)` — `routers/chat.py:111`)
- 에러: `401` · **`404 CHAT_MESSAGE_NOT_FOUND`**(없음·다른 세션 소속·남의 것을 구분하지 않는다)
  · **`400 CHAT_MESSAGE_NOT_RATABLE`** — `role != "assistant"` 인 메시지에 평가 시도
- **멱등적 덮어쓰기**(같은 메시지에 다시 보내면 값이 교체된다 — 마지막 값이 최종)
- `ChatMessageOut` 에 **`user_rating: "GOOD"|"BAD"|null`** 필드가 추가돼, 이력 복원 시 이전 평가가 함께 온다
  🚨 **배포본 `ChatMessageOut` 에는 이 필드가 없다**(재실측: `["id","role","content","citations","verification","created_at"]`)
  → **`user_rating` 은 optional 로 읽고 `undefined` 를 「미평가」와 같게 다룬다**
- DB 저장이 먼저, Langfuse Score 전송이 나중이다(`services/chat.py:107-131`) — 관측 실패가 사용자 평가를 되돌리지 않는다

🔑 **`POST /feedback-reports` 와 다른 기능이다. 혼동 주의.**

| | `…/feedback` (신규) | `POST /feedback-reports` (기존) |
|---|---|---|
| 성격 | 👍/👎 **간단 평가** | 🚩 **신고** |
| 값 | `GOOD`/`BAD` 2종 | `reason_category` **한글 5종** + `comment` |
| 대상 | 챗 어시스턴트 메시지만 | `CHAT_MESSAGE`·`CHECKLIST_ITEM`·`TIMELINE_ITEM` |
| 저장 | `chat_messages.user_rating` + Langfuse Score | `feedback_reports` 행 |

→ 목업의 `🚩 도움 안 됨` 은 **후자**다. 전자는 그 옆에 둘 **새 UI**이며 목업에 없다.

---

## 5. category — 1개

| `GET /api/v1/categories` | **인증 없음** | `CategoryListOut` | 에러 없음 |
|---|---|---|---|

DB 테이블이 아니라 백엔드 상수 `app/core/categories.py:32-42` 를 그대로 응답한다 → **숫자 PK 없음**.

---

## 6. budget — 7개

| 엔드포인트 | 인증 | 파라미터 | 응답 | 고유 에러 |
|---|---|---|---|---|
| `GET /payments` | wedding | `category_code?`·**`status?`(자유 문자열, 검증 없음)** | `PaymentListOut` | `404 CATEGORY_NOT_FOUND` |
| `POST /payments` | wedding | 바디 `PaymentCreate` (`amount` **gt=0**) | **201** `PaymentOut` | (CATEGORY_NOT_FOUND 는 도달 불가 방어코드) |
| `PATCH /payments/{payment_id}` | wedding | 경로 **`str`(UUID 검증 없음)** · 바디 `PaymentUpdate` | `PaymentOut` | `404 PAYMENT_NOT_FOUND` |
| `DELETE /payments/{payment_id}` | wedding | 경로 `str` | **204** 무바디 | `404 PAYMENT_NOT_FOUND` |
| `GET /payments/upcoming` | wedding | **`days: int = 30`(상·하한 검증 없음 — 음수도 통과)** | `UpcomingPaymentListOut` | — |
| `GET /benchmarks/compare` | wedding | `category_code`·`item_code`·`amount` **전부 필수** | `BenchmarkCompareOut` | `404 BENCHMARK_NOT_AVAILABLE`(2종) |
| `GET /benchmarks/total-average` | **user** | **`region_code: RegionCode`(Literal 17종 → 벗어나면 422)** | `TotalBudgetPlaceholderOut` | **`404 TOTAL_BUDGET_UNAVAILABLE`** |

⚠️ **`TOTAL_BUDGET_UNAVAILABLE` 은 같은 코드가 두 status 로 나온다** — 여기선 **404**, `POST /weddings` 에선 **422**.
→ **status 가 아니라 `code` 로 분기할 것.**
⚠️ `region_code` 검증 비대칭 — `total-average` 만 Literal 로 막고, `WeddingCreate.region_code` 는 그냥 `str` 이라
오타가 통과한 뒤 벤치마크 조회에서 404 로 터진다.
`/benchmarks/compare` 는 `region_code` 를 **요청받지 않는다** — 웨딩 프로필에서 서버가 유도한다.

---

## 7. vendor-case — 1개

| `GET /api/v1/vendor-cases` | **인증 없음** | `category_code`(필수) · `case_type?`(자유 문자열) | `VendorCaseListOut` | `404 VENDOR_CASE_NOT_AVAILABLE` |
|---|---|---|---|---|

`VENUE`·`SDM` 밖이면 404. 응답의 **`disclaimer` 는 프론트가 반드시 노출해야 하는 고지문**이다:
`"아래 사례는 여러 실제 사례를 재구성한 예시이며 특정 업체를 지칭하지 않습니다."`

---

## 8. checklist — 3개

| 엔드포인트 | 파라미터/바디 | 응답 | 고유 에러 |
|---|---|---|---|
| `GET /checklist-items` | `category_code?`·`item_type?`(자유 문자열) | `ChecklistListOut` | `404 CATEGORY_NOT_FOUND` |
| `PATCH /checklist-items/{item_id}` | 경로 `str` · 바디 `{status?, memo?}` | **`ChecklistItemPatchOut`(4필드만)** | `404 CHECKLIST_ITEM_NOT_FOUND` · **`422 INVALID_STATUS_FOR_CATEGORY`** |
| `POST /checklist-items` | 바디 `ChecklistItemCreate` | **201** `ChecklistItemOut` | — |

전부 `Depends(get_current_wedding)`.

🚨 **`INVALID_STATUS_FOR_CATEGORY`** — `HOMEWARE` 만 `LISTED/COMPARING/ORDERED/DELIVERED`,
나머지 8개는 `TODO/DOING/SKIP/DONE`. DB CHECK 제약과 서비스 검증이 이중으로 막는다.
→ **프론트도 `category_code` 에 따라 상태 선택지를 갈라야 한다.**

🆕 🚨 **`GET /checklist-items` 는 비활성 카테고리를 걸러 주지 않는다 — 타임라인과 다르다.**

| | 비활성 카테고리 항목 |
|---|---|
| `GET /timeline-items` | **제외됨** (`services/timeline.py:68`, 단 `category_code=null` 은 항상 노출) |
| `GET /checklist-items` | **그대로 나온다** (`services/checklist.py:33-46` — 필터 없음) |

`category_code` 없이 전체를 부르면 **꺼 놓은 카테고리의 체크리스트가 섞여 온다.** 온보딩 ⑦에서
카테고리를 끄면 재생성이 돌지만, 그건 `user_edited_at` 이 없는 행만 지우므로 **사용자가 한 번이라도
건드린 항목은 비활성 카테고리에도 남아 있다**(`services/personalization.py:65-80`).
→ 프론트가 `GET /wedding-categories` 의 `is_active` 로 걸러야 한다. 대시보드 진행률은 서버가
활성만 집계하므로(`routers/dashboard.py:57`) **목록과 진행률의 모수가 어긋날 수 있다.**

⚠️ PATCH 응답은 **전체 항목이 아니라 `{id, status, memo, updated_at}` 4필드뿐**이다 — 낙관적 갱신 시 주의.

---

## 9. timeline — 3개

| 엔드포인트 | 파라미터/바디 | 응답 | 고유 에러 |
|---|---|---|---|
| `GET /timeline-items` | `category_code?` | `TimelineListOut` | `404 CATEGORY_NOT_FOUND` |
| `PATCH /timeline-items/{item_id}` | 경로 `str` · 바디 `{target_date?, status?}` | `TimelineItemOut` | `404 TIMELINE_ITEM_NOT_FOUND` |
| `POST /timeline-items` | 바디 `{category_code?, title, target_date}` | **201** `TimelineItemOut` | — |

- `is_overdue` 는 **저장값이 아니라 조회 시점 서버 계산값**이다.
- **`phase_label`("D-11M" 같은 라벨)은 응답에 없다** — 컬럼 자체를 안 만들고 **프론트가 `default_dday_offset_days` 로 계산**하기로 결정됐다(2026-08-23).
- 비활성 카테고리 항목은 서버가 필터한다.

---

## 10. chat — **4개** (⚠️ 1개는 SSE)

| 엔드포인트 | 응답 |
|---|---|
| `POST /chat/sessions` | **201** `ChatSessionOut` · 바디 `{category_code?}` (**`null` = 전역 상담**) — 🚨 **배포본은 `required`, `null` 이면 422**(`08` §3.1) |
| `GET /chat/sessions/{session_id}/messages` | `ChatMessageListOut` · 경로 **`UUID`**(형식 위반 → 422) |
| `POST /chat/sessions/{session_id}/messages` | 🚨 **`text/event-stream` 스트리밍** |
| `POST /chat/sessions/{sid}/messages/{mid}/feedback` | `ChatMessageRatingOut` · 👍👎 평가 — 🚨 **배포본에 없음**(위 §4 끝) |

전부 `Depends(get_current_wedding)` + `404 CHAT_SESSION_NOT_FOUND`(없음/남의 것 구분 안 함).
평가만 메시지 단위라 `404 CHAT_MESSAGE_NOT_FOUND` 가 하나 더 붙는다.

**SSE 엔드포인트는 `response_model` 이 없다** → OpenAPI 로 페이로드를 알 수 없다.
상세 계약은 → [04-ai-chat-rag.md](04-ai-chat-rag.md) §1.

⚠️ **`GET /chat/sessions` 목록 엔드포인트가 없다** — 프론트가 session id 를 직접 보관해야 한다.

---

## 11. dashboard — 2개

| `GET /api/v1/dashboard/summary` | `DashboardSummaryOut` — **S2 화면 전체를 이 응답 하나로 그린다** |
|---|---|
| `GET /api/v1/reports/me` | `ReportOut` — **S5 마이 리포트**. upcoming 범위 **30일 고정**(쿼리로 조절 불가) |

둘 다 `get_current_wedding` · 파라미터 없음 · 공통 401/404.
`categories` 는 **`is_active=true` 만** 포함된다.

🆕 **`upcoming_items` 는 최대 5개**(`services/dashboard.py:24,56-96`). 두 소스를 합치는 규칙:
타임라인(`status='TODO'`, `target_date` 오름차순)으로 **먼저 채우고**, 남는 자리를
체크리스트(`status IN ('DOING','COMPARING','ORDERED')`, `display_order` 순)로 채운 뒤 앞 5개를 자른다.
**교차 정렬 규칙은 없다** — 날짜와 진행상태는 비교 가능한 값이 아니라서 스펙이 정하지 않았다.
즉 타임라인 TODO 가 5개 이상이면 **체크리스트 항목은 한 건도 안 나온다.**

🆕 **`remaining_budget` = `total_budget − total_paid` 다** (`routers/dashboard.py:70`).
**미지급 `planned_budget` 을 빼지 않는다.** S6 화면이 쓰는 "남은예산"(활성 미지급 planned 까지
차감)과 **정의가 다른 수**이므로, 두 화면에 같은 라벨로 그리면 사용자가 값이 어긋난다고 본다.

---

## 12. feedback — 1개

| `POST /api/v1/feedback-reports` | **201** `FeedbackReportOut` | `404 FEEDBACK_TARGET_NOT_FOUND` |
|---|---|---|

바디 `{target_type, target_id: UUID, reason_category, comment?}`.
⚠️ **`reason_category` 는 한국어 문자열 리터럴**이다 — `"부정확함" | "부적절함" | "도움안됨" | "편향/차별적" | "기타"`.
`"편향/차별적"` 은 **슬래시 포함 그대로**(정규화하지 않기로 명시적 결정).

---

## 13. personalization — 1개 · ⚠️ **배포본에 없음(404)**

### `POST /api/v1/personalization/regenerate` — `personalization.py:26-46`
- `get_current_wedding` · 바디 `{domains: ("CHECKLIST"|"TIMELINE")[]}`
  - **빈 배열 금지 · 중복 금지** → 위반 시 422
- **200**(201 아님) · 응답 `{ai_invocation_id, status, affected_domains}`
- `status` 는 **`SUCCESS`·`BLOCKED`·`FAILED` 3값 모두 200** 이고 **세 경우 모두 DB 행이 교체된다**
  → 어느 status 든 프론트는 목록을 **refetch 해야 한다**. 상세 → [04](04-ai-chat-rag.md) §5

---

## 14. 에러코드 전체 색인

`api_error(` 호출 **34건 전수** 기준(`deps.py` 3건 포함). 고유 코드 22개 + 전역 3개.

| status | code | 발생 위치 | 조건 |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | `deps.py:25,28` | 쿠키 없음 / 세션 만료·무효 |
| 401 | `INVALID_CREDENTIALS` | `services/auth.py:40` | 로그인 실패 |
| 404 | `WEDDING_NOT_FOUND` | `deps.py:42` | 로그인은 됐지만 온보딩 전 |
| 404 | `NOT_FOUND` | `routers/auth.py:143` | 미지원 OAuth provider |
| 404 | `CATEGORY_NOT_FOUND` | budget·checklist·timeline·wedding 7곳 | 잘못된 카테고리 |
| 404 | `PAYMENT_NOT_FOUND` | `budget.py:108,121` | 없음 또는 남의 것 |
| 404 | `BENCHMARK_NOT_AVAILABLE` | `budget.py:159,166` | 미제공 카테고리 / 데이터 없음 |
| 404 | `CHECKLIST_ITEM_NOT_FOUND` | `checklist.py:76` | 없음 또는 남의 것 |
| 404 | `TIMELINE_ITEM_NOT_FOUND` | `timeline.py:72` | 없음 또는 남의 것 |
| 404 | `FEEDBACK_TARGET_NOT_FOUND` | `feedback.py:27` | 신고 대상 없음 |
| 404 | `VENDOR_CASE_NOT_AVAILABLE` | `vendor_case.py:33` | VENUE·SDM 밖 |
| 404 | `CHAT_MESSAGE_NOT_FOUND` | `services/chat.py:96` | 없음·다른 세션 소속·남의 것 (구분 안 함) |
| 400 | `CHAT_MESSAGE_NOT_RATABLE` | `services/chat.py:115` | 👍👎 평가를 user 메시지에 시도 |
| 404 | `CHAT_SESSION_NOT_FOUND` | `services/chat.py:74` | 없음 또는 남의 것 |
| **404 / 422** | `TOTAL_BUDGET_UNAVAILABLE` ⚠️ | `budget.py:197` = 404 · `services/wedding.py:70` = 422 | **code 로 분기할 것** |
| 409 | `EMAIL_ALREADY_EXISTS` | `services/auth.py:32`, `oauth.py:155` | 이메일 중복 |
| 409 | `SOCIAL_ACCOUNT_ALREADY_LINKED` | `services/oauth.py:131` | 다른 방식으로 이미 가입 |
| 409 | `WEDDING_ALREADY_EXISTS` | `services/wedding.py:85,119` | 웨딩 중복 생성 |
| 422 | `INVALID_STATUS_FOR_CATEGORY` | `checklist.py:80` | HOMEWARE 상태값 불일치 |
| 400 | `BUDGET_EXCEEDED` | `services/wedding.py:300` | 배정 합 > 총예산 |
| 400 | `BUDGET_BELOW_PAID` ⭐ | `services/wedding.py:309` | **`category_code`·`min_required` extra 포함** |
| 502 | `UPSTREAM_LLM_ERROR` | `services/oauth.py:67` | IdP 토큰 응답 이상 (**OAuth 인데 코드명이 LLM** — 코드 재사용) |
| 422 | `VALIDATION_ERROR` | `main.py:88` 전역 | 모든 Pydantic 검증 실패 |
| (원 status) | `INTERNAL_ERROR` | `main.py:76` 전역 | 포맷 밖 `HTTPException` |
| **SSE** | `RATE_LIMITED` · `UPSTREAM_LLM_ERROR` | `services/chat.py:226,229` | **HTTP 상태가 아니라 `event: error`** |

---

## 15. 프론트가 특히 주의할 점

1. **인증은 쿠키다.** `Authorization` 헤더를 읽는 코드가 **한 줄도 없다**. `credentials: "include"` 없이는 **35개 중 27개**가 401/404.
2. **`id` 경로 파라미터의 타입 검증이 제각각이다** — `payment_id`·`item_id` 는 `str` 이라 형식 오류가 **404** 로 오고, `session_id` 는 `UUID` 라 **422** 로 온다.
3. **자유 문자열 쿼리는 오타를 알려주지 않는다** — `GET /payments` 의 `status`, `/vendor-cases` 의 `case_type` 은 검증이 없어 **에러 없이 빈 목록**이 온다.
4. **`POST /auth/signup` 의 `has_wedding` 은 신뢰하지 말 것**(항상 false). `login`·`me` 만 실제값.
5. **OAuth 2개는 OpenAPI 에 없다** — 생성 클라이언트에 안 나온다. `fetch` 금지, 전체 페이지 이동.
6. **`BUDGET_BELOW_PAID` 만 extra 필드**를 준다 — 예산 UI 가 "최소 얼마까지 낮출 수 있는지"를 그릴 수 있다.
