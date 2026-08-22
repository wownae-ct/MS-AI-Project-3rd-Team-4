// 예산 재배분 — 시각 스펙: docs/mockups/s6-budget-scenario.html
//
// **아직 구현되지 않았다.** 라우트와 앱 셸이 먼저 들어왔고(ADR 0005), 화면 내용은 스펙을 보고 채운다.
// 여기서 디자인을 지어내지 않는다 — 값의 출처는 docs/design/ 이다(ADR 0006).
//
// 콘텐츠 열 폭은 layout.md §2 라우트 표가 정한다(온보딩 430px · 타임라인 640px · 예산 720px 등).
// Page 가 아직 폭 prop 을 받지 않으므로 AppShell 도입 커밋에서 함께 배선한다.
//
// 이 컴포넌트는 **라우터를 모른다.** 파라미터가 필요하면 라우트가 props 로 내려 준다
// (app → pages 하향 import 만 허용 — docs/architecture/layers.md).
import { Card, Page } from "@/shared/ui";

export function BudgetPage() {
  return (
    <Page title="예산 재배분" subtitle="카테고리 사이로 예산을 옮겨 봅니다.">
      <Card className="flex flex-col gap-2">
        <p className="text-base text-ink">이 화면은 아직 구현되지 않았습니다.</p>
        <p className="text-sm text-ink-soft">
          시각 스펙 <code className="font-bold">docs/mockups/s6-budget-scenario.html</code> · 레이아웃 계약{" "}
          <code className="font-bold">docs/design/layout.md</code>
        </p>
      </Card>
    </Page>
  );
}
