import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  clampISO,
  diffDays,
  formatKorean,
  isValidISO,
  isWithinRange,
  monthGrid,
  parseISO,
  pastQuickPicks,
  futureQuickPicks,
  weddingQuickPicks,
  startOfMonth,
  todayISO,
  weekdayIndex,
  MONTH_GRID_LENGTH,
} from "./date";

describe("todayISO — 로컬 달력 기준", () => {
  // 🚨 이 테스트가 고정하는 것이 이 모듈의 존재 이유 중 하나다. 종전 구현
  // (`new Date().toISOString().slice(0,10)`)은 UTC 라, KST 새벽에 어제 날짜를 돌려줬다.
  it("KST 새벽(UTC 로는 전날)에도 그날 날짜를 돌려준다", () => {
    const kstEarlyMorning = new Date(2026, 7, 29, 1, 30); // 2026-08-29 01:30 로컬
    expect(todayISO(kstEarlyMorning)).toBe("2026-08-29");
  });

  it("한 자리 월·일을 0으로 채운다", () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("parseISO — 실존하는 날짜만 통과", () => {
  it("정상 값을 연·월·일로 나눈다", () => {
    expect(parseISO("2027-05-15")).toEqual({ year: 2027, month: 5, day: 15 });
  });

  it("달력에 없는 날은 거부한다 — Date 의 자동 넘김에 속지 않는다", () => {
    expect(parseISO("2026-02-30")).toBeNull();
    expect(parseISO("2026-13-01")).toBeNull();
    expect(parseISO("2026-04-31")).toBeNull();
  });

  it("윤년 2월 29일은 통과하고, 평년은 거부한다", () => {
    expect(parseISO("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseISO("2027-02-29")).toBeNull();
  });

  it("서식이 어긋난 값과 부분 입력을 거부한다", () => {
    expect(parseISO("2026-8-29")).toBeNull();
    expect(parseISO("20260829")).toBeNull();
    expect(parseISO("2026-08")).toBeNull();
    expect(parseISO("")).toBeNull();
    expect(isValidISO("20266-08-29")).toBe(false);
  });
});

describe("formatKorean — 요일까지 함께 낸다", () => {
  it("요일을 괄호로 붙인다", () => {
    expect(formatKorean("2027-05-15")).toBe("2027년 5월 15일 (토)");
    expect(formatKorean("2026-08-29")).toBe("2026년 8월 29일 (토)");
    expect(formatKorean("2026-09-01")).toBe("2026년 9월 1일 (화)");
  });

  it("월·일의 선행 0은 표시하지 않는다", () => {
    expect(formatKorean("2026-01-05")).toBe("2026년 1월 5일 (월)");
  });

  it("유효하지 않은 값은 빈 문자열이다 — 화면에 'Invalid Date' 를 내지 않는다", () => {
    expect(formatKorean("2026-02-30")).toBe("");
    expect(formatKorean("")).toBe("");
  });
});

describe("weekdayIndex", () => {
  it("일요일이 0이다", () => {
    expect(weekdayIndex("2026-08-30")).toBe(0);
    expect(weekdayIndex("2026-08-29")).toBe(6);
  });

  it("유효하지 않은 값은 null", () => {
    expect(weekdayIndex("2026-02-30")).toBeNull();
  });
});

describe("diffDays", () => {
  it("미래는 양수, 과거는 음수다", () => {
    expect(diffDays("2026-08-29", "2026-09-01")).toBe(3);
    expect(diffDays("2026-09-01", "2026-08-29")).toBe(-3);
    expect(diffDays("2026-08-29", "2026-08-29")).toBe(0);
  });

  it("해를 넘겨도 정확하다", () => {
    expect(diffDays("2026-12-31", "2027-01-01")).toBe(1);
    // 2028 은 윤년이라 366일이다.
    expect(diffDays("2028-01-01", "2029-01-01")).toBe(366);
  });

  it("유효하지 않은 값이 섞이면 null", () => {
    expect(diffDays("2026-02-30", "2026-09-01")).toBeNull();
  });
});

describe("addDays", () => {
  it("월·해 경계를 넘는다", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("윤년 2월을 정확히 지난다", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });
});

describe("addMonths — 말일은 옮긴 달의 말일로 접는다", () => {
  it("1월 31일 + 1개월은 2월 말일이다(3월로 새지 않는다)", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("해를 넘고, 음수도 대칭으로 동작한다", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-02-15", -3)).toBe("2025-11-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("startOfMonth", () => {
  it("그 달 1일로 접는다", () => {
    expect(startOfMonth("2026-08-29")).toBe("2026-08-01");
  });
});

describe("monthGrid — 6주 고정", () => {
  it("항상 42칸이다(달마다 패널 높이가 출렁이지 않는다)", () => {
    for (const month of ["2026-02-01", "2026-08-01", "2028-02-01"]) {
      expect(monthGrid(month)).toHaveLength(MONTH_GRID_LENGTH);
    }
  });

  it("첫 칸은 그 달 1일 직전의 일요일이다", () => {
    // 2026-08-01 은 토요일 → 그리드는 7월 26일(일)부터 시작한다.
    const grid = monthGrid("2026-08-01");
    expect(grid[0]).toBe("2026-07-26");
    expect(grid[6]).toBe("2026-08-01");
  });

  it("앞뒤 달로 이어지며 하루도 건너뛰지 않는다", () => {
    const grid = monthGrid("2026-08-01");
    for (let index = 1; index < grid.length; index += 1) {
      expect(diffDays(grid[index - 1], grid[index])).toBe(1);
    }
  });

  it("1일이 일요일인 달도 그 1일부터 시작한다", () => {
    // 2026-11-01 은 일요일이다.
    expect(monthGrid("2026-11-01")[0]).toBe("2026-11-01");
  });
});

describe("isWithinRange · clampISO", () => {
  it("경계값은 범위 안이다", () => {
    expect(isWithinRange("2026-08-29", "2026-08-29", "2026-09-01")).toBe(true);
    expect(isWithinRange("2026-09-01", "2026-08-29", "2026-09-01")).toBe(true);
  });

  it("범위 밖을 걸러낸다", () => {
    expect(isWithinRange("2026-08-28", "2026-08-29")).toBe(false);
    expect(isWithinRange("2026-09-02", undefined, "2026-09-01")).toBe(false);
  });

  it("범위를 주지 않으면 전부 통과한다", () => {
    expect(isWithinRange("1999-01-01")).toBe(true);
    expect(isWithinRange("2026-08-29", "", "")).toBe(true);
  });

  it("clampISO 는 가까운 경계로 접는다", () => {
    expect(clampISO("2026-08-01", "2026-08-29")).toBe("2026-08-29");
    expect(clampISO("2026-10-01", undefined, "2026-09-01")).toBe("2026-09-01");
    expect(clampISO("2026-08-30", "2026-08-29", "2026-09-01")).toBe("2026-08-30");
  });
});

describe("빠른 선택", () => {
  it("미래 칩은 오늘·1주 뒤·1개월 뒤다", () => {
    expect(futureQuickPicks("2026-08-29")).toEqual([
      { label: "오늘", value: "2026-08-29" },
      { label: "1주 뒤", value: "2026-09-05" },
      { label: "1개월 뒤", value: "2026-09-29" },
    ]);
  });

  // 결혼식 칩은 **척도가 다르다** — 준비 기간이 반년~한 해 반이라 개월 단위로 나눈다.
  it("결혼식 칩은 6·12·18개월 뒤다", () => {
    expect(weddingQuickPicks("2026-08-29")).toEqual([
      { label: "6개월 뒤", value: "2027-02-28" }, // 말일 접기 — 2월엔 29일이 없다(2027 은 평년)
      { label: "12개월 뒤", value: "2027-08-29" },
      { label: "18개월 뒤", value: "2028-02-29" }, // 2028 은 윤년이라 29일이 산다
    ]);
  });

  it("과거 칩은 오늘·어제다", () => {
    expect(pastQuickPicks("2026-09-01")).toEqual([
      { label: "오늘", value: "2026-09-01" },
      { label: "어제", value: "2026-08-31" },
    ]);
  });
});
