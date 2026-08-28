// 5단계: 카테고리 우선순위(스킵 가능). 시각 스펙 s1-onboarding.html:293-324.
// (2026-08-24 재감사로 6단계→8단계 재편 — 12_final_prototype_mockup.html의 onbStep5와 번호를
// 맞췄다. 새로 생긴 4단계(목표, StepGoals.tsx)가 이 앞에 끼어들며 밀렸을 뿐 내용은 그대로다.)
//
// 이전 버전은 실제 `VenuePriority`/`SdmPriority` ENUM(backend/app/schemas/wedding.py:18-19)을
// 검증 없이 잘못 옮겨 PRICE/STYLE 같은 존재하지 않는 값을 보내 POST /weddings 를 422로
// 거부당하게 만들었다(2026-08-24). 다시 확인해보니 목업의 칩 문구(s1-onboarding.html:305-307,
// 314-317)가 이미 실제 ENUM 값과 정확히 1:1로 대응한다 — 지어낼 필요가 없었다.
import type { SdmPriority, VenuePriority } from "@/entities/wedding";
import { CHIP_BASE, CHIP_GROUP, CHIP_SELECTED } from "../onboarding-styles";

// export하는 이유 — Step10Review가 SdmPriority/VenuePriority→한글 라벨 변환에 재사용한다.
export const SDM_CHIPS: { value: SdmPriority; label: string }[] = [
  { value: "DRESS", label: "추가금 있어도 예쁜 드레스" },
  { value: "PHOTO", label: "추억으로 남는 사진" },
  { value: "MAKEUP", label: "그날은 내가 공주(메이크업)" },
];

export const VENUE_CHIPS: { value: VenuePriority; label: string }[] = [
  { value: "FOOD", label: "맛있는 식사" },
  { value: "LOCATION", label: "편한 위치" },
  { value: "PARKING", label: "넉넉한 주차" },
  { value: "CAPACITY", label: "많은 하객 수용" },
];

export interface Step5Props {
  sdmPriority: SdmPriority | null;
  onSdmPriorityChange: (value: SdmPriority) => void;
  venuePriority: VenuePriority | null;
  onVenuePriorityChange: (value: VenuePriority) => void;
}

export function Step5Priority({ sdmPriority, onSdmPriorityChange, venuePriority, onVenuePriorityChange }: Step5Props) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-ink">스드메</p>
        <div className={CHIP_GROUP}>
          {SDM_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={sdmPriority === chip.value ? CHIP_SELECTED : CHIP_BASE}
              onClick={() => onSdmPriorityChange(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-ink">예식장</p>
        <div className={CHIP_GROUP}>
          {VENUE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={venuePriority === chip.value ? CHIP_SELECTED : CHIP_BASE}
              onClick={() => onVenuePriorityChange(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
