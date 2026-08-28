// @vitest-environment node
//
// 게이트 픽스처 — 양성·음성·경계를 전부 고정한다.
// 이 파일이 있는 이유: 그림자 정규식의 백트래킹 오탐 수정(3d518c6)이 주석으로만 보호돼 있었고,
// 다음 확장안이 고친 형태를 되돌리고 있었다. 여기 고정된 케이스는 구현이 바뀌어도 다시 깨지면 바로 드러난다.
import { describe, expect, it } from "vitest";
import { atoms, checkCssNorms, normalizeHex } from "../css-norms.mjs";

const PALETTE = new Set(["#8b3f63", "#f1dee7", "#1d1b19", "#726b65", "#f7f6f4", "#ffffff", "#e7e3de", "transparent"]);
const RADII = {
  names: new Set(["--radius-sm", "--radius-md", "--radius-lg", "--radius-pill"]),
  values: new Set(["8px", "10px", "16px", "999px"]),
};

function run(css) {
  return checkCssNorms(css, { filename: "fixture.css", palette: PALETTE, radii: RADII });
}
function norms(css) {
  return run(css).violations.map((v) => v.norm);
}

describe("그림자 — box-shadow / text-shadow 값", () => {
  it("`box-shadow: none` 은 공백이 있어도 통과한다 — 3d518c6 이 고친 오탐의 재발 방지", () => {
    expect(norms(".a{box-shadow: none}")).toEqual([]);
    expect(norms(".a{box-shadow:none}")).toEqual([]);
    expect(norms(":-moz-ui-invalid{box-shadow:none}")).toEqual([]);
  });
  it("`text-shadow: none` 도 통과한다", () => {
    expect(norms(".a{text-shadow: none}")).toEqual([]);
  });
  it("실제 그림자 값은 위반이다", () => {
    expect(norms(".a{box-shadow:0 1px 3px rgb(0 0 0/.1)}")).toContain("shadow");
    expect(norms(".a{text-shadow:0 1px 0 #000}")).toContain("shadow");
  });
  it("Tailwind 가 조립한 `box-shadow: var(--tw-inset-shadow), var(--tw-ring-shadow), …` 도 위반이다", () => {
    expect(norms(".a{box-shadow:var(--tw-inset-shadow),var(--tw-inset-ring-shadow),var(--tw-ring-offset-shadow),var(--tw-ring-shadow),var(--tw-shadow)}")).toContain("shadow");
  });
});

describe("그림자 — drop-shadow 는 filter: 가 아니라 커스텀 속성으로 나간다", () => {
  it("`--tw-drop-shadow-size: drop-shadow(…)` 를 잡는다 (속성 이름 정규식이 놓치던 경로)", () => {
    expect(norms(".a{--tw-drop-shadow-size:drop-shadow(0 3px 3px #0003)}")).toContain("shadow");
  });
  it("수기 `filter: drop-shadow(…)` 도 잡는다", () => {
    expect(norms(".a{filter:drop-shadow(0 1px 2px #0003)}")).toContain("shadow");
  });
  it("`filter: var(--tw-drop-shadow,)` 처럼 함수가 없는 filter 는 통과한다", () => {
    expect(norms(".a{filter:var(--tw-blur,) var(--tw-drop-shadow,)}")).toEqual([]);
  });
});

