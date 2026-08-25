# 백엔드 연동 — 전송 계층 · 인증 · 브라우저 지원

> **성격** 적용 설계. 규범이 아니라 **이 저장소가 백엔드에 어떻게 붙기로 했는지와 그 근거**다.
> **결정 근거** [ADR 0007](../adr/0007-백엔드-연동-아키텍처를-확정한다.md)
> **짝 문서** [api-contract.md](api-contract.md) (무엇을 부르는가) · [chat-streaming.md](chat-streaming.md) (SSE)
> **최종 갱신** 2026-08-25 · 백엔드 기준 커밋 **`474800c`** (계약 표면은 `faf91b8` 대비 무변경 — 바뀐 것은 개인화 프롬프트뿐)
>
> ⚠️ 이 문서는 **`frontend/` 밖을 규범적 근거로 인용하지 않는다.** 백엔드 소스에서 확인한 사실은
> 파일·줄 번호를 **인용값으로** 적되, 그것이 규범이 아니라 **관측된 사실**임을 명시한다.
> 백엔드는 빠르게 움직인다 — 인용값은 §7의 절차로 다시 잰다.

---

## 1. 전송 계층 — `shared/api`

### 1.1 배치

```
shared/api/
  client.ts     apiFetch · apiFetchMultipart — 전송 하나
  errors.ts     ApiError — { code, message, status, extra }
  env.ts        checkApiBase(순수 함수) · API_BASE
  contract.ts   백엔드 Literal 사본 (계약 어휘)
  index.ts      공개 표면
entities/session/api/   auth 6종
entities/wedding/api/   웨딩 · 예산 · 체크리스트 · 타임라인 · 대시보드 · 리포트 · 벤치마크 · 개인화 · 업체사례
entities/chat/api/      상담 세션 · 메시지 · SSE · 평가
```

**슬라이스가 3개인 이유와 `contract.ts`가 `shared`에 있는 이유는 ADR 0007 §D1.** 요약하면 — 백엔드 응답(`DashboardSummaryOut` · `ReportOut`)이 도메인을 가로지르는데 `.oxlintrc.json`이 entities 간 import를 차단하므로, 웨딩 도메인은 한 슬라이스여야 하고 공용 Literal은 최하층에 있어야 한다.

### 1.2 `apiFetch`가 강제하는 계약 5가지

```ts
export async function apiFetch(path: string, init?: RequestInit): Promise<unknown>
export async function apiFetchMultipart(path: string, form: FormData): Promise<unknown>
```

