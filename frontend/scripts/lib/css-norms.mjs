// 산출 CSS 규범 검사 — 순수 함수. 파일도 프로세스도 건드리지 않는다.
//
// 왜 정규식이 아니라 파서인가 (docs/design/namespaces.md 「게이트 — 정규식이 아니라 파서로」)
//   · `drop-shadow-*` 는 `filter:` 에 `drop-shadow(` 를 넣지 않는다 — `--tw-drop-shadow-size` 커스텀 속성에
//     넣고 `filter:` 에는 `var()` 만 둔다. 속성 이름으로 찾는 정규식은 한 건도 매치하지 못한다(무동작).
//   · `ring-<color>` 는 `--tw-ring-color` 커스텀 속성만 낸다. `box-shadow` 가 없으니 값 검사로도 못 잡는다.
//   · 값을 배제하려고 `\s*(?!none\b)` 를 쓰면 `\s*` 가 0글자로 백트래킹해 `box-shadow: none` 을 오탐한다.
//     커밋 3d518c6 이 그 오탐을 고쳤는데, 다음 확장안이 고친 형태를 되돌리고 있었다 — 주석으로만 보호된
//     수정은 회귀한다. 그래서 이 모듈은 순수 함수이고, 옆의 __tests__ 가 픽스처로 고정한다.
//
// lightningcss 는 vite 와 @tailwindcss/node 가 선언한 정식 의존이자 Vite 가 CSS 를 최소화할 때 쓰는 파서다.
// 같은 파서로 읽으므로 "빌드가 낸 것"과 "게이트가 본 것"이 어긋날 여지가 없다.
//
// 값 비교는 전부 「원자열」로 한다 — 파서가 같은 값을 문맥에 따라 다른 모양으로 준다:
//   @property initial-value `100%` 는 {type:"percentage",value:1} 인데 선언 값 `100%` 는 {type:"token",value:{type:"percentage",…}} 다.
//   `<length>` 초기값은 {type:"length",value:{type:"value",value:{unit,value}}} 인데 선언은 {type:"length",value:{unit,value}} 다.
//   typed `filter: drop-shadow(…)` 는 {type:"drop-shadow"} 객체이고, 커스텀 속성 안에서는 {type:"function",name:"drop-shadow"} 다.
// 트리를 깊이 우선으로 훑어 숫자·길이·퍼센트·색·식별자·함수·var 만 순서대로 뽑으면 모양이 달라도 같은 열이 나온다.

import { transform } from "lightningcss";

/** 그림자·링 계열 커스텀 속성 — @property 초기값 이외의 값을 가지면 위반이다. */
const SHADOW_CUSTOM_PROPERTY = /^--tw-(?:inset-)?(?:shadow|ring|drop-shadow|text-shadow)/u;

/** 라운드 속성 — shorthand 와 longhand(논리·물리) 전부. */
const RADIUS_PROPERTY = /radius$/u;

const SHADOW_PROPERTIES = new Set(["box-shadow", "text-shadow"]);

function channel(value) {
  return Math.round(value).toString(16).padStart(2, "0");
}

function hexFromRgb({ r, g, b, alpha }) {
  if (alpha === 0) return "transparent";
  const base = `#${channel(r)}${channel(g)}${channel(b)}`;
  return alpha === 1 ? base : `${base}${channel(alpha * 255)}`;
}

