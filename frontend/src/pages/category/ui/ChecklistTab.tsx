// 체크리스트 탭 — HANDOFF.md §4 S3: FOCUS 카테고리만 업체사례 카드, 항목은 계약조항/추가비용/
// 준비사항 3그룹, "계약 조항만 보기" 토글.
//
// FOCUS 여부는 `VENUE`/`SDM` 를 하드코딩하지 않고 `CategoryConstant.has_vendor_cases` 로 판단한다
// — 이 값 자체가 백엔드 카테고리 상수표의 "업체사례" 열이므로 이 화면이 그 열의 유일한 소비처다.
import { useEffect, useState } from "react";
import {
  getChecklistItems,
  patchChecklistItem,
  type ChecklistItem,
  type ChecklistItemType,
  type ChecklistStatus,
} from "@/entities/checklist";
import { ReportButton } from "@/entities/feedback";
import { RegenerateButton } from "@/entities/personalization";
import { getVendorCases, type VendorCase, type VendorCasesResponse } from "@/entities/vendor-case";
import type { CategoryConstant } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { Badge, Card } from "@/shared/ui";
import { AddChecklistItemRow } from "./AddChecklistItemRow";

interface ChecklistTabProps {
  categoryCode: string;
  categoryMeta: CategoryConstant | undefined;
}

const GROUP_LABEL: Record<ChecklistItemType, string> = {
  CONTRACT_TERM: "계약 조항",
  EXTRA_COST: "추가 비용",
  PREP: "준비 사항",
};

// HOMEWARE(혼수)만 다른 상태기계를 쓴다 — 03_API_spec.md #12 표. 나머지 8개 카테고리는 공통 4상태.
const HOMEWARE_STATUS_OPTIONS: { value: ChecklistStatus; label: string }[] = [
  { value: "LISTED", label: "목록에 추가" },
  { value: "COMPARING", label: "비교 중" },
  { value: "ORDERED", label: "주문 완료" },
  { value: "DELIVERED", label: "배송 완료" },
];
const DEFAULT_STATUS_OPTIONS: { value: ChecklistStatus; label: string }[] = [
  { value: "TODO", label: "할 일" },
  { value: "DOING", label: "진행 중" },
  { value: "SKIP", label: "건너뜀" },
  { value: "DONE", label: "완료" },
];

function statusOptionsFor(categoryCode: string) {
  return categoryCode === "HOMEWARE" ? HOMEWARE_STATUS_OPTIONS : DEFAULT_STATUS_OPTIONS;
}

