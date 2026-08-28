# 백엔드 연동 ① 전송 계층 + 인증 수직 관통 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 회원가입·로그인을 하면 세션이 유지되고, 라우터 가드가 로그인/온보딩/홈으로 정확히 분기하는 상태까지 만든다.

**Architecture:** `shared/api`에 전송 계층 하나(`apiFetch`)를 두고 도메인 호출은 `entities/{slice}/api/`에 둔다. 인증 판정은 전역 인터셉터가 아니라 **경로 없는 가드 라우트 2층**(`_authed` = 세션, `_shell` = 웨딩 유무)이 담당하며, TanStack Router의 `beforeLoad` + `throw redirect()`를 쓴다. 데이터 라이브러리는 추가하지 않는다 — 로더·캐시 기계가 이미 번들에 있다.

**Tech Stack:** React 19 · TypeScript 7 · Vite 8 · TanStack Router 1.170.31 · Base UI · Tailwind v4 · Vitest 4 + Testing Library

**Spec:** `frontend/docs/adr/0007-백엔드-연동-아키텍처를-확정한다.md` · `frontend/docs/architecture/backend-integration.md` · `frontend/docs/architecture/api-contract.md`

---

## 이 계획의 범위 — 전체 연동을 6개로 쪼갠 것 중 첫 번째

스펙이 전송 계층 + 인증 + 화면 6개 + SSE를 모두 담고 있어 단일 계획으로는 너무 크다. **각각이 그 자체로 동작·검증 가능한 단위**로 나눈다.

| # | 계획 | 완료 시 무엇이 되는가 |
|---|---|---|
| **① (이 문서)** | **전송 계층 + 인증 수직 관통** | 가입/로그인하면 세션이 유지되고 가드가 정확히 분기한다 |
| ② | S1 온보딩 + S2 대시보드 실데이터 전환 | 신규 사용자가 온보딩을 마치고 **진짜 데이터**를 본다 |
| ③ | S4 예산·납부 (영수증 OCR 포함) | |
| ④ | S6 예산 재배분 | |
| ⑤ | S3 AI 상담 (SSE) | |
| ⑥ | S5 리포트 실데이터 전환 | |

**②~⑥은 이 계획이 끝난 뒤 각각 따로 쓴다.** 전송 계층과 가드가 서지 않으면 나머지가 전부 401/404이므로 순서를 바꿀 수 없다.

---

## Global Constraints

스펙의 프로젝트 전역 요구사항이다. **모든 태스크의 요구사항에 이것이 암묵적으로 포함된다.**

- **검증은 4게이트다**: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`. 커밋 전 전부 돌린다. 훅이 없으므로 자동으로 도는 것은 하나도 없다.
- **앱 루트는 `frontend/`다.** 모든 npm 명령은 거기서 돈다. 저장소 루트에서 치면 전부 실패한다.
- **`frontend/` 밖의 파일을 커밋하지 않는다.** path-guard가 `^(frontend/|docs/|\.github/)` 밖을 exit 1로 막는다. `git add .`·`commit -a` 금지, **명시 경로로만**.
- **번들 예산**: 초기 청크 gzip **96,000** / JS 합계 gzip **112,000**. 현재 92,874 / 110,637. **초기 청크는 움직이면 안 된다** — 움직였다면 lazy여야 할 것이 정적으로 샜다는 신호다.
- **FSD 하향 import만**: `app → pages → features → entities → shared`. `entities`는 **다른 entity 슬라이스를 import할 수 없다**(`.oxlintrc.json`이 `@/entities/**`를 통째로 차단). 슬라이스 밖에서는 루트 `index.ts`로만 접근한다.
- **Tailwind 클래스명을 런타임에 조립하지 않는다.** `` `btn--${v}` `` 는 스캐너가 못 찾아 유틸리티가 생성되지 않는다 — **빌드는 성공하고 화면만 깨진다.** 변이는 정적 룩업 `Record`로만.
- **응답 타입은 `unknown`으로 받고 슬라이스가 좁힌다.** 백엔드 OpenAPI에는 `securitySchemes`가 없고 SSE 페이로드도 없다 — 생성 타입을 믿지 않는다.
- **에러 분기는 `status`가 아니라 `code`로 한다.** `TOTAL_BUDGET_UNAVAILABLE`이 404와 422 양쪽으로 온다.
- **dev 서버는 반드시 `localhost`로 띄운다.** 백엔드 CORS 허용 오리진이 `http://localhost:5173` 정확히 하나다 — `127.0.0.1`은 차단된다.
- **주석·문서에 Tailwind 유틸리티처럼 보이는 문자열을 쓰지 않는다.** 스캐너가 주석도 읽어 실제 유틸리티를 만든다. `.tsx` 안에서 예시가 필요하면 쪼갠다: `{["bg-[#", "8B3F63]"].join("")}`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/shared/api/api-base.ts` | **순수 함수만.** `checkApiBase` · `isLoopbackApiBase`. `import.meta`를 읽지 않는다 |
| `src/shared/api/env.ts` | `import.meta.env.VITE_API_BASE`를 읽어 `API_BASE`를 만든다 |
| `src/shared/api/errors.ts` | `ApiError` — `code`/`status`/`extra` |
| `src/shared/api/client.ts` | `apiFetch` · `apiFetchMultipart` |
| `src/shared/api/contract.ts` | 백엔드 Literal 사본 (계약 어휘) |
| `src/shared/api/index.ts` | 공개 표면 |
| `src/entities/session/model/types.ts` | `AuthUser` |
| `src/entities/session/api/auth.ts` | signup · login · logout · me · 소셜 로그인 URL |
| `src/entities/session/index.ts` | 공개 표면 |
| `src/pages/login/ui/LoginPage.tsx` | 로그인/가입 폼 · `oauth_error` 처리 · 미지원 안내 |
| `src/pages/login/ui/oauth-error.ts` | `oauth_error` 코드 → 한국어 문구 매핑 |
| `src/pages/login/index.ts` | 공개 표면 |
| `src/app/router/router.tsx` | `/login` · `_authed` · `_shell` 가드 배선 (**수정**) |
| `vite.config.ts` | `VITE_API_BASE` 형식 게이트 + 배포 빌드 루프백 차단 (**수정**) |
| `frontend/public/staticwebapp.config.json` | CSP `connect-src`에 API 호스트 (**수정**) |

**`api-base.ts`와 `env.ts`를 나눈 이유는 조직이 아니라 필수다.** `vite.config.ts`(Node)가 `checkApiBase`를 import하는데, 같은 파일에 `import.meta.env`를 읽는 코드가 있으면 **Node가 그 모듈을 평가할 때 함께 실행돼 빌드가 죽는다.**

---

## Task 1: `checkApiBase` 순수 함수

**Files:**
- Create: `frontend/src/shared/api/api-base.ts`
- Test: `frontend/src/shared/api/api-base.test.ts`

**Interfaces:**
- Consumes: (없음 — 첫 태스크)
- Produces:
  - `checkApiBase(value: unknown): string | null` — 위반 사유 문자열, 통과면 `null`
  - `isLoopbackApiBase(value: string): boolean` — 호스트가 루프백인가

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/shared/api/api-base.test.ts`:

```ts
// VITE_API_BASE 형식 계약. 21 케이스는 설계 시 실행해 확정한 것이다
// (docs/architecture/backend-integration.md §2.3).
//
// 왜 정규식이 아니라 URL 파서인가 — 정규식판은 `HTTPS://HOST` 를 과차단했고(RFC 3986 상
// 스킴은 대소문자 무관) `javascript:` 를 「경로 금지」로 오진했다. 진단이 원인을 안 가리키면
// 사용자를 엉뚱한 곳으로 보낸다.
import { describe, expect, it } from "vitest";
import { checkApiBase, isLoopbackApiBase } from "./api-base";

const OK = [
  "http://localhost:8000",
  "http://localhost",
  "http://127.0.0.1:8000",
  "http://[::1]:8000",
  "https://20-249-52-148.nip.io",
  "HTTPS://HOST",
  "https://xn--o39an51b.com",
];

const BAD: Array<[unknown, string]> = [
  ["", "빈 값"],
  ["   ", "공백뿐"],
  [undefined, "미주입"],
  ["localhost:8000", "스킴 없음"],
  ["https://", "호스트 없음"],
  ["file:///etc/passwd", "지원하지 않는 스킴"],
  ["javascript:alert(1)", "지원하지 않는 스킴"],
  ["http://20-249-52-148.nip.io", "원격에 http"],
  ["http://localhost.evil.com", "localhost 접두 위장"],
  ["https://host/api/v1", "경로 포함"],
  ["https://host?x=1", "쿼리 포함"],
  ["https://host#f", "해시 포함"],
  ["https://u:p@host", "자격증명 포함"],
  ["https://20-249-52-148.nip.io/", "끝 슬래시"],
];

describe("checkApiBase", () => {
  it.each(OK)("통과: %s", (value) => {
    expect(checkApiBase(value)).toBeNull();
  });

  it.each(BAD)("차단: %s (%s)", (value) => {
    expect(checkApiBase(value)).toEqual(expect.any(String));
  });

  it("스킴 위반은 경로가 아니라 스킴을 진단한다 — 오진이 사용자를 엉뚱한 곳으로 보낸다", () => {
    expect(checkApiBase("javascript:alert(1)")).toContain("스킴");
  });

  it("원격 http 는 §5.11 사고를 인용해 진단한다", () => {
    expect(checkApiBase("http://api.example.com")).toContain("루프백");
  });
});

describe("isLoopbackApiBase", () => {
  it("루프백 3종을 알아본다", () => {
    expect(isLoopbackApiBase("http://localhost:8000")).toBe(true);
    expect(isLoopbackApiBase("http://127.0.0.1:8000")).toBe(true);
    expect(isLoopbackApiBase("http://[::1]:8000")).toBe(true);
  });

  it("원격 호스트는 아니다", () => {
    expect(isLoopbackApiBase("https://20-249-52-148.nip.io")).toBe(false);
  });

  it("파싱 불가는 루프백이 아니다 — 배포 게이트가 이걸 통과시키면 안 된다", () => {
    expect(isLoopbackApiBase("nonsense")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/shared/api/api-base.test.ts`
Expected: FAIL — `Failed to resolve import "./api-base"`

- [ ] **Step 3: 최소 구현을 쓴다**

`frontend/src/shared/api/api-base.ts`:

```ts
// API 오리진 형식 계약 — **순수 함수만 둔다.**
//
// ⚠️ 이 파일에 `import.meta` 를 읽는 코드를 넣지 말 것.
//    vite.config.ts(Node)가 checkApiBase 를 import 하는데, 같은 모듈에 import.meta.env 접근이
//    있으면 Node 가 모듈을 평가할 때 함께 실행돼 **빌드가 죽는다.** 그 부분은 env.ts 소관이다.
//
// 검사 순서가 계약의 일부다 — 빈 값 → 파싱 → 스킴 → 호스트 → 자격증명 → 경로 → 쿼리/해시 →
// 끝 슬래시. 순서가 어긋나면 원인이 아니라 증상을 진단한다(초판이 javascript: 를 「경로 금지」로
// 오진했다).

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** 위반 사유를 돌려준다. 통과면 `null`. 빌드(vite.config.ts)와 런타임이 **같은 함수**를 쓴다. */
export function checkApiBase(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return "VITE_API_BASE 가 비어 있다 — 폴백하지 않고 여기서 멈춘다";
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `URL 로 해석되지 않는다: ${JSON.stringify(value)} — 스킴(https://)부터 적는다`;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return `지원하지 않는 스킴: ${url.protocol} — https: 또는 http:(루프백)만 쓴다`;
  }
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    return (
      `http:// 는 루프백에만 허용한다 (호스트 ${url.hostname}) — 원격은 https:. ` +
      "인그레스가 내는 308 에 Access-Control-Allow-Origin 이 없어 브라우저에서만 조용히 죽는다"
    );
  }
  if (url.username !== "" || url.password !== "") {
    return "자격증명을 URL 에 넣지 않는다 — 번들에 그대로 박힌다";
  }
  if (url.pathname !== "/") {
    return `경로를 넣지 않는다 (${url.pathname}) — 오리진만 적고 /api/v1 은 코드가 붙인다`;
  }
  if (url.search !== "" || url.hash !== "") {
    return "쿼리·해시를 넣지 않는다 — 오리진만 적는다";
  }
  if (value.endsWith("/")) {
    return "끝 슬래시 금지 — 경로 조립이 //api 가 된다";
  }
  return null;
}

