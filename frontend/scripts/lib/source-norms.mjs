// 소스 규범 검사 — 순수 함수. Tailwind 가 스캔하는 소스에서 금지 유틸리티 토큰을 찾아 file:line 으로 돌려준다.
//
// 왜 산출 CSS 검사와 별도로 두는가
//   산출 CSS 만 보면 알려 줄 수 있는 위치가 `.bg-\[\#77354F\]` 라는 셀렉터뿐이다. 고칠 곳(Button.tsx:16)을 못 찾는다.
// 왜 린트가 아니라 여기인가
//   oxlint 에 `no-restricted-syntax` 가 없다(공식 규칙 목록 — `no-restricted-imports`·`no-restricted-properties` 만).
//   클래스 문자열 안의 토큰을 보는 규칙을 린트로 쓸 수 없으므로 스크립트에 둔다.
// 주석도 본다
//   Tailwind 는 파일을 파싱하지 않고 평문으로 훑는다(공식: "doesn't attempt to actually parse your files as code").
//   주석 안의 `ring-2` 도 유틸리티를 만든다 — 그러니 주석이라고 봐주지 않는 것이 맞다.

/** 색 임의값 — `bg-[#77354F]` · `hover:text-[#fff]` · `border-[#abcd]`. 변이 접두(`md:` 등)를 허용한다. */
const ARBITRARY_COLOR =
  /(?<![\w-])(?:[\w-]+:)*(?:bg|text|border|outline|fill|stroke|from|via|to|ring|shadow|accent|caret|decoration|divide|placeholder|inset-ring|inset-shadow|drop-shadow|text-shadow)-\[#[0-9a-f]{3,8}\]/giu;

/** ring 계열 — `ring` · `ring-2` · `ring-primary` · `ring-[3px]` · `inset-ring-2` · `focus:ring`. `ring-*` 같은 산문은 매치하지 않는다. */
const RING = /(?<![\w-])(?:[\w-]+:)*(?:inset-)?ring(?:-[\w[\]#/.-]+)?(?![\w-])/gu;

/** 그림자 계열 — `shadow` · `shadow-md` · `drop-shadow-lg` · `text-shadow-sm` · `inset-shadow-xs`. `box-shadow` 라는 단어는 매치하지 않는다. */
const SHADOW = /(?<![\w-])(?:[\w-]+:)*(?:inset-shadow|drop-shadow|text-shadow|shadow)(?:-[\w[\]#/.-]+)?(?![\w-])/gu;

const PATTERNS = [
  { norm: "color", pattern: ARBITRARY_COLOR, hint: "팔레트 밖 색 임의값" },
  { norm: "ring", pattern: RING, hint: "ring-* — outline-* 로 바꾼다 (D9)" },
  { norm: "shadow", pattern: SHADOW, hint: "그림자 유틸리티 (D10)" },
];

/**
 * @param {string} text 파일 내용
 * @param {string} path 보고용 경로
 * @returns {Array<{ norm: string, where: string, value: string }>}
 */
export function checkSourceNorms(text, path) {
  const violations = [];
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const { norm, pattern, hint } of PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        violations.push({
          norm,
          where: `${path}:${index + 1}:${match.index + 1}`,
          value: `${match[0]}  — ${hint}`,
        });
      }
    }
  }
  return violations;
}
