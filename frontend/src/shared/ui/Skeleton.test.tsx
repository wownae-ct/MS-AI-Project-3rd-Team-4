// SkeletonRows 의 접근성 계약.
//
// 자리표시는 **시각 전용**이다. 행이 N개라고 보조기기에서 N번 읽히면 "불러오는 중" 하나를
// 전하려다 소음을 만든다 — 그 announce 는 같은 영역의 `Loading` 이 한 번만 낸다.
//
// jsdom 은 레이아웃을 계산하지 않으므로 "폭이 얼마"는 여기서 단언할 수 없다(D11 이 Progress 에서
// 겪은 것과 같은 한계). 이 파일이 고정하는 것은 **보조기기 노출**까지다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Loading } from "./Loading";
import { SkeletonRows } from "./Skeleton";

describe("SkeletonRows", () => {
  it("요청한 수만큼 행을 그린다", () => {
    render(<SkeletonRows count={3} />);

    // 바깥 요소 1개 + 행 3개.
    expect(document.querySelectorAll("span")).toHaveLength(4);
  });

  // 이것이 이 컴포넌트의 핵심 계약이다.
  it("보조기기에서 통째로 빠진다 — 장식이기 때문이다", () => {
    render(<SkeletonRows count={4} />);

    expect(document.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  // 실제 사용 모양 — 자리표시 + 문구 하나. 문구가 행 수만큼 늘어나면 안 된다.
  it("Loading 과 함께 놓아도 읽히는 상태 문구는 하나뿐이다", () => {
    render(
      <div>
        <SkeletonRows count={5} />
        <Loading srOnly />
      </div>,
    );

    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