/** `#abc` · `#abcd` · `#aabbcc` · `#aabbccdd` → 6자리(불투명) 또는 `transparent` 또는 8자리. */
export function normalizeHex(raw) {
  let hex = raw.replace(/^#/u, "").toLowerCase();
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
  if (hex.length === 8) {
    if (hex.endsWith("00")) return "transparent";
    if (hex.endsWith("ff")) hex = hex.slice(0, 6);
  }
  return `#${hex}`;
}

/**
 * 값 트리 → 원자열. 모양이 달라도 같은 값이면 같은 열이 나온다.
 * 원자: 숫자 `0` · 길이 `8px` `∞px` · 퍼센트 `100%` · 색 `#8b3f63`/`transparent` · 식별자 `none` ·
 *       함수 `name(` … `)` · 변수 `var(--x)`.
 */
export function atoms(node, out = []) {
  if (node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) atoms(item, out);
    return out;
  }
  if (node.type === "rgb" && typeof node.r === "number") {
    out.push(hexFromRgb(node));
    return out;
  }
  if (typeof node.unit === "string" && (typeof node.value === "number" || node.value === null)) {
    out.push(`${node.value === null ? "∞" : node.value}${node.unit}`);
    return out;
  }
  if (node.type === "percentage" && typeof node.value === "number") {
    out.push(`${node.value * 100}%`);
    return out;
  }
  if (node.type === "number" && typeof node.value === "number") {
    out.push(String(node.value));
    return out;
  }
  if (node.type === "ident" && typeof node.value === "string") {
    out.push(node.value);
    return out;
  }
  if ((node.type === "hash" || node.type === "id-hash") && typeof node.value === "string") {
    out.push(normalizeHex(node.value));
    return out;
  }
  if (node.type === "white-space" || node.type === "comma") return out;
  if (node.type === "var") {
    out.push(`var(${node.value?.name?.ident ?? "?"})`);
    atoms(node.value?.fallback, out);
    return out;
  }
  if (node.type === "function" && typeof node.value?.name === "string") {
    out.push(`${node.value.name}(`);
    atoms(node.value.arguments, out);
    out.push(")");
    return out;
  }
  // typed filter 의 drop-shadow 는 함수가 아니라 {type:"drop-shadow", value:{color, xOffset, …}} 객체다.
  if (node.type === "drop-shadow" && node.value && typeof node.value === "object" && "color" in node.value) {
    out.push("drop-shadow(");
    atoms(node.value, out);
    out.push(")");
    return out;
  }
  for (const value of Object.values(node)) atoms(value, out);
  return out;
}

function isZero(atom) {
  return /^0(?:[a-z%]+)?$/u.test(atom);
}

function combinator(value) {
  if (value === "descendant") return " ";
  if (value === "child") return " > ";
  if (value === "next-sibling") return " + ";
  return " ~ ";
}

/** 셀렉터 AST → 사람이 읽을 문자열. 진단용이라 근사치면 된다. */
function serializeSelectors(selectors) {
  const part = (component) => {
    switch (component.type) {
      case "class":
        return `.${component.name}`;
      case "id":
        return `#${component.name}`;
      case "type":
        return component.name;
      case "universal":
        return "*";
      case "nesting":
        return "&";
      case "pseudo-class":
        return `:${component.kind === "custom" ? component.name : component.kind}`;
      case "pseudo-element":
        return `::${component.kind}`;
      case "attribute":
        return `[${component.name}]`;
      case "combinator":
        return combinator(component.value);
      default:
        return "…";
    }
  };
  return selectors.map((selector) => selector.map((component) => part(component)).join("")).join(", ");
}

/**
 * 산출 CSS 한 장을 검사한다.
 *
 * @param {string} cssText
 * @param {{ filename: string, palette: Set<string>, radii: { names: Set<string>, values: Set<string> } }} ctx
 *   palette — theme.css 의 `--color-*` hex(정규화) 집합. `transparent` 는 호출자가 넣는다.
 *   radii   — theme.css 의 `--radius-*` 이름과 값(`8px` 등) 집합.
 * @returns {{ violations: Array<{ norm: string, where: string, value: string }>, stats: Record<string, number> }}
 */
