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
| 4-a | **`signal`을 받아 넘긴다** | 라우터가 `loader({ abortController })`로 취소 신호를 준다. 안 넘기면 사용자가 빠르게 이동할 때 **철 지난 응답이 뒤늦게 도착해 새 화면을 덮어쓴다** |
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

### 2.1 폴백하지 않는다 — 다만 **모듈 초기화에서 던지지도 않는다**

과거 코드에 `import.meta.env.VITE_API_BASE ?? ""`가 있었고, 이 폴백은 **값 부재를 조용히 삼켜 요청을 상대 경로로 떨어뜨린다.** 복원하지 않는다.

- 값이 없으면 **빌드가 실패한다** (`vite.config.ts` 게이트)
- 형식이 틀려도 **빌드가 실패한다**
- 런타임에서도 같은 함수로 한 번 더 검사한다 — 빌드 시점과 실행 시점의 값이 갈릴 수 있는 경로(주입 오류·수동 편집)를 남기지 않는다

🚨 **그런데 그 런타임 검사를 모듈 최상위에 두면 안 된다.** 초판 설계가 이랬다:

```ts
// ❌ 이렇게 하면 안 된다
const raw = import.meta.env.VITE_API_BASE;
if (checkApiBase(raw) !== null) throw new Error(...);
export const API_BASE: string = raw;
```

**세 가지가 깨진다.**

| 무엇 | 왜 |
|---|---|
| **CI 테스트가 전멸한다** | `frontend-ci.yml`의 Test 스텝에는 `env:`가 **없다**(Build 스텝에만 있다). CI에는 `.env`도 없다 — `.env.example`은 Vite가 읽지 않는다. 그래서 `VITE_API_BASE`가 `undefined`가 되고, **`shared/api`를 거치는 모든 테스트가 import 단계에서 죽는다.** 네트워크를 쓰지 않는 테스트까지 함께 죽는다 |
| **`ErrorBoundary`가 못 잡는다** | 바운더리는 렌더 중 예외를 잡는다. **모듈 평가 단계의 예외는 통과한다** — 사용자에게는 흰 화면이다. 「조용한 실패 금지」를 지키려던 코드가 가장 조용한 실패를 만든다 |
| **`vite.config.ts`가 이 파일을 못 읽는다** | Node가 모듈을 평가할 때 `import.meta.env` 접근이 함께 실행된다 |

**계약 — 검증을 최초 사용 시점으로 늦춘다.**

```ts
let resolved: string | undefined;

/** API 오리진. 최초 호출에서 검증한다. 모듈 평가 단계에서는 아무것도 하지 않는다. */
export function apiBase(): string {
  if (resolved !== undefined) return resolved;
  const raw = import.meta.env.VITE_API_BASE;
  const reason = checkApiBase(raw);
  if (reason !== null) {
    throw new ApiError({ code: "API_BASE_INVALID", message: `VITE_API_BASE: ${reason}`, status: 0, extra: {} });
  }
  resolved = raw as string;
  return resolved;
}
```

- **`ApiError`로 던진다** — 화면이 이미 아는 형태다. 별도 처리 경로를 만들지 않는다
- **요청을 보내는 코드만 이 함수를 부른다.** 네트워크를 안 쓰는 테스트는 값이 없어도 통과한다
- 실질적으로 이 예외는 **일어날 수 없다** — 빌드 게이트가 같은 함수로 먼저 막는다. 그래도 남겨 두는 이유는 빌드와 실행의 값이 갈리는 경로(수동 편집·잘못된 주입)를 조용히 넘기지 않기 위해서다

**`API_BASE`를 상수로 내보내지 않는다.** 상수는 모듈 평가 시점에 값을 요구하고, 그게 위 세 문제의 원인이다.

### 2.2 형식 규칙과 그 근거