describe("링 — 커스텀 속성만 내는 ring-<color> 를 잡는다", () => {
  const PROPERTY = `@property --tw-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}
@property --tw-ring-color{syntax:"*";inherits:false}`;
  it("`--tw-ring-color: var(--color-primary)` 는 위반 (ring-primary)", () => {
    expect(norms(`${PROPERTY}.ring-primary{--tw-ring-color:var(--color-primary)}`)).toContain("shadow");
  });
  it("`--tw-ring-shadow: … 0 0 0 calc(2px …)` 는 위반 (ring-2)", () => {
    expect(norms(`${PROPERTY}.ring-2{--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color, currentcolor)}`)).toContain("shadow");
  });
  it("@layer properties 폴백의 초기값 재선언은 통과한다 — 위반이 아니다", () => {
    const css = `${PROPERTY}@supports (x:y){@layer properties{*,:before,:after{--tw-ring-shadow:0 0 #0000;--tw-ring-color:initial}}}`;
    expect(norms(css)).toEqual([]);
  });
  it("초기값이 <percentage>·<length>·색 구문이어도 폴백 재선언을 초기값으로 알아본다 — 파서가 모양을 다르게 준다", () => {
    const css = `@property --tw-drop-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}
@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0px}
@property --tw-ring-offset-color{syntax:"*";inherits:false;initial-value:#fff}
*{--tw-drop-shadow-alpha:100%;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff}`;
    expect(norms(css)).toEqual([]);
  });
  it("@property 가 폴백보다 뒤에 나와도(Tailwind 실제 순서) 초기값을 알아본다", () => {
    const css = `*{--tw-drop-shadow-alpha:100%}
@property --tw-drop-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}`;
    expect(norms(css)).toEqual([]);
  });
  it("같은 속성이라도 초기값과 다른 값이면 위반이다 (ring-offset-2)", () => {
    const css = `@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0px}
.ring-offset-2{--tw-ring-offset-width:2px}`;
    expect(norms(css)).toContain("shadow");
  });
});

describe("그림자로 잡힌 선언의 색은 중복 보고하지 않는다", () => {
  it("rgba 그림자는 shadow 한 건으로만 보고된다", () => {
    expect(norms(".a{box-shadow:0 1px 3px rgb(0 0 0/.1)}")).toEqual(["shadow"]);
  });
});

describe("팔레트 밖 색", () => {
  it("팔레트 색은 통과한다 (화이트리스트 실동작)", () => {
    expect(norms(".a{background-color:#8b3f63}")).toEqual([]);
    expect(norms(".a{color:#FFF}")).toEqual([]);
  });
  it("한 자리 다른 색은 위반이다 (경계)", () => {
    expect(norms(".a{background-color:#8b3f64}")).toContain("color");
  });
  it("임의값이 낸 리터럴을 잡는다", () => {
    expect(norms(".a{background-color:#77354F}")).toContain("color");
  });
  // 진단 품질 — 판정이 아니라 **메시지**를 고정한다.
  //
  // Tailwind 의 opacity modifier(bg-surface/12)는 color-mix() 로 나가는데 srgb 폴백이 리터럴 hex 라
  // lightningcss 가 8자리로 접는다. 그러면 이 게이트는 "팔레트 밖 색 … #ffffff1f" 라고 말하고,
  // 읽는 사람은 #ffffff 가 팔레트에 있는데 왜 막히는지 알 수 없다 — 시끄럽지만 오해를 부르는 실패다.
  it("팔레트 색의 알파 변형은 막되, 왜 막히는지 말해 준다", () => {
    const got = run(".a{background-color:#ffffff1f}").violations;

    expect(got.map((v) => v.norm)).toEqual(["color"]);
    expect(got[0].value).toContain("#ffffff 의 알파 변형");
    expect(got[0].value).toContain("D7");
  });
  it("팔레트 밖 색의 알파 변형에는 그 힌트를 붙이지 않는다 — 사유가 다르다", () => {
    const got = run(".a{background-color:#c9c3bc80}").violations;

    expect(got.map((v) => v.norm)).toEqual(["color"]);
    expect(got[0].value).not.toContain("알파 변형");
  });
  it("투명(#0000 · #00000000)은 색 지정이 아니다", () => {
    expect(norms(".a{background-color:#0000}")).toEqual([]);
    expect(norms(".a{--tw-x:#00000000}")).toEqual([]);
  });
  it("그라디언트 안의 색도 본다", () => {
    expect(norms(".a{background:linear-gradient(90deg,#F1DEE7,#D9AFC4)}")).toContain("color");
  });
  it("커스텀 속성 값의 hex 도 본다", () => {
    expect(norms(".a{--page-canvas:#EDEAE6}")).toContain("color");
  });
});

