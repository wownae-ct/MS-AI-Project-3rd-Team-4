// Loading 의 두 계약 — **지연 게이트**와 **live region 갱신**.
//
// 둘 다 눈으로는 검증할 수 없는 종류다(타이밍과 보조기기 노출). 그래서 여기서 고정한다.
//
// 왜 지연이 계약인가: 이 표시는 사용자가 유발하지 않은 대기(화면 진입·배경 조회)에 쓴다.
// 즉시 그리면 빠른 응답에서 문구가 떴다 사라지는 깜빡임이 되고, 그건 진행 표시가 아니라
// 결함으로 읽힌다. 이 게이트가 사라지면 8개 화면이 한꺼번에 그 상태로 되돌아간다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Loading } from "./Loading";

afterEach(() => {
  vi.useRealTimers();
});

describe("Loading — 지연 게이트", () => {
  it("기본 지연이 지나기 전에는 문구를 내지 않는다", () => {
    vi.useFakeTimers();
    render(<Loading />);

    act(() => {
      vi.advanceTimersByTime(199);
    });

    expect(screen.queryByText("불러오는 중…")).not.toBeInTheDocument();
  });

  it("지연이 지나면 문구를 낸다", () => {
    vi.useFakeTimers();
    render(<Loading />);

    // act 로 감싸야 타이머가 부른 setState 가 실제로 커밋된다 — 감싸지 않으면 틱은 돌지만
    // 이 테스트가 읽는 DOM 에 반영되지 않는다(NumberInput.test.tsx 와 같은 사유).
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText("불러오는 중…")).toBeInTheDocument();
  });

  // 라우트 전환은 라우터가 이미 1초를 기다린 뒤에 그린다 — 거기서 또 지연을 걸면 화면이 빈다.
  it("delayMs 0 이면 최초 렌더 직후에 낸다", () => {
    vi.useFakeTimers();
    render(<Loading delayMs={0} />);

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(screen.getByText("불러오는 중…")).toBeInTheDocument();
  });

  it("언마운트하면 타이머가 남지 않는다", () => {
    vi.useFakeTimers();
    const { unmount } = render(<Loading />);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Loading — 보조기기 노출", () => {
  // `<output>` 은 암묵 role="status" + aria-live="polite" 다. 이 요소가 **처음부터 비어 있다가
  // 나중에 채워지는** 것이 계약이다 — 내용을 가진 채로 마운트되는 live region 은 "변화"가 아니라
  // 초기 콘텐츠라 스크린리더가 읽지 않을 수 있다.
  it("문구가 뜨기 전에도 live region 자체는 이미 붙어 있다", () => {
    vi.useFakeTimers();
    render(<Loading />);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("지연 후 그 live region 안에 문구가 들어간다", () => {
    vi.useFakeTimers();
    render(<Loading />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중…");
  });

  // 스켈레톤과 함께 쓸 때 — 형태가 이미 대기를 보여주므로 문구는 보조기기에만 낸다.
  it("srOnly 여도 접근 가능한 문구는 그대로 낸다", () => {
    vi.useFakeTimers();
    render(<Loading srOnly />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중…");
  });

  it("무엇을 기다리는지 문구를 바꿔 말할 수 있다", () => {
    vi.useFakeTimers();
    render(<Loading label="시세를 비교하는 중…" />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole("status")).toHaveTextContent("시세를 비교하는 중…");
  });
});
