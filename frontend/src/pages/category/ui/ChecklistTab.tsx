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
import { Card, Loading, SkeletonRows } from "@/shared/ui";
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

// 계약 조항을 5개씩 페이지네이션한다(2026-08-26 사용자 지시, 2차 — 원래는 상위 5개만 보여주고
// 나머지는 힌트 문구로 안내했으나, "계약 조항만 보기"를 켰을 때 전체를 한 번에 쏟아내는 것도
// 마찬가지로 불편하다는 지적에 토글 여부와 무관하게 항상 이 페이지네이션을 적용한다). 순위는
// 서버가 이미 주는 priority(high/mid/low)를 그대로 쓴다 — 프론트가 중요도를 새로 판단하지 않는다.
const CONTRACT_TERM_PAGE_SIZE = 5;
const PRIORITY_RANK: Record<ChecklistPriority, number> = { high: 0, mid: 1, low: 2 };
const PAGE_BUTTON =
  "text-xs font-bold text-ink-soft transition-colors duration-150 enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";

export function ChecklistTab({ categoryCode, categoryMeta }: ChecklistTabProps) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [vendorCases, setVendorCases] = useState<VendorCasesResponse | null>(null);
  // null 하나로는 "아직 안 왔다"와 "영영 안 온다"가 구분되지 않는다 — 로딩 자리를 잡기 시작한
  // 이상 실패를 따로 알아야 그 자리를 회수할 수 있다(D14 SE2).
  const [vendorCasesFailed, setVendorCasesFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractOnly, setContractOnly] = useState(false);
  const [contractPage, setContractPage] = useState(0);

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
    // 카테고리를 바꾸면 이전 카테고리의 계약 조항 페이지 번호가 그대로 남아 있으면 안 된다.
    setContractPage(0);
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
        if (!cancelled) setVendorCasesFailed(true);
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
    // D14 L2 — 카드 안 목록이라 문구는 보조기기에만 낸다(형태가 이미 대기를 보여준다).
    return (
      <Card>
        <SkeletonRows count={5} />
        <Loading srOnly />
      </Card>
    );
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
        // 로딩 중엔 자리를 잡고, 실패하면 회수한다 — 영구 자리표시를 남기지 않는다(D14 SE2).
        vendorCases ? (
          <VendorCaseSection response={vendorCases} />
        ) : (
          !vendorCasesFailed && (
            <Card title="업체 사례">
              <SkeletonRows count={2} />
              <Loading srOnly />
            </Card>
          )
        )
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
            onChange={(e) => {
              setContractOnly(e.target.checked);
              setContractPage(0); // 토글을 바꾸면 이전 상태의 페이지 번호가 새 목록엔 안 맞을 수 있다.
            }}
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

          // 추가 비용/준비 사항은 그대로 전체를 낸다 — 페이지네이션은 계약 조항에만 적용한다.
          if (group !== "CONTRACT_TERM") {
            return (
              <Card key={group} title={GROUP_LABEL[group]}>
                <ul className="flex flex-col gap-3">
                  {allGroupItems.map((item) => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      categoryCode={categoryCode}
                      onStatusChange={(i, next) => void handleStatusChange(i, next)}
                    />
                  ))}
                </ul>
              </Card>
            );
          }

          // 계약 조항 — priority 순으로 정렬한 뒤 5개씩 페이지네이션한다. "계약 조항만 보기"
          // 토글 여부와 무관하게 항상 이 페이지네이션을 적용한다(2026-08-26 사용자 지시).
          const sortedContractItems = allGroupItems.toSorted(
            (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
          );
          const totalPages = Math.max(1, Math.ceil(sortedContractItems.length / CONTRACT_TERM_PAGE_SIZE));
          // 항목이 줄어들어(예: 재생성) 이전 페이지 번호가 더는 유효하지 않을 수 있다 — 렌더 시점에
          // 항상 유효 범위로 되돌린다(state 자체를 강제로 고치지 않아도 다음 클릭부터 정상 동작).
          const safePage = Math.min(contractPage, totalPages - 1);
          const pageItems = sortedContractItems.slice(
            safePage * CONTRACT_TERM_PAGE_SIZE,
            (safePage + 1) * CONTRACT_TERM_PAGE_SIZE,
          );

          return (
            <Card key={group} title={GROUP_LABEL[group]}>
              <ul className="flex flex-col gap-3">
                {pageItems.map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    categoryCode={categoryCode}
                    onStatusChange={(i, next) => void handleStatusChange(i, next)}
                  />
                ))}
              </ul>
              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-center gap-4 border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => setContractPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className={PAGE_BUTTON}
                  >
                    <span aria-hidden="true">‹</span> 이전
                  </button>
                  {/* 이전/다음을 눌러도 포커스는 버튼에 그대로 남고 목록만 바뀐다 — 스크린리더
                      사용자에게 페이지가 바뀌었음을 알리려면 이 값의 변경 자체를 announce해야
                      한다(WCAG 4.1.3 상태 메시지). role="alert"(에러용, 이 파일도 이미 그렇게
                      씀)보다 약한 aria-live="polite"가 맞다 — 사용자 조작으로 인한 예상된 변경이라
                      즉시 끼어들 필요는 없다. */}
                  <span aria-live="polite" aria-atomic="true" className="text-xs text-ink-soft tabular-nums">
                    {safePage + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setContractPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage >= totalPages - 1}
                    className={PAGE_BUTTON}
                  >
                    다음 <span aria-hidden="true">›</span>
                  </button>
                </div>
              )}
            </Card>
          );
        })}

      <AddChecklistItemRow categoryCode={categoryCode} onAdded={refetchItems} />
    </div>
  );
}
