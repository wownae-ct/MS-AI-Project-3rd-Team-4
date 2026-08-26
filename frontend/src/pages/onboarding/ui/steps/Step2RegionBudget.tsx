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
import type { TotalAverageBenchmark } from "@/entities/wedding";
import { REGION_CODES, type RegionCode } from "@/shared/api";
import { manwonInputToWonString, wonStringToManwonDisplay } from "@/shared/lib/money";
import { FIELD_LABEL, FIELD_NOTE, INPUT, SELECT } from "../onboarding-styles";

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

      <div className={FIELD_LABEL}>
        <div className="flex items-center justify-between">
          총 예산
          <button
            type="button"
            className={MINI_TOGGLE}
            aria-pressed={totalBudgetUnsure}
            onClick={() => onTotalBudgetUnsureChange(!totalBudgetUnsure)}
          >
            <span className={totalBudgetUnsure ? MINI_TOGGLE_BOX_CHECKED : MINI_TOGGLE_BOX} />
            미정이에요
          </button>
        </div>
        {!totalBudgetUnsure && (
          <div className="flex items-center gap-2">
            <input
              className={INPUT}
              type="number"
              inputMode="numeric"
              min={0}
              aria-label="총 예산(만원)"
              value={wonStringToManwonDisplay(totalBudget)}
              onChange={(event) => onTotalBudgetChange(manwonInputToWonString(event.target.value))}
            />
            <span className="flex-none text-sm font-bold text-ink-soft">만원</span>
          </div>
        )}
        {benchmark !== null && (
          <p className={FIELD_NOTE}>
            참고 · {regionLabel} 지역 예식장+스드메 참가격 평균 합산 {benchmark.median_price.toLocaleString("ko-KR")}원
          </p>
        )}
        {totalBudgetUnsure && <p className={FIELD_NOTE}>위 참고값으로 시작하고, 나중에 정확한 예산으로 바꿀 수 있어요.</p>}
      </div>

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
        <input
          className={INPUT}
          type="number"
          inputMode="numeric"
          min={0}
          aria-label="예상 하객 수"
          placeholder={guestCountUnsure ? "미정" : undefined}
          value={guestCountUnsure ? "" : guestCount}
          disabled={guestCountUnsure}
          onChange={(event) => onGuestCountChange(event.target.value)}
        />
        {/* 실제로 200명을 기본값으로 저장하지 않는다 — guest_count_unsure=true 면 서버는
            guest_count 를 NULL 로 저장할 뿐, 총예산(total_budget_unsure)과 달리 대신 계산해
            채워주는 값이 없다. "200명으로 시작해요"라고 하면 실제 저장값과 다른 문구가 된다
            (레드팀 감사 라운드 2) — 실제 동작 그대로 안내한다. */}
        {guestCountUnsure && <p className={FIELD_NOTE}>인원 수는 미정으로 저장돼요. 나중에 언제든 입력할 수 있어요.</p>}
      </div>
    </div>
  );
}
