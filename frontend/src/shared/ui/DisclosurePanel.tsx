// 카드 안에서 아래로 부드럽게 펼쳐지는 패널 — 트리거는 호출부가 그린다(`aria-expanded` +
// `aria-controls={id}`).
//
// 온보딩 8단계(Step8Allocation)의 총예산 인라인 수정 패널에서 뽑아냈다(2026-08-29). 예산 재배분
// 화면(S6)의 총예산 수정도 같은 모양이 되면서 공용화했다 — `pages/budget` 은 `pages/onboarding` 을
// import 할 수 없다(.oxlintrc.json 의 슬라이스 경계). 마크업을 복사하지 않는 이유는 아래 네
// 불변식이 **전부 실제로 한 번씩 깨졌던 것**이라서다.
//
// ## 1. 높이 전환은 `grid-template-rows: 0fr ↔ 1fr`
//
// 높이를 모르는 콘텐츠를 `height: auto` 로 전환할 수 없어 흔히 `max-height` 에 넉넉한 상수를
// 주는데, 그러면 (a) 콘텐츠가 그 값을 넘으면 잘리고 (b) 실제 높이보다 큰 거리를 같은 시간에
// 달려 이징이 끝부분에서 뚝 끊긴 것처럼 보인다. `0fr → 1fr` 은 실제 높이를 브라우저가 잡으므로
// 매직 넘버가 없다. 크기 전환이라 duration-200 — 색 전환(150)과 구분하는 이 저장소 관례다(Progress.tsx).
//
// ## 2. 안쪽 `overflow-hidden` 은 장식이 아니라 필수 조건
//
// 그리드 아이템의 자동 최소 크기(`min-height: auto`)가 콘텐츠 높이 아래로 못 줄어들게 막는데,
// `overflow: hidden` 이 그 최소값을 0 으로 바꾼다. 빼면 접힌 상태에서도 높이가 그대로 남는다.
//
// ## 3. 접혀도 마운트를 유지하되 `inert` 를 건다
//
// 접히는 쪽에도 전환이 돌려면 떼어낼 수 없다(조건부 렌더는 나갈 프레임이 없다). 그런데 높이
// 0 으로 잘렸을 뿐 DOM 에는 그대로 있어서, `inert` 가 없으면 **보이지도 않는 입력칸에 Tab 으로
// 들어가고** 스크린리더가 그 내용을 읽는다.
//
// ## 4. `-mx-4` ↔ `mx-4` — 포커스 링이 잘리지 않게 하는 짝
//
// 🚨 사용자 신고(2026-08-28, "입력창 포커스 좌측과 하단이 카드 틀에 잘림"). 위 `overflow-hidden`
// 은 높이만 자르는 게 아니라 **박스 밖으로 나가는 것을 전부** 자른다. styles.css 의
// `:focus-visible` 규칙은 2px 선을 2px 띄워 그리므로 포커스 링이 요소 밖으로 4px 뻗는데,
// 입력칸이 클리퍼의 왼쪽 끝에 붙어 있고 아래쪽도 클리퍼의 끝이라 그 4px 이 잘려 나갔다.
//
// 그래서 **클리퍼를 카드 패딩만큼 바깥으로 흘리고**(`-mx-4`) **안쪽 콘텐츠를 같은 값만큼
// 되돌려 넣는다**(`mx-4`). 콘텐츠에 `px-1` 만 주는 쪽이 간단하지만 그러면 내용이 카드의 다른
// 줄들보다 4px 안으로 들어가 잘림을 정렬 어긋남과 맞바꾸는 셈이 된다.
//
// **전제: 이 패널은 `p-4` 컨테이너 안에 놓인다.** `Card`(shared/ui/Card.tsx)와 온보딩 요약
// 카드가 둘 다 `p-4` 라 같은 값이 그대로 맞는다. 다른 패딩의 컨테이너에 쓰려면 이 짝을 그
// 값으로 맞춰야 한다(조립하지 말고 완성된 리터럴을 하나 더 만들 것 — Tailwind 스캐너는 소스를
// 평문으로 읽어 런타임 조립을 찾지 못하고 빌드는 성공한 채 스타일만 사라진다).
//
// ⚠️ **아래쪽은 같은 수법을 쓸 수 없다.** `-mb-4` 를 걸면 접혔을 때(높이 0) 그 음수 여백이
// 그대로 남아 카드의 아래 패딩을 먹는다. 아래는 콘텐츠 안쪽 `pb-1.5`(6px > 4px)로 확보한다 —
// 접히면 클리퍼 안이라 같이 잘려 사라지므로 접힌 모양에는 영향이 없다.
//
// ⚠️ 이 주석에 그 CSS 속성 이름(포커스 테두리를 그리는 그것)을 평문으로 적지 않는다 — Tailwind
// 스캐너는 파일 전체를 평문으로 훑어 주석 속 단어 하나를 그대로 유틸리티 후보로 만든다. 실제로
// 그 수정의 첫 커밋이 잡혔다(ghost-candidates.test.mjs).
import { useEffect, useRef, type ReactNode } from "react";

const PANEL_OPEN = "-mx-4 grid grid-rows-[1fr] transition-[grid-template-rows] duration-200";
const PANEL_CLOSED = "-mx-4 grid grid-rows-[0fr] transition-[grid-template-rows] duration-200";
/** 흘려보낸 만큼 되돌려 넣는 짝(`mx-4` ↔ `-mx-4`) + 포커스 링 하단 여유(`pb-1.5`). */
const PANEL_CONTENT = "mx-4 mt-3 border-t border-line pt-3 pb-1.5";

export interface DisclosurePanelProps {
  /** 트리거의 `aria-controls` 가 가리킬 값. 화면 안에서 유일해야 한다. */
  id: string;
  open: boolean;
  /**
   * 열릴 때 안쪽 첫 입력칸으로 포커스를 옮긴다(기본 true). 이 패널은 대개 화면 아래쪽 안내에서
   * 열리므로, 트리거에 포커스를 남기면 키보드 사용자가 펼쳐진 칸을 찾아 다시 Tab 해야 한다.
   *
   * 스크롤은 하지 않는다 — 스크롤 목적지(카드 전체)가 이 패널 **바깥**이라 호출부만 알 수 있다.
   */
  focusOnOpen?: boolean;
  children: ReactNode;
}

export function DisclosurePanel({ id, open, focusOnOpen = true, children }: DisclosurePanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !focusOnOpen) return;
    contentRef.current?.querySelector("input")?.focus();
  }, [open, focusOnOpen]);

  return (
    <div id={id} className={open ? PANEL_OPEN : PANEL_CLOSED}>
      <div className="overflow-hidden" inert={!open}>
        {/* 여백·구분선을 바깥이 아니라 여기 두는 이유 — overflow-hidden 안쪽이라야 접혔을 때
            같이 잘린다. 바깥에 두면 접힌 상태에서도 빈 줄과 선이 남는다. */}
        <div ref={contentRef} className={PANEL_CONTENT}>
          {children}
        </div>
      </div>
    </div>
  );
}
