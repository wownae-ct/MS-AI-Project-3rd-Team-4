# API 계약 — 프론트가 부르는 것

> **성격** 적용 설계. **프론트가 실제로 호출하는 엔드포인트와 필드만** 담는다. 백엔드 API 전수 문서가 아니다.
> **왜 전수가 아닌가** 전수를 옮기면 백엔드 문서의 드리프트 책임을 통째로 지게 된다. 화면이 쓰지 않는 계약은 **백엔드의 OpenAPI가 정본**이다.
> **결정 근거** [ADR 0007](../adr/0007-백엔드-연동-아키텍처를-확정한다.md) · **짝 문서** [backend-integration.md](backend-integration.md) · [chat-streaming.md](chat-streaming.md)
> **최종 갱신** 2026-08-25 · 백엔드 기준 커밋 **`474800c`** (계약 표면은 `faf91b8` 대비 무변경 — 바뀐 것은 개인화 프롬프트뿐)
>
> ⚠️ **여기 적힌 값은 관측 시점의 사실이지 보증이 아니다.** 갱신 절차는 §6.

---

## 1. 공통 계약

| 항목 | 값 |
|---|---|
| 경로 프리픽스 | **`/api/v1`** — 모든 경로에 붙는다. `API_BASE`에는 넣지 않는다 |
| 필드 표기 | **snake_case** — 별칭·직렬화 별칭이 0건이라 **파이썬 필드명이 곧 JSON 키**다. camelCase 변환 없음 |
| 금액 | **예외 없이 정수(원 단위)** — `Decimal`·`float` 금액 0건. TS `number`로 안전 |
| 비율 | `float` 3곳뿐 — `ratio_to_median` · `progress_rate` 2곳 |
| 에러 바디 | `{"error": {"code", "message", ...extra}}` |
| 인증 | **쿠키 세션** — `Authorization` 헤더를 읽는 코드가 한 줄도 없다 |

### 1.1 인증 분포 — 가장 중요한 표

| 의존성 | 개수 | 무엇 |
|---|---|---|
| **없음** | 8 | `/health` · `/auth/signup` · `/auth/login` · `/auth/logout` · OAuth 2개 · `/categories` · `/vendor-cases` |
| 로그인 필요 | 3 | `GET /auth/me` · `POST /weddings` · `GET /benchmarks/total-average` |
| **로그인 + 웨딩 필요** | 25 | 나머지 전부 |

**로그인·온보딩 없이 쓸 수 있는 데이터 API는 `/categories`와 `/vendor-cases` 둘뿐이다.**

「웨딩 필요」 엔드포인트는 **401과 404를 둘 다 던진다** — 세션이 없으면 401, 세션은 있는데 웨딩이 없으면 `404 WEDDING_NOT_FOUND`. 백엔드 주석이 프론트 분기까지 지정해 뒀다: 401 → 로그인, `WEDDING_NOT_FOUND` → 온보딩.

**`wedding_id`를 URL·바디로 받는 엔드포인트는 하나도 없다.** 항상 세션에서 서버가 유도한다 — 프론트가 웨딩 id를 들고 다닐 필요가 없다.

### 1.2 CORS

허용 오리진은 **`http://localhost:5173` 정확히 하나** + 배포 프론트 정규식. `allow_credentials=true`.

→ **dev 서버는 반드시 `localhost`로 띄운다.** `127.0.0.1`로 띄우면 CORS에서 차단된다.
(`vite preview`는 반대로 `--host 127.0.0.1`이 필요하다 — 두 규칙이 방향이 반대다.)

---

## 2. 계약 어휘 — `shared/api/contract.ts`

백엔드 Literal의 **사본**이다. 드리프트 책임은 §6.