export function checkCssNorms(cssText, { filename, palette, radii }) {
  const violations = [];
  const stats = { declarations: 0, colors: 0, radiusDeclarations: 0, shadowCustomProperties: 0 };
  const initialValues = new Map();
  const lines = cssText.split("\n");

  const report = (norm, rule, value) => {
    // lightningcss 의 loc.line 은 0-based, column 은 1-based 다 (실측).
    const loc = rule.value.loc;
    const context = (lines[loc.line] ?? "").slice(Math.max(0, loc.column - 1), loc.column + 79);
    violations.push({
      norm,
      where: `${filename}:${loc.line + 1}:${loc.column} ${serializeSelectors(rule.value.selectors)}`,
      value: `${value}  ⟵ ${context}`,
    });
  };

  const checkDeclaration = (rule, declaration) => {
    stats.declarations += 1;
    const { property, value } = declaration;
    const name = property === "custom" ? value.name : property === "unparsed" ? value.propertyId?.property : property;
    const valueAtoms = atoms(property === "custom" || property === "unparsed" ? value.value : value);
    let shadowReported = false;
    const shadow = (detail) => {
      if (!shadowReported) report("shadow", rule, `${name}: ${detail}`);
      shadowReported = true;
    };

    // ① 그림자 — box-shadow / text-shadow 의 값이 none 이 아닌 것.
    //    파싱된(typed) 값은 실제 그림자다. `none` 은 파서가 unparsed 로 남긴다 — 원자열이 ["none"] 이면 통과.
    if (SHADOW_PROPERTIES.has(name) && !(valueAtoms.length === 1 && valueAtoms[0] === "none")) shadow("none 이 아닌 그림자 값");

    // ② 그림자 — 어떤 값에든 drop-shadow(…). typed filter 객체와 커스텀 속성 안의 함수 토큰을 같이 본다.
    if (valueAtoms.includes("drop-shadow(")) shadow("drop-shadow(…)");

    // ③ 그림자·링 — 커스텀 속성이 @property 초기값 이외의 값.
    //    Tailwind 는 @layer properties 폴백에 초기값을 한 번 더 쓴다 — 그건 위반이 아니다.
    //    `initial` 키워드도 초기값이다(@property 에 initial-value 가 없는 속성의 폴백).
    if (property === "custom" && SHADOW_CUSTOM_PROPERTY.test(name)) {
      stats.shadowCustomProperties += 1;
      const key = valueAtoms.join(" ");
      const isInitial = key === "initial" || (initialValues.has(name) && key === initialValues.get(name));
      if (!isInitial) shadow("초기값 이외");
    }

    // ④ 팔레트 밖 색 — 값 안의 모든 색. 투명은 색 지정이 아니다. 그림자로 이미 잡힌 선언의 색은 중복 보고하지 않는다.
    if (!shadowReported) {
      for (const atom of valueAtoms) {
        if (!atom.startsWith("#") && atom !== "transparent") continue;
        stats.colors += 1;
        if (atom === "transparent" || palette.has(atom)) continue;
        report("color", rule, `${name}: ${atom}`);
      }
    }

    // ⑤ 라운드 — 토큰 var(--radius-*) 또는 0 또는 토큰 값 자체만 허용.
    if (typeof name === "string" && RADIUS_PROPERTY.test(name)) {
      stats.radiusDeclarations += 1;
      const bad = valueAtoms.filter((atom) => {
        if (isZero(atom)) return false;
        if (atom.startsWith("var(")) return !radii.names.has(atom.slice(4, -1));
        return !radii.values.has(atom);
      });
      // shorthand 는 네 모서리 × (가로, 세로) 8개 원자가 나온다 — 같은 값은 한 번만 보여 준다.
      if (bad.length > 0) report("radius", rule, `${name}: ${[...new Set(bad)].join(" ")}`);
    }
  };

  // 선언을 모아 뒀다가 파싱이 끝난 뒤 검사한다 — Tailwind 는 @property 규칙을 파일 **끝**에 내고
  // @layer properties 폴백(초기값 재선언)은 **앞**에 낸다. 한 패스로 검사하면 폴백을 볼 때 초기값을 아직 모른다.
  const pending = [];
  transform({
    filename,
    code: Buffer.from(cssText, "utf8"),
    minify: false,
    visitor: {
      Rule: {
        property(rule) {
          initialValues.set(rule.value.name, atoms(rule.value.initialValue).join(" "));
        },
        style(rule) {
          const { declarations, importantDeclarations } = rule.value.declarations;
          for (const declaration of declarations ?? []) pending.push([rule, declaration]);
          for (const declaration of importantDeclarations ?? []) pending.push([rule, declaration]);
        },
      },
    },
  });
  for (const [rule, declaration] of pending) checkDeclaration(rule, declaration);

  // 다크모드 — 미디어 쿼리 문자열 존재 자체가 위반이다. 값 판단이 필요 없어 텍스트로 본다.
  if (/prefers-color-scheme/u.test(cssText)) {
    violations.push({ norm: "dark", where: filename, value: "prefers-color-scheme" });
  }

  return { violations, stats };
}
