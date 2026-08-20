// 에러 바운더리 검증. 1급 회귀는 "예외가 화면을 통째로 비우지 않는다"이다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("의도된 실패");
  return <p>정상 화면</p>;
}

beforeEach(() => {
  // React가 잡힌 예외를 console.error로 다시 뱉는다. 테스트 출력을 더럽히지 않도록 막되,
  // 바운더리 자신의 로깅은 아래 테스트에서 별도로 확인한다.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("예외가 없으면 children을 그대로 보여준다", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("정상 화면")).toBeInTheDocument();
  });

  it("렌더 중 예외를 잡아 안내 화면을 보여준다 — 빈 화면이 되지 않는다", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "문제가 발생했습니다" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("예외를 조용히 삼키지 않는다 — console.error로 남긴다", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    const logged = vi.mocked(console.error).mock.calls.some((args) => String(args[0]).includes("[ErrorBoundary]"));
    expect(logged).toBe(true);
  });

  it("onError 훅으로 예외를 전달한다", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(onError).mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it("fallback을 주면 그것을 그린다", () => {
    render(
      <ErrorBoundary fallback={(error) => <p>대체: {error.message}</p>}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText("대체: 의도된 실패")).toBeInTheDocument();
  });

  it("다시 시도를 누르면 정상 children으로 복귀한다", () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "문제가 발생했습니다" })).toBeInTheDocument();

    // 원인이 사라진 뒤에 reset해야 복귀한다 — 그대로 reset하면 같은 예외가 다시 난다.
    rerender(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(screen.getByText("정상 화면")).toBeInTheDocument();
  });
});