/** 배포 빌드 게이트용. 형식 검사는 루프백을 허용하므로 **적용 시점**으로 나눈다. */
export function isLoopbackApiBase(value: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/shared/api/api-base.test.ts`
Expected: PASS — 21+ 케이스 전부

- [ ] **Step 5: 4게이트를 돌리고 커밋한다**

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd .. && git add frontend/src/shared/api/api-base.ts frontend/src/shared/api/api-base.test.ts
git commit -m "feat(api): VITE_API_BASE 형식 계약을 순수 함수로 세운다

정규식이 아니라 URL 파서를 쓴다. 정규식판은 HTTPS://HOST 를 과차단하고(RFC 3986 상
스킴은 대소문자 무관) javascript: 를 「경로 금지」로 오진했다 — 원인이 아니라 증상을
진단하면 사용자를 엉뚱한 곳으로 보낸다.

import.meta 를 읽지 않는 별도 파일로 둔다. vite.config.ts(Node)가 이 함수를 import
하는데 같은 모듈에 import.meta.env 접근이 있으면 빌드가 죽는다."
```

---

## Task 2: 빌드 게이트 — 형식 + 배포 루프백 차단

**Files:**
- Modify: `frontend/vite.config.ts` (plugins 배열에 게이트 추가)
- Test: `frontend/src/shared/api/api-base.test.ts` (Task 1 파일에 추가)

**Interfaces:**
- Consumes: `checkApiBase`, `isLoopbackApiBase` (Task 1)
- Produces: 빌드 시점 실패. 런타임 인터페이스 없음

- [ ] **Step 1: 배포 판정 규칙을 테스트로 고정한다**

`frontend/src/shared/api/api-base.test.ts` 끝에 추가:

```ts
describe("배포 빌드 규칙 — 형식 통과와 배포 가능은 다르다", () => {
  it("로컬 값은 형식은 통과하지만 배포에는 쓸 수 없다", () => {
    const local = "http://localhost:8000";
    expect(checkApiBase(local)).toBeNull();      // 형식 OK
    expect(isLoopbackApiBase(local)).toBe(true); // 배포 게이트가 잡는다
  });

  it("운영 값은 둘 다 통과한다", () => {
    const remote = "https://20-249-52-148.nip.io";
    expect(checkApiBase(remote)).toBeNull();
    expect(isLoopbackApiBase(remote)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/shared/api/api-base.test.ts`
Expected: PASS (Task 1 구현으로 이미 통과 — 이 테스트는 **규칙을 문서화하고 회귀를 막는 것**이 목적이다)

- [ ] **Step 3: `vite.config.ts`에 게이트를 넣는다**

`frontend/vite.config.ts` 상단 import에 추가:

```ts
import { checkApiBase, isLoopbackApiBase } from "./src/shared/api/api-base";
```

`assertProductionBuild()` 정의 옆에 플러그인을 추가:

```ts
/**
 * VITE_API_BASE 게이트 — 두 단계로 나눈다.
 *
 *   ① 형식 검사   항상. 루프백 허용(로컬 개발이 성립해야 한다)
 *   ② 배포 검사   프로덕션 빌드에서만. **루프백이면 실패**
 *
 * ②가 없으면 .env.example 의 로컬 기본값(http://localhost:8000)을 그대로 둔 채 배포 빌드를
 * 돌려도 초록불이 나온다 — 앱은 아무 데도 못 붙는데 빌드는 성공한다. 조용한 실패다.
 * 판정 로직을 두 벌 두지 않으려고 assert-production-build 와 같은 기준(mode)을 쓴다.
 */
function assertApiBase(): Plugin {
  return {
    name: "assert-api-base",
    apply: "build",
    config(_config, { mode }) {
      const raw = loadEnv(mode, process.cwd(), "VITE_").VITE_API_BASE;
      const reason = checkApiBase(raw);
      if (reason !== null) {
        throw new Error(`[assert-api-base] VITE_API_BASE: ${reason}`);
      }
      if (mode === "production" && isLoopbackApiBase(raw)) {
        throw new Error(
          `[assert-api-base] 배포 빌드에 루프백 주소가 들어 있다: ${raw}\n` +
            "  로컬 값을 그대로 두고 배포하면 앱이 아무 데도 붙지 못한다. 운영 오리진(https://…)으로 바꾼다.",
        );
      }
    },
  };
}
```

`vite` import에 `loadEnv`와 `Plugin` 타입을 추가하고, `plugins` 배열에 `assertApiBase()`를 `assertProductionBuild()` 뒤에 넣는다.

- [ ] **Step 4: 게이트가 실제로 막는지 주입 시험을 한다**

```bash
cd frontend
# ① 정상 — 통과해야 한다
npm run build

# ② 루프백 + 프로덕션 — exit 1 이어야 한다
VITE_API_BASE=http://localhost:8000 npx vite build --mode production; echo "exit=$?"

# ③ 형식 위반 — exit 1 이어야 한다
VITE_API_BASE=https://host/api/v1 npx vite build; echo "exit=$?"
```

Expected: ①은 성공, ②·③은 `exit=1`이고 메시지에 사유가 보인다.
⚠️ **exit code는 파이프 없이 잰다** — `cmd | tail` 뒤에 명령이 끼면 `PIPESTATUS`도 초기화된다.

- [ ] **Step 5: 4게이트를 돌리고 커밋한다**

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd .. && git add frontend/vite.config.ts frontend/src/shared/api/api-base.test.ts
git commit -m "feat(build): VITE_API_BASE 게이트 — 형식 검사와 배포 검사를 분리한다

형식 검사는 루프백을 허용해야 로컬 개발이 성립한다. 그런데 그대로 두면 .env.example 의
로컬 기본값을 안 고치고 배포 빌드를 돌려도 초록불이 나온다 — 앱은 아무 데도 못 붙는데
빌드는 성공하는 조용한 실패다. 적용 시점으로 나눠 막는다.

주입 시험으로 확인: 루프백+production exit 1 · 경로 포함 exit 1 · 정상 통과."
```

---

## Task 3: `ApiError` — 에러 정규화

**Files:**
- Create: `frontend/src/shared/api/errors.ts`
- Test: `frontend/src/shared/api/errors.test.ts`

**Interfaces:**
- Consumes: (없음)
- Produces:
  - `class ApiError extends Error` — `code: string` · `status: number` · `extra: Record<string, unknown>`
  - `parseApiError(status: number, body: unknown): ApiError`
  - `isApiError(e: unknown): e is ApiError`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/shared/api/errors.test.ts`:

```ts
// 백엔드 에러 바디는 예외 없이 { error: { code, message, ...extra } } 다.
// 분기는 status 가 아니라 **code** 로 한다 — TOTAL_BUDGET_UNAVAILABLE 이 404 와 422
// 양쪽으로 오기 때문이다(docs/architecture/api-contract.md §4).
import { describe, expect, it } from "vitest";
import { ApiError, isApiError, parseApiError } from "./errors";

describe("parseApiError", () => {
  it("code · message 를 꺼낸다", () => {
    const e = parseApiError(404, { error: { code: "WEDDING_NOT_FOUND", message: "웨딩 프로필이 아직 없습니다." } });
    expect(e.code).toBe("WEDDING_NOT_FOUND");
    expect(e.status).toBe(404);
    expect(e.message).toBe("웨딩 프로필이 아직 없습니다.");
  });

  it("extra 필드를 보존한다 — BUDGET_BELOW_PAID 가 min_required 를 준다", () => {
    const e = parseApiError(400, {
      error: { code: "BUDGET_BELOW_PAID", message: "…", category_code: "VENUE", min_required: 3_000_000 },
    });
    expect(e.extra).toEqual({ category_code: "VENUE", min_required: 3_000_000 });
  });

  it("같은 code 가 다른 status 로 와도 code 는 같다 — 분기 기준이 흔들리면 안 된다", () => {
    expect(parseApiError(404, { error: { code: "TOTAL_BUDGET_UNAVAILABLE", message: "x" } }).code).toBe(
      parseApiError(422, { error: { code: "TOTAL_BUDGET_UNAVAILABLE", message: "x" } }).code,
    );
  });

  it("포맷 밖 응답도 삼키지 않는다 — code 를 지어내지 않고 status 를 남긴다", () => {
    const e = parseApiError(502, "<html>Bad Gateway</html>");
    expect(e.status).toBe(502);
    expect(e.code).toBe("UNKNOWN_ERROR");
    expect(e.message).not.toBe("");
  });

  it("본문이 null 이어도 던지지 않는다", () => {
    expect(() => parseApiError(500, null)).not.toThrow();
  });
});

describe("isApiError", () => {
  it("ApiError 만 참이다", () => {
    expect(isApiError(new ApiError({ code: "X", message: "m", status: 400, extra: {} }))).toBe(true);
    expect(isApiError(new Error("보통 에러"))).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/shared/api/errors.test.ts`
Expected: FAIL — `Failed to resolve import "./errors"`

- [ ] **Step 3: 최소 구현을 쓴다**

`frontend/src/shared/api/errors.ts`:

```ts
// 백엔드 에러 바디의 단일 해석 지점.
//
// 분기는 status 가 아니라 code 로 한다 — 같은 code 가 두 status 로 오는 사례가 실재한다
// (TOTAL_BUDGET_UNAVAILABLE: 404 와 422). status 로 분기하면 한쪽을 조용히 놓친다.
//
// 포맷 밖 응답(프록시가 낸 HTML 502 등)도 삼키지 않는다. code 를 지어내는 대신
// UNKNOWN_ERROR 로 표시하고 status 를 남겨 진단이 가능하게 한다.

interface ApiErrorInit {
  code: string;
  message: string;
  status: number;
  extra: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly extra: Record<string, unknown>;

  constructor({ code, message, status, extra }: ApiErrorInit) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function parseApiError(status: number, body: unknown): ApiError {
  const error = asRecord(asRecord(body)?.error);
  if (error === null) {
    return new ApiError({
      code: "UNKNOWN_ERROR",
      message: `서버 응답을 해석할 수 없습니다 (HTTP ${status}).`,
      status,
      extra: {},
    });
  }

  const { code, message, ...extra } = error;
  return new ApiError({
    code: typeof code === "string" ? code : "UNKNOWN_ERROR",
    message: typeof message === "string" ? message : `요청이 실패했습니다 (HTTP ${status}).`,
    status,
    extra,
  });
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/shared/api/errors.test.ts`
Expected: PASS

- [ ] **Step 5: 4게이트를 돌리고 커밋한다**

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd .. && git add frontend/src/shared/api/errors.ts frontend/src/shared/api/errors.test.ts
git commit -m "feat(api): 백엔드 에러 바디를 ApiError 로 정규화한다

분기 기준은 status 가 아니라 code 다 — TOTAL_BUDGET_UNAVAILABLE 이 404 와 422 양쪽으로
온다. status 로 분기하면 한쪽을 조용히 놓친다.

포맷 밖 응답도 삼키지 않는다. code 를 지어내지 않고 UNKNOWN_ERROR 로 표시하되 status 를
남겨 진단이 가능하게 한다."
```

---

## Task 4: `apiFetch` — 전송 계층

**Files:**
- Create: `frontend/src/shared/api/env.ts`
- Create: `frontend/src/shared/api/client.ts`
- Create: `frontend/src/shared/api/index.ts`
- Test: `frontend/src/shared/api/client.test.ts`

**Interfaces:**
- Consumes: `checkApiBase` (Task 1) · `parseApiError`, `ApiError` (Task 3)
- Produces:
  - `apiBase(): string` — **상수가 아니라 함수다.** 이유는 Step 3
  - `apiFetch(path: string, init?: RequestInit): Promise<unknown>`
  - `apiFetchMultipart(path: string, form: FormData, init?: RequestInit): Promise<unknown>`
  - `onUnauthorized(handler: () => void): () => void` — 401 구독. 해제 함수를 돌려준다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/shared/api/client.test.ts`:

```ts
// 전송 계층이 강제하는 계약 5가지를 고정한다(docs/architecture/backend-integration.md §1.2).
//
// #2(헤더 병합 순서)는 이 저장소가 **똑같은 버그로 한 번 데인** 항목이다(layers.md 부록 A).
// 당시엔 아무도 헤더를 안 넘겨 잠복이었지만, 지금은 실제로 헤더를 쓰므로 즉시 발현한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiFetchMultipart, onUnauthorized } from "./client";
import { apiBase } from "./env";
import { isApiError } from "./errors";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastInit(): RequestInit {
  return fetchMock.mock.calls.at(-1)![1] as RequestInit;
}

describe("계약 1 — credentials 는 내장이고 끌 수 없다", () => {
  it("항상 include 로 나간다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiFetch("/api/v1/auth/me");
    expect(lastInit().credentials).toBe("include");
  });

  it("호출자가 omit 을 넘겨도 무시된다 — 옵션이면 반드시 빠뜨린다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiFetch("/api/v1/auth/me", { credentials: "omit" });
    expect(lastInit().credentials).toBe("include");
  });
});

describe("계약 2 — 헤더 병합 순서 (layers.md 부록 A 회귀)", () => {
  it("호출자 헤더를 넣어도 Content-Type 이 살아 있다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiFetch("/api/v1/x", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: { "X-Trace": "1" },
    });
    const headers = new Headers(lastInit().headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-trace")).toBe("1");
  });
});

describe("계약 3 — 경로 조립", () => {
  it("apiBase() 뒤에 path 를 붙인다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiFetch("/api/v1/auth/me");
    expect(fetchMock.mock.calls.at(-1)![0]).toBe(`${apiBase()}/api/v1/auth/me`);
  });
});

describe("계약 4 — 에러는 ApiError 로 던진다", () => {
  it("401 은 code 를 담아 던진다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } }, 401));
    await expect(apiFetch("/api/v1/auth/me")).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === "UNAUTHORIZED" && e.status === 401,
    );
  });

  it("204 는 본문 없이 undefined 를 돌려준다 — 로그아웃이 이 경로다", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch("/api/v1/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("네트워크 실패도 ApiError 로 감싼다 — 화면이 두 종류 에러를 다루지 않게", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiFetch("/api/v1/auth/me")).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === "NETWORK_ERROR",
    );
  });
});

describe("계약 4-a — signal 을 그대로 넘긴다", () => {
  it("호출자가 준 AbortSignal 이 fetch 까지 간다 — 안 넘기면 철 지난 응답이 새 화면을 덮어쓴다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const controller = new AbortController();
    await apiFetch("/api/v1/x", { signal: controller.signal });
    expect(lastInit().signal).toBe(controller.signal);
  });
});

describe("401 구독 — shared 는 누가 듣는지 모른다", () => {
  it("401 이 오면 등록된 핸들러를 부른다", async () => {
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "UNAUTHORIZED", message: "x" } }, 401));
    await expect(apiFetch("/api/v1/x")).rejects.toThrow();
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });

  it("해제하면 더 부르지 않는다 — 구독이 누적되면 같은 무효화가 여러 번 돈다", async () => {
    const seen = vi.fn();
    onUnauthorized(seen)();
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "UNAUTHORIZED", message: "x" } }, 401));
    await expect(apiFetch("/api/v1/x")).rejects.toThrow();
    expect(seen).not.toHaveBeenCalled();
  });

  it("401 이 아닌 에러에는 부르지 않는다", async () => {
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "WEDDING_NOT_FOUND", message: "x" } }, 404));
    await expect(apiFetch("/api/v1/x")).rejects.toThrow();
    expect(seen).not.toHaveBeenCalled();
    off();
  });
});

describe("계약 5 — 멀티파트는 Content-Type 을 건드리지 않는다", () => {
  it("boundary 를 브라우저가 정하도록 헤더를 비운다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ receipt_url: "https://x" }, 201));
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "image/png" }), "r.png");
    await apiFetchMultipart("/api/v1/payments/receipt-extract", form);
    const headers = new Headers(lastInit().headers);
    expect(headers.get("content-type")).toBeNull();
    expect(lastInit().credentials).toBe("include");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/shared/api/client.test.ts`
Expected: FAIL — `Failed to resolve import "./client"`

- [ ] **Step 3: 최소 구현을 쓴다**

`frontend/src/shared/api/env.ts`:

```ts
// import.meta.env 를 읽는 **유일한** 지점.
//
// 폴백하지 않는다. `?? ""` 는 값 부재를 조용히 삼켜 요청을 상대 경로로 떨어뜨린다
// (docs/architecture/toolchain.md §6.3).
//
// 🚨 **모듈 최상위에서 검증하지 않는다.** 상수로 내보내면 모듈 평가 시점에 값을 요구하는데,
//    그러면 세 가지가 깨진다(docs/architecture/backend-integration.md §2.1):
//      1) CI 테스트 전멸 — frontend-ci.yml 의 Test 스텝에는 env 가 없고 러너에 .env 도 없다.
//         네트워크를 쓰지 않는 테스트까지 import 단계에서 함께 죽는다.
//      2) ErrorBoundary 가 못 잡는다 — 바운더리는 렌더 중 예외를 잡고, 모듈 평가 예외는
//         통과한다. 「조용한 실패 금지」를 지키려던 코드가 가장 조용한 실패(흰 화면)를 만든다.
//      3) vite.config.ts(Node)가 이 파일을 읽을 수 없다.
//    그래서 **최초 사용 시점**으로 늦춘다. 실질적으로 이 예외는 일어날 수 없다 —
//    빌드 게이트가 같은 함수로 먼저 막는다.
import { checkApiBase } from "./api-base";
import { ApiError } from "./errors";

let resolved: string | undefined;

/** API 오리진(끝 슬래시 없음). `/api/v1` 은 호출부가 붙인다. 최초 호출에서 검증한다. */
export function apiBase(): string {
  if (resolved !== undefined) return resolved;
  const raw = import.meta.env.VITE_API_BASE;
  const reason = checkApiBase(raw);
  if (reason !== null) {
    // 화면이 이미 아는 형태로 던진다 — 별도 처리 경로를 만들지 않는다.
    throw new ApiError({ code: "API_BASE_INVALID", message: `VITE_API_BASE: ${reason}`, status: 0, extra: {} });
  }
  resolved = raw as string;
  return resolved;
}
```

`frontend/src/shared/api/client.ts`:

```ts
// 전송 계층 — 앱에서 fetch 를 직접 부르는 곳은 여기뿐이다.
import { apiBase } from "./env";
import { ApiError, parseApiError } from "./errors";

// 401 구독 — shared 는 최하층이라 entities/session 을 import 할 수 없다(oxlint 가 막는다).
// 그래서 방향을 뒤집는다: shared 는 「누군가 듣는다」만 알고, 배선은 app 레이어가 한다.
const unauthorizedHandlers = new Set<() => void>();

/** 401 을 받을 때마다 호출된다. 반환값은 해제 함수다 — 구독이 누적되면 같은 무효화가 여러 번 돈다. */
export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined;
  const text = await response.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function send(path: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, init);
  } catch (cause) {
    // 네트워크 실패를 그대로 흘리면 화면이 ApiError 와 TypeError 두 종류를 다뤄야 한다.
    // 한 종류로 모으고 code 로 구분한다.
    throw new ApiError({
      code: "NETWORK_ERROR",
      message: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
      status: 0,
      extra: { cause: String(cause) },
    });
  }

  const body = await readBody(response);
  if (!response.ok) {
    const error = parseApiError(response.status, body);
    // 세션이 사용 중 만료되면(슬라이딩 갱신이 없어 30일째 반드시 온다) 캐시된 세션이
    // 거짓을 말한다. 여기서 알리고, 무효화는 구독자가 한다.
    if (error.code === "UNAUTHORIZED") unauthorizedHandlers.forEach((handler) => handler());
    throw error;
  }
  return body;
}

/**
 * JSON 요청. 응답은 **`unknown`** 이다 — 좁히는 것은 슬라이스의 몫이다.
 *
 * ⚠️ `...init` 을 먼저 펼치고 `headers` 를 뒤에 둔다. 순서를 되돌리면 호출자가 헤더를 넘겼을 때
 *    Content-Type 이 통째로 사라진다(layers.md 부록 A — 실제로 났던 버그. client.test.ts 가 고정한다).
 * ⚠️ `credentials` 도 뒤에 둔다. 호출자가 끌 수 없어야 한다 — 빠뜨리면 대부분의 API 가 401 이다.
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  return send(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    credentials: "include",
  });
}

/**
 * 멀티파트 요청. **`apiFetch` 를 태우지 않는다** — `FormData` 는 브라우저가 boundary 를 포함한
 * Content-Type 을 자동 설정해야 하므로 JSON 래퍼를 거치면 깨진다(layers.md 부록 A 가 "의도된 설계"로 명시).
 */
export function apiFetchMultipart(path: string, form: FormData, init: RequestInit = {}): Promise<unknown> {
  return send(path, { method: "POST", ...init, body: form, credentials: "include" });
}
```

`frontend/src/shared/api/index.ts`:

```ts
// shared/api 공개 표면.
export { checkApiBase, isLoopbackApiBase } from "./api-base";
export { apiFetch, apiFetchMultipart, onUnauthorized } from "./client";
export { apiBase } from "./env";
export { ApiError, isApiError, parseApiError } from "./errors";
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/shared/api/client.test.ts`
Expected: PASS

- [ ] **Step 5: 헤더 병합 회귀가 실제로 잡히는지 주입 시험을 한다**

`client.ts`에서 `...init`과 `headers`의 순서를 일시적으로 뒤집고 테스트를 돌린다.
Expected: FAIL — `expected null to be 'application/json'`. 확인 후 되돌린다.

- [ ] **Step 6: 4게이트를 돌리고 커밋한다**

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd .. && git add frontend/src/shared/api/env.ts frontend/src/shared/api/client.ts frontend/src/shared/api/index.ts frontend/src/shared/api/client.test.ts
git commit -m "feat(api): 전송 계층을 세운다 — credentials 내장 · 헤더 병합 순서 · 멀티파트 분리

계약 5가지를 코드로 강제한다. credentials:include 는 옵션이 아니라 내장이다 — 옵션이면
반드시 빠뜨리고, 빠뜨리면 대부분의 엔드포인트가 401 이다.

헤더 병합 순서는 layers.md 부록 A 가 똑같은 버그로 데인 항목이다. 당시엔 아무도 헤더를
안 넘겨 잠복이었지만 지금은 즉시 발현한다. 순서를 되돌리면 테스트가 실패하는 것을
주입 시험으로 확인했다.

멀티파트는 이 래퍼를 태우지 않는다 — FormData 는 브라우저가 boundary 를 정해야 한다."
```

---

## Task 5: 계약 어휘 `contract.ts`

**Files:**
- Create: `frontend/src/shared/api/contract.ts`
- Modify: `frontend/src/shared/api/index.ts` (재수출 추가)
- Test: `frontend/src/shared/api/contract.test.ts`

**Interfaces:**
- Consumes: (없음)
- Produces: `CATEGORY_CODES`, `REGION_CODES`, `SOURCE_TIERS`, `VERDICTS`, `CHAT_ROLES`, `CHAT_STAGES`, `CHECKLIST_STATUS_BY_CATEGORY` 상수와 그에서 파생된 타입 `CategoryCode`·`RegionCode`·`SourceTier`·`Verdict`·`ChatRole`·`ChatStage`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/shared/api/contract.test.ts`:

```ts
// 백엔드 Literal 의 사본이다. 값이 바뀌면 화면이 조용히 어긋나므로 개수와 대표값을 고정한다.
// 전수 대조는 scripts 의 드리프트 게이트가 한다(docs/architecture/api-contract.md §6).
import { describe, expect, it } from "vitest";
import { CATEGORY_CODES, CHECKLIST_STATUS_BY_CATEGORY, REGION_CODES, SOURCE_TIERS, VERDICTS } from "./contract";

describe("계약 어휘", () => {
  it("카테고리는 9개다 — 7 → 9 로 늘어난 이력이 있다", () => {
    expect(CATEGORY_CODES).toHaveLength(9);
    expect(CATEGORY_CODES).toContain("HOMENEW");
    expect(CATEGORY_CODES).toContain("ETC");
  });

  it("지역은 17개다 (세분 14 + 집계 폴백 3)", () => {
    expect(REGION_CODES).toHaveLength(17);
    expect(REGION_CODES).toContain("NATIONWIDE");
  });

  it("인용 티어는 4개, verdict 는 3개다", () => {
    expect(SOURCE_TIERS).toHaveLength(4);
    expect(VERDICTS).toEqual(["SUPPORTED", "WEAK", "GENERAL"]);
  });
});

describe("체크리스트 상태는 카테고리에 달려 있다 — 타입만으로 검증되지 않는다", () => {
  it("HOMEWARE 만 다른 4값을 쓴다", () => {
    expect(CHECKLIST_STATUS_BY_CATEGORY.HOMEWARE).toEqual(["LISTED", "COMPARING", "ORDERED", "DELIVERED"]);
  });

  it("나머지 8개는 공통 4값이다", () => {
    for (const code of CATEGORY_CODES.filter((c) => c !== "HOMEWARE")) {
      expect(CHECKLIST_STATUS_BY_CATEGORY[code]).toEqual(["TODO", "DOING", "SKIP", "DONE"]);
    }
  });

  it("9개 카테고리 전부에 상태 목록이 있다 — 빠지면 화면이 빈 셀렉트를 그린다", () => {
    expect(Object.keys(CHECKLIST_STATUS_BY_CATEGORY).sort()).toEqual([...CATEGORY_CODES].sort());
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/shared/api/contract.test.ts`
Expected: FAIL — `Failed to resolve import "./contract"`

- [ ] **Step 3: 최소 구현을 쓴다**

`frontend/src/shared/api/contract.ts`:

```ts
// 백엔드 Literal 의 **사본**이다. 원본은 백엔드 app/schemas/common.py 이고, 여기 값은
// 관측 시점의 사실이지 보증이 아니다 — 드리프트 감지는 docs/architecture/api-contract.md §6.
//
// 왜 entities 가 아니라 shared 인가: session·wedding·chat 세 슬라이스가 전부 쓰는데
// .oxlintrc.json 이 entities 간 import 를 차단한다. 최하층이어야 셋이 함께 쓸 수 있다.

export const CATEGORY_CODES = [
  "MEETING", "VENUE", "SDM", "GIFT", "HOMEWARE",
  "INVITATION", "HONEYMOON", "HOMENEW", "ETC",
] as const;
export type CategoryCode = (typeof CATEGORY_CODES)[number];

export const REGION_CODES = [
  "SEOUL_GANGNAM", "SEOUL_OTHER", "BUSAN", "INCHEON", "DAEGU", "DAEJEON",
  "GWANGJU", "ULSAN", "GYEONGGI", "CHUNGCHEONG", "JEOLLA", "GYEONGSANG",
  "GANGWON", "JEJU", "NATIONWIDE", "METRO", "NON_METRO",
] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export const SOURCE_TIERS = ["OFFICIAL", "NEWS", "INDUSTRY", "CONSENSUS"] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

export const VERDICTS = ["SUPPORTED", "WEAK", "GENERAL"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** ⚠️ 소문자다. 대문자로 비교하면 조용히 안 맞는다. */
export const CHAT_ROLES = ["user", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** ⚠️ 소문자다. SSE `stage` 이벤트 값이자 그래프 노드 이름이다. */
export const CHAT_STAGES = ["retrieve", "generate", "verify"] as const;
export type ChatStage = (typeof CHAT_STAGES)[number];

const GENERAL_CHECKLIST_STATUS = ["TODO", "DOING", "SKIP", "DONE"] as const;
const HOMEWARE_CHECKLIST_STATUS = ["LISTED", "COMPARING", "ORDERED", "DELIVERED"] as const;

/**
 * 🚨 체크리스트 상태는 합집합 8값이지만 **실제 유효성은 카테고리에 달려 있다.**
 * 위반하면 422 INVALID_STATUS_FOR_CATEGORY 다. 타입 시스템은 이걸 못 막으므로
 * 화면이 이 표로 선택지를 갈라야 한다.
 */
export const CHECKLIST_STATUS_BY_CATEGORY: Record<CategoryCode, readonly string[]> = Object.fromEntries(
  CATEGORY_CODES.map((code) => [
    code,
    code === "HOMEWARE" ? HOMEWARE_CHECKLIST_STATUS : GENERAL_CHECKLIST_STATUS,
  ]),
) as Record<CategoryCode, readonly string[]>;
```

`frontend/src/shared/api/index.ts`에 추가:

```ts
export {
  CATEGORY_CODES, CHAT_ROLES, CHAT_STAGES, CHECKLIST_STATUS_BY_CATEGORY,
  REGION_CODES, SOURCE_TIERS, VERDICTS,
  type CategoryCode, type ChatRole, type ChatStage, type RegionCode,
  type SourceTier, type Verdict,
} from "./contract";
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/shared/api/contract.test.ts`
Expected: PASS

- [ ] **Step 5: 4게이트를 돌리고 커밋한다**

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd .. && git add frontend/src/shared/api/contract.ts frontend/src/shared/api/contract.test.ts frontend/src/shared/api/index.ts
git commit -m "feat(api): 백엔드 Literal 사본을 계약 어휘로 둔다

세 슬라이스(session·wedding·chat)가 전부 쓰는데 oxlint 가 entities 간 import 를
차단하므로 최하층에 둔다.

체크리스트 상태는 합집합 8값이지만 실제 유효성이 카테고리에 달려 있다(HOMEWARE 만
다른 4값). 타입으로는 못 막으므로 표로 만들어 화면이 선택지를 가르게 한다."
```

---

## Task 6: `entities/session` — 인증 API

**Files:**
- Create: `frontend/src/entities/session/model/types.ts`
- Create: `frontend/src/entities/session/api/auth.ts`
- Create: `frontend/src/entities/session/model/session-cache.ts`
- Create: `frontend/src/entities/session/index.ts`
- Test: `frontend/src/entities/session/api/auth.test.ts`
- Test: `frontend/src/entities/session/model/session-cache.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `apiBase`, `ApiError` (Task 4)
- Produces:
  - `interface AuthUser { id: string; email: string; displayName: string | null; hasWedding: boolean }`
  - `signup(input: { email: string; password: string; displayName: string }): Promise<AuthUser>`
  - `login(input: { email: string; password: string }): Promise<AuthUser>`
  - `logout(): Promise<void>`
  - `getMe(): Promise<AuthUser>`
  - `socialLoginUrl(provider: "google" | "naver"): string`
  - `loadSession(): Promise<AuthUser>` - TTL 캐시를 거친 세션 조회
  - `invalidateSession(): void`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/entities/session/api/auth.test.ts`:

```ts
// 인증 호출의 계약. 응답은 snake_case 로 오고 화면은 camelCase 를 쓴다 —
// 그 경계를 여기 한 곳에 둔다(도메인 타입이 전송 형식을 따라가면 화면이 지저분해진다).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiBase, isApiError } from "@/shared/api";
import { getMe, login, logout, signup, socialLoginUrl } from "./auth";

const RAW = { id: "u-1", email: "a@b.c", display_name: "가나", has_wedding: true };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("응답 매핑", () => {
  it("snake_case 를 camelCase 도메인 타입으로 바꾼다", async () => {
    fetchMock.mockResolvedValue(json(RAW));
    await expect(getMe()).resolves.toEqual({
      id: "u-1", email: "a@b.c", displayName: "가나", hasWedding: true,
    });
  });

  it("display_name 이 null 이어도 받는다", async () => {
    fetchMock.mockResolvedValue(json({ ...RAW, display_name: null }));
    await expect(getMe()).resolves.toMatchObject({ displayName: null });
  });
});

describe("signup 의 has_wedding 은 신뢰하지 않는다", () => {
  it("서버가 true 를 줘도 false 로 강제한다 — 백엔드가 항상 false 를 하드코딩하고 있어 값이 의미 없다", async () => {
    fetchMock.mockResolvedValue(json({ ...RAW, has_wedding: true }, 201));
    await expect(signup({ email: "a@b.c", password: "12345678", displayName: "가나" })).resolves.toMatchObject({
      hasWedding: false,
    });
  });
});

describe("요청 형태", () => {
  it("login 은 POST 로 email·password 를 보낸다", async () => {
    fetchMock.mockResolvedValue(json(RAW));
    await login({ email: "a@b.c", password: "pw" });
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe(`${apiBase()}/api/v1/auth/login`);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: "a@b.c", password: "pw" });
  });

  it("signup 은 display_name 키로 보낸다 — 백엔드 필드명이 곧 JSON 키다", async () => {
    fetchMock.mockResolvedValue(json(RAW, 201));
    await signup({ email: "a@b.c", password: "12345678", displayName: "가나" });
    const init = fetchMock.mock.calls.at(-1)![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      email: "a@b.c", password: "12345678", display_name: "가나",
    });
  });

  it("logout 은 204 를 정상으로 받는다", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(logout()).resolves.toBeUndefined();
  });
});

