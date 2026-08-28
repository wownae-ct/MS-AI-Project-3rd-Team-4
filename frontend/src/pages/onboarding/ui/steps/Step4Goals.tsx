// 4단계(신규): 이번 준비에서 가장 바라는 것(primary_goals, v4.0 신규 필드, 스킵 가능).
// 2026-08-24 재감사 전까지 이 스텝 자체가 통째로 없었다 — entities/wedding/model/types.ts의
// WeddingCreateInput.primary_goals는 존재하는데 채울 UI가 없어 OnboardingPage.tsx가 항상
// undefined로만 보냈다(12_final_prototype_mockup.html의 onbStep4 대조로 발견).
//
// 문구는 목업 원문(12_final_prototype_mockup.html:787)을 그대로 옮긴다 — 다른 스텝과 달리 이건
// 완전 신규 필드라 대체할 기존 박정건 저작 카피가 없다. 그런 경우 목업 문구를 쓰는 게 지어내는
// 것보다 낫다는 판단(사용자 지시 "디자인/문구는 정건님꺼대로, 없는 건 목업 참고"의 자연스러운 적용).
import { CHIP_BASE, CHIP_GROUP, CHIP_SELECTED } from "../onboarding-styles";

const GOAL_OPTIONS = [
  "예산 초과 없이 준비",
  "계약서 꼼꼼히 확인",
  "남들 안 하는 실수 피하기",
  "빠르게 최소한만 준비",
  "하객 응대 잘하기",
];

export interface Step4GoalsProps {
  goals: string[];
  onGoalsChange: (goals: string[]) => void;
}

export function Step4Goals({ goals, onGoalsChange }: Step4GoalsProps) {
  function toggleGoal(goal: string) {
    onGoalsChange(goals.includes(goal) ? goals.filter((g) => g !== goal) : [...goals, goal]);
  }

  return (
    <div className={CHIP_GROUP}>
      {GOAL_OPTIONS.map((goal) => (
        <button
          key={goal}
          type="button"
          className={goals.includes(goal) ? CHIP_SELECTED : CHIP_BASE}
          onClick={() => toggleGoal(goal)}
        >
          {goal}
        </button>
      ))}
    </div>
  );
}
