// 「다음에 확인하면 좋아요」 5건 — 시각 스펙 `docs/mockups/s5-report.html:104-128`.
//
// ## 왜 sample-data.ts 와 **다른 파일**인가 — 조직이 아니라 번들 결정이다
//
// `sample-data.ts` 는 대시보드가 **정적 import** 한다(첫 화면이라 초기 청크에 남는다 — ADR 0005 §결정 3).
// 이 데이터를 거기 합치면 S5 전용 값이 통째로 초기 청크에 실린다. `check-bundle-budget.mjs` 는
// 초기 청크 지표를 *"`shared/ui` 가 커질 때만 움직여야 한다 — 움직이면 그게 신호다"* 로 두고 있어서,
// 화면 전용 데이터가 그 지표를 밀면 **경보가 의미를 잃는다.**
// 파일을 나누면 Rollup 이 lazy 진입점에서만 닿는 모듈로 보고 report 청크에 넣는다
// (같은 원리로 Base UI Tabs 등이 style-guide 청크 안에 있다).
//
// ## 목업에 없는 것을 만들지 않았다
//
// 카드 부제는 *"기한이 가까운 순으로 5개만 골랐어요"* 인데 **날짜 필드를 두지 않았다.**
// S4 타임라인이 4건의 기한을 주지만(`s4:92` 2026-03-06 · `s4:112` 2026-06-06 ·
// `s4:125`·`s4:132` 2026-09-06) 3번째 `최소 보증 인원 조항 확인` 은 **어느 목업에도 날짜가 없다.**
// 하나만 지어내면 정렬 결과가 그 추측에 좌우된다 — 그래서 **배열 순서 자체를 계약으로 둔다.**
// ⚠️ 이 순서는 기한 오름차순이다. 화면에서 다시 정렬하지 않는다.
//
// 선정 자체(무엇을 5개로 고르는가)는 백엔드 RAG 의 몫이다. 여기서는 목업이 고른 결과를 그대로 옮긴다.
import type { RecommendedCheck } from "./types";

export const RECOMMENDED_CHECKS: readonly RecommendedCheck[] = [
  { id: "sdm-vendors", categoryId: "sdm", title: "스드메 업체 리스트업", source: "CONSENSUS" },
  { id: "furnishing-list", categoryId: "furnishing", title: "혼수 품목 리스트 작성", source: "CONSENSUS" },
  { id: "hall-min-guests", categoryId: "wedding-hall", title: "최소 보증 인원 조항 확인", source: "CONSENSUS" },
  { id: "hall-seating", categoryId: "wedding-hall", title: "좌석 배치 초안 제출", source: "INDUSTRY" },
  { id: "invitation-design", categoryId: "invitation", title: "청첩장 디자인 시안 확정", source: "INDUSTRY" },
];
