# 백엔드 연동 — 무엇이 서 있고 무엇이 남았나

> **최종 갱신** 2026-08-26
> **성격** 인계 문서. 이 연동 작업을 **이어받는 사람이 가장 먼저 읽는 문서**다.
> 규범이 아니라 **현재 상태와 다음 할 일**을 적는다. 값의 근거가 필요하면 아래 「읽는 순서」의 문서로 간다.

---

## 0. 30초 요약

**전송 계층 · 인증 API · 로그인 화면 · 라우터 가드 2층까지 섰다.** 「가입 → 로그인 → 온보딩」 플로우가
코드상으로는 완결됐다. 남은 것은 **브라우저 실측 1건 · CSP/미지원 감지 1건 · CI 게이트 1건**, 그리고 **화면 5개**다.

🚨 **가장 중요한 사실 하나** — 여기까지의 검증은 **전부 `fetch` 를 스텁한 단위 테스트**다.
**쿠키가 실제 브라우저에서 왕복하는지는 아직 아무도 확인하지 않았다.** 그것이 §4 의 첫 번째 항목이고,
이 저장소가 반복해서 데인 사고가 정확히 그 형태다(§5).

---

## 1. 읽는 순서

이어받는 사람이 처음이라면 이 순서로 읽는다. 전부 `frontend/docs/` 안에 있다.

| 순서 | 문서 | 왜 |
|---|---|---|
| 1 | **이 문서** | 현재 상태·남은 일·함정 |
| 2 | [`adr/0007-백엔드-연동-아키텍처를-확정한다.md`](../adr/0007-백엔드-연동-아키텍처를-확정한다.md) | **왜 이렇게 지었나** — 결정 6건과 그 근거. 「제안」 상태이고 승인은 결정자 몫 |
| 3 | [`architecture/backend-integration.md`](backend-integration.md) | **전송·인증 계약** — `apiFetch` 5계약 · `VITE_API_BASE` 게이트 · 가드 2층 · 브라우저 매트릭스 |
| 4 | [`architecture/api-contract.md`](api-contract.md) | **엔드포인트·필드** — 계약 어휘 · TS 이관 함정 7종 |
| 5 | [`plans/2026-08-25-backend-integration-transport-auth.md`](../plans/2026-08-25-backend-integration-transport-auth.md) | **구현 계획 원본** — 태스크 1~11 의 코드·테스트가 그대로 들어 있다. 남은 T9~T11 은 여기서 이어받는다 |
| 6 | [`backend-analysis/README.md`](../backend-analysis/README.md) | **백엔드 조사 원본** — 엔드포인트 전수·스키마·데이터 모델·SSE·배포 실측. 화면을 만들 때 펼친다 |

S3(AI 상담)를 맡았다면 [`architecture/chat-streaming.md`](chat-streaming.md) 를 3번 다음에 읽는다.

> ⚠️ **계약의 정본은 `architecture/` 3종 + ADR 0007 이다.** `backend-analysis/` 는 **조사 원본**이라
> 더 자세하지만 더 빨리 낡는다. 둘이 어긋나면 `architecture/` 가 이긴다.

---

## 2. 지금 서 있는 것

<!-- STATUS-TABLE-START -->
### 파일

