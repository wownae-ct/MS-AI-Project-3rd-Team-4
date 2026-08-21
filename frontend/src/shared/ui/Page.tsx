// 화면 골격 — 모든 화면이 이걸 통해 렌더된다. 스킵 링크 · 헤더 · 콘텐츠 컬럼 · 포커스 이동을 담당한다.
//
// 반응형은 모바일 퍼스트다. md 부터 콘텐츠 폭과 여백을 키우고, lg 에서 2컬럼 여지를 둔다.
//
// DESIGN.md 준수: 그림자 없음. 표면 구분은 1px 헤어라인 보더로만.
import { useEffect, useRef, type ReactNode } from "react";

const CONTENT_ID = "page-content";

export interface PageProps {
  title: string;
  /** 제목 아래 보조 설명 */
  subtitle?: ReactNode;
  /** 헤더 우측 슬롯. 넣지 않으면 헤더에 인터랙티브 요소가 하나도 없다. */
  actions?: ReactNode;
  children: ReactNode;
  /**
   * 마운트 시 제목으로 포커스를 옮긴다.
   *
   * 화면이 바뀌어도 포커스는 body 에 남는다 — 스크린리더 사용자는 화면이 바뀐 것을 알 수 없다.
   * 그래서 화면 전환으로 들어왔을 때만 켠다. 최초 진입에는 끈다(문서 제목과 중복 낭독이 된다).
   */
  focusOnMount?: boolean;
}

const SKIP_LINK =
  "sr-only rounded-sm border border-line bg-surface px-4 py-2 text-sm font-bold text-ink " +
  "focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10";

export function Page({ title, subtitle, actions, children, focusOnMount = false }: PageProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) titleRef.current?.focus();
  }, [focusOnMount]);

  return (
    <div className="min-h-dvh bg-bg">
      <a href={`#${CONTENT_ID}`} className={SKIP_LINK}>
        본문으로 건너뛰기
      </a>

      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-6 md:max-w-2xl md:px-6 md:py-8 lg:max-w-4xl">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 ref={titleRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none md:text-2xl">
              {title}
            </h1>
            {subtitle !== undefined && <p className="text-sm text-ink-soft">{subtitle}</p>}
          </div>
          {actions}
        </header>

        <main id={CONTENT_ID} className="flex flex-col gap-5">
          {children}
        </main>
      </div>
    </div>
  );
}
