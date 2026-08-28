// 「다음에 확인하면 좋아요」 한 줄 (시각 스펙: docs/mockups/s5-report.html:104-128).
//
// ## 목업과 다른 점 두 가지 — 둘 다 근거가 있다
//
// **① 면색이 없다.** 목업은 자주색 카드 위에 `rgba(255,255,255,.12)` 행이었다. D2 가 카드 전면
// 채움을 기각하면서(2026-08-22 종결) 행도 표면 위로 올라왔고, 「표면 구분은 1px 헤어라인 보더로만」
// (design/README.md 「The Flat-By-Default Rule」)에 맞춰 면 대신 보더로 나눈다.
//
// **② 2줄이다.** 목업은 [칩][제목][출처] 1줄이지만 390pt 폰 1열 전용 사본이다. 이 화면의 라우트
// 계약은 `repeat(auto-fit, minmax(260px, 1fr))`(layout.md §2) 이라 260~280px 열이 생기는데,
// 그 폭에서는 칩 + 우선순위 문구 + 간격 + 패딩이 먼저 먹어 제목에 남는 폭이 좁다. 그래서 행동
// 대상인 제목을 1줄에 단독으로 두고 분류·우선순위를 2줄로 내린다.
//
// **③ prop 계약을 실API 응답에 맞춘다.** `GET /reports/me`의 `next_recommended_checks`는
// `{checklist_item_id, category_code, title, priority}`뿐이고 옛 `RecommendedCheck`의
// `source: SourceTier`(OFFICIAL/CONSENSUS/INDUSTRY)가 없다 — `priority`를 그 자리에 억지로
// 넣으면 근거 출처를 지어내는 셈이라, API가 실제로 주는 필드로 prop을 다시 정의했다.
// `priority`는 백엔드가 `str`로만 열어 둔 필드다(backend/app/schemas/checklist.py:25,
// 04_DB_spec.md:205의 관용값은 high/mid/low이지만 DB CHECK 제약은 없다) — Literal로 좁히지
// 않고 알려진 값만 라벨을 붙이고 모르는 값은 원문을 그대로 보여준다(지어내지 않는다).
import { Badge } from "@/shared/ui";

const PRIORITY_LABEL: Record<string, string> = {
  high: "우선순위 높음",
  mid: "우선순위 보통",
  low: "우선순위 낮음",
};

export interface RecoRowProps {
  title: string;
  priority: string;
  /** `category_code` 를 화면에서 해석한 이름. 데이터는 이름을 복제하지 않는다. */
  categoryName: string;
}

export function RecoRow({ title, priority, categoryName }: RecoRowProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line px-3 py-2.5">
      <p className="text-sm font-bold text-ink">{title}</p>
      <div className="flex items-center justify-between gap-2">
        <Badge>{categoryName}</Badge>
        {/* D6 — 상태색을 쓰지 않는다. 우선순위를 색으로 구분하지 않고 텍스트 그대로 읽힌다. */}
        <span className="text-xs text-ink-soft">{PRIORITY_LABEL[priority] ?? priority}</span>
      </div>
    </div>
  );
}
