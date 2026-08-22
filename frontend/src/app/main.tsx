import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@/shared/ui";
import "@/shared/ui/styles.css";
import App from "./App";

// 마운트 지점이 없으면 여기서 원인을 말하고 멈춘다.
// non-null 단언(`!`)으로 넘기면 createRoot가 내부에서 불투명한 오류를 던져 원인이 지워진다.
const rootElement = document.querySelector("#root");
if (!rootElement) {
  throw new Error('마운트 지점 "#root"를 찾지 못했다 — index.html의 <div id="root">가 바뀌었는지 확인할 것.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
