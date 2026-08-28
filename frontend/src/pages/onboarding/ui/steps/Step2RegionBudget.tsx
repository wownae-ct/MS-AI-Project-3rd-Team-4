// 2단계: 지역 + 총예산 + 하객수. 시각 스펙 s1-onboarding.html:233-268.
//
// **지역 select 값은 목업(서울/경기/인천/부산)을 그대로 옮기지 않았다.** `region_code`는
// `backend/scripts/seed_price_benchmarks.py`의 `_REGION_LABEL_TO_CODE`가 실제로 채우는 값이고,
// 거기서 "서울"은 단일 코드가 아니라 `SEOUL_GANGNAM`/`SEOUL_OTHER` 둘로 갈린다 — 목업 그대로
// "서울" 하나만 두면 벤치마크 조회(#31)가 존재하지 않는 코드로 나가 항상 빈 캡션이 된다.
//
// **예산 미정 토글은 목업에 없다.** 목업은 하객수에만 미정 토글이 있지만(s1:255-263),
// `WeddingCreateInput.total_budget_unsure`가 실제 필드로 존재하고 이걸 참으로 보낼 UI 경로가
// 없으면 그 값은 영원히 false로만 나간다 — 플랜 §4가 "미정 체크 시 캡션"을 명시한 이유이기도
// 하다. 하객수 토글과 같은 시각 패턴(미니 체크박스 라벨)으로 확장했다.
//
// 벤치마크 조회는 이 컴포넌트가 아니라 OnboardingPage(컨테이너)가 한다 — 6단계 배분 진행률의
// "미정일 때 참고 총예산"도 같은 값을 써야 해서, fetch를 여기 가두면 6단계가 다시 불러야 한다.
//
// **총예산 입력은 만원 단위다(2026-08-24, 사용자 요청).** `totalBudget` prop 자체는 여전히
// 원 단위 문자열이다 — `OnboardingPage`가 그대로 `POST /weddings`에 보내야 하고, 컨테이너 상태의
// 의미를 바꾸면 그쪽 제출 로직도 같이 손대야 해서 범위가 커진다. 대신 이 컴포넌트가 입력 경계에서만
// 원↔만원을 변환한다 — 사용자는 "4500"을 입력하고 이 필드는 부모에게 "45000000"을 돌려준다.
//
// **총예산 미정일 때 입력칸을 감추지 않는다(2026-08-28 사용자 지시).** 예전엔 토글을 켜면 입력칸이
// 통째로 사라져 (1) 같은 화면의 하객수(비활성만 됨)와 동작이 갈렸고 (2) "그래서 얼마로 잡히는지"를
// 숫자로 확인할 수 없었다. 이제 자리에 남기되 비활성화하고 벤치마크 중앙값을 만원 단위로 채워 보인다.
//
// 채워 보이는 값은 **표시 전용이다 — 부모 state(`totalBudget`)를 건드리지 않는다.** 토글을 켤 때
// state에 써 넣으면 (a) 비동기로 늦게 도착하는 `benchmark`와 지역 변경을 따라가는 동기화 effect가
// 필요해지고 (b) 사용자가 이미 입력해 둔 값을 덮어쓰며 (c) 토글을 껐을 때 "사용자가 확정한 값"과
// "참고값"이 구분되지 않는다. 제출 payload는 지금까지처럼 `total_budget_unsure` 플래그만 보내고
// 서버가 같은 벤치마크로 채운다(03_API_spec.md #6 규칙 4) — 화면이 보여준 금액과 저장될 금액이
// 어차피 같은 출처라 어긋나지 않는다.
//
// **총예산 입력칸 자체는 이제 `TotalBudgetField` 가 그린다(2026-08-28).** 8단계(Step8Allocation)가
// 배분 초과를 그 자리에서 고치려고 같은 입력을 쓰기 때문이다 — 마크업을 복사하면 두 화면의 스텝·
// 콤마·반올림이 조용히 갈린다. 이 컴포넌트는 "미정" 토글과 안내 문구만 그 필드에 끼워 넣는다.
import type { TotalAverageBenchmark } from "@/entities/wedding";
import { REGION_CODES, type RegionCode } from "@/shared/api";
import { wonStringToManwon, wonToManwon } from "@/shared/lib/money";
import { NumberInput } from "@/shared/ui";
import { FIELD_LABEL, FIELD_NOTE_KEEP, INPUT, INPUT_DISABLED, SELECT } from "../onboarding-styles";
import { TotalBudgetField } from "./TotalBudgetField";

