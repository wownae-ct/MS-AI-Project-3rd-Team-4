// "업체 사례" 카드 — ChecklistTab.tsx에서 뽑아냈다(oxlint import/max-dependencies 10개 제한,
// ChecklistItemRow.tsx와 같은 이유 — 관련 사례 근거 배지 추가로 새 import 2개가 필요해졌다).
//
// **관련 공식 분쟁조정 사례(DS2_KCA) 링크(2026-08-26, backend PR #86)** — 팀이 재구성한 카드
// (vendor_case_examples)와 실제 공식 사례가 분리돼 있어 카드의 신뢰도를 검증할 방법이 없었다.
// `VendorCase.related_cases`(각 카드가 개별로 가짐, chunk_id/title/source_tier/source_url —
// entities/chat의 ChatCitation과 같은 모양)를 `MessageBubble.tsx`의 인용 배지와 같은 클릭-펼침
// 패턴으로 보여준다. 관련 사례가 없으면 빈 배열이고, 그 카드엔 배지 자체가 안 뜬다(지어내지 않는다).
//
// expandedCitations는 이 섹션 전체에서 하나의 Set으로 관리한다(카드별로 안 나눔) — chunk_id가
// RAG 코퍼스 전역에서 유일하므로 MessageBubble.tsx와 같은 방식이 카드 여러 개에도 그대로 맞는다.
import { useState } from "react";
import type { VendorCase, VendorCaseRelatedCitation, VendorCasesResponse } from "@/entities/vendor-case";
import { safeExternalUrl } from "@/shared/lib/safe-url";
import { SOURCE_TIER_LABEL } from "@/shared/lib/source-tier";
import { Badge, Card } from "@/shared/ui";

export function VendorCaseSection({ response }: { response: VendorCasesResponse }) {
  const [expandedCitations, setExpandedCitations] = useState<Set<number>>(new Set());

  function toggleCitation(chunkId: number) {
    setExpandedCitations((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
  }

  return (
    <Card title="업체 사례">
      {/* PRD RQ-F10-02 — 이 문구는 응답이 항상 포함하며 생략 없이 그대로 렌더해야 한다.
          하드코딩하지 않고 API 응답을 그대로 쓰는 이유: 문구가 바뀌어도 프론트가 뒤따라가지 않게. */}
      <p className="mb-3 text-xs text-ink-soft">{response.disclaimer}</p>
      <ul className="flex flex-col gap-2">
        {response.cases.map((c: VendorCase) => (
          <li key={c.id} className="flex flex-col gap-1 rounded-md border border-line p-3">
            <div className="flex items-center gap-2">
              {/* GOOD 은 success 색(D12, decisions.md — 업체 사례 배지 한 곳에 한해 D6을 좁게 뒤집은
                  예외). BAD 는 Badge 기본값(bg-primary-soft text-primary)을 그대로 쓴다 — 예전엔
                  여기서 그 기본값과 완전히 같은 문자열을 다시 지정하는 죽은 분기였다. */}
              <Badge className={c.case_type === "GOOD" ? "bg-success-soft text-success" : undefined}>
                {c.case_type === "GOOD" ? "잘한 사례" : "주의할 사례"}
              </Badge>
              <p className="text-sm font-bold text-ink">{c.case_label}</p>
            </div>
            <p className="text-xs text-ink-soft">{c.situation}</p>
            <p className="text-xs font-bold text-ink">{c.key_lesson}</p>

            {c.related_cases.length > 0 && (
              <div className="mt-1 flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.related_cases.map((rc) => (
                    <RelatedCaseBadge key={rc.chunk_id} citation={rc} expanded={expandedCitations.has(rc.chunk_id)} onToggle={toggleCitation} />
                  ))}
                </div>
                {c.related_cases
                  .filter((rc) => expandedCitations.has(rc.chunk_id))
                  .map((rc) => (
                    <RelatedCaseDetail key={rc.chunk_id} citation={rc} />
                  ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RelatedCaseBadge({
  citation,
  expanded,
  onToggle,
}: {
  citation: VendorCaseRelatedCitation;
  expanded: boolean;
  onToggle: (chunkId: number) => void;
}) {
  // source_tier는 백엔드 ENUM 원문이라 그대로 보여주면 못 알아본다 — MessageBubble.tsx와 같은 이유.
  const tierLabel = SOURCE_TIER_LABEL[citation.source_tier] ?? citation.source_tier;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={`관련 공식 분쟁사례 자세히 보기: ${tierLabel} · ${citation.title}`}
      onClick={() => onToggle(citation.chunk_id)}
      className="max-w-[220px] rounded-pill border-none bg-transparent p-0 text-left enabled:hover:opacity-80"
    >
      <Badge className="w-full truncate bg-bg text-ink-soft" title={`${tierLabel} · ${citation.title}`}>
        관련 분쟁사례 · {tierLabel} · {citation.title}
      </Badge>
    </button>
  );
}

function RelatedCaseDetail({ citation }: { citation: VendorCaseRelatedCitation }) {
  const tierLabel = SOURCE_TIER_LABEL[citation.source_tier] ?? citation.source_tier;
  const safeUrl = citation.source_url ? safeExternalUrl(citation.source_url) : undefined;
  return (
    <div className="rounded-md border border-line bg-bg px-3 py-2 text-xs text-ink-soft">
      <p className="font-bold text-ink">
        {tierLabel} · {citation.title}
      </p>
      {safeUrl ? (
        <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-primary underline">
          원문 보기
        </a>
      ) : (
        // source_url이 null — 팀 자체 저작 콘텐츠가 아니라 DS2_KCA 원문이라 사실상 항상 값이
        // 있겠지만, 스키마상 nullable인 이상 MessageBubble.tsx와 같은 안내를 그대로 둔다.
        <p className="mt-1">원문 링크가 없는 자료예요.</p>
      )}
    </div>
  );
}
