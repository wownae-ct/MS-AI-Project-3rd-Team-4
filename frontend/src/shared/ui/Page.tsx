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
// 배럴(./index.ts)이 아니라 파일을 직접 가리킨다 — 같은 폴더 안에서 배럴을 거치면 순환이 된다.
import { Brand } from "./Brand";
import { SHELL_FILL_HEIGHT } from "./shell-metrics";

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
//
// 높이를 여기서 계산하지 않는다 — `SHELL_FILL_HEIGHT`(./shell-metrics)가 `AppShell`의 두 예약분과
// **같은 산술**에서 낸다. `dvh`는 조상의 padding을 전혀 모르므로, 높이를 뷰포트 단위로 먼저
// 고정하는 이 컨테이너는 두 고정바의 몫을 다시 빼야 헤더가 상단 바에, 입력행이 하단 탭바에
// 가려지지 않는다.
//
// 🚨 [2026-08-29] 종전엔 이 자리에 뷰포트 높이에서 **고정 192px**을 빼는 리터럴이 박혀 있었고
// 주석이 *"AppShell의 값이 바뀌면 이쪽도 같이 바꿀 것"*이라고 경고했다. **경고만으로는 지켜지지
// 않았다** — 그쪽 예약분이 `env(safe-area-inset-*)`를 빠뜨린 고정값이라 노치 아이폰에서 실제 바
// 높이와 어긋나 있었고, 이 리터럴은 그 어긋난 값을 다시 베껴 쓰고 있었다. 두 파일이 서로를
// import할 수 없어서(`shared`는 `app`을 못 본다) 값이 갈렸던 것이므로, 공유 지점인 `shared`에
// 상수를 두는 것으로 구조를 고친다.
// ⚠️ 이 주석에 옛 유틸리티 이름을 평문으로 적지 않는다 — Tailwind 스캐너가 주석 속 클래스명도
// 그대로 산출 CSS로 만든다(shell-metrics.ts 머리말의 같은 경고).

