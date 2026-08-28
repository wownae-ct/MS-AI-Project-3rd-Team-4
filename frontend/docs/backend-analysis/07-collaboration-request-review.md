# 협업 요청 문서 교차검증 — `FRONTEND_COLLABORATION_REQUEST.md`

> **대상** 백엔드 작성자가 2026-08-24 에 전달한 `FRONTEND_COLLABORATION_REQUEST.md` (403줄)
> 🆕 **더 새 판본이 도착했다** — **448줄 개정판 + 문서 4종 + 목업**이 들어왔다(2026-08-24 21:07, PR #57 머지 이후).
> 🔍 **경로 확정(2026-08-25)**: `docs/backend_req_info/` — 처음 도착한 `docs/backend-request-to-frontend/` 및
> `branchs/backup/backend-request-to-frontend/` 와 **6개 파일 전부 바이트 동일**(cmp 실측). 아래 §8 의 인용·줄 번호는 그대로 유효하다. **그쪽이 정본이고 이 문서가 대조한 403줄본은 구판이다.**
> 새 전달본 전체 교차검증은 **§8** — 아래 §1~§7 의 교정 중 **§1-1 은 새 판본에서도 그대로 재발**했다.
> **방법** 백엔드 소스 전수 대조(`branchs/backend_jy` · 브랜치 `backend` · `origin/backend` **`6c29ea0`**) + staging 배포본 HTTP 재실측
> **재실측 시각** 2026-08-24 (README §3 의 1차 실측 이후 **2차** 재측정 — 소스는 16커밋 움직였고 배포본은 그대로였다)
> 🔍 **4차 점검(2026-08-25)** — 코드 6c29ea0 대비 팩트체크. 수정 25건 / 미검증 1건. 상세는 README 「4차 점검 이력」.
> **결론** 문서의 큰 그림은 맞다. 다만 **구현을 가르는 지점 17곳이 틀렸거나 빠졌다** — 그중 3건은
> 그대로 따르면 화면이 동작하지 않는다.

---

## 0. 먼저 — 이 문서를 왜 따로 두는가

협업 요청 문서는 **백엔드 작성자의 시점**에서 쓰였고, 이 저장소의 `01`~`06` 분석 문서는 **프론트가
소스를 직접 읽어** 쓴 것이다. 두 문서가 어긋날 때 **소스와 배포본 실측이 이긴다** — 아래 교정은
전부 `file:line` 또는 HTTP 응답으로 뒷받침된다.

교차검증 결과 **`01`~`06` 은 고칠 것이 거의 없었다.** 이미 맞게 적혀 있었다 —
`BUDGET_EXCEEDED` 의 비활성 포함 합산(`01:149`), `RegionCode` 17종(`02:34`),
`404`/`422` 구분(`01:210`), `verdict` 3종(`04:50`), `oauth_error` 9종(`01:110-118`),
슬라이딩 만료 없음(`05:49`) 전부 있었다. **바뀐 것은 협업 요청 문서 쪽이다.**

---

## 1. 🚨 그대로 따르면 화면이 안 도는 것 — 3건

### 1-1. `credentials: "include"` 만 붙이면 된다 → **아니다** (문서 §3-1)

문서 원문:

> *"모든 API 호출에 `fetch(..., { credentials: "include" })` … **필수**입니다. 안 붙이면 로그인
> 후에도 계속 401이 납니다."*

같은 절이 바로 위에서 `SameSite=Lax` 라고 **스스로 적어 놓고도**, 붙이기만 하면 해결되는 것처럼
읽힌다. **붙여도 안 된다.**

```python
# backend/app/routers/auth.py:49-58
def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,   # wr_session
        value=token, httponly=True, secure=True,
        samesite="lax",                      # ← 여기
        max_age=settings.session_ttl_days * 24 * 60 * 60,
    )
```

프론트(SWA · `localhost:5173`)와 백엔드(`*.nip.io`)는 **cross-site** 라, MDN 이 명시하듯 Lax 쿠키는
`fetch()` 서브리퀘스트에서 **제외**된다. CORS 프리플라이트가 전부 200 이어도, `credentials:"include"`
를 넣어도, 브라우저가 쿠키를 붙이는 단계 자체를 건너뛴다. 상세·근거는 [`05-auth-cors-deploy.md` §3.3](05-auth-cors-deploy.md).

**필요한 수정은 백엔드 1줄** — `samesite="lax"` → `"none"` (이미 `secure=True` 라 조건 충족).

> **🆕 함께 고쳐야 할 곳이 하나 더 있다 (이번 검증에서 발견).**
> `routers/auth.py:121` 의 로그아웃은 `response.delete_cookie(key=...)` 를 **인자 없이** 부른다.
> Starlette 기본값이 `secure=False`, `samesite="lax"` 라(설치본 starlette 1.6.0 `Response.delete_cookie` 시그니처로 확인), 배포본 실측 헤더가 실제로 이렇게 나온다:
>
> ```
> HTTP/1.1 204 No Content
> set-cookie: wr_session=""; expires=…; Max-Age=0; Path=/; SameSite=lax
> ```
>
> (`Secure` 가 없다.) 세션 쿠키를 `SameSite=None; Secure` 로 바꾸면 **삭제 쿠키만 속성이 어긋난 채
> 남는다.** 같은 커밋에서 `delete_cookie(key=..., secure=True, samesite="none")` 로 맞출 것.

### 1-2. `POST /auth/signup` 은 `display_name` 이 **필수**다 (문서 §S0)

문서의 S0 설명은 "이메일/비밀번호 로그인·회원가입 탭 전환 UI" 뿐이고 목업에도 입력 칸이 없다.
그러나 스키마에 기본값이 없다:

```python
# backend/app/schemas/auth.py
class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)   # ← 서버가 강제하는 유일한 비밀번호 규칙
    display_name: str                     # ← 기본값 없음 = 필수
```

**목업대로 만들면 가입이 전부 422 로 실패한다.** 문서 §9 의 "S1 폼 검증 규칙 미정"은 **S0 까지
포함**하도록 넓혀야 하고, 최소한 `password ≥ 8` 은 이미 서버가 정해 둔 값이라 미정이 아니다.

### 1-3. S6 예산 공식이 서버 검증과 어긋난다 (문서 §S6)

문서 공식:

```
남은예산 = total_budget − Σ(카테고리별 paid_amount) − Σ(활성 카테고리 미지급 planned_budget)
```

그런데 서버의 `BUDGET_EXCEEDED` 검증은 **비활성 포함 9개 전체**를 합산한다:

```python
# backend/app/services/wedding.py:297-300
total_planned = sum(row.planned_budget for row in existing_by_code.values())  # is_active 무관
if total_planned > wedding.total_budget:
    raise api_error(400, "BUDGET_EXCEEDED", …)
```

**귀결** — 카테고리를 끄면서 `planned_budget` 을 0으로 내리지 않으면, 클라이언트 계산은 통과인데
서버가 400 을 낸다. **끌 때 예산도 함께 0으로 보내야 한다.**

> **같은 이름 다른 뜻 주의** — `GET /dashboard/summary.remaining_budget` 은
> `total_budget − total_paid` 다(`routers/dashboard.py:70`). **미지급 planned 를 빼지 않는다.**
> S6 화면의 "남은예산"과 대시보드의 "남은예산"은 **다른 수**다. 둘을 같은 컴포넌트로 그리면 안 된다.

---

## 2. 사실오류 — 값이 틀린 것

| # | 문서 위치 | 문서 주장 | 실측 | 근거 |
|---|---|---|---|---|
| 1 | §2 | "33개 엔드포인트 **전부 구현·배포 완료**" | 배포본 OpenAPI **31** + OAuth 2 = 33. 코드는 **33**+2 = 35 → **`POST /personalization/regenerate` · `POST …/messages/{mid}/feedback` 2건 미배포(404)** | 2026-08-24 재실측(코드 수치는 `app.openapi()` 로 26 paths/33 ops 재확인). 403줄본 §5 API 표에는 둘 다 없어 **당시 프론트 스코프에는 영향 없음** |
| 2 | §S1(§5 표는 `422/404` 병기, 어느 쪽이 어느 엔드포인트인지 없음) | `TOTAL_BUDGET_UNAVAILABLE` = **422** | **엔드포인트마다 다르다.** `GET /benchmarks/total-average` → **404** · `POST /weddings` → **422** | `routers/budget.py:198-199` vs `services/wedding.py:71-72`. §S1 문맥(지역 선택 시 조회)은 **404** 쪽 |
| 3 | §3-2 | `oauth_error` 코드 5종 | **9종** — 누락 `state_mismatch` · `upstream_failed` · `EMAIL_ALREADY_EXISTS` · `UNKNOWN_ERROR` | `routers/auth.py:189-229`. 소문자/대문자가 **혼재**하므로 대소문자 구분 없이 매칭할 것 |
| 4 | §4 챗 | SSE 예시 `"message_id":"msg2"` | **UUID 문자열** (`str(assistant_message.id)`) | `services/chat.py:277`. `POST /feedback-reports.target_id` 가 `UUID` 타입이라 그대로 전달 가능 |
| 5 | §4 챗 | `verdict` = `SUPPORTED` / `GENERAL` | **3종** — **`WEAK` 누락** | `schemas/common.py` `Verdict` |
| 6 | §6-1 | `PUT /wedding-categories` 는 LLM 재생성을 **동기로 기다린다** | **활성 집합이 바뀔 때만.** 예산만 바꾸면 LLM 호출 자체가 없다 | `services/wedding.py:322` `if newly_active != previously_active:`. **S6 저장은 빠르다** — 로딩 UX 를 온보딩과 다르게 가도 된다 |

---

## 3. 누락 — 있어야 하는데 없는 것

| # | 주제 | 빠진 사실 | 근거 |
|---|---|---|---|
| 7 | §4 챗 error | `error` 이벤트의 `code` 는 **2종뿐** — `RATE_LIMITED` · `UPSTREAM_LLM_ERROR` | `services/chat.py:226,229` |
| 8 | §4 챗 error | **error 경로에서 어시스턴트 메시지가 저장되지 않는다.** 사용자 메시지는 이미 커밋돼 있어, 탭 재진입 시 **답이 없는 user 메시지**가 남는다 | `services/chat.py:162-163`(user 메시지 커밋) · `:226-230`(`return` 으로 스트림 종료, DB 기록 없음) |
| 9 | §4 챗 | `POST /chat/sessions` 의 `category_code` 는 **nullable** — `null` = 전역 상담 | `schemas/chat.py`. ⚠️ 프론트 `layout.md` 의 하단 탭바 4개(홈·타임라인·예산·리포트)에 **진입점이 없다** → §5 미결정 |
| 10 | §S3 체크리스트 | **`GET /checklist-items` 는 비활성 카테고리를 걸러 주지 않는다.** 타임라인은 거른다 | `services/timeline.py:84` 는 필터 있음 · `services/checklist.py:33-45` 는 없음. **프론트가 걸러야 한다** |
| 11 | §S1 온보딩 | 예산 미정 토글 외에 **하객수 미정(`guest_count_unsure`)** 도 있다 | `schemas/wedding.py` |
| 12 | §S1 온보딩 | 근사 날짜의 **서버 대표값 규칙** — `APPROX_H2_THIS_YEAR`=10/1 · `APPROX_H1_NEXT_YEAR`=익년 3/15 · `APPROX_H2_NEXT_YEAR`=익년 9/15 · `NO_PLAN`=오늘+18개월 1일 | `services/wedding.py:49-60` |
| 13 | §S4 타임라인 | **`default_dday_offset_days` 는 nullable** — USER 추가 항목은 `null` 이다. `phase_label` 공식이 null 을 다뤄야 한다 | `schemas/timeline.py` |
| 14 | §S2 대시보드 | `upcoming_items` 는 **최대 5개**. 타임라인(`target_date` 오름차순)을 먼저 채우고 남는 자리를 체크리스트로 채운다 — **교차 정렬 규칙 없음** | `services/dashboard.py:56-99` (`DASHBOARD_UPCOMING_ITEMS_LIMIT = 5`, `:21`) |
| 15 | §5 전역 규약 | **`GET /categories` 와 `GET /vendor-cases` 는 인증이 필요 없다** | `routers/vendor_case.py` 에 auth 의존성 없음. 실측: 쿠키 없이 **200** |
| 16 | §S1 온보딩 | **재제출 시 `409 WEDDING_ALREADY_EXISTS`** — 사용자 1명 = 웨딩 1개(`owner_user_id UNIQUE`) | `services/wedding.py:85,119` |
| 17 | §6 | `PATCH /weddings/me` 는 `exclude_unset=True` 로 판단한다 — **값이 같아도 필드를 보내면 "바뀐 것"으로 세어 LLM 재생성이 돈다.** 안 바뀐 필드는 보내지 말 것 | `services/wedding.py:156,200` |

---

## 4. ⚠️ 날짜 경계 결함 — 문서에도 코드에도 없는 것

`APPROX_H2_THIS_YEAR`("올해 하반기") 의 대표 날짜는 **그 해 10월 1일 고정**이다
(**`services/wedding.py:49-50`** — `return date(year, 10, 1)`, 조건 없음).
온보딩(`POST /weddings`)에서 이 버킷을 고르면 `approximate_wedding_date` 가 그 값을 그대로 저장한다
(`services/wedding.py:87-91`, 기준 시각은 **UTC**).

> ⚠️ **정정 2건 (2026-08-24 재검증).**
> ① 줄번호가 틀렸다 — `:57-58` 은 **`NO_PLAN` 의 18개월 가산 계산**이고, 문제의 상수는 **`:50`** 이다.
> ② 발생 구간이 「11~12월」이 아니다 — **10월 2일부터 12월 31일까지 약 3개월** 내내 과거 날짜가 된다.
> (10월 15일에 "올해 하반기"를 고르면 저장값이 **14일 전**이다.)

- 저장되는 `wedding_date` = **이미 지난 날짜**
- `GET /dashboard/summary.d_day` = **음수**
- 생성된 타임라인 항목 전부 `target_date < today` → `is_overdue=true`

~~**프론트가 방어할 수 없다**(서버가 계산해 저장한다).~~ 🔍 **2026-08-25 정정 — 방어할 수 있고, 프론트가 흡수한다.**
`POST /weddings` 는 `EXACT` 일 때만 클라이언트 날짜를 저장하고(`services/wedding.py:87-91`), `PATCH /weddings/me` 는
`precision` 만 보내면 날짜를 유지한다(`:156-158`). 그래서 **`POST`(EXACT + 프론트 대표일) → `PATCH`(precision 만)** 순서로
저장값·타임라인·`done_so_far` 모두 올바르게 남는다(개인화는 `precision` 을 읽지 않는다). 12-15 이후는 '올해' 선택지를 숨긴다.
상세·순서 근거는 [`BACKEND_REQUEST.md` §4](BACKEND_REQUEST.md). 백엔드 하한 처리는 선택 사항.

참고: `DatePrecision` 은 **5값**(`EXACT`·`APPROX_H2_THIS_YEAR`·`APPROX_H1_NEXT_YEAR`·
`APPROX_H2_NEXT_YEAR`·`NO_PLAN`)이고 **`APPROX_H1_THIS_YEAR` 는 없다** — 상반기를 고를 방법이
애초에 없으므로 "올해 하반기"가 연중 유일한 '올해' 선택지다. 그래서 10~12월 사용자는 **대안이 없다.**

---

## 4-a. 🆕 문서가 작성된 뒤 백엔드가 또 움직였다 — SSE 계약 변경

협업 요청 문서는 `df4a8ff` 시점 기준인데, **같은 날 `83d5f4c` 까지 12커밋이 더 들어갔다.**
문서 §4 의 SSE 이벤트 표(5종)는 **이미 낡았다.**

| PR | 변경 | 문서 §4 대비 |
|---|---|---|
| #53 | **`stage` 이벤트** — `{"stage":"retrieve"\|"generate"\|"verify"}` | 표에 없음. 문서가 "로딩 UI 3단계"를 프론트 추측에 맡겼는데 **서버가 알려 준다** |
| #54 | **`retry` 이벤트** — `{"reason": str}`, 최대 1회 (CRAG 재검색) | 표에 없음. 🚨 **무시하면 1·2차 답변이 이어붙는다** — 수신 시 token 버퍼를 비워야 한다 |
| #52 | 답변 프롬프트에 **마크다운 금지** | 문서에 언급 없음. **마크다운 렌더러를 붙이면 안 된다** |
| #55 | **`POST …/messages/{message_id}/feedback`** `{rating:"GOOD"\|"BAD"}` 신규 | §5 API 표에 없음. 목업의 `🚩 도움 안 됨`(=`/feedback-reports`)과 **다른 기능** |

**넷 다 코드에만 있고 배포본에는 없다**(2026-08-24 실측: 배포 엔드포인트 31개 유지). 따라서
**`stage`·`retry` 가 안 와도 동작하도록** 짜고, 오면 UX 를 개선하는 방향으로 만든다.
상세는 [`04` §1.2-a·§1.2-b](04-ai-chat-rag.md) · [`01` §4](01-endpoints.md).

### 🆕 4-a-1. 클러스터 실측으로 간격이 더 벌어졌다 — **배포본은 `df4a8ff` 보다도 이전이다**

위에서 「문서는 `df4a8ff` 기준인데 코드가 12커밋 더 갔다」고 적었다. **절반만 맞았다.**
[`08` §1](08-cluster-runtime.md) 의 클러스터 실측 결과:

```
b4615af  ────►  df4a8ff  ────►  83d5f4c
(배포본)        (협업문서·분석 기준)  (origin/backend HEAD)
   └────────── 29 커밋 ──────────┘
```

**협업 요청 문서가 서술한 계약 중 일부는 배포본에 아직 없다.** 특히 `#54`·`#53` 뿐 아니라
문서가 이미 전제하고 있던 **전역 상담(`category_code: null`)조차 배포본에서 422** 다(§5 표로 이관).

> **이게 이 문서의 존재 이유이기도 하다** — 백엔드는 하루에 12커밋이 들어갈 만큼 빠르게 움직인다.
> 협업 요청 문서든 이 문서든 **작성 즉시 낡기 시작한다.** 인용 전에 [README §7](README.md) 의
> 현재성 확인 명령을 돌린다. 🆕 **그리고 「코드에 있다」와 「배포돼 있다」를 반드시 따로 센다** —
> 배포본 커밋은 [`08` §8](08-cluster-runtime.md) 로 실측할 수 있다(ACR 태그 = git SHA).

## 5. 팀 결정이 필요한 것 (문서 §9 에 추가)

| 항목 | 왜 프론트가 정할 수 없는가 |
|---|---|
| **전역 AI상담 진입점** | 백엔드는 `category_code: null` 을 지원하는데, 프론트 `layout.md`(ADR 0006 승인 규범)의 하단 탭바는 **4개 고정**이고 상담 진입점이 없다. 5번째 탭을 넣으려면 **layout.md 개정이 선행**돼야 한다 |
| ~~**11~12월 `APPROX_H2_THIS_YEAR`**~~ | ~~§4 — 서버 계산이라 백엔드 결정~~ → 🔍 **프론트가 정할 수 있게 됐다**(§4 2단계 저장). 이 표에서 제외 |
| **`SameSite` 수정 일정** | §1-1 — 이게 안 되면 로그인 이후 모든 화면이 막힌다. **가장 먼저 답이 필요하다** |

### 🆕 전역 AI상담 — 백엔드 쪽 근거가 확정됐다 (2026-08-24)

이 항목은 그동안 「백엔드가 지원한다 vs `layout.md` 에 자리가 없다」의 대립으로만 적혀 있었다.
**백엔드가 무엇을 전제하는지가 소스에서 확인됐다.** `b3a24c4` 가 `schemas/chat.py` 에 남긴 주석 원문:

> *"`12_final_prototype_mockup.html` **하단 탭바의 전역 "AI상담"**(카테고리 무관)과 카테고리 상세 안의
> "AI상담" 서브탭 **둘 다 이 엔드포인트로 세션을 만든다** — None이면 전역 상담."*

**백엔드는 하단 탭바에 「AI상담」이 있다고 전제하고 구현했다.** 결정은 여전히 디자인 오너 몫이지만,
이제 **양쪽 근거가 대등하게 문서화**됐다 — 백엔드는 목업 `12_final_prototype_mockup.html`,
프론트는 `layout.md`(ADR 0006 승인). **어느 쪽 목업이 정본인지**가 실제 쟁점이다.

**한편 지금 당장은 논쟁이 착수를 막지 않는다** — 배포본에서 전역 상담은 **422** 라
([`08` §3.1](08-cluster-runtime.md)) **어차피 카테고리 진입점부터 만들어야 한다.**
`ChatSessionCreate.category_code` 가 배포본 `openapi.json` 에 여전히 `required` 로 있다.

---

## 6. 검증에서 **맞다고 확인된 것** (그대로 신뢰해도 됨)

작성자가 정확히 적은 것들이다 — 다시 의심하지 말 것.

- 카테고리 **9개 ENUM**, `ETC` 는 `tier=MOCKUP` + `allows_custom_tag=true` (`core/categories.py`)
- 에러 포맷 `{"error":{"code","message"}}` 통일, 422 도 동일 (`main.py` 커스텀 핸들러)
- `wedding_id` 를 URL/바디로 **절대 안 받는다** — 전부 세션에서 유도 (`deps.py`)
- `is_overdue` = `status=='TODO' AND target_date < today` — **PRD 기준과 일치** (`services/timeline.py:62-63`)
- 완료율: HOMEWARE 는 `DELIVERED`, 나머지 8개는 `DONE` (`services/dashboard.py:32-41`)
- 체크리스트 상태값 카테고리별 분기 + `422 INVALID_STATUS_FOR_CATEGORY` (`services/checklist.py:16-30`)
- `reason_category` 는 **한글 enum** `부정확함`/`부적절함`/`도움안됨`/`편향/차별적`/`기타` (`schemas/common.py`)
- 타임라인은 비활성 카테고리를 거르되 **`category_code=null` 은 항상 노출** (`services/timeline.py:84`)
- 대시보드 `categories` 는 **활성만** 내려온다 (`routers/dashboard.py:57,81`)
- CORS 허용 오리진은 `http://localhost:5173` **정확히 하나** + SWA 정규식 (`main.py:40-43` 상수 · `:56-61` 미들웨어)
- 페이지네이션 없음 · 금액 원 단위 정수 · 날짜 `YYYY-MM-DD` · 타임스탬프 UTC
- `EventSource` 사용 불가 → `fetch` + `getReader()` (POST + 쿠키)
- SSE 이벤트 순서 `token* → citations → verification → done` (`services/chat.py:208-278`)
- `citations[].source_url` 은 **nullable** (`schemas/chat.py`)
- 온보딩 시 카테고리 9행이 전부 `is_active=true` 로 생성 (`services/wedding.py:123-132`)
- 사용자 수정 항목은 재생성에서 보호됨 (`user_edited_at` 기준, `services/personalization.py:31-83`)

---

## 7. 백엔드에 돌려줄 요청 — **코드 수정 2건 + 배포 1건**

> 📤 **전달용 문안은 [`BACKEND_REQUEST.md`](BACKEND_REQUEST.md) 에 별도로 작성했다** (2026-08-24).
> 이 절은 *왜* 그 요청이 필요한지의 근거이고, 그 문서는 *보낼 형태*다. 🆕 그 문서에는 여기 없던
> **계정 자동연동 보안 질의**(`services/oauth.py` 독스트링↔코드 불일치)가 3번으로 추가돼 있다.

**코드 수정이 필요한 것**

1. **`samesite="lax"` → `"none"`** (**`routers/auth.py:56`**) + **로그아웃 `delete_cookie` 속성 일치**
   (**`:121`** — 인자 없이 호출해 Starlette 기본값 `secure=False`/`samesite="lax"` 가 나간다).
   이게 안 되면 프론트는 로그인 이후 아무 화면도 못 만든다. **최우선.**

   > ⚠️ **줄번호 정정 (2026-08-24 재검증).** 이 항목은 원래 `:55`/`:113` 을 가리켰는데 **둘 다 틀렸다**
   > (`auth.py` 는 그동안 무변경이므로 처음부터 틀린 값이었다). 실측: `set_cookie` 블록 51-58 ·
   > `samesite="lax"` **56** · `delete_cookie` **121**. **전달 전에 이 번호로 고쳐 보낼 것.**
2. ~~**11~12월 `APPROX_H2_THIS_YEAR` 과거 날짜** 처리 방침 (§4).~~ → 🔍 **요청 철회** — 프론트 2단계 저장으로 해결(§4 · `BACKEND_REQUEST.md` §4). 백엔드 하한은 선택.

**배포만 하면 되는 것 — 🆕 성격이 바뀌었다**

3. 🆕 **staging 파드를 굴려 최신 이미지를 올려 달라.** 원래 이 항목은 「개인화 재생성 배포」
   1건이었는데, 클러스터 실측 결과 **배포본이 37커밋 뒤처져 있어**([`08` §1](08-cluster-runtime.md))
   **한꺼번에 10건이 배포 대기 중**이다(2026-08-24 하루 동안 6 → 9 → 10):

   | 계약 | 배포본 동작 |
   |---|---|
   | `POST /personalization/regenerate` | 404 |
   | **전역 상담 `category_code: null`** | **422** |
   | SSE `stage` 이벤트 | 안 옴 |
   | SSE `retry` 이벤트 | 안 옴 |
   | 답변 마크다운 금지 | 미적용 |
   | `POST …/messages/{mid}/feedback` | 404 |
   | 🆕 `ChatMessageOut.user_rating` | 응답에 필드 없음 |
   | 🆕 **타임라인 개인화 상시 BLOCKED**(`ETC`/`HOMENEW`) | 🚨 **온보딩이 카탈로그 폴백** |
   | 🆕 개인화 도메인별 독립 판정 | 한쪽 실패 → 양쪽 폴백 |
   | 🆕 **타임라인 개인화 저다양성 + `category_code` 오염**(PR #57) | 🚨 **프로필이 달라도 거의 동일한 타임라인** |

   **백엔드 코드는 이미 다 맞다 — 수정할 게 없다.** 원인은 `backend:latest` 태그 고정 +
   `imagePullPolicy: Always` 조합이라 **파드가 재시작될 때만** 새 이미지를 집는 구조다.
   staging 파드는 2026-08-23T20:24 이후 재시작이 없다.

   🔑 **ACR `latest` 는 이미 최신 커밋(`6c29ea0`)으로 빌드돼 있다** — 빌드가 아니라 **롤아웃 한 번**이면 된다:
   `kubectl -n staging rollout restart deployment/backend`

   🚨 **마지막 3건(개인화)은 성격이 다르다.** 앞의 7건은 404/미도착/필드누락이라 프론트가 감지할 수
   있지만, **개인화 3건은 200 으로 정상 응답하면서 내용만 카탈로그 폴백**이다 — **화면상 구분이 안 된다.**
   🆕 게다가 **타임라인은 행 단위로도 구분이 안 된다**(응답에 `source_tier` 가 없고 폴백분도
   `origin="LLM"` — [`04` §5.6-b](04-ai-chat-rag.md)). 체크리스트만 구분된다.
   백엔드 커밋 메시지가 그 발견 경로를 남겨 뒀다: *"frontend-e2e-merimap-integration 세션이 실계정
   DB 조회로 최초 발견"* — **정적 분석으로는 안 잡히고 실계정 E2E 로만 드러났다.**

   함께 제안: **커밋 태그로 고정**하거나 `argocd-image-updater` 되쓰기를 실제로 동작시키면
   (현재 Application 에 image override 흔적이 없다) 배포 시점이 우연에 맡겨지지 않는다.

그리고 문서 자체의 교정은 §2·§3 표를 그대로 전달하면 된다.

---

## 8. 🆕 새 전달본 교차검증 — `docs/backend_req_info/` (2026-08-24 21:07 전달, 2026-08-25 경로 확정)

### 8.1 무엇이 왔나

§1~§7 이 대조한 403줄본 **이후**에 도착한 묶음이다. 파일 시각이 전부 **2026-08-24 21:07** 로,
백엔드 PR #57 머지(20:12)보다 **뒤**다.

| 파일 | 줄 | 성격 |
|---|---|---|
| `FRONTEND_COLLABORATION_REQUEST.md` | **448** | 🆕 **개정판** — 이 문서가 대조한 403줄본의 후속(+81 / −36줄, 11덩어리) |
| `FRONTEND_FUNCTIONAL_SPEC.md` | 602 | 화면별 기능 명세 + **SSE 이벤트 전체 스펙**. 협업요청 §4 를 대체한다고 스스로 밝힘 |
| `FRONTEND_REQUIREMENTS.md` | 200 | 협업요청 §6(프론트 직접 계산 로직)을 승계·확장. 근거 커밋 `c1ca9db` 는 `origin/backend` 조상 ✅ |
| `FRONTEND_API_GUIDE.md` | 154 | 화면 → 엔드포인트 매핑 + 에러/스트림 취급. **SSOT 아님**을 스스로 명시 |
| `FRONTEND_API_SCHEMA.md` | 1380 | `openapi.json` 을 프로그램으로 파싱한 스키마 표 (생성 2026-08-24 12:08 KST) |
| `12_final_prototype_mockup.html` | 1380 | 통합 목업. `frontend/docs/mockups/` 에는 **화면별로 쪼갠 s1~s6 만** 있으므로 **중복이 아니다** |

**구판 대비 늘어난 것**: `stage`/`retry` SSE 이벤트 · 목업 경로 이동(`docs/wedding/plan/new/` →
`frontend/docs/mockups/`) · 개인화 재생성(#32)·챗 평가(#33) 행 · 미결항목 재조사 결과.

> ⚠️ **`backend-analysis/FRONTEND_COLLABORATION_REQUEST.md` 는 이제 구판이다.** 인용할 때
> **448줄본을 본다.** 두 사본을 합치지 않은 이유는, §1~§7 의 교정이 403줄본의 줄·절을 인용하고
> 있어 원본을 남겨 둬야 대조가 성립하기 때문이다.
>
> ~~🚨 `docs/backend-request-to-frontend/` 는 사용자가 백업 경로로 옮길 예정이다~~ → 🔍 **2026-08-25 `docs/backend_req_info/` 로 확정**
> (**저장소 밖에 있다** — 사용자 백업 경로). **이 절은 그 폴더가 없어도 성립하도록 썼다** — 판정 근거가 되는 문장은 전부 아래에
> **원문 인용으로 옮겨 놨고**, 수치는 라이브 실측값으로 적었다. 경로를 따라가지 말고 이 절을 읽으면 된다.
>
> 📌 **다만 그 묶음에는 이 저장소에 없는 실물이 있다** — 화면별 기능 명세(S0~S6)·SSE 시퀀스 3케이스
> (정상/재시도/에러)·화면→엔드포인트 매핑·통합 목업 HTML. **S1·S3 구현 때 실제로 펼쳐 볼 값어치가
> 있는 것들이다.** 🔍 이제 위치가 확정됐다 — 구현 시 펼쳐 볼 파일:
>
> | 쓸 때 | 파일 |
> |---|---|
> | S0~S6 화면별 기능 명세 · SSE 시퀀스 3케이스(정상/재시도/에러) | `FRONTEND_FUNCTIONAL_SPEC.md` (§11 SSE — 단 `:397` 「세션당 1회」는 **메시지당**으로 읽을 것, §8.6-d) |
> | 화면 → 엔드포인트 매핑 · 에러/스트림 취급 | `FRONTEND_API_GUIDE.md` (`:36` 쿠키 이름 `session_id` 는 **`wr_session`** 이 정답, §8.6-b) |
> | 프론트 직접 계산 로직(D-day·예산 비율 등) | `FRONTEND_REQUIREMENTS.md` |
> | 요청/응답 필드 표 (25 paths / 32 ops — #33 챗 평가 **없음**, §8.6-a) | `FRONTEND_API_SCHEMA.md` → 최신 계약은 [`01`](01-endpoints.md)·[`02`](02-schemas.md) 가 정본 |
> | 통합 목업(390px, 클릭 가능) | `12_final_prototype_mockup.html` |
> | 협업요청 448줄 개정판(정본) | `FRONTEND_COLLABORATION_REQUEST.md` — 이 폴더의 403줄본은 구판 |

### 8.2 결론 — **레거시가 아니라 최신본이다. 다만 4건이 틀렸다**

큰 그림·화면 스펙·SSE 시퀀스는 이 저장소가 가진 것보다 **더 자세하고 정확하다.**
반면 **「지금 붙어도 되는가」에 대한 판단은 전부 틀렸다** — 실측 없이 「배포 완료」로 적혀 있다.

### 8.3 🚨 ①「staging 은 최신 이미지」 — **라이브 실측으로 반증됐다**

문서 원문(§0 TL;DR · §2):

> *"백엔드는 33개 엔드포인트 전부 구현·**배포 완료** … staging도 **최신 이미지로 떠 있습니다.
> 안심하고** 이 스펙 기준으로 연동하시면 됩니다."*
> *"staging(`https://20-249-52-148.nip.io/api/v1`) **최신 이미지로 1/1 Running 확인**"*
> *"즉, 아래 API 스펙은 「설계」가 아니라 **「지금 이 순간 실제로 동작하는 API」**입니다."*

**2026-08-24 라이브 실측:**

| 호출 | 결과 |
|---|---|
| `GET /health` | **200** |
| `POST /personalization/regenerate` (문서 **#32**) | 🚨 **404** |
| `POST …/messages/{mid}/feedback` (문서 **#33**) | 🚨 **404** |
| `POST /feedback-reports` (문서 #31, 별개 기능) | 401 (= 존재함) |
| 라이브 `openapi.json` | 🚨 **paths 24 · ops 31** (문서 주장 **33**) |

배포본은 **`b4615af`**, `origin/backend`(`6c29ea0`) 대비 **37커밋 뒤**다(§7 · [`08` §1](08-cluster-runtime.md)).

**「1/1 Running」이 「최신 이미지」를 뜻하지 않는다.** 공식 문서가 그 이유를 명시한다:

> *"every time the **kubelet launches a container**, the kubelet requests the container runtime to
> pull the image."*
> *"You should **avoid using the `:latest` tag** when deploying containers in production as it is
> harder to track which version of the image is running and more difficult to roll back properly."*
> — Kubernetes, [Images](https://kubernetes.io/docs/concepts/containers/images/) (2026-08-24 확인)

즉 `imagePullPolicy: Always` 는 **컨테이너가 새로 뜰 때만** 당긴다. `backend:latest` 는 태그가
안 바뀌니 매니페스트도 안 바뀌고, 파드는 재시작되지 않는다 — staging 파드는 **2026-08-23T20:24:43Z
이후 `RESTARTS 0`** 으로 그대로다(3회 연속 실측). **파드 상태를 보는 것으로는 절대 알 수 없고,
ACR 태그(= git SHA)를 물어야 한다**([`08` §1.1](08-cluster-runtime.md)).

### 8.4 🚨 ② `SameSite` — **§1-1 의 오류가 새 판본에서도 그대로다**

새 판본도 같은 세 줄을 유지한다 — `SameSite=Lax` 명시 · `credentials:"include"` **필수**(안 붙이면
401) · `FRONTEND_API_GUIDE.md` 는 **"크로스 오리진 호출(BFF 아님, AKS Ingress 직접 호출)"**.
**세 줄 각각은 맞는데 결론이 틀렸다** — 근거·수정안은 **§1-1** 그대로다.

🆕 **새 판본에서 오히려 나빠진 부분**: 협업요청 §3 은 인증 아키텍처를 **"BFF + Opaque 세션 쿠키
방식"** 이라고 부르는데, 같은 묶음의 `FRONTEND_API_GUIDE.md` 는 **"BFF 아님"** 이라고 적는다.
**두 문서가 정면으로 어긋난다.** 실제는 후자(크로스 오리진)이고, 그래서 §1-1 이 성립한다.

### 8.5 ⚠️ ③ production 호스트를 `VITE_API_BASE` 후보로 안내한다

협업요청 §3 이 이렇게 적는다:

> - staging: `https://20-249-52-148.nip.io/api/v1`
> - **production: `https://merrymap-production.koreacentral.cloudapp.azure.com/api/v1`**

**붙으면 안 된다.** 라이브 실측:

| production 호출 | 결과 |
|---|---|
| `GET /health` | **200** ← 살아 있어 보인다 |
| `GET /auth/me` | 🚨 **404** ← `/auth/*` 자체가 없다 |

production 은 **인증 도입 이전 커밋(`4e879fd`)** 이 떠 있고 ArgoCD 가 `main` 을 추적한다
([`08` §2](08-cluster-runtime.md)). **헬스체크만 200 이라 더 위험하다.**
→ 이 줄을 문서에서 **삭제**해 달라는 요청은 [`08` §9](08-cluster-runtime.md) #3 에 이미 있다.

### 8.6 ⚠️ ④ 누락 1건 · 내부 모순 2건 · 범위 오류 1건

| # | 무엇 | 실측 |
|---|---|---|
| a | **`FRONTEND_API_SCHEMA.md` 에 챗 👍👎 평가(#33)가 없다** | 그 문서는 **25 paths / 32 ops**, 코드는 **26 / 33**. 그 문서의 #31 은 신고(`/feedback-reports`)로 **별개 기능**이다. 그런데 협업요청 `:445-446` 이 *"이 문서(§5)에 요약만 있는 #32/#33 같은 엔드포인트의 정확한 필드는 여기(`FRONTEND_API_SCHEMA.md`)를 참고하세요"* 라고 안내한다 — **#33 은 없는 곳을 가리킨다.** `FRONTEND_API_GUIDE.md:130` 에는 제대로 있다 |
| b | **쿠키 이름이 두 문서에서 다르다** | 협업요청은 *"`wr_session` 이 맞다, `session_id` 로 잘못 적힌 곳이 3군데 있으니 헷갈리지 말라"* 고 경고하는데, 같은 묶음 `FRONTEND_API_GUIDE.md:36` 이 **그 `session_id` 를 쓴다.** 정답은 **`wr_session`**(`core/config.py` 기본값 · 클러스터 미주입 확인 — [`08` §5.1](08-cluster-runtime.md)) |
| c | **BFF vs 크로스 오리진** | §8.4 참조. 실제는 크로스 오리진 |
| d | **`FRONTEND_FUNCTIONAL_SPEC.md:397` "재시도는 세션당 최대 1회"** | 🚨 **요청(메시지)당 1회**다. `initial_state` 의 `"retry_count": 0` 이 **메시지 전송 핸들러 안**에서 매번 새로 만들어진다(`services/chat.py:166-174`). 세션 단위로 「이미 재시도 씀」 플래그를 두면 **두 번째 메시지부터 오작동**한다 |

> **a 의 원인이 문서에 적혀 있다** — *"참고용 `openapi.json` 스냅샷은 **캡처 시점(서버 재시작
> 타이밍)**에 따라 일부 엔드포인트가 누락될 수 있는 것이 실측으로 확인됐다"*. 증상은 봤지만
> 원인을 **캡처 타이밍**으로 짚었다. 실제 원인은 §8.3 의 배포 구조다 — 같은 뿌리다.
> 덧붙여 그 문서가 참조하는 원본 **`openapi.json` 은 폴더에 없다**(`FRONTEND_API_SCHEMA.md` 는
> *"같은 디렉터리"* 라고 적었다). 그리고 두 문서가 SSOT 로 지목한
> **`docs/wedding/plan/new/03_API_spec.md` 는 어디에도 없다** — **원격 브랜치 21개 전수**(`git ls-tree`)
> + `branchs/` 디스크 전체(`find`) 검색에서 **0건**이다. **프론트 쪽에서는 그 SSOT 를 펼쳐 볼 수단이
> 없다** — 그래서 이 저장소의 `01`~`06` 은 그 문서를 인용하지 않고 **소스와 배포본만 근거로** 썼다.

### 8.7 ✅ 맞다고 확인된 것 — 그대로 신뢰해도 된다

`FRONTEND_FUNCTIONAL_SPEC.md` 의 SSE 서술은 **이 저장소가 소스로 독립 검증한 결과와 일치한다.**

| 문서 서술 | 이 저장소 실측 |
|---|---|
| `stage` — **정상 3회 / 재시도 시 6회** | ✅ 일치([`04` §1.2-a](04-ai-chat-rag.md)) |
| `citations`·`verification`·`done` — **정확히 1회** | ✅ 일치 |
| `error` — 수신 즉시 종료, 이후 이벤트 없음 | ✅ 일치(`services/chat.py:226-230` `return`) |
| `verdict:"GENERAL"` 은 에러가 아니다 | ✅ 일치 |
| `retry` 수신 시 **버퍼를 비우고 2차를 처음부터** | ✅ 일치 |
| 소셜은 **구글/네이버 2종만** | ✅ 일치 |

⚠️ 다만 `retry` 를 *"무시해도 안 깨지지만 **UX 결함**"* 으로 낮춰 적은 것은 동의하기 어렵다.
안 비우면 **1차(근거 부족으로 폐기된) 답변과 2차 답변이 이어붙어 표시**된다 — 보기 나쁜 게 아니라
**틀린 내용을 보여주는 것**이다. 그리고 **근거 0건이면 `retry` 는 항상 온다**([`04` §1.2-a](04-ai-chat-rag.md)) —
드문 예외가 아니다.

### 8.8 빠진 것 — PR #56·#57 (틀린 건 아니다)

기준선이 **PR #55 까지**라 개인화 버그 6건이 반영돼 있지 않다. 어차피 전부 미배포라 당장 연동에는
영향이 없지만, `#32` 재생성에 대해 *"`BLOCKED`/`FAILED` 면 폴백 카탈로그로 채워짐을 구분해 안내할지는
**UX 재량**"* 이라고 적은 부분은 지금 상황과 어긋난다:

- 배포본에서는 **온보딩이 예외 없이 폴백**이다([`04` §5.6-a](04-ai-chat-rag.md)) — 선택 상황이 아니다.
- **타임라인은 폴백인지 구분할 수단 자체가 없다**([`04` §5.6-b](04-ai-chat-rag.md)) — 「구분해 안내」가 불가능하다.

