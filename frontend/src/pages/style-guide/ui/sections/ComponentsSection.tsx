// 프리미티브 카탈로그 — 상태별로 나열해 눈으로 확인한다.
import {
  Badge,
  Button,
  Card,
  IconCheck,
  IconChevronDown,
  Loading,
  Money,
  Progress,
  SkeletonRows,
  Tabs,
} from "@/shared/ui";
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
        <p className="text-sm text-ink-soft">
          ⚠️ 불확정 막대를 <span className="font-bold">데이터 로딩에 쓰지 않습니다</span>. 진행률 역할은
          &ldquo;측정 가능한 진행&rdquo;을 약속하는데 조회 대기는 그렇지 않고, 동작 줄이기 환경에서는 움직임이
          멈춰 부분 막대가 &ldquo;40% 진행됨&rdquo;으로 오독됩니다. 조회 대기는 아래 로딩 섹션을 씁니다.
        </p>
      </Card>
    </Section>
  );
}

export function LoadingSection() {
  return (
    <Section title="로딩" hint="시각은 하나로 통일하고, 대기 길이에 따라 문구만 올립니다.">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold text-ink">화면·카드가 데이터를 기다릴 때</p>
          <SkeletonRows count={3} />
          <Loading delayMs={0} />
          <p className="text-sm text-ink-soft">
            자리표시는 <span className="font-bold">즉시</span> 그립니다 — 임무가 &ldquo;기다림 알리기&rdquo;가
            아니라 콘텐츠가 들어올 상자를 미리 차지해 레이아웃이 밀리지 않게 하는 것이기 때문입니다. 반면 문구는
            200ms가 지나야 뜹니다. 빠른 응답에서 떴다 사라지면 진행 표시가 아니라 결함으로 읽힙니다.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold text-ink">사용자가 방금 누른 버튼</p>
          <div className="flex flex-wrap gap-2">
            <Button pending pendingLabel="저장 중…">
              저장
            </Button>
            <Button variant="secondary" pending pendingLabel="로그아웃 중…">
              로그아웃
            </Button>
          </div>
          <p className="text-sm text-ink-soft">
            이쪽은 <span className="font-bold">지연이 없습니다</span>. 즉각 반응이 곧 확인이고, 무엇보다 그
            사이 두 번 눌리는 것을 막아야 합니다. 비활성과 라벨 교체를 한 prop으로 묶어 둘 중 하나를 잊을 수
            없게 했습니다.
          </p>
        </div>

        <p className="text-sm text-ink-soft">
          문구 규칙 — 짧은 대기는 <span className="font-bold">&lsquo;저장 중…&rsquo;</span> 처럼 명사형으로,
          LLM이 걸린 긴 대기(온보딩 제출 · AI 상담)는 무엇을 왜 기다리는지 해요체 문장으로 설명합니다. 말줄임은
          점 세 개가 아니라 말줄임표 한 글자를 씁니다.
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
