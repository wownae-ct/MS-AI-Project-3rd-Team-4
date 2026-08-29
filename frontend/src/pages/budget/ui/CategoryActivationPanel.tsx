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
// **끄는 카테고리의 예산 처리**를 포함한 저장 규칙 일체는 `activation-draft.ts` 에 있다.
//
// ## 이 패널은 이제 저장을 **소유하지 않는다**(2026-08-29 개편)
//
// 확인을 통과하면 `onSave(draft)` 를 부르고 곧바로 접힌다 — 46초의 진행 표시는 카드 본문
// (「카테고리별 예산 현황」 목록)의 제자리 자리표시가 대신 진다(D21). PUT 은
// `use-activation-save.ts` 가 든다. 그래서 여기엔 `saving` 도 진행 안내도 없다.
// 실패했을 때만 이 패널이 다시 열리고, 그때 `error`(서버 문구)와 `initialDraft`(사용자가
// 만졌던 토글)를 되받아 **아무 것도 잃지 않은 채** 재시도할 수 있게 한다.
import { useState } from "react";
import type { WeddingCategory } from "@/entities/wedding";
import { Button, ConfirmDialog, Money, Switch } from "@/shared/ui";
import { hasActivationChanges, isActiveInDraft, type ActivationDraft } from "./activation-draft";

const ROW = "flex flex-col gap-1 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0";
const TOP_ROW = "flex items-center gap-2.5";
const FIELD_NOTE = "text-xs text-ink-soft";
// 토글 폭(36px)+간격만큼 들여써 그 행에 딸린 설명임을 보인다(온보딩 7단계의 하위 옵션 줄과 같은 값).
const ROW_NOTE = "pl-[42px] text-xs text-ink-soft";

export interface CategoryActivationPanelProps {
  /** 원본 9개 전체(draft 아님). 꺼진 카테고리를 다시 켜려면 비활성 행도 있어야 한다. */
  rows: readonly WeddingCategory[];
  /** 확인을 통과한 초안. 호출부가 PUT 을 보내고 이 패널을 접는다. */
  onSave: (draft: ActivationDraft) => void;
  onCancel: () => void;
  /** 직전 저장이 실패했을 때 서버가 준 사유. 없으면 아무 것도 그리지 않는다. */
  error?: string | null;
  /** 실패한 초안 — 이 값이 있으면 그 토글 상태로 다시 시작한다(사용자가 만진 것을 잃지 않는다). */
  initialDraft?: ActivationDraft | null;
}

/** 저장된 값 그대로의 초안 — 아무 것도 만지지 않은 상태. */
function baselineDraft(rows: readonly WeddingCategory[]): ActivationDraft {
  return Object.fromEntries(rows.map((row) => [row.category_code, row.is_active]));
}

export function CategoryActivationPanel({
  rows,
  onSave,
  onCancel,
  error = null,
  initialDraft = null,
}: CategoryActivationPanelProps) {
  const [draft, setDraft] = useState<ActivationDraft>(() => initialDraft ?? baselineDraft(rows));
  const [confirming, setConfirming] = useState(false);

  // 🚨 **「취소」는 초안까지 되돌린다**(2026-08-30, 사용자 신고). 이 패널은 접혀도 마운트를
  // 유지하므로(DisclosurePanel — 닫히는 전환이 돌아야 한다) 닫기만 하면 state 가 그대로 남는다.
  // 그래서 다시 열면 **저장하지도 않은 토글이 켜진 채**로 보였다 — 취소했는데 취소가 안 된 것처럼
  // 읽힌다. 저장 성공 시에는 호출부의 `key` 가 바뀌어 새 원본으로 다시 세워지므로 여기서 할
  // 일이 없고, 저장 **실패** 시에는 되돌리면 안 된다(`initialDraft` 로 되살려 재시도하게 한다).
  function handleCancel() {
    setDraft(baselineDraft(rows));
    onCancel();
  }

  const activeCount = rows.filter((row) => isActiveInDraft(row, draft)).length;
  // 활성 집합이 그대로면 저장할 것이 없다 — 재생성만 헛돌게 하지 않는다(확인창도 안 띄운다).
  const hasChanges = hasActivationChanges(rows, draft);

  return (
    <div className="flex flex-col gap-3">
      <div>
        {rows.map((row) => {
          const isActive = isActiveInDraft(row, draft);
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
        사용 중인 카테고리 <b className="text-ink">{activeCount}개</b> / 총 {rows.length}개<br/>끈 카테고리는
        예산·타임라인·체크리스트에서 보이지 않아요.
      </p>

      {/* flex-wrap + basis-full — `error` 는 서버 문구를 그대로 싣는다(예: "배정 합계가 예산을
          3,000,000원 초과합니다."). 감싸 주지 않으면 좁은 폭에서 두 버튼을 밀어낸다.
          `BudgetPage` 의 저장 줄과 같은 형태다. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={handleCancel}>
          취소
        </Button>
        {/* 바뀐 게 없으면 확인창 없이 그냥 닫는다 — 46초짜리 재생성을 헛돌게 하지 않는다. */}
        <Button onClick={() => (hasChanges ? setConfirming(true) : handleCancel())}>저장</Button>
        {error !== null && (
          <span role="alert" className="basis-full text-sm text-primary">
            {error}
          </span>
        )}
      </div>

      {/* 문구는 `RegenerateButton` 의 3줄 구조 그대로 — 무엇이 다시 만들어지는가 / 무엇이 남고
          무엇이 지워지는가 / 얼마나 걸리는가. 그 셋이 "저장할까 말까"를 가르는 전부다.
          확인 즉시 닫는다(D21 결정 ②) — 진행 표시가 목록 쪽으로 옮겨 갔으므로 이 창이 그
          목록을 가린 채 수십 초를 버틸 이유가 없다. */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="카테고리를 바꿀까요?"
        confirmLabel="저장"
        onConfirm={() => {
          setConfirming(false);
          onSave(draft);
        }}
      >
        <p className="font-bold text-ink">체크리스트와 타임라인을 다시 만들어요.</p>
        <p>상태를 바꾸거나 메모·날짜를 손댄 항목은 그대로 남아요. 나머지는 직접 추가한 것까지 지워져요.</p>
        <p>1분 정도 걸릴 수 있어요.</p>
      </ConfirmDialog>
    </div>
  );
}
