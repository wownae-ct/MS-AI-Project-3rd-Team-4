# AI 상담 스트리밍 (SSE) — 와이어 · 파서 · 상태 기계

> **성격** 적용 설계. S3 상담 화면이 백엔드 스트림을 어떻게 읽는지에 대한 계약.
> **결정 근거** [ADR 0007](../adr/0007-백엔드-연동-아키텍처를-확정한다.md) · **짝 문서** [backend-integration.md](backend-integration.md) · [api-contract.md](api-contract.md)
> **최종 갱신** 2026-08-25 · 백엔드 기준 커밋 **`474800c`** (계약 표면은 `faf91b8` 대비 무변경 — 바뀐 것은 개인화 프롬프트뿐)
>
> ⚠️ 인용값은 관측 시점의 사실이다. 갱신 절차는 [backend-integration.md](backend-integration.md) §7.

---

## 1. 왜 `EventSource`를 쓸 수 없나

상담 엔드포인트는 **`POST`**이고 본문에 질문을 싣는다. `EventSource` 생성자는 `(url, { withCredentials })`만 받아 **메서드·본문·헤더를 지정할 방법이 없다.**

> MDN · Using server-sent events: *"This is a one-way connection, so you can't send events from a client to a server."*

→ **`fetch` + `ReadableStream` + 수동 파서**를 쓴다. 그러면 `EventSource`가 대신 해 주던 일(줄 조립 · 필드 파싱 · 재연결)을 **우리가 해야 한다.**

**재연결·재개는 불가능하다.** 백엔드가 `id:` 필드를 보내지 않으므로 `Last-Event-ID` 재개 메커니즘이 성립하지 않는다(명세상 `id`를 받았을 때만 전송된다). 끊기면 **다시 부르는 것이 아니라 메시지 목록을 refetch**한다 — §4.

---

## 2. 와이어 계약 (관측된 사실)

백엔드는 단 한 곳에서 이 모양으로 만든다.

```
event: <이름>\ndata: <JSON 한 줄>\n\n
```

| 항목 | 실측값 | 프론트 영향 |
|---|---|---|
| 줄 구분 | **LF만** | 그래도 파서는 CRLF·CR도 받는다(명세 요구) |
| `data` 줄 | **항상 1줄** | 다중 `data` 누적 규칙은 지켜 두되 실사용은 없다 |
| `id:` / `retry:` 필드 | **없음** | 재연결·재개 불가 |
| 주석(`:`로 시작) | **백엔드는 안 보낸다** | 🚨 **파서는 반드시 처리** — 프록시가 keep-alive로 넣을 수 있다 |
| 응답 헤더 | `text/event-stream` + **`X-Accel-Buffering: no`** | 인그레스 버퍼링 방지가 **코드에도** 걸려 있다 |
| 인증 | 쿠키 | **`credentials: "include"` 필수** |

---

## 3. 파서 계약

### 3.1 명세가 요구하는 것 5가지

HTML Standard의 event stream 파싱 규칙 원문:

| # | 원문 | 구현 |
|---|---|---|
| 1 | *"Lines must be separated by either a CRLF character pair, a single LF character, or a single CR character."* | `split(/\r\n\|\r\|\n/)` — **LF만 가정하지 않는다** |
| 2 | *"If the line starts with a COLON character (:) — Ignore the line."* | 주석 줄 폐기(keep-alive 흡수) |
| 3 | *"Collect the characters on the line before the first COLON … If value starts with a SPACE character, remove it from value."* | 선행 공백 **1개만** 제거 |
| 4 | *"If the field name is `data` — Append the field value to the data buffer, then append a single LF character to the data buffer."* | 누적 후 **마지막 LF 제거** |
| 5 | *"If the data buffer is an empty string, set the data buffer and the event type buffer to the empty string and return."* | **빈 `data`는 디스패치하지 않는다** |

### 3.2 명세 밖이지만 반드시 필요한 것 2가지

`fetch`를 쓰면 청크 경계가 그대로 노출된다.

