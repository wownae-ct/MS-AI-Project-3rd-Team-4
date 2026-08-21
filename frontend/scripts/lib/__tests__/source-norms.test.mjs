// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkSourceNorms } from "../source-norms.mjs";

const norms = (text) => checkSourceNorms(text, "x.tsx").map((v) => v.norm);

describe("색 임의값", () => {
  it("bg-[#hex] 류를 잡고 변이 접두를 허용한다", () => {
    expect(norms('className="bg-[#77354F]"')).toEqual(["color"]);
    expect(norms('className="hover:text-[#fff] md:border-[#abcd]"')).toEqual(["color", "color"]);
  });
  it("팔레트 색을 임의값으로 써도 잡는다 — 토큰 우회다", () => {
    expect(norms('"bg-[#8b3f63]"')).toEqual(["color"]);
  });
  it("px-[11px] 같은 비-색 임의값은 건드리지 않는다", () => {
    expect(norms('"rounded-sm px-[11px]"')).toEqual([]);
  });
});

describe("ring", () => {
  it("ring · ring-2 · ring-primary · inset-ring-2 · focus:ring 을 잡는다", () => {
    expect(norms('"ring"')).toEqual(["ring"]);
    expect(norms('"ring-2 ring-primary inset-ring-2 focus-visible:ring"')).toEqual(["ring", "ring", "ring", "ring"]);
  });
  it("산문의 `ring-*` 와 during 같은 단어는 매치하지 않는다", () => {
    expect(norms("ring-* 금지 — during the render")).toEqual([]);
  });
  it("outline-* 는 통과한다 (대체 수단)", () => {
    expect(norms('"outline-2 outline-offset-2 outline-primary"')).toEqual([]);
  });
});

describe("그림자", () => {
  it("shadow · shadow-md · drop-shadow-lg · text-shadow-sm · inset-shadow-xs 를 잡는다", () => {
    expect(norms('"shadow shadow-md drop-shadow-lg text-shadow-sm inset-shadow-xs"')).toHaveLength(5);
  });
  it("box-shadow 라는 단어는 매치하지 않는다 (CSS 속성명 서술)", () => {
    expect(norms("box-shadow 는 값까지 본다")).toEqual([]);
  });
});

describe("위치", () => {
  it("file:line:col 을 돌려준다", () => {
    const [v] = checkSourceNorms('const a = 1;\n  const cls = "bg-[#77354F]";', "src/x.tsx");
    expect(v.where).toBe("src/x.tsx:2:16");
    expect(v.value).toContain("bg-[#77354F]");
  });
});
