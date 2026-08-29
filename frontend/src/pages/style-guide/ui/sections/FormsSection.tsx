// 입력 프리미티브 카탈로그. `ComponentsSection.tsx` 에서 갈라 둔 이유는 그 파일이 이미 300줄
// 상한(.oxlintrc.json)에 가까워서다 — 내용이 다른 것이 아니라 자리가 없었다.
import { useId, useState } from "react";
import { futureQuickPicks, todayISO } from "@/shared/lib/date";
import { DateField, Select } from "@/shared/ui";
import { Rule, Section } from "../doc-parts";

const DEMO_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-3 text-base text-ink";

const DEMO_OPTIONS = [
  { value: "VENUE", label: "예식장" },
  { value: "SDM", label: "스드메" },
  { value: "HONEYMOON", label: "신혼여행" },
];

export function SelectSection() {
  const fieldId = useId();
  const [category, setCategory] = useState("VENUE");
  const [filter, setFilter] = useState("SDM");

  return (
    <Section
      title="드롭다운"
      hint="네이티브 select 를 대체합니다. 열린 목록도 닫힌 상자와 같은 디자인 시스템 안에 있습니다."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold text-ink" htmlFor={fieldId}>
            field — 전용 입력 폼 안 (보이는 라벨 16px · 상자 44px)
          </label>
          <Select
            id={fieldId}
            className="w-full"
            value={category}
            onValueChange={setCategory}
            options={DEMO_OPTIONS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-ink">compact — 콘텐츠 안 컨트롤 (보이는 라벨 14px · 상자 36px)</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-ink">카드 제목처럼 14px 인 이웃</span>
            <Select
              size="compact"
              aria-label="예시 — 카테고리 필터"
              value={filter}
              onValueChange={setFilter}
              options={DEMO_OPTIONS}
            />
          </div>
        </div>

        <Rule>
          <span className="font-bold">목록까지 우리가 그립니다.</span> 네이티브 select 의 목록은
          브라우저와 OS 가 그려 모서리·행 높이·하이라이트 색에 CSS 가 닿지 않습니다 — 닫힌 상자를
          앱 스타일로 맞출수록 그 대비가 오히려 커집니다.
        </Rule>
        <Rule>
          <span className="font-bold">compact 는 콘텐츠 안에 홀로 놓인 컨트롤 전용</span>입니다. 옆에
          입력칸이 함께 서는 폼에서는 field 를 씁니다 — 한 줄에 두 크기가 섞이는 편이 더 나쁩니다.
        </Rule>
        <Rule>
          <span className="font-bold">목록은 트리거를 따라갑니다</span> — 바깥 문맥과 무관하게 글자
          크기가 같고, 선택은 색과 굵기로 갈립니다. compact 는 상자만 36px 이고 터치 타겟은 44px 입니다.
        </Rule>
        <Rule>
          <span className="font-bold">고르는 자리에서는 감추지 않습니다.</span> 팝업은 트리거 폭을
          하한으로 내용까지 넓어지고, 그래도 넘치면 말줄임이 아니라 어절 단위로 접힙니다. 반대로
          트리거는 한 줄로 줄입니다 — 값에 따라 행 높이가 출렁이면 목록 전체가 들썩입니다.
        </Rule>
        <Rule>
          키보드로 전부 됩니다 — <span className="font-bold">↑↓ · Home/End · Enter · Esc · Tab</span>,
          그리고 글자를 치면 그 항목으로 건너뜁니다. 닫힌 채로 치면 열지 않고 값만 바뀝니다(네이티브와 같습니다).
        </Rule>
      </div>
    </Section>
  );
}

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
