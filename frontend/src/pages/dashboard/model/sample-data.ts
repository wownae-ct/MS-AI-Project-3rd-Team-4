// 대시보드 표시용 **합성 예시 데이터**.
//
// 출처는 시각 스펙 `docs/mockups/s2-dashboard.html` 이고, 그 사본 자신이 화면 상단에
// *"데이터는 예시(합성)입니다"*(s2:140) 라고 적고 있다. **실제 사용자 데이터가 아니다.**
//
// 왜 파일 하나에 모으는가 — 전송 계층이 아직 없다(주제 전환으로 `shared/api` 삭제, CLAUDE.md §2).
// 백엔드가 붙으면 이 파일은 사라지고 타입은 `entities/` 로 올라간다. 그때 **교체 지점이 한 곳**이어야
// 한다. 컴포넌트 안에 숫자를 흩뿌리면 무엇이 예시고 무엇이 규범인지 구분할 수 없게 된다.
//
// 값 검산(목업과 일치) — 3,800,000 + 40,200,000 + 1,000,000 = 45,000,000.
// 카테고리 예산 합 44,000,000 + 미배정 1,000,000 = 45,000,000.

export interface BudgetSummary {
  /** 총예산 */
  total: number;
  /** 집행(지급 완료) */
  paid: number;
  /** 계획(미지급) */
  planned: number;
  /** 잔여(미배정) */
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

export const WEDDING: WeddingHeadline = {
  dDay: 198,
  dateLabel: "2027년 3월 6일",
};

export const BUDGET: BudgetSummary = {
  total: 45_000_000,
  paid: 3_800_000,
  planned: 40_200_000,
  remaining: 1_000_000,
};

export const UPCOMING_PAYMENTS: readonly UpcomingPayment[] = [
  {
    id: "hall-interim",
    dDay: 12,
    item: "그레이스웨딩홀 중도금",
    category: "예식장",
    date: "2026-09-01",
    amount: 4_200_000,
  },
  {
    id: "sdm-balance",
    dDay: 20,
    item: "아이린 스드메 촬영 잔금",
    category: "스드메",
    date: "2026-09-09",
    amount: 1_300_000,
  },
  {
    id: "invitation-print",
    dDay: 27,
    item: "한아름 인쇄사 청첩장 인쇄비",
    category: "청첩장·답례품",
    date: "2026-09-16",
    amount: 320_000,
  },
];

export const CATEGORY_BUDGETS: readonly CategoryBudget[] = [
  { id: "meeting", name: "상견례", focus: false, budget: null, spent: 0, checklistDone: 3, checklistTotal: 5 },
  {
    id: "wedding-hall",
    name: "예식장",
    focus: true,
    budget: 12_000_000,
    spent: 3_000_000,
    checklistDone: 10,
    checklistTotal: 25,
  },
  { id: "sdm", name: "스드메", focus: true, budget: 8_000_000, spent: 800_000, checklistDone: 9, checklistTotal: 35 },
  { id: "gifts", name: "예물·예단", focus: false, budget: 6_000_000, spent: 0, checklistDone: 1, checklistTotal: 5 },
  { id: "furnishing", name: "혼수", focus: false, budget: 10_000_000, spent: 0, checklistDone: 0, checklistTotal: 5 },
  {
    id: "invitation",
    name: "청첩장·답례품",
    focus: false,
    budget: 1_500_000,
    spent: 0,
    checklistDone: 0,
    checklistTotal: 5,
  },
  {
    id: "honeymoon",
    name: "신혼여행",
    focus: false,
    budget: 6_500_000,
    spent: 0,
    checklistDone: 1,
    checklistTotal: 5,
  },
];