| 규칙 | 근거 |
|---|---|
| `https://` 는 항상 허용 | — |
| `http://` 는 **루프백·사설 LAN에만** (`localhost` · `127.0.0.1` · `[::1]` · `10/8` · `172.16/12` · `192.168/16`, 2026-08-26 사설 LAN 추가) | 원격 호스트에 `http://`를 넣으면 인그레스가 308을 내는데 **그 응답에 `Access-Control-Allow-Origin`이 없어** 브라우저에서만 조용히 죽는다. `curl`은 `-L`로 따라가 성공처럼 보이므로 서버 점검으로는 못 잡는다. 사설 LAN은 인그레스 없이 uvicorn이 http로 직접 뜨는 로컬 개발 환경이라 이 실패 시나리오 자체가 없다 — 같은 와이파이의 다른 기기(휴대폰 등)에서 개발 서버를 테스트할 수 있게 하기 위한 예외다 |
| 경로 · 쿼리 · 해시 금지 | 오리진만 적고 `/api/v1`은 코드가 붙인다 |
| 자격증명(`user:pass@`) 금지 | 번들에 그대로 박힌다 |
| 끝 슬래시 금지 | 경로 조립이 `//api`가 된다 |

### 2.2-a 🚨 루프백·사설 LAN 허용이 만드는 구멍 — 배포 빌드는 한 겹 더 막는다

§2.2가 `http://localhost`(+사설 LAN)를 허용하므로, **로컬/LAN 값을 그대로 둔 채 배포 빌드를 돌리면 게이트가 통과시킨다.** 앱은 아무 데도 붙지 못하는데 빌드는 초록불이다 — 조용한 실패다.

`.env.example`이 로컬 기본값(`http://localhost:8000`)을 담고 있어 이 경로는 **가정이 아니라 기본 경로**다. 템플릿을 복사한 사람이 아무것도 안 고치면 그대로 통과한다.

**막는 방법 — 검사를 두 단계로 나눈다.**

| 단계 | 규칙 |
|---|---|
| 형식 검사 (`checkApiBase`) | 항상 — 루프백·사설 LAN 허용 |
| **배포 검사** (`isLocalOnlyApiBase`) | 프로덕션 빌드에서만 — **http:// 면(루프백이든 사설 LAN이든) 실패** |

배포 검사는 `assert-production-build` 게이트 옆에 둔다. 그 게이트가 이미 「프로덕션 빌드인가」를 판정하고 있으므로 판정 로직을 두 벌 두지 않는다.

```
개발 빌드   : http://localhost:8000       통과
개발 빌드   : http://192.168.45.191:8001  통과 (사설 LAN, 2026-08-26)
프로덕션 빌드: http://localhost:8000       ❌ 실패 — "배포 빌드에 로컬 전용 주소(루프백·사설 LAN)가 들어 있다"
프로덕션 빌드: http://192.168.45.191:8001  ❌ 실패 — 위와 동일 사유
프로덕션 빌드: https://<host>              통과
```

**루프백·사설 LAN을 형식 검사에서 아예 막지 않는 이유**는 그러면 로컬/같은 와이파이 개발이 성립하지 않기 때문이다. 허용 범위는 그대로 두고 **적용 시점을 나눈다.** (함수 이름도 `isLoopbackApiBase` → `isLocalOnlyApiBase`로 개명 — 사설 LAN이 판정 범위에 들어오며 "루프백"만으로는 더 이상 정확한 이름이 아니었다.)

### 2.3 구현 — 정규식이 아니라 URL 파서

> ⚠️ 아래는 핵심 로직을 보여주는 **단순화 발췌**다(사설 LAN 판정용 `isPrivateLanHost` 정규식은
> 생략). 정확한 최신 구현은 `src/shared/api/api-base.ts`를 본다 — 여기 코드를 복사해서 쓰지 않는다.

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

### 2.6 🚨 CI 는 이 값을 **빌드 스텝에만** 준다

`frontend-ci.yml` 실측(2026-08-25):

