// 숫자 입력 정화·포맷·스텝의 계약을 고정한다.
//
// 이 함수들이 존재하는 이유는 `NumberInput` 이 `<input type="number">` 를 버렸기 때문이다.
// 버린 이유와 그 대가는 `number-input.ts` 머리말에 적었다 — 여기서는 **그 대가를 갚는 계산이
// 맞는지**만 본다. 컴포넌트 테스트(`shared/ui/NumberInput.test.tsx`)가 DOM 동작을 보고,
// 이 파일은 그 아래 순수 계산을 본다. 계산이 여기서 고정돼 있어야 컴포넌트 테스트가
// "캐럿이 왜 저기 있지"를 다시 파고들지 않는다.
import { describe, expect, it } from "vitest";
import { caretAfterFormat, groupDigits, normalizeDigits, stepValue, toDigits } from "./number-input";

describe("toDigits", () => {
  // `type="number"` 가 실제로 통과시키던 문자들이다 — 마이너스·소수점·지수. 이 저장소의
  // 소비자들은 전부 `Number()` 로 파싱해 서버로 보내므로(AddPaymentRow.tsx:112 등)
  // 저 셋이 통과하면 음수 금액이 그대로 저장된다.
  it("마이너스·소수점·지수·콤마·통화기호·한글을 전부 떨어뜨린다", () => {
    expect(toDigits("₩-1,2a3.4e5")).toBe("12345");
  });

  it("붙여넣기로 들어온 완성형 금액 문자열도 숫자만 남긴다", () => {
    expect(toDigits("₩1,234,567원")).toBe("1234567");
  });

  it("숫자가 하나도 없으면 빈 문자열", () => {
    expect(toDigits("-.eㄱ")).toBe("");
  });

  // 전각 숫자는 한글 IME 상태에서 실제로 입력될 수 있다. 반각으로 접지 않고 **떨어뜨린다** —
  // 접어 주면 "무엇이 들어가고 무엇이 막히는지"의 경계가 흐려지고, 사용자는 어차피
  // 반각으로 다시 칠 수 있다.
  it("전각 숫자는 통과시키지 않는다", () => {
    expect(toDigits("１２３")).toBe("");
  });
});

describe("normalizeDigits", () => {
  it("선행 0을 지운다", () => {
    expect(normalizeDigits("007")).toBe("7");
  });

  // 0 자체는 유효한 금액이다(예산 0원 배정). 통째로 지워 빈 칸을 만들면
  // 사용자가 0을 입력할 방법이 사라진다.
  it("0 하나는 그대로 둔다", () => {
    expect(normalizeDigits("0")).toBe("0");
  });

  it("0만 여러 개면 0 하나로 접는다", () => {
    expect(normalizeDigits("000")).toBe("0");
  });

  it("빈 문자열은 빈 문자열", () => {
    expect(normalizeDigits("")).toBe("");
  });
});

describe("groupDigits", () => {
  it("세 자리마다 콤마를 넣는다", () => {
    expect(groupDigits("4500")).toBe("4,500");
    expect(groupDigits("1234567")).toBe("1,234,567");
  });

  it("세 자리 이하는 콤마가 없다", () => {
    expect(groupDigits("450")).toBe("450");
  });

  // 빈 칸은 빈 칸이어야 한다 — 여기서 "0"을 만들면 사용자가 필드를 비울 수 없다.
  it("빈 문자열은 빈 문자열", () => {
    expect(groupDigits("")).toBe("");
  });
});

describe("caretAfterFormat", () => {
  // 콤마가 붙으면서 문자열이 길어지므로, 캐럿을 "문자 인덱스"로 기억하면 밀린다.
  // 대신 **캐럿 앞의 숫자 개수**를 기억했다가 포맷 후 같은 개수 뒤로 돌려놓는다.
  it("맨 앞(숫자 0개 앞)은 0", () => {
    expect(caretAfterFormat("4,500", 0)).toBe(0);
  });

  // "41500" 의 2번째 숫자 뒤 → "41,500" 에서는 인덱스 2(콤마 앞)가 아니라… 콤마 바로 앞인 2다.
  it("콤마 직전 자리를 정확히 짚는다", () => {
    expect(caretAfterFormat("41,500", 2)).toBe(2);
  });

  it("콤마를 건너뛰어 그 다음 숫자 뒤를 짚는다", () => {
    expect(caretAfterFormat("41,500", 3)).toBe(4);
  });

  it("맨 끝", () => {
    expect(caretAfterFormat("41,500", 5)).toBe(6);
  });

  // 삭제로 숫자가 줄어든 경우 — 기억해 둔 개수가 남은 숫자보다 많을 수 있다.
  // 문자열 길이를 넘겨 setSelectionRange 가 던지지 않도록 끝으로 접는다.
  it("숫자 개수가 문자열보다 많으면 맨 끝으로 접는다", () => {
    expect(caretAfterFormat("450", 9)).toBe(3);
  });
});

describe("stepValue", () => {
  // 네이티브 `type="number"` 의 ↑ 는 현재값에 step 을 더하는 게 아니라 **다음 step 배수로
  // 올린다**(Chrome 실측: value=7, step=10 → 10). 커스텀 구현이 이 감각을 바꾸면
  // 기존 Step8Allocation(step=10만원) 사용자에게는 회귀로 느껴진다.
  it("↑ 는 다음 step 배수로 올린다", () => {
    expect(stepValue(7, 1, 10, 0)).toBe(10);
  });

  it("이미 step 배수면 한 칸 더 올린다", () => {
    expect(stepValue(10, 1, 10, 0)).toBe(20);
  });

  it("↓ 는 이전 step 배수로 내린다", () => {
    expect(stepValue(7, -1, 10, 0)).toBe(0);
    expect(stepValue(20, -1, 10, 0)).toBe(10);
  });

  it("min 아래로는 내려가지 않는다", () => {
    expect(stepValue(0, -1, 10, 0)).toBe(0);
  });

  it("max 위로는 올라가지 않는다", () => {
    expect(stepValue(95, 1, 10, 0, 100)).toBe(100);
  });

  // 빈 칸에서 ↑ — 네이티브와 같은 결과를 낸다(min 이 있으면 min, 없으면 step).
  it("빈 값에서 ↑ 는 max(min, step)", () => {
    expect(stepValue(null, 1, 10, 0)).toBe(10);
    expect(stepValue(null, 1, 10, 50)).toBe(50);
  });

  it("빈 값에서 ↓ 는 min", () => {
    expect(stepValue(null, -1, 10, 0)).toBe(0);
  });

  // Shift 동반 시 컴포넌트가 step 을 10배로 부풀려 넘긴다 — 함수는 그 사정을 모른 채
  // 받은 step 으로만 계산한다(관심사 분리).
  it("step 이 커도 같은 규칙으로 계산한다", () => {
    expect(stepValue(4500, 1, 100, 0)).toBe(4600);
  });
});