describe("에러", () => {
  it("401 INVALID_CREDENTIALS 를 그대로 올린다 — 화면이 code 로 분기한다", async () => {
    fetchMock.mockResolvedValue(json({ error: { code: "INVALID_CREDENTIALS", message: "…" } }, 401));
    await expect(login({ email: "a@b.c", password: "x" })).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === "INVALID_CREDENTIALS",
    );
  });
});

describe("소셜 로그인은 fetch 가 아니라 전체 페이지 이동이다", () => {
  it("이동할 URL 을 만들어 준다", () => {
    expect(socialLoginUrl("google")).toBe(`${apiBase()}/api/v1/auth/google/login`);
    expect(socialLoginUrl("naver")).toBe(`${apiBase()}/api/v1/auth/naver/login`);
  });
});
```

`frontend/src/entities/session/model/session-cache.test.ts`:

```ts
// 캐시는 「네비게이션마다 왕복」을 없애려고 있는 것이다. 그 목적을 테스트가 지킨다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMeMock = vi.fn();
vi.mock("../api/auth", () => ({ getMe: () => getMeMock() }));

const USER = { id: "u", email: "a@b.c", displayName: null, hasWedding: true };

beforeEach(async () => {
  vi.resetModules();
  getMeMock.mockReset().mockResolvedValue(USER);
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

async function fresh() {
  return await import("./session-cache");
}

describe("세션 캐시", () => {
  it("두 번 불러도 네트워크는 한 번이다 — 이게 캐시의 존재 이유다", async () => {
    const { loadSession } = await fresh();
    await loadSession();
    await loadSession();
    expect(getMeMock).toHaveBeenCalledTimes(1);
  });

  it("TTL 이 지나면 다시 조회한다", async () => {
    const { loadSession } = await fresh();
    await loadSession();
    vi.advanceTimersByTime(60_001);
    await loadSession();
    expect(getMeMock).toHaveBeenCalledTimes(2);
  });

  it("무효화하면 즉시 다시 조회한다", async () => {
    const { invalidateSession, loadSession } = await fresh();
    await loadSession();
    invalidateSession();
    await loadSession();
    expect(getMeMock).toHaveBeenCalledTimes(2);
  });

  it("실패는 캐시하지 않는다 — 캐시하면 로그인 직후에도 TTL 동안 튕긴다", async () => {
    const { loadSession } = await fresh();
    getMeMock.mockRejectedValueOnce(new Error("401"));
    await expect(loadSession()).rejects.toThrow();
    getMeMock.mockResolvedValue(USER);
    await expect(loadSession()).resolves.toEqual(USER);
    expect(getMeMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/entities/session`
Expected: FAIL — `Failed to resolve import "./auth"` / `"./session-cache"`

- [ ] **Step 3: 최소 구현을 쓴다**

`frontend/src/entities/session/model/types.ts`:

```ts
/** 로그인한 사용자. 전송 형식(snake_case)을 화면까지 끌고 가지 않는다. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  /**
   * 온보딩 완료 여부.
   *
   * 🚨 **`signup` 응답의 값은 신뢰할 수 없다** — 백엔드가 항상 false 를 하드코딩한다.
   * 실제 값은 `login` · `me` 에서만 온다. api/auth.ts 가 signup 쪽을 false 로 강제한다.
   */
  hasWedding: boolean;
}
```

`frontend/src/entities/session/api/auth.ts`:

```ts
// auth 6종. 응답을 도메인 타입으로 좁히는 곳도 여기다 — apiFetch 는 unknown 을 준다.
import { apiBase, apiFetch } from "@/shared/api";
import type { AuthUser } from "../model/types";

function toAuthUser(raw: unknown): AuthUser {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id),
    email: String(r.email),
    displayName: typeof r.display_name === "string" ? r.display_name : null,
    hasWedding: r.has_wedding === true,
  };
}

export async function signup(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AuthUser> {
  const raw = await apiFetch("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      display_name: input.displayName,
    }),
  });
  // 🚨 signup 응답의 has_wedding 은 항상 false 하드코딩이라 값이 의미 없다.
  //    "혹시 true 면 홈으로" 같은 분기를 만들지 못하게 여기서 false 로 못 박는다.
  return { ...toAuthUser(raw), hasWedding: false };
}

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  const raw = await apiFetch("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  return toAuthUser(raw);
}

export async function logout(): Promise<void> {
  await apiFetch("/api/v1/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<AuthUser> {
  return toAuthUser(await apiFetch("/api/v1/auth/me"));
}

/**
 * 🚨 소셜 로그인은 `fetch` 로 부르면 안 된다 — 307 리다이렉트 + 쿠키 설정이라 XHR 로는
 * 성립하지 않는다. 반환된 URL 로 `window.location.href` 를 바꾼다.
 *
 * 지원 제공자는 구글·네이버 2종뿐이다(카카오는 백엔드에 없다).
 */
export function socialLoginUrl(provider: "google" | "naver"): string {
  return `${apiBase()}/api/v1/auth/${provider}/login`;
}
```

`frontend/src/entities/session/model/session-cache.ts`:

```ts
// 🚨 beforeLoad 는 캐시되지 않는다. TanStack Router 내부 문서 원문:
//    "The beforeLoad context is **not a cache** ... A subsequent navigation rebuilds merged
//     context from the parent and reruns beforeLoad, even when reusing completed loader data."
//    → 가드에서 getMe() 를 그냥 부르면 **탭을 옮길 때마다** GET /auth/me 왕복이 붙는다.
//      로컬에서는 수 ms 라 안 보이고 배포에서만 드러난다.
//
// loader 로 옮기는 것으로는 해결되지 않는다 — 리다이렉트 판정은 자식 로더가 돌기 **전에**
// 끝나야 하므로 beforeLoad 에 있어야 한다. 그래서 조회 쪽에 캐시를 씌운다.
import { getMe } from "../api/auth";
import type { AuthUser } from "./types";

/** 세션 수명은 30일이지만, 다른 탭에서 로그아웃한 경우가 이 창만큼 늦게 반영된다. */
const TTL_MS = 60_000;

let cached: { user: AuthUser; at: number } | null = null;

export async function loadSession(): Promise<AuthUser> {
  if (cached !== null && Date.now() - cached.at < TTL_MS) return cached.user;
  const user = await getMe();
  // **성공만 캐시한다.** 실패를 캐시하면 로그인 직후에도 TTL 동안 튕긴다.
  // 실패 시 재조회는 낭비가 아니다 — 곧바로 /login 으로 가고 거기엔 가드가 없다.
  cached = { user, at: Date.now() };
  return user;
}

export function invalidateSession(): void {
  cached = null;
}
```

`frontend/src/entities/session/index.ts`:

```ts
// session 슬라이스 공개 API — 슬라이스 밖에서는 이 파일로만 접근한다.
export { getMe, login, logout, signup, socialLoginUrl } from "./api/auth";
export { invalidateSession, loadSession } from "./model/session-cache";
export type { AuthUser } from "./model/types";
```

⚠️ `login` · `signup` · `logout` 이 성공하면 **반드시 `invalidateSession()` 을 부른다** — 상태가 바뀌는 지점이다. `api/auth.ts` 의 세 함수 끝에 넣는다(순환 import 를 피하려고 `session-cache` 가 `auth` 를 import 하므로, 반대 방향은 `app` 이나 화면이 부른다). **구현 시 순환이 생기면 무효화 호출을 화면(`LoginPage`)으로 올린다.**

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/entities/session/api/auth.test.ts`
Expected: PASS

- [ ] **Step 5: 4게이트를 돌리고 커밋한다**

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd .. && git add frontend/src/entities/session
git commit -m "feat(session): 인증 API 슬라이스를 세운다

전송 형식(snake_case)을 화면까지 끌고 가지 않는다 — 경계를 api/auth.ts 한 곳에 둔다.

signup 응답의 has_wedding 을 false 로 강제한다. 백엔드가 항상 false 를 하드코딩해서
값이 의미 없는데, 그대로 두면 「혹시 true 면 홈으로」 같은 분기가 생긴다.

소셜 로그인은 URL 만 만들어 준다 — fetch 로 부르면 307+쿠키라 성립하지 않는다."
```

---

## Task 7: `/login` 화면

**Files:**
- Create: `frontend/src/pages/login/ui/oauth-error.ts`
- Create: `frontend/src/pages/login/ui/LoginPage.tsx`
- Create: `frontend/src/pages/login/index.ts`
- Test: `frontend/src/pages/login/ui/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `login`, `signup`, `socialLoginUrl`, `AuthUser` (Task 6) · `isApiError` (Task 4) · `Page`, `Button`, `Card` (`@/shared/ui`)
- Produces:
  - `LoginPage` — 라우터가 `component`로 쓴다
  - `oauthErrorMessage(code: string): string`

**설계 근거** — `/login`에는 세션 가드를 두지 않는다. `POST /auth/signup`이 **201과 함께 이미 쿠키를 발급**하므로, 가드를 두면 **가입 직후 로그인 폼에 도달할 수 없다**(요구 플로우 ③).

- [ ] **Step 1: `oauth_error` 매핑 테스트를 쓴다**

`frontend/src/pages/login/ui/LoginPage.test.tsx`:

```ts
// /login 은 두 가지를 한다: 폼 2종(로그인·가입)과 oauth_error 표시.
// 라우팅 배선은 app/App.test.tsx 가 따로 본다 — 여기서는 화면 동작만 고정한다.
import { describe, expect, it } from "vitest";
import { oauthErrorMessage } from "./oauth-error";

describe("oauth_error 매핑", () => {
  // 백엔드가 소문자 snake 와 SCREAMING 을 섞어 보낸다 — 원문 그대로 받아야 한다.
  it.each([
    "unsupported_provider", "denied", "state_missing", "state_invalid",
    "state_mismatch", "upstream_failed",
    "EMAIL_ALREADY_EXISTS", "SOCIAL_ACCOUNT_ALREADY_LINKED", "UPSTREAM_LLM_ERROR", "UNKNOWN_ERROR",
  ])("%s 에 한국어 문구가 있다", (code) => {
    expect(oauthErrorMessage(code)).toMatch(/[가-힣]/);
  });

  it("모르는 코드도 빈 문자열을 주지 않는다 — 조용히 사라지면 안 된다", () => {
    expect(oauthErrorMessage("무언가_새로운_코드")).toMatch(/[가-힣]/);
  });

  it("state 만료는 원인을 짚어 준다 — 사용자가 무엇을 다시 해야 하는지 알아야 한다", () => {
    expect(oauthErrorMessage("state_missing")).toContain("다시");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/pages/login/ui/LoginPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./oauth-error"`

- [ ] **Step 3: 매핑을 구현한다**

`frontend/src/pages/login/ui/oauth-error.ts`:

```ts
// OAuth 콜백 실패는 JSON 이 아니라 `{프론트}/login?oauth_error=<코드>` 로 온다.
// ⚠️ 백엔드가 소문자 snake(앞 6개)와 SCREAMING(뒤 4개)을 섞어 보낸다 — 정규화하지 않고
//    원문 그대로 키로 쓴다. 대소문자를 맞추려다 매칭을 놓치는 편이 더 나쁘다.
const MESSAGES: Record<string, string> = {
  unsupported_provider: "지원하지 않는 로그인 방식입니다.",
  denied: "로그인이 취소되었습니다.",
  state_missing: "로그인 요청이 만료되었습니다. 다시 시도해 주세요.",
  state_invalid: "로그인 요청이 손상되었습니다. 다시 시도해 주세요.",
  state_mismatch: "보안 확인에 실패했습니다. 다시 시도해 주세요.",
  upstream_failed: "로그인 제공자와 통신하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  EMAIL_ALREADY_EXISTS: "이미 가입된 이메일입니다. 이메일 로그인을 이용해 주세요.",
  SOCIAL_ACCOUNT_ALREADY_LINKED: "다른 방식으로 가입된 계정입니다.",
  UPSTREAM_LLM_ERROR: "로그인 제공자 응답에 문제가 있었습니다. 다시 시도해 주세요.",
  UNKNOWN_ERROR: "로그인에 실패했습니다. 다시 시도해 주세요.",
};

/** 모르는 코드도 빈 문자열을 주지 않는다 — 조용히 사라지면 사용자는 무슨 일이 났는지 모른다. */
export function oauthErrorMessage(code: string): string {
  return MESSAGES[code] ?? "로그인에 실패했습니다. 다시 시도해 주세요.";
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/pages/login/ui/LoginPage.test.tsx`
Expected: PASS

- [ ] **Step 5: 화면 동작 테스트를 추가한다**

`LoginPage.test.tsx`에 추가:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import { LoginPage } from "./LoginPage";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
  useSearch: () => ({}),
}));

