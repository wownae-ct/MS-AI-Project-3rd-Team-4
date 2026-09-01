// vitest 전역 준비 — jsdom 이 구현하지 않은 브라우저 API 를 최소한만 채운다.
//
// 흉내는 "없으면 테스트가 아예 안 도는 것"에만 낸다. 동작까지 흉내 내기 시작하면 테스트가
// 브라우저가 아니라 이 파일을 검증하게 된다 — 아래 각 스텁에 왜 필요한지가 적혀 있다.
import "@testing-library/jest-dom/vitest";

// jsdom은 Window.scrollTo는 "not implemented" 경고만 내고 넘어가지만(스텁 존재), 실제 브라우저와
// 달리 Element.prototype.scrollTo 자체가 아예 없다 — ChatPanel.tsx가 메시지 목록 컨테이너에
// `listRef.current?.scrollTo(...)`를 쓰는데, 이게 없으면 TypeError로 렌더가 통째로 실패해
// ChatPanel.test.tsx의 모든 테스트가 깨진다(2026-08-26). 실제 스크롤 동작은 검증 대상이
// 아니라 no-op으로만 채운다.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom은 HTMLDialogElement와 `dialog:not([open]){display:none}` 기본 스타일까지는 구현하지만
// showModal()/close()는 없다(2026-08-29 실측, jsdom 30) — ConfirmDialog.tsx가 모달 동작 전체를
// 브라우저에 맡기고 있어서, 이게 없으면 확인 다이얼로그를 쓰는 테스트가 TypeError로 죽는다.
// **여기서 흉내 내는 것은 UA 동작의 최소한(열림 상태 토글 + close 이벤트)뿐이다** — 포커스
// 트랩·배경 inert·top layer 는 흉내 내지 않는다. 그건 브라우저 몫이고, 흉내 낸 것을 테스트하면
// 테스트가 브라우저가 아니라 이 스텁을 검증하게 된다.
function showModalStub(this: HTMLDialogElement) {
  this.open = true;
}

function closeStub(this: HTMLDialogElement) {
  if (!this.open) return;
  this.open = false;
  this.dispatchEvent(new Event("close"));
}

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = showModalStub;
  HTMLDialogElement.prototype.close = closeStub;
}

// 같은 이유로 scrollIntoView 도 없다 — Step8Allocation.tsx가 총예산 인라인 수정 패널을 펼칠 때
// 요약 카드를 화면 위로 올리는 데 쓴다(2026-08-28). 없으면 effect가 TypeError로 터져 8단계를
// 렌더하는 테스트가 통째로 깨진다. 실제 스크롤 동작은 검증 대상이 아니라 no-op으로만 채운다.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