| 스텝 | `env:` | 결과 |
|---|---|---|
| Typecheck · Lint · **Test** | **없음** | `VITE_API_BASE`가 `undefined` |
| Build | `VITE_API_BASE: ${{ secrets.VITE_API_BASE }}` | 주입됨 |

**CI 러너에는 `.env`도 없다** — `.env.example`은 Vite가 읽지 않는다(`.env` · `.env.local` · `.env.[mode]` 계열만 읽는다). 로컬에서는 `.env`가 있어 vitest도 값을 보므로(`MODE="test"`로 실측) **이 차이가 로컬에서 드러나지 않는다.**

→ **테스트가 `apiBase()`를 호출하지 않게 짜는 것이 계약이다.** §2.1의 지연 검증이 이걸 성립시킨다. 네트워크를 스텁하는 테스트는 `fetch`를 가로채므로 실제로 오리진이 필요 없다.

#### 포크 PR — 새 게이트가 만드는 새 실패

시크릿은 **존재한다**(`gh secret list` 확인, 2026-08-21 생성). 그래서 일반 PR·푸시 빌드는 값을 받는다. **포크에서 온 PR에는 GitHub이 시크릿을 전달하지 않는다** — 지금 CI는 그 경우 경고만 남기고 통과시킨다:

> `::warning::VITE_API_BASE가 비어 있다 — 포크 PR이거나 시크릿 미설정. API 호출이 상대 경로로 나간다.`

**이 문구는 이제 거짓이다.** 「상대 경로로 나간다」는 `?? ""` 폴백을 전제한 서술인데 폴백을 없앴다. 그리고 §2.2의 게이트는 빈 값이면 **빌드를 실패시킨다** → 포크 PR CI가 빨간불이 된다.

**계약 — 포크는 더미 오리진으로 빌드만 검증한다.** 포크 PR은 어차피 배포되지 않으므로 산출물의 오리진이 의미 없다. 대신 **비포크에서 값이 비면 경고가 아니라 실패**여야 한다 — 그건 배포되는 산출물이 아무 데도 못 붙는다는 뜻이다.

```yaml
- name: Build
  env:
      VITE_API_BASE: ${{ secrets.VITE_API_BASE }}
  run: |
      if [ -z "$VITE_API_BASE" ]; then
        if [ "${{ github.event.pull_request.head.repo.fork }}" = "true" ]; then
          echo "::warning::포크 PR — 시크릿이 없어 더미 오리진으로 빌드만 검증한다(배포되지 않는다)."
          export VITE_API_BASE="https://fork-pr.invalid"
        else
          echo "::error::VITE_API_BASE 시크릿이 없다 — 배포 산출물이 아무 데도 붙지 못한다."
          exit 1
        fi
      fi
      npm run build
```

⚠️ **게이트를 켜기 전에 시크릿 **값**이 새 형식 규칙을 통과하는지 확인해야 한다.** 시크릿 값은 읽을 수 없으므로(설계상 그렇다) `workflow_dispatch`로 한 번 돌려 확인한다. 끝 슬래시나 경로가 붙어 있으면 **그 순간부터 모든 빌드가 실패**한다.

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

### 3.7 🚨 `beforeLoad`는 캐시되지 않는다 — 세션 조회를 그대로 두면 네비게이션마다 왕복한다

TanStack Router 내부 문서 원문 (`packages/router-core/INTERNALS.md` 의 「beforeLoad: execution and hydration」 절):

> *"The beforeLoad context is **not a cache**. A completed client preload never stores reusable beforeLoad output; when loader data enters the route cache, the merged context is discarded. **A subsequent navigation rebuilds merged context from the parent and reruns beforeLoad**, even when reusing completed loader data."*

→ §3.5처럼 `_authed.beforeLoad`에서 `getMe()`를 그냥 부르면 **탭을 옮길 때마다 `GET /auth/me` 왕복이 하나씩 붙는다.** 로컬에서는 수 ms라 안 보이고, 배포에서는 매 이동에 수백 ms가 얹힌다.

