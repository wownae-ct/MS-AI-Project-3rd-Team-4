// 수동 재생성(#32 MANUAL_REGENERATE) 트리거 — 03_API_spec.md §9. LLM 호출이라 계정당 10/분
// 제한이 걸려 있다(backend/app/routers/personalization.py) — 429는 ApiError.message가 서버
// 문구를 그대로 전달하므로 별도 안내를 덧붙이지 않는다.
//
// 2026-08-29 — **누르면 곧바로 지운다.** 서버는 재생성 도메인의 기존 항목 중 보호되지 않은 것
// (user_edited_at IS NULL)을 전부 삭제하고 LLM 결과로 대체한다(backend/app/services/
// personalization.py::_delete_unprotected_items). 되돌리는 API 는 없다. 그런데 이 버튼은 그
// 사실을 사전에도 사후에도 말하지 않아, 사용자는 "AI 타임라인 다시 생성"을 **목록에 몇 개를
// 더해 주는 행동**으로 읽을 수밖에 없었다. 그래서 확인 다이얼로그를 앞에 세운다 — 두 문장이다:
// 무엇이 몇 개 남는가, 나머지는 어떻게 되는가(직접 추가한 것까지 지워지고 되돌릴 수 없다).
// 그 두 가지가 "누를까 말까"를 가르는 전부라 설명을 더 붙이지 않는다.
import { useState } from "react";
import { ApiError } from "@/shared/api";
import { ConfirmDialog } from "@/shared/ui";
import { regeneratePersonalization } from "../api/personalization";
import type { PersonalizationDomain } from "../model";

/** 확인 다이얼로그에 보여줄 "지금 화면 기준" 항목 수. */
export interface RegenerateImpact {
  /** 재생성 후에도 남는 항목 수 — 계산은 화면이 한다(도메인마다 판단 근거가 다르다). */
  keptCount: number;
  /** 지워지고 새로 만들어지는 항목 수. */
  resetCount: number;
}

interface DomainCopy {
  title: string;
  /** 남는 항목을 가리키는 말 — 뒤에 개수가 붙으므로 명사구로 끝낸다. */
  kept: string;
  /** 화면이 보여 주는 범위와 재생성 범위가 다를 때만. */
  scope?: string;
}

// 도메인마다 조사("타임라인**을**" / "체크리스트**를**")와 사용자가 손댄 행동의 이름이 갈려
// 완성된 문장을 따로 둔다.
const COPY: Record<PersonalizationDomain, DomainCopy> = {
  TIMELINE: {
    title: "타임라인을 다시 생성할까요?",
    kept: "체크하거나 날짜를 바꾼",
  },
  CHECKLIST: {
    title: "체크리스트를 다시 생성할까요?",
    kept: "상태를 바꾸거나 메모한",
    // 탭은 카테고리 하나만 보여 주지만 재생성은 웨딩 전체가 대상이다.
    scope: "모든 카테고리가 함께 바뀌어요.",
  },
};

interface RegenerateButtonProps {
  domain: PersonalizationDomain;
  label: string;
  /**
   * 도메인 전체 목록을 들고 있는 화면만 넘긴다. 일부만 들고 있는 화면(카테고리 하나만 보는
   * 체크리스트 탭)이 그 부분집합으로 개수를 세면 **틀린 수**를 확신에 차서 보여 주게 된다 —
   * 그럴 땐 생략하고 문구로만 알린다.
   */
  impact?: RegenerateImpact;
  /**
   * 재생성이 끝난 뒤 화면이 목록을 다시 받아오는 자리.
   *
   * **Promise 를 돌려주면 그것까지 기다린 뒤에 pending 을 내린다(D21).** 종전엔 재생성 응답만
   * 기다리고 곧바로 "다 됐다" 상태로 돌아갔는데, 그 사이(재조회가 도착하기 전) 화면에는 **곧
   * 지워질 옛 목록**이 완성된 결과인 양 잠깐 되살아났다. 화면이 그 구간에 자리표시를 세우려면
   * 「끝났다」의 정의가 재조회 도착까지여야 한다.
   */
  onRegenerated: () => void | Promise<void>;
  /**
   * 진행 여부를 화면에 알린다 — 화면은 이 값으로 **지워질 항목 자리에만** 스켈레톤을 세운다
   * (D21). 버튼 자신도 같은 상태를 쓰지만, 그건 라벨 교체와 연타 방지까지가 전부다.
   */
  onPendingChange?: (pending: boolean) => void;
}

