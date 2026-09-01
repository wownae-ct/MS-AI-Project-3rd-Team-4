// 앱 진입점 — 마운트, 그리고 어느 슬라이스에도 속하지 않는 전역 배선 두 가지.
//
// 이 파일이 조립 레이어인 이유: 세션 만료 처리는 shared 가 entities 를 알아야 하는데 그건
// 레이어 규칙에 어긋난다(아래 참조). 그래서 shared 가 구독 지점만 열어 두고, 실제 연결은
// 위에서 내려다보는 이 파일이 한다.
import { StrictMode, type ErrorInfo } from "react";
import { createRoot } from "react-dom/client";
import { invalidateSession } from "@/entities/session";
import { onUnauthorized, reportClientError } from "@/shared/api";
import { ErrorBoundary } from "@/shared/ui";
import "@/shared/ui/styles.css";
import App from "./App";

// 세션이 사용 중 만료되면(슬라이딩 갱신이 없어 30일째 반드시 온다) 캐시된 세션이 거짓을 말한다.
// shared/api 는 entities 를 import 할 수 없으므로(하향 규칙) 구독으로 뒤집고, 배선은 조립
// 레이어인 여기서 한다. entities/session 이 모듈 로드 부작용으로 스스로 등록하지 않는 이유는
// 그러면 배선이 import 순서에 숨고 트리셰이킹으로 조용히 사라질 수 있기 때문이다.
onUnauthorized(invalidateSession);

// 렌더 크래시가 사용자 본인 브라우저 콘솔 밖으로 전혀 안 나가던 것(로깅 관측성 감사,
// 2026-08-26)을 고친다 — ErrorBoundary 자신의 console.error 는 유지된 채, 백엔드
// POST /api/v1/client-errors(PR #78, 인증 불필요)로도 fire-and-forget 전송한다.
function handleRenderCrash(error: Error, info: ErrorInfo): void {
  reportClientError({
    message: error.message,
    stack: error.stack ?? null,
    componentStack: info.componentStack ?? null,
    url: location.href,
    userAgent: navigator.userAgent,
  });
}

// 마운트 지점이 없으면 여기서 원인을 말하고 멈춘다.
// non-null 단언(`!`)으로 넘기면 createRoot가 내부에서 불투명한 오류를 던져 원인이 지워진다.
const rootElement = document.querySelector("#root");
if (!rootElement) {
  throw new Error('마운트 지점 "#root"를 찾지 못했다 — index.html의 <div id="root">가 바뀌었는지 확인할 것.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary onError={handleRenderCrash}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
