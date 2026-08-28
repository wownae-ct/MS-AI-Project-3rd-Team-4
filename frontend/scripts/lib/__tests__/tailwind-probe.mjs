// 실제 theme.css 로 후보를 컴파일해 「무엇이 진짜 유틸리티가 되는가」를 묻는 공용 프로브.
//
// 두 테스트가 같은 질문을 서로 다른 목적으로 한다 —
//   retirement-contract : 폐기한 것이 사라지고 남길 것이 남는가 (계약)
//   ghost-candidates    : 소스에 있는 단어 중 무엇이 CSS 를 만드는가 (유령)
// 헬퍼를 각자 두면 둘이 갈리므로 여기 한 곳에 둔다.
//
// ⚠️ **compiler 를 재사용하지 않는다.** `compiler.build()` 는 호출 간 후보를 누적해서,
// 한 번 만든 compiler 로 여러 묶음을 재면 앞 묶음의 결과가 뒤에 섞인다(실측으로 당한 적 있다).
// 그래서 호출마다 새로 만든다 — 느리지만 정확하다.
//
// tailwindcss 의 compile() 은 웹 문서에 없는 준내부 API 다. tailwindcss 가 정확 핀이라
// 업그레이드가 의도적이고, API 가 바뀌면 이 프로브를 쓰는 테스트가 실패해 드러난다.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { compile } from "tailwindcss";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const TAILWIND = resolve(ROOT, "node_modules", "tailwindcss");
const THEME = readFileSync(resolve(ROOT, "src", "shared", "ui", "theme.css"), "utf8");

function loadStylesheet(id, base) {
  const path = id === "tailwindcss" ? resolve(TAILWIND, "index.css") : resolve(base, id);
  return { path, base: dirname(path), content: readFileSync(path, "utf8") };
}

/**
 * 후보 목록을 실제 theme.css 로 컴파일하고, 각 후보가 규칙을 만들었는지 `{후보: boolean}` 으로 돌려준다.
 */
export async function generated(candidates) {
  const compiler = await compile(`@import "tailwindcss" source(none);\n${THEME}`, {
    base: resolve(ROOT, "src", "shared", "ui"),
    loadStylesheet,
    onDependency() {},
  });
  // 주석을 벗긴다 — 산출 머리말 `/*! tailwindcss … https://tailwindcss.com */` 의 `.com ` 이 셀렉터 검사에
  // 걸려 bare 후보 `com` 이 「생성됨」으로 오보된 적이 있다(2026-08-22). 셀렉터만 남기고 판정한다.
  const css = compiler.build(candidates).replaceAll(/\/\*[\s\S]*?\*\//gu, "");
  const result = {};
  for (const candidate of candidates) {
    // 셀렉터는 이스케이프돼 나온다(`.bg-[#77354F]` · `.@max-xs:flex-col`). 이스케이프를 벗겨 비교한다.
    // ⚠️ `@` 도 포함한다 — 빠뜨렸을 때 컨테이너 쿼리 변이가 전부 「미생성」으로 잘못 보고됐다(2026-08-22 실측).
    const escaped = candidate.replaceAll(/[\\[\]#:/.%@]/gu, (ch) => `\\${ch}`);
    // 의사 클래스 변이(`last:` · `hover:`)는 셀렉터 뒤에 `:last-child` 가 붙어 `{` 로 끝나지 않는다 —
    // `{` 만 찾으면 그 후보가 전부 「미생성」이 된다(2026-08-22 실측). 뒤따르는 문자가 `{` · 공백 · `:` 이면 생성된 것이다.
    const pattern = new RegExp(String.raw`\.${escaped.replaceAll(/[.*+?^${}()|[\]\\]/gu, (ch) => `\\${ch}`)}(?=[\s{:])`, "u");
    result[candidate] = pattern.test(css);
  }
  return result;
}
