# 09 · 로컬 백엔드 런타임 — 연동 작업의 실제 대상

> **성격** `08-cluster-runtime.md` 의 짝. 저건 **AKS 배포본**이 무엇인지 재고, 이건 **로컬에서 도는 것**이
> 무엇인지 잰다. 소스(`origin/backend`)로도 배포본(staging)으로도 알 수 없는 것만 담는다.
>
> **결정** 🆕 **백엔드-프론트 연동 작업은 로컬에서 한다**(2026-08-25 사용자 결정). staging 이 아니다.
> 백엔드는 **WSL 에서 `localhost:8000`** 으로 사용자가 직접 띄운다.
>
> **측정 시점** 2026-08-25 · **측정 위치** Windows 쪽 `curl`(= 브라우저·dev 서버가 도는 곳)
> **측정 대상** `http://localhost:8000` (WSL 안의 uvicorn)
> 🔍 **4차 점검(2026-08-25)** — 코드 6c29ea0 대비 팩트체크. 수정 4건 / 미검증 3건. 상세는 README 「4차 점검 이력」.
>
> **한 줄 요약** — 로컬로 옮기면 **차단급 3건 중 2건이 조건 자체로 사라진다.**
> `SameSite=Lax`(§3)와 소셜 로그인 로컬 불가(§5)가 그렇고, 배포 갭(§2)도 해당되지 않는다.
> **다만 그건 로컬 한정이다 — 배포하는 순간 셋 다 되살아난다**(§7).

---

## 1. 도달성 — Windows → WSL 포워딩은 동작한다 [실측]

```
$ curl -sS -m 5 -D - -o - http://localhost:8000/api/v1/health
HTTP/1.1 200 OK
server: uvicorn
content-type: application/json

{"status":"ok"}
```

| 항목 | 값 |
|---|---|
| `GET /api/v1/health` | **200** `{"status":"ok"}` |
| `GET /` | 404 (대조군 — 라우팅이 살아 있다는 뜻) |
| 서버 | `uvicorn` |
| Windows → WSL `localhost` 포워딩 | ✅ **동작** |

🔑 **이게 자명하지 않은 이유** — WSL2 는 별도 네트워크 네임스페이스라 Windows 의 `localhost` 로
도달하려면 포워딩이 걸려야 한다. **여기서 재야 의미가 있다** — WSL 안에서 `curl localhost:8000` 이
되는 것은 Windows 브라우저에서 된다는 증거가 아니다. 위 측정은 **Windows 쪽에서** 한 것이다.

---

## 1-a. 🔍 기동 절차 — 저장소와 대조 (2026-08-25 4차)

문서가 전제하는 「WSL 에서 `localhost:8000` 으로 띄운다」의 실제 절차를 코드로 대조했다. **docker compose 파일은 저장소 어디에도 없다**(루트·`backend/`·`infra/` — `find -iname 'docker-compose*'` 0건). 로컬 DB 는 사용자가 따로 마련해야 한다.