// 🚨 [2026-08-30] 모바일 여백을 한 단계씩 좁혔다 — 세로 `py-6`(24px) → `py-2`(8px) ·
// `gap-5`(20px) → `gap-3`(12px), 가로 `px-4`(16px) → `px-3`(12px).
// **`fill` 화면에서만** 달라진다 — 비-`fill` 인 위 `CONTAINER` 는 한 글자도 안 건드렸으므로 나머지
// 화면 8개의 출력은 바이트 단위로 그대로다. 그리고 `fill` 을 쓰는 화면은 지금 `/chat` 하나뿐이다.
//
// 세로 사유: 이 화면은 **뷰포트 높이가 곧 예산**이라 여기서 아낀 32+8=40px 이 그대로 대화창이
// 커지는 것으로 돌아온다(사용자 리포트 2026-08-30 "채팅창이 정사각형이고 높이가 짧다" — 실측
// 크롬이 뷰포트의 56% 였다). 스크롤되는 일반 화면이었다면 같은 변경이 그냥 답답해지기만 했을 것이다.
//
// 가로 사유(D27 개정): 대화 표면이 **이 값을 그대로 자기 바깥 여백으로 쓴다.** 종전엔 표면이
// 음수 마진으로 이 패딩을 상쇄해 화면 끝까지 흘렀는데, 그러면 카드를 둘러싸던 `bg` 배경이 사라져
// 좌우가 「열려 있는」 것으로 보였다(사용자 리포트 2026-08-30). 이제 표면은 음수 마진 없이 이 안에
// 들어오므로 **제목·「지난 대화」 버튼과 카드 왼쪽 끝이 같은 선에 선다.** 16px 이 아니라 12px 인
// 것은 그 정렬을 지키면서 가로도 조금 되찾기 위해서다.
// `md:` 변이가 데스크톱에서 종전 값을 정확히 되돌린다 — 넓은 화면은 세로도 가로도 부족하지 않다.
const CONTAINER_FILL =
  `mx-auto flex w-full flex-col gap-3 overflow-hidden px-3 py-2 md:gap-5 md:px-6 md:py-8 ${SHELL_FILL_HEIGHT}`;
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
  /**
   * 제목 위에 브랜드 **워드마크**를 높이 N(px)으로 렌더한다. **셸 밖 화면 전용**(로그인 · 온보딩).
   *
   * 왜 `children` 이 아니라 prop 인가 — 이 컴포넌트가 `<header>`(h1)를 첫 자식으로 내므로 호출부는
   * `children` 으로 **제목 위**에 아무것도 놓을 수 없다. 셸 안 화면은 사이드바·모바일 상단 바가
   * 이미 브랜드를 담당하므로 여기서 또 내면 중복 노출이 된다 — 그래서 **기본값이 없다**(미지정이면
   * 렌더하지 않는다 → 기존 화면들의 출력이 바이트 단위로 그대로다).
   *
   * ⚠️ `fill` 과 함께 쓰지 않는다 — `CONTAINER_FILL` 의 높이 계산이 헤더 높이를 상수로 가정하고 있어
   * 락업 높이만큼 어긋난다. 현재 `fill` 사용처는 셸 안의 AI상담뿐이라 실제 충돌은 없다.
   */
  brand?: number;
  /**
   * 제목 **위**의 내비 줄 — `Breadcrumb`(계층 · 조상 링크) 또는 `BackLink`(히스토리 뒤로) 하나 (D25).
   *
   * `brand` 와 같은 이유로 prop 이다 — 이 컴포넌트가 `<header>`(h1)를 첫 자식으로 내므로 호출부는
   * `children` 으로 제목 위에 아무것도 놓을 수 없다.
   *
   * **화면당 하나만 넣는다.** 두 컴포넌트는 뜻이 갈린다(위치 vs 히스토리) — 계층이 있는 화면은
   * 브레드크럼브의 조상 링크가 이미 「위로」를 겸하므로 뒤로를 함께 두면 같은 일을 하는 컨트롤이
   * 둘이 된다. 그래서 슬롯도 하나다.
   *
   * ⚠️ `brand` 와 함께 쓰지 않는다 — `brand` 는 **셸 밖 화면**(로그인 · 온보딩) 전용이고 그 화면들엔
   * 돌아갈 상위 화면이 없다. 반대로 이 슬롯은 셸 안 화면 전용이다.
   * ⚠️ `fill` 과도 함께 쓰지 않는다 — `brand` 와 **같은 사유**다(`CONTAINER_FILL` 의 높이 계산이
   * 헤더 높이를 상수로 가정한다). 현재 `fill` 사용처는 AI상담 하나이고 그건 최상위 탭이라
   * 이 슬롯을 쓰지 않는다.
   */
  nav?: ReactNode;
}

export function Page({
  title,
  subtitle,
  actions,
  children,
  focusOnMount = false,
  width = DEFAULT_WIDTH,
  fill = false,
  brand,
  nav,
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

  const header = (
    <header className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 ref={titleRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none md:text-2xl">
          {title}
        </h1>
        {subtitle !== undefined && <p className="text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );

  return (
    <div className={`${fill ? CONTAINER_FILL : CONTAINER} ${width}`}>
      {/* `self-start` — 이 컨테이너는 `flex flex-col` 이라 기본 `align-items: stretch` 다. img 는
          width 속성이 있어 실제로는 늘어나지 않지만(계산된 cross size 가 auto 가 아니다), 그 사실에
          기대지 않고 명시한다. */}
      {brand !== undefined && <Brand size={brand} className="self-start" />}

      {/* `nav` 를 안 넘긴 화면은 **지금까지와 바이트 단위로 같은 트리**를 낸다 — 래퍼가 생기지 않는다.
          넘긴 화면만 `gap-2`(8px) 래퍼로 묶는다: 컨테이너의 `gap-5`(20px)를 그대로 쓰면 내비 줄이
          제목에서 떨어져 나가 **별개의 블록**처럼 보인다. 브레드크럼브는 제목의 일부로 읽혀야 한다. */}
      {nav === undefined ? header : <div className="flex flex-col gap-2">{nav}{header}</div>}

      <main id={PAGE_CONTENT_ID} className={fill ? MAIN_FILL : MAIN}>
        {children}
      </main>
    </div>
  );
}
