// 파운데이션 — 색과 타이포그래피. 디자인 문서가 SSOT 이고 여기는 그 표시다.
import { Card } from "@/shared/ui";
import { OpenDecision, Rule, Section } from "../doc-parts";

// 클래스 문자열을 정적으로 둔다 — 런타임 조립은 Tailwind 가 찾지 못한다 (ADR 0003).
// 대비비는 WCAG 상대휘도로 계산한 값이다(추정치가 아니다).
const SWATCHES: readonly { name: string; hex: string; box: string; note: string }[] = [
  { name: "primary", hex: "#8B3F63", box: "bg-primary", note: "surface 대비 7.03 · bg 대비 6.51" },
  { name: "primary-soft", hex: "#F1DEE7", box: "bg-primary-soft", note: "배지 배경 — 위에 primary 5.47" },
  { name: "ink", hex: "#1D1B19", box: "bg-ink", note: "bg 대비 15.90 · surface 대비 17.17" },
  { name: "ink-soft", hex: "#726B65", box: "bg-ink-soft", note: "bg 대비 4.85 · surface 대비 5.24" },
  { name: "bg", hex: "#F7F6F4", box: "bg-bg", note: "페이지 배경" },
  { name: "surface", hex: "#FFFFFF", box: "bg-surface", note: "카드 표면" },
  { name: "line", hex: "#E7E3DE", box: "bg-line", note: "1px 헤어라인 보더 · 진행률 트랙" },
];

export function ColorSection() {
  return (
    <Section title="색" hint="거의 무채색인 중립 위에 베리 플럼 하나만 얹는다. 대비비는 계산값입니다.">
      <Rule>
        <strong className="font-bold">The One Accent Rule</strong> — 베리 플럼은 배지 · 주요 버튼 · 강조
        텍스트 · 진행률 채움에만 씁니다. 배경 워시나 큰 면적 채우기로 쓰지 않습니다. 희소성이 곧 그 색의
        힘입니다.
      </Rule>
      <Card>
        <ul className="grid gap-3 @sm:grid-cols-2">
          {SWATCHES.map((swatch) => (
            <li key={swatch.name} className="flex items-center gap-3">
              <span className={`size-10 shrink-0 rounded-sm border border-line ${swatch.box}`} />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-bold text-ink">
                  {swatch.name} <span className="font-normal text-ink-soft tabular-nums">{swatch.hex}</span>
                </span>
                <span className="text-xs text-ink-soft">{swatch.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Rule>
        Tailwind 기본 팔레트를 <code className="font-bold">--color-*: initial</code> 로 폐기했습니다. 위
        7색 밖의 <span className="font-bold">명명 유틸리티</span>(<code>bg-red-500</code> 류)는 없습니다.
        {/* 예시 토큰을 쪼개 쓴다 — 붙여 쓰면 Tailwind 스캐너가 이 문장에서 진짜 유틸리티를 만들고(실측: 게이트가 잡았다)
            산출 CSS 에 팔레트 밖 색이 들어간다. 설명하는 문장이 설명하는 사고를 일으키는 셈이다. */}
        단 임의값(<code>{["bg-[#", "77354F]"].join("")}</code>)은 테마와 무관하게 그대로 컴파일되므로 —
        <span className="font-bold">빌드 게이트가 산출 CSS 의 색을 <code>theme.css</code> 와 대조해
        막습니다.</span> 막았다고 적은 것이 아니라 실제로 막힙니다.
      </Rule>
      <OpenDecision>
        상태 색(성공 · 경고 · 위험)은 디자인 문서가 확정하지 않은 항목입니다. 지금 팔레트에 없으므로 경고 ·
        오류 표시도 중립 표면 + 보더로만 만들었습니다. 상태를 색으로 알려야 하는 화면이 생기면 그때
        정해야 합니다.
      </OpenDecision>
    </Section>
  );
}

export function TypographySection() {
  return (
    <Section
      title="타이포그래피"
      hint="Wanted Sans Variable. 무게만 바꿔 위계를 만듭니다. 크기는 역할로 정합니다."
    >
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-soft">헤드라인 · text-xl · 700 · 행간 1.4</span>
          <p className="text-xl font-bold text-ink">헤드라인은 이 크기를 씁니다</p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-soft">주 본문 · text-base(16px) · 400 · 행간 1.6 · ink</span>
          <p className="text-base text-ink">
            읽어야 하는 글은 이 크기를 씁니다. 설명문이나 안내처럼 문장이 이어지는 곳입니다.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-soft">
            보조 문구 · text-sm(14px) · 400 · 행간 1.6 · ink-soft
          </span>
          <p className="text-sm text-ink-soft">
            항목 설명이나 캡션처럼 짧게 덧붙이는 글입니다. 긴 문단에는 쓰지 않습니다.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-soft">캡션 · 라벨 · text-xs(12px)</span>
          <p className="text-xs text-ink-soft">표 머리글, 단위, 보조 라벨.</p>
        </div>
      </Card>
      <Rule>
        디자인 문서의 Body(<span className="tabular-nums">~0.86rem</span>)는 &quot;설명 텍스트, 보조
        문구&quot;로 정의된 값이라 위 <span className="font-bold">보조 문구</span> 자리에 해당합니다. 주 본문
        크기는 정의가 없어 <span className="font-bold">16px</span> 단계를 더했습니다 — KRDS 의 &quot;본문
        최소 16px&quot; 권고와 일치합니다.
      </Rule>
      <Rule>
        입력 필드는 <span className="font-bold">16px 미만으로 두지 않습니다.</span> iOS Safari 는 그보다
        작은 입력에 포커스가 가면 화면을 자동 확대합니다.
      </Rule>
      <Card className="flex flex-col gap-2">
        <h3 className="text-base font-bold text-ink">한국어 줄바꿈</h3>
        <p className="text-sm text-ink-soft">
          제목 · 버튼 · 라벨에는 <code className="font-bold">word-break: keep-all</code> 이 걸려 있어 어절
          중간에서 줄이 끊기지 않습니다. 아래 상자의 제목을 보세요.
        </p>
        <div className="max-w-[13rem] rounded-sm border border-line p-3">
          <h4 className="text-base font-bold text-ink">긴 제목도 어절 중간에서 끊기지 않습니다</h4>
        </div>
      </Card>
    </Section>
  );
}