export function ChecklistTab({ categoryCode, categoryMeta }: ChecklistTabProps) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [vendorCases, setVendorCases] = useState<VendorCasesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contractOnly, setContractOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getChecklistItems({ categoryCode })
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "체크리스트를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [categoryCode]);

  // 커스텀 항목 추가·수동 재생성 뒤 목록을 다시 받아온다 — 둘 다 서버가 항목을 새로 만들거나
  // 대체하는 동작이라 낙관적 갱신 대신 재조회가 맞다.
  function refetchItems() {
    getChecklistItems({ categoryCode })
      .then((res) => setItems(res.items))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "체크리스트를 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    if (!categoryMeta?.has_vendor_cases) return;
    let cancelled = false;
    getVendorCases(categoryCode)
      .then((res) => {
        if (!cancelled) setVendorCases(res);
      })
      .catch(() => {
        // 업체사례는 보조 콘텐츠다 — 실패해도 체크리스트 본문은 그대로 보여준다.
      });
    return () => {
      cancelled = true;
    };
  }, [categoryCode, categoryMeta?.has_vendor_cases]);

  async function handleStatusChange(item: ChecklistItem, next: ChecklistStatus) {
    const prevItems = items;
    setItems((cur) => cur?.map((i) => (i.id === item.id ? { ...i, status: next } : i)) ?? cur);
    try {
      await patchChecklistItem(item.id, { status: next });
    } catch (err) {
      // 실패하면 낙관적 갱신을 되돌린다 — 서버 상태와 화면이 어긋난 채 남지 않게 한다.
      setItems(prevItems);
      setError(err instanceof ApiError ? err.message : "상태 변경에 실패했습니다.");
    }
  }

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
        {error}
      </p>
    );
  }

  if (items === null) {
    return <p className="text-sm text-ink-soft">불러오는 중…</p>;
  }

  const visibleItems = contractOnly ? items.filter((i) => i.item_type === "CONTRACT_TERM") : items;
  const groups: ChecklistItemType[] = ["CONTRACT_TERM", "EXTRA_COST", "PREP"];

  return (
    <div className="flex flex-col gap-4">
      {categoryMeta?.has_vendor_cases ? (
        vendorCases && <VendorCaseSection response={vendorCases} />
      ) : (
        <Card>
          <p className="text-sm text-ink-soft">업체 사례는 이 카테고리에서 아직 준비 중입니다.</p>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={contractOnly}
            onChange={(e) => setContractOnly(e.target.checked)}
            className="size-4"
          />
          계약 조항만 보기
        </label>
        <RegenerateButton domain="CHECKLIST" label="AI 체크리스트 다시 생성" onRegenerated={refetchItems} />
      </div>

      {groups
        .filter((g) => !contractOnly || g === "CONTRACT_TERM")
        .map((group) => {
          const groupItems = visibleItems.filter((i) => i.item_type === group);
          if (groupItems.length === 0) return null;
          return (
            <Card key={group} title={GROUP_LABEL[group]}>
              <ul className="flex flex-col gap-3">
                {groupItems.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-ink">{item.title}</p>
                      {/* origin/source_tier는 독립 필드다(entities/checklist/model.ts 머리말) —
                          사용자가 직접 추가한 항목(origin=USER)은 출처 등급이 없는 게 정상이라
                          "내가 추가"로 명시하고, source_tier가 null인데 LLM 생성 항목이면(카탈로그
                          폴백) 등급 배지 자체를 생략한다 — 빈 배지나 "null" 텍스트를 보여주지 않는다. */}
                      {item.origin === "USER" ? (
                        <Badge>내가 추가</Badge>
                      ) : (
                        item.source_tier !== null && <Badge>{item.source_tier}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-ink-soft">{item.body}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <select
                        value={item.status}
                        onChange={(e) => void handleStatusChange(item, e.target.value as ChecklistStatus)}
                        className="w-fit rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                      >
                        {statusOptionsFor(categoryCode).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {/* 신고(F13)는 AI가 생성한 항목에만 의미가 있다 — 사용자가 직접 추가한
                          항목(origin=USER)은 본인 입력이라 신고 대상이 아니다. */}
                      {item.origin === "LLM" && <ReportButton targetType="CHECKLIST_ITEM" targetId={item.id} />}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}

      <AddChecklistItemRow categoryCode={categoryCode} onAdded={refetchItems} />
    </div>
  );
}

function VendorCaseSection({ response }: { response: VendorCasesResponse }) {
  return (
    <Card title="업체 사례">
      {/* PRD RQ-F10-02 — 이 문구는 응답이 항상 포함하며 생략 없이 그대로 렌더해야 한다.
          하드코딩하지 않고 API 응답을 그대로 쓰는 이유: 문구가 바뀌어도 프론트가 뒤따라가지 않게. */}
      <p className="mb-3 text-xs text-ink-soft">{response.disclaimer}</p>
      <ul className="flex flex-col gap-2">
        {response.cases.map((c: VendorCase) => (
          <li key={c.id} className="flex flex-col gap-1 rounded-md border border-line p-3">
            <div className="flex items-center gap-2">
              <Badge className={c.case_type === "BAD" ? "bg-primary-soft text-primary" : undefined}>
                {c.case_type === "GOOD" ? "잘한 사례" : "주의할 사례"}
              </Badge>
              <p className="text-sm font-bold text-ink">{c.case_label}</p>
            </div>
            <p className="text-xs text-ink-soft">{c.situation}</p>
            <p className="text-xs font-bold text-ink">{c.key_lesson}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