| # | 계약 | 이유 |
|---|---|---|
| 1 | **`credentials: "include"`를 내장한다** — 호출자가 끌 수 없다 | 인증이 쿠키 세션이라 빠뜨리면 대부분의 엔드포인트가 401/404. 옵션으로 두면 반드시 빠뜨린다 |
| 2 | **`...init`을 먼저 펼치고 `headers`를 뒤에 둔다** | [layers.md 부록 A](layers.md#부록--배치-조사-중-함께-발견한-결함)가 **똑같은 버그로 한 번 데였다.** 당시엔 아무도 헤더를 안 넘겨 잠복이었지만 지금은 즉시 발현한다 |
| 3 | **응답 타입은 `unknown`** — 좁히는 것은 슬라이스의 몫 | 백엔드 스펙을 그대로 믿지 않는다. 근거는 [api-contract.md](api-contract.md) §6.2 |
| 4 | **에러는 `status`가 아니라 `code`로 분기한다** | 같은 코드가 두 status로 온다 — `TOTAL_BUDGET_UNAVAILABLE`이 한 곳에서는 404, 다른 곳에서는 422 |
| 5 | **멀티파트는 `apiFetch`를 태우지 않는다** | `FormData`는 브라우저가 boundary를 포함한 `Content-Type`을 **자동 설정해야** 한다. JSON 래퍼를 태우면 깨진다. 부록 A가 이것을 *"의도된 설계"*로 명시했다 |

**#5는 이제 가정이 아니라 실제 수요다** — 백엔드에 `POST /payments/receipt-extract`(영수증 이미지 업로드)가 신설됐다.

### 1.3 에러 정규화

백엔드 에러 바디는 예외 없이 이 모양이다.

```json
{ "error": { "code": "WEDDING_NOT_FOUND", "message": "…", "…extra": "…" } }
```

`apiFetch`는 이것을 `ApiError`로 바꾼다.

```ts
class ApiError extends Error {
  readonly code: string;      // 분기의 기준 — status 가 아니다
  readonly status: number;    // 로깅·진단용
  readonly extra: Record<string, unknown>;  // BUDGET_BELOW_PAID 의 min_required 등
}
```

**주의 3가지**

- Pydantic 검증 실패는 전부 `422 VALIDATION_ERROR`로 통일되고, `message`는 **영어일 수 있다.** 사용자에게 그대로 보여주지 않는다
- `api_error` 포맷이 아닌 예외(라우팅 404 등)는 `INTERNAL_ERROR`로 감싸진다 — 즉 **`code`가 항상 의미 있는 값은 아니다**
- SSE 스트림의 에러는 **HTTP 상태가 아니라 `event: error`로 온다** → [chat-streaming.md](chat-streaming.md) §5

---

## 2. 환경변수 — `VITE_API_BASE`

### 2.1 폴백하지 않는다

과거 코드에 `import.meta.env.VITE_API_BASE ?? ""`가 있었고, 이 폴백은 **값 부재를 조용히 삼켜 요청을 상대 경로로 떨어뜨린다.** 복원하지 않는다.

- 값이 없으면 **빌드가 실패한다** (`vite.config.ts` 게이트)
- 형식이 틀려도 **빌드가 실패한다**
- 런타임에서도 같은 함수로 한 번 더 검사한다 — 빌드 시점과 실행 시점의 값이 다를 수 있는 경로(주입 오류·수동 편집)를 남기지 않는다

### 2.2 형식 규칙과 그 근거

| 규칙 | 근거 |
|---|---|
| `https://` 는 항상 허용 | — |
| `http://` 는 **루프백에만** (`localhost` · `127.0.0.1` · `[::1]`) | 원격 호스트에 `http://`를 넣으면 인그레스가 308을 내는데 **그 응답에 `Access-Control-Allow-Origin`이 없어** 브라우저에서만 조용히 죽는다. `curl`은 `-L`로 따라가 성공처럼 보이므로 서버 점검으로는 못 잡는다 |
| 경로 · 쿼리 · 해시 금지 | 오리진만 적고 `/api/v1`은 코드가 붙인다 |
| 자격증명(`user:pass@`) 금지 | 번들에 그대로 박힌다 |
| 끝 슬래시 금지 | 경로 조립이 `//api`가 된다 |

### 2.2-a 🚨 루프백 허용이 만드는 구멍 — 배포 빌드는 한 겹 더 막는다

§2.2가 `http://localhost`를 허용하므로, **로컬 값을 그대로 둔 채 배포 빌드를 돌리면 게이트가 통과시킨다.** 앱은 아무 데도 붙지 못하는데 빌드는 초록불이다 — 조용한 실패다.

`.env.example`이 로컬 기본값(`http://localhost:8000`)을 담고 있어 이 경로는 **가정이 아니라 기본 경로**다. 템플릿을 복사한 사람이 아무것도 안 고치면 그대로 통과한다.

**막는 방법 — 검사를 두 단계로 나눈다.**

| 단계 | 규칙 |
|---|---|
| 형식 검사 (`checkApiBase`) | 항상 — 루프백 허용 |
| **배포 검사** | 프로덕션 빌드에서만 — **루프백이면 실패** |

배포 검사는 `assert-production-build` 게이트 옆에 둔다. 그 게이트가 이미 「프로덕션 빌드인가」를 판정하고 있으므로 판정 로직을 두 벌 두지 않는다.

```
개발 빌드   : http://localhost:8000  통과
프로덕션 빌드: http://localhost:8000  ❌ 실패 — "배포 빌드에 루프백 주소가 들어 있다"
프로덕션 빌드: https://<host>         통과
```

**루프백을 형식 검사에서 아예 막지 않는 이유**는 그러면 로컬 개발이 성립하지 않기 때문이다. 허용 범위는 그대로 두고 **적용 시점을 나눈다.**

### 2.3 구현 — 정규식이 아니라 URL 파서

```ts
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function checkApiBase(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "")
    return "VITE_API_BASE 가 비어 있다 — 폴백하지 않고 여기서 멈춘다";
  let u: URL;
  try { u = new URL(v); } catch { return `URL 로 해석되지 않는다: ${JSON.stringify(v)}`; }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    return `지원하지 않는 스킴: ${u.protocol}`;
  if (u.protocol === "http:" && !LOOPBACK.has(u.hostname))
    return `http:// 는 루프백에만 허용한다 (호스트 ${u.hostname}) — 원격은 https:`;
  if (u.username || u.password) return "자격증명을 URL 에 넣지 않는다";
  if (u.pathname !== "/") return `경로를 넣지 않는다 (${u.pathname}) — 오리진만 적는다`;
  if (u.search || u.hash) return "쿼리·해시를 넣지 않는다";
  if (v.endsWith("/")) return "끝 슬래시 금지 — 경로 조립이 //api 가 된다";
  return null;
}
```

**정규식판을 기각한 이유는 21 케이스를 실제로 돌려 봤기 때문이다.**

| 결함 | 정규식판 | URL 파서판 |
|---|---|---|
| `HTTPS://HOST` (대문자 스킴) | ❌ 과차단 — RFC 3986상 스킴은 대소문자 무관 | 통과 |
| `http://[::1]:8000` | ❌ 모름 | 통과 |
| `file:///etc/passwd` · `javascript:alert(1)` | 「경로·쿼리·해시 금지」로 **오진** | 「지원하지 않는 스킴」으로 정확히 진단 |
| 오류 메시지 | 1종 | 원인별 8종 |

