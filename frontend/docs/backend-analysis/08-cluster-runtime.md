# 08 · 클러스터 실측 — 배포본의 정체 · 인그레스 · 런타임 환경

> **측정** 2026-08-24 09:54 UTC · **2차 재측정 (백엔드 `e3496e7` 시점)** — §1·§3·§7 갱신
> · 🆕 **3차 재측정 (백엔드 `6c29ea0` 시점, PR #57)** — §1·§3·§9 갱신
> `kubectl`(AKS `team4hc-aks`, kubelogin AAD) · `az acr` · `openssl s_client` · `curl`
> 🔍 **4차 점검(2026-08-25)** — 코드 6c29ea0 대비 팩트체크. 수정 6건 / 미검증 2건. 상세는 README 「4차 점검 이력」.
> 🔍 4차 재실측 수단: 로컬에 `kubectl` 이 없어 **`az aks command invoke`**(클러스터 안에서 kubectl 실행) · `az acr repository show-tags` · `curl` 로 §1·§2·§4·§5·§6·§7 을 다시 쟀다.
> **왜 따로 두는가** 01~07 은 **소스와 `openapi.json`** 으로 쓴 문서다. 그 둘로는
> 「지금 떠 있는 게 어느 커밋인가」·「인그레스가 SSE 를 버퍼링하는가」·「환경변수가 실제로 무엇인가」를
> 알 수 없다. 이 문서는 **클러스터에 직접 물어본 값**만 담는다.
>
> 🚨 **이 문서가 다른 문서의 서술을 3건 뒤집는다.** README §3 의 코드↔배포본 대비 구도(→ §1),
> README §2-3 의 「배포 누락」 성격(→ §3), 인증서 만료 리스크(→ §6).

---

## 1. 🚨 배포본은 `df4a8ff` 가 **아니다** — `b4615af` 다

지금까지 문서들은 「코드 `df4a8ff` ↔ 배포본」으로 대비해 왔다. **그 구도가 틀렸다.**
배포본은 `df4a8ff` 보다 **더 이전** 커밋이다.

| | 이미지 다이제스트 | 태그(**= git 커밋 SHA**) | 이미지 빌드 | 파드 기동 |
|---|---|---|---|---|
| **staging** | `sha256:3f6e6d7f18ec…` | **`b4615af`** | 2026-08-23T20:19:24Z | 2026-08-23T20:24:43Z |
| **production** | `sha256:8dfef083b816…` | **`4e879fd`** | 2026-08-21T09:54:30Z | 2026-08-21T10:12:48Z |
| ACR `latest` | 🆕 `sha256:fbbfac142061…` | 🆕 **`6c29ea0`** (= `origin/backend` HEAD) | 🆕 2026-08-24T11:15:12Z | — |

**세 커밋의 선후 관계** (실측 `git merge-base --is-ancestor`):

```
b4615af  ──────►  df4a8ff  ──────►  83d5f4c  ────►  e3496e7  ────►  6c29ea0
(배포본)          (구 분석 기준)                    (2차 기준)      (현 분석 기준
                                                                 = origin/backend HEAD)
   └──────────────────────── 37 커밋 ──────────────────────────────────┘
```

- `git rev-list --count b4615af..origin/backend` → 🆕 **37** (3차 재측정 · 29 → 33 → **37** · 🔍 4차(08-25)에도 **37 그대로** — `origin/backend` 도 staging 파드도 안 움직였다)
- `git merge-base --is-ancestor df4a8ff b4615af` → **거짓** = **분석 기준이 배포본보다 최신이다**

> 🆕 **격차가 두 번 연속으로 벌어졌다 — 29 → 33 → 37.** 매번 `origin/backend` 만 움직이고
> **staging 파드는 그대로다**(3차 실측에서도 `RESTARTS 0` · 기동 시각 **2026-08-23T20:24:43Z 불변**).
> **격차는 자동으로 좁혀지지 않고 벌어지기만 한다** — §1.2 의 구조가 그대로면 계속 이렇게 간다.
> 🔍 **4차 실측(2026-08-25 ~09:00 UTC)** — staging 파드 `backend-6774c65f77-sz6d5` imageID `sha256:3f6e6d7f18ec…`(= ACR 태그 `b4615af`) ·
> `RESTARTS 0` · `status.startTime` **2026-08-23T20:24:43Z 불변**. production 도 `sha256:8dfef083b816…`(= `4e879fd`) 불변.
> ACR `latest` 다이제스트 `sha256:fbbfac142061…` = 태그 `6c29ea0` 그대로. **표의 세 줄 전부 그대로 유효하다.**
>
> 🆕 **ACR `latest` 는 이미 `6c29ea0` 을 가리킨다**(빌드 2026-08-24T11:15:12Z, 커밋 11:12Z 직후).
> **이미지는 준비돼 있고 파드만 안 굴렀다** — 즉 **재배포 요청의 비용은 이미지 빌드가 아니라
> 롤아웃 한 번이다.** 이 관계는 3차 재측정에서도 그대로였다 — **빌드 파이프라인은 정상이고,
> 끊긴 것은 롤아웃뿐이다.**

### 1.1 🔑 ACR 태그가 git 커밋 SHA 다 — 배포 커밋을 언제든 실측할 수 있다

이번 측정에서 재사용 가치가 가장 큰 발견이다. `az acr repository show-tags` 가 내주는 태그가
전부 40자 커밋 해시다(`latest` 제외). 따라서 **「지금 떠 있는 게 어느 커밋인가」는 추측할 필요가 없다** — §8 의 한 줄이면 된다.

### 1.2 왜 최신 이미지가 안 올라가는가 (원인 규명)

- Deployment 는 `backend:latest` + `imagePullPolicy: Always` — **태그가 고정이라 매니페스트가 안 바뀐다.**
  따라서 **파드가 재시작될 때만** 새 이미지를 집는다.
- staging 파드는 `b4615af` 이미지가 푸시된 **5분 19초 뒤**에 떴고(20:19:24 → 20:24:43), **그 뒤로 재시작이 없다**
  (`RESTARTS 0`, age 13h — 🔍 4차 시점 약 37h). 그 사이 ACR 에는 이미지가 **6개** 더 쌓였다(🔍 4차 실측 **10개** — `b4615af` 푸시 이후 태그 수, `latest` 제외).
- `argocd-image-updater` 가 `update-strategy=digest` · `write-back-method=argocd` 로 붙어 있지만
  **Application 에 kustomize image override 가 하나도 기록돼 있지 않다**(`spec.source.kustomize` 없음)
  → 되쓰기가 실제로 일어나지 않았다.
- ArgoCD `backend-staging` 은 **`OutOfSync`** 다. 단 어긋난 리소스는 `Namespace/staging` ·
  `ServiceAccount/backend-sa` · `SecretProviderClass/backend-kv` **3개뿐**이고, 이들은
  `rag-cronjob-staging` 과 **공유되는 리소스**다(`SharedResourceWarning` 3건). **Deployment 자체는 Synced** 라
  OutOfSync 는 이미지 지연의 원인이 아니다.

> **프론트가 할 일은 없다.** 다만 **「코드에 있다」와 「호출된다」를 절대 같은 것으로 취급하지 말 것.**
> 이 프로젝트에서 그 간격은 지금 **37 커밋**이다(2026-08-24 3차 · 🔍 2026-08-25 4차 재측정에서도 37 — 29 → 33 → 37).

---

## 2. 🚨 production 호스트는 프론트가 쓸 수 없다 — **인증 이전 구버전**이다

`05` §5-a 는 `VITE_API_BASE` 후보로 두 호스트를 나란히 적어 뒀다. **나란히 둘 수 없는 값이다.**

| | staging | production |
|---|---|---|
| 호스트 | `https://20-249-52-148.nip.io` | `https://merrymap-production.koreacentral.cloudapp.azure.com` |
| 커밋 | `b4615af` (v4.0, 인증 있음) | **`4e879fd`** (2026-08-21, **인증 이전**) |
| `GET /api/v1/health` | **200** | **200** ← 헬스만 보면 멀쩡해 보인다 |
| `GET /api/v1/auth/google/login` | **307** | 🚨 **404** |
| `openapi.json` 경로 수 | **24** (ops 31) | **18** (ops 23) |
| ArgoCD `targetRevision` | `backend` | **`main`** ← v4.0 이 아직 `main` 에 없다 (`infra/k8s/apps/backend-production.yaml` · 🔍 4차 실측 동일) |

🔍 **4차 재실측(2026-08-25)** — 두 호스트 모두 health 200 · login 307/**404** · paths 24/18 · 두 배포본 다 `ChatSessionCreate.required=["category_code"]`. 표 그대로다.

### 2.1 경로 이름 자체가 다르다 (v4.0 에서 개명됨)

| production(구) | staging(v4.0) |
|---|---|
| `/checklists/{category_code}` · `/checklists/items/{item_id}/progress` | `/checklist-items` · `/checklist-items/{item_id}` |
| `/timeline` · `/timeline/{milestone_id}` | `/timeline-items` · `/timeline-items/{item_id}` |
| `/weddings/me/categories` | `/wedding-categories` |
| (없음) | `/auth/login` · `/auth/logout` · `/auth/me` · `/auth/signup` |
| (없음) | `/benchmarks/total-average` · `/feedback-reports` |

### 2.2 production 백엔드에는 OAuth 환경변수가 **하나도 없다**

Deployment env 실측 — production 은 **4개**뿐이다(`PORT` · `DATABASE_URL` · `DATABASE_AUTH_MODE` ·
`AZURE_OPENAI_ENDPOINT`). `GOOGLE_CLIENT_ID` · `NAVER_CLIENT_ID` · `FRONTEND_BASE_URL` ·
`OAUTH_BACKEND_BASE_URL` · `LANGFUSE_*` 가 **전부 없다.**
🔍 **원인(코드로 확정)** — `backend` 브랜치의 `infra/k8s/base/backend/deployment.yaml` 은 15개를 다 주입하지만,
production Application 은 **`targetRevision: main`** 을 본다(`infra/k8s/apps/backend-production.yaml`). `main` 의 매니페스트가
인증 이전 버전이라 4개만 있는 것이다 — 즉 **이미지뿐 아니라 매니페스트도 `main` 에 갇혀 있다.** `main` 에 머지되지 않는 한 production 은 절대 OAuth 를 못 한다.

> **결론 — `VITE_API_BASE` 를 production 호스트로 바꾸면 로그인부터 전멸한다.**
> 헬스체크가 200 이라 「살아 있다」고 오판하기 쉽다. **프론트가 붙을 곳은 staging 하나뿐이다.**
> `05` §5-a 의 `.env.example` 주석에서 prod 후보 줄은 **지워야 한다**(→ §9).

---

## 3. 배포 갭 전수 — 「코드에 있고 배포본에 없는」 프론트 계약

> 🆕 **이 표는 staging 에 붙을 때만 유효하다 (2026-08-25).** 연동 대상이 **로컬**로 바뀌었고,
> 로컬은 배포본의 **상위 집합**이다(로컬 **33 ops** vs 배포본 31 · 배포본에만 있는 것 **0개**, 실측).
> **openapi 로 확인 가능한 4건(1·2·6·7)은 전부 로컬에서 해소됨을 실측**했다 — 특히 **2번(전역 상담)은
> 로컬 `ChatSessionCreate.required` 가 비어 있어 `category_code: null` 이 통과한다.**
> ⚠️ **나머지 6건(3·4·5·8~10)은 스트림/프롬프트/200 응답이라 openapi 로는 원리상 안 잡힌다** — 미확인이다.
> 전수 대조는 [`09` §2](09-local-runtime.md).

§1 의 37 커밋 중 프론트 계약에 닿는 것만 추린다. **전부 「안 와도 동작하게」 짜야 한다.**

🆕 **2026-08-24 하루 동안 6건 → 9건 → 10건이 됐다.** 배포본은 그대로인데 코드만 움직였기 때문이다.

| # | 계약 | 도입 커밋 | 배포본(`b4615af`) 동작 | 관련 문서 |
|---|---|---|---|---|
| 1 | `POST /personalization/regenerate` | `3e988c2` (PR #46) | **404** | README §2-3 |
| 2 | **전역 상담** `category_code: null` | `b3a24c4`+`5b566ff` (PR #50·#51) | 🚨 **422** — §3.1 | `04` §1, `07` §5 |
| 3 | SSE `stage` 이벤트 | `ad2b880` (PR #53) | 안 옴 | `04` §1.2-a |
| 4 | SSE `retry` 이벤트 | `ec48afa` (PR #54) | 안 옴 | `04` §1.2-a |
| 5 | 답변 마크다운 금지 | `a4497fd` (PR #52) | 프롬프트 미적용 | `04` §1.2-b |
| 6 | `POST …/messages/{mid}/feedback` | PR #55 | **404** | `01` §4 |
| 7 | 🆕 `ChatMessageOut.user_rating` 필드 | PR #55 (`4de56b422020`) | **응답에 필드 없음** | `02` §8 |
| 8 | 🆕 **타임라인 개인화가 상시 BLOCKED** (`ETC`/`HOMENEW` few-shot 0건) | `41488fa`·`38dab2b` (PR #56) | 🚨 **온보딩 결과가 카탈로그 폴백** | `04` §5.6-a |
| 9 | 🆕 **개인화 도메인별 독립 판정** | `0d1d6a9` (PR #56) | 한쪽 실패 → **양쪽 폴백** | `04` §5.4 |
| 10 | 🆕 **타임라인 개인화 저다양성 + `category_code` 문자열 오염** | `241f63e`·`d810da6`·`df96cf4` (PR #57) | 🚨 **온보딩 결과가 카탈로그 폴백 / 거의 동일한 타임라인** | `04` §5.6-c |

**7~10 은 「없는 기능」이 아니라 「틀린 결과」다.** 1~6 은 호출하면 404/미도착이라 프론트가 감지할 수
있지만, **8~10 은 200 으로 정상 응답하면서 내용만 카탈로그 폴백**이다.

> ⚠️ **정정 — 「유일한 단서가 `source_tier` 유무」는 절반만 맞았다.** 그 단서는 **체크리스트에만**
> 있다. **타임라인 응답에는 `source_tier` 필드가 아예 없고 폴백분도 `origin="LLM"`** 이라
> **행 단위로도 구분되지 않는다**(`04` §5.6-b 실측). 8·10 이 바로 타임라인 항목이므로,
> **이 두 건은 화면에서도 응답에서도 감지할 수단이 없다.**

**개인화 품질을 눈으로 평가하려면 재배포가 선행돼야 한다.**

### 3.1 🚨 신규 발견 — 전역 AI상담이 배포본에서 **422** 다

`04`·`07` 은 「백엔드가 `category_code: null` 을 지원한다」고 적었다. **코드에서는 맞고, 배포본에서는 틀리다.**

배포본 `openapi.json` 실측:

```json
"ChatSessionCreate": {
  "properties": {"category_code": {"type":"string","enum":["MEETING","VENUE","...","ETC"]}},
  "required": ["category_code"]
}
```

`b3a24c4` 가 `category_code: CategoryCode` → `CategoryCode | None = None` 으로 바꿨는데,
그 커밋이 배포본보다 **뒤**다. 따라서 지금 `POST /chat/sessions` 에 `{}` 나 `{"category_code": null}` 을
보내면 **422 ValidationError** 다.

**→ S3 를 카테고리 진입점부터 만들면 배포 상태와 무관하게 동작한다.** 전역 진입점은 배포가 따라온 뒤에 붙인다.

🆕 **2026-08-24 재실측: 배포본 `openapi.json` 이 바이트 단위로 동일하다**(45,796 B · paths 24 ·
operations 31 · `info.version` `0.1.0`). 저장본 `openapi.deployed.json` 과 오퍼레이션 diff **0건**.
**즉 위 표의 9건은 하나도 배포되지 않았다.**

### 3.2 그 커밋이 남긴 설계 근거 — 하단 탭바 논쟁의 답

`b3a24c4` 가 `schemas/chat.py` 에 박아 둔 주석 원문:

> *"`12_final_prototype_mockup.html` 하단 탭바의 전역 "AI상담"(카테고리 무관)과 카테고리 상세 안의
> "AI상담" 서브탭 **둘 다 이 엔드포인트로 세션을 만든다** — None이면 전역 상담."*

**백엔드는 하단 탭바에 「AI상담」이 있다고 전제하고 있다.** 이는 `frontend/docs/design/layout.md`
(ADR 0006 승인 규범)의 **하단 탭바 4개** 계약과 충돌한다. 진입점을 어디에 둘지는 여전히 **디자인 오너 결정**이지만,
이제 **백엔드가 무엇을 기대하는지는 근거로 확정**됐다(→ `07` §5).

---

## 4. ✅ 인그레스는 SSE 를 통과시킨다 — 단 **60초 무음이면 끊긴다**

`04` §2.5 가 *"AKS 인그레스의 `proxy-read-timeout` 실측 필요"* 로 남겨 둔 항목을 닫는다.

**측정한 것**

- 컨트롤러: `registry.k8s.io/ingress-nginx/controller:`**`v1.15.1`**
- `ConfigMap ingress-nginx/ingress-nginx-controller` → **`data` 키 0개** = **전부 기본값**
- `Ingress staging/backend` 의 annotation → `cert-manager.io/cluster-issuer` 와 ArgoCD 추적용뿐.
  **SSE·버퍼링·타임아웃 관련 annotation 은 하나도 없다.**

**따라서 적용되는 값은 controller-v1.15.1 의 기본값이다** (공식 ConfigMap 문서):

| 설정 | 기본값 | 프론트 영향 |
|---|---|---|
| `proxy-buffering` | **`"off"`** | ✅ **버퍼링 없음 — SSE 가 그대로 흘러간다** |
| **`proxy-read-timeout`** | **`60`** (초) | 🚨 **업스트림이 60초 동안 아무것도 안 쓰면 끊긴다** |
| `proxy-body-size` | `1m` | 상담 질문 바디는 여유 |
| `proxy-buffer-size` | `4k` | 응답 헤더용 — 무관 |

> 근거: `kubernetes/ingress-nginx` 저장소 **`controller-v1.15.1` 태그**의
> `docs/user-guide/nginx-configuration/configmap.md` — `proxy-buffering` 기본 `"off"`,
> `proxy-read-timeout` 기본 `60`. 배포된 버전에 태그를 맞춰 확인했다.
> 🔍 4차 재확인 — 같은 태그 문서에서 `proxy-buffering "off"` · `proxy-read-timeout 60` · `proxy-body-size "1m"` · `proxy-buffer-size "4k"` 그대로[^cm].
> 클러스터 쪽도 컨트롤러 `controller:v1.15.1` · ConfigMap `data` 비어 있음 · Ingress annotation 은 `cert-manager.io/cluster-issuer`(+ArgoCD tracking-id)뿐 — 전부 재확인.

[^cm]: https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/docs/user-guide/nginx-configuration/configmap.md

### 4.1 버퍼링은 이중으로 안전하다

백엔드도 `StreamingResponse(headers={"X-Accel-Buffering": "no"})` 를 보낸다(`routers/chat.py:90-95`).
인그레스 기본값 `proxy-buffering off` 와 합쳐 **두 겹**이다. 스트리밍이 안 흐를 걱정은 하지 않아도 된다.

### 4.2 🚨 그런데 60초 타임아웃은 실제 위험이다

`proxy_read_timeout` 은 **연속된 두 읽기 사이**의 제한이다. 토큰이 흐르는 동안은 안전하지만
**아무것도 안 나가는 구간**이 60초를 넘으면 nginx 가 연결을 끊는다.
`04` 가 이미 식별한 무음 구간 두 개가 정확히 여기 걸린다:

| 무음 구간 | 배포본에서 무엇이 흐르나 | 그 사이에 일어나는 일 |
|---|---|---|
| 요청 ~ 첫 `token` | **아무것도 안 흐른다** (`stage` 이벤트는 미배포 — §3) | 임베딩 1회 + 하이브리드 검색 + 생성 첫 토큰 |
| 마지막 `token` ~ `done` | 아무것도 안 흐른다 | **verify LLM 비스트리밍 왕복 1회** (`04` §2.3) |

**프론트 대응 (구현 시 반드시)**

1. **끊김을 정상 종료와 구분한다.** 60초 타임아웃은 `done` 이벤트 **없이** 스트림이 닫히는 형태로 온다.
   `reader.read()` 의 `done: true` 만 보고 완료 처리하면 **잘린 답변을 완성된 답변으로 표시**한다.
   → **`done` 이벤트를 받았는지를 별도 플래그로 추적**하고, 못 받고 닫히면 오류 UI 를 낸다.
2. `AbortController` 자체 타임아웃은 **60초보다 길게** 잡는다. 짧으면 서버 쪽 정상 처리를 프론트가 먼저 끊는다.
3. `stage` 이벤트가 배포되면 첫 구간의 무음은 사라진다. **verify 구간은 그대로 남는다.**

> ⚠️ **아직 재보지 않은 것** — 실제 무음 길이가 60초를 넘는지는 **인증이 필요해 측정하지 못했다.**
> 로그인이 되는 즉시(§`05` §3.3 의 `SameSite` 해소 후) 상담 1건을 실제로 흘려 보며
> 「요청→첫 token」과 「마지막 token→done」의 벽시계 시간을 재야 한다. 여기서는 **한도가 60초라는 것만 확정**됐다.

### 4.3 `replicas: 1` — 파드가 재시작되면 진행 중인 스트림이 전부 끊긴다

두 네임스페이스 모두 **replica 1개**다. 배포·재시작 시 열려 있는 SSE 연결은 전부 끊어진다.
재개 수단이 없으므로(`04` §1.3) **사용자에게는 답변이 중간에 멈춘 것으로 보인다.**
§4.2-1 의 오류 처리가 이 경우도 함께 덮는다.

---

## 5. 환경변수 실측 — 추정이 사실로 바뀐 것

`05` §5 는 `core/config.py` 의 `Settings` 로 작성됐다(**기본값**). 아래는 **클러스터에 실제로 주입된 값**이다.

**staging** (15개, 비밀은 `backend-kv-secrets` Secret 참조 — **값은 읽지 않았다**) — 🔍 4차 실측 15개 동일.
매니페스트와도 일치: base 12개(`infra/k8s/base/backend/deployment.yaml`) + staging 오버레이 3개(`LANGFUSE_ENVIRONMENT` · `OAUTH_BACKEND_BASE_URL` · `FRONTEND_BASE_URL`, `infra/k8s/overlays/backend-staging/kustomization.yaml`).

| 변수 | 값 |
|---|---|
| `PORT` | `8000` |
| `DATABASE_AUTH_MODE` | `aad` |
| `OAUTH_BACKEND_BASE_URL` | `https://20-249-52-148.nip.io` |
| **`FRONTEND_BASE_URL`** | **`https://polite-island-0bb189700.7.azurestaticapps.net`** |
| `LANGFUSE_ENABLED` / `LANGFUSE_HOST` / `LANGFUSE_ENVIRONMENT` | `true` / `https://jp.cloud.langfuse.com` / `staging` |
| Secret 참조 (값 미확인) | `DATABASE_URL` · `AZURE_OPENAI_ENDPOINT` · `GOOGLE_CLIENT_ID`/`_SECRET` · `NAVER_CLIENT_ID`/`_SECRET` · `LANGFUSE_PUBLIC_KEY`/`_SECRET_KEY` |

### 5.1 ✅ 세션 쿠키 기본값이 실제로 유효하다 [확정]

**`SESSION_COOKIE_NAME` 과 `SESSION_TTL_DAYS` 가 둘 다 주입돼 있지 않다.**
→ `core/config.py` 의 기본값이 그대로 적용된다. `05` §1 이 "덮어쓰기 가능"이라 적어 둔 항목이
**실제로는 덮이지 않았음**을 확인한 것이다.

- 쿠키 이름 **`wr_session`** — 확정
- 만료 **30일 절대값** — 확정 (`05` §1 의 「30일째 반드시 튕긴다」가 배포본에서도 성립)

### 5.2 ✅ CORS 는 코드 하드코딩이 정본이다 [확정]

`CORS_ORIGINS` 계열 환경변수가 **없다.** → `app/main.py:40-63` 의 하드코딩이 배포본에서도 그대로다.
`05` §3.1 의 서술을 그대로 신뢰해도 된다.

### 5.3 🆕 새 함정 — SWA **프리뷰 배포**에서 소셜 로그인하면 프로덕션 SWA 로 튕긴다

`FRONTEND_BASE_URL` 이 **접미사 없는 기본 SWA 호스트**로 고정돼 있다.
그런데 CORS 정규식은 접미사를 **허용한다**(`05` §3.1):

```
^https://polite-island-0bb189700(-[a-zA-Z0-9]+)?\.7\.azurestaticapps\.net$
                                 └─ 프리뷰 환경 접미사를 허용 ─┘
```

**비대칭이다.** `fetch` 는 프리뷰 오리진에서도 CORS 를 통과하지만, **소셜 로그인 콜백은
`FRONTEND_BASE_URL` 로 리다이렉트**하므로 프리뷰에서 로그인을 시작하면 **프로덕션 SWA 로 돌아온다.**
쿠키는 백엔드 host-only 라 살아 있지만, 사용자는 자기가 보던 화면을 잃는다.

→ **PR 프리뷰 환경에서는 소셜 로그인을 테스트할 수 없다.** `05` §2.3 의 「로컬에서 완료 불가」와 **같은 원인**이다.

---

## 6. TLS — 「11-19 만료」는 리스크가 아니다 [정정]

문서 여러 곳이 *"인증서 11-19 만료"* 를 위험처럼 적어 뒀다. **cert-manager 가 자동 갱신한다.**

| | `notAfter` | **`renewalTime`** |
|---|---|---|
| `staging/backend-staging-tls` | 2026-11-19T09:53:58Z | **2026-10-20T09:53:58Z** |
| `production/backend-production-tls` | 2026-11-19T09:54:01Z | **2026-10-20T09:54:01Z** |

둘 다 `Ready=True`, 발급자 Let's Encrypt(`CN=YR2`), `cluster-issuer: letsencrypt-nginx`(`infra/k8s/cert-manager/cluster-issuer.yaml`). 🔍 4차 실측 — `notAfter`/`renewalTime`/`Ready` 전부 동일.
**만료 30일 전에 자동 갱신되므로 프론트가 대비할 것은 없다.**
남는 리스크는 만료가 아니라 **`nip.io` 가 잠정 호스트라는 사실**뿐이다 — 인그레스 IP 가 바뀌면
호스트명 자체(`20-249-52-148.nip.io`)가 바뀌고 `VITE_API_BASE` 도 함께 바뀐다.

---

## 7. 🚨 RAG 재색인 CronJob — 「간헐적」이 아니라 **인증 커밋 이후 상시 실패**다 (2026-08-25 재정정)

스케줄 `0 3 * * *`(매일 03:00 UTC, `infra/k8s/base/rag-cronjob/cronjob.yaml`) · 11일째 운영 중. **08-24 03:00 회차부터 두 번 연속 실패했다** (staging·production 둘 다).

| Job | 결과 |
|---|---|
| `rag-reindex-final` (3d) | Complete (18s) |
| `rag-reindex-29789460` (08-22 03:00) | Complete (23s) |
| `rag-reindex-29790900` (08-23 03:00) | Complete (20s) |
| **`rag-reindex-29792340`** (08-24 03:00) | 🚨 **Failed** — exit **1**, `BackoffLimitExceeded` (🔍 4차 시점엔 이력 회전으로 목록에서 사라짐) |
| 🔍 **`rag-reindex-29793780`** (08-25 03:00) | 🚨 **Failed** — 파드 `Error`, exit **1**, `BackoffLimitExceeded` — staging·production 동일 |

> ⚠️ **2차 정정(08-24)** 은 「이전 회차가 성공했으니 간헐적」이라고 봤는데, 🔍 **4차에서 실패 파드 로그를 읽어 원인을 확정**했다 — **간헐이 아니라 결정적 실패**다.
>
> **근본 원인** — 파드 로그 끝:
> ```
> File ".../app/rag/indexing.py", line 111, in reindex → settings = get_settings()
> pydantic_core.ValidationError: 4 validation errors for Settings
>   google_client_id / google_client_secret / naver_client_id / naver_client_secret — Field required
> ```
> `core/config.py:47-50` 이 인증 커밋에서 네 값을 **기본값 없는 필수 필드**로 만들었는데,
> `infra/k8s/base/rag-cronjob/cronjob.yaml` 의 env 는 여전히 `DATABASE_URL` · `DATABASE_AUTH_MODE` · `AZURE_OPENAI_ENDPOINT` **3개뿐**이다
> (backend Deployment 는 12개 → 인증 시크릿 포함). CronJob 도 `backend:latest` + `imagePullPolicy: Always` 라
> **`b4615af`(인증 포함) 이미지가 푸시된 08-23 20:19Z 이후의 회차는 전부 `Settings()` 에서 죽는다.** 08-23 03:00 회차가 마지막 성공인 이유가 정확히 이것이다.
>
> **재발방지(코드로 확인된 범위)** — `cronjob.yaml` env 에 `GOOGLE_*`/`NAVER_*` 4개를 `backend-kv-secrets` 참조로 추가하거나(SecretProviderClass 엔 이미 8개 키가 다 있다 — `infra/k8s/base/backend/secretproviderclass.yaml`),
> 재색인 경로가 OAuth 설정을 요구하지 않도록 `Settings` 를 분리해야 한다. 어느 쪽이든 **백엔드/인프라 소관**이다.
>
> 그 회차들이 반영했어야 할 것 — `1fd5bd9`(DS8_UGC 8건)·`454f8ea`(참가격 xlsx 2종) 코퍼스 추가분(둘 다 배포본보다 뒤 커밋). **고쳐지기 전까지 코퍼스는 08-23 상태에 멈춰 있다.**

**프론트가 고칠 것은 없다.** 다만 **S3 상담 답변의 품질·인용을 평가할 때 「코퍼스가 최신이 아닐 수
있다」를 전제로 깔아야 한다.** 근거 0건 응답(`04` §2.4)이 나와도 그것이 곧 제품 결함은 아니다.

🚨 **그리고 이건 `retry` 이벤트와 직결된다** — 근거 0건은 `GENERAL` 판정이고, `GENERAL` 은
**재검색 트리거**다(`04` §1.2-a). **코퍼스가 얇을수록 `retry` 가 자주 온다.**

---

## 8. 재실측 명령 (kubelogin 필요)

```bash
# 지금 떠 있는 커밋 — ACR 태그가 곧 git SHA 다
# (로컬에 kubectl 이 없으면: az aks command invoke -g project-3rd-team-4 -n team4hc-aks --command '<kubectl …>' -o tsv --query logs)
D=$(kubectl -n staging get pods -l app=backend \
     -o go-template='{{range .items}}{{range .status.containerStatuses}}{{.imageID}}{{end}}{{end}}' | sed 's/.*@//')
az acr manifest show-metadata --registry team4hcacr --name "backend@$D" --query tags -o tsv

# 배포본이 origin/backend 를 얼마나 따라왔나 (0 이면 최신)
cd C:/programming/sesac-third-project/branchs/backend_jy && git fetch origin backend --quiet
git rev-list --count <위에서 나온 태그>..origin/backend

# 전역 상담이 배포됐는가 — required 가 사라졌으면 배포된 것
curl -s https://20-249-52-148.nip.io/openapi.json | grep -o '"ChatSessionCreate":{[^@]\{0,400\}'

# 인그레스 기본값이 유지되는가 (data 가 비어 있으면 §4 표가 그대로 유효)
kubectl -n ingress-nginx get cm ingress-nginx-controller -o jsonpath='{.data}'

# 세션 쿠키 환경변수가 주입됐는가 (아무것도 안 나오면 기본값 wr_session/30일 유지)
kubectl -n staging get deploy backend \
  -o go-template='{{range .spec.template.spec.containers}}{{range .env}}{{.name}}{{"\n"}}{{end}}{{end}}' \
  | grep -i session
```

---

## 9. 이 문서가 만든 요청 (기존 요청에 추가)

> 📤 아래 항목들은 [`BACKEND_REQUEST.md`](BACKEND_REQUEST.md) 로 정리해 전달 형태를 갖췄다.

| # | 대상 | 요청 |
|---|---|---|
| 1 | 백엔드/인프라 | **staging 파드를 굴려 최신 이미지를 올려 달라.** 🆕 **37커밋치 계약 10건**(전역 상담 422 · `stage`/`retry` · 개인화 재생성 · 챗 평가 · **개인화 상시 BLOCKED** · **타임라인 저다양성**)이 전부 배포 대기 중이다 |
| 2 | 백엔드/인프라 | `:latest` + 파드 재시작 의존 구조라 **배포 시점이 우연에 맡겨져 있다.** 커밋 태그로 고정하거나 image-updater 되쓰기를 실제로 동작시켜 달라 |
| 3 | 문서 | `05` §5-a 의 `.env.example` 주석에서 **production 호스트 후보 줄을 삭제**한다 — 붙으면 로그인이 전멸한다(§2) |
| 4 | 디자인 오너 | 하단 탭바 「AI상담」 — 백엔드는 **있다고 전제**하고 있다(§3.2). `layout.md` 4탭 계약과의 충돌을 닫아야 한다 |
| 5 | 🆕 백엔드/인프라 | **RAG 재색인 CronJob 이 08-24 · 08-25 03:00 두 회차 연속 실패했다**(§7). 🔍 원인 확정 — `cronjob.yaml` 에 `GOOGLE_*`/`NAVER_*` env 가 없어 `Settings()` 검증 실패. env 4개 추가 요청 (코퍼스 2건이 색인 안 됨) |

> 🆕 **1번 요청의 근거가 또 강해졌다 (2026-08-24 3차 재측정).** 격차가 **29 → 33 → 37 커밋**으로
> 두 번 연속 벌어졌고, 배포 갭은 **6건 → 9건 → 10건**이 됐으며(§3), **ACR `latest` 이미지는 이미
> 최신 커밋(`6c29ea0`)으로 빌드돼 있다**(§1). 즉 **필요한 것은 빌드가 아니라 롤아웃 한 번**이다:
>
> ```bash
> kubectl -n staging rollout restart deployment/backend   # 백엔드/인프라 담당자가 실행
> ```
>
> 그리고 이 요청은 **프론트 착수를 막지 않는다** — 카테고리 진입점부터 만들면 배포와 무관하게 동작한다(§3.1).