| 단계 | 명령 | 근거 | 4차 실행 결과 |
|---|---|---|---|
| 의존성 | `cd backend && uv sync` | `backend/pyproject.toml`(hatchling, `requires-python >=3.12`, dev extras `pytest/ruff`) · `uv.lock` 존재 · Dockerfile 도 `uv sync --locked` | — |
| 앱 임포트 | `uv run python -c "import app.main"` | — | ✅ **통과** (`import ok`) |
| 마이그레이션 | `uv run alembic upgrade head` | `db/README.md:19` · `alembic.ini` `script_location=%(here)s/alembic`; **URL 은 `alembic.ini` 가 아니라 `Settings.database_url`**(`alembic/env.py:14,30`) | `uv run alembic heads` → **`4de56b422020 (head)`** (리비전 파일 **13개**, README 의 13 과 일치) |
| DB 연결 필요 명령 | `uv run alembic current` | — | ❌ `sqlalchemy.exc.ArgumentError: Could not parse SQLAlchemy URL` — 로컬 `backend/.env` 의 `DATABASE_URL` 이 **스킴 없는 호스트명만** 들어 있어서다. `app/core/db.py:22-26 _to_asyncpg_url` 은 `postgresql://` 로 시작해야 asyncpg 로 바꾼다 → **`postgresql://user:pw@host:5432/db` 형식의 DSN 이어야 한다** |
| 서버 | `uv run uvicorn app.main:app --port 8000` | `Dockerfile` CMD `uvicorn app.main:app --host 0.0.0.0 --port 8000` · `config.py:54` 기본값 8000. **`backend/README.md` 에는 기동 명령이 없다** | 4차 시점 8000/8001 무응답(§5-b) |
| `.env` 키 | `backend/.env.example` 복사 | 필수(기본값 없음): `DATABASE_URL` · `AZURE_OPENAI_ENDPOINT` · `GOOGLE_CLIENT_ID/_SECRET` · `NAVER_CLIENT_ID/_SECRET`(`config.py:11,16,47-50`). ⚠️ `.env.example:52` `RAG_TSVECTOR_TOP_K=8` 은 코드 기본값 **4**(`config.py:29`)와 다르다 | — |
| 시드 | `uv run python scripts/seed_vendor_cases.py` · `scripts/seed_price_benchmarks.py` | `backend/scripts/`(둘 다 존재) · `db/seed/` 는 **비어 있음**(`db/README.md:8`). ⚠️ `backend/scripts/README.md:10` 은 `seed_price_benchmarks.py` 를 아직 「(예정)·미작성」이라 적고 있다 — 파일은 있다(README 드리프트) | DB 필요 — 미실행 |

루트 `pyproject.toml`(untracked, `dependencies = []`)은 기준선이 아니다 — `uv` 를 루트에서 돌리면 이 빈 프로젝트를 잡으니 **반드시 `backend/` 에서** 실행한다.

---

## 2. 계약 표면 — 로컬이 배포본보다 최신이다 [실측]

`openapi.json` 을 받아 저장본 `openapi.deployed.json` 과 **차집합**을 냈다.

| | **로컬** (`localhost:8000`) | 배포본 (staging `b4615af`) |
|---|---|---|
| title / version | `메리맵 API` / `0.1.0` | 동일 |
| paths | **26** | 24 |
| operations | **33** | 31 |

**로컬에만 있는 것 2개**

```
+ POST /api/v1/personalization/regenerate
+ POST /api/v1/chat/sessions/{session_id}/messages/{message_id}/feedback
```

**배포본에만 있는 것 — 0개.** 즉 로컬은 배포본의 **상위 집합**이다.

**노출 33** 은 [`README`](README.md) 가 적어 둔 코드 기준(`6c29ea0`)의 OpenAPI 노출 수와 일치한다.
🔍 4차 코드 대조 — 워크트리 `6c29ea0` 에서 `app.openapi()` 직접 생성: **paths 26 · ops 33** · `ChatSessionCreate.required` **없음** ·
`ChatMessageOut` **7필드**(`id,role,content,citations,verification,user_rating,created_at`) · `info.version 0.1.0`. 위 실측과 전부 일치.

### ⚠️ 그렇다고 「배포 갭 10건이 전부 없다」로 읽으면 안 된다

[`08` §3](08-cluster-runtime.md) 의 배포 갭 10건 중 **openapi 로 확인 가능한 것은 4건**이고 전부
**로컬에서 해소됨을 실측**했다. 나머지 6건은 **openapi 로는 원리상 안 잡힌다.**

| # | 갭 | openapi 로 잡히나 | 로컬 실측 |
|---|---|---|---|
| 1 | `POST /personalization/regenerate` | ✅ 경로 | ✅ **있음**(배포본 404) |
| 6 | `POST …/messages/{mid}/feedback` | ✅ 경로 | ✅ **있음**(배포본 404) |
| 2 | 전역 상담 `category_code: null` → 422 | ✅ **`required` 배열** | ✅ **해소** — 로컬 `ChatSessionCreate.required` = **없음** / 배포본 = `["category_code"]` |
| 7 | `ChatMessageOut.user_rating` | ✅ **속성 목록** | ✅ **있음** — 로컬 7필드(`…,user_rating,created_at`) / 배포본 6필드 |
| 3·4 | SSE `stage`·`retry` 이벤트 | ❌ 스트림 내용 | 미확인 — 실제 상담 1회 필요 |
| 5 | 답변 마크다운 금지 | ❌ 프롬프트 | 미확인 — 실제 상담 1회 필요 |
| 8~10 | 개인화 상시 BLOCKED · 도메인 독립 판정 · 저다양성 | ❌ **200 으로 정상 응답** | 미확인 — 온보딩 1회 필요 |

