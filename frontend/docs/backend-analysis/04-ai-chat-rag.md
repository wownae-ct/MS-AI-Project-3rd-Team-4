# 04 · AI 상담(SSE) · RAG · 개인화

> 🔍 **4차 점검(2026-08-25)** — 코드 6c29ea0 대비 팩트체크. 수정 10건 / 미검증 2건. 상세는 README 「4차 점검 이력」.
> 코드 기준 `backend` **`6c29ea0`** (2026-08-24 3차 재분석 · 직전 기준 `e3496e7` 대비 **4커밋** = PR #57 — **계약 표면은 무변경**이고 개인화 프롬프트 품질 수정뿐이다, §5.6-c). 경로는 `backend/` 기준.
> ⚠️ **`6c29ea0` 는 「코드」기준이지 배포본이 아니다.** 배포본(staging)은 **`b4615af`** 로 이보다 **한참 이전**이고 `origin/backend` 대비 **37커밋 뒤**다 — [`08` §1](08-cluster-runtime.md). 「코드에 있다」와 「호출된다」를 따로 센다.
> **결론 먼저** — S3 AI 상담은 **SSE 스트리밍 확정**이고, `EventSource` 로는 구현할 수 없다.
> 프론트 `CLAUDE.md` §6-A 의 "S3 는 스트리밍 상태가 선행" 항목의 답이 이것이다.

---

## 1. 상담 응답 전달 방식 — **SSE 스트리밍** [확정]

엔드포인트는 **4개**다(`app/routers/chat.py:57,72,82,99` — 넷째는 👍👎 평가, §9-9):

| 메서드 | 경로 | 응답 |
|---|---|---|
| POST | `/api/v1/chat/sessions` | 201 JSON `{id, category_code, title, created_at}` |
| GET | `/api/v1/chat/sessions/{session_id}/messages` | 200 JSON `{messages:[...]}` (동기, 이력) |
| POST | `/api/v1/chat/sessions/{session_id}/messages` | 🚨 **200 `text/event-stream`** |
| POST | `/api/v1/chat/sessions/{session_id}/messages/{message_id}/feedback` | 200 JSON `{message_id:str, rating:"GOOD"\|"BAD"}` (요청 `{rating}`, assistant 가 아니면 **400 `CHAT_MESSAGE_NOT_RATABLE`**, `services/chat.py:114-117`) |

> 🚨 **배포본에서는 전역 상담(`category_code: null`)이 안 된다 — 422** (2026-08-24 실측, [`08` §3.1](08-cluster-runtime.md)).
> `category_code` 를 nullable 로 바꾼 커밋(`b3a24c4`)이 **배포본 `b4615af` 보다 뒤**라,
> 배포본 `openapi.json` 의 `ChatSessionCreate` 에는 `"required": ["category_code"]` 가 그대로 남아 있다.
> **S3 는 카테고리 진입점부터 만들면 배포 상태와 무관하게 동작한다.** 전역 진입점은 배포가 따라온 뒤에 붙인다.

근거: `routers/chat.py:90-96` — `StreamingResponse(..., media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})`.

### 1.1 와이어 포맷

`services/chat.py:145-148`:

```
event: <이름>\ndata: <JSON 한 줄>\n\n
```

테스트로 고정돼 있다 — `tests/test_chat_service.py:15` 가
`'event: token\ndata: {"delta":"안녕"}\n\n'` 를 문자 그대로 단언한다.

WHATWG HTML 명세의 SSE 필드 정의(`event` / `data` / `id` / `retry`)와 일치한다.

### 1.2 정상 이벤트 시퀀스 (`services/chat.py:151-278`)

> ⚠️ 아래는 **재검색이 없을 때**의 최소 시퀀스다. `stage`·`retry` 를 포함한 전체 순서는 **§1.2-a** 를 본다.

| 순서 | event | data 구조 |
|---|---|---|
| 1..N | `token` | `{"delta": "글자조각"}` |
| N+1 | `citations` | `{"citations":[{chunk_id:int, title:str, source_tier:"OFFICIAL"\|"NEWS"\|"INDUSTRY"\|"CONSENSUS", source_url:str\|null}]}` |
| N+2 | `verification` | `{"verdict":"SUPPORTED"\|"WEAK"\|"GENERAL", "reason":"한국어 한 문장"}` |
| N+3 | `done` | `{"message_id":str, "latency_ms":int}` |

**종료 신호는 `done` 이벤트다.** `[DONE]` 센티널은 없다.

> `message_id` 는 **UUID 문자열**이다(`str(assistant_message.id)`). 03_API_spec 및 협업 요청 문서의
> `"msg2"` 예시는 v3.0 잔재다. `POST /feedback-reports.target_id` 가 `UUID` 라 그대로 넘기면 된다.

#### 1.2-a 이벤트 2종이 추가됐다 — `stage` · `retry` (PR #53·#54)

✅ **이제 코드 기준선에 들어왔다**(`6c29ea0`). 🚨 **배포본에는 여전히 없다** — 2026-08-24 재실측에서도
배포 노출 31개·`ChatSessionCreate` 스키마 모두 변동이 없었다. **둘 다 안 와도 동작하게** 만든다.

| event | data | 언제 | 최대 |
|---|---|---|---|
| `stage` | `{"stage":"retrieve"\|"generate"\|"verify"}` | 그래프 노드 **진입 시점마다** | 🚨 **6회** (재검색 시 3노드를 다시 지난다) |
| `retry` | `{"reason": str}` | verify 가 `WEAK`/`GENERAL` 을 내려 질의를 재구성해 다시 검색할 때 | **1회** (`_MAX_RETRIES = 1`, 코드 상수) |

##### 정확한 순서 — 재검색이 일어나면 이렇게 온다

```
stage:retrieve → stage:generate → token×N(1차) → stage:verify
  → retry{reason} → stage:retrieve → stage:generate → token×M(2차) → stage:verify
  → citations → verification → done
```

**세 가지가 이 순서에서 확정된다** (`rag/graph.py:78-117`, `services/chat.py:208-217`):

1. **`retry` 는 그 라운드의 `stage:retrieve` 보다 먼저 온다.** `retrieve_node` 가 재시도를 감지하면
   `retry` 를 먼저 흘리고 그다음 `stage` 를 흘린다 — 백엔드 주석: *"stage 이벤트보다 먼저 보내서,
   프론트가 이 스트림이 재시도라는 걸 곧바로 알 수 있게 한다."*
2. 🔑 **`citations`·`verification`·`done` 은 재검색 여부와 무관하게 맨 끝에 딱 한 번씩만 온다.**
   `astream` 루프가 **완전히 끝난 뒤** 최종 스냅샷으로 만들기 때문이다. 그래서 **`citations` 는
   2차 검색 결과만 담는다** — `ChatState` 필드가 전부 덮어쓰기 채널이라(리듀서 없음) 2차
   `retrieve` 가 반환한 `context` 가 1차를 통째로 교체한다. 1차의 부실한 근거가 섞이지 않는다.

   > ✅ **공식 문서로 확인 — 백엔드 주석의 주장이 아니라 LangGraph 의 문서화된 기본 동작이다.**
   > `Annotated` 리듀서가 없는 state 키는 *"If no reducer function is explicitly specified then it is
   > assumed that all updates to the key should **override** it."* (2026-08-25 재확인 원문) ([LangChain Docs · Use the graph API](https://docs.langchain.com/oss/python/langgraph/use-graph-api))
   > — `ChatState` 7필드에 `Annotated` 가 하나도 없으므로 **전부 덮어쓰기**다. 그리고
   > `stream_mode="values"` 가 *"stream the **full state** of the graph after each step"* 이라
   > `final_state` 가 마지막 스냅샷이 되는 것도 문서화된 동작이다
   > ([LangChain Docs · Streaming](https://docs.langchain.com/oss/python/langgraph/streaming)).
   > 버전은 `uv.lock` 이 **langgraph 1.2.11** 로 고정하고 `Dockerfile` 이 `uv sync --locked` 로
   > 빌드하므로 재현 가능하다 — 「빌드할 때마다 동작이 달라질 수 있다」는 걱정은 **없다.**

3. **`stage` 는 3회가 아니라 최대 6회다.** `retrieve`(`graph.py:88`)·`generate`(`:126`)·`verify`(`:156`) 진입마다 1회 × 최대 2라운드. 「3단계 진행바」를 `stage` 수신 횟수로 전진시키면
   재검색 때 **되감기거나 넘쳐난다.** `stage` **값**으로 상태를 정하고(멱등), 횟수로 세지 않는다.

##### 🚨 `retry` 는 드문 예외가 아니다 — 근거 0건이면 **항상** 걸린다

재시도 조건은 `verdict in ("WEAK","GENERAL") and retry_count < 1` 이다(`_route_after_verify`, `rag/graph.py:171-174`).
**`retry_count` 는 세션당이 아니라 메시지당**이다 — `initial_state` 가 `stream_chat_response` 호출마다 `retry_count: 0` 으로 새로 만들어지고(`services/chat.py:166-174`) DB 에 저장되지 않으므로, 같은 세션의 다음 메시지에서도 재검색은 다시 최대 1회 허용된다.
그런데 **검색 0건 경로는 LLM 검증을 건너뛰고 곧바로 `GENERAL` 로 확정**된다(§2.4) — 즉
**「근거를 못 찾음」이 그대로 재검색 트리거**다. 백엔드 문서도 못박는다:

> *"이 경로도 재검색 대상이다: 0건 검색 → GENERAL → 재구성된 질의로 1회 재검색을 시도한다."*

→ **`retry` 를 「거의 안 오는 이벤트」로 취급하면 안 된다.** 코퍼스가 얇은 카테고리에서는
**기본 경로에 가깝다**(→ 재색인 CronJob 실패 이력, [`08` §7](08-cluster-runtime.md)).

##### `retry` 를 무시하면 화면이 깨진다

> *"이 이벤트를 받으면 그 시점까지 스트리밍된 답변(token 누적분)은 **버리고 새로 시작**해야 한다 —
> 뒤이어 오는 token들은 새 답변의 처음부터다. … (무시하면) 재시도 시 1차+2차 답변이 이어붙어
> 보이는 어색함만 생김"*

즉 **`retry` 수신 = 지금까지 누적한 `delta` 버퍼를 비우는 신호**다. 이것만은 반드시 처리한다.

**`reason` 은 사용자에게 그대로 보여줄 문자열이 아니다** — verify 노드가 낸 **내부 판정 사유**이고
(그 값으로 LLM 이 검색어를 다시 쓴다), 같은 값이 최종 `verification.reason` 으로도 나간다.
재검색 안내는 자체 문구로 그린다(예: "더 정확한 자료를 찾는 중").

**`stage` 는 §6-P 가 요구하던 「3단계 로딩 UI」를 서버가 직접 알려 주는 것이다.** 그동안 프론트가
「첫 token 전 / token 스트리밍 중 / 마지막 token 이후」로 **추측**해야 했던 구간이 명시된다.
백엔드 주석: *"최종 결과(answer/context/verdict)엔 영향 없는 순수 UX용 이벤트라, 프론트가 이
이벤트를 무시해도 token/citations/verification/done은 그대로 온다."*

#### 🆕 1.2-b 답변 본문은 **마크다운이 아니다** (2026-08-24, PR #52)

생성 프롬프트에 규칙이 추가됐다(`rag/generation.py`):

> *"마크다운 문법(`**볼드**`, `#`, `-`, `1. 2.` 같은 번호·기호 목록 등)을 **절대 쓰지 마세요.** …
> 여러 항목을 안내할 때도 번호를 매기지 말고, **항목마다 문단을 나누어(항목 사이에 줄바꿈을 넣어)**
> 설명하세요."*

→ **마크다운 렌더러를 붙이지 않는다.** 평문 + `\n\n` 문단 분리로 그린다(`white-space: pre-wrap`
또는 문단 split). LLM 출력이라 100% 보장은 아니지만, 마크다운 라이브러리를 초기 청크에 넣을
이유는 사라졌다(번들 예산에 유리).

### 1.3 🚨 재연결·재개가 불가능하다 [공식 근거]

백엔드는 **`id:` 필드도 `retry:` 필드도 보내지 않는다.**

WHATWG HTML 명세:
> "When a user agent is to reestablish the connection … If the `EventSource` object's last event ID
> string is not the empty string: [Set] (`Last-Event-ID`, lastEventIDValue) in request's header list."

→ `id` 를 한 번도 받지 못했으면 last event ID 가 빈 문자열이라 **`Last-Event-ID` 헤더가 전송되지 않는다.**
**중단된 답변을 이어받을 방법이 없다.** 재시도는 전적으로 클라이언트 몫이고, 재시도하면 처음부터다.

### 1.4 🚨 `EventSource` 를 쓸 수 없다 [표현 주의]

이 SSE 는 **POST + JSON 바디**다(`routers/chat.py:82`).

확인된 사실:
- `EventSource` 생성자는 **`(url, {withCredentials})` 만 받는다** — 메서드·본문·헤더를 지정할 방법이
  API 표면에 없다 (MDN `EventSource`).
- MDN "Using server-sent events": *"This is a one-way connection, so you can't send events from a
  client to a server."*

> ⚠️ 정직하게 적자면 **명세가 "EventSource 는 GET 전용"이라고 문장으로 못박지는 않는다.**
> HTML 명세는 "create a potential-CORS request" 를 만든다고만 하고 method 를 명시하지 않는다
> (Fetch 의 기본값 GET 을 따른다). 하지만 **생성자에 메서드·바디를 넘길 방법이 없다**는 것만으로
> 결론은 확정이다.

**따라서 구현은** `fetch` + `ReadableStream` + **수동 SSE 파서**
(또는 `@microsoft/fetch-event-source` 류)여야 한다.

### 1.5 인증 — `credentials: "include"` 필수

네 엔드포인트 모두 `Depends(get_current_wedding)`(`routers/chat.py:60,75,86,107`).
쿠키 인증이므로 `fetch(..., {credentials:'include'})` 가 없으면 401.
🚨 단 **`SameSite=Lax` 결함**(→ [05](05-auth-cors-deploy.md) §3.3)이 먼저 해소돼야 한다.

### 1.6 에러가 두 갈래로 갈린다

**스트림 시작 전** — 정상 HTTP 상태:

| status | code | 조건 |
|---|---|---|
| 401 | `UNAUTHORIZED` | 쿠키 없음/만료 |
| 404 | `WEDDING_NOT_FOUND` | 온보딩 전 |
| 404 | `CHAT_SESSION_NOT_FOUND` | 없음 **또는 남의 것**(의도적으로 구분 안 함) |

세션 소유 확인은 `StreamingResponse` 생성 **전에** 한 번 돈다(`routers/chat.py:89`).

**스트림 시작 후** — HTTP 는 이미 200이라 상태코드를 못 바꾼다(`services/chat.py:226-229`):

```
event: error
data: {"code":"RATE_LIMITED"|"UPSTREAM_LLM_ERROR","message":"<str(예외)>"}
```

- `RATE_LIMITED` — Azure OpenAI 429
- `UPSTREAM_LLM_ERROR` — **그 외 전부**(타임아웃·네트워크·verify JSON 파싱 실패 등)

🚨 **`message` 는 `str(exception)` 원문이다** — 영어·스택 정보가 섞인 업스트림 예외 문자열이라
**사용자에게 그대로 보여주면 안 된다.** 프론트가 `code` → 자체 한국어 메시지로 매핑할 것.

**에러 이벤트 뒤에는 즉시 `return`** 한다 — `citations`/`verification`/`done` 이 오지 않는다.

### 1.7 🚨 실패 시 "답변 없는 사용자 메시지"가 DB 에 남는다

- 사용자 메시지는 **이미 커밋돼 있다**(`services/chat.py:162-163`)
- 어시스턴트 메시지는 **저장되지 않는다**(에러 시 저장 코드 이전에 `return`)

→ 에러 후 이력을 다시 부르면 **고아 사용자 메시지**가 보인다. 재시도하면 그 위에 또 붙는다.
코드 주석이 이 동작을 **의도**라고 명시한다. **프론트는 이 상태를 렌더링할 수 있어야 한다.**

### 1.8 부수 사실

- **`GET /chat/sessions` 목록 엔드포인트가 없다** — 프론트가 session id 를 직접 보관해야 한다.
- `ChatSession.title` 은 **항상 null** 이다(설정하는 코드가 없다). `last_message_at` 도 마찬가지.
  → **상담 이력 목록 화면은 백엔드 작업이 선행돼야 한다.**
- `category_code` 는 **세션 생성 시 1회** 정해지고 메시지마다 바꿀 수 없다. 범위를 바꾸려면 **새 세션**.
  `null` = 전역 상담(하단 탭바), 값 있음 = 카테고리 상세 서브탭.
- `ChatMessageOut.id` 만 `str`, 나머지 id 는 `UUID` — 타입 불일치 주의.
- SSE 응답에 `Cache-Control: no-cache` 헤더가 **없다**(`X-Accel-Buffering` 만). 실배포 헤더 미실측.

---

## 2. 응답 지연 특성 — 로딩 UI 설계에 직접 영향

### 2.1 그래프 — LangGraph 3노드, 🚨 **조건부 재검색 루프 있음** (2026-08-24 변경)

`app/rag/graph.py:180-189`: **`retrieve → generate → verify`** 에 **`verify → retrieve` 조건부 엣지**가 붙었다.

> ⚠️ **정정.** 이 절은 원래 "재시도·재검색 사이클 **없음**(의도적 설계)" 이라고 적혀 있었다.
> `df4a8ff` 시점엔 사실이었지만 **`ec48afa`(PR #54)가 뒤집었다** — 지금은 CRAG(Corrective RAG)
> 패턴의 **최대 1회 재검색 루프**가 있다. 노드 수는 3개 그대로이고 `verify` 의 나가는 엣지만
> 조건부로 바뀌었다.

**재검색은 「같은 질의로 한 번 더」가 아니다.** verify 가 남긴 판정 사유를 근거로 **LLM 이 검색
질의를 다시 쓰고**(`generation.reformulate_query`) 그 새 질의로 검색한다. **사용자 원문 질문은
바뀌지 않는다** — 검색어만 바뀐다. 재작성이 빈 문자열이면 원 질문으로 폴백한다.

상한은 **코드 상수 `_MAX_RETRIES = 1`** 이고 설정으로 노출되지 않는다("무한루프/비용 폭증 방지").

### 2.2 메시지 1건당 외부 호출 — **LLM 왕복 3회, 재검색이 걸리면 7회**

| # | 무엇 | 근거 |
|---|---|---|
| 1 | Azure OpenAI **임베딩**(질문 벡터화) | `rag/retrieval.py:116` |
| 2 | Postgres 하이브리드 검색 쿼리 | `rag/retrieval.py:118` |
| 3 | Azure OpenAI **채팅(스트리밍)** | `rag/graph.py:137-140` |
| 4 | Azure OpenAI **채팅(비스트리밍, 검증)** | `rag/generation.py:99-119` |

🆕 **재검색이 걸리면 여기에 3.5개가 더 붙는다** — **질의 재작성 LLM 1회**
(`generation.reformulate_query`, 비스트리밍) + 임베딩 1회 + 검색 쿼리 1회 + 생성 LLM 1회 +
검증 LLM 1회. **최악의 경우 LLM 왕복이 3회에서 6회로 두 배가 된다.**
→ **§2.5 의 `proxy-read-timeout` 60초 한도에 닿을 확률이 그만큼 올라간다.**

### 2.3 🔑 토큰이 끝난 뒤 "죽은 구간"이 있다

`citations` 는 retrieve 직후가 아니라 **`astream` 루프가 전부 끝난 뒤**에야 나간다
(`services/chat.py:209-251`). 그런데 루프의 마지막 노드가 `verify` 이고, verify 는
**비스트리밍 LLM 호출 한 번을 통째로 기다린다**.

**프론트에서 보이는 그림:**

```
[요청] ──► [첫 token] ──► 타이핑 ──► [마지막 token] ──► ??? 공백 ??? ──► citations+verification+done
                                                        └─ verify LLM 왕복 1회 ─┘
```

→ **로딩 상태를 최소 3단계로 나눠야 한다:**

| 단계 | 상태 |
|---|---|
| 요청 ~ 첫 `token` | "답변 생성 중" 스켈레톤 |
| `token` 흐르는 중 | 타이핑 커서 |
| 마지막 `token` ~ `done` | **"출처 확인 중"** ← 여기서 스피너를 안 걸면 **UI 가 멈춘 것처럼 보인다** |

🆕 **배포가 따라오면 이 3단계를 추측하지 않아도 된다** — `stage` 이벤트가 구간을 직접 알려 준다(§1.2-a).
**단 `stage` 는 재검색 때 되돌아온다**(`verify` 다음에 다시 `retrieve`). 진행바를 단조 증가로
그리면 그 지점에서 되감기므로, **되감기를 허용하거나 재검색 전용 상태를 따로 둔다.**
그리고 **배포 전까지는 `stage` 가 아예 안 오므로**, 기존 3단계 추측 로직을 **폴백으로 남겨 둔다.**

### 2.4 근거 0건이면 훨씬 빠르다

검색 결과가 0건이면 **LLM 을 아예 호출하지 않는다** — 고정 문구를 `token` 이벤트 1개로 흘리고
verify 도 건너뛴다(`rag/graph.py:130-134`, `:159-160`). 외부 호출은 임베딩 1회뿐.

고정 문구: `"확인된 근거가 없습니다. 아직 관련 공식 자료를 확보하지 못한 주제일 수 있어요."`

이건 **에러가 아니라 정상 200 스트림**이다.

### 2.5 ⚠️ 확인 필요 → **인그레스 항목은 닫혔다 (2026-08-24)**

- **OpenAI 클라이언트에 타임아웃 설정이 없다** — SDK 기본값에 맡겨져 있다.
  → **프론트가 자체 `AbortController` 타임아웃을 걸어야 한다.**
- ✅ **`proxy-read-timeout` 실측 완료 → `60`초** ([`08` §4](08-cluster-runtime.md)).
  AKS 인그레스는 `ingress-nginx` **v1.15.1** 이고 ConfigMap 이 **비어 있어 전부 기본값**이다.
  - **`proxy-buffering` 기본 `"off"`** → ✅ 버퍼링 걱정은 없다. `X-Accel-Buffering: no` 와 **이중**.
  - 🚨 **`proxy-read-timeout` 기본 `60`초** → **위 §2.3 의 "죽은 구간"이 60초를 넘으면 nginx 가 끊는다.**
    끊김은 **`done` 이벤트 없이 스트림이 닫히는** 형태로 오므로, `reader.read()` 의 `done: true` 만 보고
    완료 처리하면 **잘린 답변을 완성된 답변으로 표시**한다. → **`done` 이벤트 수신 여부를 별도 플래그로 추적**한다.
  - `AbortController` 타임아웃은 **60초보다 길게** 잡는다(짧으면 프론트가 먼저 끊는다).
  - ⚠️ 실제 무음 길이가 60초를 넘는지는 **인증이 필요해 아직 못 쟀다.** 한도가 60초라는 것만 확정.
  - ✅ **2026-08-24 재확인** — 공식 ConfigMap 문서 기준 기본값: `proxy-read-timeout` **`60`** ·
    `proxy-send-timeout` **`60`** · `proxy-buffering` **`"off"`** · `proxy-body-size` **`"1m"`**
    ([ingress-nginx ConfigMap](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/)).
    클러스터의 ConfigMap 은 **`data` 키 자체가 없어**(`{}` 도 아님) 이 기본값이 그대로 적용된다.
  - 🚨 **재검색이 이 위험을 키운다** — 재검색이 걸리면 LLM 왕복이 3회 → 6회가 되고(§2.2),
    그중 **질의 재작성·검증 2회는 비스트리밍**이라 그 구간이 통째로 무음이다.
- **SSE keepalive/heartbeat 가 없다.** 서버가 무음 구간에 아무것도 안 보내므로 위 60초 한도가 그대로 노출된다.
- **`replicas: 1`** — 파드 재시작 시 진행 중인 스트림이 전부 끊긴다(`08` §4.3).
- 사용자당 rate limit 이 **코드에 없다**.

---

## 3. 인용(citation) — 붙는다. 단 **스니펫은 없다**

### 3.1 어디에 오는가 — 두 곳

1. 스트리밍 중 `event: citations`
2. 이력 조회 `GET /chat/sessions/{id}/messages` → `ChatMessageOut.citations`

DB 에 **JSONB 스냅샷**으로 저장되므로 새로고침해도 같은 모양으로 다시 그릴 수 있다.

### 3.2 필드 (`schemas/chat.py:25-30`)

| 필드 | 타입 | UI 활용 |
|---|---|---|
| `chunk_id` | int | ⚠️ **링크 불가** — 아래 참조 |
| `title` | str | ✅ 출처 제목 |
| `source_tier` | `OFFICIAL`\|`NEWS`\|`INDUSTRY`\|`CONSENSUS` | ✅ **티어 배지** |
| `source_url` | str \| **null** | ✅ 외부 링크 (**null 가능**) |

- 🚨 **스니펫(본문)이 없다.** 검색 단계의 `RetrievedChunk` 는 `content` 를 갖고 있지만
  `CitationOut` 으로 옮길 때 **버린다**(`services/chat.py:242-250`).
  → **인용 미리보기·하이라이트 UI 는 현재 스키마로 불가능**하다. 필요하면 `CitationOut` 에
  `content` 추가 요청이 선행돼야 한다.
- `source_url` 이 **null 인 경우가 실제로 있다** — 팀 자체 저작 콘텐츠(DS6_CHECK 등).
  **링크 없는 카드 상태를 반드시 처리**해야 한다.
- **`chunk_id` 로 무언가를 조회할 수 없다** — ① 청크 조회 엔드포인트가 없고 ② 재색인이 매번
  **전체 삭제 후 재삽입**이라 id 가 통째로 바뀐다. → **한 응답 안에서의 React key 용도로만** 쓸 것.
- 개수 상한 **5개** (`RAG_CONTEXT_TOP_K=5`).

### 3.3 티어 한국어 라벨 — 서버가 이미 정의해 뒀다

`rag/generation.py:13-18` (`SOURCE_TIER_LABELS`):

| code | 라벨 |
|---|---|
| `OFFICIAL` | 공식 통계 |
| `NEWS` | 뉴스 |
| `INDUSTRY` | 업계 조사 |
| `CONSENSUS` | 커뮤니티 경험담 |

프롬프트용이지만 **프론트 배지 라벨을 여기 맞추면 답변 본문의 표현과 일치한다** —
시스템 프롬프트가 LLM 에게 답변 끝에 이 등급을 언급하라고 지시하기 때문.

---

## 4. verdict — 신뢰도 배지를 그릴 수 있다

### 4.1 값과 의미 (`rag/generation.py:54-56` 프롬프트 원문)

| 값 | 의미 |
|---|---|
| `SUPPORTED` | 참고 자료로 명확히 뒷받침됨 |
| `WEAK` | 부분적으로만 연결됨 |
| `GENERAL` | 참고 자료 근거 없이 일반론으로 답함 |

### 4.2 어떻게 결정되는가

**답변 생성과 별개의 두 번째 LLM 호출**이 같은 컨텍스트를 주고 **자기 답변을 채점**한다
(`rag/generation.py:99-119`, `response_format={"type":"json_object"}`).

폴백 2개:
- JSON 에 키가 없으면 → `GENERAL`, `reason=""`
- 검색 0건 → LLM 안 부르고 즉시 `GENERAL` + `"검색된 근거 자료가 없어 일반 안내로 처리함"`

### 4.3 프론트 주의점

- 🚨 **`GENERAL` 이 두 가지를 겸한다** — "근거를 못 찾음" vs "근거는 있는데 일반론으로 답함".
  **추론**: `citations` 가 비어 있으면 전자, 비어 있지 않으면 후자로 구분 가능하다.
  (코드가 명시적으로 구분해 주지는 않는다 — 프론트 쪽 판단)
- `reason` 은 **LLM 이 쓴 자유 한국어 문장**이다(0건 케이스만 고정). 열거형이 아니므로 그대로 표시.
- ⚠️ **같은 배포(`chat-mini`)가 쓰고 같은 배포가 채점한다.** 독립 심판이 아니라 **셀프 채점**이므로
  배지 문구를 "검증됨" 같은 단정형보다 **"근거 뒷받침"** 정도로 두는 게 안전하다 — 제품 판단이라 결정자 몫.

---

## 5. 개인화 — **완전 동기, 폴링 없음**

### 5.1 무엇을 생성하는가

**체크리스트 항목 + 타임라인 항목** 두 도메인. 상담과는 **완전히 별개의 그래프**다.

`route → generate → validate` (`personalization/graph.py:106-114`)
- **route**: `ONBOARDING_INITIAL`/`MANUAL_REGENERATE` 는 **LLM 없이** 즉시 결정. `FIELD_UPDATED` 만 LLM
- **generate**: 두 도메인이면 **단일 결합 LLM 호출 1회**
- **validate**: **LLM 없는 순수 코드**

→ LLM 왕복 **1~2회**.

### 5.2 호출 지점 4곳 — 전부 요청 핸들러 안에서 `await`

| 트리거 | 엔드포인트 |
|---|---|
| `ONBOARDING_INITIAL` | **`POST /api/v1/weddings`** |
| `FIELD_UPDATED` | `PATCH /api/v1/weddings/me` (날짜 **외** 필드) |
| `FIELD_UPDATED` | `PUT /api/v1/wedding-categories` (카테고리 온/오프) |
| `MANUAL_REGENERATE` | `POST /api/v1/personalization/regenerate` ⚠️ **배포본에 없음** |

**작업 큐가 없다. 폴링 불필요.** 대신 **요청이 그만큼 오래 걸린다.**

### 5.3 🚨 온보딩 제출이 앱에서 가장 느린 요청이다

`POST /api/v1/weddings` 는 평범한 JSON POST 인데, 응답 전에 **9개 카테고리 전체의 체크리스트+타임라인을
LLM 으로 생성**해서 커밋한다. **진행률 신호도 스트리밍도 없다.**

→ **넉넉한 스피너 + 넉넉한 클라이언트 타임아웃**이 필요하다.

`wedding_date`/`wedding_date_precision` **단독** 변경만 LLM 을 안 부른다(결정론적 재계산) — 이 PATCH 만 빠르다.

### 5.4 재생성 API 계약

요청: `{"domains": ["CHECKLIST", "TIMELINE"]}` — 빈 배열·중복이면 **422**.
응답: `{"ai_invocation_id": "uuid", "status": "SUCCESS|BLOCKED|FAILED", "affected_domains": [...]}`

🚨 **`status` 3값 모두 200 이고, 3값 모두 DB 행이 교체된다:**

| status | 무슨 일이 일어났나 |
|---|---|
| `SUCCESS` | **두 도메인 모두** 검증 통과 → 그 내용으로 기록 |
| `BLOCKED` | **한 도메인이라도** 검증 실패 → 그 도메인만 **결정론적 카탈로그 폴백** |
| `FAILED` | 예외 → **두 도메인 모두 폴백** |

→ **`BLOCKED`/`FAILED` 를 "아무 일도 안 일어남"으로 취급하면 안 된다.**
어느 status 든 프론트는 `GET /checklist-items`·`GET /timeline-items` 를 **다시 불러야 한다.**

#### 🆕 `BLOCKED` 의 의미가 바뀌었다 — 이제 **도메인별 부분 실패**다 (2026-08-24, PR #56)

`0d1d6a9` 이전에는 두 도메인의 검증 에러를 **하나의 flat list 로 합쳐** 판정해서, **CHECKLIST 만
실패해도 이미 통과한 TIMELINE 까지 폴백으로 버려졌다.** 지금은 `validate_personalization_draft`
가 `{"CHECKLIST": [...], "TIMELINE": [...]}` 를 반환하고 도메인별로 독립 분기한다.

**프론트에 닿는 차이** — `status: "BLOCKED"` 를 받아도 **두 도메인이 다 폴백인 것은 아니다.**
`status` 는 "완전히 깨끗한 성공은 아니었다"는 **실행 전체 요약**일 뿐이고, **어느 도메인이
폴백됐는지는 응답으로 알 수 없다**(`error_message` 는 DB 에만 남는다). → **`BLOCKED` 를
「생성 실패」로 문구화하지 말 것.** 실제로는 절반이 LLM 개인화 결과일 수 있다.
구분은 **도메인마다 다르다** — 체크리스트는 §5.6 의 **`source_tier` 유무**로 행 단위 판별이 되지만,
**타임라인은 판별할 방법이 아예 없다**(→ **§5.6-b**).

- `ai_invocation_id` 를 **조회할 엔드포인트가 없다** — 지원/디버깅용 식별자일 뿐 폴링 대상이 아니다.
- 실패 사유(`error_message`)는 **DB 에만** 저장되고 응답에 안 실린다.

### 5.5 사용자 편집분은 보존된다

`user_edited_at` 이 있는 행은 재생성에서 **살아남는다** — protected 아닌 행만 지운다.

### 5.6 생성된 항목의 모양 — 렌더링 계약

- 체크리스트: `origin="LLM"`, **`source_tier=null`**
  → `services/personalization.py:125-126` 이 *"source_tier: null → 「AI 추천」 프론트 계약"* 이라고 명시.
  **폴백 카탈로그 행은 실제 `source_tier` 를 갖는다** → **`source_tier` 유무로 AI 생성분과 카탈로그분을
  구분해 배지를 달 수 있다.**
- 🚨 **타임라인: 구분 불가.** `TimelineItemOut` 에는 **`source_tier` 필드 자체가 없고**,
  LLM 성공분과 카탈로그 폴백분이 **둘 다 `origin="LLM"`** 이다 → **§5.6-b**.
- `group_label`·`status` 는 LLM 이 아니라 **서비스 레이어가 결정론적으로** 채운다.
- 타임라인 `phase_label` 은 응답에 **없다** — `default_dday_offset_days` 로 **프론트가 계산**.
- 검증 규칙 4종: ENUM+활성 카테고리 소속 / 활성 카테고리마다 ≥1건 / 카테고리 내 제목 중복 없음 /
  타임라인 오프셋 **[-400, 60]**.

#### 🆕 5.6-a 「활성 카테고리마다 ≥1건」이 상시 실패하고 있었다 (2026-08-24, PR #56)

**프론트가 이 사실을 알아야 하는 이유** — 이 기간에 온보딩한 계정은 **개인화 결과가 아니라
표준 카탈로그**를 보고 있었다. 화면에 「AI 추천」 배지가 안 붙는 것이 버그가 아니라 이 때문이다.

> **왜 타임라인 실패가 체크리스트 배지까지 없애는가** — 실패한 도메인은 타임라인인데 배지는
> 체크리스트 것이라 어긋나 보인다. 배포본(`b4615af`)이 **도메인 독립 판정(`0d1d6a9`) 이전**이라
> **한쪽이 걸리면 양쪽 다 폴백**되기 때문이다(§5.4). 즉 배포본에서는 타임라인 커버리지 실패가
> **체크리스트까지 카탈로그로 끌어내리고**, 그 카탈로그 행은 `source_tier` 가 non-null 이라
> 「AI 추천」 배지 조건에서 빠진다. **롤아웃 후에는 이 연쇄가 끊긴다** — 그때부터는 타임라인만
> 폴백되고, 그건 §5.6-b 때문에 **화면에서 보이지 않는다.**

| 커밋 | 무엇이 문제였나 |
|---|---|
| `41488fa` | **`TIMELINE_CATALOG` 에 `ETC`·`HOMENEW` 항목이 0개**였다. 이 카탈로그가 generate 노드의 **few-shot 예시로도** 쓰여 LLM 이 두 카테고리 항목을 아예 안 만들었고, 「활성 카테고리마다 ≥1건」 규칙에 걸려 **타임라인 도메인이 매번 BLOCKED 폴백**됐다 (55 → 65항목) |
| `38dab2b` | 같은 원인의 잔여분 — `MEETING` 1개·`GIFT` 2개뿐이라 표본이 얇아 **확률적으로** 누락됐다 (65 → 68항목). 체크리스트 few-shot 도 카테고리당 1개 → **최대 3개** 추출로 변경 |

🚨 **이 3건은 전부 배포본에 없다**(배포본 `b4615af` 는 셋보다 전부 이전). **지금 staging 에
온보딩하면 여전히 카탈로그 폴백을 본다** — 개인화 품질을 눈으로 평가하려면 **배포가 선행**돼야 한다.

> 발견 경로가 기록돼 있다 — *"frontend-e2e-merimap-integration 세션이 실계정 DB 조회로 최초 발견"*.
> 즉 **정적 분석으로는 안 잡혔고 실계정 E2E 로만 드러났다.** 이 카테고리(`ETC`·`HOMENEW`)는
> `CLAUDE.md` 가 「7 → 9 신설」이라 적은 바로 그 둘이다.

##### ✅ 「상시」가 과장이 아닌 이유 — 코드로 직접 검증했다

커밋 메시지를 그대로 옮긴 게 아니라 **배포본 소스를 직접 세어 확인했다.**

| 확인한 것 | 결과 |
|---|---|
| 배포본(`b4615af`) `TIMELINE_CATALOG` 의 `ETC`·`HOMENEW` 항목 수 | **0개** (`VENUE` 15 · `SDM` 13 · `INVITATION` 6 · `HONEYMOON` 5 · `HOMEWARE` 3 · `GIFT` 2 · `MEETING` 1 뿐) |
| 검증 규칙이 실재하는가 | ✅ `validation.py:36-45` `_validate_category_coverage` — *"활성 카테고리 {code}에 생성된 항목이 없습니다."* |
| 온보딩이 두 카테고리를 켜는가 | 🚨 **9개 전부 켠다** — `services/wedding.py:121` *"부작용: wedding_categories **9행 전부 켜짐**(is_active=True)"*, `:134` *"9개 카테고리 전부 방금 is_active=True로 켰으므로 전체 집합을 active로 넘긴다"* |
| 사용자가 끄고 시작할 수 있는가 | ❌ **불가** — `WeddingCreate` 스키마에 **카테고리 필드가 아예 없다** |

→ **온보딩은 예외 없이 `ETC`·`HOMENEW` 를 활성으로 만들고, 배포본 카탈로그는 그 둘의 few-shot 이
0개다.** 따라서 커버리지 규칙이 **매번** 걸린다. **「상시」가 맞다** — 사용자 입력과 무관하다.
현재(`6c29ea0`)는 각 5개로 채워졌고 `MEETING` 1→3 · `GIFT` 2→3 · `HOMEWARE` 3 도 함께 보강됐다.

#### 🚨 5.6-b 타임라인은 「개인화됨/폴백됨」을 응답으로 구분할 수 없다 (2026-08-24 3차 확인)

> ⚠️ **이전 서술 정정.** 이 문서는 §5.4 에서 *"구분하려면 `source_tier` 유무로 행 단위로 판별한다"*
> 고 적었다. **체크리스트에만 맞는 말이었다** — 타임라인에는 그 필드가 아예 없다.

| 도메인 | LLM 성공분 | 카탈로그 폴백분 | 프론트가 구분 가능? |
|---|---|---|---|
| 체크리스트 | `origin="LLM"` · `source_tier=null` | `origin="LLM"` · `source_tier` **non-null**(`OFFICIAL`/`CONSENSUS`/`INDUSTRY`) | ✅ **가능** |
| 타임라인 | `origin="LLM"` | `origin="LLM"` | ❌ **불가능** |

근거(전부 `6c29ea0` 실측):

- `schemas/timeline.py:15-24` — `TimelineItemOut` **9필드**(`id`·`category_code`·`origin`·`title`·
  `target_date`·`default_dday_offset_days`·`status`·`date_overridden`·`is_overdue`)에
  `source_tier` **없음**. 체크리스트만 `schemas/checklist.py:26` 에 갖고 있다.
- `services/personalization.py:166` — LLM 성공분 `origin="LLM"`.
- `services/personalization.py:176-185` → `services/timeline.py:35` — **폴백분도 `origin="LLM"`**.
  폴백 함수 docstring 이 *"각 dict에 origin="LLM"도 이미 들어있음"* 이라고 명시한다.
- `models/timeline.py:36` — `CheckConstraint("origin IN ('LLM','USER')")` 라 **제3의 값이 들어올 수
  없다.** `USER` 는 사용자가 직접 추가한 항목(`services/timeline.py:123`)이라 이 판별에 못 쓴다.

**프론트에 닿는 결론** — 타임라인 화면에 **「AI 추천」 배지를 달 수 없다.** 달면 카탈로그 폴백 행에도
똑같이 붙는다. 체크리스트에만 달거나, 백엔드에 **타임라인 쪽 판별 필드 추가를 요청**해야 한다
(차단급이 아니라 [`BACKEND_REQUEST.md`](BACKEND_REQUEST.md) 현행 5건에는 넣지 않았다).

#### 🆕 5.6-c 저다양성·`category_code` 오염 — few-shot 이 **세 번째·네 번째 원인**이었다 (2026-08-24, PR #57)

`e3496e7` → **`6c29ea0`(4커밋)**. **계약 표면은 하나도 안 바뀌었다** — 라우터·스키마·모델·
마이그레이션 diff **0**(실측). 바뀐 파일은 `app/personalization/prompts.py` 와 그 테스트 **둘뿐**이다.

| 커밋 | 무엇이 문제였나 |
|---|---|
| `241f63e` | **타임라인 few-shot 이 카탈로그 68항목 전체를 그대로 LLM 에 넘겼다.** 「그대로 베낄 답」을 통째로 받으니 개인화할 유인이 없어져, **서로 다른 프로필의 웨딩 두 건이 67개 중 66개가 완전히 동일한 타임라인**을 받았다(실계정 재현). → MOCKUP 7카테고리를 **카테고리당 3개**로 제한(**68 → 59줄**, 실측) + *"베끼지 마세요"* 명시 지시 추가 |
| `d810da6` | 위 수정이 만든 회귀 — `category_code=null` 항목을 **`[범용]` 한글 라벨**로 보여줬더니 LLM 이 그 라벨을 **값으로 착각**해 `"category_code": "범용"` 을 출력했다 |
| `df96cf4` | `[범용]` → `(category_code=null)` 로 바꿨더니 이번엔 **`"category_code": "null"`** — 파이썬 `None` 이 아니라 **4글자 문자열**이 나왔다. **2연속 재발.** 근본 원인을 「사람이 읽는 텍스트 라벨」 방식 자체로 보고, few-shot 을 **`json.dumps` 로 실제 출력 스키마와 동일한 JSON 한 줄씩**으로 바꿔 구조적으로 차단 |

**오염된 값이 프론트까지 새어 나오지는 않는다.** `personalization/validation.py:29` 가
`code not in _VALID_CATEGORY_CODES` 로 잡아 **TIMELINE 도메인을 BLOCKED → 카탈로그 폴백**시킨다.
개인화 출력은 Pydantic 이 아니라 **생 `json.loads`**(`personalization/graph.py:52,78`)로 받으므로
이 검증이 유일한 방어선이다. 즉 증상은 **§5.6-a 와 똑같다** — HTTP **200**, 타임라인은 카탈로그.

🚨 **「온보딩 결과가 카탈로그처럼 보인다」의 알려진 원인이 이제 넷이다** — ① 카탈로그 커버리지 0건
(`41488fa`) ② 표본 부족(`38dab2b`) ③ few-shot 전량 노출로 인한 복제(`241f63e`) ④ `category_code`
문자열 오염(`d810da6`·`df96cf4`). **넷 다 200 을 내고, 넷 다 §5.6-b 때문에 응답으로 구분되지 않으며,
넷 다 배포본에 없다.**

> **세 번 다 실계정 재현으로 드러났다**(커밋 메시지 *"실계정 재현으로 2연속 확인됨"*). 정적 분석으로는
> 안 잡힌다. → 프론트가 온보딩 화면을 붙일 때 **서로 다른 프로필의 계정 2개를 만들어 결과를 비교**하는
> 것이 유일한 실효 검증이다. 한 계정만 보면 「그럴듯한 타임라인」으로 보인다.

##### 왜 이 클래스의 버그가 반복되는가 — 공식 문서로 확인한 근본 원인

개인화·챗 양쪽 모두 **Azure OpenAI JSON 모드**(`response_format={"type": "json_object"}`)를 쓰고
**Pydantic 없이 수동 `json.loads`** 로 받는다(`personalization/graph.py:44,52,75,78` ·
`rag/generation.py:108,118`). 이 조합은 **JSON 문법만 보장하고 값은 보장하지 않는다.**

> *"JSON mode guarantees valid JSON output, but it doesn't guarantee the output matches a specific
> schema. If you need schema guarantees, use Structured Outputs."*
> *"JSON mode produces JSON that is valid and parses without error. However, there's no guarantee
> for output to match a specific schema, even if requested in the prompt."*
> — Microsoft Learn, [How to use JSON mode with Azure OpenAI](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/json-mode) (2026-08-24 확인)

→ `"category_code": "범용"` 은 **JSON 모드를 완벽히 통과한 출력이다.** ENUM 위반을 잡을 수 있는 층은
`validation.py` 뿐이고, 그래서 증상이 「오류」가 아니라 **「조용한 카탈로그 폴백」**으로 나타난다.
같은 문서가 권하는 **Structured Outputs(`json_schema` + enum)** 를 쓰면 이 클래스가 구조적으로
사라지지만, 그건 백엔드 결정이다 — 프론트는 **폴백이 올 수 있다는 전제로** 짠다.

회귀 테스트가 붙어 있다 — `tests/test_personalization_prompts.py` 에 **2개 클래스·4개 테스트**가
추가됐고, 그중 `test_no_natural_language_placeholder_anywhere` 가 *"`범용` 문자열이 few-shot 에
없을 것"* 을 직접 단언한다.

---

## 6. 검색 방식 — 하이브리드 + RRF

`app/rag/retrieval.py:40-104` SQL 한 방:

```
① 벡터 검색 top-8    (pgvector 코사인 거리 <=>)
② 키워드 검색 top-4   (tsvector + ts_rank + plainto_tsquery('simple'))
③ RRF 융합: 1/(60+rank_v) + 1/(60+rank_k) [+ 계약 보너스]
④ 최종 top-5
```

- ⚠️ **BM25 가 아니다** — Postgres `ts_rank` 다. 그리고 사전이 **`'simple'`** 이라 형태소 분석·어간 추출이
  없어 **한국어는 사실상 공백 토큰 리터럴 매칭**이다. 의미 검색(①)이 주력이고 ②는 "제3조", "10%" 같은
  정확 매칭 보조라고 코드 주석이 스스로 밝힌다.
- 한쪽에만 나온 문서는 없는 쪽 rank 를 **1000** 으로 친다.
- **카테고리 필터는 융합 전 하드 필터**다(`category_codes @> ARRAY[code]`).
  `category_code=NULL` 이면 필터 자체를 건너뛴다 → 전역 검색.
- **계약 키워드 가산점(F9)**: 질문에 `계약`/`위약금`/`해지` 중 하나라도 있으면
  `item_type='CONTRACT_TERM'` 청크에 RRF **+0.1**.
- `category_code` 가 있으면 시스템 프롬프트 규칙이 **6개→8개**로 늘어난다(`rag/generation.py:23-36`, 카테고리 규칙은 7·8번). PR #52 가 5·6번(마크다운 금지·요약 멘트 금지)을 추가해 4→6 이 됐는데, `build_chat_messages` docstring(`:83-84`)의 "4개/6개" 는 갱신되지 않은 낡은 주석이다.

---

## 7. Azure OpenAI 설정값

| 항목 | 값 |
|---|---|
| 인증 | **AAD Managed Identity** (API 키 없음) |
| 채팅 배포 이름 | **`chat-mini`** |
| 임베딩 배포 이름 | **`embedding`** |
| API 버전 | `2024-10-21` (⚠️ 코드에 `TODO(재확인)` 주석) |
| 임베딩 차원 | **1536** (pgvector `VECTOR(1536)`) |
| 임베딩 배치 | 16개씩 |
| 실제 모델 (chat-mini) | **gpt-5.4-mini** (version `2026-03-17`, **레포 루트** `infra/bicep/modules/openai.bicep:10-11` — `backend/` 밖) |
| `temperature` / 클라이언트 timeout | **둘 다 코드에 없음** — 챗 생성·검증·재구성·개인화 4곳의 `chat.completions.create` 어디에도 `temperature`·`timeout` 인자가 없어 SDK/모델 기본값을 따른다(`grep temperature app/` 0건) |
| 실제 모델 (embedding) | **text-embedding-3-small** (GlobalStandard) |

- `core/config.py:17-18` 가 명시적으로 정정한다: *"05_RAG_design.md 는 gpt-4o-mini 로 서술하지만
  실제 배포된 모델은 gpt-5.4-mini"*.
- bicep 에 `chat`(gpt-5.4) 배포도 있지만 **앱 코드는 `chat-mini` 만 쓴다** —
  생성·검증·라우팅·개인화 전부 같은 배포 하나.
- Langfuse 트레이싱은 **기본 off**. **프론트와 무관** — 지연 디버깅 때만 의미 있음.

---

## 8. 서버 재시도 — ⚠️ **절반만 맞는 서술이었다** (2026-08-24 정정)

> ⚠️ **이 절은 원래 "두 그래프 모두 재시도/재검색 루프 없음이 명시적 설계 결정"이라고 단정했다.**
> `df4a8ff` 까지는 사실이었지만 **상담 그래프는 `ec48afa`(PR #54)로 뒤집혔다.** 지금은 이렇게 갈린다.

| 그래프 | 재시도 | 성격 |
|---|---|---|
| **상담**(`rag/graph.py`) | 🆕 **있다 — 최대 1회 CRAG 재검색** | verify 가 `WEAK`/`GENERAL` 이면 질의를 재작성해 다시 검색(§2.1) |
| **개인화**(`personalization/graph.py:3`) | **없다**(그대로) | *"챗 그래프와 같은 '재시도 없음' 원칙"* 이라는 주석이 남아 있지만 **더 이상 챗과 같지 않다** |

🚨 **그래도 「LLM 호출 실패에 대한 재시도」는 여전히 없다.** CRAG 재검색은 **품질 판정에 대한
재시도**이지 네트워크·rate-limit 실패에 대한 재시도가 아니다 — `RateLimitError` 와 그 밖의 예외는
`event: error` 로 나가고 **스트림이 그대로 끝난다**(§1.6). **백오프 재시도는 여전히 프론트 몫이다.**

개인화만 예외적으로 **광범위 `except` 로 폴백**해서 200 을 낸다 — 그래서 온보딩 직후
체크리스트/타임라인이 비는 일은 없다. 🚨 **단 「비지 않는다」가 「개인화됐다」는 아니다**(§5.6-a).

---

## 9. 프론트가 지금 결정해야 할 것

1. **S3 는 SSE + POST** — `EventSource` 불가, `fetch`+`ReadableStream`+수동 파서 + `credentials:'include'`.
2. **CSP `connect-src`** 는 SSE `fetch` 도 함께 커버한다 — `https://20-249-52-148.nip.io` 하나로 충분.
3. **로딩 UI 3단계** — 마지막 토큰과 `done` 사이에 LLM 왕복 1회의 공백이 실재한다(§2.3).
4. **인용 UI 는 제목 + 티어 배지 + 선택적 링크까지만** 가능. 스니펫은 백엔드 스키마 변경이 선행돼야 한다.
5. **온보딩 제출이 가장 느리다** — 스피너·타임아웃 정책을 여기 맞춘다.
6. **재생성의 `BLOCKED`/`FAILED` 는 실패가 아니라 "폴백으로 교체됨"** — 어느 status 든 refetch.
7. **에러 후 고아 사용자 메시지**를 렌더링할 수 있어야 한다(§1.7).
8. 🆕 **`retry` 는 필수 처리, `stage` 는 선택 처리.** 둘 다 배포본에 없지만 성격이 다르다 —
   `stage` 를 안 다루면 UI 가 조금 덜 친절할 뿐이고, **`retry` 를 안 다루면 1차+2차 답변이 이어붙어
   틀린 답변을 보여준다.** 그리고 `retry` 는 근거 0건일 때 **항상** 걸린다(§1.2-a).
9. 🆕 **👍👎 평가는 목업에 없는 새 UI 다.** 🚩신고(`POST /feedback-reports`)와 **별개 기능**이고
   배포본에 아직 없다 → **엔드포인트 404 를 정상 경로로 흡수**하거나(낙관적 UI + 조용한 실패),
   배포 확인 후에 붙인다. `ChatMessageOut.user_rating` 도 **optional 로 읽는다**(배포본엔 필드가 없다).
10. 🆕 **`AbortController` 타임아웃은 60초보다 길게.** 인그레스 `proxy-read-timeout` 이 60초이고
   재검색이 걸리면 LLM 왕복이 최대 6회로 늘어난다(§2.2·§2.5). **`done` 이벤트 수신 여부를
   별도 플래그로 추적**해 잘린 답변을 완성으로 표시하지 않는다.
11. 🆕 **응답 잘림(`finish_reason: "length"`)은 백엔드가 검사하지 않는다 — 프론트가 `error` 로 받는다.**
   Azure 공식 문서는 *"You should check `finish_reason` for the value `length` before parsing the
   response. The model might generate partial JSON."* 라고 명시하는데, **코드 전체에 `finish_reason`
   검사가 0건**이다(`6c29ea0` 실측). 잘리면 `json.loads` 가 예외를 내고 —
   **상담**은 `services/chat.py:228-230` 에서 `event: error`(`UPSTREAM_LLM_ERROR`) 뒤 **즉시 `return`**
   (→ `citations`·`verification`·`done` **안 옴**, 어시스턴트 메시지 **DB 저장도 안 됨** — §1.7),
   **개인화**는 `services/personalization.py:273` 광범위 `except` 에서 **`FAILED` → 두 도메인 폴백**
   (HTTP **200**)으로 나타난다. 즉 **같은 원인이 두 화면에서 전혀 다른 모습으로 보인다** —
   상담은 눈에 띄고, 개인화는 **안 띈다**(§5.6-b).
