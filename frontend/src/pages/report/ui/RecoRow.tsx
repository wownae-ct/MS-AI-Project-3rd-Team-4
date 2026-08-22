// 「다음에 확인하면 좋아요」 한 줄 (시각 스펙: docs/mockups/s5-report.html:104-128).
//
// ## 목업과 다른 점 두 가지 — 둘 다 근거가 있다
//
// **① 면색이 없다.** 목업은 자주색 카드 위에 `rgba(255,255,255,.12)` 행이었다. D2 가 카드 전면
// 채움을 기각하면서(2026-08-22 종결) 행도 표면 위로 올라왔고, 「표면 구분은 1px 헤어라인 보더로만」
// (design/README.md 「The Flat-By-Default Rule」)에 맞춰 면 대신 보더로 나눈다. 부수 효과로
// 카테고리 칩이 현행 Badge 그대로 읽힌다 — `primary-soft` 행 위였다면 같은 면색이라 묻혔을 것이다.
//
// **② 2줄이다.** 목업은 [칩][제목][출처] 1줄이지만 390pt 폰 1열 전용 사본이다. 이 화면의 라우트
// 계약은 `repeat(auto-fit, minmax(260px, 1fr))`(layout.md §2) 이라 260~280px 열이 생기는데,
// 그 폭에서는 칩(약 81px) + 출처(약 60px) + 간격 + 패딩이 먼저 먹어 **제목에 34~41px 밖에 남지
// 않는다**(추정). 제목이 통째로 말줄임되면 「무엇을 확인하라는 것인가」가 사라져 카드의 존재 이유가
// 없어진다. 그래서 행동 대상인 제목을 1줄에 단독으로 두고 분류·출처를 2줄로 내린다.
import type { RecommendedCheck } from "@/entities/wedding";
import { Badge } from "@/shared/ui";

export interface RecoRowProps {
  check: RecommendedCheck;
  /** `check.categoryId` 를 화면에서 해석한 이름. 데이터는 이름을 복제하지 않는다. */
  categoryName: string;
}

export function RecoRow({ check, categoryName }: RecoRowProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line px-3 py-2.5">
      <p className="text-sm font-bold text-ink">{check.title}</p>
      <div className="flex items-center justify-between gap-2">
        <Badge>{categoryName}</Badge>
        {/* 근거 출처 티어. 목업은 이 자리를 흰 글자 opacity:.75 로 흐렸다 — 표면 위로 올라온 지금은
            `ink-soft` 가 같은 위계를 낸다(요소 불투명도를 색 대신 쓰지 않는다). */}
        <span className="text-xs text-ink-soft">{check.source}</span>
      </div>
    </div>
  );
}