const loginFn = vi.fn();
const signupFn = vi.fn();
vi.mock("@/entities/session", () => ({
  login: (...a: unknown[]) => loginFn(...a),
  signup: (...a: unknown[]) => signupFn(...a),
  socialLoginUrl: (p: string) => `https://api.test/api/v1/auth/${p}/login`,
}));

beforeEach(() => {
  navigate.mockReset();
  loginFn.mockReset();
  signupFn.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("로그인 폼", () => {
  it("성공하면 웨딩 유무로 분기한다 — 없으면 온보딩", async () => {
    loginFn.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: false });
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.c");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw123456");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/onboarding" }));
  });

  it("웨딩이 있으면 홈으로 간다", async () => {
    loginFn.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.c");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw123456");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/" }));
  });

  it("실패는 화면에 드러난다 — 조용히 아무 일도 안 일어나면 안 된다", async () => {
    const { ApiError } = await import("@/shared/api");
    loginFn.mockRejectedValue(new ApiError({ code: "INVALID_CREDENTIALS", message: "x", status: 401, extra: {} }));
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.c");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/이메일 또는 비밀번호/);
    expect(navigate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: `LoginPage`를 구현한다**

`frontend/src/pages/login/ui/LoginPage.tsx`:

```tsx
// S0 로그인. 로그인과 가입을 한 화면에 둔다 — 리다이렉트가 없어 로컬 개발 제약을 안 받는다.
//
// ## 이 화면에 세션 가드가 없는 이유
// POST /auth/signup 이 201 과 함께 **이미 쿠키를 발급**한다. 「세션 있으면 튕김」 가드를 두면
// 가입 직후 로그인 폼에 도달할 수 없다. 가드를 빼도 무해하다 — 로그인이 새 세션을 발급해도
// 백엔드가 누적할 뿐이다.
//
// ## 비밀번호 자동 채움은 메모리 전용이다
// 가입 성공 시 방금 쓴 값을 로그인 폼에 채운다. **저장하지 않는다** — localStorage·
// sessionStorage·쿠키·URL 어디에도 넣지 않고 이 컴포넌트의 상태로만 들고 있다가 1회 소비한다.
import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { login, signup, socialLoginUrl } from "@/entities/session";
import { isApiError } from "@/shared/api";
import { Button, Card, Page } from "@/shared/ui";
import { oauthErrorMessage } from "./oauth-error";

type Mode = "login" | "signup";

const LOGIN_ERROR: Record<string, string> = {
  INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않습니다.",
  EMAIL_ALREADY_EXISTS: "이미 가입된 이메일입니다.",
  NETWORK_ERROR: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
};

export function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { oauth_error?: string };

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(
    search.oauth_error === undefined ? null : oauthErrorMessage(search.oauth_error),
  );
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup({ email, password, displayName });
        // 가입은 성공했지만 곧바로 홈으로 보내지 않는다 — 요구 플로우가 로그인을 한 번 더 거친다.
        // 값은 상태에 그대로 남아 있으므로 폼이 이미 채워진 상태가 된다(메모리 전용).
        setMode("login");
        return;
      }
      const user = await login({ email, password });
      await navigate({ to: user.hasWedding ? "/" : "/onboarding" });
    } catch (cause) {
      const code = isApiError(cause) ? cause.code : "UNKNOWN_ERROR";
      setError(LOGIN_ERROR[code] ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="로그인" width="max-w-[430px]">
      <Card>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label className="flex flex-col gap-1 text-sm">
              이름
              <input
                className="min-h-tap rounded-md border border-line px-3"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            이메일
            <input
              className="min-h-tap rounded-md border border-line px-3"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            비밀번호
            <input
              className="min-h-tap rounded-md border border-line px-3"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
          </label>

          {error !== null && (
            <p role="alert" className="text-sm text-primary">
              {error}
            </p>
          )}

          <Button type="submit" block disabled={busy}>
            {mode === "signup" ? "회원가입" : "로그인"}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" block onClick={() => { window.location.href = socialLoginUrl("google"); }}>
          구글로 계속하기
        </Button>
        <Button variant="secondary" block onClick={() => { window.location.href = socialLoginUrl("naver"); }}>
          네이버로 계속하기
        </Button>
      </div>

      <Button
        variant="ghost"
        onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
      >
        {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
      </Button>
    </Page>
  );
}
```

`frontend/src/pages/login/index.ts`:

```ts
export { LoginPage } from "./ui/LoginPage";
```

- [ ] **Step 7: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/pages/login`
Expected: PASS

- [ ] **Step 8: 4게이트를 돌리고 커밋한다**

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd .. && git add frontend/src/pages/login
git commit -m "feat(login): S0 로그인 화면 — 로그인·가입 한 화면 + oauth_error 처리

세션 가드를 두지 않는다. signup 이 201 과 함께 이미 쿠키를 발급하므로, 가드를 두면
가입 직후 로그인 폼에 도달할 수 없다(요구 플로우 ③ 자동 채움이 성립하지 않는다).

비밀번호 자동 채움은 컴포넌트 상태로만 한다 — localStorage·sessionStorage·쿠키·URL
어디에도 넣지 않는다.

oauth_error 는 소문자 snake 와 SCREAMING 이 섞여 오므로 정규화하지 않고 원문을 키로 쓴다.
모르는 코드도 빈 문자열을 주지 않는다."
```

---

## Task 8: 가드 라우트 2층 배선

**Files:**
- Modify: `frontend/src/app/router/router.tsx`
- Modify: `frontend/src/app/main.tsx` (401 무효화 배선)
- Test: `frontend/src/app/App.test.tsx` (기존 파일에 추가)

**Interfaces:**
- Consumes: `loadSession`, `invalidateSession`, `AuthUser` (Task 6) · `LoginPage` (Task 7) · `onUnauthorized` (Task 4)
- Produces: 라우트 트리. `_authed` 컨텍스트에 `{ user: AuthUser }`

**설계 근거** — 판정을 **두 층으로 나눈다.** 한 층에서 「세션 없으면 /login, 웨딩 없으면 /onboarding」을 함께 처리하면 `/onboarding` 자신이 그 가드 아래 있으므로 **무한 리다이렉트**가 된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/app/App.test.tsx`에 추가:

```tsx
import { vi } from "vitest";
import { ApiError } from "@/shared/api";

const getMeMock = vi.fn();
vi.mock("@/entities/session", async (orig) => ({
  ...(await orig<typeof import("@/entities/session")>()),
  // 가드가 부르는 것은 loadSession 이다 — 캐시를 거치지 않으면 네비게이션마다 왕복한다.
  loadSession: () => getMeMock(),
}));

function unauthorized() {
  return new ApiError({ code: "UNAUTHORIZED", message: "로그인이 필요합니다.", status: 401, extra: {} });
}

describe("가드 — 세션과 웨딩을 두 층으로 나눈다", () => {
  it("미인증으로 / 에 들어오면 /login 으로 간다", async () => {
    getMeMock.mockRejectedValue(unauthorized());
    renderAt("/");
    await expectScreen("로그인");
  });

  it("로그인했지만 웨딩이 없으면 온보딩으로 간다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: false });
    renderAt("/");
    await expectScreen("온보딩");
  });

  it("웨딩이 있으면 대시보드가 그대로 보인다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
    renderAt("/");
    await expectScreen("대시보드");
  });

  // 한 층으로 합치면 여기서 무한 리다이렉트가 난다 — 그 회귀를 고정한다.
  it("웨딩이 있는 사용자가 /onboarding 에 들어오면 홈으로 되돌아온다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
    renderAt("/onboarding");
    await expectScreen("대시보드");
  });

  it("웨딩이 없는 사용자는 온보딩에 머무른다 — 되돌려 보내면 루프다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: false });
    renderAt("/onboarding");
    await expectScreen("온보딩");
  });

  it("/login 은 세션이 있어도 열린다 — 가입 직후 자동 채움 경로가 여기를 지난다", async () => {
    getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
    renderAt("/login");
    await expectScreen("로그인");
  });

  it("네트워크 실패는 로그인으로 보낸다 — 흰 화면으로 두지 않는다", async () => {
    getMeMock.mockRejectedValue(new ApiError({ code: "NETWORK_ERROR", message: "x", status: 0, extra: {} }));
    renderAt("/");
    await expectScreen("로그인");
  });
});
```

⚠️ 기존 테스트들도 이제 `getMe`를 거치므로, 파일 상단 `beforeEach`에서 기본값을 준다:

```ts
beforeEach(() => {
  getMeMock.mockReset();
  getMeMock.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/app/App.test.tsx`
Expected: FAIL — `/` 에서 로그인 화면이 안 나온다(가드가 아직 없다)

- [ ] **Step 3: 라우터를 고친다**

`frontend/src/app/router/router.tsx`의 트리 부분을 이렇게 바꾼다. `rootRoute` 정의 아래에 추가:

```tsx
import { isRedirect, redirect } from "@tanstack/react-router";
import { loadSession } from "@/entities/session";
import { LoginPage } from "@/pages/login";

// 로그인 화면은 셸 밖이고 **세션 가드가 없다** — signup 이 201 과 함께 쿠키를 발급하므로
// 가드를 두면 가입 직후 로그인 폼에 도달할 수 없다(요구 플로우 ③).
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    oauth_error: typeof search.oauth_error === "string" ? search.oauth_error : undefined,
  }),
});

