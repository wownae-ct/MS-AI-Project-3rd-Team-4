// app 조립 — 라우터를 붙인다 (ADR 0005).
//
// 여기가 얇은 이유는 화면 배선이 전부 `router/` 의 라우트 트리에 있기 때문이다. 트리가 셸 계약까지
// 표현하므로(온보딩은 `_shell` 밖) 여기에 조건 분기가 생기면 그건 트리로 옮겨야 할 신호다.
//
// `RouterProvider` 는 URL 을 화면 상태의 단일 출처로 만든다 — 이전의 `useState` 페이즈 전환으로는
// 공유 가능한 URL·뒤로가기·새로고침·`aria-current` 계산이 전부 불가능했다(ADR 0005 §맥락).
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

function App() {
  return <RouterProvider router={router} />;
}

export default App;
