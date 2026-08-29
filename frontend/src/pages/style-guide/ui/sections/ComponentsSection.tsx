// 프리미티브 카탈로그 — 상태별로 나열해 눈으로 확인한다.
import {
  Badge,
  Button,
  Card,
  IconCheck,
  IconChevronDown,
  IconInfo,
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
    <Section title="배지" hint="pill · 채움(기본)과 테두리 두 변이. 짧은 라벨 전용 — 절대 잘리지 않습니다.">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>강조</Badge>
          <Badge>항목 A</Badge>
          <Badge>항목 B</Badge>
        </div>
        {/* D17 — 두 축을 나란히 둔다. 위: 명목형(서로 다른 색상, 채움) / 아래: 순서형(한 색상의
            명도 3단계, 테두리). 클래스 문자열을 조립하지 않고 리터럴로 적는다(Tailwind 스캐너). */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-ink-soft">웨딩 카테고리 — 명목형 · 색상 9종 · 채움</span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="bg-category-venue-soft text-category-venue">예식장</Badge>
            <Badge tone="bg-category-sdm-soft text-category-sdm">스드메</Badge>
            <Badge tone="bg-category-gift-soft text-category-gift">예물·예단</Badge>
            <Badge tone="bg-category-homeware-soft text-category-homeware">혼수</Badge>
            <Badge tone="bg-category-invitation-soft text-category-invitation">청첩장</Badge>
            <Badge tone="bg-category-honeymoon-soft text-category-honeymoon">신혼여행</Badge>
            <Badge tone="bg-category-homenew-soft text-category-homenew">신혼집</Badge>
            <Badge tone="bg-category-meeting-soft text-category-meeting">상견례</Badge>
            <Badge tone="bg-category-etc-soft text-category-etc">기타</Badge>
          </div>
          <span className="text-xs text-ink-soft">결제 유형 — 순서형 · 명도 3단계 · 테두리</span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" tone="text-payment-deposit">
              계약금
            </Badge>
            <Badge variant="outline" tone="text-payment-interim">
              중도금
            </Badge>
            <Badge variant="outline" tone="text-payment-balance">
              잔금
            </Badge>
            <Badge variant="outline" tone="text-payment-etc">
              기타
            </Badge>
          </div>
          <span className="text-xs text-ink-soft">한 줄에 둘이 붙는 자리(비용 관리) — 형태가 계열을 가른다</span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" tone="text-payment-balance">
              잔금
            </Badge>
            <Badge tone="bg-category-venue-soft text-category-venue">예식장</Badge>
            <p className="min-w-0 truncate text-sm font-bold text-ink">본식 잔금 계약</p>
          </div>
        </div>
        {/* 눌림 회귀를 눈으로 확인하는 자리 — 아주 좁은 열 안에 긴 한국어 문장과 배지를 나란히
            놓는다. Badge 의 nowrap/shrink-0 이 빠지면 배지가 「주/의/할/사/례」로 세로로 접혀
            여기서 바로 드러난다(D16). 짝인 min-w-0 truncate 도 함께 보여준다. */}
        <div className="w-40 rounded-md border border-line p-2">
          <div className="flex items-center gap-2">
            <Badge>주의할 사례</Badge>
            <p className="min-w-0 truncate text-sm font-bold text-ink">아주 긴 한국어 제목이 옆에 놓인 경우</p>
          </div>
        </div>
      </Card>
      <Rule>
        배지는 <span className="font-bold">눌리지 않습니다</span>(<code className="font-bold">whitespace-nowrap</code>{" "}
        + <code className="font-bold">shrink-0</code>). 한국어는 글자마다 줄바꿈 기회가 있어 이것이 없으면 배지가 한
        글자 폭까지 눌려 캡슐 모양이 뭉개집니다. 대신 <span className="font-bold">압력은 옆 텍스트가 받습니다</span>{" "}
        — 배지와 나란히 놓는 본문에는 <code className="font-bold">min-w-0</code> 과 줄바꿈/말줄임을 함께 줍니다.
      </Rule>
      <Rule>
        <span className="font-bold">색은 값을, 형태는 계열을</span> 나타냅니다(D17). 한 줄에 배지가 둘 붙는
        곳(비용 관리)에서 채움/테두리가 갈리지 않으면 색상환에 13색이 섞여 어느 쪽이 무슨 축인지
        흐려집니다. 그리고 <span className="font-bold">색은 언제나 보조 단서</span>입니다 — 배지에는 한글
        라벨이 항상 함께 있어 색을 못 읽어도 정보가 남습니다(WCAG 1.4.1).
      </Rule>
      <OpenDecision>
        디자인 문서가 정의한 배지 변이는 <span className="font-bold">채움과 테두리 둘뿐</span>입니다. 세 번째가
        필요해지면 디자인 문서를 먼저 갱신해야 합니다 — 여기서 지어내지 않았습니다. 그리고{" "}
        <span className="font-bold">길이 상한이 없는 문자열은 배지에 담지 않습니다</span> — 출처 제목처럼 서버가
        길이를 정하는 것은 <code className="font-bold">SourceList</code> 로 갑니다.
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
        {/* [2026-08-29 D18] 머리의 ⚠️ 컬러 이모지를 걷어냈다 — 이 문단은 화면에 실제로 렌더된다.
            Rule 을 그대로 쓰지 않는 이유는 Rule 이 text-base·text-ink 카드형이라 바로 위 형제
            문단(text-sm·text-ink-soft)과 톤이 어긋나서다. 구성(아이콘 + 본문 2열)만 빌려온다. */}
        <p className="flex items-start gap-2 text-sm text-ink-soft">
          <span className="mt-0.5 shrink-0 text-primary">
            <IconInfo size={14} />
          </span>
          <span>
            불확정 막대를 <span className="font-bold">데이터 로딩에 쓰지 않습니다</span>. 진행률 역할은
            &ldquo;측정 가능한 진행&rdquo;을 약속하는데 조회 대기는 그렇지 않고, 동작 줄이기 환경에서는 움직임이
            멈춰 부분 막대가 &ldquo;40% 진행됨&rdquo;으로 오독됩니다. 조회 대기는 아래 로딩 섹션을 씁니다.
          </span>
        </p>      </Card>
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
