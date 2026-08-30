# 백엔드 연동 분석 — 메리맵 API

> **성격** 프론트에서 백엔드에 붙기 위해 만든 분석 문서. **2026-08-25 에 팀 공유로 전환됐다** —
> 원래는 저장소 루트 `docs/`(`.gitignore:91`)에 있어 커밋되지 않았고, 그래서 다른 PC 에서는 이 문서들이
> 아예 없었다. 지금은 `frontend/docs/backend-analysis/` 에 있고 **커밋된다.**
>
> ⚠️ **그래서 이 폴더는 이제 공개 문서다.** 시크릿·개인 메모·로컬 절대 경로를 추가하지 않는다.
>
> ⚠️ **여기 있는 것은 「조사 원본」이다.** 구현이 따라야 할 **계약의 정본은
> [`../architecture/`](../architecture/) 3종**(`backend-integration.md` · `api-contract.md` ·
> `chat-streaming.md`)과 [`../adr/0007-백엔드-연동-아키텍처를-확정한다.md`](../adr/0007-백엔드-연동-아키텍처를-확정한다.md)
> 이다. 둘이 어긋나면 그쪽이 이긴다.
>
> **분석 시점** 2026-08-24 (**3차 재분석** — 1차 `df4a8ff` · 2차 `e3496e7` · 3차 **`6c29ea0`**, 전부 같은 날)
> **코드 기준** `origin/backend` **`6c29ea0`** — ✅ 🔍 **4차(2026-08-25) 시점 로컬 워크트리(`branchs/backend_jy`, 브랜치
> `feature/linked_frontend`)도 `6c29ea0` 로 동일(behind 0)**. 3차 때의 「`e3496e7` behind 4」는 해소됐다.
> 🔍 **4차 점검(2026-08-25)** — 코드 `6c29ea0` 대비 문서 12종 전수 팩트체크. **수정 72건 / 미검증 20건**(대부분
> 클러스터·브라우저 실측 항목). 상세는 [§8 4차 점검 이력](#8-4차-점검-이력-2026-08-25) — 🚨 **신규 발견 3건**(CronJob 상시 실패 원인 확정 ·
> `PATCH /weddings` precision 변경 시 날짜 미재환산 · `region_code` 오타가 404 대신 조용한 폴백).
> ⚠️ **워크트리 경로가 `branchs/backend` → `branchs/backend_jy` 로 바뀌었다** (2026-08-24). 옛 경로를
> 쓰는 명령은 `No such file or directory` 로 죽는다 — `CLAUDE.md` §8 의 현재성 확인 명령도 해당된다.
>
> ✅ **소스 기준은 이제 최신이다.** 1차 분석(`df4a8ff`) 이후 **20커밋**(16 + 4)이 들어왔고 전부 반영했다.
> 그때 「코드에만 있다」고 적었던 4건(#52~#55)은 **이제 기준선의 일부**다.
>
> 🆕 **3차(PR #57)는 계약 표면을 하나도 안 바꿨다** — 라우터·스키마·모델·마이그레이션 diff **0**(실측).
> 수치도 전부 그대로다(엔드포인트 **35** · OpenAPI 노출 **33** · 마이그레이션 **13** · 카테고리 **9**).
> **바뀐 것은 개인화 프롬프트의 품질**뿐이고, 그게 프론트에 닿는 이유는 [`04` §5.6-c](04-ai-chat-rag.md) 에 있다.
>
> | PR | 변경 | 반영 위치 |
> |---|---|---|
> | #52 | **답변 마크다운 금지** → 평문 + 문단 분리 | [`04` §1.2-b](04-ai-chat-rag.md) |
> | #53 | **SSE `stage` 이벤트** — 🆕 3회가 아니라 **최대 6회** 온다 | [`04` §1.2-a](04-ai-chat-rag.md) |
> | #54 | **SSE `retry` 이벤트** (CRAG 재검색, 최대 1회) — 🚨 **근거 0건이면 항상 걸린다** | [`04` §1.2-a](04-ai-chat-rag.md) |
> | #55 | **`POST …/messages/{mid}/feedback`** 👍👎 평가 + `ChatMessageOut.user_rating` | [`01` §4 끝](01-endpoints.md) · [`02` §8](02-schemas.md) |
> | 🆕 #56 | **개인화 버그 3건** — `ETC`/`HOMENEW` 타임라인이 **상시 BLOCKED** 였다 | [`04` §5.6-a](04-ai-chat-rag.md) |
> | 🆕 #57 | **개인화 버그 3건 더** — few-shot 전량 노출로 **프로필이 달라도 거의 동일한 타임라인** · `category_code` 문자열 오염(**2연속 재발**) | [`04` §5.6-c](04-ai-chat-rag.md) |
>
> 🚨🚨 **배포본은 그대로다 → [`08-cluster-runtime.md`](08-cluster-runtime.md).**
> **배포본은 `b4615af`** 이고 `origin/backend` 대비 🆕 **37커밋 뒤**다(29 → 33 → **37**, 하루 사이 세 번 측정).
> 배포 갭은 🆕 **10건**으로 늘었고(6 → 9 → 10), 그중 **전역 AI상담(`category_code: null`)이 배포본에서 422** 다.
> 🆕 **ACR `latest` 이미지는 이미 `6c29ea0` 로 빌드돼 있다**(빌드 11:15:12Z) — **필요한 것은 빌드가 아니라
> 롤아웃 한 번**이다. 파드는 3차 실측에서도 **`RESTARTS 0` · 기동 08-23T20:24:43Z 불변**이다.
> 배포본 커밋은 추측할 필요가 없다 — **ACR 이미지 태그가 곧 git 커밋 SHA** 다(`08` §1.1·§8).
> **배포본 기준** `https://20-249-52-148.nip.io` (staging) · 커밋 **`b4615af`** · `openapi.json` 실측
> (2026-08-24 재수집 결과 **저장본과 바이트 단위로 동일** — paths 24 · operations 31)
> ⚠️ **production 호스트는 인증 이전 구버전**이라 프론트가 붙을 수 없다(`08` §2). 붙을 곳은 staging 하나뿐.
> **방법** 소스 전수 읽기(라우터 12 · 스키마 15 · 모델 10 · **마이그레이션 13** · RAG/개인화 10) + 배포본 HTTP 실측 + 공식 문서 팩트체크

> 🆕🆕 **2026-08-25 — 연동 대상이 staging 이 아니라 「로컬」로 바뀌었다 (사용자 결정) → [`09-local-runtime.md`](09-local-runtime.md)**
>
> 백엔드를 **WSL 에서 `localhost:8000`** 으로 직접 띄우고 거기에 붙는다. **이 문서 전체의 전제가 바뀐다** —
> 아래 §2 의 차단급 3건은 **staging 을 대상으로 했을 때의 판정**이고, 로컬에서는 성격이 다르다:
>
> | 차단급 | staging | **로컬** |
> |---|---|---|
> | ① `SameSite=Lax` | 🚨 차단 | ✅ **발생하지 않는다** — `localhost:5173`↔`localhost:8000` 은 **same-site**(MDN: *"the port number is ignored when determining the site"*) → `09` §3 |
> | ② 소셜 로그인 로컬 불가 | 🚨 SWA 로 튕김 | ⚠️ **조건은 풀렸다 — 완주는 미확인.** `config.py` 기본값·`frontend/.env.example` 둘 다 `FRONTEND_BASE_URL=http://localhost:5173` 이지만 **실행 인스턴스 실측은 아직**이고, **IdP 콘솔 콜백 등록**도 미확인 → `09` §5·§5-a |
> | ③ 배포 갭 10건 | 🚨 유효 | ⚠️ **10건 중 4건 해소 확인** — 로컬 **33 ops** vs 배포본 31 · 배포본에만 있는 것 **0개** · **전역 상담 422 해소**(`required` 비어 있음) · `user_rating` 있음. **나머지 6건은 openapi 로 안 잡혀 미확인** → `09` §2 |
>
> 🚨 **셋 다 「해결」이 아니라 「가려짐」이다.** 배포하는 순간 그대로 되살아나고, 그때는 화면이 다 만들어진
> 뒤다. **[`BACKEND_REQUEST.md`](BACKEND_REQUEST.md) 의 요청 2건(`SameSite` 수정 · 롤아웃)은 여전히 유효하다.**
> 🚨 그리고 **로컬은 `http://`** 라 `VITE_API_BASE` 의 **`https://` 강제 게이트와 정면으로 충돌한다** → `09` §7-a(결정 필요).

---

## 0. 한 줄 요약

백엔드는 **2026-08-24 에 v4.0 으로 올라가면서 인증을 재도입**했다. 프론트가 갖고 있던 전제
(「무인증 MVP · 23 REST · 시드된 단일 웨딩」)는 **전부 무효**다. 지금은 **쿠키 세션 인증 · 35 엔드포인트 ·
사용자별 웨딩 1개**이고, 로그인·온보딩 화면이 없으면 **API 의 77%(27/35)가 401 또는 404** 를 낸다
(실측 분포: `get_current_wedding` **24** · `get_current_user` **3** · 무인증 **8**).

그리고 **현재 배포본 설정으로는 프론트에서 로그인이 성립하지 않는다** — §2 를 먼저 읽을 것.

---

## 1. 무엇이 바뀌었나 — 프론트 기록 대비

| 항목 | 프론트가 알고 있던 값 (CLAUDE.md §2) | **실측 (2026-08-24)** |
|---|---|---|
| 기준 커밋 | `86fad89` | **`6c29ea0`** (PR #57 머지) |
| 인증 | **없음** (무인증 MVP) | 🚨 **있음** — 쿠키 세션 `wr_session` + 소셜 2종 |
| 엔드포인트 | 23개 | **35개** (OpenAPI 노출 33 + 비노출 2) — 🚨 **배포본은 31** |
| 웨딩 데이터 | 시드된 단일 `weddings` 행 | **사용자 1명 = 웨딩 1개** (`owner_user_id UNIQUE`) |
| 카테고리 | 7개 | **9개** (`HOMENEW`·`ETC` 신설) |
| 테이블 | 14개 | **15개** (v3 12개 DROP → v4 재생성 8 + 신규 5) |
| 상담 응답 | 미확인 | **SSE 스트리밍** (`text/event-stream`) · 이벤트 **7종** |
| 에러 포맷 | `{"error":{"code","message"}}` | 동일 (유지됨) |
| 헬스 | `GET /api/v1/health` | 동일 (유지됨) |

**결론** — `CLAUDE.md` §2 와 §6-N 의 「전송 계층 복원」 제안 A/B 는 **인증을 전제하지 않은 안**이라
그대로 쓸 수 없다. 재작성이 필요하다.

---

## 2. 🚨 착수 전 차단급 이슈 — 프론트가 혼자 못 고친다

> 🆕 **이 절은 「staging 에 붙는다」를 전제로 쓰였다 (2026-08-24).** 2026-08-25 에 연동 대상이
> **로컬**로 바뀌면서 **셋 다 로컬에서는 걸리지 않는다** — 판정과 근거는 [`09`](09-local-runtime.md).
> **삭제하지 않고 남겨 둔다.** 배포 시점에 그대로 되살아나고, 그때 다시 읽어야 하는 내용이다.

### 2-1. `SameSite=Lax` — 배포본 그대로면 로그인이 성립하지 않는다 **[확정]**

**실측** — 배포본이 실제로 내려주는 쿠키 속성(2026-08-24, `GET /api/v1/auth/google/login` 응답 헤더):

```
set-cookie: wr_oauth_state="..."; HttpOnly; Max-Age=600; Path=/; SameSite=lax; Secure
```

세션 쿠키도 같은 코드 경로에서 같은 값으로 나간다(`routers/auth.py:49-58`, `samesite="lax"`).

**공식 근거** — MDN `Set-Cookie` 의 `SameSite=Lax` 정의:

> Send the cookie only for requests originating from the same site that set the cookie, and for
> cross-site requests that meet both of the following criteria:
> - The request is a top-level navigation … **This would exclude, for example, requests made using
>   the `fetch()` API**, or requests for subresources from `<img>` or `<script>` elements …
> - The request uses a safe method: in particular, this excludes `POST`, `PUT`, and `DELETE`.
>
> — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie

**귀결** — 프론트 오리진(`polite-island-….azurestaticapps.net` 또는 `localhost:5173`)과 백엔드
오리진(`20-249-52-148.nip.io`)은 등록 도메인이 완전히 달라 **cross-site** 다. 따라서:

- 소셜 로그인의 **쿠키 설정까지는 성공한다** — IdP → 백엔드 콜백이 top-level 네비게이션이라서.
- 하지만 그 뒤 SPA 가 부르는 **모든 `fetch` 에 쿠키가 실리지 않는다** → `GET /auth/me` 부터 401.
- `credentials: "include"` 를 넣어도, CORS 가 허용해도 **소용없다.** 브라우저가 쿠키를 붙이는 단계
  자체를 건너뛴다.

**필요한 수정 — 백엔드 1줄.** `backend/app/routers/auth.py:56` 의 `samesite="lax"` → `"none"`.
MDN: *"Send the cookie with both cross-site and same-site requests. The `Secure` attribute must also
be set when using this value."* — 이미 `secure=True` 라 조건은 충족한다.

> **~~아직 확인 안 된 것~~ → 절반 해소 (2026-08-24 재실측).** 위 `set-cookie` 는 `wr_oauth_state` 를
> 실측한 것이었다. 그 뒤 **DB 를 건드리지 않고 `wr_session` 을 직접 보는 길**을 찾았다 —
> `POST /api/v1/auth/logout` 을 **쿠키 없이** 부르면 세션 폐기 없이(=DB 쓰기 없이) 204 와 함께
> 삭제 쿠키가 나온다:
>
> ```
> HTTP/1.1 204 No Content
> set-cookie: wr_session=""; expires=…; Max-Age=0; Path=/; SameSite=lax
> ```
>
> **확인된 것** — 쿠키 이름이 `wr_session` 이 맞다(`03_API_spec.md` 의 `session_id` 는 드리프트).
> **확인되지 않은 것** — 이 헤더는 `_set_session_cookie` 가 아니라 `delete_cookie` 가 만든 것이라
> 그 속성은 **세션 쿠키의 속성이 아니다**(Starlette 기본값). 세션 쿠키의 `samesite="lax"` 근거는
> 여전히 소스(`routers/auth.py:56`)다.
>
> 🆕 **대신 새 결함이 드러났다** — 저 삭제 쿠키에 **`Secure` 가 없다.** `delete_cookie` 를 인자 없이
> 부르기 때문이다(`routers/auth.py:121`). `samesite` 를 `none` 으로 고칠 때 **로그아웃 쪽도 함께**
> 맞춰야 한다. → [`07`](07-collaboration-request-review.md) §1-1

### 2-2. 소셜 로그인은 로컬(`localhost:5173`)에서 완료되지 않는다 **[확정]**

staging 백엔드의 `FRONTEND_BASE_URL` 이 **SWA 로 고정**돼 있다
(`infra/k8s/overlays/backend-staging/kustomization.yaml:33-39`):

```
OAUTH_BACKEND_BASE_URL = https://20-249-52-148.nip.io
FRONTEND_BASE_URL      = https://polite-island-0bb189700.7.azurestaticapps.net
```

OAuth 콜백은 성공하든 실패하든 **이 값으로 리다이렉트한다**(`routers/auth.py:186`, `:241`).
`localhost:5173` 에서 소셜 로그인을 시작하면 **SWA 로 튕겨 나가고 로컬 창은 영영 로그인되지 않는다.**

**우회 없음.** 셋 중 하나가 필요하다 — ① 백엔드를 로컬에서 직접 실행(기본값이 `localhost:5173`)
② 백엔드 담당자에게 별도 환경 요청 ③ **자체 이메일 로그인(`/auth/signup`·`/auth/login`)으로 먼저 붙인다**
(리다이렉트가 없어 이 제약을 안 받는다 — 현실적으로 이게 답).

### 2-3. 개인화 재생성 엔드포인트가 배포본에 없다 **[확정 — 단 성격이 바뀌었다]**

**실측** — `POST /api/v1/personalization/regenerate` → **404** (대조군: `/api/v1/categories` → 200,
없는 경로 → 404).

코드에는 있다(`routers/personalization.py`, `main.py` 에 등록됨, 커밋 `3e988c2` / PR #46).

> ✅ **원인 규명됨 (2026-08-24 클러스터 실측, `08` §1)** — 이건 **배포 설정 누락이 아니라 단순 배포 지연**이다.
> 배포본은 `b4615af` 인데 `3e988c2` 는 그보다 **뒤** 커밋이다. **백엔드가 고칠 것은 없고, 파드를 굴리면 해소된다.**
> 따라서 「차단급 3건」 중 이 항목만은 **백엔드 수정 요청이 아니라 배포 요청**이다.
>
> 🆕 **그리고 이 요청 하나가 9건을 함께 푼다** (2026-08-24 재측정). ACR `latest` 는 이미 최신
> 커밋으로 빌드돼 있으므로 **`kubectl -n staging rollout restart deployment/backend` 한 번**이면 된다.
> 전수는 [`08` §3](08-cluster-runtime.md).

---

## 3. 코드 ↔ 배포본 차이 — 정확한 경계

> 🚨 **전수는 [`08` §3](08-cluster-runtime.md) 을 본다.** 배포본은 코드 기준보다 🆕 **37커밋 뒤**이고
> **동작 차이는 10건**이다(2026-08-24 하루 동안 6 → 9 → 10).

| | 코드(`6c29ea0`) | 배포본 = **`b4615af`** |
|---|---|---|
| 총 엔드포인트 | **35** | **33** |
| OpenAPI 노출 | **33** | **31** (실측 — 재수집에서도 변동 없음) |
| 비노출(OAuth 2개) | 2 | **2** (실측 307) |
| 개인화 재생성 | 있음 | ❌ **404** |
| 🆕 챗 👍👎 평가 | 있음 | ❌ **404** |
| **전역 상담 `category_code: null`** | 있음 | 🚨 **422** — `required` 로 남아 있다 (`08` §3.1) |
| 🆕 `ChatMessageOut.user_rating` | 있음 | ❌ 응답에 **필드 없음** |
| 🆕 SSE `stage`·`retry` 이벤트 | 있음 | ❌ 안 옴 |
| 🆕 개인화 `ETC`/`HOMENEW` 타임라인 | 정상 | 🚨 **상시 BLOCKED → 카탈로그 폴백** |
| 🆕 타임라인 개인화 **다양성** | 정상 | 🚨 **프로필이 달라도 거의 동일**(67/68 일치 사례) |
| 소셜 구글/네이버 | 있음 | ✅ **307** (실측) |
| 소셜 카카오 | 없음 | ❌ 404 (코드와 일치 — `SUPPORTED_PROVIDERS = ("GOOGLE","NAVER")`) |

**엔드포인트 수 차이는 2개**(개인화 재생성 + 챗 평가). 33 − 31 = 2 로 수치가 맞고 404 실측으로도 확인된다.
🚨 **「수가 같다 = 계약이 같다」가 아니다** — 전역 상담·`user_rating`·SSE 이벤트처럼 **스키마/스트림만
바뀐 변경은 개수에 안 잡힌다.** 그리고 **개인화 폴백은 200 으로 정상 응답하면서 내용만 다르다** —
개수로도 상태코드로도 안 잡히는 유일한 종류다(`08` §3, 7~10번).
🚨 **게다가 타임라인은 행 단위로도 구분이 안 된다** — 응답에 `source_tier` 가 없고 폴백분도
`origin="LLM"` 이다([`04` §5.6-b](04-ai-chat-rag.md) 실측). 체크리스트만 구분된다.

### ⚠️ OpenAPI 로 클라이언트를 생성하면 안 되는 이유 2가지 **[실측]**

1. **`securitySchemes` 가 아예 없다.** 쿠키 인증이 `Depends(get_current_user)` 안에서
   `request.cookies` 를 직접 읽는 방식이라 스펙에 인증 정보가 **하나도 안 나타난다.**
   생성된 클라이언트는 **35개 중 27개**가 인증이 필요하다는 사실을 모른다.
2. **OAuth 2개가 `include_in_schema=False`** 라 스펙에서 통째로 빠진다. `/docs` 만 보고 만들면
   소셜 로그인이 존재하지 않는 것처럼 보인다.

---

## 4. 문서 지도

| 파일 | 내용 |
|---|---|
| [`01-endpoints.md`](01-endpoints.md) | **엔드포인트 35개 전수** — 경로·파라미터·요청/응답 스키마·**인증 의존성**·에러코드 |
| [`02-schemas.md`](02-schemas.md) | **필드 수준 스키마 사전** — TS 타입으로 옮길 수 있는 수준. Literal 값 목록 전부 |
| [`03-data-model.md`](03-data-model.md) | 테이블 15개·관계도·제약·**마이그레이션 13개**·**v3→v4 전환** |
| [`04-ai-chat-rag.md`](04-ai-chat-rag.md) | **SSE 상담 계약**·RAG 검색·인용/verdict·개인화·지연 특성·실패 모드 |
| [`05-auth-cors-deploy.md`](05-auth-cors-deploy.md) | **인증 플로우 전체**·쿠키 계약·CORS·환경변수·에러 카탈로그·배포 |
| [`06-deployed-contract.md`](06-deployed-contract.md) | 배포본 `openapi.json` 실측 덤프(엔드포인트 31 + 스키마 49) |
| **[`07-collaboration-request-review.md`](07-collaboration-request-review.md)** | 🆕 **백엔드 전달 문서 교차검증** — 구판 403줄본 교정 17건(차단급 3) · 돌려줄 요청 · 🆕 **§8 새 전달본(448줄 개정판 + 문서 4종) 검증** — 「staging 최신 이미지」 반증 · production 호스트 함정 · 누락/내부모순 4건 · **맞다고 확인된 SSE 서술** |
| **[`08-cluster-runtime.md`](08-cluster-runtime.md)** | **AKS 클러스터 실측** — **배포본의 정체(`b4615af`, 🆕 37커밋 뒤)** · production 이 구버전인 이유 · **인그레스 SSE 통과 확인 + `proxy-read-timeout 60s`** · 주입된 환경변수 · TLS 자동갱신 · 🆕 **배포 갭 10건 전수** |
| 🆕 **[`09-local-runtime.md`](09-local-runtime.md)** | 🆕 **로컬 백엔드 실측 (2026-08-25 · 연동 대상)** — `08` 의 짝. Windows→WSL 도달성 · **로컬 33 ops vs 배포본 31 차집합** · 🔑 **`SameSite=Lax` 가 로컬에선 안 걸리는 근거**(포트는 site 정의 밖) · **`Secure` 쿠키의 localhost 예외** · `OAUTH_BACKEND_BASE_URL` 반영 실측 · 🚨 **로컬이 가리는 것 3가지** · `https://` 게이트 충돌 |
| `FRONTEND_COLLABORATION_REQUEST.md` | 백엔드 작성자가 전달한 원본 **구판(403줄)**. **단독으로 신뢰하지 말 것** — 반드시 `07` 과 함께 읽는다. 🆕 **448줄 개정판이 따로 도착했다**(문서 4종 + 목업과 함께) — 교차검증은 [`07` §8](07-collaboration-request-review.md). 🔍 **원본 묶음 위치 확정(2026-08-25): `docs/backend_req_info/`** — 6개 파일 전부 백업본과 바이트 동일, 07 §8 판정·줄 번호 그대로 유효. 구현 때 펼쳐 볼 파일 표는 `07` §8.1 끝 |
| 📁 `../backend_req_info/` | 🔍 **백엔드가 전달한 원본 묶음 6종**(협업요청 448줄 개정판 · 기능명세 602줄 · 요구사항 200줄 · API 가이드 154줄 · API 스키마 1380줄 · 통합 목업 HTML). **이 원본 묶음은 저장소 밖에 있다**(사용자 백업 경로). 이 저장소에는 들어오지 않았다. 판정은 `07` §8 을 따른다 — 「배포 완료」 주장은 반증됐고(§8.3), 쿠키 이름·재시도 단위·#33 부재 등 4건이 틀렸다(§8.6) |
| **[`BACKEND_REQUEST.md`](BACKEND_REQUEST.md)** | 🆕 **백엔드에 보낼 요청 문안** (2026-08-24) — 차단급 1(SameSite — 🔍 `samesite="none"` 명시 표) · 배포 1(롤아웃→🆕 **10건**) · 확인 1(계정 자동연동) · 🔍 참고 1(날짜 — **프론트 2단계 저장으로 흡수**, 요청 철회) · 운영 1(CronJob 원인 확정). **인용 전부 `6c29ea0` 기준 실측 대조 완료** |
| 🆕 **[`BACKEND_REQUEST-2026-08-30-chat-session-delete.md`](BACKEND_REQUEST-2026-08-30-chat-session-delete.md)** | ✅ **닫힘 (2026-08-30)** — 요청 1건(`DELETE /api/v1/chat/sessions/{id}`)을 **요청한 계약 그대로** 받았고(204 · 봉투 형식 404 `CHAT_SESSION_NOT_FOUND` · cascade), 판단 2건도 결정됐다(**하드 삭제** · `feedback_reports` 끊긴 참조 감수). **프론트 변경 0** — §6 회신 요약에 대조표가 있다.<br>🚨 **머지·배포는 아직 전이다** — §4 배포 순서(백엔드 먼저)가 그대로 유효.<br>⚠️ **§2 에 사실 오류 1건이 있었고 백엔드가 잡아 줬다**(소프트 삭제 시 `deleted_at IS NULL` 이 「두 곳」이 아니라 **네 곳** — `rate_chat_message`·`target_exists_for_wedding` 이 `get_chat_session` 을 안 거치고 `ChatSession` 을 직접 조인한다). 정정을 그 자리에 붙였다. 🔍 `user_rating` 표본 손실 우려는 **기각**(소비처 0건, 대시보드는 Langfuse Score 를 읽는다) |
| `openapi.deployed.json` | 원본 스펙 (45,796 B) |

---

## 5. 팩트체크 근거 — 공식 문서

프론트 구현을 실제로 가르는 주장은 전부 1차 출처로 확인했다.

| 주장 | 출처 | 결과 |
|---|---|---|
| `SameSite=Lax` 는 cross-site `fetch()` 에 쿠키를 안 보낸다 | [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) | ✅ 확인 — `fetch()` 를 명시적으로 제외 |
| `SameSite=None` 은 `Secure` 필수 | 같은 문서 | ✅ 확인 |
| credentials 요청에 `Access-Control-Allow-Origin: *` 불가 | [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) | ✅ 확인 — Allow-Headers/Allow-Methods 도 `*` 불가 |
| 백엔드 CORS 가 그 규칙을 지키는가 | 배포본 프리플라이트 실측 | ✅ **문제 없음** — `*` 가 아니라 명시 목록으로 응답한다(아래) |
| SSE 필드는 `event`/`data`/`id`/`retry` | [WHATWG HTML §SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html) | ✅ 확인 |
| 재연결 시 `Last-Event-ID` 는 `id` 를 받았을 때만 전송 | 같은 명세 | ✅ 확인 → **백엔드는 `id` 를 안 보내므로 재개 불가** |
| `EventSource` 로 POST 를 못 한다 | [MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) · [MDN Using SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) | ⚠️ **표현 주의** — 명세가 "GET 전용"이라고 쓰진 않는다. 확인된 사실은 **생성자가 `(url, {withCredentials})` 만 받아 메서드·본문·헤더를 지정할 방법이 없다**는 것, 그리고 MDN 의 *"This is a one-way connection, so you can't send events from a client to a server."* 다. 결론(= `fetch` 를 써야 한다)은 같다 |
| 🆕 리듀서 없는 LangGraph state 키는 **덮어쓰기**다 (→ 재검색 시 `citations` 가 2차 결과만 담는 근거) | [LangChain Docs · Use the graph API](https://docs.langchain.com/oss/python/langgraph/use-graph-api) | ✅ 확인 — *"By default, this will **overwrite** the value of the corresponding key."* `ChatState` 7필드에 `Annotated` 0건 |
| 🆕 `stream_mode="values"` 는 **매 스텝 후 전체 상태**를 흘린다 (→ `final_state` 가 마지막 스냅샷인 근거) | [LangChain Docs · Streaming](https://docs.langchain.com/oss/python/langgraph/streaming) | ✅ 확인 — *"stream the **full state** of the graph after each step"* |
| 🆕 `CHECK (col IN (...))` 는 **NULL 을 막지 않는다** (→ `user_rating` 미평가 상태가 존재하는 근거) | [PostgreSQL §5.4.1](https://www.postgresql.org/docs/current/ddl-constraints.html) | ✅ 확인 — *"a check constraint is satisfied if the check expression evaluates to true **or the null value**"* |
| 🆕 인그레스 기본값 `proxy-read-timeout 60` · `proxy-buffering "off"` | [ingress-nginx ConfigMap](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/) | ✅ **재확인** — `proxy-send-timeout` 도 `60`, `proxy-body-size` `"1m"` |
| 🆕 **Azure OpenAI JSON 모드는 스키마를 보장하지 않는다** (→ `"category_code": "범용"` 이 통과한 근거, PR #57) | [MS Learn · JSON mode](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/json-mode) | ✅ 확인 — *"JSON mode guarantees valid JSON output, but it doesn't guarantee the output matches a specific schema."* 스키마 보장이 필요하면 **Structured Outputs** 를 쓰라고 명시. 백엔드는 `json_object` 사용 |
| 🆕 **잘린 응답은 `finish_reason` 으로 걸러야 한다** (→ 백엔드 미검사 확인) | 같은 문서 | ✅ 확인 — *"You should check `finish_reason` for the value `length` before parsing the response."* 🚨 **코드 전체에 검사 0건**(`6c29ea0` 실측) → [`04` §9-11](04-ai-chat-rag.md) |
| 🆕 JSON 모드는 메시지에 `json` 단어가 없으면 **400** 이다 | 같은 문서 | ✅ 확인 — 단 **백엔드는 세 분기 모두 충족**한다(`prompts.py:184,189,192` 가 *"응답은 JSON으로만 답하세요"* 를 붙인다). **문제 없음** |
| 🆕 🚨 **`SameSite=None` 으로 고쳐도 Safari 는 안 된다** (→ §6-C 승격 근거) | [WebKit · Tracking Prevention](https://webkit.org/tracking-prevention/) | ✅ 확인 — *"**ITP by default blocks all third-party cookies. There are no exceptions to this blocking.**"* · 접근은 **Storage Access API** 로만 |
| 🆕 Chrome 은 서드파티 쿠키를 **기본 차단하지 않는다** · Firefox 는 **사이트별 분리 저장소** | [MDN · Third-party cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies) · [MDN · Storage Access API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_Access_API) | ✅ 확인 — Chrome *"only in Incognito mode, or when users explicitly set it"* · Firefox *"a separate cookie jar per site"* · first-party 로 심은 쿠키는 third-party 문맥에서 **자동으로 안 보인다** → [`05` §3.3-a](05-auth-cors-deploy.md) |
| 🆕 **`imagePullPolicy: Always` 는 「컨테이너가 뜰 때만」 당긴다** (→ 「1/1 Running = 최신 이미지」가 틀린 근거) | [Kubernetes · Images](https://kubernetes.io/docs/concepts/containers/images/) | ✅ 확인 — *"every time the **kubelet launches a container**, the kubelet requests the container runtime to pull the image"* · *"You should **avoid using the `:latest` tag** … harder to track which version of the image is running"* → [`07` §8.3](07-collaboration-request-review.md) |
| 🆕 **포트는 site 정의에 들어가지 않는다** (→ `localhost:5173`↔`localhost:8000` 이 **same-site** 인 근거, `09` §3) | [MDN Glossary · Site](https://developer.mozilla.org/en-US/docs/Glossary/Site) | ✅ 확인 — *"These are considered the same site because **the port number is ignored when determining the site**"*. 스킴은 들어가지만(*schemeful same-site*, *"applied in the rules for handling `SameSite` cookies"*) **로컬은 양쪽 다 `http`** 라 동일 |
| 🆕 **`Secure` 쿠키는 `http://localhost` 에서도 저장된다** (→ 로컬에서 `secure=True` 를 고칠 필요가 없는 근거, `09` §4) | [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) | ✅ 확인 — *"Insecure sites (`http:`) cannot set cookies with the `Secure` attribute. **The `https:` requirements are ignored when the `Secure` attribute is set by localhost.**"* |
| Azure SWA Linked Backend 가 AKS 를 지원하지 않는다 | [MS Learn](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-overview) | ✅ 확인 — 지원 목록은 Functions/APIM/App Service/Container Apps **4종뿐**이고 Bring-your-own 은 **Standard 플랜 전용**. 백엔드가 CORS 를 쓰는 이유가 정당함 |

**배포본 CORS 프리플라이트 실측** (SWA 오리진, 2026-08-24):

```
HTTP/1.1 200 OK
access-control-allow-origin: https://polite-island-0bb189700.7.azurestaticapps.net
access-control-allow-credentials: true
access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
access-control-allow-headers: content-type
access-control-max-age: 600
```

백엔드 설정은 `allow_methods=["*"]` 지만 Starlette 가 credentials 모드에서 **명시 목록으로 전개**해
내보낸다 — MDN 이 금지한 와일드카드 응답이 아니다. **CORS 자체는 문제없다.**

---

## 6. 사용자(결정자)에게 남기는 확인 요청

> 📤 **백엔드로 보낼 문안은 [`BACKEND_REQUEST.md`](BACKEND_REQUEST.md) 에 작성돼 있다.** 아래 표의
> 2·3·4·5 번이 그 문서의 1·2·3·4 번에 대응한다. **발신 시점은 사용자(결정자) 판단이다.**

임의로 진행하지 않고 남겨 둔 것들이다.

| # | 항목 | 왜 내가 못 하는가 |
|---|---|---|
| 1 | ~~**`wr_session` 쿠키 속성 실측**~~ → **절반 해소 (2026-08-24)** — 쿠키 **이름**은 로그아웃 응답으로 DB 를 안 건드리고 확인했다(§2-1). 남은 것은 **세션 쿠키 자체의 속성**이고, 그건 여전히 로그인 성공이 필요해 **운영 DB 에 계정이 생긴다.** 승인 없이 안 했다 | 공용 인프라 변경 |
| 2 | **`SameSite=Lax` → `None` 백엔드 수정 요청** | 백엔드 소유 파일이다. 프론트가 고칠 수 없고 고쳐서도 안 된다(§2-1) |
| 3 | **staging 재배포 요청** — 개인화 재생성 1건이 아니라 **9건**이 대기 중이다(`08` §3) | 인프라/백엔드 소관(§2-3) |
| 4 | **소셜 로그인 로컬 개발 환경** | `FRONTEND_BASE_URL` 은 백엔드 배포 설정(§2-2) |
| 5 | `services/oauth.py:130` 자체계정 자동 연동이 의도인지 | 독스트링은 "409 거부", 코드는 "조용히 연동" — **문서와 코드가 어긋난다.** 백엔드 담당자 확인 필요 |
| 6 | `backend/.env.example` 대조 | `secret-file-guard` 훅이 차단한다. 필요하면 사용자가 직접 확인 |
| 🆕 7 | **`VITE_API_BASE` 의 `https://` 강제 게이트를 로컬 `http://` 에 어떻게 열 것인가** (`09` §7-a) | 게이트 완화는 **절차 규제 변경**이라 결정자 몫(`CLAUDE.md` §5.8-4). 실제 사고(§5.11)를 막던 장치라 임의로 못 푼다 |
| 🆕 8 | **IdP(구글·네이버) 콘솔에 `http://localhost:8000/api/v1/auth/*/callback` 등록** (`09` §5) | 콘솔은 프론트 소관이 아니다. 미등록이면 소셜 로그인이 **IdP 단계에서** `redirect_uri_mismatch` 로 멈춘다 |
| 🔍 9 | **`PATCH /weddings` 로 `wedding_date_precision` 만 바꾸면 `wedding_date` 가 재환산되지 않는다**(`services/wedding.py:153-158`, `02` §5) — 의도인지 확인. ⚠️ **단, 프론트는 이 동작에 의존한다**(`BACKEND_REQUEST` §4 의 2단계 저장이 이 유지 동작을 전제) — 백엔드가 「재환산」으로 바꾸면 그 우회가 깨지므로 **바꾸기 전에 알려 달라**고 요청할 것 | 백엔드 서비스 로직 소관 |
| 🔍 10 | **`region_code` 무효값이 422/404 가 아니라 `NON_METRO → NATIONWIDE` 로 조용히 폴백**(`services/benchmark.py:22-31`, `02` §15.4) — 프론트는 17값 Literal 로 좁혀 보내는 것 외 방어 수단이 없다 | 백엔드 검증 소관 |

---

## 7. 이 문서의 갱신

백엔드는 **오늘 하루에만 v4.0 전환 + 다수 커밋**이 들어갔을 만큼 빠르게 움직인다. 아래로 현재성을 확인한다.

> 🆕 **연동 대상이 로컬이면 먼저 이것부터** (2026-08-25). 아래 staging 명령들은 **배포 시점에나
> 의미가 있다** — 지금 붙는 곳은 `localhost:8000` 이다. 전체 명령은 [`09` §8](09-local-runtime.md).
>
> ```bash
> curl -sS -m 5 -o /dev/null -w '%{http_code}\n' http://localhost:8000/api/v1/health   # → 200
> curl -sS -D - -o /dev/null http://localhost:8000/api/v1/auth/google/login | grep -i '^location'
> #   → redirect_uri 에 localhost:8000 이면 OAUTH_BACKEND_BASE_URL 반영됨
> curl -sS -D - -o /dev/null "http://localhost:8000/api/v1/auth/google/callback?error=denied" | grep -i '^location'
> #   → http://localhost:5173/login?oauth_error=denied 여야 로컬에서 소셜 로그인 완주가 가능하다
> ```

```bash
# 백엔드가 움직였는가 — ⚠️ 경로는 backend_jy 다(backend 아님, 2026-08-24 변경)
cd C:/programming/sesac-third-project/branchs/backend_jy && git fetch origin backend --quiet
git log --oneline origin/backend -5
git rev-list --count HEAD..origin/backend      # 0 이 아니면 이 문서의 기준이 낡았다는 뜻

# 프론트 계약에 닿는 파일만 골라 본다 (기준 커밋은 README 머리말의 HEAD)
git diff --stat 6c29ea0 origin/backend -- backend/app/schemas/ backend/app/routers/ backend/app/models/ backend/alembic/
#   → 비어 있으면 계약 표면 무변경. 비어 있어도 rag/·personalization/ 변경은 "동작"을 바꾼다
#     (PR #56·#57 전례 — #57 은 이 diff 가 완전히 비었는데도 배포 갭이 1건 늘었다)

# 배포본이 코드를 따라왔는가 (31 이면 개인화 미배포)
curl -s https://20-249-52-148.nip.io/openapi.json > /tmp/o.json
wsl -e python3 -c "import json;d=json.load(open('/tmp/o.json'));print(sum(1 for p in d['paths'] for m in d['paths'][p] if m in ('get','post','put','patch','delete')))"

# SameSite 가 고쳐졌는가 (none 이면 §2-1 해소)
curl -s -D - -o /dev/null https://20-249-52-148.nip.io/api/v1/auth/google/login | grep -i set-cookie

# wr_session 쪽 — 쿠키 없이 로그아웃하면 DB 를 안 건드리고 삭제 쿠키 헤더만 본다
curl -s -D - -o /dev/null -X POST https://20-249-52-148.nip.io/api/v1/auth/logout | grep -i set-cookie
#   → Secure 가 붙어 있고 SameSite=none 이면 delete_cookie 쪽도 고쳐진 것이다(05 §3.3)

# 개인화 재생성이 배포됐는가 (404 면 아직)
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://20-249-52-148.nip.io/api/v1/personalization/regenerate
```

**2026-08-24 재실측 결과 (1차)** — 배포 엔드포인트 **31**(변동 없음) · `personalization/regenerate`
**404**(여전히 미배포) · `wr_session` **`SameSite=lax`, `Secure` 없음**(§2-1 미해소) ·
`GET /categories`·`GET /vendor-cases?category_code=VENUE` 쿠키 없이 **200**(공개 확인) ·
`GET /auth/me`·`GET /benchmarks/total-average` **401**.

**🆕 2026-08-24 재실측 결과 (2차 — 소스가 16커밋 움직인 뒤)**

| 항목 | 값 | 판정 |
|---|---|---|
| `origin/backend` HEAD | `df4a8ff` → **`e3496e7`** | 소스 16커밋 전진 |
| 배포본 커밋 (ACR 태그) | **`b4615af`** (불변) | 🚨 격차 29 → **33** |
| 파드 기동 시각 / 재시작 | 2026-08-23T20:24:43Z / **RESTARTS 0** | 불변 |
| ACR `latest` | `83d5f4c` → 🆕 **`e3496e7`** (10:42:44Z) | **이미지는 준비됨** |
| 배포본 `openapi.json` | paths **24** · ops **31** · 45,796 B | **저장본과 diff 0건** |
| 배포본 `ChatSessionCreate` | `"required": ["category_code"]` | 🚨 전역 상담 **422 유지** |
| 배포본 `ChatMessageOut` | `user_rating` **없음** | 🚨 미배포 확인 |
| 인그레스 ConfigMap | **`data` 키 자체 없음** · controller **v1.15.1** | 기본값 유지 (§`08` 4) |
| `backend-staging-tls` | `notAfter` 11-19 · **`renewalTime` 2026-10-20** | ✅ 자동 갱신 유지 |
| staging env (15개) | `SESSION_*`·`CORS_*` **여전히 미주입** | ✅ `wr_session`/30일 확정 유지 |
| `rag-reindex` CronJob | 최근 4회 중 **3 성공 / 1 실패**(08-24 03:00) | ~~⚠️ 상시 실패 아님~~ → 🔍 **4차에서 재정정: 08-25 03:00 도 실패, 원인 확정** (`08` §7) |

**🆕 2026-08-24 재실측 결과 (3차 — 소스가 4커밋 더 움직인 뒤, PR #57)**

| 항목 | 값 | 판정 |
|---|---|---|
| `origin/backend` HEAD | `e3496e7` → **`6c29ea0`** | 소스 4커밋 전진 (PR #57) |
| 계약 표면 diff (`routers`/`schemas`/`models`/`alembic`) | **0 파일** | ✅ **무변경** — 01~03·05 내용 불변 |
| 바뀐 파일 | `personalization/prompts.py` + 그 테스트 **둘뿐** | 동작만 변경 |
| 엔드포인트 재측정 | **35** (노출 33 · 비노출 2) | 불변 |
| 마이그레이션 / 스키마 / 모델 / 카테고리 | **13 / 15 / 10 / 9** | 전부 불변 |
| 배포본 커밋 (ACR 태그) | **`b4615af`** (불변) | 🚨 격차 33 → **37** |
| 파드 기동 시각 / 재시작 | 2026-08-23T20:24:43Z / **RESTARTS 0** | 불변 (3회 연속) |
| ACR `latest` | `e3496e7` → 🆕 **`6c29ea0`** (11:15:12Z · `sha256:fbbfac142061…`) | **이미지는 또 준비됨** |
| 배포 갭 | 9건 → 🆕 **10건** | `08` §3 |

> **읽는 법** — 계약 표면 diff 가 **0인데 배포 갭이 늘었다.** 「스키마가 안 바뀌었으니 볼 것 없다」가
> 성립하지 않는 사례다. `personalization/`·`rag/` 는 **응답 스키마를 그대로 두고 내용만 바꾸므로**,
> 현재성 확인 때 이 두 디렉터리는 **diff 여부와 무관하게 커밋 로그를 읽어야 한다.**

### 🆕 배포본이 **어느 커밋인지**는 이제 실측할 수 있다 (kubelogin 필요)

위 명령들은 전부 「배포본이 이렇게 **행동한다**」만 본다. **어느 커밋인지**는 클러스터에 물어야 한다.
`git rev-list --count HEAD..origin/backend` 는 **로컬 워크트리**가 얼마나 뒤처졌는지일 뿐
**배포본과는 무관하다** — 이 둘을 혼동해서 「배포본 = `df4a8ff`」로 12시간을 잘못 적었다.

```bash
# 배포본 커밋 (ACR 태그 = git SHA)
D=$(kubectl -n staging get pods -l app=backend \
     -o go-template='{{range .items}}{{range .status.containerStatuses}}{{.imageID}}{{end}}{{end}}' | sed 's/.*@//')
az acr manifest show-metadata --registry team4hcacr --name "backend@$D" --query tags -o tsv
#   → 2026-08-24 실측: b4615afffcb6b6d4e53e6902689003d180035831 (= b4615af)

# 그 커밋이 origin/backend 에서 몇 커밋 뒤인가
cd C:/programming/sesac-third-project/branchs/backend_jy && git fetch origin backend --quiet
git rev-list --count b4615af..origin/backend      # → 2026-08-24 실측: 29 → 33 → 37 (계속 벌어지는 중)

# ACR latest 가 어느 커밋으로 빌드돼 있나 (= 롤아웃만 하면 올라갈 커밋)
az acr manifest list-metadata --registry team4hcacr --name backend --orderby time_desc --top 5 \
  --query "[].{created:createdTime,tags:join(',',tags)}" -o tsv   # → 2026-08-24: 6c29ea0…,latest
#   ⚠️ 함정: `tags:tags` 를 `-o tsv` 로 뽑으면 태그 이름이 아니라 **배열 길이(1/2)** 가 찍힌다.
#      tsv 로 볼 땐 반드시 `join(',',tags)`, 아니면 `-o json` 을 쓴다. (2026-08-24 실제로 걸렸다)
#   ⚠️ `show-metadata --name backend:latest` 는 tags 가 null 로 나오는 경우가 있다 —
#      다이제스트로 조회(`backend@sha256:…`)하거나 위 list-metadata 를 쓴다.
```

**🔍 2026-08-25 재실측 결과 (4차 — 08:43Z, 로컬 `kubectl` 없음 → `az aks command invoke`·`az acr`·`curl`)**

| 항목 | 값 | 판정 |
|---|---|---|
| `origin/backend` HEAD / 로컬 워크트리 | **`6c29ea0`** / **`6c29ea0`** (behind 0) | 소스 무변경 · 로컬 동기화 완료 |
| 배포본 커밋 (staging 파드 imageID) | **`b4615af`** · 기동 2026-08-23T20:24:43Z · RESTARTS 0 | 🚨 **4회 연속 불변**, 격차 **37** 유지 |
| ACR `latest` | **`6c29ea0`** (11:15:12Z) | 그대로 — 롤아웃만 안 됨 |
| 배포 `/openapi.json` | 24 paths / **31 ops**, `openapi.deployed.json` 과 **바이트 동일** | `06` 저장본 유효 |
| 배포 `POST /auth/logout` 삭제 쿠키 | `wr_session=""; SameSite=lax` (Secure 없음) | 🚨 §2-1 미해소 |
| 배포 `POST /personalization/regenerate` | **404** | 🚨 §2-3 미해소 |
| `rag-reindex` CronJob | **08-24 · 08-25 2연속 Failed**(staging·production 모두) | 🚨 **원인 확정** → `08` §7: `cronjob.yaml` env 3개뿐, `Settings()` 필수 OAuth 4개 누락 → `ValidationError` |
| 로컬 `.env.example` | **미커밋** `OAUTH_BACKEND_BASE_URL=…:8001` (HEAD 8000) | ⚠️ 기준선 아님 — `09` §5-b 함정 |

전체 실측 기록과 나머지 확인 명령(인그레스·환경변수·TLS)은 [`08` §8](08-cluster-runtime.md) 에 있다.

---

## 8. 4차 점검 이력 (2026-08-25)

> 방식 — 문서별로 **모든 검증 가능한 주장**(경로·줄번호·이름·기본값·수치·해시)을 `6c29ea0` 코드에서 grep/실행으로 대조,
> 외부 사양(MDN·WHATWG·Starlette 1.6.0 소스·LangGraph·PostgreSQL·Kubernetes 공식 문서)은 WebFetch 로 원문 확인.
> 배포본은 `az aks command invoke` 로 클러스터 안에서 `kubectl` 실행 + `curl` 실측. 각 문서 머리말에 「🔍 4차 점검」 줄을 남겼다.
> `FRONTEND_COLLABORATION_REQUEST.md` 는 프론트 원본 입력물이라 **손대지 않았다.**

| 문서 | 수정 | 미검증 | 핵심 |
|---|---|---|---|
| `01` | 9 | 0 | `get_current_wedding` 의존 **23 → 24**(24 + user 3 = 27 인증 필요 · 공개 8) · `api_error` 호출 32 → **34**, 고유 코드 20 → **22** · 로컬 `app.openapi()` 실측 26 paths / 33 ops · 줄번호 5건 |
| `02` | 7 | 2 | ✅ `done_so_far` 는 「미구현」이 아니라 **온보딩 타임라인 초기 DONE 처리에 반영**(모델/스키마 주석이 낡음) · ✅ `WeddingOut` non-null 위험 **해소**(항상 채움, 대신 `422 TOTAL_BUDGET_UNAVAILABLE`) · 🚨 **신규** `PATCH /weddings` 로 `precision` 만 바꾸면 `wedding_date` 재환산 없음(`services/wedding.py:153-158`) · 🚨 **신규** `region_code` 오타는 404 가 아니라 `NON_METRO → NATIONWIDE` **조용한 폴백**(`services/benchmark.py:22-31`) · 「모델 10개」는 파일 기준(테이블 클래스 15) |
| `03` | 5 | 2 | `weddings.guest_count_unsure` 표 누락 보강 · PostgreSQL 문서 §5.5.1 로 정정 · 마이그레이션 #4/#10 요약 보강 · 재발방지: 모델 `DateTime(timezone=True)` 통일 미완(`wedding.py:102-103,133` 등, 잠복) · 수치 13/15/9/10 불변 |
| `04` | 10 | 2 | 챗 엔드포인트 **3 → 4**(feedback) · LangGraph 인용문을 현행 원문으로 교체 · 시스템 프롬프트 규칙 **6 → 8** · `stage` 최대 6회 근거 줄(`graph.py:88/126/156` × 2라운드) · `retry_count` **메시지당**(`services/chat.py:166-174`) 명시 · `temperature`/`timeout` 미지정(SDK 기본) · WHATWG SSE·LangGraph streaming 사양 일치 확인 |
| `05` | 4 | 6 | 필수 환경변수 **8 → 6** · Starlette CORS 와일드카드 메커니즘 정정(1.6.0 소스: `allow_methods=*` 는 항상 전개, `allow_headers=*` 는 프리플라이트 echo, credentials 가 좌우하는 건 origin 뿐) · `backend/.env.example` 드리프트(`RAG_TSVECTOR_TOP_K=8` vs 기본 4 · 4키 누락) · schemeful same-site 단서 · 미검증 6건은 전부 클러스터/외부 실측 |
| `06` | 0 | 1 | `openapi.deployed.json` 31 ops / 49 schemas 전수 대조 **불일치 0** · 배포 openapi 바이트 동일 · 계약 diff `b4615af..6c29ea0` = 7파일 +178/−4 |
| `07` | 25 | 1 | §2 #1 **「32+2=34, regenerate 1건 미배포」→「33+2=35, regenerate+feedback 2건 미배포」** · 협업요청 인용문을 448줄본 원문(`:445-446`)으로 교체 · 줄번호 20여 건 · MDN/K8s/WebKit 인용 4건 원문 일치 |
| `08` | 6 | 2 | 🚨 §7 **재작성: CronJob 은 인증 커밋 이후 상시 실패** — 실패 파드 로그로 원인 확정(`Settings()` 필수 `google/naver_client_*` 4개가 `infra/k8s/base/rag-cronjob/cronjob.yaml` 에 없음, `rag/indexing.py:111`) · 격차 33 → 37 · ACR 태그 6 → 10개 · production Application `targetRevision: main` 원인 보강 |
| `09` | 4 | 3 | 로컬 HEAD `6c29ea0` 확정 · 🆕 §1-a 기동 실측(`import app.main` 통과 · `alembic heads` = `4de56b422020` · docker compose 없음 · 로컬 `.env` `DATABASE_URL` 스킴 없어 `alembic current` 실패) · 🆕 §5-b **8001 포트 함정**(미커밋 `.env.example`) · 시드 스크립트 위치(`backend/scripts/`, `db/seed/` 비어 있음) |
| `BACKEND_REQUEST` | 3 | 1 | Starlette 1.6.0 근거 부기 · 부록 #2 인용문 교체 · **운영 요청 5(CronJob) 를 `08` §7 원인 확정에 맞춰 재작성**(요약표 우선순위 낮음 → 중간) |
| `README` | 6 | — | 헤더 behind 0 · `\n` 오타(bash 블록) · CronJob 판정 재정정 · 4차 재실측 표 · 이 절 · 📁 `backend_req_info/` 경로 등록 |

### 4차에서 새로 생긴 할 일

1. ~~`BACKEND_REQUEST.md` 운영 요청 5 갱신~~ → ✅ **반영 완료** — 「간헐 실패 확인」에서 「`cronjob.yaml` 에 OAuth env 4개 주입(또는 `Settings` 분리)」 요청으로 교체. 근거는 [`08` §7](08-cluster-runtime.md).
2. ~~§6 확인 요청에 추가~~ → ✅ **§6 #9·#10 으로 추가 완료** — `PATCH /weddings` precision 변경 시 `wedding_date` 재환산 부재, `region_code` 무효값의 조용한 폴백(프론트는 17값 Literal 로 좁혀 보내는 것 외 방어 수단 없음). 근거는 [`02`](02-schemas.md) §5·§15.4.
3. **미검증 20건**은 두 부류다 — (a) 브라우저 실물 쿠키 왕복·로컬 백엔드 미기동 상태의 도달성(`09` §1·§3·§4), (b) 과거 시점 수치(「16커밋」·「55→65항목」). (a) 는 로컬 백엔드를 띄운 뒤 `09` §8 명령으로, (b) 는 재현 불가라 그대로 둔다.


### 4차-b · `docs/backend_req_info/` 검토 (2026-08-25, 같은 날 후속)

사용자가 백엔드 전달 묶음을 `docs/backend_req_info/` 에 저장했다. **6개 파일 전부 `branchs/backup/backend-request-to-frontend/` 와 바이트 동일**(`cmp`)이므로
새 내용은 없고, [`07` §8](07-collaboration-request-review.md) 의 교차검증(4차에서 줄 참조 재검증 완료)이 그대로 적용된다.
반영한 것은 **경로 확정**뿐이다 — `07` 머리말·§8 제목·§8.1 끝(구현 때 펼쳐 볼 파일 표), `BACKEND_REQUEST.md` 부록, README §4 문서 지도.
이 폴더의 `FRONTEND_COLLABORATION_REQUEST.md`(448줄)가 정본이고 `backend-analysis/` 안의 403줄본은 `07` §1~§7 대조용 구판으로 유지한다.

### 4차-c · `BACKEND_REQUEST.md` §1·§4 개정 (2026-08-25, 사용자 지시)

- **§1 SameSite** — 요청의 최종 상태를 표로 명시: 발급(`auth.py:56`)·삭제(`:121`) 두 곳 모두 `samesite="none"` + `secure=True` + `httponly=True`.
  소문자 `"none"` 통일, 설정 키(`SESSION_COOKIE_SAMESITE`) 부재 확인(`core/config.py:41-42`), 검증 curl 을 삭제/발급 두 갈래로 확장(현재 실측값 vs 기대값 병기).
- **§4 APPROX_H2_THIS_YEAR** — 「백엔드 확인 요청」→ **「프론트 근본 해결 · 참고」** 로 전환. 근본 원인(`approximate_wedding_date` 가 `today` 를 안 씀)을 명시하고,
  코드로 확인한 계약 5가지(`POST` 는 EXACT 만 날짜 존중 `wedding.py:87-91` · `PATCH` 는 precision 만 보내면 날짜 유지 `:156-158` · 날짜만 바뀌면 LLM 미호출 `:42,164-190` · 개인화는 precision 미참조)를
  조합한 **`POST`(EXACT+대표일) → `PATCH`(precision)** 2단계 구현안 + TS 스니펫 + 순서 선택 이유(`done_so_far` 오기록 회피) + 부작용 처리 + 기존 사용자 복구. 백엔드 A/B 안은 선택으로 격하.
  연동 정정: `02` §5 경계 결함 주석 · `07` §4/§6 표/§7 요청 목록 · README §4 지도·§6 #9(⚠️ 프론트가 PATCH 유지 동작에 의존 — 백엔드가 바꾸면 사전 통보 요청).
- ⚠️ **프론트 코드는 아직 없다** — `frontend/src` 에 `wedding_date_precision` 참조 0건(2026-08-25). §4 스니펫은 S1 온보딩 구현 시 옮겨 쓸 설계다.

