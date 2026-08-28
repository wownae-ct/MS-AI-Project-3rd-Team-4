// 시스템 규범 — 표면·반응형·포커스, 그리고 "쓰지 않기로 한 것".
import { Card } from "@/shared/ui";
import { OpenDecision, Rule, Section } from "../doc-parts";

function DemoList() {
  return (
    <ul className="grid gap-2 @sm:grid-cols-3">
      <li className="rounded-sm border border-line p-2 text-sm text-ink-soft">항목 1</li>
      <li className="rounded-sm border border-line p-2 text-sm text-ink-soft">항목 2</li>
      <li className="rounded-sm border border-line p-2 text-sm text-ink-soft">항목 3</li>
    </ul>
  );
}

export function SurfaceSection() {
  return (
    <Section
      title="표면과 반응형"
      hint="입체 효과를 쓰지 않습니다. 카드 내부는 컨테이너 쿼리로 배치를 정합니다."
    >
      <Rule>
        <strong className="font-bold">The Flat-By-Default Rule</strong> — 카드와 버튼은 항상 평평합니다.
        강조가 필요한 순간에도 보더 색이나 옅은 배경 변화로 표현합니다.
      </Rule>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <h3 className="text-base font-bold text-ink">컨테이너 쿼리</h3>
          <DemoList />
          <p className="text-sm text-ink-soft">
            뷰포트가 아니라 <span className="font-bold">카드 자기 폭</span>을 보고 1열↔3열이 바뀝니다. 창
            폭을 줄이면 왼쪽 카드가 먼저 좁아지며 세로로 쌓입니다.
          </p>
        </Card>
        <Card className="flex flex-col gap-2">
          <h3 className="text-base font-bold text-ink">같은 카드, 다른 자리</h3>
          <DemoList />
          <p className="text-sm text-ink-soft">
            배치 맥락을 몰라도 되므로 화면을 재구성해도 카드 내부를 다시 손대지 않습니다.
          </p>
        </Card>
      </div>
    </Section>
  );
}

// 라운드 4단계 — 클래스 문자열을 정적으로 둔다 (런타임 조립은 스캐너가 찾지 못한다).
const RADII: readonly { name: string; px: string; box: string; use: string }[] = [
  { name: "sm", px: "8px", box: "rounded-sm", use: "작은 컨트롤 · ghost 버튼" },
  { name: "md", px: "10px", box: "rounded-md", use: "버튼 · 입력" },
  { name: "lg", px: "16px", box: "rounded-lg", use: "카드" },
  { name: "pill", px: "999px", box: "rounded-pill", use: "배지 · 진행률 · 세그먼트" },
];

