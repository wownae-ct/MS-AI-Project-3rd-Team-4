// 1단계: 역할 + 결혼예정일. 시각 스펙 s1-onboarding.html:190-230.
import type { UserRole, WeddingDatePrecision } from "@/entities/wedding";
import {
  CHIP_BASE,
  CHIP_GROUP,
  CHIP_SELECTED,
  CHOICE_CARD_BASE,
  CHOICE_CARD_SELECTED,
  CHOICE_CARD_TITLE,
  CHOICE_CARD_TITLE_SELECTED,
  FIELD_LABEL,
  FIELD_NOTE,
  INPUT,
  MODE_TOGGLE_LABEL,
  MODE_TOGGLE_LABEL_ACTIVE,
  MODE_TOGGLE_TRACK,
} from "../onboarding-styles";

/** `WeddingDatePrecision`에서 "정확한 날짜"를 뺀 나머지 — 미정 칩 4개가 여기 대응한다. */
export type UnsurePrecision = Exclude<WeddingDatePrecision, "EXACT">;

const UNSURE_CHIPS: { value: UnsurePrecision; label: string }[] = [
  { value: "APPROX_H2_THIS_YEAR", label: "올해 하반기" },
  { value: "APPROX_H1_NEXT_YEAR", label: "내년 상반기" },
  { value: "APPROX_H2_NEXT_YEAR", label: "내년 하반기" },
  { value: "NO_PLAN", label: "계획 없음" },
];

export interface Step1Props {
  userRole: UserRole;
  onUserRoleChange: (role: UserRole) => void;
  isDateExact: boolean;
  onDateModeChange: (isExact: boolean) => void;
  weddingDate: string;
  onWeddingDateChange: (date: string) => void;
  unsurePrecision: UnsurePrecision;
  onUnsurePrecisionChange: (precision: UnsurePrecision) => void;
}

export function Step1RoleDate({
  userRole,
  onUserRoleChange,
  isDateExact,
  onDateModeChange,
  weddingDate,
  onWeddingDateChange,
  unsurePrecision,
  onUnsurePrecisionChange,
}: Step1Props) {
  return (
    <div className="flex flex-col gap-5">
      <div className={FIELD_LABEL}>
        역할
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            className={userRole === "BRIDE" ? CHOICE_CARD_SELECTED : CHOICE_CARD_BASE}
            onClick={() => onUserRoleChange("BRIDE")}
          >
            <span className={userRole === "BRIDE" ? CHOICE_CARD_TITLE_SELECTED : CHOICE_CARD_TITLE}>예비신부</span>
          </button>
          <button
            type="button"
            className={userRole === "GROOM" ? CHOICE_CARD_SELECTED : CHOICE_CARD_BASE}
            onClick={() => onUserRoleChange("GROOM")}
          >
            <span className={userRole === "GROOM" ? CHOICE_CARD_TITLE_SELECTED : CHOICE_CARD_TITLE}>예비신랑</span>
          </button>
        </div>
      </div>

      <div className={FIELD_LABEL}>
        결혼 예정일
        <div className={MODE_TOGGLE_TRACK} role="tablist" aria-label="결혼 예정일 확정 여부">
          <button
            type="button"
            role="tab"
            aria-selected={isDateExact}
            className={isDateExact ? MODE_TOGGLE_LABEL_ACTIVE : MODE_TOGGLE_LABEL}
            onClick={() => onDateModeChange(true)}
          >
            정확한 날짜
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isDateExact}
            className={isDateExact ? MODE_TOGGLE_LABEL : MODE_TOGGLE_LABEL_ACTIVE}
            onClick={() => onDateModeChange(false)}
          >
            아직 미정
          </button>
        </div>

        {isDateExact ? (
          <input
            className={INPUT}
            type="date"
            value={weddingDate}
            onChange={(event) => onWeddingDateChange(event.target.value)}
          />
        ) : (
          <>
            <div className={CHIP_GROUP}>
              {UNSURE_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  className={unsurePrecision === chip.value ? CHIP_SELECTED : CHIP_BASE}
                  onClick={() => onUnsurePrecisionChange(chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <p className={FIELD_NOTE}>정확한 날짜가 정해지면 나중에 언제든 바꿀 수 있어요.</p>
          </>
        )}
      </div>
    </div>
  );
}
