// 첫 토큰이 오기 전(사용자 요청 "진행상황이 보이게") — 어시스턴트 말풍선과 같은 자리에 점 3개가
// 차례로 흐려졌다 밝아지며 지금 단계(근거 검색/답변 생성/검증, stage 이벤트 기반)를 문구로도
// 보여준다. `animate-bounce`(탄성 이징)는 impeccable 디자인 훅이 "촌스럽다"고 지적해
// (2026-08-24) `animate-pulse`(부드러운 opacity 페이드)로 바꿨다 — 새 라이브러리 없이 Tailwind
// 기본 유틸리티만 쓰고, 점마다 `[animation-delay:_]` 임의값으로 시차를 준다. D9/D10(그림자·링
// 금지)엔 안 걸린다(애니메이션은 그 규칙 대상이 아니다).
//
// ChatPanel.tsx의 300줄 제한(eslint max-lines)을 넘겨서 분리했다 — 이 컴포넌트는 label
// 문자열 하나만 받는 순수 프레젠테이션이라 ChatPanel의 state에 의존하지 않는다.
import { PulseDots } from "@/shared/ui";

export function TypingIndicator({ label }: { label: string }) {
  // `<output>`이 아니라 `<div>`다 — `<output>`은 암묵 role="status"(암묵 aria-live="polite")를
  // 가져서, 이 컴포넌트를 감싸는 ChatPanel.tsx의 `role="log" aria-live="polite"` 컨테이너와
  // 라이브 리전이 이중으로 겹친다(접근성 감사 2026-08-26 — 스크린리더 구현체에 따라 중복
  // announce 가능성). 바깥 log 컨테이너의 aria-relevant="additions text"가 이 라벨 텍스트
  // 추가·갱신을 그대로 잡아내므로, 여기서 별도 live 의미를 또 낼 필요가 없다.
  return (
    <div className="flex items-center gap-2">
      {/* 점 3개 마크업의 정의는 shared/ui/PulseDots.tsx 하나뿐이다(D14). 말풍선 안에 종속된
          자리라 화면 단위 대기보다 작고 옅은 변이를 쓴다. */}
      <div className="rounded-lg border border-line bg-bg px-3 py-2.5">
        <PulseDots variant="nested" />
      </div>
      <span className="text-xs text-ink-soft">{label}</span>
    </div>
  );
}