| 파일 | 책임 |
|---|---|
| `src/shared/api/api-base.ts` | **순수 함수만.** `checkApiBase` · `isLoopbackApiBase`. `import.meta` 를 읽지 않는다 — `vite.config.ts`(Node)가 이 모듈을 import 하기 때문이다 |
| `src/shared/api/env.ts` | `apiBase()` — **상수가 아니라 함수다**(§7-②) |
| `src/shared/api/errors.ts` | `ApiError`(`code`·`status`·`extra`) · `parseApiError` · `isApiError` |
| `src/shared/api/client.ts` | `apiFetch` · `apiFetchMultipart` · `onUnauthorized` |
| `src/shared/api/contract.ts` | 백엔드 Literal 사본 — 카테고리 9 · 지역 17 · 티어 · verdict · 챗 역할/단계 |
| `src/shared/api/index.ts` | 공개 표면 |
| `src/entities/session/api/auth.ts` | `signup` · `login` · `logout` · `getMe` · `socialLoginUrl` + **snake↔camel 경계** |
| `src/entities/session/model/session-cache.ts` | `loadSession()` · `invalidateSession()` — TTL 60초, **성공만 캐시** |
| `src/entities/session/model/types.ts` | `AuthUser` |
| `src/pages/login/ui/LoginPage.tsx` | 로그인·가입 한 화면 + `oauth_error` 표시 |
| `src/pages/login/ui/oauth-error.ts` | `oauth_error` 코드 → 한국어 문구 |
| `src/app/router/router.tsx` | `/login` · **`_authed` · `_shell` 2층 가드** (수정) |
| `src/app/main.tsx` | 401 → `invalidateSession` 배선 (수정) |
| `vite.config.ts` | `VITE_API_BASE` 형식 게이트 + **CI 루프백 차단** (수정) |
| `tsconfig.app.json` | `allowImportingTsExtensions` — 위 게이트가 `.ts` 를 import 하기 위한 것 (수정) |

### 공개 표면 — 이것만 쓰면 된다

```ts
import {
  apiFetch, apiFetchMultipart, apiBase, onUnauthorized,
  ApiError, isApiError, parseApiError,
  CATEGORY_CODES, REGION_CODES, /* … 계약 어휘 */
} from "@/shared/api";

import {
  login, signup, logout, getMe, socialLoginUrl,
  loadSession, invalidateSession, type AuthUser,
} from "@/entities/session";
```

### 검증 상태

- **단위 테스트로 덮인 것**: `VITE_API_BASE` 형식 21케이스 · 에러 정규화 · 전송 5계약(헤더 병합 순서·멀티파트·`signal`·401 구독) · 인증 4엔드포인트 · 세션 캐시 TTL · 로그인 화면 동작 · **가드 리다이렉트**
- 🚨 **브라우저로 덮인 것: 없다.** 전부 `fetch` 스텁이다 — §4.1 의 T10 을 보라

### 🚨 번들 예산 — 다음 사람이 가장 먼저 볼 곳

| 층 | 현재 | 한도 |
|---|---|---|
| **초기 청크** | **95,930** | **96,000** ← **여유 70 B** |
| JS 합계 | 113,695 | 116,000 |

**초기 청크 여유가 70 바이트다.** 인증 배선이 들어오면서 92,874 → 95,930 으로 늘었다(그전까지는 라우트
트리에서 도달 불가라 통째로 트리셰이킹되고 있었다). **다음 화면은 반드시 lazy 로** 넣고, 초기 청크가
움직이면 그것부터 조사한다.

⚠️ **`LoginPage` 를 lazy 로 바꾸는 시도는 이미 해 봤고 합계가 더 나빠졌다**(115,029 B) — Rollup 이 공유
`Page` 청크를 뽑아내는데 그것도 `modulepreload` 되어 임계 경로에 남기 때문이다. 같은 시도를 반복하지 마라.
<!-- STATUS-TABLE-END -->

---

## 3. 어떻게 쓰나

새 도메인 호출을 붙일 때 **전송 계층을 다시 만들지 마라.** 이미 있다.

```ts
// entities/<슬라이스>/api/*.ts 에서
import { apiFetch, ApiError, isApiError } from "@/shared/api";

const raw = await apiFetch("/api/v1/weddings/me");   // credentials 는 내장돼 있다
// raw 는 unknown 이다 — 이 파일이 좁히는 경계다
```

**지켜야 할 것 다섯 가지** (근거는 [`backend-integration.md`](backend-integration.md) §1.2):

