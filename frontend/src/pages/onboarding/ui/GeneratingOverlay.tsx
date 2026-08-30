// 제출("시작하기") 직후 뜨는 전체화면 오버레이 — 사용자 요청(2026-08-24): "온보딩 다 하고 나면,
// 팝업 뜨게해. 사용자님의 응답 정보를 토대로 콘텐츠를 제작중입니다 이런 거".
//
// 장식이 아니라 실제로 필요하다 — `POST /weddings`가 개인화 라우터 에이전트(route→generate→
// validate, `backend/app/services/wedding.py:139` `await run_personalization(...)`)를 **동기로
// 기다린다.** LLM이 체크리스트·타임라인을 새로 생성하는 동안 응답 자체가 몇 초 지연되므로, 그
// 사이 화면이 아무 반응 없이 멈춰 보이지 않게 막아준다.
//
// 닫기 버튼이 없다 — 진행 중인 제출을 취소할 방법이 없으므로(이미 나간 요청) 닫을 수 있다고
// 암시하면 안 된다. Base UI Dialog는 포커스 트랩·ESC 닫기 등 "사용자가 닫을 수 있는 대화상자"
// 의미를 가정하는데 여기엔 안 맞아 쓰지 않았다 — 그냥 `fixed` 오버레이 + `role="status"`다.
// `aria-live="polite"`로 둬서 스크린리더가 뜨는 시점에 문구를 읽게 한다.
import { Brand, Card, PulseDots } from "@/shared/ui";

export function GeneratingOverlay() {
  return (
    // aria-live는 output에 둔다 — jsx-a11y가 role="status" 대신 네이티브 <output> 태그를
    // 요구한다(prefer-tag-over-role, ChatPanel.tsx의 TypingIndicator와 같은 이유).
    // 팔레트 색의 반투명 opacity modifier(예: 잉크 40%)는 이 저장소에서 아직 지원하지 않는다
    // (D7 — "상태: 제안, 지금 적용하면 빌드가 깨진다" — decisions.md). 실제 호출부
    // (OnboardingPage.tsx)도 이 컴포넌트를 콘텐츠 위에 겹치지 않고 페이지 트리 전체를 통째로
    // 대체하므로, 아래에 비칠 내용 자체가 없다 — 반투명 스크림 대신 불투명 페이지 배경을 그대로
    // 쓴다. ⚠️ 이 주석에도 그 모디파이어 문법을 그대로 적지 않는다 — Tailwind 스캐너는 클래스
    // 속성이 아니라 파일 전체를 평문으로 훑으므로, 주석 속 문자열 하나가 그대로 산출 CSS 후보가
    // 된다(직전 수정 커밋이 겪은 사고 그대로 — 클래스는 고쳤는데 설명 주석에 그 값을 그대로
    // 남겨 게이트가 다시 잡았다).
    <output className="fixed inset-0 z-50 flex items-center justify-center bg-bg p-4" aria-live="polite">
      {/*
        w-full 이 꼭 필요하다 — Card 는 `@container`(container-type: inline-size)를 쓰는데, 이
        컨테인먼트는 박스 자신의 크기가 콘텐츠에 좌우되지 않아야 한다(CSS Containment 스펙 —
        size containment). 이 화면의 다른 모든 Card 사용부는 stretch 되는 flex-col 부모(Page의
        <main>) 안에서 폭을 이미 정해서 받는데, 여기서만 Card가 `justify-center`인 flex-row
        부모(바로 위 <output>)의 shrink-to-fit 자식이라 폭을 콘텐츠 기준으로 잡으려 한다 — 그
        컨테인먼트에 막혀 실제로는 폭이 거의 0으로 무너지고, 안의 두 문장이 글자 하나마다
        줄바꿈되어 세로로 깨져 보였다(2026-08-26 실사용 중 확인). w-full + max-w-xs 로 Card가
        부모(뷰포트) 폭에서 정의된 크기를 받게 하면 콘텐츠 의존 없이 폭이 정해진다.
      */}
      <Card className="flex w-full max-w-xs flex-col items-center gap-3 text-center">
        {/* 이 대기는 실측 p95 가 45.9초다(shared/api/client.ts 의 타임아웃 상향 근거 — Langfuse
            "MerryMap" 대시보드). 45초 무음은 "멈춘 건가"로 읽히는 구간이라, 브랜드를 세워 "이 앱이
            일하는 중"이라는 신호를 준다. **정적 이미지라 D14 의 「모션은 점 3개 하나뿐」과
            prefers-reduced-motion 처리에 아무 영향이 없다** — 여기서 새로 움직이는 것은 없다.
            **여기만 심볼 변이다** — 카드가 `max-w-xs`(320px) 세로 구성이라 4.803:1 워드마크는 들어가지
            않고, 워드마크를 넣더라도 바로 아래 두 문장이 이미 상황을 말하고 있어 제품명이 겹친다. D15. */}
        <Brand size={56} variant="symbol" />
        {/* 점 3개 마크업의 정의는 shared/ui/PulseDots.tsx 하나뿐이다 — 예전엔 이 파일과
            entities/chat/ui/TypingIndicator.tsx 에 거의 같은 내용이 중복돼 있었다(D14). */}
        <PulseDots />
        <p className="text-sm font-bold text-ink">입력하신 정보를 바탕으로<br/>AI가 맞춤 콘텐츠를 만들고 있어요</p>
        <p className="text-xs text-ink-soft">체크리스트와 타임라인을 준비하는 중이에요.<br/>잠시만 기다려 주세요.</p>
      </Card>
    </output>
  );
}
