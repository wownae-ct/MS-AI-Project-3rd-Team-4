// 6단계: 지금까지 준비 상황(다중 선택). 시각 스펙 s1-onboarding.html:327-345.
// (2026-08-24 재감사로 6단계→8단계 재편 — 12_final_prototype_mockup.html의 onbStep6과 번호를
// 맞췄다. 내용은 그대로, 앞에 목표(4단계) 스텝이 새로 끼어들며 번호만 밀렸다.)
//
// "아직 아무것도 안 했어요"는 `DoneSoFarCategory` 값이 아니라 **다른 셋을 전부 비우는 동작**이다
// — 서버로는 빈 배열로 나간다(따로 보낼 값이 없다). 세 체크와 동시에 켜질 수 없게 상호배타로
// 처리한다: 이 항목을 누르면 나머지 셋을 지우고, 나머지 중 하나를 누르면 이 항목이 자동으로 꺼진다
// (다시 커스텀 상태를 두지 않고 done.length === 0 로 파생시킨다 — 별도 필드는 두 상태가 어긋날
// 여지를 만든다).
import type { DoneSoFarCategory } from "@/entities/wedding";
import { IconCheck } from "@/shared/ui";

// export하는 이유 — Step10Review가 DoneSoFarCategory→한글 라벨 변환에 재사용한다.
export const PROGRESS_ITEMS: { value: DoneSoFarCategory; label: string }[] = [
  { value: "MEETING", label: "상견례 완료" },
  { value: "VENUE", label: "예식장 예약 완료" },
  { value: "SDM", label: "스드메 계약 완료" },
];

const ROW = "flex items-center gap-2.5 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0";
// [2026-08-29 D18] 체크 표시는 문자 "✓"(U+2713)가 아니라 IconCheck 다. 그 코드포인트는 Wanted Sans
// 의 어느 unicode-range 조각에도 없어 OS 폰트로 폴백했고, 굵기·크기가 플랫폼마다 달랐다. 같은
// 저장소의 스타일가이드는 이미 IconCheck 를 쓰고 있어 두 방식이 갈려 있기도 했다.
// 아래 두 상수의 text-xs 는 이제 글자를 담지 않지만, 클래스 문자열을 건드리면 diff 만 커지므로 둔다.
// D1 — 라운드 토큰은 sm/md/lg/pill 4단계뿐이다(shared/ui/README.md). 5px 임의값 대신 가장 작은 토큰(sm=8px)을 쓴다.
const BOX_BASE = "flex h-5 w-5 flex-none items-center justify-center rounded-sm border border-line bg-surface text-xs text-surface";
const BOX_CHECKED = "flex h-5 w-5 flex-none items-center justify-center rounded-sm border border-primary bg-primary text-xs text-surface";
const LABEL = "cursor-pointer text-sm font-bold text-ink";

export interface Step6ProgressProps {
  doneSoFar: DoneSoFarCategory[];
  onDoneSoFarChange: (value: DoneSoFarCategory[]) => void;
}

export function Step6Progress({ doneSoFar, onDoneSoFarChange }: Step6ProgressProps) {
  const isNoneDone = doneSoFar.length === 0;

  function toggleItem(value: DoneSoFarCategory) {
    onDoneSoFarChange(doneSoFar.includes(value) ? doneSoFar.filter((item) => item !== value) : [...doneSoFar, value]);
  }

  return (
    <div>
      {PROGRESS_ITEMS.map((item) => {
        const isChecked = doneSoFar.includes(item.value);
        return (
          <div key={item.value} className={ROW}>
            <span className={isChecked ? BOX_CHECKED : BOX_BASE} aria-hidden="true">
              {isChecked ? <IconCheck size={12} /> : null}
            </span>
            <label className={LABEL}>
              <input type="checkbox" className="sr-only" checked={isChecked} onChange={() => toggleItem(item.value)} />
              {item.label}
            </label>
          </div>
        );
      })}
      <div className={ROW}>
        <span className={isNoneDone ? BOX_CHECKED : BOX_BASE} aria-hidden="true">
          {isNoneDone ? <IconCheck size={12} /> : null}
        </span>
        <label className={LABEL}>
          <input type="checkbox" className="sr-only" checked={isNoneDone} onChange={() => onDoneSoFarChange([])} />
          아직 아무것도 안 했어요
        </label>
      </div>
    </div>
  );
}