1. **응답은 `unknown` 으로 받고 슬라이스가 좁힌다.** 백엔드 OpenAPI 에는 `securitySchemes` 가 없고 SSE 페이로드도 없다 — 생성 타입을 믿지 않는다.
   좁힐 때 **캐스팅만 하고 끝내지 마라.** `raw as Record<string, unknown>` 뒤에 `String(r.id)` 를 쓰면, 필드가 없을 때 `String(undefined)` 가 **리터럴 `"undefined"`** 를 만들어 **유효해 보이는 객체**가 나온다. 실제로 이 코드베이스에서 한 번 잡힌 결함이다(`entities/session/api/auth.ts` 의 `toAuthUser` 가 그 교정본이니 그것을 본떠라).
2. **에러 분기는 `status` 가 아니라 `code`.** `TOTAL_BUDGET_UNAVAILABLE` 이 404 와 422 **양쪽으로** 온다.
3. **`credentials: "include"` 를 다시 넣지 마라.** `apiFetch` 가 내장한다.
4. **`?? ""` 같은 폴백을 넣지 마라.** 이 저장소가 명시적으로 금지한 패턴이다 — 조용한 실패를 만든다.
5. **세션이 필요하면 `loadSession()`** 을 쓴다(`getMe()` 직접 호출이 아니라). 이유는 §7-③.

**로그인·가입·로그아웃 뒤에는 반드시 `invalidateSession()`** 을 부른다. 안 부르면 **최대 60초** 동안
낡은 세션이 남고, 특히 `hasWedding` 이 낡아 **가입 직후 온보딩이 아니라 홈으로 튄다**.
(무효화를 `auth.ts` 안에 넣지 못한 이유는 §7-④.)

---

## 4. 남은 일

### 4.1 이 계획(①)에서 남은 3건

계획 원본 [`plans/2026-08-25-backend-integration-transport-auth.md`](../plans/2026-08-25-backend-integration-transport-auth.md) 의
**Task 9 · 10 · 11** 에 코드와 명령이 그대로 있다. 순서 의존은 없다.

| # | 내용 | 왜 남았나 |
|---|---|---|
| **T10** | **브라우저 실측 — 로컬 백엔드로 수직 관통 확인** | **가장 중요하다.** 코드를 만들지 않는 검증 태스크라, WSL 백엔드 기동 + dev 서버 + 브라우저 확인이 필요해 사람이 하는 편이 자연스럽다 |
| T9 | 미지원 브라우저 감지 + CSP `connect-src` | 화면 내부 동작 + 배포 설정 1줄 |
| T11 | CI 가 새 빌드 게이트를 견디게 한다 | 워크플로 Build 스텝 수정 |

**T10 을 먼저 하라.** 나머지 둘은 그 결과와 무관하게 언제든 할 수 있지만, T10 이 실패하면 §5 의 함정이
현실이 된 것이고 그때는 T9·T11 보다 그쪽이 급하다.

T10 요약(상세는 계획서 Task 10):

```bash
# ① WSL 에서 백엔드 기동
cd /mnt/c/programming/sesac-third-project/branchs/backend_jy/backend
uv sync --extra dev && uv run alembic upgrade head
uv run uvicorn app.main:app --port 8000
#    확인: curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8000/api/v1/health  → 200

# ② dev 서버는 반드시 localhost 로 (127.0.0.1 은 CORS 에 막힌다 — §5-③)
cd frontend && npm run dev
```

그다음 **브라우저에서** 가입 → 로그인 → 세션 유지를 확인하고, **DevTools 로 요청에 쿠키가 실제로 실리는지**
본다. 결과는 [`backend-integration.md`](backend-integration.md) 에 실측으로 기록한다.

### 4.2 화면 5개 (계획 ②~⑥)

이 계획은 전체 연동을 6개로 쪼갠 것 중 **첫 번째**다. 나머지는 아직 계획서가 없다 —
각각 쓸 때 계획서 머리말의 표를 본다.