export function RegenerateButton({ domain, label, impact, onRegenerated, onPendingChange }: RegenerateButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[domain];

  function handleOpen() {
    // 지난 실행의 결과 문구를 안고 새 확인창을 띄우지 않는다 — 방금 일어난 일처럼 읽힌다.
    setNote(null);
    setError(null);
    setConfirming(true);
  }

  async function handleConfirm() {
    setPending(true);
    onPendingChange?.(true);
    // 확인창은 먼저 닫는다 — 진행 표시는 이제 목록 쪽(자리표시)에 있고, 다이얼로그가 그 목록을
    // 가린 채 수십 초를 버티면 "무엇이 남는지"를 볼 수 없다(D21 이 오버레이를 기각한 것과 같은 이유).
    setConfirming(false);
    try {
      const result = await regeneratePersonalization([domain]);
      setNote(regenerateNote(result.status === "BLOCKED"));
      // 재조회까지 기다린다 — 위 `onRegenerated` 주석 참고.
      await onRegenerated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "다시 생성하지 못했습니다.");
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  }

  // flex-wrap + basis-full — 이 행은 자식 수가 고정인데 **뒤 둘의 길이를 서버가 정한다**
  // (`note` 는 실행 결과, `error` 는 ApiError.message — 429 rate limit 문구가 특히 길다).
  // 감싸 주지 않으면 좁은 폭에서 버튼이 밀려 글자가 넘치거나 접힌다. 상태 문구를 자기 줄에
  // 두는 이 형태는 `pages/dashboard/ui/WeddingDateEdit.tsx` 가 이미 쓰는 선례 그대로다.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleOpen}
        disabled={pending}
        className="text-xs font-bold text-ink-soft transition-colors duration-150 enabled:hover:text-primary disabled:opacity-50"
      >
        {pending ? "다시 생성하는 중…" : label}
      </button>
      {note && <output className="basis-full text-xs text-ink-soft">{note}</output>}
      {error && (
        <span role="alert" className="basis-full text-xs text-primary">
          {error}
        </span>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={copy.title}
        confirmLabel="다시 생성"
        pendingLabel="다시 생성하는 중…"
        pending={pending}
        onConfirm={() => void handleConfirm()}
      >
        {/* 개수는 문장 안에 넣는다 — 「유지 3개 · 초기화 12개」 같은 요약 줄을 따로 두면 같은 말을
            두 번 하게 된다. 굵게 두는 것은 이 줄이 결정에 필요한 사실이라서다. */}
        <p className="font-bold text-ink">
          {impact ? `${copy.kept} ${impact.keptCount}개만 남아요.` : `${copy.kept} 항목만 남아요.`}
        </p>
        <p>
          {impact
            ? `나머지 ${impact.resetCount}개는 직접 추가한 것까지 지워져요. 되돌릴 수 없어요.`
            : "나머지는 직접 추가한 것까지 지워져요. 되돌릴 수 없어요."}
        </p>
        {copy.scope && <p>{copy.scope}</p>}
      </ConfirmDialog>
    </div>
  );
}

/** 실행 뒤 한 줄. 무엇이 남는지는 확인창에서 이미 말했으므로 여기서 되풀이하지 않는다. */
function regenerateNote(blocked: boolean): string {
  return blocked ? "검증을 통과하지 못해 기본 목록으로 대체했어요." : "다시 생성했어요.";
}
