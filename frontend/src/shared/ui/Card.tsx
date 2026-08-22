// 표면 컨테이너.
//
// 「The Flat-By-Default Rule」(docs/design/README.md) — 그림자를 쓰지 않는다. 표면 구분은 1px 헤어라인 보더로만.
// 라운드는 rounded-lg(16px) — D1. 목업이 카드류에 일관되게 쓰는 값이고 "20px 이상의 과한 둥글기" 경계에 못 미친다.
//
// @container 를 붙이는 이유: 카드 내부 반응형을 미디어 쿼리가 아니라 컨테이너 쿼리로 처리하려는 것.
// 같은 카드가 1컬럼에 놓이든 2컬럼에 놓이든 자기 폭만 보고 배치를 정하므로, 화면이 재배치돼도
// 카드 내부를 다시 손대지 않아도 된다.
import type { ReactNode } from "react";

const BASE = "@container rounded-lg border border-line bg-surface p-4";

// 목업 3화면이 같은 요소를 쓴다 — s2:68 `.92rem/14px`, s3:77 · s5:35 `.88rem/12px`.
// 다수인 후자를 spacing·text 스케일로 정규화했다: `.88rem`(14.08px) → `text-sm`(14px), `12px` → `mb-3`.
// 세 화면이 1px 차이로 갈리는 값을 그대로 옮기면 임의값이 세 개 생긴다(§3·§4 콘텐츠 패딩과 같은 사유).
const TITLE = "mb-3 text-sm font-bold text-ink";

// 부제가 붙으면 제목의 아래 여백만 좁힌다. **조각을 이어 붙이지 않고 완성된 리터럴 두 개 중 하나를
// 고른다** — Tailwind 스캐너는 소스를 평문으로 읽어 조립된 클래스를 찾지 못하고, 빌드는 성공한 채
// 스타일만 사라진다(CLAUDE.md §5.1). CategoryRow.tsx 의 조건부 클래스와 같은 처리다.
// 위 TITLE 은 문자열이 그대로이므로 **부제 없는 카드의 마크업은 바이트 단위로 변하지 않는다.**
const TITLE_WITH_SUBTITLE = "mb-1 text-sm font-bold text-ink";

// 목업 s5:61-62 의 margin 3px / 14px 는 spacing 스케일 밖이라 mb-1(4) / mb-3(12) 으로,
// `.74rem`(11.84px)은 타입 스케일 하한(12px) 밑이라 text-xs 로 정규화했다.
const SUBTITLE = "mb-3 text-xs text-ink-soft";

export interface CardProps {
  children: ReactNode;
  className?: string;
  /**
   * 카드 제목. **`<h2>` 로 렌더한다** — `Page` 가 화면당 `<h1>` 을 정확히 하나 내므로 그 아래 단계다.
   *
   * ⚠️ 목업은 이 자리에 `<p class="card-title">` 을 쓴다(s2:157,186,217). 굵은 문단은 시각적으로만
   * 제목이라 스크린리더의 제목 탐색에서 카드가 통째로 사라진다 — layout.md §5 가 목업의
   * 탭 마크업을 APG 근거로 뒤집은 것과 같은 종류의 교정이다.
   * 제목 계층 규정은 a11y.md 에 아직 없다(§5 「아직 정하지 않은 것」에 올렸다).
   */
  title?: ReactNode;
  /**
   * 제목 아래 보조 설명. `Page` 의 같은 이름 prop 과 대칭이다.
   *
   * **제목이 아니라 문단으로 낸다** — 부제까지 heading 이 되면 제목 탐색 항목이 두 배가 되고
   * 카드의 계층이 흐려진다. 시각 스펙은 s5:101-102(리포트의 「다음에 확인하면 좋아요」)이고,
   * 목업 전수 확인 결과 **카드 부제를 쓰는 화면은 지금 이 하나뿐**이다(나머지 `-sub` 는 전부
   * 페이지 부제라 `Page` 가 이미 낸다).
   */
  subtitle?: ReactNode;
}

export function Card({ children, className, title, subtitle }: CardProps) {
  return (
    <div className={className ? `${BASE} ${className}` : BASE}>
      {title !== undefined && <h2 className={subtitle === undefined ? TITLE : TITLE_WITH_SUBTITLE}>{title}</h2>}
      {subtitle !== undefined && <p className={SUBTITLE}>{subtitle}</p>}
      {children}
    </div>
  );
}