| # | 범위 | 선행 |
|---|---|---|
| ② | S1 온보딩 + S2 대시보드 실데이터 전환 | 이 계획 |
| ③ | S4 예산·납부 (**영수증 OCR multipart** 포함 — `apiFetchMultipart` 가 이미 있다) | ② |
| ④ | S6 예산 재배분 | ③ |
| ⑤ | S3 AI 상담 (**SSE**) | — · [`chat-streaming.md`](chat-streaming.md) 를 먼저 읽는다 |
| ⑥ | S5 리포트 실데이터 전환 | ② |

---

## 5. 🚨 로컬에서는 절대 드러나지 않는 것

**여기 적힌 넷은 로컬에서 전부 초록불이고 배포에서만 죽는다.** 근거·인용은
[`backend-integration.md`](backend-integration.md) §5 와 [`backend-analysis/05-auth-cors-deploy.md`](../backend-analysis/05-auth-cors-deploy.md).

### ① 쿠키 `SameSite` — 로컬은 same-site 라 문제가 안 생긴다

프론트(`localhost:5173`)와 백엔드(`localhost:8000`)는 **포트만 다르므로 same-site** 다(포트는 site 정의 밖).
그래서 **로컬에서는 `SameSite` 문제가 발생하지 않는다.** 배포하면 프론트(SWA)와 백엔드(`*.nip.io`)가
**cross-site** 가 되어, `SameSite=Lax` 쿠키는 `fetch()` 서브리퀘스트에서 **제외**된다.

증상이 고약하다 — **소셜 로그인의 쿠키 *설정* 은 성공한다**(top-level 네비게이션이라 Lax 가 허용).
그래서 「로그인은 됐는데 그다음부터 전부 401」 이라는 가장 헷갈리는 형태로 나타난다.
**`credentials:"include"` 를 넣어도, 프리플라이트가 200 으로 다 통과해도 소용없다.**

> 백엔드는 2026-08-25 에 `samesite="none"` 으로 고쳐 두었다(발급·삭제 양쪽). **배포본에 반영됐는지는
> 별개다** — §5-④ 를 보라.

### ② 지원 브라우저가 「로그인이 되나」의 문제가 됐다

인증이 크로스 사이트 쿠키에 의존하므로 지원 범위는 CSS 문제가 아니라 **로그인 가능 여부**다.
그래서 **Chromium(Chrome · Edge) 전용**으로 확정했다(ADR 0007 §D3). Safari 는 ITP 가 서드파티 쿠키를
전면 차단하고, Firefox 는 사이트별 쿠키 저장소를 분리한다.

🚨 **대신 조용히 실패시키지 않을 의무가 생겼다.** 감지는 **UA 가 아니라 행동으로** 한다 —
로그인 200 직후 `/auth/me` 가 401 이면 쿠키가 왕복하지 못한 것이다. UA 로는 **Chrome 시크릿 모드와
Edge Strict** 를 못 잡는다. (이것이 남은 **T9** 다.)

### ③ dev 서버는 반드시 `localhost` 로 띄운다

백엔드 CORS 허용 오리진이 **`http://localhost:5173` 정확히 하나**다. `127.0.0.1` 로 띄우면 차단된다.
⚠️ `vite preview` 는 **반대**로 기본이 IPv6 전용이라 `--host 127.0.0.1` 이 필요하다. 헷갈리기 쉽다.

### ④ 배포본이 소스보다 뒤처져 있다 — 「코드에 있다」와 「호출된다」는 다르다

백엔드 이미지가 `:latest` 태그 고정 + `imagePullPolicy: Always` 라 **파드가 재시작될 때만** 갱신된다.
2026-08-24 실측 기준 배포본이 `origin/backend` 보다 **37커밋** 뒤였고, 프론트 계약에 닿는 **배포 갭이 10건**이었다.