// 2026-08-26 사용자 피드백: 5개(서울강남/서울외/경기/인천/부산)만 노출돼 있었다 — 지역 14개
// 전체를 보여야 한다. `REGION_CODES`(17값)에서 실제 지역이 아닌 폴백 3개(전국/수도권/비수도권,
// 벤치마크 응답 전용)만 제외해 파생시킨다 — 목록을 따로 손으로 관리하면 계약이 늘 때마다 또 갈린다.
const FALLBACK_REGION_CODES: ReadonlySet<RegionCode> = new Set(["NATIONWIDE", "METRO", "NON_METRO"]);

// export하는 이유 — Step9Review가 지역 코드→한글 라벨 변환을 다시 정의하지 않고 이걸 그대로 쓴다
// (라벨 소스가 두 곳으로 갈리면 하나만 갱신됐을 때 조용히 어긋난다).
export const REGION_LABELS: Record<Exclude<RegionCode, "NATIONWIDE" | "METRO" | "NON_METRO">, string> = {
  SEOUL_GANGNAM: "서울(강남)",
  SEOUL_OTHER: "서울(강남 외)",
  BUSAN: "부산",
  INCHEON: "인천",
  DAEGU: "대구",
  DAEJEON: "대전",
  GWANGJU: "광주",
  ULSAN: "울산",
  GYEONGGI: "경기",
  CHUNGCHEONG: "충청",
  JEOLLA: "전라",
  GYEONGSANG: "경상",
  GANGWON: "강원",
  JEJU: "제주",
};

// 하객수 미정일 때 실제로 저장할 기본값(2026-08-28 사용자 지시). 목업 s1-onboarding.html:261-262가
// 원래 정한 값 — "평균 보증인원 기준 200명"이다.
//
// **이 상수가 화면 문구와 payload의 단일 진실 공급원이다.** 총예산(`total_budget_unsure`)은 서버가
// 벤치마크 중앙값으로 대신 채워주지만 하객수는 그런 경로가 없다 — `WeddingCreate.guest_count`는
// `int | None` 기본 `None`, DB 컬럼도 nullable에 기본값이 없어서, 프론트가 안 보내면 그냥 NULL로
// 저장된다. 그래서 예전엔 "200명으로 시작해요" 문구를 지우고 "미정으로 저장돼요"로 되돌렸었다.
// 이번엔 반대 방향으로 맞춘다 — 백엔드는 그대로 두고 프론트가 200을 실어 보내 문구와 저장값을
// 일치시킨다. `guest_count_unsure`는 계속 true로 보낸다(200은 시작값일 뿐 사용자가 확정한 값이
// 아니라는 신호). POST /weddings의 교차검증은 날짜·총예산 2건뿐이라 두 필드를 같이 보내도 422가
// 나지 않는다. 문구·placeholder·payload가 따로 놀지 않도록 상수를 보간해 쓴다.
export const GUEST_COUNT_UNSURE_DEFAULT = 200;

// 하객 수 ↑↓·▲▼ 1회 증감폭. 금액 쪽(AMOUNT_STEP_*)과 달리 여기만 쓰이므로 이 파일에 둔다.
const GUEST_COUNT_STEP = 10;

