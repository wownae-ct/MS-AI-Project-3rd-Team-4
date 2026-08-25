// 비용 탭 — HANDOFF.md §4 S3: FOCUS만 벤치마크 위젯(내 견적 vs 중앙값·최소~최대 범위·조사월+표본수),
// 납부 내역 리스트는 전 카테고리 공통(비용이 있는 카테고리에 한해).
//
// GET /benchmarks/compare 는 category_code·item_code·amount 셋 다 필수라(03_API_spec.md #23)
// "카테고리 전체 시세"가 아니라 "이 금액 하나를 시세와 비교"하는 API다 — 그래서 자동 로드가 아니라
// 사용자가 항목·금액을 골라 "비교" 를 누르는 폼으로 구현한다. item_code 카탈로그는 API 어디에도
// 목록 엔드포인트가 없어 backend/scripts/seed_price_benchmarks.py 의 시트→코드 매핑에서 가져왔다
// (VENUE/SDM 실측 확인, 그 외 has_benchmark 카테고리는 공통 TOTAL 만 폴백 제공 — 카탈로그 미확인).
import { useEffect, useState } from "react";
import { getBenchmarkCompare, getPayments, type BenchmarkComparison, type Payment } from "@/entities/payment";
import type { CategoryConstant } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { Badge, Card, Money } from "@/shared/ui";
import { AddPaymentRow } from "./AddPaymentRow";

interface CostTabProps {
  categoryCode: string;
  categoryMeta: CategoryConstant | undefined;
}

const ITEM_CODE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  VENUE: [
    { value: "TOTAL", label: "예식 전체" },
    { value: "RENTAL_FEE", label: "대관료" },
    { value: "MEAL_TOTAL", label: "식대(총액)" },
    { value: "MEAL_PER_PERSON", label: "식대(1인당)" },
  ],
  SDM: [
    { value: "TOTAL", label: "스드메 전체" },
    { value: "STUDIO", label: "스튜디오" },
    { value: "DRESS", label: "드레스" },
    { value: "MAKEUP", label: "메이크업" },
  ],
};
const FALLBACK_ITEM_CODE_OPTIONS = [{ value: "TOTAL", label: "전체" }];

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "계약금",
  INTERIM: "중도금",
  BALANCE: "잔금",
  ETC: "기타",
};

