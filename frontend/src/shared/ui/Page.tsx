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

// `fill` 없는 기본 컨테이너 — 기존 화면은 전부 이 리터럴을 그대로 쓴다(바이트 단위로 안 바뀐다).
const CONTAINER = "mx-auto flex w-full flex-col gap-5 px-4 py-6 md:px-6 md:py-8";
// `fill`용 컨테이너 — 화면을 뷰포트에 정확히 맞추고 `<main>` 하나만 늘어나게 한다(AI상담처럼
// 내부 스크롤 영역 하나만 남기고 나머지는 고정 높이인 화면용, entities/chat/ui/ChatPanel.tsx).
// 모바일에서 6rem을 빼는 이유 — `AppShell`의 하단 탭바가 `fixed`라 문서 흐름 밖에 있고,
// `AppShell`은 `pb-24`(=6rem, CONTENT_BOTTOM_INSET, app/ui/AppShell.tsx)로 콘텐츠가 안 가리게
// 막는다. 그런데 그건 콘텐츠 높이가 내용만큼 자연스럽게 늘어날 때(document flow)만 작동하는
// 방식이고, 여기서는 반대로 높이를 뷰포트 단위(dvh)로 먼저 고정한다 — `dvh`는 조상의 padding을
// 전혀 모르므로 탭바 예약분을 여기서 다시 빼줘야 마지막 메시지/입력행이 탭바에 가려지지 않는다.
// **AppShell의 `CONTENT_BOTTOM_INSET`(pb-24) 값이 바뀌면 이 6rem도 같이 바꿀 것.**
// 데스크톱은 탭바가 `md:static` 사이드바로 바뀌어 콘텐츠를 가리지 않으므로 뺄 게 없다.
const CONTAINER_FILL =
  "mx-auto flex h-[calc(100dvh-6rem)] w-full flex-col gap-5 overflow-hidden px-4 py-6 md:h-dvh md:px-6 md:py-8";
const MAIN = "flex flex-col gap-5";
// `<main>`이 헤더를 뺀 나머지 전부를 갖게 한다 — `min-h-0`이 없으면 flex 아이템은 콘텐츠의
// 내재 크기 밑으로 못 줄어들어(flex 기본 규칙) 자식(Card/메시지 목록)이 넘칠 때 `<main>`이
// 오히려 늘어나며 버린다.
const MAIN_FILL = "flex min-h-0 flex-1 flex-col gap-5";

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
  /**
   * 화면을 뷰포트 높이에 정확히 맞춘다 — 헤더는 자기 높이만큼만 쓰고 `<main>`(그 안의 카드/
   * 스크롤 영역)이 나머지 전부를 갖는다. AI상담(entities/chat/ui/ChatPanel.tsx)처럼 내부
   * 스크롤 영역 하나만 남기고 화면 자체는 스크롤되지 않아야 하는 화면에 쓴다.
   *
   * 기본값 `false` — 기존 화면(대시보드·타임라인·예산·리포트 등)은 페이지 자체가 스크롤되는
   * 지금 동작을 그대로 유지한다.
   */
  fill?: boolean;
}

export function Page({
  title,
  subtitle,
  actions,
  children,
  focusOnMount = false,
  width = DEFAULT_WIDTH,
  fill = false,
}: PageProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // `title`도 의존성에 넣는다 — OnboardingPage.tsx처럼 라우트 이동 없이 한 Page 인스턴스 안에서
  // 화면(제목)만 바뀌는 멀티스텝 위저드가 있다(2026-08-26 접근성 감사). `focusOnMount`만 보면
  // 그 값이 처음 true가 되는 단계 전환 한 번만 포커스가 옮겨가고, 그 뒤로는 같은 true값이 계속
  // 유지되므로 effect가 다시 안 돈다 — 매 단계(제목)가 바뀔 때마다 다시 announce되게 한다.
  // 지금까지 저장소 전체에서 focusOnMount=true로 쓰는 곳이 없었으니(라우트 전환마다 Page 자체가
  // 새로 마운트돼 굳이 필요 없었다) 이 변경이 기존 화면 동작을 바꾸지 않는다.
  useEffect(() => {
    if (focusOnMount) titleRef.current?.focus();
  }, [focusOnMount, title]);

  return (
    <div className={`${fill ? CONTAINER_FILL : CONTAINER} ${width}`}>
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 ref={titleRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none md:text-2xl">
            {title}
          </h1>
          {subtitle !== undefined && <p className="text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {actions}
      </header>

      <main id={PAGE_CONTENT_ID} className={fill ? MAIN_FILL : MAIN}>
        {children}
      </main>
    </div>
  );
}