**검사 순서가 중요하다.** 초판은 「끝 슬래시」를 맨 앞에서 검사해 `javascript:alert(1)`을 「경로 금지」로 오진했다. 원인이 아닌 증상을 진단하면 사용자를 엉뚱한 곳으로 보낸다. 순서는 **빈 값 → 파싱 → 스킴 → 호스트 → 자격증명 → 경로 → 쿼리/해시 → 끝 슬래시** 다.

### 2.4 같은 함수를 빌드와 런타임이 함께 쓴다

`vite.config.ts`(Node)와 `shared/api/env.ts`(브라우저)가 **같은 순수 함수**를 import한다. 두 벌로 두면 판정이 갈리고, 갈린 것을 아무도 모른다.

### 2.5 `.env.example`

`frontend/.env.example`은 **프론트 전용이 아니라 저장소 공용 템플릿**이다(Azure · PostgreSQL · AKS · SWA · 백엔드 변수가 함께 있다). 프론트 변수만 남기자고 정리하지 않는다.

프론트가 읽는 변수는 **`VITE_API_BASE` 하나뿐**이다(`src/vite-env.d.ts`). Vite는 `VITE_` 접두사만 클라이언트에 노출하므로 나머지 변수는 프론트 빌드에 아무 영향이 없다 — **거기에 값을 채워도 백엔드가 읽지 않는다**(백엔드는 `backend/.env`를 읽는다).

---

## 3. 인증 · 세션 · 라우트 가드

### 3.1 세션 계약 (관측된 사실)