| # | 문제 | 처리 |
|---|---|---|
| 6 | `read()` 청크가 **줄 중간**에서 끊긴다 | 미완성 줄을 문자열 꼬리 버퍼에 남기고 다음 청크와 이어 붙인다 |
| 7 | 🚨 청크가 **UTF-8 문자 중간**에서 끊긴다 | **`TextDecoder` 인스턴스를 하나 유지**하고 `decode(chunk, { stream: true })` |

**#7은 한글에서 반드시 터진다.** 3바이트 문자의 중간에서 잘리면 —

```
스트림 옵션 미사용 : "data: {"delta":"���녕하세요"}"     ← 깨짐
스트림 옵션 사용   : "data: {"delta":"안녕하세요"}"       ← 정상
```

**디코더를 매 청크마다 새로 만들면 같은 증상이 난다.** 인스턴스 1개를 스트림 수명 동안 유지하는 것이 계약이다.

### 3.3 골격

```ts
const decoder = new TextDecoder("utf-8");   // ← 스트림당 1개
let tail = "";                               // ← 미완성 줄
let eventName = "";
let dataLines: string[] = [];

for (;;) {
  const { value, done } = await reader.read();
  if (done) break;                                   // ⚠️ 이것은 "완료"가 아니다 — §4
  tail += decoder.decode(value, { stream: true });
  const lines = tail.split(/\r\n|\r|\n/);
  tail = lines.pop() ?? "";                          // 마지막 조각은 미완성일 수 있다
  for (const line of lines) {
    if (line === "") { dispatch(eventName, dataLines); eventName = ""; dataLines = []; continue; }
    if (line.startsWith(":")) continue;              // 주석
    const i = line.indexOf(":");
    const field = i === -1 ? line : line.slice(0, i);
    let value_ = i === -1 ? "" : line.slice(i + 1);
    if (value_.startsWith(" ")) value_ = value_.slice(1);   // 공백 1개만
    if (field === "event") eventName = value_;
    else if (field === "data") dataLines.push(value_);
  }
}
```

