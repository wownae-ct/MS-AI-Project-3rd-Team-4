// report 슬라이스 public API.
//
// 모델이 없는 슬라이스다 — 백엔드 응답 계약이 정해지지 않아 타입을 지어내지 않았기 때문이다.
// FSD상 슬라이스는 세그먼트를 일부만 가질 수 있다. 계약이 확정되면 model.ts를 같은 슬라이스에 추가한다.
//
// practice-session이 아니라 별도 슬라이스인 이유: 엔드포인트 루트가 다르다.
// 세션은 /api/v1/sessions/…, 리포트는 /api/v1/users/{userId}/reports/… 로 사용자 단위 집계다.
export * as reportApi from "./api";
