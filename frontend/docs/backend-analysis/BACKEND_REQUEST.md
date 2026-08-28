# 프론트 → 백엔드 요청 (2026-08-24)

> **보내는 쪽** 프론트엔드 (`feature/link_backend`)
> **기준** 백엔드 브랜치 `backend` **`6c29ea0`** (PR #57 머지) · staging 배포본 **`b4615af`** (AKS 실측)
> **성격** 5건 중 **1건이 차단급**(프론트가 로그인 이후 화면을 하나도 만들 수 없음).
> 나머지는 배포 1건 · 확인 2건 · 운영 1건입니다.
>
> 모든 항목에 **재현 명령**과 **파일:줄**을 붙였습니다. 줄번호는 **`6c29ea0` 기준**으로 실측했습니다
> (PR #57 은 `personalization/prompts.py` 만 건드려 아래 인용 파일들의 줄번호는 변하지 않았습니다).
>
> 🔍 **4차 점검(2026-08-25)** — 코드 6c29ea0 대비 팩트체크. 수정 2건 / 미검증 1건. 상세는 README 「4차 점검 이력」.
> 🔍 **2026-08-25 개정** — §1 요청 최종 상태 표(`samesite="none"` 명시) · §4 를 「백엔드 확인 요청」에서 **「프론트 근본 해결(2단계 저장) · 참고」** 로 전환 · §5 CronJob 원인 확정 반영.
>
> 🆕 **끝에 「부록」을 붙였습니다** — 보내 주신 프론트 문서 묶음을 소스·배포본과 대조한 결과입니다.
> **요청이 아니라 참고용**이고, 저희는 이미 반영해서 진행 중입니다. 다만 그중 **production 호스트
> 안내 1건은 다른 분이 그대로 붙으면 로그인이 전멸**하므로 눈여겨봐 주시면 좋겠습니다.

---

## 요약

| # | 요청 | 종류 | 급함 | 왜 프론트가 못 하나 |
|---|---|---|---|---|
| **1** | **세션 쿠키 `SameSite=Lax` → `None` 변경** — `samesite="none"` 을 **명시**(발급·삭제 2곳, `Secure` 는 이미 있음) | 코드 2곳 | 🚨 **차단** | 백엔드 소유 파일. 프론트가 무엇을 해도 우회 불가 |
| **2** | **staging 롤아웃 1회** | 배포 | 🚨 높음 | 클러스터 권한 없음. **코드 수정은 필요 없습니다** |
| **3** | 소셜 로그인 시 **자체 가입 계정 자동 연동**이 의도인지 | 확인 | ⚠️ 보안 | 설계 의도를 모름. 독스트링과 코드가 어긋남 |
| **4** | `APPROX_H2_THIS_YEAR` 가 **10~12월에 과거 날짜**가 됨 | ~~확인·수정~~ → **프론트가 흡수**(참고) | 낮음 | 🔍 **2026-08-25 프론트에서 근본 해결** — `POST`(EXACT+대표일) → `PATCH`(precision) 2단계. 백엔드 수정 **요청 아님**, 하한 처리는 선택 |
| **5** | RAG 재색인 CronJob **08-24·08-25 2연속 실패 — 원인 확정(OAuth env 4개 누락)** | 운영 | 🔍 **중간**(코퍼스가 08-23 에 멈춤) | 인프라 매니페스트 소관 |

---

## 1. 🚨 세션 쿠키 `SameSite=Lax` → `None` 변경 **[차단급]**

**한 줄**: 지금 설정으로는 **로그인은 되는데 그 뒤 모든 API 가 401** 입니다. 프론트가 화면을 만들 수 없습니다.

**요청하는 최종 상태를 명시합니다** — 세션 쿠키 `wr_session` 의 속성이 발급·삭제 **양쪽 모두** 아래와 같아야 합니다.

| 속성 | 현재(`b4615af` 배포본 · `6c29ea0` 소스 동일) | **요청** |
|---|---|---|
| `SameSite` | `lax` (`auth.py:56`) / 삭제 시 Starlette 기본 `lax` (`auth.py:121`) | **`none`** — `samesite="none"` 을 **두 곳에 명시** |
| `Secure` | 발급 ✅ `secure=True` (`auth.py:55`) / 삭제 ❌ 없음 | 발급 유지 · **삭제에도 `secure=True` 명시** (`SameSite=None` 은 `Secure` 필수) |
| `HttpOnly` | 발급 ✅ / 삭제 ❌ | 삭제에도 `httponly=True` 명시 |
| `Path` · `Max-Age` · 이름 | `/` · 30일 · `wr_session` | 그대로 |

> ⚠️ **값은 소문자 `"none"`** 입니다. Starlette 는 `samesite` 인자를 `lax`/`strict`/`none` 문자열로만 받고 대소문자 검사를 하므로(`starlette/responses.py:120-124` — `assert samesite.lower() in [...]`) `"None"` 도 통과는 하지만, 헤더에는 그대로 찍힙니다 — 소문자로 통일해 주세요. `SESSION_COOKIE_SAMESITE` 같은 **설정 키는 현재 없습니다**(`core/config.py:41-42` 는 이름·TTL 뿐) — 코드 상수 변경이 맞고, 로컬 `http://localhost` 에서도 Chromium 은 localhost 를 secure context 로 취급해 `Secure` 쿠키를 받으므로 환경 분기는 필요 없습니다([`09` §3](09-local-runtime.md)).

### 무엇이 문제인가

프론트(SWA `*.azurestaticapps.net` / 로컬 `localhost:5173`)와 백엔드(`*.nip.io`)는 **등록 도메인이
달라 cross-site** 입니다. `SameSite=Lax` 쿠키는 이 조건에서 **`fetch()` 요청에 아예 실리지 않습니다.**

MDN `Set-Cookie` — `SameSite=Lax` 정의:

> Send the cookie only for requests originating from the same site that set the cookie, and for
> cross-site requests that meet both of the following criteria:
> - The request is a top-level navigation … **This would exclude, for example, requests made using
>   the `fetch()` API** …
> - The request uses a safe method: in particular, this excludes `POST`, `PUT`, and `DELETE`.
>
> — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie

### 🔑 가장 헷갈리는 형태로 나타납니다

**소셜 로그인의 쿠키 *설정*은 성공합니다** — IdP → 백엔드 콜백이 top-level 네비게이션이라 Lax 가 허용합니다.
그래서 **「로그인은 됐는데 그다음부터 전부 401」** 로 보입니다.

그리고 **서버 쪽 점검은 전부 초록불입니다** — CORS 프리플라이트 200 · `access-control-allow-credentials: true`
· ACAO 정상. 저희도 CORS 설정 자체에는 문제를 못 찾았습니다. **브라우저가 쿠키를 붙이는 단계 자체를
건너뛰는 것**이라 서버 로그에도 안 남습니다.

`credentials: "include"` 를 넣어도 소용없습니다(저희는 넣을 예정입니다만, 그것으로 해결되지 않습니다).

### 고칠 곳 — 2곳

**① 발급** `backend/app/routers/auth.py:56` (`_set_session_cookie`)

```python
 response.set_cookie(
     key=settings.session_cookie_name,
     value=token,
     httponly=True,
     secure=True,
-    samesite="lax",
+    samesite="none",
     max_age=settings.session_ttl_days * 24 * 60 * 60,
 )
```

MDN: *"`SameSite=None` … The `Secure` attribute must also be set when using this value."*
→ **이미 `secure=True` 라 조건은 충족**합니다. 다른 변경 없이 이 한 단어면 됩니다.

**② 삭제(로그아웃)** `backend/app/routers/auth.py:121`

```python
-    response.delete_cookie(key=settings.session_cookie_name)
+    response.delete_cookie(
+        key=settings.session_cookie_name, httponly=True, secure=True, samesite="none"
+    )
```

인자 없이 부르면 Starlette 기본값(`secure=False`, `samesite="lax"` — starlette 1.6.0 `Response.delete_cookie` 시그니처)으로 나갑니다. **속성이 다르면
브라우저가 같은 쿠키로 인식하지 않아 삭제가 안 먹습니다.** 실측 응답:

```
HTTP/1.1 204 No Content
set-cookie: wr_session=""; expires=…; Max-Age=0; Path=/; SameSite=lax     ← Secure 없음
```

> `wr_oauth_state`(`auth.py:166`)는 **그대로 두셔도 됩니다** — IdP→백엔드 top-level 네비게이션에서만
> 쓰이므로 Lax 로 정상 동작합니다. 굳이 바꾸면 보안만 느슨해집니다.

### 검증 방법

```bash
# ① 삭제 쪽 (계정 불필요) — 배포 직후 바로 확인 가능
curl -s -D - -o /dev/null -X POST https://20-249-52-148.nip.io/api/v1/auth/logout | grep -i set-cookie
#   현재(2026-08-25 08:43Z 실측): wr_session=""; ...; Path=/; SameSite=lax          ← Secure 없음
#   기대:                         wr_session=""; ...; Path=/; HttpOnly; Secure; SameSite=none

# ② 발급 쪽 — 자체 로그인 1회 (테스트 계정)
curl -s -D - -o /dev/null -X POST https://20-249-52-148.nip.io/api/v1/auth/login \
  -H 'content-type: application/json' -d '{"email":"…","password":"…"}' | grep -i set-cookie
#   기대: wr_session=<token>; HttpOnly; Max-Age=2592000; Path=/; SameSite=none; Secure
```

두 응답 모두 `SameSite=none` **그리고** `Secure` 가 보여야 합니다 — 하나라도 빠지면 브라우저가 쿠키를 버립니다(MDN: *"Cookies with `SameSite=None` must also specify `Secure`"*).

배포 후 알려 주시면 저희가 **SWA 오리진에서 `fetch("…/auth/me", {credentials:"include"})`** 로
실제 브라우저 검증까지 하고 결과를 회신하겠습니다.

### 정직하게 덧붙입니다 — 이 수정으로 풀리는 범위

저희가 앞서 「1줄이면 해결된다」고 말씀드렸는데, 확인해 보니 **정확히는 「Chromium 에서 해결된다」**
입니다. 크로스 사이트 쿠키는 곧 **서드파티 쿠키**라 엔진마다 기본 정책이 다릅니다:

| 엔진 | 서드파티 쿠키 기본 정책 | 이 수정 후 |
|---|---|---|
| **Chromium**(Chrome·Edge) | 기본 차단하지 않음(시크릿·사용자 설정 제외) | ✅ **동작** |
| **Safari**(ITP) | **전부 차단** | ❌ 여전히 안 됨 |
| **Firefox**(Total Cookie Protection) | 사이트별 분리 저장소로 **분할** | ⚠️ 안 보일 가능성 높음 |

> *"**ITP by default blocks all third-party cookies. There are no exceptions to this blocking.**"*
> — WebKit, [Tracking Prevention](https://webkit.org/tracking-prevention/)
> *"Google Chrome doesn't block third-party cookies by default …"* / *"Firefox … gives third-party
> cookies a **separate cookie jar per site**"*
> — MDN, [Third-party cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies)

**그래도 이 수정은 필요합니다** — 없으면 **Chromium 에서도** 안 되기 때문입니다. 그리고 저희 빌드
타깃이 현재 Chromium 전용(`chrome111`)이라 **당장은 이걸로 충분합니다.**

**Safari·iOS 지원이 요구사항에 들어간다면 그건 백엔드 1줄로 되는 문제가 아니라 아키텍처 문제**
입니다(프론트와 API 를 같은 site 로 만들거나 Storage Access API). **지금 여쭙는 것은 아니고**,
저희 쪽 지원 브라우저 범위가 정해지면 그때 함께 논의드리겠습니다.

---

## 2. 🚨 staging 롤아웃 1회 — **코드 수정은 필요 없습니다**

**한 줄**: 배포본이 `origin/backend` 보다 **37커밋 뒤**라, **프론트 계약 10건이 배포 대기 중**입니다.

### 지금 상태 (2026-08-24 클러스터 실측)

| | 값 |
|---|---|
| staging 파드 이미지 | `b4615af` (빌드 08-23T20:19Z) · 기동 08-23T20:24Z · **`RESTARTS 0`** |
| `origin/backend` HEAD | **`6c29ea0`** |
| 격차 | **37커밋** (같은 날 29 → 33 → **37** — **계속 벌어지는 중**) |
| ACR `latest` | ✅ **이미 `6c29ea0` 로 빌드돼 있음** (08-24T11:15Z) |

**원인**: Deployment 가 `backend:latest` + `imagePullPolicy: Always` 조합이라 **태그가 안 바뀌어
매니페스트도 안 바뀝니다.** 그래서 **파드가 재시작될 때만** 새 이미지를 집습니다.
(`argocd-image-updater` 는 붙어 있지만 Application 에 kustomize image override 흔적이 없어
되쓰기가 실제로 일어나지 않은 것으로 보입니다.)

### 🔑 이 요청이 불필요해 보이실 수 있습니다 — 「1/1 Running」의 함정

전달 주신 `FRONTEND_COLLABORATION_REQUEST.md` 에 이렇게 적혀 있습니다:

> *"백엔드는 33개 엔드포인트 전부 구현·**배포 완료** … staging도 **최신 이미지로 떠 있습니다.
> 안심하고** 이 스펙 기준으로 연동하시면 됩니다."*
> *"staging … **최신 이미지로 1/1 Running 확인**"*

**구현은 실제로 전부 끝나 있습니다** — 저희가 소스로 확인했고 그 부분은 문서가 맞습니다.
틀린 것은 **「배포 완료」** 쪽뿐입니다. 같은 시각 라이브 실측:

| 호출 | 결과 |
|---|---|
| `GET /health` | **200** |
| `POST /personalization/regenerate` (문서 #32) | 🚨 **404** |
| `POST …/messages/{mid}/feedback` (문서 #33) | 🚨 **404** |
| 라이브 `openapi.json` | 🚨 **paths 24 · ops 31** (문서 주장 33) |

**`1/1 Running` 은 「파드가 떠 있다」는 뜻이지 「최신 이미지」라는 뜻이 아닙니다.** 공식 문서가
그 이유를 명시합니다:

> *"every time the **kubelet launches a container**, the kubelet requests the container runtime
> to pull the image."*
> *"You should **avoid using the `:latest` tag** when deploying containers in production as it is
> harder to track which version of the image is running and more difficult to roll back properly."*
> — Kubernetes, [Images](https://kubernetes.io/docs/concepts/containers/images/)

`imagePullPolicy: Always` 는 **컨테이너가 새로 뜰 때만** 당깁니다. `:latest` 는 태그가 안 바뀌니
매니페스트도 안 바뀌고, 그래서 파드가 재시작되지 않습니다 — staging 파드는 **08-23T20:24:43Z 이후
`RESTARTS 0`** 으로 그대로입니다(저희가 3회 연속 실측). **`kubectl get pods` 로는 이 상태와
「최신 배포됨」이 구분되지 않습니다.** 저희는 **ACR 이미지 태그(= git 커밋 SHA)** 를 조회해서
배포 커밋을 확정하고 있습니다:

```bash
D=$(kubectl -n staging get pods -l app=backend \n     -o go-template='{{range .items}}{{range .status.containerStatuses}}{{.imageID}}{{end}}{{end}}' | sed 's/.*@//')
az acr manifest show-metadata --registry team4hcacr --name "backend@$D" --query tags -o tsv
#   → 2026-08-24 실측: b4615af… (origin/backend 대비 37커밋 뒤)
```

**이미지는 이미 준비돼 있으니 롤아웃 한 번이면 됩니다:**

```bash
kubectl -n staging rollout restart deployment/backend
```

### 이 한 번으로 풀리는 것 10건

| # | 계약 | 현재 배포본 동작 |
|---|---|---|
| 1 | `POST /personalization/regenerate` | **404** |
| 2 | **전역 상담** `category_code: null` | 🚨 **422** (`ChatSessionCreate` 에 `required` 가 남아 있음) |
| 3 | SSE `stage` 이벤트 | 안 옴 |
| 4 | SSE `retry` 이벤트 | 안 옴 |
| 5 | 답변 마크다운 금지 프롬프트 | 미적용 |
| 6 | `POST …/messages/{mid}/feedback` | **404** |
| 7 | `ChatMessageOut.user_rating` | 응답에 필드 없음 |
| 8 | 🚨 **타임라인 개인화가 상시 BLOCKED** | 온보딩 결과가 **카탈로그 폴백** |
| 9 | 개인화 도메인별 독립 판정 | 한쪽 실패 → 양쪽 폴백 |
| 10 | 🚨 **타임라인 개인화 저다양성 + `category_code` 오염** (PR #57) | 프로필이 달라도 **거의 동일한 타임라인** |

### 🚨 8·9·10번은 성격이 다릅니다 — 화면에서 감지되지 않습니다

1~7 은 404/미도착이라 프론트가 감지할 수 있습니다. **8·9·10 은 200 으로 정상 응답하면서 내용만 다릅니다.**

8번을 저희가 코드로 확인한 내용입니다(PR #56 이 이미 고치신 그 건입니다):

| 확인 | 결과 |
|---|---|
| 배포본 `TIMELINE_CATALOG` 의 `ETC`·`HOMENEW` 항목 수 | **0개** |
| 검증 규칙 | `validation.py:36-45` — 활성 카테고리마다 항목 ≥1건 요구 |
| 온보딩이 두 카테고리를 켜는가 | **9개 전부 켬** (`services/wedding.py:121` 주석에 명시) |
| 사용자가 빼고 시작할 수 있는가 | ❌ `WeddingCreate` 에 **카테고리 필드가 없음** |

→ 사용자 입력과 무관하게 **매번** 걸립니다. **지금 staging 에 온보딩하면 개인화 결과가 아니라
표준 카탈로그를 받습니다.** 저희가 개인화 품질을 눈으로 평가하려면 이 배포가 선행돼야 합니다.

10번(PR #57)도 결과가 같습니다 — few-shot 전량 노출로 **서로 다른 프로필의 웨딩 두 건이 67/68 항목이
동일**했던 건과, `category_code` 에 `"범용"`/`"null"` 문자열이 들어가 `validation.py:29` 에서
BLOCKED 되던 건입니다. 셋 다 **HTTP 200 + 카탈로그**로 나타나 구분되지 않습니다.

> **작은 요청 하나 (선택, 급하지 않음)** — 체크리스트는 `source_tier` 유무로 「AI 생성분 / 카탈로그
> 폴백분」을 프론트가 행 단위로 구분할 수 있는데(`schemas/checklist.py:26`), **타임라인은 그 필드가
> 없고 폴백분도 `origin="LLM"`** 이라(`services/timeline.py:35`) 구분할 방법이 전혀 없습니다.
> 그래서 타임라인 화면에는 「AI 추천」 배지를 달 수 없습니다. `TimelineItemOut` 에 판별 가능한
> 필드가 하나 있으면 좋겠지만, **차단급이 아니고 위 롤아웃이 되면 실질적으로 덜 아프므로**
> 우선순위는 낮게 봐 주셔도 됩니다.

### 함께 제안 (선택)

`:latest` + 파드 재시작 의존 구조라 **배포 시점이 우연에 맡겨져 있습니다.** 이미지 태그가 이미
git 커밋 SHA 라(저희가 배포 커밋을 실측할 때 이 점을 쓰고 있습니다) **커밋 태그로 고정**하거나
image-updater 되쓰기를 살리면 이 문제가 구조적으로 사라집니다. 판단은 인프라 담당자분께 맡깁니다.

---

## 3. ⚠️ 소셜 로그인 시 **자체 가입 계정 자동 연동** — 의도인지 확인 부탁드립니다

**한 줄**: 독스트링은 "409 로 거부한다"고 적혀 있는데 **코드는 조용히 연동**합니다. 둘 중 하나가 오타로 보입니다.

### 어긋나는 지점

`backend/app/services/oauth.py` **독스트링 5-11행**:

> *"email로 기존 계정을 찾는다 — 있으면(**자체 로그인 계정이든 다른 소셜 계정이든**) 이 provider를
> 그 계정에 연동하지 않고 **409로 거부한다.** … 이 연동 자동화는 이번 라운드 스코프 밖"*

**코드 129-140행**:

```python
if by_email is not None:
    if by_email.auth_provider is not None:
        raise api_error(409, "SOCIAL_ACCOUNT_ALREADY_LINKED", ...)   # 다른 소셜 계정 → 409 ✅
    by_email.auth_provider = provider                                # 자체 가입 계정 → 조용히 연동
    by_email.auth_provider_id = profile.provider_user_id
    ...
    return by_email
```

즉 **「다른 소셜 계정」만 409** 이고, **「자체 로그인 계정」은 독스트링과 반대로 자동 연동**됩니다.

### 왜 지금 여쭙는가 — 계정 탈취 경로가 됩니다

`services/auth.py:25-33` 의 `create_user` 가 **`email_verified_at` 을 설정하지 않고**, 저희가 찾은
범위에 **이메일 인증 흐름도 없습니다.** 즉 자체 가입 이메일은 **미검증**입니다. 그러면:

1. 공격자가 `victim@gmail.com` 으로 **자체 가입**(인증 없으므로 성공) — 비밀번호는 공격자가 압니다
2. 실제 소유자가 나중에 **구글 로그인**
3. `oauth.py:129` 가 그 계정을 찾고 `auth_provider is None` 이므로 **조용히 연동 후 로그인 성공**
4. 피해자가 쓰는 계정의 비밀번호를 **공격자도 알고 있습니다**

독스트링대로 **409 로 거부**하면 이 경로가 막힙니다. 그래서 **코드 쪽이 의도치 않은 동작 아닐까**
싶어 여쭙습니다.

한 가지 더 — `oauth.py:138-139` 가 이때 **`email_verified_at` 까지 채웁니다**:

```python
if profile.email_verified and by_email.email_verified_at is None:
    by_email.email_verified_at = datetime.now(UTC)
```

즉 위 시나리오에서 **공격자가 만든 미검증 계정이 피해자의 구글 인증을 빌려 「검증됨」으로 승격**됩니다.
`email_verified_at` 을 쓰는 곳이 아직 없어 지금 당장 새는 곳은 없어 보이지만, 나중에 이 값을 신뢰
근거로 쓰시게 되면 그때 문제가 됩니다.

> **확인 근거**: `email_verified_at` 을 채우는 코드는 `oauth.py:139`·`:148` **둘뿐**이고,
> `services/auth.py:25-33` 의 자체 가입 경로는 채우지 않습니다. `/verify`·`/confirm` 류
> 엔드포인트도 라우터 전체에 **없습니다**(저희가 못 찾은 것이면 알려 주세요).

**저희 쪽 대응은 답변에 따라 갈립니다:**
- **409 로 바꾸신다면** → 프론트가 `SOCIAL_ACCOUNT_ALREADY_LINKED` 안내 화면을 만듭니다
- **자동 연동이 의도라면** → 그대로 두고, 저희는 이 동작을 전제로 화면을 만들겠습니다
  (다만 이메일 인증 도입은 별도로 검토해 주시면 좋겠습니다)

**어느 쪽이든 프론트는 진행 가능합니다.** 방향만 알려 주시면 됩니다.

---

## 4. `APPROX_H2_THIS_YEAR` 가 **10~12월에 과거 날짜**를 저장합니다 — 🔍 **프론트가 근본 해결합니다 (요청 아님, 참고)**

**한 줄**: 10월 2일 이후에 "올해 하반기"를 고르면 **D-day 가 음수**로 시작합니다. 원인은 서버 상수이지만,
**저희가 API 두 번으로 저장 데이터까지 바로잡는 경로를 찾았습니다** — 백엔드 수정 없이 진행합니다.

### 재현

`backend/app/services/wedding.py:49-50`:

```python
if wedding_date_precision == "APPROX_H2_THIS_YEAR":
    return date(year, 10, 1)          # 조건 없이 10월 1일 고정
```

`POST /weddings` 가 이 값을 그대로 저장합니다(`services/wedding.py:87-91`, 기준 시각 **UTC**).
`DatePrecision` 은 5값이고 **`APPROX_H1_THIS_YEAR` 가 없어** "올해"를 고를 방법이 이 값뿐입니다.

**예시** — 10월 15일에 온보딩하며 "올해 하반기" 선택 →
- `wedding_date` = **14일 전** · `GET /dashboard/summary.d_day` = **음수**
- 타임라인 항목 전부 `target_date < today` → **`is_overdue=true`**, `done_so_far` 카테고리는 **전부 DONE 으로 오기록**(`services/timeline.py:31` — `target_date < today` 조건이 모든 항목에 참)

### 근본 원인

`approximate_wedding_date` 가 **오늘 날짜를 받으면서도 쓰지 않습니다** — `today` 인자는 `NO_PLAN` 의 18개월 가산에만 쓰이고, `APPROX_H2_THIS_YEAR` 분기는 `today` 와 무관하게 `10-01` 을 돌려줍니다. 「하반기」의 대표일이 **하반기 시작일**로 고정돼 있어서, 하반기에 들어선 뒤에는 정의상 과거가 됩니다.

### 🔍 프론트 쪽 해결 — 서버 계약 두 가지를 조합합니다 (코드로 확인)

| 사실 | 근거 |
|---|---|
| ① `POST /weddings` 는 `precision != EXACT` 이면 클라이언트가 보낸 `wedding_date` 를 **무시하고 서버 계산값으로 덮어씁니다** | `services/wedding.py:87-91` |
| ② `POST` 에서 `precision == EXACT` 면 보낸 `wedding_date` 를 **그대로 저장**하고, 개인화·타임라인·`done_so_far` 처리는 그 날짜로 돕니다 | `services/wedding.py:87-92, 139-145` |
| ③ `PATCH /weddings/me` 는 보낸 필드만 `setattr` 합니다 — **`wedding_date_precision` 만 보내면 `wedding_date` 는 재계산되지 않고 유지**됩니다 | `services/wedding.py:156-158` (`02` §5 에서 결함으로 적었던 바로 그 동작) |
| ④ `PATCH` 로 날짜/정밀도가 바뀌면 TODO·미수정 타임라인만 재계산하고, 그 둘만 바뀐 경우 개인화 LLM 은 호출하지 않습니다 | `services/wedding.py:164-190`, `_WEDDING_DATE_ONLY_FIELDS` (`:42`) |
| ⑤ 개인화 프롬프트는 `precision` 을 읽지 않습니다 | `app/personalization/` 에 `wedding_date_precision` 참조 0건 |

**구현(온보딩 S1)** — "올해 하반기" 를 고른 사용자에 대해:

```ts
// 1) 서버와 같은 기준(UTC)으로 오늘을 잡는다 — 서버가 datetime.now(UTC).date() 를 쓴다 (wedding.py:90)
const todayUtc = new Date(new Date().toISOString().slice(0, 10));
const y = todayUtc.getUTCFullYear();
const serverRep = new Date(Date.UTC(y, 9, 1));          // 서버 상수 10-01
const wouldBePast = todayUtc >= serverRep;              // 10-01 당일도 D-0 이라 과거 취급

// 2) 대표일: 서버 규칙(하반기 10-01)과 같은 정신으로, 남은 하반기의 중간값을 쓴다
//    - 10-01 ~ 12-14 : 12-15
//    - 12-15 이후     : 올해 선택지 자체를 숨기고 APPROX_H1_NEXT_YEAR 를 기본 제안
const repDate = wouldBePast ? new Date(Date.UTC(y, 11, 15)) : serverRep;
if (todayUtc >= repDate) hideThisYearBucket();          // 12-15~12-31 은 '올해' 불가

// 3) 저장 — 과거가 될 때만 2단계, 아니면 원래대로 1단계
if (!wouldBePast) {
  await api.post("/weddings", { ...form, wedding_date_precision: "APPROX_H2_THIS_YEAR" });
} else {
  await api.post("/weddings", {            // ② EXACT 로 보내야 날짜가 살아남는다
    ...form, wedding_date_precision: "EXACT", wedding_date: iso(repDate),
  });
  await api.patch("/weddings/me", {        // ③ precision 만 되돌린다 → 날짜 유지, LLM 미호출
    wedding_date_precision: "APPROX_H2_THIS_YEAR",
  });
}
```

이 순서를 고른 이유 — `POST`(APPROX) → `PATCH`(날짜) 순서도 저장값은 고쳐지지만, **`POST` 시점의 개인화·`done_so_far` 처리가 과거 날짜로 먼저 돌아** 위 "전부 DONE 오기록"이 남습니다(④ 재계산은 TODO 만 대상). `EXACT` 를 먼저 보내면 처음부터 맞는 날짜로 생성되고, ⑤ 덕분에 개인화 결과도 달라지지 않습니다.

**부작용과 처리**
- 두 번째 호출이 `ai_invocations` 에 `FIELD_UPDATED` 1행을 남깁니다(`wedding.py:182-191`). 무해합니다.
- `PATCH` 가 실패하면 `precision` 이 `EXACT` 로 남습니다 → 화면은 **날짜를 "12월 중순(예상)"이 아니라 정확한 날짜처럼** 보여 줍니다. 프론트는 실패 시 1회 재시도하고, 그래도 안 되면 설정 화면에서 다시 고치도록 안내합니다(데이터는 미래 날짜라 D-day 는 정상).
- 이미 과거 날짜로 저장된 기존 사용자(`wedding_date < today` 이면서 `precision != EXACT`)는 대시보드에서 감지해 **같은 `PATCH` 2단계(날짜+정밀도 함께 전송)** 로 복구 유도합니다. 이 경우 `done_so_far` 오기록은 되돌릴 수 없습니다 — 항목별 상태 수정 UI 로 사용자가 고칩니다.
- 표시 규칙은 그대로입니다 — `precision !== "EXACT"` 면 날짜 대신 라벨("올해 하반기")을 그립니다(`02` §5).

### 백엔드에 남기는 것 (선택 · 급하지 않음)

위 방식은 **동작하지만 계약의 빈틈(①③)에 기대는 우회**입니다. 여유가 있으실 때 아래 중 하나를 넣어 주시면 프론트 2단계를 걷어내겠습니다:

| 안 | 내용 |
|---|---|
| A | `approximate_wedding_date` 가 `today` 를 실제로 사용 — `APPROX_H2_THIS_YEAR` 이고 `today >= 10-01` 이면 `max(date(year,10,1), 남은 하반기 중간값)` 같은 하한 |
| B | `POST /weddings` 가 `precision != EXACT` 여도 **클라이언트가 `wedding_date` 를 보냈으면 존중**(①의 덮어쓰기를 "없을 때만 계산"으로) |

어느 쪽이든 프론트는 **바꾸지 않아도 계속 동작**합니다(2단계가 무해하게 남을 뿐).

---

## 5. RAG 재색인 CronJob — 08-24·08-25 **2연속 실패, 원인은 확인했습니다** (2026-08-25 갱신)

**한 줄**: 간헐 실패가 아니라 **결정적 실패**입니다. `cronjob.yaml` 에 OAuth 환경변수 4개만 넣어 주시면 됩니다.

```
rag-reindex-29790900     Complete  1/1  20s   (08-23 03:00)  ← 마지막 성공
rag-reindex-29792340     Failed    0/1        (08-24 03:00)  exit 1, BackoffLimitExceeded
rag-reindex-29793780     Failed    0/1        (08-25 03:00)  exit 1, BackoffLimitExceeded  (staging·production 동일)
```

**실패 파드 로그** (`az aks command invoke` 로 확인):
```
File ".../app/rag/indexing.py", line 111, in reindex → settings = get_settings()
pydantic_core.ValidationError: 4 validation errors for Settings
  google_client_id / google_client_secret / naver_client_id / naver_client_secret — Field required
```

**원인**: `core/config.py:47-50` 에서 네 값이 **기본값 없는 필수 필드**가 됐는데,
`infra/k8s/base/rag-cronjob/cronjob.yaml` 의 env 는 `DATABASE_URL`·`DATABASE_AUTH_MODE`·`AZURE_OPENAI_ENDPOINT` **3개뿐**입니다
(backend Deployment 는 12개). CronJob 도 `backend:latest` + `imagePullPolicy: Always` 라 인증 포함 이미지(`b4615af`, 08-23 20:19Z 푸시)
이후 회차는 전부 `Settings()` 에서 죽습니다 — 08-23 03:00 이 마지막 성공인 이유입니다.

**요청** (둘 중 하나):
1. `cronjob.yaml` env 에 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` 을 `backend-kv-secrets` 참조로 추가
   (SecretProviderClass 에는 이미 8개 키가 다 있습니다 — `infra/k8s/base/backend/secretproviderclass.yaml`), 또는
2. 재색인 경로가 OAuth 설정을 요구하지 않도록 `Settings` 분리(OAuth 필드 선택화).

그동안 반영되지 못한 것 — `1fd5bd9`(DS8_UGC 8건) · `454f8ea`(참가격 xlsx 2종). **코퍼스는 08-23 상태에 멈춰 있습니다.**

**저희가 이걸 신경 쓰는 이유**: 코퍼스가 얇으면 검색 0건 → `verdict: GENERAL` → **CRAG 재검색이
매번 걸립니다**(`_route_after_verify`). 상담 응답 시간과 `retry` 이벤트 빈도에 직접 영향이 있어,
저희가 로딩 UI 를 설계할 때 전제가 됩니다.

---

## (선택) 소셜 로그인 로컬 개발 환경

급하지 않습니다 — **자체 이메일 로그인(`/auth/signup`·`/auth/login`)으로 붙으면 되므로 저희는
막히지 않습니다.**

다만 상황만 공유드립니다. staging 의 `FRONTEND_BASE_URL` 이 SWA 호스트로 고정돼 있어
(`infra/k8s/overlays/backend-staging/kustomization.yaml`), OAuth 콜백이 성공하든 실패하든 그쪽으로
리다이렉트합니다(`routers/auth.py:186`, `:241`). 그래서 **`localhost:5173` 에서 시작한 소셜 로그인은
완료되지 않습니다.**

🆕 **SWA 프리뷰 배포에서도 같은 이유로 안 됩니다** — CORS 정규식은 프리뷰 접미사를 허용하는데
`FRONTEND_BASE_URL` 은 접미사 없는 호스트 고정이라 **비대칭**입니다. 소셜 로그인 E2E 를 프리뷰에서
확인하실 계획이 있다면 미리 아시는 게 좋겠습니다.

---

## 저희(프론트)가 이미 흡수하기로 한 것 — **고치지 않으셔도 됩니다**

과잉 수정을 막기 위해 적습니다. 아래는 **저희 쪽에서 처리**합니다.

| 항목 | 프론트 대응 |
|---|---|
| `stage`·`retry` 이벤트가 안 와도 동작 | 폴백 로딩 UI 유지. 오면 UX 개선 |
| `stage` 가 재검색 시 **최대 6회** 옴 | 횟수로 세지 않고 **값으로 판정**(멱등) |
| `retry` 수신 시 token 버퍼 비우기 | 필수 처리로 구현 |
| 전역 상담 422 | **카테고리 진입점부터** 구현 → 배포 무관하게 동작 |
| 챗 👍👎 404 | 배포 확인 후 붙임. `user_rating` 은 optional 로 읽음 |
| 인그레스 `proxy-read-timeout` 60초 | `done` **이벤트** 수신을 별도 플래그로 추적 · `AbortController` 를 60초보다 길게 |
| `updated_at` 이 갱신 안 됨 / `payments` 에 타임스탬프 없음 | 정렬·표시에서 사용하지 않음 |
| `ai_invocation_id` 조회 엔드포인트 없음 | 폴링하지 않음 |
| 온보딩 `POST /weddings` 가 느림 | 넉넉한 스피너 + 타임아웃 |
| `signup` 응답의 `has_wedding` 이 항상 `false` | `login`·`me` 값만 신뢰 |
| 🔍 `APPROX_H2_THIS_YEAR` 10~12월 과거 날짜 | **§4 의 2단계 저장(`POST` EXACT+대표일 → `PATCH` precision)** 으로 저장 데이터까지 교정. 12-15 이후는 '올해' 선택지 숨김 |

---

## 부록 — 전달 주신 프론트 문서의 교정 (참고용, 요청 아님)

`docs/backend_req_info/`(수신 당시 `docs/backend-request-to-frontend/`) 묶음(협업요청 448줄 개정판 + 기능명세 + API 가이드/스키마 +
목업)을 소스·배포본과 전수 대조했습니다. **화면 스펙과 SSE 시퀀스는 저희가 가진 것보다 자세하고
정확했습니다** — 특히 `FRONTEND_FUNCTIONAL_SPEC.md` 의 `stage` **정상 3회/재시도 시 6회**,
종료 이벤트 **각 1회**, `error` 후 즉시 종료는 저희 독립 검증과 그대로 일치했습니다.

아래는 **저희가 이미 반영해서 진행 중**이라 급한 요청은 아니고, **다음 판본에서 고쳐 주시면
다른 분이 같은 데 걸리지 않을 항목**입니다.

| # | 위치 | 내용 | 실측 |
|---|---|---|---|
| 1 | 협업요청 §3 | **production 호스트를 `VITE_API_BASE` 후보로 안내** | 🚨 **붙으면 안 됩니다.** `GET /health` **200** 인데 `GET /auth/me` **404** — 인증 도입 이전 커밋(`4e879fd`)이 떠 있고 ArgoCD 가 `main` 을 추적합니다. **헬스체크만 200 이라 더 위험합니다.** 그 줄 삭제 요청 |
| 2 | `FRONTEND_API_SCHEMA.md` | **챗 👍👎 평가(#33)가 없습니다** | 그 문서는 **25 paths / 32 ops**, 코드는 **26 / 33**. 그 문서의 #31 은 신고(`/feedback-reports`)로 별개 기능입니다. 그런데 협업요청 `:445-446` 이 *"이 문서(§5)에 요약만 있는 #32/#33 같은 엔드포인트의 정확한 필드는 여기(`FRONTEND_API_SCHEMA.md`)를 참고하세요"* 라고 안내해 **#33 은 없는 곳을 가리킵니다.** (`FRONTEND_API_GUIDE.md` 에는 제대로 있습니다) |
| 3 | `FRONTEND_API_GUIDE.md` | **쿠키 이름을 `session_id` 로 적었습니다** | 협업요청이 *"`wr_session` 이 맞다, `session_id` 로 잘못 적힌 곳이 3군데 있으니 헷갈리지 말라"* 고 경고한 바로 그 값입니다. 정답은 **`wr_session`** |
| 4 | 협업요청 §3 ↔ `FRONTEND_API_GUIDE.md` | **"BFF + Opaque 세션 쿠키 방식"** vs **"크로스 오리진 호출(BFF 아님)"** — 두 문서가 정면으로 어긋납니다 | 실제는 **크로스 오리진**입니다. 그리고 이게 **①번(SameSite)이 차단급인 이유**입니다 — BFF 였다면 same-site 라 `Lax` 로도 동작했을 겁니다 |
| 5 | `FRONTEND_FUNCTIONAL_SPEC.md` | *"재시도는 **세션당** 최대 1회"* | **요청(메시지)당 1회**입니다. `initial_state` 의 `"retry_count": 0` 이 메시지 전송 핸들러 안에서 매번 새로 만들어집니다(`services/chat.py:166-174`). 세션 단위로 「이미 재시도 씀」 플래그를 두면 두 번째 메시지부터 오작동합니다 |

두 가지만 덧붙입니다.

- **`FRONTEND_API_SCHEMA.md` 의 누락 원인이 문서에 이미 적혀 있습니다** — *"참고용 `openapi.json`
  스냅샷은 **캡처 시점(서버 재시작 타이밍)**에 따라 일부 엔드포인트가 누락될 수 있는 것이 실측으로
  확인됐다"*. 증상은 정확히 보셨습니다. 다만 원인은 캡처 타이밍이 아니라 **②번의 배포 구조**입니다 —
  같은 뿌리라, ②번이 해결되면 이것도 같이 없어집니다.
- 두 문서가 SSOT 로 지목한 **`docs/wedding/plan/new/03_API_spec.md`** 와, `FRONTEND_API_SCHEMA.md` 가
  같은 디렉터리에 있다고 적은 **`openapi.json`** 이 **전달본에 들어 있지 않습니다.** 프론트 쪽에서는
  펼쳐 볼 수단이 없어서, 스키마는 배포본 `openapi.json` 과 소스를 직접 읽어 확인하고 있습니다.
  다음 전달 때 함께 넣어 주시면 좋겠습니다.

---

## 정리 — 저희가 기다리는 것

1. **①번(SameSite) 수정** — `samesite="none"` 을 발급·삭제 2곳에 **명시**, 삭제 쪽 `secure=True` 동반. 저희 진행의 유일한 하드 블로커입니다(**Chromium 기준** — 범위는 §1 끝 참고)
2. **②번 롤아웃** — 코드 수정 없이 **10건**이 풀립니다
3. **③번(계정 자동 연동)은 방향만** 알려 주시면 됩니다 (어느 쪽이든 저희는 진행 가능)
4. **④번(과거 날짜)은 요청이 아닙니다** — 프론트가 §4 방식으로 흡수했습니다. 백엔드 A/B 안은 여유 있을 때 선택 사항입니다
5. **⑤번(CronJob env)** — 코퍼스가 08-23 에 멈춰 있어 상담 품질 평가의 전제가 됩니다. ②와 같은 롤아웃에 실어 주시면 좋겠습니다

①②가 되면 저희가 **브라우저에서 실제 로그인 → `/auth/me` → 온보딩 → 상담 SSE 까지 실측**하고
결과를 회신하겠습니다. 그때 남은 미측정 항목(무음 구간이 60초를 넘는지 등)도 함께 재겠습니다.

감사합니다.
