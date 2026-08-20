# shared/api — 전송 계층

여기에는 **도메인을 모르는 것만** 둔다.

| 파일 | 역할 |
|---|---|
| `client.ts` | `http`(JSON 래퍼) · `ApiError` · `API_BASE` 재노출 |
| `health.ts` | 인프라 헬스체크 (`/healthz` — `/api/v1` 프리픽스 없음) |

## 도메인 요청 함수는 여기 없다

각 엔티티의 `api` 세그먼트에 있다:

| 엔티티 | 위치 |
|---|---|
| question | `entities/question/api/` |
| answer | `entities/answer/api/` (오디오 업로드 multipart · SSE 스트림 URL) |
| practice-session | `entities/practice-session/api/` |
| report | `entities/report/api/` |

**왜 옮겼나** — `shared`는 FSD 하향 규칙상 `entities`를 import할 수 없다. 그래서 도메인 타입을 쓰는 엔드포인트를 여기 두면 **타입을 복제하는 것 외에 방법이 없었고**, 실제로 `QuestionCategory`가 두 곳에 정의돼 있었다. FSD 공식 정의상 `api`는 슬라이스가 가질 수 있는 표준 세그먼트다 — "backend interactions: request functions, data types, mappers". 설계 근거: [`docs/architecture/layers.md` §2.1](../../../docs/architecture/layers.md).

## 응답 타입은 `unknown`이다

백엔드 계약이 확정되지 않아 **지어내지 않았다.** 계약이 정해지면 좁히는 지점은 각 엔티티의 `api` 세그먼트이지 호출부가 아니다.

## multipart는 `http`를 쓰지 않는다

`entities/answer/api`의 `submitAnswer`가 `fetch`를 직접 호출하는 것은 **의도된 설계다.** `FormData`는 브라우저가 boundary를 포함한 `Content-Type`을 스스로 정해야 하는데, JSON 전용 래퍼를 태우면 그 헤더가 덮여 서버가 파싱하지 못한다.

## 헤더 병합 순서

`client.ts`의 `fetch` 호출에서 `headers`는 반드시 `...init` **뒤에** 온다. 앞에 두면 `init.headers`가 병합 결과를 통째로 덮어써 `Content-Type` 기본값이 사라진다. 회귀 테스트는 `client.test.ts`의 「헤더 병합」에 있다.