| 속성 | 값 |
|---|---|
| 쿠키 이름 | `wr_session` |
| 값 형태 | 불투명 랜덤 토큰 — **JWT가 아니다** |
| `HttpOnly` | **true** → **JS로 읽을 수 없다** |
| `Secure` | true |
| `SameSite` | **`none`** — 2026-08-25 적용됨(§6.1). `Secure` 필수 조건은 이미 충족돼 있었다 |
| `Domain` | 미지정 → host-only |
| `Max-Age` | 2,592,000초 = **30일** |

**갱신(rotation) 정책이 없다.** 슬라이딩 만료도, refresh 토큰도 없다. `expires_at`은 발급 시점 +30일 **절대값**이다.

→ **30일째에 사용 중이라도 그냥 튕긴다. 프론트는 아무 API에서나 401이 올 수 있다고 가정해야 한다.**

### 3.2 라우트 트리

```
root  (스킵 링크)
 ├── /login                    ← 셸 밖 · 세션 가드 없음 (§3.3)
 └── _authed                   ← 경로 없는 가드: GET /auth/me → 401 이면 /login
      ├── /onboarding          ← 셸 밖 (design/layout.md §1 "온보딩은 크롬이 없다")
      │      beforeLoad: has_wedding === true → /
      └── _shell (AppShell)
             beforeLoad: has_wedding === false → /onboarding
             ├── /  /category/$id  /timeline  /budget  /report  /style-guide
```

**두 판정을 두 층으로 나눈 것이 핵심이다.** 한 층에서 「세션 없으면 /login, 웨딩 없으면 /onboarding」을 함께 처리하면 `/onboarding` 자신이 그 가드 아래 있으므로 **무한 리다이렉트**가 된다.

- `_authed` — **세션만** 판정
- `_shell` — **웨딩 유무만** 판정
- `/onboarding` — 이미 웨딩이 있으면 되돌려 보낸다

### 3.3 `/login`에 세션 가드를 두지 않는 이유

진입 플로우는 이렇게 정해졌다.

1. `/` 진입 → 미인증이면 `/login`
2. 로그인 또는 회원가입
3. **회원가입 성공 시, 로그인 폼에 방금 쓴 이메일·비밀번호를 자동 채움**
4. 로그인 버튼 → `has_wedding === false` 면 `/onboarding`, `true` 면 `/`

**3번이 가드를 막는다.** `POST /auth/signup`은 **201과 함께 이미 세션 쿠키를 발급한다.** `/login`에 「세션 있으면 튕김」 가드를 두면 **가입 직후 로그인 폼에 도달할 수 없다.**

가드를 빼면 플로우가 그대로 성립하고, 로그인이 새 세션을 발급해도 **누적될 뿐 무해하다**(백엔드는 로그인·가입·소셜 콜백마다 세션 행을 추가할 뿐 기존 것을 폐기하지 않는다).

**덤으로 이 순서가 백엔드 결함 하나를 우회한다** — `signup` 응답의 `has_wedding`은 **항상 `false` 하드코딩**이라 신뢰할 수 없는데, 가입 → 로그인 순서라 **판정을 항상 `login` 응답으로 하게 된다.**

### 3.4 비밀번호 자동 채움 — 저장 금지 계약

평문 비밀번호를 잠시 보유하는 경로다. 규칙을 코드로 못 박는다.

- **`localStorage` · `sessionStorage` · 쿠키 · URL 쿼리 금지.** 라우터 네비게이션 state의 **메모리 값**으로만 전달한다
- **1회 소비 후 즉시 폐기** — 로그인 폼이 마운트 시 읽고 state를 비운다(뒤로가기로 되살아나지 않게)
- 새로고침하면 사라진다 (의도된 동작)
- 입력에 `autoComplete="email"` / `"current-password"`를 정확히 부여해 브라우저 암호 관리자와 충돌하지 않게 한다

### 3.5 401과 `WEDDING_NOT_FOUND`를 한 곳에서 처리한다

전역 `fetch` 인터셉터를 두지 않는다. `apiFetch`는 `ApiError`를 **던지기만** 하고, **가드 라우트가 그것을 리다이렉트로 번역**한다.

