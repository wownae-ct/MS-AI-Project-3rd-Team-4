// 「카테고리 사용 여부」 — 「카테고리별 예산 현황」 카드 제목 옆 설정 버튼으로 열리는 편집 패널
// (2026-08-29, 사용자 지시).
//
// ## 왜 생겼나
//
// 온보딩 7단계에서 끈 카테고리는 이제 예산·타임라인·체크리스트 어디에도 안 보인다. 그런데
// **다시 켤 UI 가 그 7단계 말고는 없었고**(`BudgetPage.tsx` 의 초과 안내가 그 부재를 이미
// 기록하고 있었다), 온보딩은 웨딩이 생기면 라우트 가드가 되돌려 보낸다 — 잘못 끈 사용자에게
// 되돌릴 길이 아예 없었다. 숨김을 강화하는 변경과 **같은 작업에서** 그 길을 낸다.
//
// ## 저장은 한 번, 그 전에 반드시 확인을 받는다
//
// 🚨 `PUT /wedding-categories` 는 활성 집합이 바뀌면 `run_personalization` 을 **동기로** 돌리고
// (backend `services/wedding.py:474-489`), 그 안에서 `user_edited_at IS NULL` 인 체크리스트·
// 타임라인 항목을 **전 카테고리에 걸쳐 삭제**한 뒤 LLM 결과로 갈아 끼운다(`services/
// personalization.py:95-114`). 실측 Langfuse p95 약 46초. 즉 이 패널의 토글 하나는 「AI 다시
// 생성」 버튼과 **같은 무게의 행동**이라, 그 버튼과 같은 확인 다이얼로그를 앞에 세운다
// (`entities/personalization/ui/RegenerateButton.tsx` 의 3줄 구조를 그대로 따른다).
//
// 그래서 토글은 로컬 draft 로만 쌓고 「저장」에서 한 번만 보낸다 — 토글마다 PUT 을 보내면
// 46초짜리 재생성이 클릭 수만큼 겹친다. **「취소」는 서버에 아무 것도 보내지 않는다.**
//
// ## 끄는 카테고리의 예산
//
// 서버의 초과 검증은 `is_active` 무관 9개 전체 합이라(`services/wedding.py:444-447`) 끄면서
// 금액을 남기면 "화면엔 그 행이 없는데 초과" 상태가 만들어진다 — 온보딩이
// `allocationRowsToCategoryUpdates` 에서 0 으로 미는 것과 같은 이유로 여기서도 0 으로 민다.
// **단, 이미 지불한 금액이 있으면 못 민다** — `planned_budget < paid_amount` 는 400
// BUDGET_BELOW_PAID 다(`services/wedding.py:449-467`). 그 경우엔 원래 값을 그대로 두고 행에
// 이유를 적는다(금액이 남는 것을 조용히 넘기지 않는다 — `BudgetPage` 의 초과 안내가 그 금액을
// 다시 설명한다).
import { useState } from "react";
import { putWeddingCategories, type WeddingCategory } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { Button, ConfirmDialog, Money, StatusCallout, Switch } from "@/shared/ui";

const ROW = "flex flex-col gap-1 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0";
const TOP_ROW = "flex items-center gap-2.5";
const FIELD_NOTE = "text-xs text-ink-soft";
// 토글 폭(36px)+간격만큼 들여써 그 행에 딸린 설명임을 보인다(온보딩 7단계의 하위 옵션 줄과 같은 값).
const ROW_NOTE = "pl-[42px] text-xs text-ink-soft";

export interface CategoryActivationPanelProps {
  /** 원본 9개 전체(draft 아님). 꺼진 카테고리를 다시 켜려면 비활성 행도 있어야 한다. */
  rows: readonly WeddingCategory[];
  /** 저장 성공 시 서버가 돌려준 최신 목록. 호출부가 자기 state 를 갈아 끼우고 패널을 닫는다. */
  onSaved: (categories: WeddingCategory[]) => void;
  onCancel: () => void;
}

/** 끄는 카테고리의 저장할 예산 — 이미 지불한 금액이 있으면 못 내린다(머리말 §끄는 카테고리의 예산). */
function plannedBudgetForInactive(category: WeddingCategory): number {
  return category.paid_amount > 0 ? category.planned_budget : 0;
}

