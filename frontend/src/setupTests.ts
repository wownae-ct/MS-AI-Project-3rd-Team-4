import "@testing-library/jest-dom/vitest";

// jsdom은 Window.scrollTo는 "not implemented" 경고만 내고 넘어가지만(스텁 존재), 실제 브라우저와
// 달리 Element.prototype.scrollTo 자체가 아예 없다 — ChatPanel.tsx가 메시지 목록 컨테이너에
// `listRef.current?.scrollTo(...)`를 쓰는데, 이게 없으면 TypeError로 렌더가 통째로 실패해
// ChatPanel.test.tsx의 모든 테스트가 깨진다(2026-08-26). 실제 스크롤 동작은 검증 대상이
// 아니라 no-op으로만 채운다.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