```ts
beforeLoad: async ({ location }) => {
  try {
    const me = await getMe();          // 401 이면 ApiError
    return { me };
  } catch (e) {
    if (isRedirect(e)) throw e;        // 의도적 리다이렉트는 통과시킨다
    throw redirect({ to: "/login", search: { redirect: location.href } });
  }
}
```

`isRedirect()`로 **의도적 리다이렉트와 실제 오류를 구분**하지 않으면, 리다이렉트가 `catch`에 걸려 다시 리다이렉트되는 루프가 생긴다.

### 3.6 소셜 로그인

- **`fetch`로 부르면 안 된다.** `window.location.href = ${API_BASE}/api/v1/auth/google/login` — 307 리다이렉트 + 쿠키 설정이라 XHR로는 성립하지 않는다
- 지원 제공자는 **구글 · 네이버 2종**뿐이다(카카오는 코드에 없다)
- 왕복 제한 시간이 있다 — state 쿠키의 수명이 **600초**다. 10분을 넘기면 실패한다
- **성공 시 콜백이 토큰이나 사용자 정보를 쿼리로 넘겨주지 않는다.** 프론트 루트(`/`)로 리다이렉트될 뿐이므로, **`/` 진입 시 `GET /auth/me`로 확인**해야 한다 — §3.2의 `_authed` 가드가 그 일을 이미 한다
- **실패 시 `{프론트}/login?oauth_error=<코드>`로 온다.** 그래서 `/login` 라우트가 **반드시** 있어야 한다

`oauth_error` 값은 **대소문자가 섞여 있다** — `unsupported_provider` · `denied` · `state_missing` · `state_invalid` · `state_mismatch` · `upstream_failed`(소문자 snake)와 `EMAIL_ALREADY_EXISTS` · `SOCIAL_ACCOUNT_ALREADY_LINKED` · `UPSTREAM_LLM_ERROR` · `UNKNOWN_ERROR`(대문자)가 함께 온다. **매핑 테이블에 원문 그대로 넣는다.**

---

## 4. 브라우저 지원

### 4.1 매트릭스

| 브라우저 | 기본 설정 | 판정 |
|---|---|---|
| **Chrome** (데스크톱 · Android) | 서드파티 쿠키 허용 | ✅ 지원 |
| **Edge** (데스크톱) | Tracking prevention **Balanced** | ✅ 지원 |
| Chrome **시크릿 모드** | 서드파티 쿠키 차단 | ⚠️ 감지 후 안내 |
| Edge **Strict** · 3P 쿠키 차단 토글 | 차단 | ⚠️ 감지 후 안내 |
| Safari / iOS | ITP | ❌ 미지원 |
| Firefox | Total Cookie Protection | ❌ 미지원 |

근거는 [ADR 0007 §C](../adr/0007-백엔드-연동-아키텍처를-확정한다.md)에 공식 원문으로 있다.

### 4.2 🔍 Edge InPrivate는 Chrome 시크릿과 다르다

> Microsoft Learn: *"By default, **InPrivate windows in Microsoft Edge use the same tracking prevention settings as regular windows**."*

**Edge InPrivate는 통과하는데 Chrome 시크릿은 막힌다.** 「사생활 보호 창에서는 안 된다」로 뭉뚱그리면 틀린다. 안내 문구와 테스트 매트릭스를 여기에 맞춘다.

### 4.3 감지는 UA가 아니라 행동으로 한다

```
로그인 200 성공  →  즉시 GET /auth/me (credentials: include)
                     ├─ 200 → has_wedding 으로 분기
                     └─ 401 → 쿠키가 왕복하지 못했다 → 미지원 안내
```

UA 스니핑을 쓰지 않는 이유 셋:

- **Chrome 시크릿 모드는 UA가 같다.** UA로는 못 잡는다
- 사용자가 설정에서 직접 끈 경우도 같다
- Edge · Whale 등 Chromium 파생을 잘못 배제할 위험이 없다

