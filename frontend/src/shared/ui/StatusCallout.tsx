// 상태 안내 블록 — 조건이 참일 때만 부드럽게 나타나고, 거짓이 되면 부드럽게 사라진다.
// 스크린리더에는 **나타나는 순간 한 번** 낭독된다.
//
// 온보딩 8단계(Step8Allocation)의 "설정한 예산이 총예산을 초과했어요" 블록에서 뽑아냈다
// (2026-08-29). 예산 재배분 화면(S6)이 같은 장치를 써야 하는데 `pages/budget` 은
// `pages/onboarding` 을 import 할 수 없어서다(.oxlintrc.json 의 슬라이스 경계). 마크업을
// 복사하지 않는 이유는 아래 세 불변식이 **전부 실제로 한 번씩 깨졌던 것**이라서다.
//
// ## 불변식 1 — 리전은 항상 마운트, 안쪽만 `display` 로 들고 난다
//
// 스크린리더는 라이브 리전 **안에서 실제로 일어난 변화**를 보고 읽는다. 조건부 렌더로 리전을
// 통째로 마운트하면 그 등장을 놓치는 경우가 많고, 반대로 `overflow-hidden`+높이 0 으로 접으면
// 내용이 접근성 트리에 계속 남아 아무 변화가 없다 — 애니메이션을 얻는 대신 낭독을 잃는다.
// `display` 토글은 내용을 트리에서 실제로 들고 나므로 둘 다 만족한다. 탭 순서에서 빠지는 것도
// 브라우저가 알아서 해준다(`inert` 를 따로 걸 필요가 없다).
//
// `role="status"` 를 붙인 <div> 가 아니라 <output> 인 이유 — jsx-a11y(prefer-tag-over-role)가
// 네이티브 태그를 요구한다(Page.tsx 의 progressbar 가 겪은 그 규칙). <output> 의 암묵 role 이
// 정확히 status 라 의미는 그대로다. assertive(alert)가 아닌 이유 — 슬라이더를 끄는 동안 문구가
// 나타났다 사라지므로, assertive 면 진행 중인 낭독을 계속 끊는다.
//
// ## 불변식 2 — 사라지는 쪽에도 전환 선언이 있어야 한다
//
// `display` 는 이산(discrete) 속성이라 원래 전환되지 않는다. `transition-discrete`
// (`transition-behavior: allow-discrete`)가 **사라질 때** `display:none` 적용을 전환이 끝난 뒤로
// 미루고, `starting:opacity-0`(`@starting-style`)이 **나타날 때** 시작 불투명도를 준다. 하나만
// 빠지면 그 방향이 조용히 툭 끊긴다. 지원하지 않는 브라우저에서는 즉시 나타났다 사라진다 — 깨지지 않는다.
//
// ## 불변식 3 — 두 리터럴은 display 와 opacity 만 달라야 한다
//
// 🚨 사용자 신고(2026-08-28, "버벅거리며 사라짐"). `allow-discrete` 가 적용을 미뤄 주는 것은
// `display` **하나뿐**이다. 숨김 쪽에서 레이아웃 클래스를 같이 빼면, 사라지는 200ms 동안 요소는
// 아직 flex 인 채로 방향이 row 로, 간격이 0 으로, 위 여백이 0 으로 **즉시** 튄다 — 내용이 가로로
// 뭉치며 점프한 뒤에야 페이드가 돈다. 레이아웃 값은 양쪽에 똑같이 적는다(숨은 동안에는
// `display:none` 이라 아무 영향이 없다). `flex` 만 예외로 한쪽에만 둔다 — `hidden` 과 `flex` 는
// 둘 다 display 유틸리티라 어느 쪽이 이기는지가 클래스 나열 순서가 아니라 산출 CSS 순서로
// 정해진다. 한 요소에 둘을 같이 얹지 않는다(`flex-col`·`gap-*` 은 충돌하지 않는다).
//
// ## 여백을 이 컴포넌트가 갖는 이유
//
// <output> 은 숨어도(안쪽만 `display:none`) **여전히 부모의 flex 아이템**이라, 부모에 `gap` 이
// 있으면 숨은 동안에도 그 간격이 그대로 남아 빈 줄이 생긴다. 그래서 호출부는 이 컴포넌트를
// **gap 없는 컨테이너** 안에 놓고, 위쪽 여백은 여기 `mt-4` 가 낸다(숨으면 함께 사라진다).
import type { ReactNode } from "react";

const SHOWN =
  "mt-4 flex flex-col gap-1.5 opacity-100 transition-[opacity,display] transition-discrete duration-200 starting:opacity-0";
const HIDDEN =
  "mt-4 hidden flex-col gap-1.5 opacity-0 transition-[opacity,display] transition-discrete duration-200";

export interface StatusCalloutProps {
  /** 참이면 나타나고 거짓이면 사라진다. 양방향 모두 전환이 돈다. */
  shown: boolean;
  children: ReactNode;
}

export function StatusCallout({ shown, children }: StatusCalloutProps) {
  return (
    <output className="flex flex-col">
      <div className={shown ? SHOWN : HIDDEN}>{children}</div>
    </output>
  );
}