// ## 판정을 두 층으로 나눈다
//
// 한 층에서 「세션 없으면 /login, 웨딩 없으면 /onboarding」을 함께 처리하면 /onboarding 자신이
// 그 가드 아래 있으므로 **무한 리다이렉트**가 된다. 그래서 _authed 는 세션만, _shell 은 웨딩만 본다.
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authed",
  beforeLoad: async ({ location }) => {
    try {
      // 🚨 getMe() 를 직접 부르지 않는다. beforeLoad 는 캐시되지 않아서
      //    (공식: "A subsequent navigation ... reruns beforeLoad") 탭 이동마다 왕복이 붙는다.
      return { user: await loadSession() };
    } catch (cause) {
      // 의도적 리다이렉트를 여기서 삼키면 다시 리다이렉트가 걸려 루프가 된다.
      if (isRedirect(cause)) throw cause;
      // 401 도 네트워크 실패도 결과는 같다 — 로그인 화면으로 보낸다. 흰 화면으로 두지 않는다.
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
});

const onboardingRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/onboarding",
  beforeLoad: ({ context }) => {
    // 이미 온보딩을 마친 사용자를 다시 보내면 POST /weddings 가 409 로 막힌다.
    if (context.user.hasWedding) throw redirect({ to: "/" });
  },
  component: lazyRouteComponent(() => import("@/pages/onboarding"), "OnboardingPage"),
});