**그래서 새 엔드포인트를 붙일 때는 「안 와도 동작하게」 짠다.** 재실측 명령과 갭 전수는
[`backend-analysis/08-cluster-runtime.md`](../backend-analysis/08-cluster-runtime.md) §3.

🚨 **production 호스트에 붙지 마라.** 도메인만 다른 게 아니라 **인증 도입 이전 구버전**이 떠 있어
`/auth/*` 가 전부 404 다. **헬스체크만 200 이라 살아 있어 보인다.** 붙을 수 있는 곳은 staging 하나뿐이다.

---

## 6. 작업 규칙

| 항목 | 내용 |
|---|---|
| **검증** | **4게이트** — `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`. **git 훅이 없어 자동으로 도는 것은 하나도 없다.** 커밋 전 사람이 돌린다 |
| lint | `oxlint --deny-warnings` — 경고 하나도 실패. **진단이 0이면 아무것도 출력하지 않는다.** 돌았는지 보려면 `npm run lint -- --format=github` |
| **커밋 경로** | **`frontend/` 밖을 커밋하지 않는다.** CI 의 path-guard 가 `^(frontend/\|docs/\|\.github/)` 밖을 exit 1 로 막는다. **`git add .` · `commit -a` 금지 — 명시 경로로만** |
| **번들 예산** | 초기 청크 gzip **96,000** / JS 합계 gzip **112,000**. **합계 여유가 얼마 없다** — 새 화면은 반드시 lazy 로. 초기 청크가 움직였다면 lazy 여야 할 것이 정적으로 샌 것이다 |
| 디자인 값 | **발명하지 않는다.** 빌드 게이트가 산출 CSS 를 파서로 검사해 팔레트 밖 색·토큰 밖 라운드면 exit 1. 그림자는 폐기(`shadow-*`·`ring-*` 금지), 링은 `outline-*`. 새 값이 필요하면 [`design/decisions.md`](../design/decisions.md) 를 먼저 고친다 |
| Tailwind | 🚨 **클래스명을 런타임에 조립하지 않는다.** `` `btn--${v}` `` 는 스캐너가 못 찾아 유틸리티가 안 생긴다 — **빌드는 성공하고 화면만 깨진다.** 변이는 정적 룩업 `Record` 로만. 반대로 **주석·문서의 단어도 스캐너가 읽어 실제 유틸리티를 만든다** |
| FSD | `app → pages → features → entities → shared` 하향만. **`entities` 는 다른 entity 슬라이스를 import 할 수 없다.** 슬라이스 밖에서는 루트 `index.ts` 로만 |
| **push · PR** | **push 는 사용자가 통제한다.** PR base 는 **`frontend`** 다 — **`main` 은 건드리지 않는다** |
| 앱 루트 | `frontend/`. 저장소 루트에서 npm 명령을 치면 전부 실패한다 |

---

## 7. 이 구현에서 내린 결정과 그 이유

코드를 읽다가 「왜 이렇게 돼 있지?」 싶을 때 보는 절이다. 전부 **실측으로 확정**했다.

### ① `VITE_API_BASE` 게이트가 `mode` 가 아니라 `CI` 로 판정한다

`vite build` 는 **기본 mode 가 production** 이다(Vite 공식: *"the `build` command runs in `production` mode"*).
그래서 「production 이면 루프백 금지」로 짜면 **개발자가 로컬에서 4게이트를 돌릴 때마다** 로컬 `.env` 값
때문에 빌드가 죽는다. 게이트가 막아야 하는 것은 **배포될 산출물**이지 로컬 검증 빌드가 아니고,
이 저장소에서 배포는 CI 에서만 일어난다.

`DEPLOY_BUILD=1` 같은 전용 플래그를 **쓰지 않은 이유**: 워크플로가 켜는 것을 잊으면 게이트가 **조용히
사라진다.** `CI` 는 GitHub Actions 가 항상 넣으므로(공식: CI — *"Always set to true."*) fail-closed 다.

### ② `apiBase` 는 상수가 아니라 **함수**다

