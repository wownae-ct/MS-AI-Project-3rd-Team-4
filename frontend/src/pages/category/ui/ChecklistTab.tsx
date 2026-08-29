// 체크리스트 탭 — HANDOFF.md §4 S3: FOCUS 카테고리만 업체사례 카드, 항목은 계약조항/추가비용/
// 준비사항 3그룹, "계약 조항만 보기" 토글.
//
// FOCUS 여부는 `VENUE`/`SDM` 를 하드코딩하지 않고 `CategoryConstant.has_vendor_cases` 로 판단한다
// — 이 값 자체가 백엔드 카테고리 상수표의 "업체사례" 열이므로 이 화면이 그 열의 유일한 소비처다.
import { useEffect, useState } from "react";
import {
  getChecklistItems,
  isChecklistItemKept,
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
import { Card, Loading, SkeletonRows, StatusCallout } from "@/shared/ui";
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
  // 재생성 진행 여부 — 참인 동안 **지워질 항목 자리에만** 스켈레톤이 선다(D21).
  const [regenerating, setRegenerating] = useState(false);

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
  // **Promise 를 돌려준다(D21)** — `RegenerateButton` 이 재조회 도착까지 기다린 뒤에 진행
  // 상태를 내린다. 안 그러면 그 빈틈에 곧 지워질 옛 목록이 완성본인 양 되살아난다.
  function refetchItems(): Promise<void> {
    return getChecklistItems({ categoryCode })
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

      {/* flex-wrap — 「계약 조항만 보기」 라벨(약 118px)과 「AI 체크리스트 다시 생성」 버튼(약
          131px)이 이미 빡빡한데, 재생성 후에는 그 옆에 결과 문구가 더 붙는다. 375px 폰의
          가용폭(343px)을 넘는 순간 종전엔 라벨과 버튼이 **둘 다 세로로 접혔다**(D19 §결함 ①).
          D19 가 그 붕괴를 막았으므로 이제는 넘치기 전에 줄을 바꿔 줘야 한다. */}
      {/* 안내를 **gap 없는** 상자 안에 둔다 — `StatusCallout` 은 숨어도 부모의 flex 아이템으로
          남아, gap 이 있는 컨테이너에 직접 놓으면 평소에도 빈 줄이 생긴다(그 컴포넌트 §여백). */}
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          {/* impact(유지/초기화 개수)를 넘기지 않는다 — 이 탭은 카테고리 하나의 항목만 들고 있는데
              재생성은 웨딩의 모든 카테고리를 대상으로 하므로, 여기서 센 수는 실제보다 작다.
              대신 확인 다이얼로그가 "모든 카테고리가 함께 바뀐다"를 문구로 알린다. */}
          <RegenerateButton
            domain="CHECKLIST"
            label="AI 체크리스트 다시 생성"
            onRegenerated={refetchItems}
            onPendingChange={setRegenerating}
          />
        </div>
        {/* D14 L3 의 문구 계층을 지키되 표현은 오버레이가 아니라 제자리 자리표시다(D21).
            개수를 말하지 않는 것은 위 `impact` 를 넘기지 않는 것과 같은 이유다 — 이 탭은
            카테고리 하나만 알고 재생성은 전체가 대상이라 여기서 센 수는 틀린 수가 된다. */}
        <StatusCallout shown={regenerating}>
          <p className="text-sm font-bold text-ink">AI가 체크리스트를 다시 만들고 있어요.</p>
          <p className="text-xs text-ink-soft">
            상태를 바꾸거나 메모한 항목은 그대로 남아요. 30초 정도 걸릴 수 있어요.
          </p>
        </StatusCallout>
      </div>

      {groups
        .filter((g) => !contractOnly || g === "CONTRACT_TERM")
        .map((group) => {
          const allGroupItems = visibleItems.filter((i) => i.item_type === group);
          if (allGroupItems.length === 0) return null;

          // 추가 비용/준비 사항은 그대로 전체를 낸다 — 페이지네이션은 계약 조항에만 적용한다.
          if (group !== "CONTRACT_TERM") {
            const shownItems = keepDuringRegeneration(allGroupItems, regenerating, categoryCode);
            return (
              <Card key={group} title={GROUP_LABEL[group]}>
                <ul className="flex flex-col gap-3">
                  {shownItems.map((item) => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      categoryCode={categoryCode}
                      onStatusChange={(i, next) => void handleStatusChange(i, next)}
                    />
                  ))}
                </ul>
                <RegeneratingRows shown={shownItems.length} total={allGroupItems.length} />
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

          // 재생성 중 유지/교체는 **지금 보고 있는 페이지 안에서** 가른다 — 페이지네이션은
          // 표시 방식일 뿐이라, 여기서 전체 개수로 자리표시를 세우면 한 페이지에 5개만 오던
          // 카드가 갑자기 수십 줄로 부푼다.
          const shownPageItems = keepDuringRegeneration(pageItems, regenerating, categoryCode);

          return (
            <Card key={group} title={GROUP_LABEL[group]}>
              <ul className="flex flex-col gap-3">
                {shownPageItems.map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    categoryCode={categoryCode}
                    onStatusChange={(i, next) => void handleStatusChange(i, next)}
                  />
                ))}
              </ul>
              <RegeneratingRows shown={shownPageItems.length} total={pageItems.length} />
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

      {/* 재생성 중에는 추가 폼을 감춘다 — 서버가 재생성 시작 시점에 보호되지 않은 항목을
          (직접 추가한 것까지) 지우므로, 그 사이에 추가한 항목이 방금 만들었는데 조용히 사라진다. */}
      {!regenerating && <AddChecklistItemRow categoryCode={categoryCode} onAdded={refetchItems} />}
    </div>
  );
}

/** 재생성 중이면 남을 항목만 남긴다. 평소에는 받은 목록 그대로다. */
function keepDuringRegeneration(items: ChecklistItem[], regenerating: boolean, categoryCode: string): ChecklistItem[] {
  return regenerating ? items.filter((item) => isChecklistItemKept(item, categoryCode)) : items;
}

/** 카드 안에서 지워질 항목이 차지하던 자리. `shown === 0` 이면 위 여백이 필요 없다. */
function RegeneratingRows({ shown, total }: { shown: number; total: number }) {
  const replacedCount = total - shown;
  if (replacedCount <= 0) return null;
  return (
    <div className={shown > 0 ? "mt-3" : undefined}>
      <SkeletonRows count={replacedCount} variant="row" />
    </div>
  );
}
