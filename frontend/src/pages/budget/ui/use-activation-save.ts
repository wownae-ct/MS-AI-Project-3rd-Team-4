// 「카테고리 사용 여부」 저장 — PUT 과 그 대기 상태를 소유한다.
//
// ## 왜 패널이 아니라 여기인가 (2026-08-29 개편)
//
// 이 PUT 은 서버에서 `run_personalization` 을 **동기로** 돌린다(실측 p95 약 46초). 예전엔 그
// 46초 내내 패널이 열려 있어 패널이 요청을 소유해도 됐다. 이제는 **확인 즉시 패널이 접히고**
// 진행 표시가 목록 쪽으로 옮겨 가므로(D21 결정 ②), 요청은 패널보다 오래 사는 주체가 들어야 한다.
// 게다가 끄는 저장은 화면을 먼저 갱신하는데 그러면 패널의 `key` 가 바뀌어 다시 마운트된다 —
// 패널이 요청을 들고 있으면 그 순간 응답을 받을 곳이 사라진다.
//
// ## 세 갈래 콜백
//
// 행 목록의 주인은 `BudgetPage` 라 갱신은 전부 위로 올린다.
//   · `onOptimistic` — 끄는 쪽만 먼저 반영(패널은 접힌 채로 두고 목록만 갱신)
//   · `onSaved`      — 서버가 돌려준 최신 9개로 확정(패널 닫기까지)
//   · `onFailed`     — 저장 직전 스냅샷으로 원상 복구(패널 재개)
//
// ## 재진입은 막는다
//
// 저장 중 또 저장하면 46초짜리 재생성이 겹친다. 예전엔 패널이 열린 채 버튼이 잠겨 있어서
// 구조적으로 불가능했는데, 패널을 접으면서 그 잠금이 사라졌다 — 여기서 다시 건다.
import { useRef, useState } from "react";
import { putWeddingCategories, type WeddingCategory } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { applyDeactivations, buildActivationPayload, splitActivationChanges, type ActivationDraft } from "./activation-draft";

const NO_PENDING: ReadonlySet<string> = new Set();

export interface UseActivationSaveOptions {
  onOptimistic: (categories: WeddingCategory[]) => void;
  onSaved: (categories: WeddingCategory[]) => void;
  onFailed: (categories: WeddingCategory[]) => void;
}

export interface ActivationSave {
  /** 켜는 중이라 아직 서버 확인 전인 코드 — 이 자리에 자리표시가 선다. */
  pendingActivations: ReadonlySet<string>;
  saving: boolean;
  /** 실패 시 서버가 준 사유. 성공하거나 다시 저장하면 지워진다. */
  error: string | null;
  /** 실패한 초안 — 패널이 다시 열릴 때 사용자의 토글을 복원하는 데 쓴다. */
  failedDraft: ActivationDraft | null;
  save: (rows: readonly WeddingCategory[], draft: ActivationDraft) => void;
  /** 실패를 접고 나갈 때(취소) — 다음에 패널을 열었을 때 지난 오류가 남아 있지 않게 한다. */
  reset: () => void;
}

export function useActivationSave({ onOptimistic, onSaved, onFailed }: UseActivationSaveOptions): ActivationSave {
  const [pendingActivations, setPendingActivations] = useState<ReadonlySet<string>>(NO_PENDING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedDraft, setFailedDraft] = useState<ActivationDraft | null>(null);
  // state 가 아니라 ref 로도 든다 — 같은 프레임에 두 번 눌리면 `saving` 은 아직 갱신 전이다.
  const inFlightRef = useRef(false);

  function save(rows: readonly WeddingCategory[], draft: ActivationDraft) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const { activated, deactivated } = splitActivationChanges(rows, draft);
    // 저장 직전 스냅샷 — 실패하면 여기로 되돌린다(낙관적 반영을 물릴 유일한 근거).
    const snapshot = [...rows];

    setPendingActivations(activated.length > 0 ? new Set(activated) : NO_PENDING);
    setSaving(true);
    setError(null);
    setFailedDraft(null);

    if (deactivated.length > 0) onOptimistic(applyDeactivations(rows, deactivated));

    putWeddingCategories(buildActivationPayload(rows, draft))
      .then((response) => {
        onSaved(response.categories);
      })
      .catch((err: unknown) => {
        onFailed(snapshot);
        setError(err instanceof ApiError ? err.message : "저장하지 못했어요. 다시 시도해 주세요.");
        setFailedDraft(draft);
      })
      .finally(() => {
        inFlightRef.current = false;
        setSaving(false);
        setPendingActivations(NO_PENDING);
      });
  }

  function reset() {
    if (inFlightRef.current) return; // 진행 중인 저장의 결과까지 지우지 않는다.
    setError(null);
    setFailedDraft(null);
  }

  return { pendingActivations, saving, error, failedDraft, save, reset };
}