const REGION_OPTIONS: { value: string; label: string }[] = REGION_CODES.filter(
  (code) => !FALLBACK_REGION_CODES.has(code),
).map((code) => ({ value: code, label: REGION_LABELS[code as keyof typeof REGION_LABELS] }));

// py-1 — 인라인 미니 토글의 클릭 가능 높이를 늘린다(WCAG 2.5.8 AA 24px 쪽으로, 접근성 감사
// 2026-08-26). 텍스트/아이콘 시각 크기는 그대로 두고 히트 영역만 넓힌다.
const MINI_TOGGLE = "inline-flex cursor-pointer items-center gap-1.5 py-1 text-xs font-bold text-ink-soft";
// 스케일 밖 4px 접미사 없는 둥근모서리 유틸리티는 이 저장소의 게이트가 막는다
// (ghost-candidates.test.mjs) — 스케일 안의 `-sm` 접미사 버전을 쓴다. 이 주석에도 그 접미사 없는
// 이름을 평문으로 적지 않는다 — Tailwind 스캐너는 파일 전체를 평문으로 훑어 주석 속 단어도
// 산출 CSS 후보로 삼는다.
const MINI_TOGGLE_BOX = "h-3.5 w-3.5 flex-none rounded-sm border border-line bg-surface";
const MINI_TOGGLE_BOX_CHECKED = "h-3.5 w-3.5 flex-none rounded-sm border border-primary bg-primary";

export interface Step2Props {
  regionCode: string;
  onRegionCodeChange: (code: string) => void;
  totalBudget: string;
  onTotalBudgetChange: (value: string) => void;
  totalBudgetUnsure: boolean;
  onTotalBudgetUnsureChange: (unsure: boolean) => void;
  guestCount: string;
  onGuestCountChange: (value: string) => void;
  guestCountUnsure: boolean;
  onGuestCountUnsureChange: (unsure: boolean) => void;
  benchmark: TotalAverageBenchmark | null;
}