| 타입 | 값 | 주의 |
|---|---|---|
| **`CategoryCode`** (9) | `MEETING` `VENUE` `SDM` `GIFT` `HOMEWARE` `INVITATION` `HONEYMOON` `HOMENEW` `ETC` | 7 → 9로 늘어난 이력이 있다 |
| `BenchmarkCategoryCode` (2) | `VENUE` `SDM` | 벤치마크는 이 둘만 |
| **`RegionCode`** (17) | `SEOUL_GANGNAM` `SEOUL_OTHER` `BUSAN` `INCHEON` `DAEGU` `DAEJEON` `GWANGJU` `ULSAN` `GYEONGGI` `CHUNGCHEONG` `JEOLLA` `GYEONGSANG` `GANGWON` `JEJU` `NATIONWIDE` `METRO` `NON_METRO` | 세분 14 + 집계 폴백 3 |
| `CategoryTier` | `FOCUS` `MOCKUP` | |
| `SourceTier` | `OFFICIAL` `NEWS` `INDUSTRY` `CONSENSUS` | 인용 배지 |
| `ItemType` | `CONTRACT_TERM` `EXTRA_COST` `PREP` | |
| `Origin` | `LLM` `USER` | ⚠️ §5.6 |
| `GeneralChecklistStatus` | `TODO` `DOING` `SKIP` `DONE` | |
| `HomewareChecklistStatus` | `LISTED` `COMPARING` `ORDERED` `DELIVERED` | |
| **`ChecklistStatus`** | 위 둘의 **합집합 8값** | 🚨 §5.4 |
| `PaymentType` | `DEPOSIT` `INTERIM` `BALANCE` `ETC` | |
| `PaymentStatus` | `PLANNED` `PAID` `CANCELED` | |
| `MilestoneStatus` | `TODO` `DONE` | 타임라인 |
| `CaseType` | `GOOD` `BAD` | |
| `Verdict` | `SUPPORTED` `WEAK` `GENERAL` `OUT_OF_SCOPE` | 상담 신뢰도. `OUT_OF_SCOPE`는 3 → 4로 늘어난 값(2026-08-29) |
| **`ChatRole`** | `user` `assistant` | ⚠️ **소문자** |
| `ChatRating` | `GOOD` `BAD` | |
| **`ChatStage`** | `retrieve` `generate` `verify` | ⚠️ **소문자** |
| `FeedbackTargetType` | `CHAT_MESSAGE` `CHECKLIST_ITEM` `TIMELINE_ITEM` | |
| **`FeedbackReasonCategory`** | `부정확함` `부적절함` `도움안됨` `편향/차별적` `기타` | ⚠️ **한국어 · 슬래시 포함 원문 그대로** |
| `FeedbackStatus` | `OPEN` `REVIEWED` `RESOLVED` | |
| `PersonalizationDomain` | `CHECKLIST` `TIMELINE` | |
| `DatePrecision` | `EXACT` 외 4값 · **「올해 상반기」에 해당하는 값이 없다** | 🚨 §5.7 |

---

## 3. 화면별 엔드포인트

### 3.1 인증 · 온보딩 (`/login` · S1)

| 메서드 · 경로 | 요청 | 응답 |
|---|---|---|
| `POST /auth/signup` | `{email, password(≥8), display_name}` — **`display_name` 필수** | 201 + 쿠키 · `{id, email, display_name, has_wedding}` |
| `POST /auth/login` | `{email, password}` (길이 제약 없음) | 200 + 쿠키 · 같은 모양 |
| `POST /auth/logout` | — (쿠키 없어도 성공) | 204 무바디 |
| `GET /auth/me` | — | 같은 모양 |
| `GET /auth/{provider}/login` | 경로 `provider` = `google` \| `naver` | **307** — `window.location.href`로만 |
| `GET /auth/{provider}/callback` | 백엔드가 처리 | 프론트 `/` 또는 `/login?oauth_error=…` |
| `POST /weddings` | `WeddingCreate` | 201 · `WeddingOut` |
| `GET /wedding-categories` · `PUT /wedding-categories` | 카테고리 on/off · 예산 배정 | |
| `GET /benchmarks/total-average?region_code=` | **`RegionCode` Literal 강제** (벗어나면 422) | 온보딩 예산 슬라이더 플레이스홀더 |

