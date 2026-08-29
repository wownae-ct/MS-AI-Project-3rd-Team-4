// 입력 프리미티브 카탈로그. `ComponentsSection.tsx` 에서 갈라 둔 이유는 그 파일이 이미 300줄
// 상한(.oxlintrc.json)에 가까워서다 — 내용이 다른 것이 아니라 자리가 없었다.
import { useState } from "react";
import { futureQuickPicks, todayISO } from "@/shared/lib/date";
import { DateField } from "@/shared/ui";
import { Rule, Section } from "../doc-parts";

const DEMO_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-3 text-base text-ink";

export function DateFieldSection() {
  const [exact, setExact] = useState("");
  const [optional, setOptional] = useState("");

  return (
    <Section
      title="날짜 입력"
      hint="네이티브 type=date 를 대체합니다. 값은 언제나 ISO 문자열이고, 사람이 읽는 서식은 아래 힌트 줄이 냅니다."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-ink">필수 날짜 (오늘 이후)</span>
          <DateField
            className={DEMO_INPUT}
            aria-label="예시 — 필수 날짜"
            min={todayISO()}
            value={exact}
            onChange={setExact}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-ink">선택 날짜 (빠른 선택 · 지우기)</span>
          <DateField
            className={DEMO_INPUT}
            aria-label="예시 — 선택 날짜"
            value={optional}
            onChange={setOptional}
            quickPicks={futureQuickPicks(todayISO())}
            clearable
          />
        </div>

        <Rule>
          네이티브가 주던 것을 하나도 잃지 않습니다 — 숫자만 쳐도 구분자가 끼어들고(모바일 숫자
          키패드), ↑↓ 는 하루 · PageUp/PageDown 은 한 달을 옮기며, 범위 밖 날짜는 셀이 잠깁니다.
          대신 요일과 남은 날수, 빠른 선택, 브라우저마다 갈리지 않는 표기를 얻습니다.
        </Rule>
        <Rule>
          캘린더 그리드는 <span className="font-bold">첫 열림 때 내려받는 별도 청크</span>입니다.
          필드에 포인터나 포커스가 닿는 순간 미리 받아 두므로 실제로 열 때는 기다림이 없습니다.
        </Rule>
      </div>
    </Section>
  );
}