export function Step2RegionBudget({
  regionCode,
  onRegionCodeChange,
  totalBudget,
  onTotalBudgetChange,
  totalBudgetUnsure,
  onTotalBudgetUnsureChange,
  guestCount,
  onGuestCountChange,
  guestCountUnsure,
  onGuestCountUnsureChange,
  benchmark,
}: Step2Props) {
  const regionLabel = REGION_OPTIONS.find((option) => option.value === regionCode)?.label ?? regionCode;
  // 미정일 때 비활성 입력칸에 보여줄 값. 입력칸은 만원 단위라 여기서 변환한다(§머리말).
  // 벤치마크가 아직 안 왔거나 조회에 실패했으면 빈 칸으로 둔다 — 0을 채우면 "0원으로 시작한다"는
  // 거짓말이 된다. 실패 사실은 OnboardingPage 의 benchmarkError 배너가 따로 알린다.
  const benchmarkManwon = benchmark === null ? null : wonToManwon(benchmark.median_price);

  return (
    <div className="flex flex-col gap-5">
      <label className={FIELD_LABEL}>
        지역
        <select className={SELECT} value={regionCode} onChange={(event) => onRegionCodeChange(event.target.value)}>
          {REGION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <TotalBudgetField
        onTotalBudgetChange={onTotalBudgetChange}
        // 미정이면 참고 벤치마크를, 아니면 사용자가 넣은 값을 보인다. 벤치마크가 아직 안 왔거나
        // 실패했으면 `benchmarkManwon`이 null 이라 빈 칸이 된다(0을 채우면 "0원으로 시작한다"는
        // 거짓말이 된다, §머리말).
        valueManwon={totalBudgetUnsure ? benchmarkManwon : wonStringToManwon(totalBudget)}
        disabled={totalBudgetUnsure}
        labelAction={
          <button
            type="button"
            className={MINI_TOGGLE}
            aria-pressed={totalBudgetUnsure}
            onClick={() => onTotalBudgetUnsureChange(!totalBudgetUnsure)}
          >
            <span className={totalBudgetUnsure ? MINI_TOGGLE_BOX_CHECKED : MINI_TOGGLE_BOX} />
            미정이에요
          </button>
        }
      >
        {/* 미정이면 "이 값으로 설정됐다"고 단정하고, 아니면 참고값으로만 알린다 — 사용자가 직접
            금액을 입력하는 중에 "설정됐어요"라고 하면 화면의 입력값과 다른 말을 하게 된다.
            비활성 입력칸의 value 는 스크린리더 전달이 불확실하므로 같은 금액을 이 문단이 원 단위
            텍스트로도 반드시 전달하게 둔다(하객수 쪽과 같은 근거). */}
        {benchmark !== null && (
          <p className={FIELD_NOTE_KEEP}>
            {totalBudgetUnsure
              ? `${regionLabel} 지역 예식장+스드메 참가격 평균 합산인 ${benchmark.median_price.toLocaleString("ko-KR")}원으로 설정됐어요.`
              : `${regionLabel} 지역 예식장+스드메 참가격 평균 합산은 ${benchmark.median_price.toLocaleString("ko-KR")}원 이에요.`}
          </p>
        )}
        {totalBudgetUnsure && (
          <p className={FIELD_NOTE_KEEP}>위 참고값으로 시작하고, 나중에 정확한 예산으로 바꿀 수 있어요.</p>
        )}
      </TotalBudgetField>

      <div className={FIELD_LABEL}>
        <div className="flex items-center justify-between">
          예상 하객 수
          <button
            type="button"
            className={MINI_TOGGLE}
            aria-pressed={guestCountUnsure}
            onClick={() => onGuestCountUnsureChange(!guestCountUnsure)}
          >
            <span className={guestCountUnsure ? MINI_TOGGLE_BOX_CHECKED : MINI_TOGGLE_BOX} />
            미정이에요
          </button>
        </div>
        {/* 총예산 쪽과 같은 비활성 표현을 쓴다 — 같은 화면의 두 "미정" 필드 중 하나만 흐려지면
            버그처럼 보인다. */}
        {/* 금액이 아니지만 같은 컴포넌트를 쓴다 — 하객 수도 음수·소수·지수가 들어갈 이유가 없고
            (예전 type="number" 는 셋 다 통과시켰다), 1,200명처럼 네 자리가 되면 콤마가 오히려
            자연스럽다. 스텝은 10명 — 하객 수를 1명씩 올리는 조작은 200명 근처에서 의미가 없다. */}
        <NumberInput
          className={guestCountUnsure ? INPUT_DISABLED : INPUT}
          step={GUEST_COUNT_STEP}
          min={0}
          aria-label="예상 하객 수"
          placeholder={guestCountUnsure ? GUEST_COUNT_UNSURE_DEFAULT.toString() : undefined}
          value={guestCountUnsure || guestCount === "" ? null : Number(guestCount)}
          disabled={guestCountUnsure}
          onValueChange={(next) => onGuestCountChange(next === null ? "" : String(next))}
        />
        {/* 이 문구가 실제 저장값을 그대로 말한다 — 미정이면 OnboardingPage가 guest_count 에
            GUEST_COUNT_UNSURE_DEFAULT 를 실어 보낸다(§ 상수 주석). disabled 입력칸의
            placeholder 는 스크린리더로 잘 전달되지 않으므로, 같은 200을 이 문단이 텍스트로도
            반드시 전달하게 둔다(둘 다 같은 상수에서 나온다). */}
        {guestCountUnsure && (
          <p className={FIELD_NOTE_KEEP}>
            평균 보증인원 기준인 {GUEST_COUNT_UNSURE_DEFAULT}명으로 시작해요. 나중에 언제든
            바꿀 수 있어요.
          </p>
        )}
      </div>
    </div>
  );
}
