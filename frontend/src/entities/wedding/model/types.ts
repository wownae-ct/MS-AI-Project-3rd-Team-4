// 웨딩 도메인 타입 — 화면이 아니라 **도메인**이 소유한다.
//
// 왜 entities 인가 — 목업 6개 중 **5개가 같은 값을 본다**: S2 대시보드(예산·납부·카테고리) ·
// S3 카테고리 상세(체크리스트 항목 + 근거 출처) · S4 타임라인(같은 항목명 4건 그대로) ·
// S5 리포트(같은 값의 다른 뷰) · S6 예산 재배분(12,000,000 · 8,000,000 · 10,000,000 · 6,500,000 ·
// 미배정 1,000,000 을 그대로 쓴다). `.oxlintrc.json` 이 `pages → pages` import 를 막으므로
// 화면 슬라이스에 두면 두 번째 화면부터 값을 복제하게 된다.
//
// **슬라이스를 하나로 두는 것은 취향이 아니라 규칙이다** — `.oxlintrc.json` 의 entities override 가
// *"entities는 상위 레이어와 다른 entity 슬라이스를 import할 수 없다"* 를 강제한다. `checklist` 를
// 따로 떼면 `category` 를 참조할 수 없어 `categoryId` 가 성립하지 않는다.
//
// 이 파일은 **타입만** 담는다. 백엔드가 붙으면 합성 데이터 파일들은 사라지고 여기는 남는다.

export interface BudgetSummary {
  /** 총예산 */
  total: number;
  /** 집행(지급 완료) */
  paid: number;
  /** 계획(미지급) */
  planned: number;
  /** 미배정 — 아직 어느 카테고리에도 배정되지 않은 금액. **「남은 돈」이 아니다.** */
  remaining: number;
}

export interface UpcomingPayment {
  id: string;
  /** 남은 일수. 표시는 `D-{dDay}`. */
  dDay: number;
  item: string;
  /** 카테고리명 · 납부일 을 한 줄로 보조 표시한다. */
  category: string;
  date: string;
  amount: number;
  /**
   * 좁은 카드용 짧은 설명 — S5 리포트의 압축 행이 쓴다(`docs/mockups/s5-report.html:134-136`).
   *
   * **`category` 와 `item` 에서 합성할 수 없다.** 두 가지가 동시에 막는다.
   *   1. 목업 3행이 카테고리명을 그대로 쓰지 않는다 — `청첩장·답례품` 카테고리의 행이 `청첩장 인쇄비` 다.
   *   2. `item` 에는 업체명이 붙어 있어 문자열 조작으로 안전하게 벗겨낼 수 없고, 길이도 안 맞는다
   *      (실측 @`text-sm`: `D-12 · 예식장 중도금` 116.09px vs `D-12 · 그레이스웨딩홀 중도금` 164.49px —
   *      후자는 금액과 합쳐 최소 카드 내부폭 226.67px 를 23px 초과한다).
   */
  compactLabel: string;
}

export interface CategoryBudget {
  id: string;
  name: string;
  /** 목업의 `FOCUS` 배지(s2:230,242). */
  focus: boolean;
  /**
   * 배정 예산. **`null` 은 「비용이 없는 카테고리」**다(목업의 `.no-cost`, s2:219).
   * 0 과 구분해야 한다 — 0 이면 "예산이 있는데 아직 안 썼다", null 이면 "돈이 드는 항목이 아니다".
   */
  budget: number | null;
  spent: number;
  checklistDone: number;
  checklistTotal: number;
}

export interface WeddingHeadline {
  /** 예식일까지 남은 일수. 표시는 `D-{dDay}`. */
  dDay: number;
  /** 이미 사람이 읽는 형식으로 온다 — 여기서 날짜 포맷을 정하지 않는다(규범에 없다). */
  dateLabel: string;
}

/**
 * 체크리스트 항목의 **근거 출처 티어**. 목업이 쓰는 3종이 전부다 —
 * `s3-category-detail.html:217,227,237` · `s5-report.html:107,122`.
 *
 * 뜻은 목업이 한 곳에서만 풀어 준다: `s3:352` 의 `OFFICIAL · 공정위 예식장 표준약관`.
 * 나머지 두 티어의 정의는 아직 어느 문서에도 없으므로 **여기서 지어내지 않는다.**
 */
export type SourceTier = "OFFICIAL" | "CONSENSUS" | "INDUSTRY";

/** 리포트의 「다음에 확인하면 좋아요」 한 줄 (`s5-report.html:104-128`). */
export interface RecommendedCheck {
  id: string;
  /**
   * `CategoryBudget["id"]` 를 참조한다. **카테고리명을 복제하지 않는다** —
   * 이름이 바뀌면 두 곳이 조용히 갈린다. 해석은 화면이 하고, 해석 실패는 테스트가 잡는다.
   */
  categoryId: string;
  title: string;
  source: SourceTier;
}
