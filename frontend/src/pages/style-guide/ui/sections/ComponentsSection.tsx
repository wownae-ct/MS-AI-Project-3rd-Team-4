// 프리미티브 카탈로그 — 상태별로 나열해 눈으로 확인한다.
import { Badge, Button, Card, IconCheck, IconChevronDown, Money, Progress, Tabs } from "@/shared/ui";
import { OpenDecision, Rule, Section } from "../doc-parts";

export function MoneySection() {
  return (
    <Section title="금액" hint="KRW 정수 · 콤마 구분 · 소수점 없음 · tabular-nums · 700.">
      <Card className="flex flex-col gap-2">
        <p className="text-2xl">
          <Money value={12_400_000} />
        </p>
        <p className="text-2xl">
          <Money value={9_800_000} />
        </p>
        <p className="text-sm text-ink-soft">
          자릿수가 맞춰져 위아래로 스캔됩니다. 단위를 헤더가 이미 말하는 표에서는{" "}
          <code className="font-bold">unit=&#123;null&#125;</code> 로 끕니다.
        </p>
      </Card>
    </Section>
  );
}

export function ButtonSection() {
  return (
    <Section
      title="버튼"
      hint="primary · secondary · ghost. 최소 터치 타겟 44px — WCAG AAA 2.5.5 · Apple HIG 44pt · KRDS 44px 의 수렴 (AA 최저선은 24px)."
    >
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button>주요 액션</Button>
          <Button variant="secondary">보조 액션</Button>
          <Button variant="ghost">
            <IconChevronDown size={16} />
            고스트
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>비활성</Button>
          <Button variant="secondary" disabled>
            비활성
          </Button>
          <Button variant="ghost" disabled>
            비활성
          </Button>
        </div>
        <Button block>
          <IconCheck size={16} />
          모바일 주요 액션 (block)
        </Button>
      </Card>
      <Rule>
        마우스를 올려 보세요 — primary 는 배경이 <span className="font-bold">짙어지고</span>(
        <code className="font-bold">primary-hover</code>, 밝기 필터가 아닙니다), secondary 는 보더가 진해지며,
        ghost 는 옅은 배경이 깔립니다. 입체 효과를 쓰지 않는 대신 보더와 배경으로만 표현합니다. 비활성 버튼은
        세 변이 모두 호버에 반응하지 않습니다. 터치 기기에서는 이 효과가 아예 적용되지 않습니다(
        <code className="font-bold">@media (hover:hover)</code>).
      </Rule>
    </Section>
  );
}

export function BadgeSection() {
  return (
    <Section title="배지" hint="pill · primary-soft · primary.">
      <Card className="flex flex-wrap items-center gap-3">
        <Badge>강조</Badge>
        <Badge>항목 A</Badge>
        <Badge>항목 B</Badge>
      </Card>
      <OpenDecision>
        디자인 문서가 정의한 배지 스타일은 <span className="font-bold">이 하나뿐</span>입니다. 다른 톤의 배지가
        필요해지면 디자인 문서를 먼저 갱신해야 합니다 — 여기서 지어내지 않았습니다.
      </OpenDecision>
    </Section>
  );
}

export function ProgressSection() {
  return (
    <Section title="진행률" hint="트랙은 line, 채움은 primary.">
      <Card className="flex flex-col gap-4">
        <Progress value={0.35} label="작업 진행률" />
        <Progress value={0.8} label="사용량" />
        <Progress label="불러오는 중" />
        <p className="text-sm text-ink-soft">
          값을 주지 않으면 불확정 상태가 됩니다. 값을 <span className="font-bold">단정하지 않는</span> 부분
          막대로 그립니다 — 0%도 100%도 아닙니다. 스크린리더에는{" "}
          <code className="font-bold">aria-valuenow</code> 를 생략해 같은 사실을 전합니다.
        </p>
      </Card>
    </Section>
  );
}

export function TabsSection() {
  return (
    <Section title="탭" hint="화살표 키로 포커스를 옮기고 Enter 로 선택합니다.">
      <Card>
        <Tabs.Root defaultValue="checklist">
          <Tabs.List label="예시 탭">
            <Tabs.Tab value="checklist">개요</Tabs.Tab>
            <Tabs.Tab value="cost">상세</Tabs.Tab>
            <Tabs.Tab value="chat">기록</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="checklist">
            <p className="text-base text-ink">첫 번째 패널 내용입니다.</p>
          </Tabs.Panel>
          <Tabs.Panel value="cost">
            <p className="text-base text-ink">두 번째 패널 내용입니다.</p>
          </Tabs.Panel>
          <Tabs.Panel value="chat">
            <p className="text-base text-ink">세 번째 패널 내용입니다.</p>
          </Tabs.Panel>
        </Tabs.Root>
      </Card>
      <Rule>
        화살표 키는 포커스만 옮기고 선택은 Enter/Space 로 합니다. 패널을 여는 비용이 큰 탭에서 훑고
        지나가는 것만으로 요청이 발생하지 않게 하려는 것입니다.
      </Rule>
    </Section>
  );
}
