// 총예산 vs 지역 시세 요약 카드 — GET /dashboard/summary의 budget_benchmark(03_API_spec.md #25,
// dev-e4 요청). CategoryRow.tsx의 카테고리별 시세비교 문구·배지 패턴을 그대로 재사용한다 —
// 백엔드가 GET /benchmarks/compare와 필드명을 의도적으로 맞췄다(entities/dashboard/model.ts 머리말).
//
// null이면(해당 지역에 참가격 데이터가 아직 없음) 카드 자체를 그리지 않는다 — "데이터 없음"
// 문구를 보여주는 대신 아예 숨긴다(dev-e4 요청, CategoryRow.tsx의 hasBenchmark=false 분기와
// 다른 점: 여기는 "대상이 아님"이 아니라 "대상이지만 아직 없음"이라 숨김이 맞다).
import type { BudgetBenchmarkSummary } from "@/entities/dashboard";
import { safeExternalUrl } from "@/shared/lib/safe-url";
import { Badge, Card, Money } from "@/shared/ui";

interface BudgetBenchmarkCardProps {
  benchmark: BudgetBenchmarkSummary | null;
}

export function BudgetBenchmarkCard({ benchmark }: BudgetBenchmarkCardProps) {
  if (benchmark === null) return null;

  // source_url이 있어도 스킴 검증 없이 href에 그대로 꽂지 않는다(entities/chat/ui/MessageBubble.tsx,
  // pages/category/ui/ChecklistItemRow.tsx와 같은 원칙) — 값 자체는 백엔드에서 온 문자열이다.
  const safeUrl = safeExternalUrl(benchmark.source_url);

  return (
    <Card title="예산 시세 비교">
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
        총예산이 지역 시세 대비 {benchmark.percentile_label} · 중앙값 <Money value={benchmark.median_price} className="text-sm" />
        <Badge>{benchmark.ratio_to_median.toFixed(2)}배</Badge>
      </p>
      {safeUrl && (
        <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline">
          출처 보기
        </a>
      )}
    </Card>
  );
}
