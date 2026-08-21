// 번들 예산 게이트 — `npm run build` 체인의 마지막 단계.
//
// 왜 Vite 플러그인이 아니라 별도 스크립트인가
//   플러그인으로 넣으면 gzip 계산에 node:zlib 타입이 필요해 @types/node 와 tsconfig 프로젝트 분리가
//   딸려온다. tsconfig.app.json 의 types 에 @types/node 를 넣으면 **앱 코드에서도 process·Buffer 가
//   타입 통과**해 조용한 실패 경로가 생긴다. 이 파일은 tsconfig.app.json 의 include 밖이라
//   그 문제가 통째로 사라지고, dist 를 디스크에서 읽으므로 **실제 배포되는 바이트**를 잰다.
//   package.json 의 && 체인이라 건너뛸 수 없고 CI 워크플로 수정도 불필요하다.
//
// 왜 폰트를 따로 세는가
//   Wanted Sans 는 unicode-range 로 92조각 분할돼 있어 **전량 전송되지 않는다.** 합계로 재면
//   폰트가 예산을 다 먹어 정작 감시해야 할 JS·유틸리티 CSS 증가를 감지하지 못한다.
//   같은 이유로 CSS 는 @font-face 블록을 빼고 잰다 — 화면이 늘어도 그 부분은 그대로다.
//
// 왜 속성 이름이 아니라 값을 보는가 (ADR 0003 §검증 스크립트의 함정)
//   `grep box-shadow` 는 Preflight 의 `:-moz-ui-invalid{box-shadow:none}` 에 걸린다. 그림자를
//   **제거하는** 코드인데 위반으로 잡힌다. 그래서 규범 검사는 값까지 확인한다.

import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// 실행 위치에 의존하지 않는다 — CWD 기준으로 잡으면 다른 디렉터리에서 부를 때 조용히 빗나간다.
const ASSETS_DIRECTORY = resolve(import.meta.dirname, "..", "dist", "assets");

/**
 * 상한값은 추측이 아니라 실측 + 여유분이다. 옆의 「측정」이 이 값을 정할 때의 실제 크기다.
 * 화면이 늘어 상한을 올려야 하면 **측정값과 함께 올린다** — 그래야 diff 에서 증가폭이 보인다.
 * 조용히 올리면 이 게이트는 의미를 잃는다.
 */
const BUDGETS = [
  { key: "jsGzip", limit: 92_000, measured: 75_223, label: "JS 합계 (gzip)" },
  { key: "jsChunkGzip", limit: 92_000, measured: 75_223, label: "최대 단일 JS 청크 (gzip)" },
  { key: "cssGzip", limit: 6_000, measured: 3_683, label: "CSS (gzip, @font-face 제외)" },
  // 폰트는 unicode-range 로 분할돼 전량 전송되지 않으므로 이 값은 전송량이 아니라 **배포 크기** 가드다.
  // 잡으려는 사고: variable/split(2.3 MB) 대신 static/split(8.8 MB)이나 static/complete(4.7 MB)를
  // 실수로 import 하는 것. 폰트 패치 릴리스가 몇 KB 늘어난 것만으로 빌드를 깨지 않도록 여유를 둔다.
  { key: "fontRaw", limit: 2_600_000, measured: 2_281_860, label: "폰트 파일 합계 (raw)" },
];

/**
 * DESIGN.md·PRODUCT.md 가 금지한 것이 산출물에 실제로 없는지 본다.
 * 규범을 문서로만 두면 지키는 것이 사람뿐이다 — 이 저장소의 나머지 게이트와 같은 수준으로 올린다.
 *
 * **속성 이름이 아니라 값까지 본다.** `grep box-shadow` 로 검사하면 Preflight 의
 * `:-moz-ui-invalid{box-shadow:none}` 에 걸리는데, 그건 그림자를 **제거하는** 코드다 (ADR 0003).
 */
const CSS_NORMS = [
  {
    label: "그림자 금지 — DESIGN.md 「The Flat-By-Default Rule」",
    pattern: /box-shadow\s*:\s*(?!none\b)[^;}]+/gu,
    hint: "표면 구분은 1px 헤어라인 보더(border-line)로만 한다.",
  },
  {
    label: "다크모드 금지 — PRODUCT.md 「다크모드는 스코프 아님(라이트 테마만)」",
    pattern: /prefers-color-scheme/gu,
    hint: "색은 theme.css 의 단일 팔레트만 쓴다. 다크가 필요해지면 PRODUCT.md 를 먼저 바꾼다.",
  },
];

const FONT_EXTENSIONS = new Set([".woff2", ".woff", ".ttf", ".otf"]);
const FONT_FACE_PATTERN = /@font-face\s*\{[^}]*\}/gu;

