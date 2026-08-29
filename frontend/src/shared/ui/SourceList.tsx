// 근거·출처 목록 — D16 (docs/design/decisions.md). `Badge` 의 짝이 되는 컴포넌트다.
//
// ## 왜 배지 나열이 아닌가
//
// 배지(rounded-pill · 12px/700 · 한 줄)는 **길이가 예측 가능한 짧은 어휘 전용 그릇**인데, 종전에는
// 여기에 **길이도 개수도 서버가 정하는 출처 제목**을 담고 `max-w-[220px] truncate` 로 우겨넣었다.
// 12px 한글은 글자당 약 12px 이라 220px 에서 좌우 패딩을 빼면 약 16자, 티어(「공식 · 」)가 4자를
// 먹어 제목은 12자만 남았다 — 즉 **제목은 항상 잘렸고** 전문은 hover title(터치 기기엔 없다)이나
// 클릭 펼침으로만 확인됐다. 그리고 RAG 인용은 답변당 최대 5개라(RAG_CONTEXT_TOP_K=5) 그 알약들이
// 검증 배지와 같은 줄에 가로로 늘어섰다(사용자 리포트 2026-08-29 두 건 — 원인은 이 하나였다).
//
// 이 컴포넌트는 그 둘을 동시에 없앤다: 제목이 **컨테이너 전폭**을 쓰므로 잘리지 않고, 목록이
// **세로**라 개수가 늘어도 가로로 퍼지지 않는다.
//
// ## 왜 DisclosurePanel 을 쓰지 않는가
//
// 그 컴포넌트는 머리말이 *"이 패널은 p-4 컨테이너 안에 놓인다"* 를 전제로 못박고, 포커스 테두리
// 잘림을 `-mx-4` ↔ `mx-4` 짝으로 푼다. `SourceList` 는 말풍선 열·리스트 항목 **안쪽**에 놓이므로
// 그 음수 여백이 컨테이너 밖으로 새어 나간다. 종전 인용 펼침도 조건부 렌더였으니 동작 변화도 없다.
//
// ## 세 호출부가 하나를 쓴다
//
// entities/chat(인용) · pages/category(체크리스트 근거 · 업체사례 관련 분쟁사례)가 각자 같은
// 마크업을 복사하고 서로를 「같은 패턴」이라 주석으로 가리키고 있었다. entities 끼리는 서로를
// import 할 수 없으므로(.oxlintrc.json) 공유 지점은 shared 뿐이다 — safe-url.ts · source-tier.ts
// 가 이미 같은 이유로 여기 있다.
import { useId, useState, type ReactNode } from "react";
import { safeExternalUrl } from "@/shared/lib/safe-url";
import { SOURCE_TIER_LABEL } from "@/shared/lib/source-tier";
import { Badge } from "./Badge";
import { IconChevronDown } from "./icons";

/** 원문 링크가 없는 자료의 기본 안내. 팀 자체 저작 콘텐츠(DS6_CHECK 등)는 URL 이 없는 게 정상이다 —
    링크 없이 조용히 비우면 "왜 안 눌려?" 로 보이므로 이유를 문구로 남긴다. */
const DEFAULT_NO_URL_NOTE = "팀에서 직접 정리한 자료라 원문 링크는 없어요.";

const SUMMARY_ROW = "flex flex-wrap items-center gap-1.5";
// 화살표만으로는 뜻이 전달되지 않으므로 요약 문구를 항상 함께 낸다(icons.tsx 의 원칙).
// duration-150 은 색 전환용 — 크기 전환(200)과 구분하는 이 저장소 관례다.
const TOGGLE =
  "inline-flex min-h-tap items-center gap-1 rounded-md px-1 text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";
// 조립하지 않고 완성된 리터럴 두 개 중 하나를 고른다 — Tailwind 스캐너는 소스를 평문으로 읽어
// 런타임 조립을 찾지 못하고, 빌드는 성공한 채 스타일만 사라진다(Card.tsx 와 같은 처리).
const CHEVRON = "shrink-0 transition-transform duration-150";
const CHEVRON_OPEN = "shrink-0 rotate-180 transition-transform duration-150";
const PANEL = "flex flex-col rounded-md border border-line bg-bg px-3";
const ROW = "flex items-start gap-2 border-b border-line py-2 last:border-0";
// 제목 전체가 링크다 — 종전 2단계(배지 → 상세 → 링크)를 1단계로 줄이고, 터치 타겟을 행 전폭으로
// 넓힌다. line-clamp-2 는 전폭(약 760px)으로도 넘치는 예외적인 제목만 받는 안전망이다.
const LINK = "flex min-h-tap items-center gap-1 text-xs text-ink underline hover:text-primary";
// 색과 여백을 나눠 둔다 — `Badge` 는 색을 `tone` 으로만 받는다. 색을 `className` 으로 넘기면
// 기준 색과 명시도가 같아 산출 CSS 순서에 지고 조용히 무시된다(Badge.tsx 머리말의 실측).
// 실제로 이 배지의 `text-ink-soft` 가 그 방식이라 D16 도입 이후 계속 primary 로 떠 있었다.
const TIER_BADGE_SPACING = "mt-0.5";
const TIER_BADGE_TONE = "bg-surface text-ink-soft";

