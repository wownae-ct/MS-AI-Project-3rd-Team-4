// shared/api public API — 전송 계층만. 도메인을 모른다.
//
// 도메인 요청 함수는 여기 두지 않는다. 각 엔티티의 api 세그먼트(entities/{slice}/api/)에 있다.
// 이유: shared는 entities를 import할 수 없어(FSD 하향 규칙), 도메인 타입을 쓰는 엔드포인트를
// 여기 두면 타입을 복제하는 것 외에 방법이 없다. 실제로 그래서 QuestionCategory가 이중 정의돼 있었다.
export { API_BASE, ApiError, http } from "./client";

// 인프라 헬스체크 — 도메인이 아니라서 여기 남는다(/healthz, /api/v1 프리픽스 없음).
export * as healthApi from "./health";
