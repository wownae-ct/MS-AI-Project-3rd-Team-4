// "비용 관리" 섹션 — 전 카테고리 통합 납부 내역 + 영수증 OCR 입력 (UX 개편, 2026-08-26 신설).
//
// `getPayments()`를 `categoryCode` 없이 부른다 — 이 파라미터가 원래 optional이라(entities/payment/
// api/payment.ts) 전체 카테고리 결제 내역 조회에 백엔드 변경이 필요 없다. **정렬은 서버가 보장하지
// 않으므로 화면이 직접 세운다** — 규칙과 근거는 `sort-payments.ts` 머리말에 있다(2026-08-29,
// 사용자 지시로 「최근 활동순」에서 「예정일 기준」으로 바뀌었다: 아직 안 낸 건이 예정일 임박순으로
// 앞, 끝난 건이 뒤).
// 카테고리 필터는 이 정렬된 목록을 클라이언트에서 다시 거른다(재조회 안 함) — 목록이 이미
// 한 번에 다 와 있으므로(has_cost 카테고리 전체) 필터 전환마다 로딩 상태를 새로 만들 이유가 없다.
//
// `AddPaymentRow`(entities/payment/ui)의 `categoryOptions`에 비용을 다루는(has_cost) 카테고리만
// 넘긴다 — 비용 개념이 없는 카테고리에 결제를 만들 수 없게 호출부가 미리 거른다(2026-08-29
// 상견례가 유상이 된 뒤로 9개가 전부 has_cost=true 라 지금은 아무도 안 걸리지만, 판단을
// 하드코딩하지 않고 서버 값을 계속 따른다).
//
// `onPaymentsChanged`는 이 섹션 자체의 목록 재조회와는 별개다(2026-08-27, 사용자 지시로
// `onPaymentAdded`에서 개명 — 이제 추가뿐 아니라 수정·삭제도 같은 콜백을 태운다). 결제
// 금액·상태가 바뀌면 그 카테고리의 `paid_amount`도 바뀌므로, 예산 페이지의 도넛·배정 목록도
// 낡은 값을 보지 않으려면 `GET /wedding-categories`를 다시 불러야 한다 — 그 재조회는
// BudgetPage가 소유한다(이 컴포넌트는 카테고리 데이터를 모른다).
//
// **페이지네이션(2026-08-27, 사용자 지시)** — ChecklistTab.tsx의 계약 조항 5개-페이지 패턴을
// 그대로 재사용한다(이전/다음 · N/M · safePage 클램프 · aria-live announce). 필터를 바꾸면
// 1페이지로 리셋한다 — 같은 파일의 관례.
import { useEffect, useState } from "react";
import { AddPaymentRow, PaymentListRow, getPayments, type Payment } from "@/entities/payment";
import { ApiError } from "@/shared/api";
import { Card, Loading, Select, SkeletonRows } from "@/shared/ui";
import { sortPaymentsByDueDate } from "./sort-payments";

export interface CostManagementTabProps {
  categoryLabelByCode: ReadonlyMap<string, string>;
  categoryOptions: readonly { code: string; name_ko: string }[];
  onPaymentsChanged: () => void;
}

const PAGE_SIZE = 5;
const PAGE_BUTTON =
  "text-xs font-bold text-ink-soft transition-colors duration-150 enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";
const ALL_CATEGORIES = "";

export function CostManagementTab({ categoryLabelByCode, categoryOptions, onPaymentsChanged }: CostManagementTabProps) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [page, setPage] = useState(0);

  function refetchPayments() {
    getPayments()
      .then((res) => {
        setPayments(sortPaymentsByDueDate(res.payments));
        // 이전 실패로 뜬 에러가 있었다면 지운다 — CostTab.tsx의 같은 관례(레드팀 감사 교차 패턴 02).
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "납부 내역을 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    let cancelled = false;
    getPayments()
      .then((res) => {
        if (cancelled) return;
        setPayments(sortPaymentsByDueDate(res.payments));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "납부 내역을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleChanged() {
    refetchPayments();
    onPaymentsChanged();
  }

  function handleFilterChange(nextCategory: string) {
    setCategoryFilter(nextCategory);
    setPage(0);
  }

  const filteredPayments =
    payments === null
      ? []
      : categoryFilter === ALL_CATEGORIES
        ? payments
        : payments.filter((p) => p.category_code === categoryFilter);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  // 수정/삭제로 목록이 줄어들면 이전 페이지 번호가 더는 유효하지 않을 수 있다 — 렌더 시점에
  // 항상 유효 범위로 되돌린다(ChecklistTab.tsx와 같은 관례).
  const safePage = Math.min(page, totalPages - 1);
  const pagePayments = filteredPayments.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // [D22] `text-base`(16px) 였다 — 이 컨트롤은 `Card` 의 `titleAction` 슬롯에 들어가는데 그
  // `<h2>` 제목이 14px 라 **필터가 제목보다 컸다**(위계 역전). `compact` 로 14px 로 내린다.
  // 제목은 굵기(font-bold)로 여전히 우세하다. `<select>` 자신은 16px 그대로다(a11y.md §2.5).
  // 그 행이 이미 `flex-wrap` 이라(Card.tsx TITLE_ACTION_ROW) 좁아지면 다음 줄로 내려간다.
  const categoryFilterSelect = (
    <Select
      size="compact"
      // 카드 제목 행의 **오른쪽 끝**에 붙는다(TITLE_ACTION_ROW 의 justify-between) — 왼쪽
      // 정렬로 두면 카테고리명이 길 때 팝업이 화면 밖으로 나간다(Select.tsx 머리말 §방향).
      align="end"
      aria-label="카테고리 필터"
      value={categoryFilter}
      onValueChange={handleFilterChange}
      options={[
        { value: ALL_CATEGORIES, label: "전체 카테고리" },
        ...categoryOptions.map((option) => ({ value: option.code, label: option.name_ko })),
      ]}
    />
  );

  return (
    <Card title="비용 관리" titleAction={categoryFilterSelect}>
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {error}
        </p>
      )}
      {payments === null ? (
        // D14 L2 — 카드 안 목록이라 문구는 보조기기에만 낸다.
        <>
          <SkeletonRows count={4} />
          <Loading srOnly />
        </>
      ) : filteredPayments.length === 0 ? (
        <p className="text-sm text-ink-soft">
          {categoryFilter === ALL_CATEGORIES ? "등록된 납부 내역이 없습니다." : "이 카테고리엔 등록된 납부 내역이 없습니다."}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {pagePayments.map((p) => (
              <PaymentListRow
                key={p.id}
                payment={p}
                categoryLabel={categoryLabelByCode.get(p.category_code) ?? p.category_code}
                onChanged={handleChanged}
              />
            ))}
          </ul>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-4 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className={PAGE_BUTTON}
              >
                <span aria-hidden="true">‹</span> 이전
              </button>
              {/* 페이지 전환은 스크린리더에 announce해야 한다(WCAG 4.1.3) — ChecklistTab.tsx와
                  같은 이유로 role="alert"보다 약한 aria-live="polite". */}
              <span aria-live="polite" aria-atomic="true" className="text-xs text-ink-soft tabular-nums">
                {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className={PAGE_BUTTON}
              >
                다음 <span aria-hidden="true">›</span>
              </button>
            </div>
          )}
        </>
      )}
      <AddPaymentRow categoryOptions={categoryOptions} onAdded={handleChanged} />
    </Card>
  );
}