function formatBytes(value) {
  return `${value.toLocaleString("en-US")} B`;
}

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function collectAssets() {
  let entries;
  try {
    entries = readdirSync(ASSETS_DIRECTORY);
  } catch (error) {
    // cause 로 원본을 붙여 둔다 — 메시지만 갈아치우면 실제 실패 원인(권한·경로·타입)이 지워진다.
    throw new Error(
      [
        `산출물 디렉터리를 읽을 수 없다: ${ASSETS_DIRECTORY}`,
        "",
        "원인: vite build 가 돌지 않았거나 outDir 이 바뀌었다.",
        "조치: `npm run build` 로 전체 체인을 실행할 것. 이 스크립트만 단독으로 부르지 않는다.",
      ].join("\n"),
      { cause: error },
    );
  }

  const assets = { javascript: [], stylesheet: [], font: [] };
  for (const name of entries) {
    const path = join(ASSETS_DIRECTORY, name);
    if (!statSync(path).isFile()) continue;
    const extension = extensionOf(name);
    if (extension === ".js") assets.javascript.push({ name, bytes: readFileSync(path) });
    else if (extension === ".css") assets.stylesheet.push({ name, bytes: readFileSync(path) });
    else if (FONT_EXTENSIONS.has(extension)) assets.font.push({ name, size: statSync(path).size });
  }
  return assets;
}

function measure(assets) {
  const chunkSizes = assets.javascript.map((asset) => gzipSync(asset.bytes, { level: 9 }).length);
  const jsGzip = chunkSizes.reduce((sum, size) => sum + size, 0);
  const jsChunkGzip = chunkSizes.length === 0 ? 0 : Math.max(...chunkSizes);

  // @font-face 블록을 걷어낸 뒤 잰다 — 화면이 늘어도 폰트 선언은 그대로라 함께 세면 증가를 못 본다.
  let cssGzip = 0;
  for (const sheet of assets.stylesheet) {
    const withoutFontFaces = sheet.bytes.toString("utf8").replaceAll(FONT_FACE_PATTERN, "");
    cssGzip += gzipSync(Buffer.from(withoutFontFaces, "utf8"), { level: 9 }).length;
  }

  const fontRaw = assets.font.reduce((sum, asset) => sum + asset.size, 0);

  return { jsGzip, jsChunkGzip, cssGzip, fontRaw };
}

const assets = collectAssets();
const actual = measure(assets);

console.log("번들 예산 (실측)");
console.log(
  `  자산: JS ${assets.javascript.length}개 · CSS ${assets.stylesheet.length}개 · 폰트 ${assets.font.length}개`,
);

const breaches = [];
for (const budget of BUDGETS) {
  const value = actual[budget.key];
  const over = value > budget.limit;
  const share = Math.round((value / budget.limit) * 100);
  console.log(
    `  ${over ? "초과" : "통과"}  ${budget.label.padEnd(30)} ${formatBytes(value).padStart(13)} / ${formatBytes(budget.limit).padStart(13)}  (${share}%)`,
  );
  if (over) breaches.push({ budget, value });
}

// 규범 검사 — 예산과 별개로, 금지된 것이 산출물에 들어왔는지 본다.
const normViolations = [];
for (const sheet of assets.stylesheet) {
  const text = sheet.bytes.toString("utf8");
  for (const norm of CSS_NORMS) {
    const hits = text.match(norm.pattern);
    if (hits) normViolations.push({ norm, sample: hits[0].slice(0, 80), count: hits.length });
  }
}
for (const norm of CSS_NORMS) {
  const violated = normViolations.some((violation) => violation.norm === norm);
  console.log(`  ${violated ? "위반" : "통과"}  ${norm.label}`);
}

if (normViolations.length > 0) {
  const lines = ["", "산출 CSS 가 디자인 규범을 어겼다.", ""];
  for (const { norm, sample, count } of normViolations) {
    lines.push(`  ${norm.label}`, `    ${count}건 — 예: ${sample}`, `    조치: ${norm.hint}`, "");
  }
  lines.push("규범을 바꾸려면 DESIGN.md·PRODUCT.md 를 먼저 갱신한다. 여기서 예외를 만들지 않는다.");
  console.error(lines.join("\n"));
  process.exitCode = 1;
}

if (breaches.length > 0) {
  const lines = ["", "번들이 예산을 넘었다.", ""];
  for (const { budget, value } of breaches) {
    lines.push(
      `  ${budget.label}: ${formatBytes(value)} > ${formatBytes(budget.limit)} (기준을 정할 때 측정값은 ${formatBytes(budget.measured)}였다)`,
    );
  }
  lines.push(
    "",
    "원인: 의존성이 늘었거나, 트리셰이킹이 깨졌거나, 의도한 기능 추가다.",
    "조치: 먼저 무엇이 늘었는지 확인한다 — 의도한 증가라면 scripts/check-bundle-budget.mjs 의",
    "      BUDGETS 를 **새 측정값과 함께** 올린다. 측정값 없이 한도만 올리지 않는다.",
    "",
    "이대로 상한만 올리면 이 게이트는 다음 회귀를 잡지 못한다.",
  );
  console.error(lines.join("\n"));
  process.exitCode = 1;
}
