// 7단계(분리됨): 카테고리를 켜고 끄기 + 하위 옵션 선택. 시각 스펙 s1-onboarding.html:348-378의
// 토글 부분만 — 예산 배분(금액 입력)은 8단계(Step8Allocation.tsx)로 분리했다.
//
// **분리 근거(2026-08-24 재감사).** 이전 버전(Step6Allocation.tsx)은 토글과 금액 입력을 한 스텝,
// 한 행에 합쳐 두었다. 12_final_prototype_mockup.html의 onbStep7/onbStep8은 이 둘을 완전히 다른
// 두 스텝으로 그린다 — 7단계는 "무엇을 켤지"만, 8단계는 "얼마씩 배분할지"만 묻는다. 두 결정을
// 한 화면에 섞으면 꺼진 카테고리에 실수로 금액을 남겨두기 쉽다(활성 여부와 금액이 독립적으로
// 렌더되던 이전 구조의 실제 위험) — 분리하면 8단계에 활성 카테고리만 보이므로 그 실수 자체가
// 불가능해진다.
//
// **`AllocationRow`가 이 파일 소속인 이유.** `categoriesToAllocationRows`(GET /categories 응답을
// 행 초기값으로 바꾸는 함수)가 활성 여부의 최초 소스이므로, 그 타입도 여기서 정의하고 8단계는
// 이 파일에서 import만 한다 — 타입 정의가 두 곳에 흩어지면 필드가 갈릴 위험이 생긴다.
import type { CategoryConstant, WeddingCategoryUpdateInput } from "@/entities/wedding";
import { CHIP_SM_BASE, CHIP_SM_SELECTED, FIELD_NOTE } from "../onboarding-styles";

export interface AllocationRow {
  categoryCode: string;
  nameKo: string;
  hasCost: boolean;
  displayOrder: number;
  isActive: boolean;
  plannedBudget: number;
  /** SDM/HOMEWARE 카테고리만 실제 하위 옵션이 있다(OPTIONS_BY_CATEGORY 참조) — 나머지는 항상
      빈 배열. `WeddingCategoryUpdateInput.selected_options`로 그대로 나간다. */
  selectedOptions: string[];
}

/** `GET /categories` 응답을 배분 행 초기값으로 바꾼다 — 전부 활성, 금액 0, 옵션 없음(사용자가 채운다). */
export function categoriesToAllocationRows(categories: CategoryConstant[]): AllocationRow[] {
  return categories
    .toSorted((a, b) => a.display_order - b.display_order)
    .map((category) => ({
      categoryCode: category.code,
      nameKo: category.name_ko,
      hasCost: category.has_cost,
      displayOrder: category.display_order,
      isActive: true,
      plannedBudget: 0,
      selectedOptions: [],
    }));
}

/**
 * 배분 행 → `POST /weddings` 의 `categories` 항목. 위 `categoriesToAllocationRows` 의 역방향이라
 * 같은 파일에 둔다 — 두 변환이 갈라져 있으면 필드가 하나 늘었을 때 한쪽만 고쳐도 조용하다.
 * (OnboardingPage.tsx에서 옮겨왔다, 2026-08-28 — oxlint max-lines 상한.)
 *
 * ⚠️ **꺼둔 카테고리는 예산을 반드시 0으로 보낸다.** 서버의 초과 검증은 `is_active` 를 보지 않고
 * 9개 전체를 합산하므로(01-endpoints.md:149), 끄면서 금액을 남기면 클라이언트 계산은 통과인데
 * 서버가 400 BUDGET_EXCEEDED 를 낸다. 8단계에서 금액을 넣고 7단계로 돌아가 끈 경우가 실제로
 * 그 조합을 만든다(행 배열의 `plannedBudget` 은 다시 켤 때를 위해 남아 있다).
 */