🚨 **`signup` 응답의 `has_wedding`은 항상 `false` 하드코딩이다.** 신뢰할 값은 `login`·`me`뿐이다.
🚨 **로그인 실패는 이메일 없음/비번 틀림을 의도적으로 구분하지 않는다** (`401 INVALID_CREDENTIALS` 하나).

### 3.2 S2 대시보드

| `GET /dashboard/summary` | 파라미터 없음 |
|---|---|

**이 응답 하나로 화면 전체를 그린다.**

- `wedding_date`(non-null) · `d_day` · `total_budget` · `total_paid` · `total_planned` · `remaining_budget` (전부 int)
- `categories[]` — **`is_active=true`만** 포함. 각 항목에 `progress_rate: float`
- `upcoming_items[]` — **최대 5개**. `source: "timeline" | "checklist"` **판별 유니온**

🚨 **`upcoming_items`는 `source`에 따라 채워지는 필드가 다르다.** `timeline` → `target_date`/`d_day`, `checklist` → `status`. **TS에서 discriminated union으로 모델링한다.** 하나의 옵셔널 덩어리로 만들면 화면이 조용히 빈칸을 그린다.

🚨 **`remaining_budget = total_budget − total_paid`다.** 미지급 `planned_budget`을 빼지 않는다. S6이 쓰는 「남은예산」과 **정의가 다른 수**이므로 **두 화면에 같은 라벨로 그리면 안 된다.**

🚨 **`upcoming_items` 합성 규칙에 교차 정렬이 없다** — 타임라인을 먼저 채우고 남는 자리를 체크리스트로 채운다. **타임라인 항목이 5개 이상이면 체크리스트는 한 건도 안 나온다.**

### 3.3 S4 예산 · 납부

| 메서드 · 경로 | 주의 |
|---|---|
| `GET /payments` | `status`는 **자유 문자열이라 검증이 없다** — 오타를 내면 에러 없이 **빈 목록**이 온다 |
| `POST /payments` | `amount > 0`. **`paid_date`·`receipt_url`을 받는다**(영수증 자동채움용) |
| **`POST /payments/receipt-extract`** | **multipart** — [backend-integration.md](backend-integration.md) §1.2 #5 |
| `PATCH /payments/{id}` · `DELETE /payments/{id}` | 경로 파라미터가 `str`이라 형식 오류가 **404**로 온다(422 아님) |
| `GET /payments/upcoming?days=30` | **상·하한 검증이 없다** — 음수도 통과 |
| `GET /benchmarks/compare` | `category_code`·`item_code`·`amount` 전부 필수. `region_code`는 **받지 않는다**(웨딩에서 유도) |

**영수증 OCR 흐름** — 업로드 → Blob 저장 + vision 추출 → **DB 반영 없음** → 프론트가 폼을 프리필 → 사용자 확인 → `POST /payments`.

응답 `ReceiptExtractOut`: `item_name` · `vendor_name` · `amount` · `paid_date`는 **읽지 못했으면 null**이고, **`receipt_url`만 항상 값이 있다**(업로드는 추출 성공 여부와 무관하게 먼저 끝난다). `category_code`는 **주지 않는다** — 상호명만으로 카테고리를 신뢰할 수 없어 사용자가 직접 고른다.

제약: 허용 형식 `image/jpeg` `image/png` `image/webp` `image/heic` · 최대 **15 MB** · 위반 시 422 (`UNSUPPORTED_RECEIPT_TYPE` · `RECEIPT_TOO_LARGE`).

### 3.4 체크리스트 · 타임라인

| `GET /checklist-items` | `PATCH /checklist-items/{id}` | `POST /checklist-items` |
|---|---|---|
| `GET /timeline-items` | `PATCH /timeline-items/{id}` | `POST /timeline-items` |