export interface SourceListItem {
  /** 목록 안에서 유일한 React key. 채팅·업체사례는 chunk_id, 체크리스트는 항목 id. */
  key: string | number;
  /** 백엔드 ENUM 원문(OFFICIAL/CONSENSUS/INDUSTRY/…). 등급이 없는 자료는 null. */
  tier: string | null;
  title: string;
  /** 팀 자체 저작 콘텐츠는 null 이다(nullable 스키마). */
  url: string | null;
}

export interface SourceListProps {
  items: SourceListItem[];
  /** 요약 줄 왼쪽에 나란히 놓을 요소 — 채팅의 검증 배지처럼 목록과 함께 읽혀야 하는 것.
      items 가 비어도 이것만은 그대로 낸다(「근거 없음」도 확정된 사실이라 감추지 않는다). */
  leading?: ReactNode;
  /** 요약 문구에 쓸 명사. 기본 "근거", 업체사례는 "관련 분쟁사례". */
  noun?: string;
  /** url 이 null 인 항목에 붙일 안내. 자료의 출처에 따라 이유가 달라 호출부가 정한다. */
  noUrlNote?: string;
}

/** 모르는 티어 값은 지어내지 않고 원문 그대로 보여준다 — SOURCE_TIER_LABEL 의 기존 원칙. */
function tierLabelOf(tier: string | null): string | null {
  if (tier === null) return null;
  return SOURCE_TIER_LABEL[tier] ?? tier;
}

/**
 * 접힌 상태에서도 개수와 최고 등급을 말한다 — 종전 배지 나열은 3개를 모두 훑어야 공식 자료가
 * 섞여 있는지 알 수 있었으므로, 이 요약은 정보를 줄이는 게 아니라 **늘린다**(D16 파리티 표).
 */
function summaryLabel(items: SourceListItem[], noun: string): string {
  const first = items[0];
  if (items.length === 1 && first !== undefined) {
    const tierLabel = tierLabelOf(first.tier);
    return tierLabel === null ? `${noun} 1개` : `${tierLabel} ${noun} 1개`;
  }
  const officialLabel = SOURCE_TIER_LABEL.OFFICIAL;
  if (officialLabel !== undefined && items.some((item) => item.tier === "OFFICIAL")) {
    return `${officialLabel} ${noun} 포함 · ${items.length.toString()}개`;
  }
  return `${noun} ${items.length.toString()}개`;
}

export function SourceList({ items, leading, noun = "근거", noUrlNote = DEFAULT_NO_URL_NOTE }: SourceListProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // 근거가 하나도 없으면 목록 자체가 없다 — 빈 토글("근거 0개")을 내지 않는다. leading 은 그대로
  // 낸다: 채팅의 「일반 정보 · 근거 없음」 배지가 정확히 이 경우다.
  if (items.length === 0) {
    return leading === undefined ? null : <div className={SUMMARY_ROW}>{leading}</div>;
  }

  const summary = summaryLabel(items, noun);

  return (
    <div className="flex flex-col gap-1.5">
      <div className={SUMMARY_ROW}>
        {leading}
        <button
          type="button"
          aria-expanded={open}
          // 접혔을 때는 패널이 DOM 에 없다 — 존재하지 않는 id 를 가리키면 그 자체가 접근성 위반이라
          // 열렸을 때만 건다. aria-expanded 만으로도 디스클로저로 읽힌다.
          aria-controls={open ? panelId : undefined}
          onClick={() => {
            setOpen((prev) => !prev);
          }}
          className={TOGGLE}
        >
          {summary}
          <IconChevronDown size={14} className={open ? CHEVRON_OPEN : CHEVRON} />
        </button>
      </div>
      {open && (
        <ul id={panelId} className={PANEL}>
          {items.map((item) => (
            <SourceRow key={item.key} item={item} noUrlNote={noUrlNote} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceRow({ item, noUrlNote }: { item: SourceListItem; noUrlNote: string }) {
  const tierLabel = tierLabelOf(item.tier);
  // 값 자체는 백엔드에서 온 문자열이라 스킴을 검증하고 꽂는다(safe-url.ts 머리말).
  const safeUrl = item.url === null ? undefined : safeExternalUrl(item.url);

  return (
    <li className={ROW}>
      {/* 티어는 짧고 고정된 어휘라 여기서는 배지가 맞는 그릇이다 — 잘릴 일이 없다(D16). */}
      {tierLabel !== null && (
        <Badge className={TIER_BADGE_SPACING} tone={TIER_BADGE_TONE}>
          {tierLabel}
        </Badge>
      )}
      <div className="min-w-0 flex-1">
        {safeUrl === undefined ? (
          <>
            <p className="text-xs text-ink">{item.title}</p>
            <p className="text-xs text-ink-soft">{noUrlNote}</p>
          </>
        ) : (
          <a href={safeUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
            <span className="line-clamp-2">{item.title}</span>
            {/* 새 창으로 열린다는 시각 신호. 접근명은 제목이 이미 말하므로 장식으로 둔다. */}
            <span aria-hidden="true" className="shrink-0">
              ↗
            </span>
          </a>
        )}
      </div>
    </li>
  );
}
