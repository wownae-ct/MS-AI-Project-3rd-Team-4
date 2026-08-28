# 프론트엔드 구현 협업 요청 — 메리맵(MerryMap) v4.0

> 박정건님께 전달하는 문서입니다 (2026-08-24 작성). 백엔드(v4.0 재구현 + 통합 회귀 검증)가
> 오늘 기준으로 Must/Should 스코프를 사실상 완료했고, 8/26 기능통합 마감을 앞두고 있어
> 프론트엔드 작업이 현재 유일한 병목입니다. 이 문서는 (1) 지금까지 진행 상황을 정확히
> 정리하고, (2) API 스펙/목업을 화면 단위로 매핑하고, (3) 프론트가 반드시 알아야 할 백엔드
> 쪽 특수 로직을 모아뒀습니다.

## 0. 요약 (TL;DR)

- **`frontend` 브랜치(origin, PR #34)에 이미 상당한 기반이 있습니다.** S2 대시보드·S5 리포트는
  실제 화면까지 구현돼 있고, 새 툴체인(React 19.2 / TypeScript 7 / Vite 8 / Tailwind v4 / Base UI /
  TanStack Router)과 디자인 시스템(색·타이포·컴포넌트 토큰)이 이미 결정·적용돼 있습니다.
  **로컬 `frontend` 브랜치가 BriefCoach 시절 커밋에 멈춰 있어서 "아무것도 안 됨"으로 잘못
  알려져 있었을 뿐입니다** — `git fetch` 후 `origin/frontend`로 갱신하면 이 작업이 보입니다.
- **진짜로 비어있는 것은 두 가지입니다**: ① S0 로그인 화면(라우트 자체가 없음, v3.0 무인증
  설계 기준이라 v4.0 인증 부활이 전혀 반영 안 됨), ② API 연동 계층(`shared/api` 등)이 통째로
  삭제된 채 0줄 — 지금 화면들은 전부 정적 목업 데이터로 동작 중입니다.
- **백엔드는 33개 엔드포인트 전부 구현·배포 완료, 오늘 통합 회귀 검증(가입→온보딩 개인화→
  카테고리변경→결제→대시보드→실제 LLM 챗 SSE→피드백까지 한 세션으로 체이닝)을 4회 반복해
  전부 그린으로 확인했습니다.** staging도 최신 이미지로 떠 있습니다. 안심하고 이 스펙 기준으로
  연동하시면 됩니다.
- **소셜 로그인(구글/네이버)이 실제로 동작합니다** — 목업(`12_final_prototype_mockup.html`)의
  S0 화면은 소셜 버튼을 "의도적으로 비활성"으로 그려뒀는데, 이건 목업 제작 시점(소셜로그인 착수
  전) 기준입니다. **지금은 백엔드가 완성돼 있으므로 실제로 활성화해서 리다이렉트로 연결해야
  합니다.** 목업을 그대로 베끼면 이미 완료된 기능을 못 쓰게 됩니다.

---

## 1. 프론트엔드 현재 상태 (실측, `origin/frontend` `b0b3137` 기준)

| 화면/영역 | 상태 |
|---|---|
| S2 대시보드 (`src/pages/dashboard/`) | ✅ 구현됨 — 예산 도넛, 다가오는 납부, 카테고리별 예산 행 |
| S5 리포트 (`src/pages/report/`) | ✅ 구현됨 — 예산 3분할, 진행률, 추천 확인, 압축 납부 행 |
| 스타일가이드 화면 (`src/pages/style-guide/`) | ✅ 디자인 토큰 라이브 문서 |
| S1 온보딩 / S3 카테고리 상세 / S4 타임라인 / S6 예산 재배분 | 🟡 라우트+앱셸만(스캐폴드), 화면 콘텐츠 없음 |
| S0 로그인 | 🔴 라우트 자체가 없음. v4.0 인증 부활 미반영 |
| API 연동 계층(`shared/api`/`shared/config`/`shared/lib`) | 🔴 0% — 폴더 자체가 "주제 전환으로 삭제"됨. `entities/wedding`은 전부 정적 `sample-data.ts`로 화면 구동 중 |
| 툴체인/CI/디자인시스템 | ✅ 완비 — 아래 §7 참고 |

같은 이름의 카테고리(예: `checklist_items`)를 다루는 로컬 스토어/타입도 아직 없습니다 —
백엔드 스키마와 1:1로 프론트 타입을 새로 설계해야 합니다.

---

## 2. 백엔드 상태 (오늘 통합 회귀 검증 완료)

- `00_BASELINE.md` §0-2 Must 10항목 전부 완료, Should 5항목 중 4개(소셜로그인 구글/네이버,
  FIELD_UPDATED 부분 재생성, 근거검증, MOCKUP 카테고리 시드) 완료. 나머지 1개(예산 미정
  플레이스홀더)는 **API(#31)까지 완료** — 프론트 쪽 슬라이더 위젯만 남음.
- 회귀 검증 시나리오(4회 반복, 전부 그린): 이메일 가입 → 웨딩 생성(체크리스트 59개·타임라인
  55개 개인화 생성) → 카테고리 토글(재생성) → 결제 CRUD → 대시보드/리포트 조회 → 챗 세션
  생성 → **실제 LLM 챗 메시지(SSE, done 이벤트까지)** → 피드백 제출.
- staging(`https://20-249-52-148.nip.io/api/v1`) 최신 이미지로 1/1 Running 확인, RAG 코퍼스
  임베딩 140/140, 참가격 데이터 456행 적재 완료.
- **즉, 아래 API 스펙은 "설계"가 아니라 "지금 이 순간 실제로 동작하는 API"입니다.** staging에
  바로 붙여서 개발하셔도 됩니다.

---

## 3. 인증 아키텍처 — 가장 먼저 구현해야 할 부분

### 3-1. 이메일+비밀번호 (Must)

- **BFF + Opaque 세션 쿠키** 방식. 브라우저 JS는 토큰을 절대 다루지 않습니다.
- 쿠키 이름은 **`wr_session`**입니다 (`03_API_spec.md` 예시 JSON에 `session_id`로 잘못 적힌
  곳이 3군데 있는데, 실제 코드(`app/core/config.py`)는 `wr_session`이 맞습니다 — 헷갈리지 마세요).
  `HttpOnly`/`Secure`/`SameSite=Lax`라 프론트 JS로는 어차피 못 읽습니다.
- **모든 API 호출에 `fetch(..., { credentials: "include" })` 또는 axios `withCredentials: true`
  필수**입니다. 안 붙이면 로그인 후에도 계속 401이 납니다.
- 앱 진입 시 로직:
  ```
  GET /auth/me
    401                        → S0(로그인/가입)
    200, has_wedding=false     → S1(온보딩)
    200, has_wedding=true      → S2(대시보드)
  ```
- 엔드포인트: `POST /auth/signup`, `POST /auth/login`(둘 다 성공 시 쿠키 자동 셋 + `has_wedding`
  포함), `POST /auth/logout`(204, idempotent), `GET /auth/me`.

### 3-2. 소셜 로그인 (구글/네이버, 실제 동작함 — 카카오/애플은 스코프 밖)

⚠️ **이 두 엔드포인트는 `fetch`로 호출하는 REST API가 아니라 브라우저 전체 페이지 리다이렉트입니다.**
OpenAPI 스키마에도 안 나옵니다(`include_in_schema=False`).

- 버튼 클릭 시: `window.location.href = "{API_BASE}/auth/google/login"` (또는 `/auth/naver/login`)로
  **직접 이동**시킵니다.
- 성공하면 백엔드가 `wr_session` 쿠키를 심고 프론트 홈으로 리다이렉트합니다 — 프론트가 할 일은
  돌아온 뒤 `GET /auth/me` 한 번 호출해서 상태 갱신뿐입니다.
- 실패(거부/오류/이미 다른 방식으로 가입된 이메일 등)하면 **JSON이 아니라**
  `{FRONTEND_BASE_URL}/login?oauth_error=<CODE>` 쿼리 파라미터로 리다이렉트됩니다. S0(로그인)
  페이지 컴포넌트가 마운트 시 이 쿼리를 읽어서 에러 배너를 띄워야 합니다. 코드 예: `denied`,
  `state_missing`, `state_invalid`, `SOCIAL_ACCOUNT_ALREADY_LINKED`, `unsupported_provider`.

### 3-3. CORS 필수 설정

- 로컬 개발 서버는 **정확히 `http://localhost:5173`**(Vite 기본 포트)이어야 통과합니다. 포트를
  임의로 바꾸면 CORS 에러가 납니다.
- API Base URL은 크로스 오리진 직접 호출입니다(SWA Free 티어라 `/api/*` 프록시 불가):
  - staging: `https://20-249-52-148.nip.io/api/v1`
  - production: `https://merrymap-production.koreacentral.cloudapp.azure.com/api/v1`
  - 로컬 `.env`에 `VITE_API_BASE`로 세팅.

---

## 4. 화면별 상세 스펙

공통 참고: 목업 전체 원본 `docs/wedding/plan/new/12_final_prototype_mockup.html`(클릭 가능한
단일 HTML, 390px 모바일 프레임). 아래 "목업 위치"는 이 파일 기준 함수명/줄 번호입니다.

### S0 — 로그인/회원가입 (신규 화면, 라우트부터 만들어야 함)

**목업 위치**: `renderLogin()` L645-683

- 이메일/비밀번호 로그인·회원가입 탭 전환 UI, 게스트 모드("게스트로 둘러보기") 진입 배너.
- **목업은 소셜 버튼을 비활성으로 그렸지만, 실제로는 활성화해서 §3-2 리다이렉트 방식으로
  구현하세요.** 게스트 모드는 로컬 상태만으로 온보딩~대시보드를 둘러보게 하고(회원가입 없이),
  "가입하기" 유도 배너를 계속 띄우는 패턴을 유지하면 됩니다 — 단, 게스트가 실제로
  `POST /weddings`를 호출하려면 결국 로그인이 필요하므로, 게스트 모드의 데이터 저장 범위
  (로컬만 vs 서버 연동)는 §9 미결정 사항에 있습니다.
- 로그인 실패(`INVALID_CREDENTIALS`, 401), 회원가입 중복 이메일(`EMAIL_ALREADY_EXISTS`, 409)
  에러 배너 UI가 필요합니다(목업엔 해피패스만 있어 이 부분은 신규 구현).

### S1 — 온보딩 (8단계 스텝퍼)

**목업 위치**: `renderOnboarding()` L687-707, `onbStep1~8` L709-884

8단계: ① 역할+예정일 → ② 지역+예산+하객수 → ③ 웨딩스타일(스킵가능) → ④ primary_goals
다중선택(스킵가능) → ⑤ FOCUS 카테고리 우선순위 → ⑥ 기진행상태 체크 → ⑦ 카테고리 on/off +
부분선택(SDM은 "드레스샵투어", HOMEWARE는 "가전/가구/침구소품") → ⑧ 카테고리별 예산 배분 슬라이더.

핵심 로직:
- **예산 "미정" 토글**: 지역 선택 시 `GET /benchmarks/total-average?region_code=...`(#31)를
  호출해 지역 평균을 슬라이더 플레이스홀더로 표시. "미정"으로 제출하면
  `POST /weddings`에 `total_budget_unsure=true`(금액 생략 가능) — 서버가 같은 지역평균으로
  채웁니다. 데이터가 없으면 `422 TOTAL_BUDGET_UNAVAILABLE` → 직접 입력 요구 폴백 필요.
- **`wedding_date_precision`이 `EXACT`가 아니면** 정확한 날짜를 입력받지 않습니다 — 근사 4종
  버킷(`APPROX_H2_THIS_YEAR`/`APPROX_H1_NEXT_YEAR`/`APPROX_H2_NEXT_YEAR`/`NO_PLAN`) 중 선택만
  받으면 됩니다. 서버가 대표 날짜를 계산해 저장하지만, 화면엔 "올해 하반기 중"처럼 버킷
  라벨을 보여주는 게 맞습니다(계산된 실제 날짜를 "정확한 날짜"처럼 노출하지 마세요).
- **⚠️ 온보딩 완료(`POST /weddings`) 호출은 응답이 즉시 오지 않습니다.** 서버가 체크리스트+
  타임라인 LLM 개인화 생성을 요청 처리 도중 동기로 기다린 뒤에야 응답합니다(수 초 소요 가능).
  **반드시 로딩 스피너/스켈레톤을 붙이고, API 클라이언트 타임아웃을 이 엔드포인트만 30초
  이상으로 넉넉히 잡으세요.** 별도 폴링 API는 없습니다 — 응답이 오면 생성이 끝난 것입니다.
- Step5의 우선순위 필드 라벨 주의: 목업 코드에 "스드메(venue_priority)"/"예식장(sdm_priority)"
  처럼 라벨-필드명이 교차 표기된 부분이 있습니다. 실제 구현 시 `03_API_spec.md`의 필드명을
  기준으로 삼고, 목업 라벨 텍스트만 참고하세요.
- 카테고리 9개는 `POST /weddings` 성공 시 서버가 **전부 `is_active=true`로 자동 생성**합니다 —
  온보딩 ⑦단계에서 사용자가 끈 카테고리만 이후 `PUT /wedding-categories`로 반영하면 됩니다.

### S2 — 대시보드(홈) — 이미 구현됨, API 연동만 필요

**목업 위치**: `renderHome()` L909-981 · **실제 코드**: `frontend`의 `src/pages/dashboard/`

- **`GET /dashboard/summary`(#25) 응답 하나로 화면 전체를 그립니다** — D-day, 예산 요약,
  임박한 일정(`upcoming_items`, `source: "timeline"|"checklist"`로 출처 구분), 카테고리별
  진행률. 기존 구현이 정적 데이터를 이 응답 스키마로 교체하면 됩니다.
- 완료율 계산: HOMEWARE는 `DELIVERED` 기준, 나머지는 `DONE` 기준(서버가 `progress_rate`로
  이미 계산해서 내려줌).
- 비활성 카테고리는 `categories` 배열에서 아예 제외되어 옵니다.

### S3 — 카테고리 상세 (체크리스트 / 비용 / AI상담 3탭)

**목업 위치**: `renderCategoryDetail()` L984-1004, `renderChecklistTab()` L1006-1045,
`renderCostTab()` L1047-1074

- **체크리스트 탭**: `GET /checklist-items?category_code=...`(#12). 카테고리별 상태값이
  다릅니다 — HOMEWARE만 `LISTED/COMPARING/ORDERED/DELIVERED`, 나머지 8개는
  `TODO/DOING/SKIP/DONE`. 상태칩은 목업처럼 "탭할 때마다 다음 상태로 순환"하는 토글로
  구현되어 있었는데, 실제 구현 시 드롭다운/버튼군 등 UX는 자유롭게 선택하되 **카테고리별로
  유효한 상태값만 보여주도록 분기**하세요(`PATCH /checklist-items/{id}`가 잘못된 조합엔
  `422 INVALID_STATUS_FOR_CATEGORY`로 거부합니다).
  - **FOCUS(VENUE/SDM)에만** `GET /vendor-cases?category_code=...`(#24) 업체사례 카드를
    상단에 추가하세요. 응답의 `disclaimer` 필드는 **반드시 화면에 렌더링**해야 합니다(고지
    문구 요구사항). MOCKUP 카테고리는 이 섹션 자체를 렌더링하지 않으면 됩니다.
- **비용 탭**: `GET /payments?category_code=...`(#18) + FOCUS 카테고리만
  `GET /benchmarks/compare`(#23) 참가격 비교 카드. MEETING(`has_cost=false`)은 "비용 없음"만
  표시. 지출 추가는 `POST /payments`(#19), 납부완료 처리는
  `PATCH /payments/{id}` (`{status:"PAID", paid_date, receipt_url}`).
- **AI상담 탭**: 공용 챗 컴포넌트를 카테고리 컨텍스트로 재사용(§4 챗 섹션 참고).

### S4 — 타임라인

**목업 위치**: `renderTimeline()` L1077-1104

- `GET /timeline-items?category_code=...`(#15). **체크리스트와 완전히 독립**된 테이블입니다 —
  타임라인 체크 여부가 체크리스트 진행률에 영향을 주면 안 됩니다(반대도 마찬가지). 이건
  v3.0에서 있었던 설계 실수를 v4.0이 명시적으로 갈라놓은 것이니 절대 다시 엮지 마세요.
- **`phase_label`(예: "D-11개월" 구간 라벨)은 DB 컬럼이 아닙니다 — 프론트가 직접 계산해야
  합니다.** 서버는 `default_dday_offset_days`(정수, 본식 기준 며칠 전=음수)만 내려줍니다.
  권장 공식:
  ```
  monthsBefore = ceil(-offsetDays / 30)
  offsetDays > 0  → "D+POST" (본식 이후)
  offsetDays == 0 → "D-DAY"
  그 외          → "D-{monthsBefore}M"
  ```
  구간을 몇 단계로 묶을지(원본 카탈로그는 17구간, 목업 시연은 4구간으로 단순화)는 **프론트
  재량**입니다. 단, 고정 룩업 테이블은 쓰지 마세요 — LLM이 생성하는 offset 값이 임의 정수라
  원본 55항목 세트에 더 이상 한정되지 않습니다.
- `is_overdue`는 서버가 이미 계산해서 내려줍니다(직접 계산할 필요 없음) — 다만 목업의 "임박
  강조"(`.hl`, D-14 이내)는 PRD 원문이 요구하는 "지연 항목 강조"(`target_date < 오늘 AND
  status='TODO'`)와 다릅니다. **PRD 기준(지연 강조)으로 구현**하는 걸 권장합니다.
- 비활성 카테고리 소속 항목은 목록에서 제외됩니다(단 `category_code=null`인 혼인신고/본식류는
  항상 노출).

### S5 — 마이 리포트 — 이미 구현됨, API 연동만 필요

**목업 위치**: `renderReport()` L1157-1189 · **실제 코드**: `src/pages/report/`

- `GET /reports/me`(#26) 응답 하나로 구동. Could 우선순위 화면이라 일정이 빠듯하면 S2로
  흡수될 수 있다는 게 원 설계 의도였지만, **이미 구현이 끝나 있으니 그대로 유지하고 API만
  연결하면 됩니다.**

### S6 — 예산 배분 / 시나리오

**목업 위치**: `renderBudget()` L1107-1154

- 서버 엔드포인트 없이 **클라이언트에서 계산**하는 화면입니다:
  ```
  남은예산 = total_budget − Σ(카테고리별 paid_amount) − Σ(활성 카테고리 미지급 planned_budget)
  ```
  `GET /wedding-categories`(#9)와 `GET /dashboard/summary`의 `total_paid`/`total_planned`만
  받아서 슬라이더 반응형으로 계산하세요.
  - 시나리오 편집 확정 시에만 `PUT /wedding-categories`(#10)로 일괄 저장. 이미 지급한
    금액(`paid_amount`) 아래로 낮추면 `400 BUDGET_BELOW_PAID`(응답에 `category_code`,
    `min_required` 포함 — 에러 메시지에 활용하세요), 총합이 `total_budget` 초과하면
    `400 BUDGET_EXCEEDED`.
- **⚠️ 예산 재배분 정책 자체가 미결정입니다** — 슬라이더로 한 카테고리를 올리면 다른
  카테고리에서 비례 차감할지, 그냥 총합만 넘지 않게 자유롭게 둘지 등. §9 참고, 팀 논의
  필요합니다.

### AI상담(챗) — SSE, 탭 겸 S3 서브탭 공용 컴포넌트

**목업 위치**: `renderChat()` L1193-1215

```
POST /chat/sessions            { category_code }              → 201 { id, ... }
GET  /chat/sessions/{id}/messages                              → 이력 복원(탭 재진입 시)
POST /chat/sessions/{id}/messages   { content }   ← SSE 스트리밍 응답
```

**`EventSource`는 사용 불가**(POST + 커스텀 자격증명 필요). 반드시
`fetch(url, {method:"POST", credentials:"include", body: JSON.stringify({content})})` 후
`response.body.getReader()`로 직접 청크를 파싱하세요. 이벤트 포맷(표준 SSE, 빈 줄로 구분):

```
event: token
data: {"delta":"위약금 관련해서는 "}

event: citations
data: {"citations":[{"chunk_id":12,"title":"표준계약서 제9조","source_tier":"OFFICIAL","source_url":"https://..."}]}

event: verification
data: {"verdict":"SUPPORTED","reason":"표준계약서 원문과 일치"}

event: done
data: {"message_id":"msg2","latency_ms":2830}
```

- `token`은 0회 이상 반복(스트리밍 조각을 이어붙여 실시간 렌더), `citations`/`verification`은
  각 1회, `done`으로 스트림 종료.
- `citations[].source_url`은 **null 가능**(자체 저작 콘텐츠는 출처 URL이 없음) — nullable
  처리 필수.
- `verification.verdict`가 `"GENERAL"`이면 근거 검색 결과가 없었다는 뜻(에러 아님, 정상
  200 스트림) — "일반 안내" 배지로 구분해서 보여주세요(목업엔 이 케이스가 없어 신규 구현
  필요).
- 실패 시 `done` 대신 `event: error`, `data: {code, message}` — 이미 HTTP 200으로 스트림이
  시작된 뒤라 별도 HTTP 상태코드 변경이 불가능하므로 **반드시 이 이벤트를 파싱해서 실패
  UI를 보여줘야 합니다.**
- AI 메시지에는 신고 버튼(`🚩 도움 안 됨`) → `POST /feedback-reports`
  `{target_type:"CHAT_MESSAGE", target_id, reason_category, comment}` — `reason_category`는
  **한글 enum**입니다(`부정확함`/`부적절함`/`도움안됨`/`편향/차별적`/`기타`, 영문 슬러그 아님 —
  오늘 회귀검증 스크립트도 이거 처음에 잘못 가정해서 한 번 틀렸습니다).

---

## 5. API 전체 스펙 (그룹별 요약)

전체 원문: `docs/wedding/plan/new/03_API_spec.md`(669줄). 아래는 화면 매핑용 요약이고,
필드 단위 상세는 원문을 직접 참고하세요.

| 그룹 | 엔드포인트 | 사용 화면 |
|---|---|---|
| 인증 | `POST /auth/signup`, `/login`, `/logout`, `GET /auth/me`, `GET /auth/{google,naver}/login`, `GET /auth/{google,naver}/callback` | S0 |
| 웨딩 | `POST /weddings`, `GET/PATCH /weddings/me` | S1, S2, S6 |
| 카테고리 | `GET/PUT /wedding-categories`, `GET /categories`(전역 상수) | S1, S2, S3, S6 |
| 체크리스트 | `GET/POST /checklist-items`, `PATCH /checklist-items/{id}` | S3 |
| 타임라인 | `GET/POST /timeline-items`, `PATCH /timeline-items/{id}` | S4 |
| 결제 | `GET/POST /payments`, `PATCH/DELETE /payments/{id}`, `GET /payments/upcoming` | S3, S2, S5 |
| 벤치마크/사례 | `GET /benchmarks/compare`, `GET /benchmarks/total-average`, `GET /vendor-cases` | S3, S1 |
| 대시보드 | `GET /dashboard/summary`, `GET /reports/me` | S2, S5 |
| 챗 | `POST /chat/sessions`, `GET/POST /chat/sessions/{id}/messages` | S3, AI상담 탭 |
| 신뢰성 | `POST /feedback-reports` | AI상담 탭 |
| 헬스체크 | `GET /health` | (인증 불필요) |

**전역 규약**:
- 인증 필요한 엔드포인트는 전부 세션 쿠키 자동 사용 — `wedding_id`를 URL/바디로 절대 안
  받습니다(서버가 세션에서 자동 유도). 프론트가 `wedding_id`를 다룰 일 자체가 없습니다.
- 에러 응답 포맷 통일: `{"error": {"code": "...", "message": "..."}}` (FastAPI 기본
  `{"detail":...}` 아님 — 커스텀 핸들러가 통일해줍니다). 422 검증 실패도 동일 포맷.
- 페이지네이션 없음(1인 웨딩 규모라 전체 배열 반환).
- 금액은 전부 원 단위 정수, 날짜는 `YYYY-MM-DD`, 타임스탬프는 UTC ISO-8601 — **Asia/Seoul
  변환은 전적으로 프론트 책임**입니다(서버가 변환 안 해줌).
- 카테고리는 9개 ENUM 문자열(`VENUE`/`SDM`/`MEETING`/`HOMEWARE`/`GIFT`/`INVITATION`/
  `HONEYMOON`/`HOMENEW`/`ETC`)을 URL/쿼리에 그대로 씁니다(v3.0의 정수 `category_id` 아님).
  `ETC`도 tier는 `MOCKUP`입니다 — `03_API_spec.md` 예시에 `tier="CUSTOM"`으로 잘못 적힌 부분이
  있는데 실제로는 `MOCKUP` + `allows_custom_tag=true`(별도 불리언)입니다.

**에러 코드 → 프론트 처리가 필요한 주요 항목**:

| 코드 | HTTP | 상황 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 세션 만료/없음 → S0으로 리다이렉트 |
| `INVALID_CREDENTIALS` | 401 | 로그인 실패(이메일/비번 통합 메시지) |
| `EMAIL_ALREADY_EXISTS` | 409 | 회원가입 중복 이메일 |
| `SOCIAL_ACCOUNT_ALREADY_LINKED` | 409(리다이렉트 쿼리로 전달) | 소셜 로그인 계정 충돌 |
| `TOTAL_BUDGET_UNAVAILABLE` | 422/404 | 지역 예산평균 데이터 없음 → 직접입력 폴백 |
| `BUDGET_EXCEEDED` / `BUDGET_BELOW_PAID` | 400 | S6 저장 검증 실패 |
| `INVALID_STATUS_FOR_CATEGORY` | 422 | 체크리스트 상태값 카테고리 불일치 |
| `BENCHMARK_NOT_AVAILABLE` / `VENDOR_CASE_NOT_AVAILABLE` | 404 | MOCKUP 카테고리에 FOCUS 전용 기능 요청 시 — 정상 케이스이니 "준비 중" 안내로 처리 |
| `CHAT_SESSION_NOT_FOUND` | 404 | 세션 만료/타인 소유 |

---

## 6. 프론트가 직접 계산/구현해야 하는 로직 정리

1. **온보딩/필드변경 API 지연 대응**: `POST /weddings`, 그리고 `wedding_date` 이외 필드를
   바꾸는 `PATCH /weddings/me`나 `PUT /wedding-categories`는 서버가 LLM 개인화 재생성을
   동기로 기다린 뒤 응답합니다(수 초). 로딩 UI + 넉넉한 타임아웃 필수.
2. **`wedding_date`만 단독으로 바뀌면** LLM 호출 없이 타임라인 날짜만 결정론적으로
   재계산됩니다 — 이 경우는 빠르게 응답이 옵니다(로딩 UX를 다르게 가도 됨).
3. **사용자가 직접 수정한 체크리스트/타임라인 항목은 서버가 알아서 보호**합니다(재생성 시
   덮어쓰지 않음) — 프론트가 별도로 신경 쓸 필요 없습니다. 다만 재생성이 도는 동안 낙관적
   업데이트를 걸었다면, 재생성 완료 후 목록을 다시 fetch해서 갱신하세요.
4. **`phase_label` 계산**(§4 S4 참고) — 프론트 자체 공식 필요.
5. **S6 예산 계산**(§4 S6 참고) — 서버 API 없음, 클라이언트 계산.
6. **날짜 타임존 변환** — 서버 응답은 UTC, 화면 표시는 Asia/Seoul로 프론트가 변환.
7. **체크리스트 상태값 UI를 카테고리별로 분기**(HOMEWARE 4단계 vs 나머지 4단계, 값 자체가
   다름).

---

## 7. 디자인 시스템 — 기존 결정 그대로 유지하시면 됩니다

`frontend`의 `docs/design/decisions.md`(D1~D11)에 이미 확정된 내용과 최종 목업
(`12_final_prototype_mockup.html`)의 색이 **정확히 일치**합니다(포인트 컬러 베리 플럼
`#8b3f63` 계열) — 별도 재작업 없이 지금 프론트 브랜치의 디자인 토큰을 그대로 쓰면 됩니다.

- 색: 포인트 `#8b3f63`(+soft `#f1dee7`, hover `#77354f`) 단일, 거의 무채색 중립. 상태색
  (성공/경고/위험) 도입 안 함 — 보더/배경톤/텍스트/형태로만 상태 표현(D6 확정).
- 폰트: Wanted Sans Variable, 본문 line-height 1.6.
- 형태: 그림자 없음(Flat), 라운드 4단계(`sm 8 / md 10 / lg 16 / pill 999`).
- 레이아웃: 모바일 하단 탭바 4개(홈/타임라인/예산/리포트, 아이콘+라벨 상시 표시) + 데스크톱
  좌측 사이드바 232px 고정.
- 다크모드는 스코프 아님(계속 유지).

**남아있는 디자인 미결정 3가지**(2026-08-22 실사에서 확인됨, 구현 착수 전 확정 필요):
1. 로딩/빈/오류 상태 UI 6화면 전부 미정(특히 S3 AI상담 탭).
2. S1 폼 검증 규칙(총예산/하객수 입력 `required`/`min`/`max` 등) 미정.
3. 데스크톱 사이드바 하단 블록(아바타+이름+역할) — 로그인/계정 UI로 보이는데 확정 안 됨.
   온보딩 요약값(역할/예정일/D-day)으로 대체하는 안이 권고됨.

---

## 8. 우선순위 제안 (8/26 마감, 8/27~31 데모 준비 고려)

1. **API 연동 계층 구축** — `shared/api`부터 다시 만들어야 함(현재 0줄). 이게 가장 큰
   리스크입니다.
2. **S0 로그인 화면 + 인증 흐름** — 다른 모든 화면이 이 뒤에 있어 선행돼야 함.
3. **S2/S5 정적 데이터 → 실제 API 연동** — 화면은 이미 있으니 비교적 빠르게 끝날 수 있음.
4. **S1 온보딩 콘텐츠 구현** — 로딩 UX(§6-1) 포함.
5. **S3/S4/S6 콘텐츠 구현** — 아래 §9 미결정 사항 먼저 확정 후 착수 권장.
6. **AI상담 SSE 클라이언트** — 별도 컴포넌트로, S3에 필요한 시점에 병행 가능.

---

## 9. 팀 논의가 필요한 미결정 사항 모음

- S0 소셜 로그인 버튼: 카카오/애플도 UI만 노출할지, 구글/네이버만 노출할지(백엔드는
  구글/네이버만 실제 동작).
- 게스트 모드의 데이터 저장 범위(로컬 전용 vs 서버 연동 시점).
- S6 예산 재배분 시 비례차감 정책.
- 로딩/빈/에러 상태 디자인(전 화면 공통 컨벤션 필요).
- S1 폼 검증 규칙.
- 데스크톱 사이드바 하단 블록 내용.
- 타임라인 phase 구간을 몇 단계로 나눌지(4단계 vs 17단계).
- S5(마이 리포트)를 독립 화면으로 유지할지 S2로 흡수할지 — 이미 구현이 끝나 있으니 그대로
  유지 권장.

---

## 10. 참고 자료 경로

- API 스펙 원문: `docs/wedding/plan/new/03_API_spec.md`
- PRD: `docs/wedding/plan/new/02_PRD.md`
- 프로토타입 목업(클릭 가능): `docs/wedding/plan/new/12_final_prototype_mockup.html`
- SSOT 베이스라인: `docs/wedding/plan/new/00_BASELINE.md`
- 개인화 에이전트 설계(체크리스트/타임라인 생성 로직): `docs/wedding/plan/new/13_personalization_router_agent_design.md`
- 프론트 디자인 결정: `frontend` 브랜치 `frontend/docs/design/decisions.md`, `layout.md`, `a11y.md`
- 프론트 툴체인 조사: `frontend` 브랜치 `frontend/docs/architecture/toolchain.md`
- staging 헬스체크: `GET https://20-249-52-148.nip.io/api/v1/health`