const shellRoute = createRoute({
  getParentRoute: () => authedRoute,
  id: "_shell",
  beforeLoad: ({ context }) => {
    if (!context.user.hasWedding) throw redirect({ to: "/onboarding" });
  },
  component: AppShell,
});
```

기존 `shellRoute`·`onboardingRoute` 정의는 위 두 개로 **교체**한다(중복 정의를 남기지 않는다). 화면 라우트들의 `getParentRoute`는 그대로 `() => shellRoute`다.

트리 조립을 바꾼다:

```tsx
export const routeTree = rootRoute.addChildren([
  loginRoute,
  authedRoute.addChildren([
    onboardingRoute,
    shellRoute.addChildren([
      dashboardRoute,
      categoryRoute,
      timelineRoute,
      budgetRoute,
      reportRoute,
      styleGuideRoute,
    ]),
  ]),
]);
```

- [ ] **Step 3-a: 401 무효화를 `app` 레이어에서 배선한다**

`frontend/src/app/main.tsx`에 추가:

```tsx
import { invalidateSession } from "@/entities/session";
import { onUnauthorized } from "@/shared/api";

// 세션이 사용 중 만료되면(슬라이딩 갱신이 없어 30일째 반드시 온다) 캐시된 세션이 거짓을 말한다.
// shared/api 는 entities 를 import 할 수 없으므로(하향 규칙) 구독으로 뒤집고, 배선은 조립
// 레이어인 여기서 한다. entities/session 이 모듈 로드 부작용으로 스스로 등록하지 않는 이유는
// 그러면 배선이 import 순서에 숨고 트리셰이킹으로 조용히 사라질 수 있기 때문이다.
onUnauthorized(invalidateSession);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/app/App.test.tsx`
Expected: PASS — 기존 라우팅 테스트 + 새 가드 테스트 전부

- [ ] **Step 5: 초기 청크가 움직였는지 확인한다**

Run: `cd frontend && npm run build`
Expected: 초기 청크 gzip이 **96,000 미만**. `isRedirect` 추가로 소량 증가는 정상이나, **크게 늘었다면 `LoginPage`가 정적으로 딸려 들어온 것**이다 — 그 경우 lazy로 내리고 다시 잰다.

- [ ] **Step 6: 4게이트를 돌리고 커밋한다**

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd .. && git add frontend/src/app/router/router.tsx frontend/src/app/App.test.tsx
git commit -m "feat(router): 인증 가드를 두 층으로 배선한다 — _authed(세션) · _shell(웨딩)

한 층에서 두 판정을 함께 하면 /onboarding 자신이 그 가드 아래 있어 무한 리다이렉트가
된다. 세션만 보는 층과 웨딩만 보는 층으로 나눈다. 그 회귀를 App.test.tsx 가 고정한다.

isRedirect 로 의도적 리다이렉트와 실제 오류를 구분한다 — 구분하지 않으면 리다이렉트가
catch 에 걸려 다시 리다이렉트되는 루프가 생긴다.

401 과 네트워크 실패를 같은 곳으로 보낸다. 흰 화면으로 두지 않는다."
```

