// 9개 스텝 배럴 — OnboardingPage.tsx가 파일마다 개별 import하면 oxlint의
// `import/max-dependencies`(파일당 10개 상한)를 넘는다(2026-08-24, 6→8단계 재편으로 넘김;
// 2026-08-26, 확인 단계(9단계) 추가로 8→9단계 재편, 같은 이유로 `../step-copy`도 여기서 재수출).
// 스텝이 더 늘어도 컨테이너의 의존성 수가 늘지 않도록 여기서 한 번만 모은다.
export { STEP_HEADLINE, STEP_SUBTITLE, TOTAL_STEPS, type Step } from "../step-copy";
export { Step1RoleDate, type UnsurePrecision } from "./Step1RoleDate";
export { REGION_LABELS, Step2RegionBudget } from "./Step2RegionBudget";
export { Step3Taste, TASTE_CARDS } from "./Step3Taste";
export { Step4Goals } from "./Step4Goals";
export { SDM_CHIPS, Step5Priority, VENUE_CHIPS } from "./Step5Priority";
export { PROGRESS_ITEMS, Step6Progress } from "./Step6Progress";
export { categoriesToAllocationRows, Step7CategoryToggle, type AllocationRow } from "./Step7CategoryToggle";
export { Step8Allocation } from "./Step8Allocation";
export { Step9Review } from "./Step9Review";