모듈 최상위에서 검증해 `throw` 하면 두 가지가 깨진다 — ① **CI 의 Test 스텝에는 환경변수가 주입되지
않아** 네트워크를 쓰지도 않는 테스트까지 전멸하고 ② **`ErrorBoundary` 는 모듈 평가 단계의 에러를 잡지
못해** 흰 화면이 된다. 그래서 첫 호출 때 검증하고 **성공한 값만** 캐시한다.

같은 이유로 **`apiBase()` 호출은 `fetch` 의 `try` 밖에 있다.** 안에 두면 설정 오류(`API_BASE_INVALID`)가
`NETWORK_ERROR` 로 재포장돼 **「네트워크를 확인하라」는 오진**이 나간다. 빌드 게이트는 `apply: "build"` 라
`npm run dev` 에서 돌지 않으므로, 이건 이론이 아니라 실제로 지나는 경로다.

### ③ 인증 판정은 `beforeLoad` 에 있는데, 조회는 캐시를 거친다

TanStack Router 내부 문서(`packages/router-core/INTERNALS.md`)가 명시한다 —
*"The beforeLoad context is not a cache. … A subsequent navigation rebuilds merged context from the
parent and reruns beforeLoad, even when reusing completed loader data."*

즉 가드에서 `getMe()` 를 그냥 부르면 **탭을 옮길 때마다 서버 왕복**이 붙는다. 그렇다고 `loader` 로
옮길 수도 없다 — **리다이렉트 판정은 자식 로더가 돌기 전에 끝나야** 하기 때문이다.
그래서 **조회 쪽에 TTL 캐시**(`loadSession()`)를 두고 가드는 그것을 읽는다.

### ④ 세션 무효화가 `auth.ts` 가 아니라 **화면**에 있다

`session-cache.ts` 가 `auth.ts` 를 import 하므로(`getMe` 를 쓴다), 반대 방향 import 는 **정의상 순환**이다
— oxlint `import/no-cycle` 이 막는다. 그래서 무효화 호출을 화면으로 올렸다.
**대가는 「부르는 것을 잊으면 조용히 낡은다」** 이므로, 로그인·가입·로그아웃을 새로 만들 때마다
`invalidateSession()` 을 함께 넣어야 한다.

### ⑤ 401 은 전역 인터셉터가 아니라 **구독**으로 알린다

`shared` 는 `entities` 를 import 할 수 없다(FSD 하향 규칙, oxlint 강제). 그래서 `shared/api` 는
「누군가 듣는다」만 알고(`onUnauthorized`), 실제 배선은 **조립 레이어(`app`)** 가 한다.
구독자 호출은 **개별 격리**돼 있다 — 한 구독자가 던져도 나머지 구독자와 원본 `UNAUTHORIZED` 에러가
살아남아야 하기 때문이다.

### ⑥ 가드는 **2층**이다 (`_authed` → `_shell`)

한 층에서 「세션 없으면 `/login`, 웨딩 없으면 `/onboarding`」을 함께 처리하면 **`/onboarding` 자신이 그
가드 아래** 있으므로 **무한 리다이렉트**가 된다.

같은 이유로 **`/login` 에는 세션 가드를 두지 않는다** — `POST /auth/signup` 이 **201과 함께 이미 쿠키를
발급**하므로, 가드를 두면 **가입 직후 로그인 폼에 도달할 수 없다**(요구된 진입 플로우가 깨진다).

---

## 8. 이 문서의 갱신

**트리거**: ① §2 의 상태가 바뀔 때 ② §4 의 남은 일이 줄어들 때 ③ §5 에 새 함정이 추가될 때
④ §7 의 결정이 뒤집힐 때.

**§5 와 §7 은 지우지 말고 쌓는다.** 결정이 뒤집히면 「뒤집혔다」고 적고 이유를 남긴다 —
지우면 다음 사람이 같은 길을 다시 간다.