🚨 **두 목록의 필터링 동작이 다르다.**

| | 비활성 카테고리 항목 |
|---|---|
| `GET /timeline-items` | **제외된다** (단 카테고리 없는 항목은 항상 노출) |
| `GET /checklist-items` | **그대로 나온다** — 필터가 없다 |

→ 체크리스트는 **프론트가 `GET /wedding-categories`의 `is_active`로 걸러야 한다.** 대시보드 진행률은 서버가 활성만 집계하므로, 거르지 않으면 **목록과 진행률의 모수가 어긋난다.**

⚠️ **체크리스트 PATCH 응답은 전체가 아니라 4필드뿐**이다(`id` · `status` · `memo` · `updated_at`). 낙관적 갱신 시 나머지 필드를 응답에서 덮어쓰면 지워진다.

⚠️ **타임라인의 `is_overdue`는 저장값이 아니라 조회 시점 계산값**이다. 클라이언트에서 캐시해 두고 재사용하면 날짜가 지나도 안 바뀐다.
⚠️ **`phase_label`(「D-11M」 같은 라벨)은 응답에 없다.** 프론트가 계산한다.

### 3.5 S5 리포트

| `GET /reports/me` | upcoming 범위 **30일 고정** (쿼리로 조절 불가) |
|---|---|

`budget_summary`에는 **`total_planned`이 없다** — 대시보드 응답과 겹치지만 다른 스키마다. **공용 타입으로 합치지 않는다.**

### 3.6 S3 상담

| `POST /chat/sessions` | `{category_code?}` — **`null`이면 전역 상담** |
|---|---|
| `GET /chat/sessions/{id}/messages` | 경로가 **UUID 형식 검증**이라 형식 오류가 **422** |
| `POST /chat/sessions/{id}/messages` | 🚨 **SSE** → [chat-streaming.md](chat-streaming.md) |
| `POST /chat/sessions/{sid}/messages/{mid}/feedback` | 평가 |

🚨 **세션 목록 엔드포인트가 없다.** 프론트가 session id를 직접 보관해야 한다.

### 3.7 기타

| `GET /categories` | 인증 없음 · DB가 아니라 백엔드 상수 → **숫자 PK 없다** |
|---|---|
| `GET /vendor-cases?category_code=` | 인증 없음 · `VENUE`·`SDM` 밖이면 404 · **응답의 `disclaimer`를 반드시 노출한다** |
| `POST /feedback-reports` | `reason_category`가 **한국어 리터럴** |
| `POST /personalization/regenerate` | `{domains: [...]}` — 빈 배열·중복 금지(422) |

⚠️ **개인화 재생성은 `SUCCESS`·`BLOCKED`·`FAILED` **세 status 모두 200**이고 **세 경우 모두 DB 행이 교체된다.** → **어느 status든 목록을 refetch한다.** `BLOCKED`/`FAILED`는 실패가 아니라 「폴백으로 교체됨」이다.

---

## 4. 에러 코드 — 프론트가 분기하는 것

| status | code | 분기 |
|---|---|---|
| 401 | `UNAUTHORIZED` | → `/login` (가드가 처리) |
| 401 | `INVALID_CREDENTIALS` | 로그인 폼에 표시 |
| 404 | `WEDDING_NOT_FOUND` | → `/onboarding` (가드가 처리) |
| 409 | `EMAIL_ALREADY_EXISTS` | 가입 폼에 표시 |
| 409 | `SOCIAL_ACCOUNT_ALREADY_LINKED` | 로그인 폼에 표시 |
| 409 | `WEDDING_ALREADY_EXISTS` | 온보딩 재진입 — `/`로 되돌린다 |
| 400 | `BUDGET_EXCEEDED` | 배정 합 > 총예산 |
| 400 | **`BUDGET_BELOW_PAID`** ⭐ | **`category_code`·`min_required`를 extra로 준다** — 「최소 얼마까지 낮출 수 있는지」를 UI에 그릴 수 있는 **유일한 에러** |
| 422 | `INVALID_STATUS_FOR_CATEGORY` | §5.4 |
| **404 / 422** | `TOTAL_BUDGET_UNAVAILABLE` | 🚨 **같은 코드가 두 status로 온다 — `code`로 분기한다** |
| 422 | `VALIDATION_ERROR` | 전역. **`message`가 영어일 수 있다** — 그대로 노출하지 않는다 |
| — | `INTERNAL_ERROR` | 포맷 밖 예외를 감싼 것. `code`가 의미 없다 |