export function CategoryActivationPanel({ rows, onSaved, onCancel }: CategoryActivationPanelProps) {
  // code → 활성 여부. 배열 사본 대신 이 맵만 두는 이유는 이 패널이 `is_active` 하나만
  // 만지기 때문이다 — 나머지 필드는 저장할 때 `rows` 에서 그대로 읽어 되돌려 보낸다.
  const [draft, setDraft] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((row) => [row.category_code, row.is_active])),
  );
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActiveInDraft = (row: WeddingCategory) => draft[row.category_code] ?? row.is_active;
  const activeCount = rows.filter((row) => isActiveInDraft(row)).length;
  // 활성 집합이 그대로면 저장할 것이 없다 — 재생성만 헛돌게 하지 않는다(확인창도 안 띄운다).
  const hasChanges = rows.some((row) => isActiveInDraft(row) !== row.is_active);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setConfirming(false);
    try {
      // PUT 은 부분 갱신이 아니다 — 9개 전체를 보내되 이 패널이 만지지 않는 필드
      // (`selected_options`/`display_order`)는 조회값 그대로 되돌려 보낸다.
      const response = await putWeddingCategories(
        rows.map((row) => {
          const isActive = isActiveInDraft(row);
          return {
            category_code: row.category_code,
            is_active: isActive,
            planned_budget: isActive ? row.planned_budget : plannedBudgetForInactive(row),
            selected_options: row.selected_options,
            display_order: row.display_order,
          };
        }),
      );
      onSaved(response.categories);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        {rows.map((row) => {
          const isActive = isActiveInDraft(row);
          // 켜져 있던 것을 끄는데 이미 지불액이 있는 경우에만 알린다 — 처음부터 꺼져 있던
          // 카테고리에까지 이 문장을 붙이면 사용자가 방금 한 일과 무관한 안내가 된다.
          const keepsBudget = !isActive && row.is_active && row.paid_amount > 0;
          return (
            <div key={row.category_code} className={ROW}>
              <div className={TOP_ROW}>
                <span className="flex-1 text-sm font-bold text-ink">{row.name_ko}</span>
                <Switch
                  checked={isActive}
                  label={`${row.name_ko} 카테고리 사용 여부`}
                  disabled={saving}
                  onCheckedChange={(next) => setDraft((prev) => ({ ...prev, [row.category_code]: next }))}
                />
              </div>
              {keepsBudget && (
                <p className={ROW_NOTE}>
                  이미 <Money value={row.paid_amount} />을 지불해 예산은 그대로 남아요.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className={FIELD_NOTE}>
        사용 중인 카테고리 <b className="text-ink">{activeCount}개</b> / 총 {rows.length}개 — 끈 카테고리는
        예산·타임라인·체크리스트에서 보이지 않아요.
      </p>

      {/* 버튼 줄과 진행 안내를 **gap 없는** 상자로 묶는다 — `StatusCallout` 은 숨어도 부모의
          flex 아이템으로 남아, gap 이 있는 컨테이너에 직접 놓으면 평소에도 빈 줄이 생긴다
          (그 컴포넌트 머리말 §여백). 여백은 그 컴포넌트 자신의 mt-4 가 낸다. */}
      <div className="flex flex-col">
        {/* flex-wrap + basis-full — `error` 는 서버 문구를 그대로 싣는다(예: "배정 합계가 예산을
            3,000,000원 초과합니다."). 감싸 주지 않으면 좁은 폭에서 두 버튼을 밀어낸다.
            `BudgetPage` 의 저장 줄과 같은 형태다. */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 저장 중엔 취소를 막는다 — 안 막으면 이미 시작된 PUT 이 취소 뒤에도 진행돼, 성공 시
              되돌린 줄 알았던 변경이 그대로 반영된다(`BudgetPage` 의 시나리오 저장과 같은 이유). */}
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            취소
          </Button>
          {/* 바뀐 게 없으면 확인창 없이 그냥 닫는다 — 46초짜리 재생성을 헛돌게 하지 않는다. */}
          <Button
            onClick={() => (hasChanges ? setConfirming(true) : onCancel())}
            pending={saving}
            pendingLabel="저장 중…"
          >
            저장
          </Button>
          {error !== null && (
            <span role="alert" className="basis-full text-sm text-primary">
              {error}
            </span>
          )}
        </div>

        {/* 확인창은 먼저 닫으므로(handleSave) 그 뒤 수십 초의 진행을 말해 줄 자리가 필요하다 —
            버튼 라벨("저장 중…")만으로는 **얼마나** 걸리는지 알 수 없어 멈춘 것처럼 읽힌다.
            타임라인·체크리스트 재생성 안내와 같은 장치·같은 문구 계층이다(D14 L3 / D21). */}
        <StatusCallout shown={saving}>
          <p className="text-sm font-bold text-ink">AI가 체크리스트와 타임라인을 다시 만들고 있어요.</p>
          <p className="text-xs text-ink-soft">손댄 항목은 그대로 남아요. 1분 정도 걸릴 수 있어요.</p>
        </StatusCallout>
      </div>

      {/* 문구는 `RegenerateButton` 의 3줄 구조 그대로 — 무엇이 다시 만들어지는가 / 무엇이 남고
          무엇이 지워지는가 / 얼마나 걸리는가. 그 셋이 "저장할까 말까"를 가르는 전부다. */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="카테고리를 바꿀까요?"
        confirmLabel="저장"
        pendingLabel="저장 중…"
        pending={saving}
        onConfirm={() => void handleSave()}
      >
        <p className="font-bold text-ink">체크리스트와 타임라인을 다시 만들어요.</p>
        <p>상태를 바꾸거나 메모·날짜를 손댄 항목은 그대로 남아요. 나머지는 직접 추가한 것까지 지워져요.</p>
        <p>1분 정도 걸릴 수 있어요.</p>
      </ConfirmDialog>
    </div>
  );
}
