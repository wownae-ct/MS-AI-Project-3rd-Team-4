// app 조립.
//
// **임시 상태다.** 지금은 스타일가이드 한 화면만 렌더한다.
//
// 왜 제품 화면이 없는가 — **주제와 화면 기획이 아직 확정되지 않았다.** 스펙 없이 화면을 지어내지 않는다.
// 스타일가이드는 그때까지 디자인 시스템이 실제로 동작하는지 확인하는 수단이자,
// 화면을 지을 때 보는 참조 문서다.
//
// 화면이 여럿 생기고 딥링크가 필요해지면 여기가 라우터로 바뀐다 —
// useState 페이즈 전환으로는 공유 가능한 URL 을 만들 수 없다. 라우터 선택은 ADR 0005 로 확정한다.
// 스타일가이드는 pages/style-guide 에 그대로 남는다.
import { StyleGuidePage } from "@/pages/style-guide";

function App() {
  return <StyleGuidePage />;
}

export default App;