export function CostTab({ categoryCode, categoryMeta }: CostTabProps) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refetchPayments() {
    if (categoryMeta?.has_cost === false) {
      setPayments([]);
      setError(null);
      return;
    }
    getPayments({ categoryCode })
      .then((res) => {
        setPayments(res.payments);
        // 이전 조회가 실패해 배너가 떠 있었더라도, 이번 재조회가 성공하면 지운다 — 안 지우면
        // 정상 목록 위에 낡은 에러 배너가 계속 남는다(레드팀 감사 교차 패턴 02).
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "납부 내역을 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    // refetchPayments 는 재생성될 때마다 새 클로저지만 이 effect 는 마운트·카테고리 전환
    // 시점에만 한 번 부르면 되므로(추가 후 재조회는 handleAdded 가 직접 호출) deps 는 실제로
    // effect 를 다시 태워야 하는 값(categoryCode/has_cost)만 남긴다.
    let cancelled = false;
    if (categoryMeta?.has_cost === false) {
      setPayments([]);
      setError(null);
      return;
    }
    getPayments({ categoryCode })
      .then((res) => {
        if (cancelled) return;
        setPayments(res.payments);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "납부 내역을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [categoryCode, categoryMeta?.has_cost]);

  if (categoryMeta?.has_cost === false) {
    return (
      <Card>
        <p className="text-sm text-ink-soft">이 카테고리는 비용을 다루지 않습니다.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {categoryMeta?.has_benchmark && <BenchmarkWidget categoryCode={categoryCode} />}

      <Card title="납부 내역">
        {error && (
          <p role="alert" className="mb-3 rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
            {error}
          </p>
        )}
        {payments === null ? (
          <p className="text-sm text-ink-soft">불러오는 중…</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-ink-soft">등록된 납부 내역이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Badge>{PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type}</Badge>
                    <p className="truncate text-sm font-bold text-ink">{p.item_name}</p>
                  </div>
                  <p className="text-xs text-ink-soft">
                    {p.vendor_name} ·{" "}
                    {/* status는 PLANNED/PAID 2갈래만 아니라 CANCELED도 있다(backend/app/schemas/
                        common.py:53) — 이걸 놓치면 취소된 결제가 "예정일..."로 잘못 보인다
                        (레드팀 감사 라운드 2). 지금은 CANCELED로 바꾸는 UI가 없어 잠재적이지만,
                        서버가 이미 이 값을 낼 수 있는 이상 렌더 쪽은 3갈래를 그대로 반영한다. */}
                    {p.status === "PAID"
                      ? `지급완료 ${p.paid_date ?? ""}`
                      : p.status === "CANCELED"
                        ? "취소됨"
                        : `예정일 ${p.due_date ?? "미정"}`}
                  </p>
                </div>
                <Money value={p.amount} className="shrink-0" />
              </li>
            ))}
          </ul>
        )}
        {/* has_cost===false 분기는 위쪽 얼리리턴이 이미 처리한다 — 여기 도달했다는 것 자체가
            비용을 다루는 카테고리라는 뜻이라 다시 검사하지 않는다(TS도 그렇게 좁혀준다). */}
        <AddPaymentRow categoryCode={categoryCode} onAdded={refetchPayments} />
      </Card>
    </div>
  );
}

function BenchmarkWidget({ categoryCode }: { categoryCode: string }) {
  const options = ITEM_CODE_OPTIONS[categoryCode] ?? FALLBACK_ITEM_CODE_OPTIONS;
  const [itemCode, setItemCode] = useState(options[0].value);
  const [amountInput, setAmountInput] = useState("");
  const [result, setResult] = useState<BenchmarkComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCompare() {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("금액을 올바르게 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getBenchmarkCompare({ categoryCode, itemCode, amount });
      setResult(res);
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "시세 비교에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="시세 비교">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          항목
          <select
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          내 견적(원)
          <input
            type="number"
            min={0}
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="w-32 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleCompare()}
          disabled={loading}
          className="min-h-tap rounded-md border border-transparent bg-primary px-4 text-sm font-bold text-surface enabled:hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          비교
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-soft">
              중앙값 <Money value={result.median_price} /> · {result.percentile_label}
            </p>
            <Badge>{result.ratio_to_median.toFixed(2)}배</Badge>
          </div>
          {/* min_price/max_price는 표본 부족 지역·항목에서 null이 온다(entities/payment/model.ts
              머리말) — 이 경우 범위를 지어내지 않고 막대 자체를 생략한다. null - number 산술은
              JS에서 조용히 틀린 값을 내지 NaN이 아니라서(null이 0으로 강제형변환), 타입만 넓히고
              null 체크를 안 하면 이 조용한 오류가 그대로 남는다. */}
          {result.min_price !== null && result.max_price !== null ? (
            <>
              {/* 최소~최대 범위 안에서 중앙값·내 견적 위치를 보여준다 — HANDOFF.md "최소~최대 범위 바".
                  목업(s3-category-detail.html:293-296)은 마커 2개다: 중앙값(얇은 회색 틱) + 내 견적
                  (굵은 강조색 틱). 이전 구현은 내 견적만 그려 "평균보다 높은지 낮은지"를 비교할
                  기준선이 없었다. */}
              <div className="relative h-2 w-full rounded-pill bg-line">
                {(() => {
                  const minPrice = result.min_price;
                  const span = result.max_price - minPrice || 1;
                  const toPercent = (value: number) => Math.min(100, Math.max(0, ((value - minPrice) / span) * 100));
                  return (
                    <>
                      <div
                        className="absolute -top-0.5 h-3 w-0.5 bg-ink-soft"
                        style={{ left: `${toPercent(result.median_price).toString()}%` }}
                      />
                      <div
                        className="absolute -top-1 h-4 w-1 rounded-sm bg-primary"
                        style={{ left: `${toPercent(result.your_amount).toString()}%` }}
                      />
                    </>
                  );
                })()}
              </div>
              <p className="text-xs text-ink-soft">
                최소 <Money value={result.min_price} /> ~ 최대 <Money value={result.max_price} />
              </p>
            </>
          ) : (
            <p className="text-xs text-ink-soft">표본이 적어 최소~최대 범위는 제공하지 않아요.</p>
          )}
          <p className="text-xs text-ink-soft">
            {result.survey_month} 조사 · 표본 {result.sample_count}건
            {result.source_note && ` · ${result.source_note}`}
          </p>
        </div>
      )}
    </Card>
  );
}
