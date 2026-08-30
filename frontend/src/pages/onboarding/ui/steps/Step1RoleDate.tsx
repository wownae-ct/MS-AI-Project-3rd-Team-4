// 1단계: 역할 + 결혼예정일. 시각 스펙 s1-onboarding.html:190-230.
import type { UserRole, WeddingDatePrecision } from "@/entities/wedding";
import { todayISO, weddingQuickPicks } from "@/shared/lib/date";
import type { UnsurePrecisionOption } from "@/shared/lib/wedding-date";
import { DateField } from "@/shared/ui";
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

/** `WeddingDatePrecision`에서 "정확한 날짜"를 뺀 나머지 — 미정 칩이 여기 대응한다. */
export type UnsurePrecision = Exclude<WeddingDatePrecision, "EXACT">;

// "계획 없음"만 날짜와 무관한 고정 칩이다 — 나머지(올해/내년 하반기 등)는 OnboardingPage가
// `computeUnsurePrecisionOptions(today)`로 계산해 `unsurePrecisionOptions`로 내려준다
// (2026-08-26 사용자 결정: 항상 "오늘이 속한 반기 다음 연속 반기들"을 보여준다).
const NO_PLAN_CHIP: { value: UnsurePrecision; label: string } = { value: "NO_PLAN", label: "계획 없음" };

export interface Step1Props {
  userRole: UserRole;
  onUserRoleChange: (role: UserRole) => void;
  isDateExact: boolean;
  onDateModeChange: (isExact: boolean) => void;
  weddingDate: string;
  onWeddingDateChange: (date: string) => void;
  unsurePrecisionOptions: UnsurePrecisionOption[];
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
  unsurePrecisionOptions,
  unsurePrecision,
  onUnsurePrecisionChange,
}: Step1Props) {
  const chips: { value: UnsurePrecision; label: string }[] = [...unsurePrecisionOptions, NO_PLAN_CHIP];
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
          <>
            {/* [D20] `<input type="date">` 였다. 이 칸이 자체 캘린더로 옮겨서 가장 크게 달라지는
                자리다 — 결혼식은 대개 **토요일**이고, 네이티브 휠 피커는 요일을 보여주지 않아
                "내년 5월 토요일"을 고르려면 달력 앱을 따로 열어야 했다. 이제 월 그리드가 주말을
                굵게 보여주고, 고르면 아래 힌트가 "2027년 5월 15일 (토) · 259일 뒤"로 확인해 준다.
                `min` — 지나간 날짜를 결혼 **예정**일로 등록할 이유가 없다(대시보드의 수정 칸은
                다르다: 이미 치른 결혼의 날짜를 고칠 수 있어야 해서 min 을 두지 않는다).
                [2026-08-30] 빠른 선택은 `futureQuickPicks`(오늘·1주 뒤·1개월 뒤)가 아니라
                **`weddingQuickPicks`(6·12·18개월 뒤)** 다 — 이 칸의 척도는 「곧 있을 일」이
                아니라 준비 기간이다(그 함수 주석). */}
            <DateField
              className={INPUT}
              aria-label="결혼 예정일"
              min={todayISO()}
              value={weddingDate}
              onChange={onWeddingDateChange}
              quickPicks={weddingQuickPicks(todayISO())}
            />
            {/* <form noValidate> + type="button" 뿐인 위저드라 HTML5 required 검증이 애초에
                안 걸린다 — 값이 비어 있으면 "다음"으로 넘어가도 결국 제출 시점에야 422가
                뜬다(레드팀 감사). 진행을 막기 전에 여기서 먼저 알린다. */}
            {weddingDate === "" && <p className={FIELD_NOTE}>결혼 예정일을 입력해 주세요.</p>}
          </>
        ) : (
          <>
            <div className={CHIP_GROUP}>
              {chips.map((chip) => (
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
