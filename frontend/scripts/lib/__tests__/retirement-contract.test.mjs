// @vitest-environment node
//
// 폐기 계약 — 실제 theme.css 를 Tailwind 에 넣고 컴파일해 「사라져야 할 것이 사라지고, 살아남는 것은 살아남는다」를 고정한다.
//
// 왜 둘 다 단언하나 — 살아남는 것(ring-* · 임의값 · rounded-none)은 게이트가 맡아야 할 몫의 경계다.
// 어느 날 Tailwind 업그레이드로 ring 이 --shadow-* 네임스페이스에 묶이거나 임의값이 테마를 조회하게 되면
// 여기서 먼저 깨지고, 그때 namespaces.md 의 표와 게이트 범위를 다시 정한다.
//
// 컴파일 프로브는 ghost-candidates 와 공유한다(./tailwind-probe.mjs) — 두 테스트가 같은 질문을 서로 다른
// 목적으로 하므로 헬퍼를 각자 두면 둘이 갈린다. compile() 이 준내부 API 인 사정과 compiler 재사용 금지도 거기 적었다.
import { describe, expect, it } from "vitest";
import { generated } from "./tailwind-probe.mjs";

describe("폐기로 사라지는 것 — D1 · D10", () => {
  it("라운드 기본 8단계가 생성되지 않는다", async () => {
    const got = await generated(["rounded-3xl", "rounded-2xl", "rounded-xl", "rounded-xs"]);
    expect(got).toEqual({
      "rounded-3xl": false,
      "rounded-2xl": false,
      "rounded-xl": false,
      "rounded-xs": false,
    });
  });
  it("그림자 4계열이 생성되지 않는다", async () => {
    const got = await generated(["shadow", "shadow-md", "inset-shadow-sm", "drop-shadow", "drop-shadow-md", "text-shadow-sm"]);
    expect(Object.values(got)).toEqual([false, false, false, false, false, false]);
  });
});

describe("정의한 토큰은 생성된다", () => {
  it("라운드 4단계와 색 8종", async () => {
    const got = await generated([
      "rounded-sm",
      "rounded-md",
      "rounded-lg",
      "rounded-pill",
      "bg-primary",
      "bg-primary-soft",
      "bg-primary-hover",
      "text-ink",
      "text-ink-soft",
      "bg-bg",
      "bg-surface",
      "border-line",
    ]);
    expect(Object.values(got).every(Boolean)).toBe(true);
  });
});

describe("폐기가 못 막는 것 — 게이트가 맡는 경계를 고정한다", () => {
  it("ring-* 4종은 살아남는다 (→ 게이트가 --tw-ring-* 커스텀 속성과 소스 토큰을 잡는다, D9)", async () => {
    const got = await generated(["ring", "ring-2", "ring-primary", "inset-ring-2"]);
    expect(got).toEqual({ ring: true, "ring-2": true, "ring-primary": true, "inset-ring-2": true });
  });
  it("임의값은 테마를 조회하지 않는다 (→ 게이트가 산출 색과 소스 토큰을 잡는다, D8)", async () => {
    const got = await generated(["bg-[#77354F]"]);
    expect(got["bg-[#77354F]"]).toBe(true);
  });
  it("rounded-none 은 살아남지만 값이 0 이라 토큰 밖이 아니다", async () => {
    const got = await generated(["rounded-none"]);
    expect(got["rounded-none"]).toBe(true);
  });
  it("rounded-full 도 살아남는다 — staticValues 라 네임스페이스 폐기와 무관 (→ 게이트가 calc(infinity*1px) 를 잡는다, D1)", async () => {
    // 이 사실은 이 테스트가 처음 잡았다 — 그 전 실험의 셀렉터 판독 코드에 버그가 있어 「사라진다」고 잘못 기록돼 있었다.
    const got = await generated(["rounded-full"]);
    expect(got["rounded-full"]).toBe(true);
  });
});
