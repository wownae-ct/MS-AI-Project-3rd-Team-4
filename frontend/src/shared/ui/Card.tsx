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
}

export function Card({ children, className, title }: CardProps) {
  return (
    <div className={className ? `${BASE} ${className}` : BASE}>
      {title !== undefined && <h2 className={TITLE}>{title}</h2>}
      {children}
    </div>
  );
}
