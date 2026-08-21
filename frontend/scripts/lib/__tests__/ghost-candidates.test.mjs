// @vitest-environment node
//
// 유령 후보 — 산문(주석 · 마크다운 표)이 유틸리티를 만들던 사고의 재발 방지.
//
// Tailwind 는 소스를 파싱하지 않고 평문으로 훑는다(공식: "doesn't attempt to actually parse your files as code").
// 그래서 README 표의 "p-5 p-6" 과 주석의 bare "rounded" 가 산출 CSS 에 .p-5 .p-6 .rounded{border-radius:.25rem} 을
// 만들었다(2026-08-21 실측 — .rounded 는 토큰 밖 4px 였다). styles.css 가 @source not 으로 .md 를 빼고 문구를 고쳤다.
//
// 이 테스트는 Vite 플러그인이 쓰는 **같은 스캐너**(@tailwindcss/oxide Scanner)로 styles.css 와 같은 소스 집합을 훑어
// 후보 목록에 유령이 없음을 고정한다. 빌드 없이 npm test 만으로 잡힌다.
//
// @tailwindcss/oxide 는 @tailwindcss/vite 가 선언한 전이 의존(tailwindcss 와 같은 4.3.3 정확 핀)이지만
// 암묵적으로 쓰지 않고 devDependencies 에 명시했다. 둘은 함께 올린다.
import { resolve } from "node:path";
import { Scanner } from "@tailwindcss/oxide";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");

// styles.css 의 @source 와 같은 집합 — src/ 전체 + index.html, 마크다운 제외.
// 여기가 styles.css 와 어긋나면 테스트가 보는 것과 빌드가 보는 것이 달라진다. 둘을 함께 고친다.
const scanner = new Scanner({
  sources: [
    { base: resolve(ROOT, "src"), pattern: "**/*", negated: false },
    { base: ROOT, pattern: "index.html", negated: false },
    { base: resolve(ROOT, "src"), pattern: "**/*.md", negated: true },
  ],
});
const candidates = new Set(scanner.scan());

describe("스캐너 후보에 유령이 없다", () => {
  it("README 표가 만들던 p-5 · p-6 이 없다", () => {
    expect(candidates.has("p-5")).toBe(false);
    expect(candidates.has("p-6")).toBe(false);
  });
  it("주석이 만들던 bare rounded (토큰 밖 4px) 가 없다", () => {
    expect(candidates.has("rounded")).toBe(false);
  });
  it("금지 토큰이 후보에 없다 — ring · 그림자 · 색 임의값", () => {
    const banned = [...candidates].filter((c) =>
      /^(?:[\w-]+:)*(?:(?:inset-)?ring(?:-|$)|(?:inset-shadow|drop-shadow|text-shadow|shadow)(?:-|$)|[\w-]+-\[#[0-9a-f]{3,8}\]$)/iu.test(c),
    );
    expect(banned).toEqual([]);
  });
  it("실제로 쓰는 토큰은 후보에 있다 (스캐너가 돌고 있다는 대조군)", () => {
    expect(candidates.has("rounded-sm")).toBe(true);
    expect(candidates.has("bg-primary")).toBe(true);
    expect(candidates.has("min-h-tap")).toBe(true);
  });
});
