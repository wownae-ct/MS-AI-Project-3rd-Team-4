// 트러블슈팅 STEP 1-D — "취소"를 눌러도 진행 중이던 영수증 OCR 요청이 실제로 abort되지
// 않던 버그의 회귀 테스트. AbortController를 만들어 두기만 하고 .abort()를 부르지 않아,
// 사용자가 취소해도 요청은 백그라운드에서 계속 진행됐다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddPaymentRow } from "./AddPaymentRow";

const createPaymentMock = vi.fn();
const getReceiptExtractMock = vi.fn();

vi.mock("../api/payment", () => ({
  createPayment: (...args: unknown[]) => createPaymentMock(...args),
  getReceiptExtract: (file: File, signal?: AbortSignal) => getReceiptExtractMock(file, signal),
}));

function selectReceiptFile() {
  const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
  // 파일 입력은 sr-only 라 접근성 쿼리로 잡히지 않는다 — 실제 사용자 흐름(버튼 클릭 → 숨은
  // input.click())과 동일하게 change 이벤트로 시뮬레이션한다.
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  createPaymentMock.mockReset();
  getReceiptExtractMock.mockReset();
});

describe("영수증 OCR 취소 버튼", () => {
  it("추출이 진행 중일 때 취소를 누르면 진행 중이던 요청이 실제로 abort된다", async () => {
    const user = userEvent.setup();
    let capturedSignal: AbortSignal | undefined;
    getReceiptExtractMock.mockImplementation(
      (_file: File, signal?: AbortSignal) =>
        new Promise(() => {
          // 절대 resolve/reject 하지 않는다 — "진행 중" 상태를 고정해 취소 타이밍을 재현한다.
          capturedSignal = signal;
        }),
    );

    render(<AddPaymentRow categoryCode="VENUE" onAdded={() => {}} />);
    await user.click(screen.getByRole("button", { name: "+ 납부 항목 추가" }));
    selectReceiptFile();

    expect(await screen.findByRole("button", { name: "영수증 분석 중…" })).toBeInTheDocument();
    expect(capturedSignal?.aborted).toBe(false);

    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(capturedSignal?.aborted).toBe(true);
  });
});

// D18 — 라벨 앞의 📷 컬러 이모지를 IconCamera 로 바꿨다. 접근명이 "📷 영수증으로 채우기"라
// 일부 스크린리더가 이모지 이름("카메라")까지 읽던 것도 함께 해소된다.
describe("영수증 버튼 — 이모지 대신 아이콘", () => {
  it("접근명에 이모지가 섞이지 않는다", async () => {
    const user = userEvent.setup();
    render(<AddPaymentRow categoryCode="VENUE" onAdded={() => {}} />);
    await user.click(screen.getByRole("button", { name: "+ 납부 항목 추가" }));

    expect(screen.getByRole("button", { name: "영수증으로 채우기" })).toBeInTheDocument();
  });

  // RTL 의 렌더 루트를 구조 분해하지 않고 document.body 로 읽는다 — 그 식별자가 Tailwind
  // 스캐너의 bare 후보가 되어 유령 유틸리티를 만든다(ghost-candidates.test.mjs).
  it("펼친 폼 어디에도 이모지가 렌더되지 않는다", async () => {
    const user = userEvent.setup();
    render(<AddPaymentRow categoryCode="VENUE" onAdded={() => {}} />);
    await user.click(screen.getByRole("button", { name: "+ 납부 항목 추가" }));

    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("영수증 파일 입력", () => {
  it("capture 속성이 없어 브라우저 기본 선택 UI(카메라/갤러리 둘 다)를 사용한다", async () => {
    const user = userEvent.setup();
    render(<AddPaymentRow categoryCode="VENUE" onAdded={() => {}} />);
    await user.click(screen.getByRole("button", { name: "+ 납부 항목 추가" }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.hasAttribute("capture")).toBe(false);
  });
});
