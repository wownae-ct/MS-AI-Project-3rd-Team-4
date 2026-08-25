// 첫 토큰이 오기 전(사용자 요청 "진행상황이 보이게") — 어시스턴트 말풍선과 같은 자리에 점 3개가
// 차례로 흐려졌다 밝아지며 지금 단계(근거 검색/답변 생성/검증, stage 이벤트 기반)를 문구로도
// 보여준다. `animate-bounce`(탄성 이징)는 impeccable 디자인 훅이 "촌스럽다"고 지적해
// (2026-08-24) `animate-pulse`(부드러운 opacity 페이드)로 바꿨다 — 새 라이브러리 없이 Tailwind
// 기본 유틸리티만 쓰고, 점마다 `[animation-delay:_]` 임의값으로 시차를 준다. D9/D10(그림자·링
// 금지)엔 안 걸린다(애니메이션은 그 규칙 대상이 아니다).
//
// ChatPanel.tsx의 300줄 제한(eslint max-lines)을 넘겨서 분리했다 — 이 컴포넌트는 label
// 문자열 하나만 받는 순수 프레젠테이션이라 ChatPanel의 state에 의존하지 않는다.
export function TypingIndicator({ label }: { label: string }) {
  return (
    <output className="flex items-center gap-2" aria-label={label}>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-bg px-3 py-2.5">
        <span className="size-1.5 animate-pulse rounded-pill bg-ink-soft [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-pulse rounded-pill bg-ink-soft [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-pulse rounded-pill bg-ink-soft" />
      </div>
      <span className="text-xs text-ink-soft">{label}</span>
    </output>
  );
}
