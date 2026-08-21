// app 조립 검증.
//
// 지금 App 이 하는 일은 스타일가이드 한 화면을 그리는 것뿐이다(제품 화면 스펙 미도착).
// 그래서 여기서 고정할 것은 화면 흐름이 아니라 **조립이 실제로 이어져 있는가** 하나다.
// 라우터가 들어오면(ADR 0005) 이 파일이 라우팅 검증으로 바뀐다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App 조립", () => {
  it("스타일가이드 화면을 렌더한다", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "디자인 시스템" })).toBeInTheDocument();
  });

  it("본문 영역이 main 랜드마크로 노출된다", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
