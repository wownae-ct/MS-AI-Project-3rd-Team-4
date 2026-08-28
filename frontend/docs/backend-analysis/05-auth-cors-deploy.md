# 05 · 인증 · CORS · 환경 · 배포

> 코드 기준 `backend` **`6c29ea0`** (2026-08-24 3차 재분석). **2026-08-24 v4.0 에서 인증이 재도입**됐다(v3.0 은 무인증 MVP).
> 🆕 **3차 재분석 (`e3496e7` → `6c29ea0`, PR #57 4커밋).** 이 문서의 내용은 **바뀌지 않았다** — 바뀐 파일이 `app/personalization/prompts.py` 와 그 테스트뿐이라 라우터·스키마·모델·마이그레이션 diff 가 **0** 이다(실측). 수치도 재측정에서 동일하다(엔드포인트 **35**·OpenAPI 노출 **33** · 마이그레이션 **13** · 스키마 **15**파일 · 모델 **10**개 · 카테고리 **9**). 무엇이 바뀌었는지는 [`04` §5.6-c](04-ai-chat-rag.md).
> ⚠️ **`6c29ea0` 는 「코드」기준이지 배포본이 아니다.** 배포본(staging)은 **`b4615af`** 로 이보다 **한참 이전**이고 `origin/backend` 대비 **37커밋 뒤**다 — [`08` §1](08-cluster-runtime.md). 「코드에 있다」와 「호출된다」를 따로 센다.
> 🚨 **§3 에 프론트 로그인을 통째로 막는 결함이 있다.** 계약을 옮기기 전에 그 절부터 읽을 것.
> 🔍 **4차 점검(2026-08-25)** — 코드 6c29ea0 대비 팩트체크. 수정 4건 / 미검증 6건. 상세는 README 「4차 점검 이력」.

## 0. 먼저 정정 두 가지

- **`app/core/auth.py` 는 앱 인증과 무관하다** — Azure `DefaultAzureCredential` 캐싱 싱글턴이다.
  앱 인증 로직은 `app/services/auth.py` · `app/deps.py` · `app/routers/auth.py` 셋에 있다.
- **`backend/.env.example` 은 4차 점검(2026-08-25)에서 읽었다**(이전 라운드는 `secret-file-guard` 훅에 막혀 못 읽었다).
  `core/config.py:1-2` 가 *"다른 모든 모듈이 값이 필요하면 여기 Settings를 통해서만 읽는다"* 라고
  못박고 있어 **`config.py` 의 `Settings` 가 환경변수 정본**이다. §5 는 그것으로 작성했다.
  🆕 대조 결과 `backend/.env.example` 도 정본과 어긋난다 — **`RAG_TSVECTOR_TOP_K=8`**(`.env.example:52`) vs 기본값 **4**(`config.py:29`),
  그리고 `frontend/.env.example` 과 **똑같은 4개 누락**(`AZURE_OPENAI_CHAT_DEPLOYMENT`·`RAG_CORPUS_PATH`·`SESSION_COOKIE_NAME`·`SESSION_TTL_DAYS`, §5-a).
  두 템플릿이 같은 원본에서 복사된 것이라 **한쪽만 고치면 다시 갈린다** — 고칠 때 둘 다 같이 고칠 것.

---

## 1. 세션 쿠키 계약

발급 지점은 `app/routers/auth.py:49-58` **하나뿐**이다(signup · login · oauth callback 셋이 공유).

| 속성 | 값 | 근거 |
|---|---|---|
| 이름 | **`wr_session`** | `core/config.py:41` (`SESSION_COOKIE_NAME` 으로 덮어쓰기 가능) |
| 값 형태 | **불투명(opaque) 랜덤 토큰 — JWT 아님** | `core/security.py:30-32` · `secrets.token_urlsafe(32)` ≈ 43자 |
| HttpOnly | **true** → **JS 에서 읽을 수 없다** | `routers/auth.py:54` |
| Secure | **true** | `:55` |
| SameSite | 🚨 **`lax`** → §3 | `:56` |
| Domain | **미지정 → host-only**(백엔드 호스트에만 귀속) | `:51-58` 에 `domain=` 없음 |
| Path | **`/`** (Starlette 기본값) | — |
| Max-Age | **2,592,000초 = 30일** | `:57` · `SESSION_TTL_DAYS=30` |

> ⚠️ **줄번호 정정 (2026-08-24 재검증).** 이 표는 원래 `:53`/`:54`/`:55` 를 가리켰는데 **전부 1씩 밀려 있었다**
> (`auth.py` 는 `df4a8ff` 이후 무변경이므로 처음부터 틀린 값이었다). 위가 `6c29ea0` 실측값이다(`auth.py` 는 `df4a8ff` 이후 계속 무변경) —
> **백엔드에 보낼 수정 요청이 이 줄번호를 인용하므로** 그대로 쓰면 엉뚱한 줄을 가리킨다.

**서버 저장 방식** — 쿠키의 원문 토큰은 DB 에 **없다**. `auth_sessions.session_token_hash` 에
**SHA-256 해시만** 저장한다(`core/security.py:35-39`). 비밀번호는 별도로 **argon2**.

**유효성 판정** — `revoked_at IS NULL AND expires_at > now()` (`services/auth.py:87-96`).

### 🔑 갱신(rotation) 정책이 없다 — 프론트가 대비해야 한다

- 로그인·가입·소셜 콜백마다 `auth_sessions` 에 **새 행을 추가**할 뿐 기존 세션을 폐기하지 않는다. 누적된다.
- **슬라이딩 만료 없음.** `expires_at` 은 발급 시점 +30일 **절대값**이고 갱신 코드가 없다.
- refresh 토큰 개념 자체가 없다.

→ **30일째에 사용 중이라도 그냥 튕긴다.** 프론트는 **아무 API 에서나 401 이 올 수 있다고 가정**하고
**전역 인터셉터로 `/login` 이동**을 처리해야 한다(`deps.py:20-21` 주석이 그렇게 지시한다).

---

## 2. 로그인 플로우

### 2.1 OAuth 제공자 — **구글 · 네이버 2개뿐** (실측 확인)

`core/oauth_providers.py:17` — `SUPPORTED_PROVIDERS = ("GOOGLE", "NAVER")`.
DB CHECK 에는 `GOOGLE/KAKAO/NAVER/APPLE` 이 있지만 **구현은 2개**다.

**배포본 실측 (2026-08-24)**:

| 경로 | 결과 |
|---|---|
| `GET /api/v1/auth/google/login` | **307** ✅ |
| `GET /api/v1/auth/naver/login` | **307** ✅ |
| `GET /api/v1/auth/kakao/login` | **404** (코드와 일치) |

| | 구글 | 네이버 |
|---|---|---|
| authorize | `accounts.google.com/o/oauth2/v2/auth` | `nid.naver.com/oauth2.0/authorize` |
| scope | `openid email profile` | **없음**(네이버 개발자센터 설정으로 결정) |
| PKCE(S256) | **지원** | **미지원** |

### 2.2 A · 자체 이메일/비밀번호 — 프론트 구현 순서

1. `POST {API}/api/v1/auth/signup` — `{email, password(≥8), display_name}` → **201** + `Set-Cookie`
2. `POST {API}/api/v1/auth/login` — `{email, password}` → **200** + `Set-Cookie`
3. 두 응답 모두 바디는 **`AuthUserOut`** = `{id: uuid, email: string, display_name: string|null, has_wedding: boolean}`
4. **`has_wedding` 으로 분기** — `false` → 온보딩(S1), `true` → 홈
   ⚠️ **signup 응답은 항상 `false` 하드코딩**(`routers/auth.py:81`). 신뢰할 값은 `login`·`me` 뿐.

### 2.3 B · 소셜 로그인 — 프론트 구현 순서

1. 🚨 **`fetch` 금지.** 브라우저를 통째로 이동시킨다:
   ```js
   window.location.href = `${API}/api/v1/auth/google/login`   // 또는 /auth/naver/login
   ```
   → 307 리다이렉트 + 쿠키 설정이라 XHR 로는 성립하지 않는다.
2. 백엔드가 `wr_oauth_state` 쿠키(**Max-Age 600초**)에 `{state, code_verifier}` 를 담고 IdP 로 307.
   → **왕복이 10분을 넘기면 실패한다.**
3. IdP 동의 → **`{OAUTH_BACKEND_BASE_URL}/api/v1/auth/{provider}/callback`** 으로 복귀.
   이 값은 `core/oauth_providers.py:71-75` 한 곳에서 조립되며 **IdP 콘솔 등록값과 문자 그대로 일치해야 한다.**
4. 백엔드가 state 검증 → 토큰 교환 → 프로필 조회 → 계정 조회/생성 → 세션 발급.
5. **성공**: `Set-Cookie: wr_session` + **`FRONTEND_BASE_URL` 루트(`/`)로 리다이렉트**.
   ⚠️ **콜백이 토큰이나 사용자 정보를 쿼리로 넘겨주지 않는다.**
   → 프론트는 **`/` 진입 시 `GET /api/v1/auth/me` 를 호출해** 로그인 여부·`has_wedding` 을 확인해야 한다.
6. **실패**: `{FRONTEND_BASE_URL}/login?oauth_error=<코드>` → [01-endpoints §3](01-endpoints.md#3-auth--6개-prefixauth) 의 값 표.

### 2.4 소셜 계정 연동 규칙 (`services/oauth.py:112-156`)

1. `(auth_provider, auth_provider_id)` 로 찾으면 → 그 계정 로그인
2. 없으면 email 로 찾는다:
   - 기존 계정에 `auth_provider` 가 **이미 있으면** → **409 `SOCIAL_ACCOUNT_ALREADY_LINKED`**
   - `auth_provider` 가 **NULL(= 자체 이메일 가입)이면 → 조용히 연동한다**(`:136-137`)
3. 둘 다 없으면 신규 생성

> ⚠️ **코드와 독스트링이 어긋난다.** `services/oauth.py:5-11` 독스트링은 *"있으면(자체 로그인 계정이든
> 다른 소셜 계정이든) … 409 로 거부한다"* 라고 적었지만 실제 코드(`:130`)는 자체 로그인 계정이면
> **거부하지 않고 연동한다.** 프론트는 **코드 쪽 동작**을 기준으로 삼되, 백엔드 담당자 확인이 필요하다.

---

## 3. 🚨 CORS 와 `SameSite` — 여기가 차단 지점

### 3.1 CORS 설정 (`app/main.py:40-63`)

```
allow_origins      = ["http://localhost:5173"]          # 정확히 하나
allow_origin_regex = r"^https://polite-island-0bb189700(-[a-zA-Z0-9]+)?\.7\.azurestaticapps\.net$"
allow_credentials  = True
allow_methods      = ["*"]
allow_headers      = ["*"]
```

- **`http://127.0.0.1:5173` 은 차단된다** — dev 서버를 반드시 `localhost` 로 띄울 것.
  (⚠️ `vite preview` 의 IPv6 함정과 **반대 방향**이다 — 프론트 `CLAUDE.md` §5.4 vs §5.11)
- 인그레스에는 CORS 어노테이션이 **하나도 없다**(실측: `infra/` 전체 매치 0건). 전적으로 FastAPI 미들웨어 소관.

### 3.2 배포본 프리플라이트 실측 — **CORS 자체는 문제없다**

```
HTTP/1.1 200 OK
access-control-allow-origin: https://polite-island-0bb189700.7.azurestaticapps.net
access-control-allow-credentials: true
access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
access-control-allow-headers: content-type
access-control-max-age: 600
```

MDN CORS 는 credentials 요청에 `Access-Control-Allow-Origin: *` 를 금지하고
(*"The server must not specify the `*` wildcard for the `Access-Control-Allow-Origin` response-header
value, but must instead specify an explicit origin"*), `Allow-Methods`·`Allow-Headers` 도 마찬가지다.
백엔드 설정은 `["*"]` 지만 실제 응답에 `*` 가 나가지 않으므로 규칙 위반이 아니다. ✅
🔍 **정확한 메커니즘(Starlette 1.6.0 `middleware/cors.py` 실측, 4차 점검)** — credentials 여부와 **무관하게**
`allow_methods=["*"]` 는 생성자에서 항상 `ALL_METHODS` 7개 목록으로 치환되고(`:28-29`), `allow_headers=["*"]` 는
프리플라이트에서 요청의 `Access-Control-Request-Headers` 값을 **그대로 되돌려준다**(`:129-130` — 위 실측의
`content-type` 이 그것). credentials 가 좌우하는 것은 **origin 한 가지**뿐이다 — `allow_credentials=True` 면
`*` 대신 요청 Origin 을 그대로 써서 내려준다(`preflight_explicit_allow_origin`, `:37`·`:117-120`·`:166-168`).
따라서 `["*"]` 설정 자체가 위험한 게 아니라, **`allow_origins=["*"]` + `allow_credentials=True` 조합**만
피하면 된다(그 경우도 Starlette 는 Origin 을 echo 해 준다 — 즉 모든 오리진에 쿠키 포함 요청을 허용하는 셈이 되므로 금지).
출처: MDN CORS 「Credentialed requests and wildcards」 <https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS>.

### 3.3 그런데 `credentials: "include"` 만으로는 안 된다 — **`SameSite=Lax` 결함**

> 🆕 **이 절은 「프론트와 백엔드가 cross-site 일 때」의 이야기다 (2026-08-25 범위 명시).**
> 연동 대상이 **로컬**(`localhost:5173` ↔ `localhost:8000`)로 바뀌면 **same-site 가 되어 이 결함이
> 발생하지 않는다** — 포트는 site 정의에 들어가지 않는다(MDN Glossary·Site, `https://example.com:8080` 과 `https://example.com` 은 same-site).
> 단 `SameSite` 쿠키 판정은 **scheme 까지 보는 schemeful same-site** 라 `http://localhost:5173` ↔ `https://localhost:8000` 처럼
> 스킴이 갈리면 cross-site 가 된다(로컬은 둘 다 `http` 라 무관) — <https://developer.mozilla.org/en-US/docs/Glossary/Site>. 근거·판정은
> [`09` §3](09-local-runtime.md). 🚨 **단 배포하면 그대로 되살아나므로 이 절은 유효하다** —
> 백엔드 수정 요청도 취하하지 않는다.

**배포본이 실제로 내려주는 쿠키**(실측, `GET /api/v1/auth/google/login`):

```
set-cookie: wr_oauth_state="..."; HttpOnly; Max-Age=600; Path=/; SameSite=lax; Secure
```

**MDN `Set-Cookie` 원문** — `SameSite=Lax`:

> Send the cookie only for requests originating from the same site that set the cookie, and for
> cross-site requests that meet both of the following criteria:
> - The request is a top-level navigation … **This would exclude, for example, requests made using
>   the `fetch()` API** …
> - The request uses a safe method: in particular, this excludes `POST`, `PUT`, and `DELETE`.

프론트 오리진과 백엔드 오리진(`20-249-52-148.nip.io`)은 **등록 도메인이 달라 cross-site** 다.

**예상 증상**(브라우저 실측 필요):

| 단계 | 결과 |
|---|---|
| 소셜 로그인 → 콜백 | ✅ top-level 네비게이션이라 **쿠키 설정까지는 성공** |
| 직후 SPA 의 `GET /auth/me` | ❌ **쿠키 없이 나가 401** |
| `POST /auth/login` 의 `Set-Cookie` | ⚠️ cross-site 응답이라 저장·전송 모두 불안정 |
| `POST /auth/logout` | ❌ 쿠키가 안 실려 **서버 세션이 30일간 살아남는다** |

**필요한 수정 — 백엔드 1줄**: **`routers/auth.py:56`** `samesite="lax"` → `"none"`.
MDN: *"The `Secure` attribute must also be set when using this value."* — 이미 `secure=True` 라 충족
(<https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie>, 2026-08-25 재확인).
(`wr_oauth_state` 는 IdP→백엔드 top-level 네비게이션이라 Lax 로도 동작한다.)

> 🆕 **1줄이 아니라 2곳이다 (2026-08-24 재실측에서 발견).** 로그아웃은
> `response.delete_cookie(key=settings.session_cookie_name)` 를 **인자 없이** 부른다
> (**`routers/auth.py:121`**). Starlette 기본값이 `secure=False`, `samesite="lax"` 라 배포본이
> 실제로 이렇게 내려준다 — 쿠키 없이 `POST /api/v1/auth/logout` 을 쳐서 확인했다(DB 를 안 건드린다):
>
> ```
> HTTP/1.1 204 No Content
> set-cookie: wr_session=""; expires=…; Max-Age=0; Path=/; SameSite=lax
> ```
>
> **`Secure` 가 없다.** 세션 쿠키를 `SameSite=None; Secure` 로 바꾸면 삭제 쿠키만 속성이 어긋난다.
> 같은 커밋에서 `delete_cookie(key=..., secure=True, samesite="none")` 로 맞출 것.
>
> 부수적으로 이 응답이 **쿠키 이름 `wr_session` 을 배포본에서 직접 확인해 준다** — 그동안 소스
> 근거뿐이었고 실측은 로그인이 필요해 미뤄 뒀던 항목이다(README §6-1).

#### 🚨 3.3-a `samesite="none"` 으로 고쳐도 **Chromium 에서만** 풀린다 (2026-08-24 팩트체크)

⚠️ **이 문서가 「백엔드 1줄이면 해결된다」고만 적어 온 것은 절반만 맞았다.** 크로스 사이트 쿠키는
곧 **서드파티 쿠키**다. `SameSite=None; Secure` 는 *"보낼 자격"* 을 주는 속성이지 *"브라우저가
받아 준다"* 는 보장이 아니다 — 엔진마다 기본 정책이 다르다.

| 엔진 | 서드파티 쿠키 기본 정책 | `samesite="none"` 수정 후 |
|---|---|---|
| **Chromium**(Chrome·Edge) | **기본 차단하지 않는다** — 시크릿 모드이거나 사용자가 직접 차단 설정한 경우만 | ✅ **동작한다** |
| **Safari**(ITP) | **전부 차단** | ❌ **여전히 안 된다** |
| **Firefox**(Total Cookie Protection) | **사이트별 분리 쿠키 저장소**로 분할 | ⚠️ **안 보일 가능성이 높다**(아래) |

> *"Google Chrome doesn't block third-party cookies by default, only in Incognito mode, or when
> users explicitly set it to block third-party cookies via `chrome://settings`."*
> *"Firefox enables Total Cookie Protection … This gives third-party cookies a **separate cookie
> jar per site**, preventing cross-site tracking."*
> — MDN, [Third-party cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies) (2026-08-24 확인)

> *"**ITP by default blocks all third-party cookies. There are no exceptions to this blocking.**"*
> *"Third-party cookie access can only be granted through the Storage Access API and the temporary
> compatibility fix for popups."*
> — WebKit, [Tracking Prevention](https://webkit.org/tracking-prevention/) (2026-08-24 확인)

**Firefox 가 특히 헷갈리는 이유** — 우리 플로우는 소셜 로그인 때 **top-level 네비게이션으로 백엔드에
직접 방문**해 쿠키를 심는다. 그 순간 백엔드는 **first-party** 다. 그런데 그 뒤 SPA 의 `fetch` 는
백엔드를 **third-party** 로 만든다. TCP 는 이 둘을 **다른 저장소**로 본다:

> *"**Unpartitioned cookies** are those where all cookies set on the same site are stored in the same
> cookie jar … browsers commonly block sending unpartitioned third-party cookies in requests."*
> *"Access requests are automatically denied if the browser detects that the user hasn't interacted
> with the embedded content in a first-party context recently."*
> — MDN, [Storage Access API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_Access_API)

즉 **「로그인은 됐는데 그다음부터 전부 401」이라는 §5.12 의 증상이, `samesite` 를 고친 뒤에도
Safari·Firefox 에서는 그대로 남을 수 있다.**

**그래서 결론은 이렇게 정리된다:**

1. **요청 ①(`samesite="none"`)은 여전히 필요하고 정확하다** — 그게 없으면 **Chromium 에서도** 안 된다.
2. 다만 **「이걸로 전부 풀린다」가 아니라 「Chromium 에서 풀린다」** 다. 백엔드에 보내는 문안도
   그렇게 적어야 한다([`BACKEND_REQUEST.md`](BACKEND_REQUEST.md) §1 에 반영).
3. **당장은 이걸로 충분하다** — 현재 빌드 타깃이 `build.target: chrome111`(Chromium 전용)이다.
4. **Safari·Firefox 지원은 백엔드 1줄로 해결되는 문제가 아니라 아키텍처 문제다.** 같은 site 로
   만들거나(등록 도메인 공유 / 경로 프록시) Storage Access API 를 써야 한다. 그런데 **SWA Free 는
   `/api/*` 프록시가 안 되고 Linked Backend 는 AKS 를 지원하지 않는다**(README §5) — 선택지가 좁다.

🚨 **이 때문에 `CLAUDE.md` §6-C(지원 브라우저 범위)의 성격이 바뀌었다.** 지금까지는 「Safari 를 빼면
어떤 CSS 기능을 못 쓰나」 수준의 열린 결정이었는데, 실제로는 **「Safari 에서 로그인이 되느냐」**
문제다. 아이폰 사용자가 대상에 들어간다면 **지금 결정해야 한다** — 화면을 다 만든 뒤에 뒤집으면
전송 계층과 배포 토폴로지를 함께 바꿔야 한다.

### 3.4 프론트가 착각하기 쉬운 지점

`tests/conftest.py:33-36` 이 *"쿠키가 Secure 라 http 면 httpx 가 쿠키를 안 보낸다"* 고 적어 뒀는데,
이건 **테스트 클라이언트 얘기지 브라우저 얘기가 아니다.** 브라우저에서 `Secure` 는 **요청 대상**이
HTTPS 인지만 본다 — 프론트 페이지가 `http://localhost:5173` 이어도 백엔드가 `https://` 면 문제없다.
**진짜 막는 건 `Secure` 가 아니라 `SameSite=Lax` 다.**

---

## 4. 로그아웃 · 세션 확인

| 메서드 | 경로 | 인증 | 응답 |
|---|---|---|---|
| `POST` | `/api/v1/auth/logout` | 불필요 | **204 무바디** |
| `GET` | `/api/v1/auth/me` | 필요 | 200 `AuthUserOut` / **401** |

- **logout 은 idempotent** — 쿠키가 없거나 이미 폐기됐어도 204. 프론트는 실패 처리 불필요.
- logout 은 **현재 토큰 하나만** 폐기한다. 다른 기기 세션은 살아 있다.
- **없는 것**: 전체 로그아웃 · 세션 목록 · 비밀번호 변경 · 회원탈퇴. `auth` 는 위 4개 + OAuth 2개 = **6개가 전부**.

---

## 5. 환경변수 전수 (`app/core/config.py:10-67`)

`pydantic-settings` · `env_prefix` 없음 · alias 없음 · 대소문자 무시 → **필드명 대문자 = 환경변수 이름**.

| 환경변수 | 기본값 | 필수 | 프론트 관련 |
|---|---|---|---|
| `DATABASE_URL` | — | ✅ | |
| `DATABASE_AUTH_MODE` | `password` | | |
| `AZURE_OPENAI_ENDPOINT` | — | ✅ | |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | `chat-mini` | | |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | `embedding` | | |
| `AZURE_OPENAI_API_VERSION` | `2024-10-21` | | |
| `RAG_VECTOR_TOP_K` / `RAG_TSVECTOR_TOP_K` / `RAG_CONTEXT_TOP_K` / `RAG_RRF_K` | `8` / `4` / `5` / `60` | | |
| `RAG_CORPUS_PATH` | `data/rag_corpus` | | |
| **`SESSION_COOKIE_NAME`** | **`wr_session`** | | ⭐ 쿠키 이름 |
| **`SESSION_TTL_DAYS`** | **`30`** | | ⭐ Max-Age |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | ✅ | |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | — | ✅ | |
| **`OAUTH_BACKEND_BASE_URL`** | `http://localhost:8000` | | ⭐ OAuth 콜백 조립 기준 |
| **`FRONTEND_BASE_URL`** | `http://localhost:5173` | | ⭐⭐ **백엔드가 프론트 URL 을 안다** |
| `LANGFUSE_*` (5개) | 비활성 | | 프론트 무관 |

**필수 6개**(기본값 없음): `DATABASE_URL` · `AZURE_OPENAI_ENDPOINT` · `GOOGLE_CLIENT_ID/SECRET` ·
`NAVER_CLIENT_ID/SECRET`(`config.py:11,16,47-50`). 하나라도 없으면 **파드가 부팅 자체를 실패한다**
(CI 는 `.github/workflows/backend-ci.yml:77-84` 에서 6개 전부에 더미값을 준다).

> ⚠️ **로컬 함정(4차 점검, 미커밋 상태)** — `backend/.env.example` 의 `OAUTH_BACKEND_BASE_URL` 이 워킹트리에서
> `http://localhost:8001` 로 바뀌어 있다(HEAD 는 `8000`, `config.py:54` 기본값도 `8000`). 이 값은 IdP 콘솔의
> redirect_uri 와 **문자 그대로** 일치해야 하므로(§2.3-3), uvicorn 을 8000 으로 띄우면서 템플릿을 그대로 복사하면
> 소셜 로그인 콜백이 `redirect_uri_mismatch` 로 실패한다. 기준선이 아니므로 표에는 반영하지 않았다.

> 🆕 **위 표는 `config.py` 의 「기본값」이다. 실제 주입값은 클러스터에서 실측했다** →
> [`08` §5](08-cluster-runtime.md). 프론트에 걸리는 결론 3가지:
>
> - ✅ **`SESSION_COOKIE_NAME`·`SESSION_TTL_DAYS` 는 주입돼 있지 않다** → 기본값 **`wr_session` / 30일**이
>   배포본에서 그대로 유효하다. 위 표의 "⭐ 덮어쓰기 가능" 은 **실제로는 안 덮여 있다.**
> - ✅ **`CORS_ORIGINS` 계열 환경변수가 없다** → §3.1 의 `main.py` 하드코딩이 배포본 정본이다.
> - 🚨 **production 네임스페이스에는 OAuth 변수가 하나도 없다**(env 4개뿐). production 백엔드로는
>   소셜 로그인이 성립하지 않는다 — 애초에 **인증 이전 구버전 이미지**가 떠 있다(`08` §2).

### 🆕 5-a. `frontend/.env.example` 과의 드리프트 (2026-08-24 대조)

`frontend/.env.example` 은 **프론트 전용이 아니라 프로젝트 공용 파일**이다 —
`toolchain.md` §6.3 이 그렇게 정해 뒀고(*"Azure/Key Vault/PostgreSQL/AKS/SWA/Log Analytics 절은
백엔드·인프라 소관"*), 실제로 위 백엔드 변수 + Azure 인프라 변수가 함께 들어 있다.
**의도된 구성이므로 프론트 변수만 남기자고 정리하지 않는다.**

위 표와 한 줄씩 대조한 결과 **누락 4개**가 있다(전부 기본값이 있어 동작은 하지만, 템플릿이
「존재를 알리는 유일한 창구」라 빠지면 아무도 모른다):

| 누락 변수 | 기본값 | 왜 넣어야 하나 |
|---|---|---|
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | `chat-mini` | **`..._EMBEDDING_DEPLOYMENT` 는 있는데 이것만 없다.** 비대칭이라 실수로 보인다 |
| `RAG_CORPUS_PATH` | `data/rag_corpus` | RAG 튜닝 4종은 있는데 경로만 빠졌다 |
| **`SESSION_COOKIE_NAME`** | **`wr_session`** | ⭐ 프론트가 알아야 하는 **인증 계약**. 03_API_spec 이 `session_id` 로 잘못 적어 혼선이 있었던 값이라 템플릿에 박아 두는 값어치가 크다 |
| **`SESSION_TTL_DAYS`** | **`30`** | ⭐ 슬라이딩 만료가 없어 **30일째 반드시 401** 이 난다(§1). 프론트 401 인터셉터의 근거값 |

그리고 **`VITE_API_BASE=` 에는 형식 제약 주석이 없다.** 이 값에 `http://` 를 넣어 브라우저에서만
조용히 죽은 사고가 이미 한 번 있었다(`CLAUDE.md` §5.11 · `toolchain.md` §6.2). 템플릿이 새 클론이
이 변수를 처음 만나는 자리이므로 **거기에 제약을 적는 것이 가장 효과가 크다**:

```dotenv
# 프론트가 읽는 유일한 변수(src/vite-env.d.ts). Vite 는 VITE_ 접두사만 클라이언트에 노출한다.
# ⚠️ 반드시 https:// + 끝 슬래시 없음. http:// 를 넣으면 인그레스가 308 을 내는데 그 응답에
#    Access-Control-Allow-Origin 이 없어 브라우저에서만 조용히 실패한다(curl 로는 안 잡힌다).
# ⚠️ 번들에 그대로 박히므로 비밀을 넣지 않는다(Vite 공식 경고).
# ⚠️ 붙을 수 있는 백엔드는 staging 하나뿐이다. production 호스트에는 인증 도입 이전 구버전이
#    떠 있어(/auth/* 가 404) 로그인부터 전멸한다 — 헬스체크만 200 이라 살아 있어 보인다.
#    staging: https://20-249-52-148.nip.io
VITE_API_BASE=
```

> 🚨 **위 블록은 2026-08-24 클러스터 실측으로 수정됐다** — 원래 `prod` 후보로
> `https://merrymap-production.koreacentral.cloudapp.azure.com` 를 나란히 적어 뒀는데,
> **그 호스트는 프론트가 붙을 수 없다.** 근거는 [`08` §2](08-cluster-runtime.md):
> production 은 커밋 `4e879fd`(2026-08-21, **인증 이전**) 이미지이고 `openapi.json` 경로가 18개뿐이며
> 경로 이름부터 다르다(`/timeline` vs `/timeline-items` 등). ArgoCD 가 **`main` 브랜치**를 추적하는데
> v4.0 이 아직 `main` 에 없다.

> ⚠️ **이 파일은 Claude 가 직접 수정할 수 없다.** `permissions.deny` 의 `Read(.env.*)` 가
> Read 도구·Bash `cat`/`sed`·Write/Edit 를 모두 막는다(공식: *"A `Read` deny rule also blocks the
> Edit and Write tools on the same path"*). **사람이 직접 반영해야 한다.**

> 🆕 **배포본 실측으로 확정 (2026-08-24).** 지금까지 근거는 저장소의 kustomization 파일뿐이었는데,
> **DB 를 건드리지 않고 실제 값을 뽑는 길**을 찾았다 — 콜백에 `error` 를 붙이면 `oauth_callback` 이
> IdP 교환·DB 접근 **이전에** 즉시 리다이렉트한다(`routers/auth.py:190-191`):
>
> ```
> $ curl -sD- -o/dev/null "https://20-249-52-148.nip.io/api/v1/auth/google/callback?error=denied"
> HTTP/1.1 307 Temporary Redirect
> location: https://polite-island-0bb189700.7.azurestaticapps.net/login?oauth_error=denied
> ```
>
> 네이버도 동일. **`FRONTEND_BASE_URL` = SWA 로 확정**이며, 동시에 **`/login` 라우트가 반드시
> 있어야 한다**는 것과 **`oauth_error` 쿼리 형식**까지 한 번에 실증된다.
>
> `az` 로 교차 확인: SWA `team4hc-swa` 의 `defaultHostname` 이
> `polite-island-0bb189700.7.azurestaticapps.net`, **SKU `Free`**, RG `project-3rd-team-4`, East Asia.
> 백엔드 CORS 정규식(`main.py:43`)과 정확히 일치하고, **Free 티어라 Linked Backend 가 불가능하다는
> 논거(§3)도 실물로 뒷받침된다**(Bring-your-own 은 Standard 전용).

### ⭐ 배포본의 `FRONTEND_BASE_URL` 은 SWA 를 가리킨다

`infra/k8s/overlays/backend-staging/kustomization.yaml:33-39`:

```
OAUTH_BACKEND_BASE_URL = https://20-249-52-148.nip.io
FRONTEND_BASE_URL      = https://polite-island-0bb189700.7.azurestaticapps.net
```

**함정** — `localhost:5173` 에서 소셜 로그인을 시작해 staging 백엔드로 보내면, 콜백은
`FRONTEND_BASE_URL` 인 **SWA 로 되돌아온다**. 로컬 dev 창에서는 **절대 로그인이 완료되지 않는다.**
→ 로컬 개발은 **자체 이메일 로그인**으로 붙이는 것이 현실적인 답이다(리다이렉트가 없어 제약 없음).

---

## 6. 헬스체크

- **`GET /api/v1/health`** → `200` `{"status": "ok"}` · **인증 없음** · 항상 열려 있다
- **`/readyz`·`/healthz` 는 없다.** k8s probe 도 `/api/v1/health` 를 쓴다
  (옛 경로로 뒀다가 크래시루프가 났던 기록이 매니페스트 주석에 있다)
- ⚠️ 프론트 `CLAUDE.md` §3.2 경고대로, `git show f23d27a` 로 옛 `health.ts` 를 복원하면
  `/healthz` 라 **404** 다

---

## 7. 배포 형태

| 항목 | 값 |
|---|---|
| 베이스 이미지 | `python:3.12-slim` (멀티스테이지, uv 0.12.5) |
| 실행 사용자 | 비루트 `appuser` (uid 10001) |
| 포트 | **8000** (`uvicorn app.main:app`) |
| ACR 이미지 | `team4hcacr-…azurecr.io/backend:latest` — ⚠️ **태그 고정이라 파드가 재시작될 때만 갱신된다**(`08` §1.2) |
| **배포본 커밋(staging)** | **`b4615af`** — `origin/backend`(`6c29ea0`) 대비 🆕 **37커밋 뒤**(3차 재측정). ACR 태그 = git SHA (`08` §1) |
| Service | 80 → 컨테이너 8000 |
| replicas | **1** — 이중화 없음, **롤아웃 중 짧은 다운타임** + **진행 중 SSE 스트림 전부 끊김**(`08` §4.3) |
| **staging 호스트** | **`https://20-249-52-148.nip.io`** (namespace `staging`) ← **프론트가 붙을 수 있는 유일한 곳** |
| **production 호스트** | `https://merrymap-production.koreacentral.cloudapp.azure.com` — 🚨 **인증 이전 구버전. 붙으면 안 된다**(`08` §2) |
| 인그레스 | `ingressClassName: nginx` (**controller v1.15.1**), path `/` Prefix · **ConfigMap 비어 있음 = 전부 기본값** |
| 인그레스 · SSE | ✅ `proxy-buffering` 기본 **`off`** (통과) · 🚨 `proxy-read-timeout` 기본 **60초** (`08` §4) |
| 인증서 | cert-manager + Let's Encrypt(`CN=YR2`), ClusterIssuer `letsencrypt-nginx` · `notAfter` **2026-11-19** · **`renewalTime` 2026-10-20 (자동 갱신)** |
| 시크릿 | Azure Key Vault `team4hc-kv` → CSI 드라이버 → K8s Secret(`backend-kv-secrets`) → env |
| 신원 | Workload Identity, ServiceAccount `backend-sa` |
| RAG 재색인 | CronJob `rag-reindex` — ⚠️ **최근 회차 Error, ArgoCD Degraded**(`08` §7) |

🚨 **`VITE_API_BASE` 는 staging 하나뿐이다.** production 은 도메인만 다른 게 아니라
**API 계약 자체가 다른 구버전**이다(`08` §2). 「배포 전에 production 으로 전환」은 **v4.0 이 `main` 에
머지되고 production 파드가 갱신된 뒤에만** 성립한다.

`nip.io` 는 IP 가 곧 이름이라 **인그레스 IP 가 바뀌면 URL 도 바뀐다**(잠정 호스트).
반면 **인증서 만료는 리스크가 아니다** — cert-manager 가 만료 30일 전(2026-10-20)에 자동 갱신한다.

---

## 8. 프론트 착수 전 체크리스트

**차단급 — 백엔드 수정 없이는 로그인이 동작하지 않는다**

1. **`SameSite=Lax` → `None`** (`routers/auth.py:56`). 브라우저에서 SWA 또는 `localhost:5173` 오리진의
   `fetch("…/auth/me", {credentials:"include"})` 로 **실측 확인**부터 — 401 이면 확정.
2. **소셜 로그인 로컬 개발 경로** — `FRONTEND_BASE_URL` 이 SWA 고정(§5). 자체 이메일 로그인으로 먼저 붙일 것.

**설계 확인 필요**

3. `services/oauth.py:130` 자체계정 자동 연동이 의도인지(독스트링 불일치, §2.4)
4. `TOTAL_BUDGET_UNAVAILABLE` 404/422 이중 status — **status 아닌 `code` 로 분기**

**구현 시 반영**

5. **전역 401 인터셉터 → `/login`.** 슬라이딩 만료가 없어 30일째에 반드시 발생(§1)
6. **`/login` 라우트 필수** + `oauth_error` 쿼리 처리(값 8+종, 대소문자 혼재)
7. `has_wedding === false` → 온보딩, `404 WEDDING_NOT_FOUND` 도 **같은 곳으로**
8. 채팅 SSE 는 POST 라 `EventSource` 불가 → [04](04-ai-chat-rag.md) §1
9. **CSP `connect-src` 에 `https://20-249-52-148.nip.io` 추가** (프론트 `CLAUDE.md` §6-H)
10. dev 서버는 반드시 `localhost` (127.0.0.1 은 CORS 차단)
11. 🆕 **SSE 는 `done` 이벤트 수신 여부를 별도 플래그로 추적한다.** 인그레스 `proxy-read-timeout` 이
    **60초**라, 무음 구간이 길면 `done` **없이** 스트림이 닫힌다. `reader.read()` 의 `done: true` 만
    믿으면 **잘린 답변을 완성된 답변으로 표시**한다(`08` §4.2)
12. 🆕 **`VITE_API_BASE` 를 production 호스트로 바꾸지 않는다** — 인증 이전 구버전이다(`08` §2)
13. 🆕 **SWA 프리뷰 배포에서는 소셜 로그인을 테스트할 수 없다** — `FRONTEND_BASE_URL` 이 접미사 없는
    기본 SWA 호스트로 고정이라 프리뷰에서 시작해도 **프로덕션 SWA 로 돌아온다**(`08` §5.3).
    CORS 정규식은 접미사를 허용하는데 OAuth 리다이렉트는 고정이라 **비대칭**이다