🔑 **2번(전역 상담 422)은 진입점 설계를 되돌린다.** [`08` §3.1](08-cluster-runtime.md) 은 배포본이
422 를 내므로 **S3 를 카테고리 진입점부터 만들라**고 정했는데, **로컬에서는 전역 상담이 그대로 된다.**
단 배포 시 되살아나므로 **전역 진입점을 만들더라도 422 를 처리할 수 있어야 한다**(§7).

**로컬 백엔드 워크트리의 커밋** — 🔍 4차(2026-08-25)에 WSL 워크트리 `branchs/backend_jy` 에서 `git rev-parse HEAD` = **`6c29ea0`** = `origin/backend`, `rev-list --count HEAD..origin/backend` = **0** 으로 확정했다
(브랜치명은 `feature/linked_frontend`). 단 이것은 **워크트리**의 커밋이고, **실행 중인 uvicorn 프로세스가 그 워크트리에서 떴는지**는 프로세스를 띄운 사람만 안다 — 4차 시점엔 8000/8001 어느 쪽도 응답이 없어(§5-b) 실행 인스턴스 자체를 못 봤다.

---

## 3. 🔑 `SameSite=Lax` 차단이 로컬에서는 **발생하지 않는다** [공식 문서로 확정]

이게 로컬 전환의 가장 큰 효과다. [`05` §3.3](05-auth-cors-deploy.md) 의 차단급 1번이 **조건 자체로
성립하지 않는다.**

**로컬 백엔드가 실제로 내려주는 쿠키**(실측, `GET /api/v1/auth/google/login`):

```
set-cookie: wr_oauth_state="..."; HttpOnly; Max-Age=600; Path=/; SameSite=lax; Secure
```

**속성은 배포본과 똑같다**(`samesite="lax"` — 소스가 같으니 당연하다). 바뀐 것은 **오리진 쌍**이다.

### 근거 — 포트는 site 정의에 들어가지 않는다