**이 프로브는 검증 절차를 제품 코드로 승격시킨 것이다.** 원래 `SameSite` 수정이 반영됐는지 확인하는 수동 절차(*"브라우저 오리진에서 `fetch('…/auth/me', {credentials:'include'})` — 401이면 확정"*)였는데, 이제 **모든 로그인에서 자동으로 돈다.**

비용은 로그인당 요청 1회다. 로그인 응답이 이미 사용자 정보를 주므로 데이터 때문이 아니라 **쿠키 왕복 확인**만을 위한 호출이다.

### 4.4 `build.target`

`["chrome126", "edge126"]` — 근거는 [ADR 0007 §D6](../adr/0007-백엔드-연동-아키텍처를-확정한다.md).

**번들 이득 때문이 아니다.** 5개 타깃을 실제로 빌드해 재 본 결과 JS는 오히려 8~23 B 늘고 CSS만 20 B 준다. 올리는 이유는 `@starting-style`(117) · `light-dark()`(123) · `anchor-*`(125)가 **하한 안으로 들어와 「조용히 무시되는」 실패 경로가 사라지는 것**이다.

---

## 5. 🚨 로컬이 가리는 것

연동 작업은 로컬(`http://localhost:8000`)에서 한다. **로컬은 다음을 재현하지 않는다** — 배포하는 순간 전부 되살아난다.

| # | 로컬에서 안 보이는 것 | 왜 | 배포 시 결과 |
|---|---|---|---|
| 1 | **크로스 사이트 쿠키** | 포트는 site 정의에 안 들어가 `localhost:5173`↔`localhost:8000`은 **same-site** | `SameSite=Lax`면 로그인 후 전부 401 |
| 2 | **혼합 콘텐츠 · CSP** | 로컬은 `http://` 라 CSP `connect-src`가 걸리지 않는다 | SWA(`https://`)에서 `http://` API는 차단 |
| 3 | **OAuth 리다이렉트 고정** | 로컬 백엔드는 프론트 URL 기본값이 `localhost:5173` | 배포 백엔드는 SWA 고정 — 다른 오리진에서 시작하면 튕긴다 |
| 4 | **SSE 프록시 타임아웃** | 로컬은 uvicorn 직결이라 nginx가 없다 | 인그레스 `proxy-read-timeout` 60초 — 무음이 길면 종료 이벤트 없이 끊긴다 |

**#4는 새로 확인한 항목이다.** 그래서 [chat-streaming.md](chat-streaming.md) §4의 복구 경로는 **로컬 테스트로 검증할 수 없고**, 계약 픽스처로만 고정된다.

---

## 6. 백엔드 변경 2건 — ✅ 적용 완료 (2026-08-25)

프론트가 고칠 수 없는 것이었고, 백엔드 워크트리(`feature/linked_frontend`)에서 **적용했다.** 아래는 무엇을 왜 바꿨는지의 기록이다 — 되돌리려는 사람이 이유를 알 수 있어야 한다.

### 6.1 ✅ `samesite="lax"` → `"none"` (발급 · 삭제 양쪽)

- **발급** — 세션 쿠키를 내리는 곳 한 군데(`routers/auth.py`의 `_set_session_cookie`). 이미 `secure=True`라 조건은 충족된다
  > MDN: *"Send the cookie with both cross-site and same-site requests. **The `Secure` attribute must also be set when using this value.**"*
- **삭제** — `delete_cookie`를 인자 없이 부르면 프레임워크 기본값(`secure=False`, `samesite="lax"`)으로 나간다. **속성이 다르면 브라우저가 같은 쿠키로 인식하지 않아 삭제가 안 먹는다.** 실측한 현재 응답에는 `Secure`가 아예 없다

> `wr_oauth_state`는 **그대로 둔다** — IdP→백엔드 top-level 네비게이션에서만 쓰이므로 Lax로 정상 동작한다. 바꾸면 보안만 느슨해진다.

