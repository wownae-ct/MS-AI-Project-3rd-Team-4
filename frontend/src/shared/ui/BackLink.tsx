// 「뒤로」 — 부모가 없는 화면(설정 · 스타일가이드)에서 **원래 있던 자리로** 돌려보낸다.
//
// ## 왜 브레드크럼브가 아닌가
//
// `/settings` 는 어느 탭의 자식도 아니다. 톱니바퀴는 홈·타임라인·예산·리포트·AI상담 **어디서든**
// 눌린다. 그래서 「홈 › 설정」 같은 계층은 지어낸 것이고, 예산 탭에서 들어온 사용자를 홈으로 보내면
// 문맥을 잃는다. 이 화면이 답해야 하는 질문은 "어디에 있는가"가 아니라 **"어디서 왔는가"** 다.
//
// 종전엔 그 답이 아예 없었다 — 탭바에 설정 항목이 없고 어느 탭에도 `aria-current` 가 붙지 않아,
// 사용자가 자기가 예산에 있었다는 것을 **스스로 기억해** 탭을 눌러야 했다.
//
// ## 라벨이 실제 동작을 말한다 — 한 컨트롤이 두 동작을 숨기지 않는다
//
// 히스토리가 비어 있을 수 있다: 북마크·새로고침·주소 직접 입력으로 이 화면에 바로 들어오는 경우다.
// 그때 히스토리 뒤로가기는 **아무 일도 하지 않거나 앱 밖으로 나간다** — 탈출구가 사라진다.
//
//   · 갈 곳이 있다  → `<button>` 「‹ 뒤로」   히스토리를 되감는다(예산에서 왔으면 예산으로)
//   · 갈 곳이 없다  → `<a>`      「‹ 홈으로」  대시보드로 보낸다
//
// 라벨을 「뒤로」로 고정한 채 목적지만 조용히 갈아끼우는 안은 기각했다 — 같은 말이 두 뜻이 되고,
// 눌러 보기 전에는 어느 쪽인지 알 수 없다. 태그가 갈리는 것도 그래서 옳다: 히스토리 되감기는
// 링크가 아니고(목적지 URL 이 없다), 홈으로 가기는 버튼이 아니다(새 탭으로 열 수 있어야 한다).
//
// ## 판정 — `useCanGoBack()`
//
// 설치본은 `location.state.__TSR_index !== 0` 을 본다(node_modules/@tanstack/react-router/dist/esm/
// useCanGoBack.js 확인). 다른 사이트에서 링크를 타고 들어오면 그 항목의 state 에 우리 인덱스가 없어
// 0 에서 시작하므로, **앱 밖으로 나가는 뒤로가기는 이 판정에 걸리지 않는다.**
//
// 두 훅은 **분기 밖에서 항상 호출한다** — 렌더 결과만 갈린다(Rules of Hooks).
//
// 🚨 **`<nav>` 로 감싸지 않는다.** 컨트롤 하나는 목록형 내비게이션 랜드마크로 보기 어렵고, 감싸면
// 설정·스타일가이드에서 랜드마크가 3개가 되어 `app/ui/AppShell.test.tsx` 의 「내비 2개」 계약이
// 이유 없이 흔들린다. `AppShell.tsx` 의 `MobileSettingsLink` 가 같은 판단을 같은 이유로 내렸다.
// (`Breadcrumb` 은 항목이 여럿인 진짜 목록이라 반대로 `<nav>` 가 필수다 — 두 결정은 모순이 아니다.)
import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { PAGE_NAV_CONTROL } from "./page-nav-style";

export function BackLink() {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  // 글리프는 `‹`(U+2039) 하나 — `pages/budget/ui/BudgetPage.tsx` 의 「‹ 뒤로」와 같은 문자다.
  // 새 아이콘을 만들지 않는다: D18 이 걷어낸 것은 컬러 이모지와 `✓` 이고, `‹`·`›` 는 `…` 와 같은
  // General Punctuation 이라 폰트 서브셋 안에 있다(D18 §전수조사 목록에도 없다).
  const glyph = <span aria-hidden="true">‹</span>;

  if (!canGoBack) {
    // `activeOptions={{ exact: true }}` — `to="/"` 는 기본 접두사 매칭에서 **모든 경로에 걸린다**
    // (`Breadcrumb.tsx` 의 같은 경고 참조). 이 링크가 보이는 화면은 `/` 가 아니지만, exact 를
    // 빼면 `aria-current="page"` 가 붙어 「지금 홈에 있다」고 잘못 알린다.
    return (
      <Link to="/" activeOptions={{ exact: true }} className={PAGE_NAV_CONTROL}>
        {glyph} 홈으로
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => router.history.back()} className={PAGE_NAV_CONTROL}>
      {glyph} 뒤로
    </button>
  );
}
