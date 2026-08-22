// 웨딩 도메인 **합성 예시 데이터**.
//
// 출처는 시각 스펙 `docs/mockups/s2-dashboard.html` 이고, 그 사본 자신이 화면 상단에
// *"데이터는 예시(합성)입니다"*(s2:140) 라고 적고 있다. **실제 사용자 데이터가 아니다.**
//
// 왜 파일 하나에 모으는가 — 전송 계층이 아직 없다(주제 전환으로 `shared/api` 삭제, CLAUDE.md §2).
// 백엔드가 붙으면 **이 파일이 사라지고 `types.ts` 만 남는다.** 그때 교체 지점이 한 곳이어야 한다.
// 컴포넌트 안에 숫자를 흩뿌리면 무엇이 예시고 무엇이 규범인지 구분할 수 없게 된다.
//
// 값 검산(목업과 일치) — 3,800,000 + 40,200,000 + 1,000,000 = 45,000,000.
// 카테고리 예산 합 44,000,000 + 미배정 1,000,000 = 45,000,000.
import type { BudgetSummary, CategoryBudget, UpcomingPayment, WeddingHeadline } from "./types";

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
    compactLabel: "예식장 중도금",
  },
  {
    id: "sdm-balance",
    dDay: 20,
    item: "아이린 스드메 촬영 잔금",
    category: "스드메",
    date: "2026-09-09",
    amount: 1_300_000,
    compactLabel: "스드메 촬영 잔금",
  },
  {
    id: "invitation-print",
    dDay: 27,
    item: "한아름 인쇄사 청첩장 인쇄비",
    category: "청첩장·답례품",
    // ⚠️ 아래 짧은 설명이 카테고리명(`청첩장·답례품`)과 다르다 — 목업이 그렇게 적었다(s5:136).
    //    합성 규칙을 만들 수 없어 `compactLabel` 을 통짜 문자열로 두는 근거가 이 행이다.
    date: "2026-09-16",
    amount: 320_000,
    compactLabel: "청첩장 인쇄비",
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