**설정 손잡이를 만들지 않는다.** 원래 `SESSION_COOKIE_SAMESITE` 환경변수를 제안했으나 **철회했다.** 그 유일한 논거가 「로컬에서 문제가 생기면 회피」였는데, Chrome 151에서 `SameSite=None; Secure` 쿠키가 `http://localhost` 오리진 간에 **정상 왕복함을 실측**했다. 손잡이를 남기면 ① 누군가 `lax`로 되돌릴 구멍이 생기고 ② 테스트 대상이 2배가 된다.

**실측 방법** (재현 가능):

```
포트 A(프론트 역할) 페이지 → 포트 B(API 역할)에 credentials 포함 fetch
  B가 SameSite=None; Secure; HttpOnly 쿠키를 내림
  → 다음 요청의 Cookie 헤더에 그 쿠키가 실려 오는지 확인
결과: 실려 온다 (Chrome 151). document.cookie 는 빈 문자열 — HttpOnly 정상.
```

### 6.2 ✅ `backend/.env.example`의 OAuth 백엔드 URL 오타

템플릿이 `http://localhost:8001`을 적고 있으나 코드 기본값과 원본 브랜치는 **8000**이다. 이 값은 IdP 콘솔의 redirect URI와 **문자 그대로** 일치해야 하므로, 템플릿을 복사해 `.env`를 만들고 8000으로 서버를 띄우면 **소셜 로그인이 IdP 단계에서 `redirect_uri_mismatch`로 멈춘다.**

---

### 6.3 적용 시 함께 처리한 것

- **`main.py` 독스트링**이 쿠키를 `SameSite=Lax`로 서술하고 있어 함께 고쳤다. 코드만 바꾸면 문서가 조용히 거짓말을 한다
- **`wr_oauth_state`는 건드리지 않았다** — IdP→백엔드 top-level 네비게이션 전용이라 Lax로 정상 동작하고, `none`으로 바꾸면 보안만 느슨해진다
- **환경변수 손잡이(`SESSION_COOKIE_SAMESITE`)를 만들지 않았다.** 그 유일한 논거였던 「로컬에서 문제가 생기면 회피」가 실측으로 사라졌기 때문이다(§6.1). 손잡이는 되돌릴 구멍만 만든다
- 검증: `ruff check`/`ruff format` 통과 · `pytest`가 **수정 전후 동일**(`15 failed / 180 passed / 26 errors` — 전부 로컬 `DATABASE_URL` 미설정 탓임을 stash 대조로 확인)

## 7. 이 문서의 갱신

백엔드는 하루에 여러 커밋이 들어갈 만큼 빠르게 움직인다. **여기 적힌 인용값(줄 번호 · 필드명 · 기본값)은 관측 시점의 사실이지 보증이 아니다.**

```bash
# 백엔드가 움직였는가 (백엔드 워크트리에서)
git fetch origin backend --quiet
git rev-list --count HEAD..origin/backend        # 0 이 아니면 이 문서의 기준이 낡았다

# 계약 표면이 바뀌었는가
git diff --stat <이 문서의 기준 커밋> origin/backend -- backend/app/schemas/ backend/app/routers/ backend/app/models/ backend/alembic/
#   비어 있어도 rag/·personalization/ 변경은 "동작"을 바꾼다 — 스키마 무변경 = 무영향이 아니다

# SameSite 수정이 반영됐는가 (계정 불필요 — 로그아웃은 쿠키 없이도 200/204)
curl -s -D - -o /dev/null -X POST "$API_BASE/api/v1/auth/logout" | grep -i set-cookie
#   → SameSite=none 그리고 Secure 가 함께 보여야 한다
```

**서버 점검이 초록이어도 브라우저에서 죽을 수 있다.** 최종 확인은 반드시 **브라우저 오리진에서** 한다 — §4.3의 프로브가 그 역할을 제품 안에서 수행한다.
