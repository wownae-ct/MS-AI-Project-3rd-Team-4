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
  type ChecklistPriority,
  type ChecklistStatus,
} from "@/entities/checklist";
import { RegenerateButton } from "@/entities/personalization";
import { getVendorCases, type VendorCasesResponse } from "@/entities/vendor-case";
import type { CategoryConstant } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { Card } from "@/shared/ui";
import { AddChecklistItemRow } from "./AddChecklistItemRow";
import { ChecklistItemRow } from "./ChecklistItemRow";
import { VendorCaseSection } from "./VendorCaseSection";

interface ChecklistTabProps {
  categoryCode: string;
  categoryMeta: CategoryConstant | undefined;
}

const GROUP_LABEL: Record<ChecklistItemType, string> = {
  CONTRACT_TERM: "계약 조항",
  EXTRA_COST: "추가 비용",
  PREP: "준비 사항",
};

// 기본 보기(계약 조항만 보기 OFF)에서 계약 조항이 화면을 다 차지하지 않도록 상위 N개만 낸다
// (2026-08-26 사용자 지시) — 전체는 "계약 조항만 보기" 토글로 본다. 순위는 서버가 이미 주는
// priority(high/mid/low)를 그대로 쓴다 — 프론트가 중요도를 새로 판단하지 않는다.
const CONTRACT_TERM_DEFAULT_LIMIT = 5;
const PRIORITY_RANK: Record<ChecklistPriority, number> = { high: 0, mid: 1, low: 2 };

export function ChecklistTab({ categoryCode, categoryMeta }: ChecklistTabProps) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [vendorCases, setVendorCases] = useState<VendorCasesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contractOnly, setContractOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getChecklistItems({ categoryCode })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setError(null);
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
      .then((res) => {
        setItems(res.items);
        // 이전 실패로 뜬 에러가 있었다면 지운다 — 안 지우면 이후 성공해도 화면 전체가 영구히
        // 에러 문구로 남는다(레드팀 감사 교차 패턴 02, 이 파일의 HIGH 항목).
        setError(null);
      })
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
      setError(null);
    } catch (err) {
      // 실패하면 낙관적 갱신을 되돌린다 — 서버 상태와 화면이 어긋난 채 남지 않게 한다.
      setItems(prevItems);
      setError(err instanceof ApiError ? err.message : "상태 변경에 실패했습니다.");
    }
  }

  // items 를 한 번도 못 받은 상태(최초 로드 실패)에서는 보여줄 콘텐츠 자체가 없으니 에러만
  // 낸다. 이미 items 가 있는데 이후 동작(상태 변경 등)이 실패한 경우는 아래에서 배너로만
  // 보여준다 — 화면 전체를 에러 문구로 영구 대체하지 않는다(레드팀 감사 HIGH 항목).
  if (error && items === null) {
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
      {error && (
        <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {error}
        </p>
      )}

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
          const allGroupItems = visibleItems.filter((i) => i.item_type === group);
          if (allGroupItems.length === 0) return null;
          // 계약 조항 + 기본 보기일 때만 상위 N개로 자른다 — "계약 조항만 보기"가 켜져 있으면
          // 그 토글의 목적 자체가 전체 확인이므로 자르지 않는다.
          const isCappedContractTerm = group === "CONTRACT_TERM" && !contractOnly;
          const groupItems = isCappedContractTerm
            ? allGroupItems
                .toSorted((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
                .slice(0, CONTRACT_TERM_DEFAULT_LIMIT)
            : allGroupItems;
          const hiddenCount = allGroupItems.length - groupItems.length;
          return (
            <Card key={group} title={GROUP_LABEL[group]}>
              <ul className="flex flex-col gap-3">
                {groupItems.map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    categoryCode={categoryCode}
                    onStatusChange={(i, next) => void handleStatusChange(i, next)}
                  />
                ))}
              </ul>
              {hiddenCount > 0 && (
                <p className="mt-2 text-xs text-ink-soft">
                  가장 중요한 {CONTRACT_TERM_DEFAULT_LIMIT}개만 보여드려요. 나머지 {hiddenCount}개는 위 「계약 조항만 보기」에서 확인하세요.
                </p>
              )}
            </Card>
          );
        })}

      <AddChecklistItemRow categoryCode={categoryCode} onAdded={refetchItems} />
    </div>
  );
}