(`loader`는 다르다 — `staleTime`/`gcTime`으로 캐시된다. 그런데 리다이렉트 판정은 자식 로더가 돌기 **전에** 끝나야 하므로 `beforeLoad`에 있어야 한다.)

**계약 — 세션 조회에 캐시를 씌우고, 가드는 그 캐시를 읽는다.**

```ts
// entities/session/model/session-cache.ts
let cached: { user: AuthUser; at: number } | null = null;
const TTL_MS = 60_000;

export async function loadSession(): Promise<AuthUser> {
  if (cached !== null && Date.now() - cached.at < TTL_MS) return cached.user;
  const user = await getMe();
  cached = { user, at: Date.now() };   // 성공만 캐시한다
  return user;
}

export function invalidateSession(): void {
  cached = null;
}
```

| 규칙 | 이유 |
|---|---|
| **성공만 캐시한다** | 실패를 캐시하면 로그인 직후에도 TTL 동안 튕긴다. 실패 시 재조회는 낭비가 아니다 — 어차피 곧바로 `/login`으로 가고 거기엔 가드가 없다 |
| **TTL 60초** | 세션 수명은 30일이지만, 다른 탭에서 로그아웃한 경우가 이 창만큼 늦게 반영된다. 네비게이션 왕복 제거와 신선도의 절충값이다 |
| **`login`·`signup`·`logout`이 무효화한다** | 상태가 바뀌는 지점이 명시적이다 |
| **401을 만나면 무효화한다** | 세션이 사용 중 만료되면(30일째) 캐시가 거짓을 말한다 |

#### 401 무효화 배선 — 레이어를 거스르지 않는 방법

`shared/api`가 `entities/session`을 import하면 **하향 규칙을 어긴다**(oxlint가 막는다). 구독으로 뒤집는다.

```ts
// shared/api/client.ts — shared 는 누가 듣는지 모른다
const unauthorizedHandlers = new Set<() => void>();
export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}
// send() 안에서 401 일 때: unauthorizedHandlers.forEach((h) => h());

// app/main.tsx — 배선은 조립 레이어가 한다
onUnauthorized(invalidateSession);
```

**`entities/session`이 모듈 로드 부작용으로 스스로 등록하지 않는다.** 그러면 배선이 import 순서에 숨고, 트리셰이킹으로 조용히 사라질 수 있다. 조립은 `app`의 일이다.

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

### 4.5 로딩·에러 화면 — 계약은 정하고 시각은 미정으로 남긴다

`staleTime`의 **기본값은 0**이다(공식: *"The default staleTime is 0, causing background reloads on every route match."*). 그리고 라우터는 **`defaultPendingComponent`가 없으면 펜딩 타이머를 시작조차 하지 않고 Suspense 경계도 만들지 않는다**(ADR 0005가 기록해 둔 사실).

지금까지는 데이터가 합성 상수라 문제가 없었다. **실제 네트워크가 붙으면 모든 라우트에 대기 구간이 생기고, 그동안 화면은 이전 화면 그대로 멈춰 있는다** — 사용자에게는 「눌렀는데 아무 일도 안 일어난다」로 보인다.

| 정한 것 | 미정 |
|---|---|
| 라우트마다 `staleTime`을 **명시한다** — 기본값 0에 기대지 않는다 | 각 라우트의 구체값(데이터 성격별) |
| `defaultPendingComponent` · `defaultErrorComponent`를 **둔다** | 그 시각 디자인 |
| 로더는 `abortController.signal`을 전송 계층에 넘긴다(§1.2 #4-a) | — |

🚨 **시각 디자인을 여기서 지어내지 않는다.** 로딩·에러 상태의 근거가 `design/layout.md`에 **0건**이고, 값을 발명하는 것은 이 저장소가 금지한 행위다. **디자인 오너 결정이 선행되어야 한다** — 그전까지는 접근성만 지키는 최소 형태(`role="status"` / `role="alert"` + 텍스트)로 둔다.

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