describe("라운드 — 토큰 또는 0 만", () => {
  it("토큰 var() 는 통과한다", () => {
    expect(norms(".a{border-radius:var(--radius-md)}")).toEqual([]);
    expect(norms(".a{border-radius:var(--radius-pill) 0 0 var(--radius-pill)}")).toEqual([]);
  });
  it("0 은 통과한다 (rounded-none)", () => {
    expect(norms(".a{border-radius:0}")).toEqual([]);
  });
  it("토큰 밖 길이는 위반이다 — 산문이 만들던 .rounded 의 .25rem", () => {
    expect(norms(".a{border-radius:.25rem}")).toContain("radius");
    expect(norms(".a{border-top-left-radius:4px}")).toContain("radius");
  });
  it("rounded-full 의 calc(infinity * 1px) 는 위반이다", () => {
    expect(norms(".a{border-radius:calc(infinity * 1px)}")).toContain("radius");
  });
  it("최소화된 산출물에서는 infinity 가 3.40282e38px 로 나온다 — 그것도 위반이다 (실제 dist 에서 잡힌 형태)", () => {
    const { violations } = run(".rounded-full{border-radius:3.40282e38px}");
    expect(violations.map((v) => v.norm)).toEqual(["radius"]);
    // 8개 모서리 원자가 같은 값이면 한 번만 보고한다.
    expect(violations[0].value.split("3.402820018375656e+38px").length - 1).toBe(1);
  });
  it("퍼센트는 위반이다", () => {
    expect(norms(".a{border-radius:50%}")).toContain("radius");
  });
  it("테마에 없는 var 는 위반이다", () => {
    expect(norms(".a{border-radius:var(--radius-3xl)}")).toContain("radius");
  });
});

describe("다크모드", () => {
  it("prefers-color-scheme 미디어 쿼리는 위반이다", () => {
    expect(norms("@media (prefers-color-scheme: dark){.a{color:#fff}}")).toContain("dark");
  });
  it("`color-scheme: light` 선언은 오탐하지 않는다", () => {
    expect(norms(":root{color-scheme:light}")).toEqual([]);
  });
});

describe("위치 보고", () => {
  it("위반에 파일:줄:칸 · 셀렉터 · 주변 문맥이 붙는다", () => {
    const { violations } = run("\n.bg-\\[\\#77354F\\]{background-color:#77354F}");
    expect(violations).toHaveLength(1);
    expect(violations[0].where).toMatch(/^fixture\.css:2:1 \.bg-\[#77354F\]$/u);
    expect(violations[0].value).toContain("#77354f");
  });
});

describe("atoms — 모양이 달라도 같은 값이면 같은 열", () => {
  it("퍼센트 · 길이 · 색 · 식별자 · var · 함수를 원자로 뽑는다", () => {
    expect(atoms({ type: "percentage", value: 1 })).toEqual(["100%"]);
    expect(atoms({ type: "token", value: { type: "percentage", value: 1 } })).toEqual(["100%"]);
    expect(atoms({ type: "length", value: { type: "value", value: { unit: "px", value: 0 } } })).toEqual(["0px"]);
    expect(atoms({ type: "length", value: { unit: "px", value: 0 } })).toEqual(["0px"]);
    expect(atoms({ type: "color", value: { type: "rgb", r: 255, g: 255, b: 255, alpha: 1 } })).toEqual(["#ffffff"]);
    expect(atoms([{ type: "var", value: { name: { ident: "--radius-md" }, fallback: null } }])).toEqual(["var(--radius-md)"]);
    expect(atoms({ type: "dimension", value: { unit: "px", value: null } })).toEqual(["∞px"]);
  });
});

describe("normalizeHex", () => {
  it("축약·8자리를 정규화한다", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("#8B3F63FF")).toBe("#8b3f63");
    expect(normalizeHex("#0000")).toBe("transparent");
    expect(normalizeHex("#8b3f6380")).toBe("#8b3f6380");
  });
});
