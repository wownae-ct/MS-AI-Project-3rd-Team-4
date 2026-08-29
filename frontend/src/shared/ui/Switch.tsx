// 켜고 끄는 스위치 — 온보딩 7단계(`pages/onboarding/ui/steps/Step7CategoryToggle.tsx`)에서
// 그대로 뽑아 올렸다(2026-08-29). 예산 재배분 화면의 「카테고리 사용 여부」 패널이 **같은
// 토글**을 써야 하는데 `pages` 슬라이스끼리는 서로 import 할 수 없다(.oxlintrc.json) —
// `shared/ui` 가 유일한 공유 지점이다(DisclosurePanel·StatusCallout 이 같은 경로로 올라왔다).
//
// 마크업을 복사하지 않는 이유는 **두 화면이 같은 결정을 서로 다르게 그리게 되기 때문**이다.
// 온보딩에서 끄고 예산에서 켜는 것은 같은 필드(`WeddingCategory.is_active`)를 만지는 같은
// 행동이라, 스위치가 갈리면 사용자는 두 곳이 다른 것을 한다고 읽는다.
//
// ## 크기는 접근성 하한이지 취향이 아니다
//
// h-6(24px) — WCAG 2.2 SC 2.5.8(AA, 접근성 감사 2026-08-26) 최소 타겟 크기. 이 값을 줄이면
// AA 최저선 아래로 내려간다(이전 21px 가 실제로 그랬다).
//
// ## `role="switch"` + `aria-checked` 를 쓴다
//
// 네이티브 `<input type="checkbox">` 가 아니다 — 트랙/노브 두 겹을 그려야 하고 체크박스로는
// 그 모양을 낼 수 없다. 대신 접근명(`aria-label`)을 **필수 prop** 으로 둔다: 이 컨트롤엔
// 보이는 라벨이 붙지 않는 자리(행 끝)에 놓이므로, 선택 사항으로 두면 이름 없는 스위치가 조용히
// 만들어진다.

// D1 — 무한 반경 유틸리티는 게이트가 잡는다(shared/ui/README.md). 원형 노브도 rounded-pill 로.
const TRACK_ON = "relative h-6 w-9 flex-none rounded-pill bg-primary disabled:opacity-50";
const TRACK_OFF = "relative h-6 w-9 flex-none rounded-pill bg-line disabled:opacity-50";
// top-1 — 24px 트랙 안에서 16px 노브를 수직 중앙에 놓는다((24-16)/2=4px).
const KNOB_ON = "absolute top-1 right-0.5 h-4 w-4 rounded-pill bg-surface transition-[right,left] duration-150";
const KNOB_OFF = "absolute top-1 left-0.5 h-4 w-4 rounded-pill bg-surface transition-[right,left] duration-150";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** 접근명. 보이는 라벨이 없는 자리에 놓이는 컨트롤이라 **필수**다(머리말 참고). */
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={checked ? TRACK_ON : TRACK_OFF}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className={checked ? KNOB_ON : KNOB_OFF} />
    </button>
  );
}