export function allocationRowsToCategoryUpdates(rows: readonly AllocationRow[]): WeddingCategoryUpdateInput[] {
  return rows.map((row) => ({
    category_code: row.categoryCode,
    is_active: row.isActive,
    planned_budget: row.isActive ? row.plannedBudget : 0,
    display_order: row.displayOrder,
    selected_options: row.isActive ? row.selectedOptions : null,
    ...(row.isActive ? {} : { skip_reason: "온보딩에서 사용 안 함으로 표시" }),
  }));
}

// `GET /categories`(CategoryConstant) 응답엔 하위 옵션 목록이 없다 — 이 카탈로그는 API 계약이
// 아니라 12_final_prototype_mockup.html의 onbStep7(opts 맵, 라인 831 부근)을 그대로 옮긴
// 프론트 전용 상수다. 목업도 하드코딩하고 있어 여기서도 하드코딩이 정당하다(서버가 아직 이
// 데이터를 안 준다).
const OPTIONS_BY_CATEGORY: Record<string, readonly string[]> = {
  SDM: ["드레스샵투어"],
  HOMEWARE: ["가전", "가구", "침구/소품"],
};

// h-6(24px) — WCAG 2.2 SC 2.5.8(AA, 접근성 감사 2026-08-26) 최소 타겟 크기. 이전 21px는
// AA 최저선에도 못 미쳤다.
const TOGGLE_ON = "relative h-6 w-9 flex-none rounded-pill bg-primary";
const TOGGLE_OFF = "relative h-6 w-9 flex-none rounded-pill bg-line";
// D1 — 무한 반경 유틸리티는 게이트가 잡는다(shared/ui/README.md). 원형 노브는 rounded-pill 로.
// top-1 — 24px 트랙 안에서 16px 노브를 수직 중앙에 놓는다((24-16)/2=4px).
const TOGGLE_KNOB = "absolute top-1 h-4 w-4 rounded-pill bg-surface transition-[right,left] duration-150";

const ROW = "flex flex-col gap-2 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0";
const TOP_ROW = "flex items-center gap-2.5";
const OPTS_ROW = "flex flex-wrap gap-1.5 pl-[42px]"; // 토글 폭(36px)+간격만큼 들여써 하위 옵션임을 보인다.

export interface Step7Props {
  rows: AllocationRow[];
  onRowsChange: (rows: AllocationRow[]) => void;
}

export function Step7CategoryToggle({ rows, onRowsChange }: Step7Props) {
  const activeCount = rows.filter((row) => row.isActive).length;

  function updateRow(categoryCode: string, patch: Partial<AllocationRow>) {
    onRowsChange(rows.map((row) => (row.categoryCode === categoryCode ? { ...row, ...patch } : row)));
  }

  function toggleOption(row: AllocationRow, option: string) {
    const next = row.selectedOptions.includes(option)
      ? row.selectedOptions.filter((o) => o !== option)
      : [...row.selectedOptions, option];
    updateRow(row.categoryCode, { selectedOptions: next });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        {rows.map((row) => {
          const options = OPTIONS_BY_CATEGORY[row.categoryCode] ?? [];
          return (
            <div key={row.categoryCode} className={ROW}>
              <div className={TOP_ROW}>
                <span className="flex-1 text-sm font-bold text-ink">{row.nameKo}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.isActive}
                  aria-label={`${row.nameKo} 카테고리 사용 여부`}
                  className={row.isActive ? TOGGLE_ON : TOGGLE_OFF}
                  onClick={() => updateRow(row.categoryCode, { isActive: !row.isActive })}
                >
                  <span className={`${TOGGLE_KNOB} ${row.isActive ? "right-0.5" : "left-0.5"}`} />
                </button>
              </div>
              {row.isActive && options.length > 0 && (
                <div className={OPTS_ROW}>
                  {options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={row.selectedOptions.includes(option) ? CHIP_SM_SELECTED : CHIP_SM_BASE}
                      onClick={() => toggleOption(row, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className={FIELD_NOTE}>
        활성 카테고리 <b className="text-ink">{activeCount}개</b> / 총 {rows.length}개 — 다음
        단계에서 이 카테고리들에만 예산을 배분해요.
      </p>
    </div>
  );
}