---

## 5. 🚨 TS로 옮길 때 반드시 볼 7가지

### 5.1 `X | None`과 `X | None = None`은 다르다

| 백엔드 | JSON | TS |
|---|---|---|
| 기본값 **없음** | 키가 **항상 존재**, 값이 null일 수 있음 | `field: T \| null` |
| 기본값 `None` | 키가 **빠질 수 있음** | `field?: T \| null` |

응답 스키마는 대체로 전자, 요청 스키마는 후자다. **전부 옵셔널로 만들면 응답에서 없는 키를 기다리게 된다.**

### 5.2 id 타입이 갈린다

대부분 UUID 문자열이지만 — 상담 메시지 id는 `str`, 인용의 `chunk_id`는 **`int`**, 업체사례 `id`도 **`int`**다. `auth`만 UUID 형식까지 검증한다.

### 5.3 `date`와 `datetime`을 섞지 않는다

ISO 타임스탬프는 5곳뿐이고 **나머지 날짜는 전부 `YYYY-MM-DD`**다(`wedding_date` · `target_date` · `due_date` · `paid_date` · `survey_month`).

🚨 **`new Date("2026-08-24")`로 파싱하면 UTC 자정으로 해석돼 타임존 오프셋 버그가 난다.** 날짜 전용 파서를 쓰거나 문자열로 다룬다.

### 5.4 `ChecklistStatus`는 타입만으로 검증되지 않는다

합집합 8값이지만 실제 유효성은 **카테고리에 달려 있다** — `HOMEWARE`는 `LISTED/COMPARING/ORDERED/DELIVERED`, 나머지 8개 카테고리는 `TODO/DOING/SKIP/DONE`. 위반하면 `422 INVALID_STATUS_FOR_CATEGORY`.

→ **프론트도 `category_code`에 따라 상태 선택지를 갈라야 한다.** 타입 시스템은 이걸 못 막는다.

### 5.5 Literal로 안 묶인 자유 문자열을 유니온으로 좁히지 않는다

`priority` · 대시보드 `upcoming_items[].status` · 개인화 `status`/`affected_domains` · `region_code`(웨딩 쪽) · `receipt_url` · `contact_phone`.

**프론트에서 유니온으로 좁히면 백엔드가 지키지 않는 계약을 짊어지게 된다.** 넓게 받고 런타임에 좁힌다.

### 5.6 `origin`으로 「AI 추천」을 구분할 수 없다

타임라인 항목은 LLM 생성분과 카탈로그 폴백분이 **둘 다 `origin="LLM"`**이고, 응답에 출처를 구분할 필드가 없다. **타임라인에 「AI 추천」 배지를 달 수 없다.** 체크리스트만 구분 가능하다.

### 5.7 「올해 하반기」 날짜 결함 — 프론트가 흡수한다

`DatePrecision`에 「올해 상반기」가 없어 "올해"를 고르는 유일한 값이 **「올해 하반기」**인데, 백엔드가 이 값을 **조건 없이 10월 1일로 환산**한다. **10월 2일 이후에 고르면 D-day가 음수로 시작하고**, 타임라인 항목이 전부 기한 초과로 잡힌다.

**프론트가 API 두 번으로 해결한다.**

```
과거가 되지 않는 시기  → POST /weddings 를 그대로 (1회)
과거가 되는 시기       → ① POST /weddings 를 EXACT + 계산한 대표일로
                        ② PATCH /weddings/me 로 정밀도만 되돌린다 (날짜는 유지된다)
```

