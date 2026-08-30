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
import { generated } from "./tailwind-probe.mjs";

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
  // 2026-08-30 (D27 개정) — ChatPanel 의 `SURFACE` 머리말이 **폐기한 유틸리티 이름을 평문으로
  // 적어서** 아무도 안 쓰는 규칙 하나를 CSS 에 실었다. 그 주석은 이름 대신 「위아래 2면만」으로
  // 고쳤다.
  //
  // 🚨 **이 유령은 아래 두 가드를 모두 빠져나갔다.** 위 세 단언은 이미 당한 이름만 보고,
  // 아래 화이트리스트는 `/^[a-z][a-z0-9]*$/` 인 **bare 후보만** 본다 — 하이픈이 있으면 둘 다
  // 해당하지 않는다. 방향 보더는 실제 사용처가 여럿이라(AppShell·드로어·PaymentListRow) 계열
  // 전체를 막을 수는 없으므로, 당한 이름을 여기 한 줄로 고정한다.
  it("주석이 만들던 방향 보더 유령이 없다 (D27 개정)", () => {
    expect(candidates.has("border-y")).toBe(false);
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

// ── 이름 있는 유령이 아니라 **모든** bare 유령을 막는다 ─────────────────────────────────
//
// 위 세 단언은 **이미 당한 이름**(p-5 · rounded · ring…)만 본다. 그래서 처음 보는 유령은
// 조용히 통과한다 — 실제로 그랬다: Card.test.tsx 가 RTL 렌더 루트를
// `const { container } = …` 로 구조 분해하자 그 **식별자**가 후보가 되어 산출 CSS 에
// .container 6규칙이 생겼다(선언 378 → 385). 빌드 게이트는 규범 위반(색·라운드·그림자·
// 링·다크)만 보므로 잡지 못했고, 위 목록에도 없어서 여기서도 통과했다.
//
// 뒤집는다 — **bare 후보 중 CSS 를 만드는 것 전체**를 화이트리스트로 고정한다.
// 소스의 bare 후보는 242개지만 그중 진짜 유틸리티는 10개뿐이라(budget · honeymoon 같은
// 영단어는 컴파일되지 않는다) 유지 비용이 거의 없다. 새 단어가 하나라도 늘면 여기서 실패한다.
//
// **실패했다면**: 그 이름을 소스에서 없애거나(대개 그게 맞다 — 식별자를 바꾼다),
// 진짜로 쓰는 유틸리티면 사유와 함께 아래 표에 추가한다.
const EXPECTED_BARE_UTILITIES = {
  // ① 실제로 className 에 쓰는 것
  absolute: "AppShell 스킵 링크 · BudgetDonut 가운데 라벨",
  border: "1px 헤어라인 — 표면 구분의 유일한 수단",
  fixed: "AppShell 모바일 하단 탭바",
  flex: "레이아웃 전반",
  grid: "대시보드·리포트 카드 열",
  hidden: "AppShell 보조 메뉴 (hidden md:block)",
  relative: "BudgetDonut 도넛 래퍼",
  truncate: "PaymentRow 카테고리명 말줄임",
  underline: "ReportButton(F13 신고) 링크형 트리거 밑줄",
  // ② 피할 수 없는 식별자 충돌 — 클래스로는 쓰지 않는데 그 단어가 소스에 있어 생성된다.
  //    각 25 B 남짓이라 이름을 비트는 값어치가 없다고 판단해 받아들인다.
  block: "Button 의 block prop 이름 — 구현은 w-full 이고 이 클래스는 쓰지 않는다",
  // D17(배지 두 축) 이 들여왔다. block 과 같은 종류의 충돌이다 — 변이 **값**의 이름일 뿐,
  // 이 클래스를 className 에 쓰지 않는다(구현은 border border-current bg-surface).
  outline: "Badge 의 outline 변이 이름 — VARIANT 룩업의 키라 이름을 비틀 수 없다",
  static: "ErrorBoundary 의 static getDerivedStateFromError — JS 키워드라 피할 수 없다",
  // D20(날짜 입력)이 들여왔다. `DateCalendar` 의 월 그리드는 진짜 `<table>` 이다 — div + role 로
  // 흉내 내면 접근성 린트가 막고(비대화형 요소에 대화형 role 금지) 행·열 헤더 관계도 잃는다.
  // 태그 이름이라 이름을 비틀 수단이 없다. `.table{display:table}` 한 줄이다.
  table: "DateCalendar 의 월 그리드 <table> — HTML 태그 이름이라 피할 수 없다",
  // ⚠️ 이 항목만 128 B 다(위 「25 B 남짓」의 예외 — .transform 은 --tw-rotate-*·--tw-skew-* 5개를
  // 잇는 값이라 규칙이 길다). 그래도 받아들이는 이유: icons.tsx 의 IconThumbDown 은 IconThumbUp 과
  // **같은 기하의 180° 점대칭**이고, 그 회전을 SVG `transform` 속성으로 낸다. 속성 이름이라 이름을
  // 비틀 수단이 없다. CSS 클래스(rotate-180 origin-center)로 옮기면 이 단어는 사라지지만 아이콘의
  // 방향이 CSS 로딩에 의존하게 된다 — 스타일이 늦거나 실패하면 「싫어요」가 「좋아요」 모양으로
  // 보인다. 128 B 보다 그쪽이 나쁘다고 판단했다.
  transform: "icons.tsx 의 <g transform> — 엄지 아이콘 180° 점대칭. SVG 속성 이름이라 피할 수 없다",
};

describe("bare 후보 중 CSS 를 만드는 것은 화이트리스트뿐이다", () => {
  it("새 bare 유틸리티가 조용히 늘지 않는다", async () => {
    const bare = [...candidates].filter((c) => /^[a-z][a-z0-9]*$/u.test(c)).toSorted();
    const compiled = await generated(bare);
    expect(bare.filter((c) => compiled[c])).toEqual(Object.keys(EXPECTED_BARE_UTILITIES).toSorted());
  });

  it("프로브가 돌고 있다는 대조군 — 영단어는 컴파일되지 않는다", async () => {
    // budget·honeymoon 은 이 저장소의 도메인 단어라 후보에 있지만 유틸리티가 아니다.
    // container 는 방금 막은 유령이다 — 유틸리티는 맞지만 소스에 있으면 안 된다.
    const got = await generated(["budget", "honeymoon", "container"]);
    expect(got).toEqual({ budget: false, honeymoon: false, container: true });
    expect(candidates.has("container")).toBe(false);
  });
});