---

## Task 9: 미지원 브라우저 감지 + CSP

**Files:**
- Modify: `frontend/src/pages/login/ui/LoginPage.tsx`
- Modify: `frontend/src/pages/login/ui/LoginPage.test.tsx`
- Modify: `frontend/public/staticwebapp.config.json`

**Interfaces:**
- Consumes: `getMe` (Task 6)
- Produces: (없음 — 화면 내부 동작)

**설계 근거** — 지원 범위를 Chromium으로 정해도 **Safari 사용자는 앱을 열 수 있다.** 그때 「로그인은 200인데 그다음부터 전부 401」이라는 가장 헷갈리는 형태로 죽는다. **UA가 아니라 행동으로 판별한다** — UA로는 Chrome 시크릿 모드와 Edge Strict를 잡지 못한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`LoginPage.test.tsx`에 추가:

```tsx
const getMeFn = vi.fn();
// 위 vi.mock("@/entities/session", …) 의 팩토리에 getMe: () => getMeFn() 를 추가한다.

describe("쿠키 왕복 확인 — UA 가 아니라 행동으로 판별한다", () => {
  it("로그인 200 직후 /auth/me 가 401 이면 미지원 안내를 띄운다", async () => {
    loginFn.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
    const { ApiError } = await import("@/shared/api");
    getMeFn.mockRejectedValue(new ApiError({ code: "UNAUTHORIZED", message: "x", status: 401, extra: {} }));

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.c");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw123456");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/로그인 상태가 유지되지 않/);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("프로브가 통과하면 평소대로 이동한다", async () => {
    loginFn.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });
    getMeFn.mockResolvedValue({ id: "u", email: "a@b.c", displayName: null, hasWedding: true });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.c");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw123456");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/" }));
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/pages/login`
Expected: FAIL — 프로브가 없어 401이어도 그대로 이동한다

- [ ] **Step 3: 프로브를 구현한다**

`LoginPage.tsx`의 import에 `getMe`를 추가하고, `handleSubmit`의 로그인 분기를 바꾼다:

```tsx
      const user = await login({ email, password });

      // 쿠키 왕복 확인 — 로그인 응답은 이미 사용자 정보를 줬으므로 이 호출의 목적은 데이터가
      // 아니라 **쿠키가 실제로 돌아오는가**다. Safari/Firefox·Chrome 시크릿·Edge Strict 에서
      // 여기가 401 이 되고, 그대로 진행하면 「로그인은 됐는데 그다음부터 전부 401」이 된다.
      // UA 판별을 쓰지 않는 이유: 시크릿 모드는 UA 가 같고, 사용자가 설정에서 끈 경우도 같다.
      //
      // 🚨 loadSession() 이 아니라 getMe() 다. 캐시를 거치면 「쿠키가 실제로 왕복하는가」를
      //    재는 게 아니라 캐시를 읽게 되어 **프로브가 무력화된다.** 「캐시를 쓰도록」 바꾸지 말 것.
      try {
        await getMe();
      } catch {
        setError(
          "이 브라우저에서는 로그인 상태가 유지되지 않습니다. " +
            "Chrome 또는 Edge 일반 창에서 다시 시도해 주세요.",
        );
        return;
      }

      await navigate({ to: user.hasWedding ? "/" : "/onboarding" });
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/pages/login`
Expected: PASS

- [ ] **Step 5: CSP에 API 호스트를 넣는다**

`frontend/public/staticwebapp.config.json`의 `Content-Security-Policy`에서 `connect-src 'self'`를 고친다:

```
connect-src 'self' https://20-249-52-148.nip.io;
```

같은 파일의 `__CSP_NOTE__`도 갱신한다 — *"src 에서 import.meta.env 를 읽는 코드 0건 · 전송 계층 없음"* 은 이제 거짓이다. 전송 계층이 생겼고 `connect-src`에 API 오리진이 필요하며, **SSE `fetch`도 `connect-src`가 커버한다**는 사실을 적는다.

- [ ] **Step 6: 배포 설정 게이트가 통과하는지 확인한다**

Run: `cd frontend && npm run build`
Expected: `배포 설정` 절이 전부 통과

- [ ] **Step 7: 4게이트를 돌리고 커밋한다**

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd .. && git add frontend/src/pages/login frontend/public/staticwebapp.config.json
git commit -m "feat(login): 쿠키 왕복을 행동으로 검증하고 CSP 에 API 호스트를 넣는다

지원 범위를 Chromium 으로 정해도 Safari 사용자는 앱을 열 수 있다. 그때 「로그인은 200
인데 그다음부터 전부 401」이라는 가장 헷갈리는 형태로 죽는다 — 조용한 실패다.

