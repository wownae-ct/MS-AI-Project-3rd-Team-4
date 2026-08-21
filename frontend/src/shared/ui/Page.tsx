// 화면 콘텐츠 열 — 제목 헤더와 `<main>` 랜드마크를 담당한다.
//
// **셸은 여기 없다.** 스킵 링크 · 배경 · 최소 높이는 루트 라우트가, 내비게이션은 `AppShell` 이 맡는다
// (docs/design/layout.md §6). 이 분리는 라우터 도입(ADR 0005)과 **같은 커밋**이어야 한다 —
// 먼저 빼면 스킵 링크가 갈 곳이 없어 접근성 계약이 끊긴다(실제로 한 번 그렇게 깨뜨렸다).
//
// 반응형은 모바일 퍼스트다. 폭은 화면마다 다르므로(layout.md §2 라우트 표) `width` 로 받는다.
//
// 규범 준수 (docs/design/README.md): 그림자 없음. 표면 구분은 1px 헤어라인 보더로만.
import { useEffect, useRef, type ReactNode } from "react";

/**
 * 스킵 링크의 목적지. 루트 라우트가 이 값으로 링크를 만들고 여기가 그 대상을 렌더한다 —
 * 두 곳에 문자열을 적으면 조용히 어긋나 링크가 아무 데도 가지 않는다.
 */
export const PAGE_CONTENT_ID = "page-content";

/** 폭을 주지 않은 화면의 기본값. 스타일가이드처럼 라우트 표에 폭 지정이 없는 화면이 쓴다. */
const DEFAULT_WIDTH = "max-w-lg md:max-w-2xl lg:max-w-4xl";

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
  /**
   * 콘텐츠 열 폭 — layout.md §2 라우트 표가 화면마다 정한다(타임라인 640 · 예산 720 · 온보딩 430).
   *
   * ⚠️ **Tailwind 클래스 리터럴로만** 넘긴다. `` `max-w-[${n}px]` `` 처럼 조립하면 스캐너가 찾지 못해
   * 유틸리티가 생성되지 않고 **빌드는 성공한 채 폭만 사라진다**(CLAUDE.md §5.1).
   */
  width?: string;
}

export function Page({
  title,
  subtitle,
  actions,
  children,
  focusOnMount = false,
  width = DEFAULT_WIDTH,
}: PageProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) titleRef.current?.focus();
  }, [focusOnMount]);

  return (
    <div className={`mx-auto flex w-full flex-col gap-5 px-4 py-6 md:px-6 md:py-8 ${width}`}>
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 ref={titleRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none md:text-2xl">
            {title}
          </h1>
          {subtitle !== undefined && <p className="text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {actions}
      </header>

      <main id={PAGE_CONTENT_ID} className="flex flex-col gap-5">
        {children}
      </main>
    </div>
  );
}
