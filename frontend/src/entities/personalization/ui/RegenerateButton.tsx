// 수동 재생성(#32 MANUAL_REGENERATE) 트리거 — 03_API_spec.md §9. LLM 호출이라 계정당 10/분
// 제한이 걸려 있다(backend/app/routers/personalization.py) — 429는 ApiError.message가 서버
// 문구를 그대로 전달하므로 별도 안내를 덧붙이지 않는다.
import { useState } from "react";
import { ApiError } from "@/shared/api";
import { regeneratePersonalization } from "../api/personalization";
import type { PersonalizationDomain } from "../model";

interface RegenerateButtonProps {
  domain: PersonalizationDomain;
  label: string;
  onRegenerated: () => void;
}

export function RegenerateButton({ domain, label, onRegenerated }: RegenerateButtonProps) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    setNote(null);
    try {
      const result = await regeneratePersonalization([domain]);
      setNote(
        result.status === "BLOCKED"
          ? "AI 생성이 검증을 통과하지 못해 기본 목록으로 대체됐어요."
          : "다시 생성됐어요.",
      );
      onRegenerated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "다시 생성하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={pending}
        className="text-xs font-bold text-ink-soft transition-colors duration-150 enabled:hover:text-primary disabled:opacity-50"
      >
        {pending ? "다시 생성하는 중…" : label}
      </button>
      {note && <output className="text-xs text-ink-soft">{note}</output>}
      {error && (
        <span role="alert" className="text-xs text-primary">
          {error}
        </span>
      )}
    </div>
  );
}