UA 판별을 쓰지 않는다. Chrome 시크릿 모드는 UA 가 같고, 사용자가 설정에서 서드파티
쿠키를 끈 경우도 같다. 로그인 직후 /auth/me 가 401 인지로 실제 조건을 직접 잰다.

이 프로브는 원래 수동 검증 절차였던 것을 제품 코드로 승격시킨 것이다 — SameSite 수정이
배포에 반영됐는지도 이걸로 드러난다."
```

---

## Task 10: 브라우저 실측 — 로컬 백엔드로 수직 관통 확인

**Files:**
- Modify: `frontend/docs/architecture/backend-integration.md` (실측 결과 기록)

**Interfaces:**
- Consumes: Task 1~9 전부
- Produces: (없음 — 검증 태스크)

**이 태스크가 필요한 이유** — 앞의 9개는 전부 `fetch`를 스텁한 단위 테스트다. **쿠키가 실제 브라우저에서 왕복하는지는 그것으로 알 수 없다.** 이 저장소가 반복해서 데인 사고가 정확히 그 형태다.

- [ ] **Step 1: 로컬 백엔드를 띄운다**

```bash
# WSL 에서
cd /mnt/c/programming/sesac-third-project/branchs/backend_jy/backend
uv sync --extra dev
uv run alembic upgrade head        # DATABASE_URL 이 postgresql://user:pw@host:5432/db 형식이어야 한다
uv run uvicorn app.main:app --port 8000
```

Expected: `curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8000/api/v1/health` → `200`

- [ ] **Step 2: dev 서버를 `localhost`로 띄운다**

```bash
cd frontend && npm run dev
```

⚠️ **`127.0.0.1`로 띄우면 안 된다** — 백엔드 CORS 허용 오리진이 `http://localhost:5173` 정확히 하나다.

- [ ] **Step 3: 수직 관통을 브라우저에서 확인한다**

| # | 확인할 것 | 기대 |
|---|---|---|
| 1 | `http://localhost:5173/` 진입 | `/login` 으로 리다이렉트 |
| 2 | 회원가입 (이메일·비밀번호 8자 이상·이름) | 로그인 폼으로 전환되고 **값이 채워져 있다** |
| 3 | 로그인 버튼 | `/onboarding` 으로 이동 |
| 4 | 개발자도구 Application → Cookies | `wr_session` 이 `HttpOnly`·`Secure`·`SameSite=None` 으로 있다 |
| 5 | 새로고침 | 로그인 상태가 유지된다(`/onboarding` 에 머무름) |
| 6 | 잘못된 비밀번호로 로그인 | 「이메일 또는 비밀번호가 올바르지 않습니다.」가 `role="alert"` 로 뜬다 |
| 7 | Network 탭의 `/auth/me` | 요청 헤더에 `Cookie: wr_session=…` 이 실려 있다 |

- [ ] **Step 4: 미지원 경로도 실제로 확인한다**

**Chrome 시크릿 창**에서 같은 로그인을 시도한다.
Expected: 「이 브라우저에서는 로그인 상태가 유지되지 않습니다」 안내가 뜨고 **이동하지 않는다.**

⚠️ 시크릿에서도 통과한다면 **프로브가 동작하지 않는 것**이다. 시크릿 창이 서드파티 쿠키를 차단하는지 먼저 확인하고(`chrome://settings/cookies`), 그래도 통과하면 로컬이 same-site라 조건 자체가 안 만들어진 것이다 — 그 경우 배포 후 다시 잰다.

- [ ] **Step 5: 실측 결과를 문서에 기록한다**

`backend-integration.md` §4에 「실측 기록」 절을 추가하고 위 표의 결과를 날짜와 함께 적는다. **통과·미통과·미확인을 구분해서** 적는다 — 미확인을 통과로 적으면 그게 다음 사고의 원인이 된다.

- [ ] **Step 6: 커밋한다**

```bash
cd .. && git add frontend/docs/architecture/backend-integration.md
git commit -m "docs(frontend): 인증 수직 관통 브라우저 실측을 기록한다

단위 테스트는 fetch 를 스텁하므로 쿠키가 실제로 왕복하는지 알 수 없다. 이 저장소가
반복해서 데인 사고가 정확히 그 형태다 — 서버 점검은 전부 초록인데 브라우저에서만 죽는다."
```

---

## Task 11: CI 가 새 게이트를 견디게 한다

**Files:**
- Modify: `.github/workflows/frontend-ci.yml`

**Interfaces:**
- Consumes: Task 2의 빌드 게이트
- Produces: (없음)

**왜 필요한가** — Task 2의 게이트는 `VITE_API_BASE`가 비면 **빌드를 실패시킨다.** 지금 CI는 그 경우 경고만 남기고 통과시키므로, **포크 PR CI가 빨간불이 된다.** 시크릿 자체는 존재한다(`gh secret list` 확인) — 문제는 GitHub이 포크에 시크릿을 전달하지 않는 것이다.

- [ ] **Step 1: 현재 상태를 확인한다**

```bash
gh secret list | grep VITE_API_BASE     # 존재해야 한다
gh workflow view frontend-ci.yml        # Test 스텝에 env 가 없음을 눈으로 확인
```

- [ ] **Step 2: Build 스텝을 고친다**

`.github/workflows/frontend-ci.yml`의 Build 스텝 `run:` 블록을 교체한다:

```yaml
            - name: Build
              env:
                  VITE_API_BASE: ${{ secrets.VITE_API_BASE }}
              run: |
                  # 포크 PR 에는 GitHub 이 시크릿을 전달하지 않는다(사양). 포크는 배포되지도
                  # 않으므로 산출물의 오리진이 의미 없다 — 더미로 빌드 검증만 한다.
                  # 반대로 비포크에서 값이 비면 **배포될 산출물이 아무 데도 못 붙는다**는 뜻이라
                  # 경고가 아니라 실패여야 한다. (예전 경고문 "상대 경로로 나간다"는 `?? ""`
                  # 폴백을 전제한 서술이고, 그 폴백은 제거됐다.)
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

- [ ] **Step 3: 🚨 시크릿 **값**이 새 형식 규칙을 통과하는지 확인한다**

시크릿 값은 읽을 수 없다(설계상 그렇다). **끝 슬래시나 경로가 붙어 있으면 이 게이트를 켜는 순간부터 모든 빌드가 실패한다.**

```bash
gh workflow run frontend-ci.yml --ref feature/link_backend
gh run list --workflow=frontend-ci.yml --limit 1
gh run view --log-failed        # 실패하면 [assert-api-base] 메시지가 사유를 말해 준다
```

Expected: 성공. 실패하면 **게이트가 아니라 시크릿 값을 고친다** — `https://20-249-52-148.nip.io`(끝 슬래시 없음).

- [ ] **Step 4: 커밋한다**

```bash
git add .github/workflows/frontend-ci.yml
git commit -m "ci(frontend): VITE_API_BASE 부재를 경고가 아니라 실패로 다룬다

Task 2 의 빌드 게이트가 빈 값을 거부하므로 기존 경고-후-통과는 포크 PR CI 를 빨간불로
만든다. 포크는 배포되지 않으므로 더미 오리진으로 빌드 검증만 하고, 비포크에서 값이 비면
실패시킨다 — 그건 배포될 산출물이 아무 데도 못 붙는다는 뜻이다.

기존 경고문 「API 호출이 상대 경로로 나간다」는 ?? \"\" 폴백을 전제한 서술이고 그 폴백은
제거됐다."
```

⚠️ **Test 스텝에는 env 를 추가하지 않는다.** 근본 해결은 테스트가 `apiBase()`를 부르지 않는 것이고, Task 4의 지연 검증이 그걸 성립시킨다. env 를 주면 「테스트가 오리진에 의존해도 된다」는 잘못된 신호가 남는다.

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 요구 | 태스크 |
|---|---|
| `apiFetch` 5계약 (credentials·헤더 순서·`unknown`·`code` 분기·멀티파트) | Task 4 |
| `VITE_API_BASE` URL 파서 게이트 | Task 1 · 2 |
| 루프백이 배포 빌드에 만드는 구멍(§2.2-a) | Task 2 |
| 계약 어휘 `contract.ts` | Task 5 |
| 세션 계약 · `signup` 의 `has_wedding` 불신 | Task 6 |
| `/login` 라우트 + `oauth_error` 10종 | Task 7 |
| 비밀번호 자동 채움 = 메모리 전용 | Task 7 |
| `_authed`/`_shell` 2층 가드 | Task 8 |
| 401 · `WEDDING_NOT_FOUND` 를 한 곳에서 | Task 8 |
| 행동 기반 미지원 감지 | Task 9 |
| CSP `connect-src` | Task 9 |
| 브라우저 실측 | Task 10 |
| **`apiBase()` 지연 검증**(모듈 최상위 throw 금지) | Task 4 |
| **`signal` 전달**(`abortController`) | Task 4 |
| **401 구독 → 세션 무효화**(레이어 역전) | Task 4 · 6 · 8 |
| **세션 TTL 캐시**(`beforeLoad` 는 캐시되지 않는다) | Task 6 · 8 |
| **CI 가 새 게이트를 견디게** | Task 11 |

**이 계획이 다루지 않는 것**(계획 ②~⑥ 소관): S1 온보딩 폼·「올해 하반기」 2단계 저장 · S2~S6 화면 · SSE · 드리프트 감지 게이트(`check-api-contract.mjs`) · 3층 번들 예산 게이트 · **라우트별 `staleTime` 구체값과 `defaultPendingComponent`/`defaultErrorComponent`**(이 계획에는 데이터 로더가 아직 없다. 시각 디자인은 디자인 오너 결정이 선행되어야 한다 — `backend-integration.md` §4.5).

> ⚠️ **`WEDDING_NOT_FOUND` 는 Task 8 이 「웨딩 유무」 판정으로 흡수한다.** 가드가 `hasWedding`으로 먼저 거르므로 그 에러가 화면까지 올라오는 경로는 계획 ②에서 실데이터 호출이 붙을 때 다시 본다.

**2. 플레이스홀더 스캔** — 「TBD」·「적절히 처리」·「Task N과 유사」 없음. 모든 코드 단계에 실제 코드가 있다.

**3. 타입 일관성** — `AuthUser`(Task 6)를 Task 7·8이 같은 필드명(`hasWedding`·`displayName`)으로 쓴다. `ApiError`(Task 3)의 생성자 인자 형태가 Task 4·8·9의 테스트와 일치한다. `checkApiBase`/`isLoopbackApiBase`(Task 1)를 Task 2가 같은 시그니처로 쓴다.

---

## 실행 전 확인할 것

- **백엔드가 떠 있어야 Task 10 을 할 수 있다.** Task 1~9 는 백엔드 없이 진행 가능하다(전부 스텁 단위 테스트).
- **`VITE_API_BASE` 가 `.env` 에 있어야 빌드가 된다.** 현재 `http://localhost:8000`.
- **초기 청크 예산 여유가 3,126 B 다.** Task 8 이후 반드시 확인한다 — 크게 늘었다면 `LoginPage` 가 정적으로 딸려 들어온 것이다.
