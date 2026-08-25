// import.meta.env 를 읽는 **유일한** 지점.
//
// 폴백하지 않는다. `?? ""` 는 값 부재를 조용히 삼켜 요청을 상대 경로로 떨어뜨린다
// (docs/architecture/toolchain.md §6.3).
//
// 🚨 **모듈 최상위에서 검증하지 않는다.** 상수로 내보내면 모듈 평가 시점에 값을 요구하는데,
//    그러면 세 가지가 깨진다(docs/architecture/backend-integration.md §2.1):
//      1) CI 테스트 전멸 — frontend-ci.yml 의 Test 스텝에는 env 가 없고 러너에 .env 도 없다.
//         네트워크를 쓰지 않는 테스트까지 import 단계에서 함께 죽는다.
//      2) ErrorBoundary 가 못 잡는다 — 바운더리는 렌더 중 예외를 잡고, 모듈 평가 예외는
//         통과한다. 「조용한 실패 금지」를 지키려던 코드가 가장 조용한 실패(흰 화면)를 만든다.
//      3) vite.config.ts(Node)가 이 파일을 읽을 수 없다.
//    그래서 **최초 사용 시점**으로 늦춘다. 실질적으로 이 예외는 일어날 수 없다 —
//    빌드 게이트가 같은 함수로 먼저 막는다.
import { checkApiBase } from "./api-base";
import { ApiError } from "./errors";

let resolved: string | undefined;

/** API 오리진(끝 슬래시 없음). `/api/v1` 은 호출부가 붙인다. 최초 호출에서 검증한다. */
export function apiBase(): string {
  if (resolved !== undefined) return resolved;
  const raw = import.meta.env.VITE_API_BASE;
  const reason = checkApiBase(raw);
  if (reason !== null) {
    // 화면이 이미 아는 형태로 던진다 — 별도 처리 경로를 만들지 않는다.
    throw new ApiError({ code: "API_BASE_INVALID", message: `VITE_API_BASE: ${reason}`, status: 0, extra: {} });
  }
  resolved = raw as string;
  return resolved;
}
