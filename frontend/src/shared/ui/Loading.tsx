// 앰비언트 로딩 표시 — 화면·카드가 데이터를 기다리는 동안. D14 L2 계층.
//
// ## 왜 200ms 지연인가 (D14 P2)
//
// 사용자가 **방금 누른 컨트롤**은 즉시 반응해야 한다(`Button` 의 pending 이 그 역할이다).
// 반면 화면 전환·배경 조회처럼 **사용자가 그 자리를 누르지 않은** 대기는 즉시 표시하면
// 빠른 응답에서 문구가 떴다 사라지는 **깜빡임**이 되고, 그건 진행 표시가 아니라 결함으로 읽힌다.
// 그래서 지연 게이트를 컴포넌트 안에 둔다 — 호출부는 타이밍을 몰라도 된다.
//
// 최소 표시 시간(min-display)은 두지 않는다. 부모가 데이터 도착과 함께 이 컴포넌트를 언마운트해
// 버리므로 여기서 강제할 수 없고, 지연 게이트만으로 깜빡임의 대부분이 잡힌다. 라우트 단위
// 대기는 TanStack 이 이미 최소 표시를 보장한다(app/router/router.tsx 참조).
//
// ## 왜 `<output>` 인가
//
// `role="status"` 대신 네이티브 `<output>` 을 쓴다 — 암묵 role="status" + aria-live="polite" 를
// 갖고, jsx-a11y 의 prefer-tag-over-role 이 role 속성보다 네이티브 태그를 요구한다.
// 저장소 선례가 이미 그렇다(TimelinePage.tsx · AddPaymentRow.tsx · GeneratingOverlay.tsx).
//
// **빈 `<output>` 을 먼저 마운트하고 200ms 뒤에 내용을 채운다.** 처음부터 내용이 들어 있는 live
// region 은 "변화"가 아니라 초기 콘텐츠라 스크린리더가 읽지 않을 수 있다. 지연 게이트가 어차피
// 필요하므로, 그 지연을 live region 갱신으로 만들어 announce 를 확실하게 한다. 빈 구간에는
// 자식이 없어 크기를 차지하지 않는다.
import { useEffect, useState } from "react";
import { PulseDots } from "./PulseDots";

/** D14 문구 규칙 — 말줄임은 U+2026 하나로 고정한다(마침표 3개를 쓰지 않는다). */
const DEFAULT_LABEL = "불러오는 중…";

/** 이 값보다 빨리 끝나는 대기에는 아무것도 보여주지 않는다. */
const DEFAULT_DELAY_MS = 200;

const WRAP = "inline-flex items-center gap-2";
const TEXT = "text-sm text-ink-soft";

export interface LoadingProps {
  /**
   * 무엇을 기다리는지. 화면과 스크린리더가 같은 문구를 쓴다.
   *
   * D14 L2 는 짧은 명사형을 쓴다 — 이 자리는 사용자가 유발하지 않은 대기라 문장이 아니라
   * 상태 표시다. LLM 이 걸린 긴 대기(L3)는 여기가 아니라 전용 화면이 해요체 문장으로 설명한다.
   */
  label?: string;
  /**
   * 문구를 시각적으로 감춘다. **스켈레톤과 함께 쓸 때만** 켠다 — 그 경우 형태가 이미 대기를
   * 보여주므로 문구까지 겹쳐 내면 중복이다.
   *
   * ⚠️ 화면 단위 스켈레톤에는 켜지 않는다. `prefers-reduced-motion` 에서 스켈레톤의 움직임이
   * 멈추면(styles.css 전역 규칙) 로딩임을 알릴 수단이 사라져, 정지한 회색 블록이 "빈 화면"으로
   * 읽힌다 — 그때 남는 단서가 이 문구다.
   */
  srOnly?: boolean;
  /**
   * 지연 게이트를 조정한다. **이미 "표시하기로 판정된" 자리에서만 0 을 넘긴다** —
   * 라우트 전환이 그렇다(TanStack 이 1초를 먼저 기다린 뒤에야 펜딩 컴포넌트를 그리므로,
   * 여기서 또 지연을 걸면 그 200ms 동안 화면이 통째로 비어 보인다).
   *
   * 0 이어도 `useEffect` 는 최초 렌더 뒤에 돈다 — 빈 `<output>` 을 먼저 마운트하고 채우는
   * 위 순서는 그대로 유지되므로 announce 신뢰도를 잃지 않는다.
   */
  delayMs?: number;
}

export function Loading({ label = DEFAULT_LABEL, srOnly = false, delayMs = DEFAULT_DELAY_MS }: LoadingProps) {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (srOnly) {
    return <output className="sr-only">{elapsed ? label : null}</output>;
  }

  return (
    <output className={WRAP}>
      {elapsed ? (
        <>
          <PulseDots />
          <span className={TEXT}>{label}</span>
        </>
      ) : null}
    </output>
  );
}