export function ShapeSection() {
  return (
    <Section title="형태" hint="라운드는 4단계뿐입니다. 기본 스케일은 폐기했습니다.">
      <Card>
        <ul className="grid gap-3 @sm:grid-cols-2 @lg:grid-cols-4">
          {RADII.map((radius) => (
            <li key={radius.name} className="flex items-center gap-3">
              <span className={`size-12 shrink-0 border border-ink-soft bg-surface ${radius.box}`} />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-bold text-ink">
                  {radius.name} <span className="font-normal text-ink-soft tabular-nums">{radius.px}</span>
                </span>
                <span className="text-xs text-ink-soft">{radius.use}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Rule>
        Tailwind 기본 라운드 8단계(2px~32px)는 <code className="font-bold">--radius-*: initial</code> 로{" "}
        <span className="font-bold">폐기</span>했습니다 — 덮어쓰기가 아니라 폐기라서 그 단계들은 유틸리티 자체가
        생성되지 않습니다. 폐기가 못 막는{" "}
        {/* 토큰을 쪼개 쓴다 — 붙여 쓰면 스캐너가 이 문장에서 유틸리티를 만들고 게이트가 ∞px 로 잡는다(실측: 잡혔다). */}
        <code className="font-bold">{["rounded-", "full"].join("")}</code>(무한 반지름)과 임의값은 빌드 게이트가
        산출 CSS 의 <code className="font-bold">border-radius</code> 값을 토큰과 대조해 막습니다. 원형이 필요하면{" "}
        <code className="font-bold">rounded-pill</code> 입니다.
      </Rule>
    </Section>
  );
}

export function FocusSection() {
  return (
    <Section title="포커스" hint="키보드만으로 이 화면을 끝까지 통과할 수 있어야 합니다.">
      <Rule>
        Tab 키로 이동해 보세요. 모든 인터랙티브 요소에 베리 플럼 2px 외곽선이 보여야 합니다. 화면 맨 위에서
        Tab 을 한 번 누르면 <span className="font-bold">본문으로 건너뛰기</span> 링크가 나타납니다.
      </Rule>
      <Rule>
        경계가 <span className="font-bold">유일한 식별 수단</span>인 컨트롤(빈 입력 필드, 라디오 외곽선)은{" "}
        <span className="font-bold">ink-soft</span>(5.24:1)를 보더로 씁니다. line(1.28:1)으로는 WCAG 1.4.11
        의 3:1 을 못 맞춥니다. 텍스트가 있는 카드 · 버튼의 헤어라인 보더는 같은 기준이 명시적으로
        면제합니다.
      </Rule>
      <OpenDecision>
        지원 브라우저 범위가 확정되지 않았습니다. 지금 빌드 타깃은 Chromium 111 이며 Safari 가 빠져 있는데,
        그 값은 이전 설정에서 상속된 것이라 검토된 적이 없습니다. iOS 를 포함하면 빌드 타깃에{" "}
        <code className="font-bold">safari16.4</code> 를 더해야 하고, 입력 16px 규칙이 선택이 아니라 필수가
        됩니다.
      </OpenDecision>
    </Section>
  );
}

export function NonGoalsSection() {
  return (
    <Section title="쓰지 않는 것" hint="지금 이 저장소에 없어야 정상인 것들입니다.">
      <Card>
        <ul className="flex flex-col gap-2 text-base text-ink">
          <li>
            <span className="font-bold">다크모드</span> — 스코프 밖입니다(라이트 전용).
          </li>
          <li>
            <span className="font-bold">그림자</span> — The Flat-By-Default Rule. 네 계열(box · drop · text ·
            inset) 전부 — 토큰 네임스페이스를 폐기해 유틸리티가 생성되지 않고, 임의값·수기 CSS 는 게이트가
            값으로 잡습니다.
          </li>
          <li>
            <span className="font-bold">링 유틸리티(<code>ring-*</code>)</span> — 그림자로 컴파일되고 어떤
            폐기로도 막히지 않습니다. 링은 <code className="font-bold">outline-*</code> 로 냅니다. 게이트가
            소스 토큰과 산출 커스텀 속성을 모두 잡습니다.
          </li>
          <li>
            <span className="font-bold">런타임 조립 클래스명</span> — Tailwind 가 찾지 못해 스타일이 조용히
            빠집니다. 변이는 정적 룩업 객체로만 씁니다. 반대로 <span className="font-bold">주석과 문서의
            단어도 유틸리티가 됩니다</span> — 스캐너는 주석을 구분하지 않습니다.
          </li>
          <li>
            <span className="font-bold">팔레트 밖 색</span> — 명명 유틸리티는 없고, 임의값 우회로는 빌드
            게이트가 막습니다.
          </li>
        </ul>
      </Card>
      <Rule>
        위 항목은 전부 <code className="font-bold">npm run build</code> 가 산출 CSS 와 소스에서 직접
        검사합니다. 들어오면 빌드가 실패하고 어느 파일 몇 번째 줄인지 알려 줍니다 — 문서로만 두지 않았고,
        주입 시험으로 실제로 잡히는 것을 확인했습니다.
      </Rule>
    </Section>
  );
}