`dispatch`는 `dataLines`가 비어 있으면 **아무것도 하지 않는다**(명세 #5).

---

## 4. 이벤트 7종 — 처리 등급

| event | 데이터 | 등급 | 처리 |
|---|---|---|---|
| `token` | `{delta}` | **필수** | 버퍼에 누적 |
| `retry` | `{reason}` | 🚨 **필수** | **token 버퍼를 비운다** |
| `done` | `{message_id, latency_ms}` | **필수** | 정상 종료 표시 |
| `error` | `{code, message}` | **필수** | §6 |
| `citations` | `{citations[]}` | 권장 | 제목 + 티어 배지 + 선택적 링크 |
| `verification` | `{verdict, reason}` | 권장 | 신뢰도 배지 |
| `stage` | `{stage}` | 선택 | 진행 표시 |

### 4.1 🚨 `retry`를 무시하면 틀린 답을 보여준다

정상 순서는 이렇다.

```
stage:retrieve → stage:generate → token×N(1차) → stage:verify
  → retry{reason} → stage:retrieve → stage:generate → token×M(2차) → stage:verify
  → citations → verification → done
```

**`retry` 수신 = 지금까지 누적한 delta를 버리라는 신호다.** 뒤이어 오는 token들은 **새 답변의 처음부터**다. 무시하면 1차와 2차 답변이 **이어붙어** 보인다.

**그리고 `retry`는 드문 예외가 아니다.** 재검색 조건이 「검증 결과가 약함/일반」인데 **검색 0건 경로가 곧바로 「일반」으로 확정**되므로, 근거를 못 찾으면 **항상** 걸린다. 코퍼스가 얇은 카테고리에서는 기본 경로에 가깝다.

**`reason`은 사용자에게 그대로 보여주지 않는다.** 내부 판정 사유이고 같은 값이 최종 `verification.reason`으로도 나간다. 재검색 안내는 자체 문구로 그린다.

### 4.2 🚨 `stage`는 횟수로 세지 않는다

노드 진입마다 오고 재검색이 걸리면 3노드를 다시 지나므로 **최대 6회**다. 「3단계 진행바」를 수신 **횟수**로 전진시키면 재검색 때 **되감기거나 넘쳐난다.**

→ **`stage` 값으로 상태를 정한다(멱등).** 카운터를 쓰지 않는다.

### 4.3 `citations`·`verification`·`done`은 끝에 한 번씩만 온다

재검색 여부와 무관하다. 그리고 **2차 결과만 담는다** — 그래프 상태가 덮어쓰기 채널이라 2차 검색 결과가 1차를 통째로 교체하기 때문이다. **1차의 부실한 근거가 섞이지 않는다.**

### 4.4 답변 본문은 마크다운이 아니다

생성 프롬프트가 마크다운 문법을 **금지**하고 항목마다 문단을 나누도록 지시한다.

→ **마크다운 렌더러를 붙이지 않는다.** 평문 + 문단 분리(`white-space: pre-wrap` 또는 빈 줄 split)로 그린다. LLM 출력이라 100% 보장은 아니지만, 마크다운 라이브러리를 번들에 넣을 이유는 없다.

### 4.5 인용은 제목까지만 가능하다

`citations[]` 항목은 `chunk_id`(**int**) · `title` · `source_tier` · `source_url`(nullable)뿐이다. **스니펫 필드가 없다.** 본문 발췌를 보여주려면 백엔드 스키마 변경이 선행되어야 한다.

---

## 5. 🚨 종료 판정 — `reader.read()`의 `done`을 믿지 않는다

백엔드는 **DB 커밋 뒤에** `done` 이벤트를 보낸다.

```
citations → verification → (assistant 메시지 DB 저장·커밋) → done
```

**따라서 `done` 이벤트 없이 스트림이 끊겨도 답변은 이미 저장돼 있을 수 있다.**

| 상황 | 잘못된 처리 | 올바른 처리 |
|---|---|---|
| `done` 미수신 후 스트림 종료 | 「실패」로 표시하고 재전송 → **중복 메시지** | **메시지 목록을 refetch**해서 저장 여부를 확인 |

**계약**

- `done` **이벤트** 수신 여부를 **별도 불리언**으로 추적한다
- 이벤트 없이 스트림이 닫히면 「불완전」 상태로 두고 **refetch 경로**를 탄다
- `reader.read()`의 `done: true`는 「바이트가 끝났다」는 뜻이지 「답변이 완성됐다」는 뜻이 아니다

**왜 이런 일이 생기나** — 배포 환경의 인그레스에 **읽기 타임아웃 60초**가 걸려 있다. 마지막 token과 `citations` 사이에는 검증 노드의 LLM 왕복이 통째로 들어가므로, 그 무음 구간이 길면 종료 이벤트 없이 연결이 닫힌다.

---

## 6. 에러는 두 갈래다

| 갈래 | 형태 | 처리 |
|---|---|---|
| **스트림 시작 전** | 일반 HTTP 에러 (401 · 404 등) | `apiFetch`와 같은 정규화 → 가드가 처리 |
| **스트림 시작 후** | `event: error` 후 **즉시 종료** | HTTP 상태는 이미 200이라 바꿀 수 없다 |

스트림 내 에러 코드는 2종이다 — `RATE_LIMITED` · `UPSTREAM_LLM_ERROR`. 둘 다 **`citations`·`verification`·`done`이 오지 않는다.**

### 6.1 🚨 에러 시 「답변 없는 사용자 메시지」가 남는다

사용자 메시지는 **스트림 시작 전에** 커밋되고, 어시스턴트 메시지는 저장되지 않는다.

→ **목록을 다시 그릴 때 답변이 없는 user 메시지가 렌더링 가능해야 한다.** 「모든 user 메시지 뒤에는 assistant 메시지가 있다」를 가정하면 화면이 깨진다.

### 6.2 응답 잘림은 프론트에 `error`로 온다

업스트림이 길이 제한으로 응답을 자르면 백엔드의 JSON 파싱이 실패하고, 그것이 `UPSTREAM_LLM_ERROR`로 나온다. 백엔드는 잘림 여부를 **검사하지 않는다**. 즉 **「모델이 말을 하다 만 것」과 「진짜 업스트림 장애」가 같은 코드로 온다** — 사용자 문구를 「일시적 오류, 다시 시도해 주세요」로 통일한다.

---

## 7. 타임아웃 · 중단

- `AbortController` 타임아웃은 **60초보다 충분히 길게** 잡는다. 인그레스 타임아웃이 60초이고 재검색이 걸리면 LLM 왕복이 최대 6회로 늘어난다. **무음 구간이 아니라 전체 스트림 기준**으로 잡는다
- 사용자 취소 버튼을 **별도로** 둔다 — 타임아웃만으로는 사용자가 기다림을 끊을 수 없다
- 화면을 떠나면 `abort()`한다. 안 하면 스트림이 백그라운드에서 계속 돈다
- **재개는 없다.** 끊기면 §5의 refetch 경로다

---

## 8. 로딩 UI

마지막 token과 `citations` 사이에는 **검증 LLM 왕복 1회가 통째로** 들어간다. `stage: verify`가 그 구간을 정확히 알려 주지만 **배포가 늦으면 오지 않는다.**

**계약** — `stage`를 받으면 그 값으로 표시하고, **안 받으면 자체 추론으로 폴백**한다.

| 상태 | `stage` 있을 때 | 없을 때 |
|---|---|---|
| 검색 중 | `retrieve` | 첫 token 이전 |
| 작성 중 | `generate` | token 흐르는 중 |
| 확인 중 | `verify` | token이 멈춘 뒤 |

**`stage` 유무로 코드가 갈리지 않게 같은 상태 열거형에 두 입력을 매핑한다.** 분기를 두면 배포 전후로 화면이 달라지고, 그 차이를 아무도 테스트하지 않는다.

---

## 9. 테스트 — 실패 모드를 픽스처로 고정한다

**로컬에는 인그레스가 없어 「잘림」이 재현되지 않는다.** 그래서 §5의 복구 경로는 **로컬 실행으로 검증할 수 없고**, 계약 픽스처로만 고정된다.

| 케이스 | 고정할 계약 |
|---|---|
| 청크가 **줄 중간**에서 분할 | 이벤트가 정상 조립된다 |
| 청크가 **UTF-8 문자 중간**에서 분할 | 한글이 깨지지 않는다 (§3.2 #7 회귀) |
| `:` 주석 줄 유입 | 무시된다 |
| CRLF · CR 줄바꿈 | LF와 동일하게 파싱된다 |
| `retry` 수신 | **token 버퍼가 비워진다** |
| `stage` 6회 수신 | 진행 표시가 **되감기지 않는다** |
| **`done` 없이** 스트림 종료 | 「불완전」으로 표시되고 **refetch 경로**를 탄다 |
| `error` 후 종료 | `citations`/`done` 없이도 화면이 성립한다 |
| 답변 없는 user 메시지 | 목록이 정상 렌더링된다 |
| 빈 `data` 버퍼 | **디스패치되지 않는다** |

이 테스트들은 `npm test` 안에서 돌린다 — **게이트를 늘리지 않는다.**

---

## 10. 배포가 늦을 때를 전제로 짠다

`stage` · `retry` · 평가 엔드포인트 · 전역 상담(카테고리 없는 세션)은 **코드에는 있지만 배포본에 없을 수 있다.**

| 계약 | 없으면 |
|---|---|
| `stage` | 로딩 표시가 §8의 폴백으로 간다 — 기능 손실 없음 |
| `retry` | **안 오는 것이 정상**이고, 오면 반드시 처리한다 |
| 평가 엔드포인트 | 404를 정상 경로로 흡수한다(낙관적 UI + 조용한 실패) 또는 배포 확인 후 붙인다 |
| `user_rating` 필드 | **optional로 읽는다** |
| 전역 상담 | 카테고리 없는 세션 생성이 422로 막힐 수 있다 → **카테고리 진입점부터 만든다** |

**「없으면 조금 덜 친절할 뿐」이어야 하고, 없어서 화면이 깨지면 안 된다.**