> These are considered the same site because **the port number is ignored when determining the site**:
> - `https://example.com:8080`
> - `https://example.com`
>
> — [MDN Glossary · Site](https://developer.mozilla.org/en-US/docs/Glossary/Site) (🔍 4차 재확인 — 원문 그대로)

스킴은 들어간다(*schemeful same-site*, 같은 문서: *"This stricter definition is applied in the rules
for handling `SameSite` cookies"*). 그런데 로컬은 **양쪽 다 `http`** 다.

| | 프론트 | 백엔드 | 판정 |
|---|---|---|---|
| **staging** | `polite-island-….azurestaticapps.net` / `localhost:5173` | `20-249-52-148.nip.io` | 🚨 **cross-site** |
| **로컬** | `http://localhost:5173` | `http://localhost:8000` | ✅ **same-site** (호스트 동일 · 스킴 동일 · **포트는 무시**) |

MDN 의 `SameSite=Lax` 정의는 *"Send the cookie only for requests originating from the **same site**
that set the cookie, **and for** cross-site requests that meet both of the following criteria"* 다.
`fetch()` 를 제외하는 조항은 **cross-site 쪽에만 걸린다.** 로컬은 same-site 이므로 **`fetch()` 에도
쿠키가 정상적으로 실린다.**

### 귀결

- ✅ **백엔드 `samesite="none"` 수정을 기다리지 않아도 로컬 연동은 진행할 수 있다.**
- ✅ **`CLAUDE.md` §6-C(Safari/Firefox 서드파티 쿠키)도 로컬에서는 안 걸린다** — 서드파티 쿠키가
  아니게 되기 때문이다. ITP·TCP 는 cross-site 문맥의 장치다.
- 🚨 **하지만 이건 유예이지 해결이 아니다.** 배포하면 오리진 쌍이 다시 갈라져 **차단급 1번이 그대로
  되살아난다.** [`BACKEND_REQUEST.md`](BACKEND_REQUEST.md) 의 `SameSite` 수정 요청은 **여전히 필요하다** —
  로컬에서 잘 돈다는 이유로 취하하면 안 된다.
- 🚨 **그래서 로컬에서 「쿠키가 잘 실린다」를 본 것으로 배포 환경을 판정하면 안 된다.**
  로컬은 이 결함에 대해 **구조적으로 눈이 먼 환경**이다.

⚠️ **여전히 CORS 는 걸린다.** same-site 지만 **cross-origin**(포트가 다르다)이므로 `credentials:
"include"` + 서버의 `Access-Control-Allow-Credentials: true` + 정확한 `Allow-Origin` 은 그대로 필요하다.
`localhost:5173` 은 배포본 CORS 허용 목록에도 들어 있던 값이다([`05` §3.1](05-auth-cors-deploy.md)).

---

## 4. ✅ `Secure` 쿠키는 `http://localhost` 에서도 저장된다 [공식 문서로 확정]

§3 의 실측 쿠키에 **`Secure` 가 붙어 있다.** 그런데 로컬은 `http://` 다 — 보통은 이 조합이면
브라우저가 쿠키를 **버린다**. 확인 결과 **localhost 예외가 명문화돼 있다**:

> Insecure sites (`http:`) cannot set cookies with the `Secure` attribute.
> **The `https:` requirements are ignored when the `Secure` attribute is set by localhost.**
>
> — [MDN · Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) (🔍 4차 재확인 — 원문 그대로. `Max-Age=600` 은 `core/oauth_providers.py:16` `OAUTH_STATE_TTL_SECONDS = 600`, `secure=True`/`samesite="lax"` 는 `routers/auth.py:55-56,165-166`)

**→ 백엔드 코드를 로컬용으로 고칠 필요가 없다.** `secure=True` 그대로 동작한다.

🔑 **이걸 확인해 둔 이유** — 이 사실을 모르면 로그인 실패를 만났을 때 `Secure` 를 범인으로 지목하고
백엔드 설정을 건드리게 된다. **범인이 아니다.**

---

## 5. `OAUTH_BACKEND_BASE_URL=http://localhost:8000` 은 실제로 반영됐다 [실측]

```
$ curl -sS -D - -o /dev/null http://localhost:8000/api/v1/auth/google/login
HTTP/1.1 307 Temporary Redirect
location: https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=375407256274-….apps.googleusercontent.com
  &redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Fapi%2Fv1%2Fauth%2Fgoogle%2Fcallback
  &response_type=code&state=…&scope=openid%20email%20profile
  &code_challenge=…&code_challenge_method=S256
```

| 제공자 | 응답 | `redirect_uri` | PKCE |
|---|---|---|---|
| 구글 | **307** | `http://localhost:8000/api/v1/auth/google/callback` | ✅ `S256` |
| 네이버 | **307** | `http://localhost:8000/api/v1/auth/naver/callback` | ❌ 없음(`code_verifier: null`) |

**→ 환경변수가 콜백 URL 조립에 실제로 반영된다**([`05` §5](05-auth-cors-deploy.md) 의
`OAUTH_BACKEND_BASE_URL` 기본값이 정확히 이 값이다). 두 제공자 모두 client_id 가 주입돼 있다.

### 소셜 로그인 로컬 불가(차단급 2번)는 **조건이 풀렸다 — 단 완주는 아직 미확인**

[`README` §2-2](README.md) 가 남긴 세 선택지 중 **①번(백엔드를 로컬에서 직접 실행)** 을 택한 셈이다.
`FRONTEND_BASE_URL` 기본값이 `http://localhost:5173` 이므로([`05` §5](05-auth-cors-deploy.md)),
콜백이 **로컬 dev 서버로 돌아온다** — staging 처럼 SWA 로 튕기지 않는다.

### 🆕 5-a. `frontend/.env.example` 이 두 값을 못박아 뒀다 (2026-08-25 확인)

🔍 4차 — `feature_frontend/frontend/.env.example:67-68` 에 아래 두 줄 그대로 있음을 확인(커밋 `17af036`). `backend/.env.example:63-65` 도 같은 문구 — 단 아래 5-b 참조.

프로젝트 공용 템플릿([`05` §5-a](05-auth-cors-deploy.md) — 프론트 전용이 아니라 백엔드·인프라
변수가 함께 있는 파일)에 **값이 채워진 줄이 이 둘뿐**이다. 나머지는 전부 빈 플레이스홀더다:

```dotenv
# 로컬 기본값은 app/core/config.py의 Settings 기본값과 동일 — 비워두면 그 기본값을 쓴다.
OAUTH_BACKEND_BASE_URL=http://localhost:8000
FRONTEND_BASE_URL=http://localhost:5173
```

⚠️ **이것은 「실행 중인 백엔드가 그 값을 쓴다」의 증거가 아니다.** `.env.example` 은 템플릿이고
실제 값은 `.env` 가 정한다. 다만 ① `config.py` 기본값과 같고 ② §5 에서 잰 `redirect_uri` 가
`OAUTH_BACKEND_BASE_URL` 쪽과 **정확히 일치**하므로, 같은 파일에서 온 `FRONTEND_BASE_URL` 도
`localhost:5173` 일 **정황이 강하다**. 확정은 아래 2번.

🔑 **그리고 같은 파일이 IdP 콘솔 등록을 명시적으로 요구한다** — 아래 1번의 근거다:

> 콜백 URI(`OAUTH_BACKEND_BASE_URL` + `/api/v1/auth/{provider}/callback`)를 콘솔에 미리 등록해야 한다.

🚨 **아직 확인하지 않은 조건 두 개**:

1. **IdP 콘솔에 이 콜백 URL 이 등록돼 있는가.** 구글/네이버 콘솔의 승인된 리디렉션 URI 에
   `http://localhost:8000/api/v1/auth/{google,naver}/callback` 이 없으면 **IdP 단계에서
   `redirect_uri_mismatch` 로 멈춘다.** 백엔드 설정이 아무리 맞아도 소용없다.
   위 인용대로 **템플릿 자신이 이 등록을 전제**하므로, 등록 여부는 사람이 콘솔에서 확인해야 한다.
2. **실행 인스턴스의 `FRONTEND_BASE_URL` 실측.** ⚠️ **2026-08-25 시도했으나 재지 못했다** —
   그 시점에 백엔드가 내려가 있어 `Failed to connect to localhost port 8000` 이 났다.
   백엔드를 다시 띄운 뒤 §8 의 4번 명령으로 잰다(콜백에 `?error=` 를 붙이면 IdP·DB 를 안 건드리고
   리다이렉트 대상만 드러난다). `http://localhost:5173/login?oauth_error=denied` 가 나오면 확정이다.
   🔍 4차(2026-08-25)에도 WSL 안에서 `curl localhost:8000` · `:8001` 모두 무응답(타임아웃) — 여전히 미측정.

### 🔍 5-b. 포트 함정 — 백엔드 워크트리의 `.env.example` 이 **미커밋 상태로 8001** 로 바뀌어 있다 (2026-08-25 4차)

`branchs/backend_jy/backend/.env.example:64` 가 로컬에서 `OAUTH_BACKEND_BASE_URL=http://localhost:8001` 로 **수정돼 있고 커밋되지 않았다**(`git diff` 1줄, HEAD 는 `8000`).
이 문서 전체(§1·§3·§5·§8)와 `05` §5-a · `frontend/.env.example` · `core/config.py:54` 기본값은 **모두 8000 을 전제**한다.

| 파일 | `OAUTH_BACKEND_BASE_URL` |
|---|---|
| `core/config.py:54` (기본값) | `http://localhost:8000` |
| `backend/.env.example` HEAD(`6c29ea0`) | `http://localhost:8000` |
| `backend/.env.example` **워킹트리(미커밋)** | 🚨 `http://localhost:8001` |
| `backend/.env` (실제 로딩 파일, 4차 확인) | `http://localhost:8000` ✅ |
| `frontend/.env.example:67` | `http://localhost:8000` |

- **지금 당장은 무해하다** — `Settings` 는 `.env` 만 읽고(`config.py:67` `env_file=".env"`) `.env.example` 은 안 읽는다. 실제 `.env` 는 8000 이다.
- **함정은 두 가지다.** ① 누가 `.env.example` 을 복사해 `.env` 를 새로 만들면 `redirect_uri` 가 `:8001` 로 조립되고 IdP 콘솔 등록값(8000)과 어긋나 **`redirect_uri_mismatch`**. ② 그 값이 8001 이라는 건 **8000 을 다른 프로세스가 쓰고 있어 uvicorn 을 8001 로 띄운 적이 있다**는 정황이다 — 그렇다면 `VITE_API_BASE`·CORS(`localhost:5173` 만 허용, 백엔드 포트는 무관) 중 **프론트 `VITE_API_BASE` 가 8000 을 가리키면 연결 자체가 안 된다**. 백엔드 포트를 바꾸려면 `.env` 의 `OAUTH_BACKEND_BASE_URL` · 프론트 `VITE_API_BASE` · IdP 콘솔 콜백 **세 곳을 같이** 바꿔야 한다.
- 이 미커밋 변경은 「기준선 아님」으로 취급한다(README). **커밋하거나 되돌리기 전엔 이 문서는 8000 을 유지한다.**

---

## 6. 아직 확인하지 않은 것 — **여기까지는 전부 `curl` 이다**

이 저장소에는 **`curl` 은 통과하는데 브라우저에서만 죽은 전례**가 있다(`CLAUDE.md` §5.11 —
`http://` 인그레스 308 에 CORS 헤더가 없어 브라우저만 실패). 같은 실수를 반복하지 않기 위해 명시한다.

| 미확인 항목 | 왜 필요한가 | 확인 방법 |
|---|---|---|
| **브라우저 오리진에서의 CORS 프리플라이트** | 서버 점검이 전부 초록불인데 브라우저만 죽는 유형이 이 저장소에 2건 있다(§5.11·§5.12) | `npm run dev` 뒤 `localhost:5173` 콘솔에서 `fetch(…, {credentials:"include"})` |
| **쿠키 왕복 실물** | §3 은 공식 문서 기반 판정이다. **브라우저 실측은 아직 없다** | 로그인 → `GET /auth/me` 200 |
| **로컬 백엔드 커밋** | 계약 인용의 기준점 | §8 |
| **IdP 콘솔 콜백 등록** | §5 의 차단 조건 · **템플릿 자신이 등록을 전제한다**(§5-a) | 콘솔 확인 — 사람만 가능 |
| **실행 인스턴스의 `FRONTEND_BASE_URL`** | 템플릿 값은 확인됐지만 그건 `.env` 가 아니다(§5-a) | §8 의 4번 — ⚠️ 2026-08-25 백엔드가 내려가 있어 실패 |
| **SSE 스트림 실물** | `stage`/`retry` 는 openapi 에 안 나온다(§2) | 상담 1회 |
| ~~**로컬 백엔드 커밋**~~ | 🔍 4차에 워크트리 `6c29ea0` 확정(§2). 남는 건 **실행 프로세스 ↔ 워크트리 일치** 뿐 | 실행 중인 uvicorn 의 cwd 확인 |

---

## 7. 🚨 로컬에서 통과한 것이 배포에서 통과한다는 보장이 아니다

**로컬 전환은 세 가지를 동시에 가린다.** 전부 배포 시 되살아난다.

| 항목 | 로컬 | 배포(SWA ↔ nip.io) |
|---|---|---|
| `SameSite=Lax` | ✅ same-site 라 무해 | 🚨 **차단** — 백엔드 수정 필요 |
| Safari/Firefox 서드파티 쿠키(§6-C) | ✅ 서드파티가 아님 | 🚨 **`None` 으로 고쳐도 Safari 불가** |
| 배포 갭 10건 | ✅ 로컬이 상위 집합 | 🚨 롤아웃 전까지 유효 |
| 스킴 | `http` | `https` — **`VITE_API_BASE` 형식 게이트와 충돌**(§8-a) |

**→ 화면을 로컬에서 다 만든 뒤 배포하면 그 시점에 세 개가 한꺼번에 터진다.**
[`BACKEND_REQUEST.md`](BACKEND_REQUEST.md) 의 요청 2건(`SameSite` 수정 · 롤아웃)은
**로컬 전환과 무관하게 그대로 유효하다.**

### 7-a. ⚠️ 프론트 설정에 즉시 걸리는 충돌 — `https://` 강제 게이트

`CLAUDE.md` §6-O 와 [`05` §5-a](05-auth-cors-deploy.md) 는 전송 계층 복원 시
**`VITE_API_BASE` 에 `https://` + 끝 슬래시 없음 형식 게이트**를 걸라고 정해 뒀다.
그 근거는 §5.11 사고(인그레스 308)인데, **로컬 백엔드는 `http://localhost:8000`** 이라 그 게이트에
**정면으로 걸린다.**

**결정이 필요한 지점이다**(임의로 정하지 않는다):

- 게이트를 `https://` **또는** `http://localhost:*` 허용으로 완화할지,
- 아니면 `import.meta.env.DEV` 일 때만 예외를 둘지.

⚠️ 어느 쪽이든 **「배포 빌드에서 `http://` 가 통과하는 경로」를 만들면 안 된다** — 그러면 §5.11 사고를
막던 장치가 사라진다. CSP `connect-src` 도 같은 문제를 갖는다(로컬 호스트를 dev 에서만 넣어야 한다).

---

## 8. 재실측 명령

```bash
# 1) 도달성 (Windows 쪽에서 — WSL 안에서 재면 의미 없다)
curl -sS -m 5 -o /dev/null -w '%{http_code}\n' http://localhost:8000/api/v1/health   # → 200

# 2) 계약 표면 — 배포본 대비 차집합
curl -s http://localhost:8000/openapi.json > /tmp/local.json
node -e '
const f=n=>{const s=JSON.parse(require("fs").readFileSync(n,"utf8"));const o=[];
 for(const[p,v]of Object.entries(s.paths))for(const m of Object.keys(v))
   if(["get","post","put","patch","delete"].includes(m))o.push(m.toUpperCase()+" "+p);
 return new Set(o)};
const L=f("local.json"), D=f("openapi.deployed.json");
console.log("로컬 ops="+L.size, "배포 ops="+D.size);
[...L].filter(x=>!D.has(x)).sort().forEach(x=>console.log("  + "+x));
[...D].filter(x=>!L.has(x)).sort().forEach(x=>console.log("  - "+x));'
#   ⚠️ Git Bash 의 /tmp 와 Windows node 의 /tmp 는 다른 경로다(node 는 C:\tmp 로 읽는다).
#      스크립트에 넘길 땐 Windows 경로를 쓰거나 같은 디렉터리에서 상대 경로로 돌린다.

# 3) OAUTH_BACKEND_BASE_URL 이 반영됐는가
curl -sS -D - -o /dev/null http://localhost:8000/api/v1/auth/google/login | grep -i '^location'
#   → redirect_uri 가 http%3A%2F%2Flocalhost%3A8000 이면 반영된 것

# 4) FRONTEND_BASE_URL 실측 — IdP·DB 를 안 건드린다 (05 §5-a 와 같은 수법)
curl -sS -D - -o /dev/null "http://localhost:8000/api/v1/auth/google/callback?error=denied" | grep -i '^location'
#   → http://localhost:5173/login?oauth_error=denied 여야 로컬 완주가 가능하다

# 5) 로컬 백엔드가 어느 커밋인가 (WSL 워크트리에서)  — 🔍 4차 실측: 6c29ea0 / 0
wsl -e bash -lc 'cd <백엔드 워크트리> && git rev-parse --short HEAD && git fetch origin backend -q && git rev-list --count HEAD..origin/backend'
#   → 뒤 숫자가 0 이 아니면 로컬도 origin/backend 보다 뒤처져 있다
```

---

## 9. 이 문서가 만든 결정 요청

| # | 항목 | 왜 내가 못 정하는가 |
|---|---|---|
| 1 | **`VITE_API_BASE` 형식 게이트를 로컬 `http://` 에 어떻게 열 것인가**(§7-a) | 게이트 완화는 **절차 규제 변경**이라 결정자 몫이다(`CLAUDE.md` §5.8-4). 실제 사고를 막던 장치다 |
| 2 | **IdP 콘솔에 로컬 콜백 URL 등록**(§5) | 구글/네이버 콘솔은 프론트 소관이 아니다. 미등록이면 소셜 로그인이 IdP 단계에서 멈춘다 |
| 3 | **`BACKEND_REQUEST.md` 발신 여부**(§7) | 로컬로 옮겨도 **요청 2건은 그대로 유효**하다. 다만 긴급도는 낮아졌다 — 발신 시점은 결정자 판단 |