이 순서인 이유: `POST`(근사) → `PATCH`(날짜) 순서로 하면 **`POST` 시점의 파생 데이터가 과거 날짜로 먼저 생성**되어 항목들이 전부 완료로 오기록된다. `EXACT`를 먼저 보내면 처음부터 맞는 날짜로 생성된다.

**이 우회는 서버 계약 3가지에 기댄다** — ① 근사 정밀도면 클라이언트 날짜를 덮어쓴다 ② `EXACT`면 보낸 날짜를 보존한다 ③ `PATCH`는 보낸 필드만 반영하므로 정밀도만 보내면 날짜가 재계산되지 않는다. **이 세 가지를 계약 테스트로 고정한다**(§6). 백엔드가 근본 수정을 하면 이 2단계는 무해하게 남는다.

**`PATCH`가 실패하면** 정밀도가 `EXACT`로 남아 화면이 근사 라벨 대신 정확한 날짜를 그린다. 1회 재시도하고, 실패하면 설정에서 고치도록 안내한다 — **데이터는 미래 날짜라 D-day는 정상**이다.

---

## 6. 드리프트 감지

`shared/api/contract.ts`는 백엔드 Literal의 **사본**이고, 백엔드는 빠르게 움직인다. **반드시 낡는다.**

### 6.1 게이트

```bash
node scripts/check-api-contract.mjs    # 백엔드 openapi.json ↔ contract.ts 대조
```

- 대상은 **프론트가 부르는 엔드포인트와 필드만**
- **CI 필수로 만들지 않는다** — 백엔드가 안 떠 있을 수 있다. 선택 실행 + 결과를 이 문서에 기록
- 픽스처는 `contract.ts`의 타입을 `satisfies`로 만족시키고 값 목록은 contract에서 **파생**시킨다 → 픽스처가 계약을 벗어나면 **`npm run typecheck`가 먼저 실패**한다

### 6.2 🚨 OpenAPI로는 잡히지 않는 것 3종

| 무엇 | 왜 안 잡히나 | 어떻게 지키나 |
|---|---|---|
| **인증 요구** | `securitySchemes`가 **아예 없다.** 쿠키를 의존성 안에서 직접 읽어 스펙에 인증 정보가 하나도 안 나타난다 | §1.1 표를 수기로 유지 + 401/404 경로 테스트 |
| **OAuth 2개** | 스키마에서 제외돼 있어 스펙에 존재하지 않는다 | 수기 계약(§3.1) |
| **SSE 페이로드** | 응답 모델이 없어 스펙에 이벤트가 없다 | [chat-streaming.md](chat-streaming.md) + 파서 테스트 |

**→ OpenAPI로 클라이언트를 생성하지 않는다.** 생성하면 인증이 필요한 25개 엔드포인트를 「인증 불필요」로 만들고, 소셜 로그인과 상담 스트림은 아예 없는 것처럼 취급한다.

### 6.3 「엔드포인트 수가 같다」는 「계약이 같다」가 아니다

스키마만 바뀌거나 스트림 이벤트만 바뀌는 변경은 **개수에 잡히지 않는다.** 응답 필드가 늘거나, 필수 필드가 nullable로 바뀌거나, 프롬프트가 바뀌어 **내용만 달라지는** 경우가 실제로 있었다. **개수 비교는 최소 검사이지 충분 검사가 아니다.**

### 6.4 배포본과 코드는 다르다

「코드에 있다」와 「호출된다」를 따로 센다. 배포가 늦으면 **코드에만 있는 엔드포인트가 404**를 내고, 스트림 이벤트는 **오지 않는다.**

→ **새 계약은 「안 와도 동작하게」 짠다.** 없으면 기능이 조금 덜 친절할 뿐이어야 하고, 없어서 화면이 깨지면 안 된다.
