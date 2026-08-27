// 온보딩 — S1, 9단계 위저드(8단계 입력 + 9단계 최종 확인). 시각 스펙: docs/mockups/s1-onboarding.html,
// 필드 계약: 03_API_spec.md #6(POST /weddings) · #10(PUT /wedding-categories) ·
// #31(GET /benchmarks/total-average).
//
// 1~8단계 순서는 최종 프로토타입(docs/wedding/plan/new/12_final_prototype_mockup.html)의
// onbStep1~8 번호와 그대로 맞춘다: 1 역할/날짜 · 2 지역/예산/하객수 · 3 취향(스킵) ·
// 4 목표(스킵) · 5 우선순위(스킵) · 6 진행상황 · 7 카테고리 on/off · 8 예산 배분.
// 9단계(확인, 2026-08-26 사용자 지시 신규)는 목업에 없다 — 모든 단계(1~8)가 "나중에 설정"
// 버튼을 갖게 되면서, 몇 단계를 건너뛰었든 마지막엔 항상 여기서 "실제로 고른 값"과 "기본값으로
// 채워질 값"을 한 화면에 모아 확인하고 시작하게 한다.
//
// **이 컴포넌트는 라우터를 모르지 않는다 — LoginPage.tsx 와 같은 관례.** 콜백 prop(onSuccess) 대신
// `useNavigate` 를 직접 쓴다 — 이 브랜치의 `_authed`/`_shell` 가드·`LoginPage.tsx` 가 이미 이
// 방식이라(§5 인계 문서 §2/§5), 온보딩만 다른 패턴을 쓰면 두 화면이 서로 다른 라우팅 관례를 갖게 된다.
//
// 상태를 하나의 객체 대신 필드별 useState로 쪼갠 이유 — 각 스텝이 자기 필드만 구독하게 하면
// prop 목록이 스텝별 데이터 계약을 그대로 드러낸다(각 Step 컴포넌트의 Props 인터페이스가 실제로
// 그 단계가 무엇을 묻는지 문서 역할을 한다). reducer 하나로 합치면 그 문서화 효과가 사라진다.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { invalidateSession } from "@/entities/session";
import {
  createWedding,
  putWeddingCategories,
  type DoneSoFarCategory,
  type SdmPriority,
  type TastePreference,
  type UserRole,
  type VenuePriority,
  type WeddingCategoryUpdateInput,
} from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { computeDefaultUnsurePrecision, computeUnsurePrecisionOptions } from "@/shared/lib/wedding-date";
import { Button, Card, Page } from "@/shared/ui";
import { buildReviewLabels } from "./build-review-labels";
import {
  GeneratingOverlay,
  STEP_HEADLINE,
  STEP_SUBTITLE,
  Step1RoleDate,
  Step2RegionBudget,
  Step3Taste,
  Step4Goals,
  Step5Priority,
  Step6Progress,
  Step7CategoryToggle,
  Step8Allocation,
  Step9Review,
  TOTAL_STEPS,
  type Step,
  type UnsurePrecision,
} from "./steps";
import { useOnboardingData } from "./use-onboarding-data";

// 3단계(취향)·4단계(목표)를 "나중에 설정"으로 건너뛸 때 백엔드에 실제로 보낼 기본값
// (2026-08-26 사용자 지시 — 지어낸 값이 아니라 대화로 정한 값). 예산/하객수(2단계)는 이런
// 고정값이 아니라 `*_unsure` 플래그 경로를 쓴다 — 그 값은 아래 파생 상수 블록 참고.
const TASTE_DEFAULT: TastePreference = "BALANCED";
const GOALS_DEFAULT: string[] = ["예산 초과 없이 준비", "계약서 꼼꼼히 확인"];

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);

  // 1단계
  const [userRole, setUserRole] = useState<UserRole>("BRIDE");
  const [isDateExact, setIsDateExact] = useState(false);
  const [weddingDate, setWeddingDate] = useState("");
  // 기본 선택값과 칩 목록이 서로 다른 "오늘" 값을 보고 어긋나지 않도록 한 번만 계산해 공유한다.
  const [today] = useState(() => new Date());
  const [unsurePrecision, setUnsurePrecision] = useState<UnsurePrecision>(() =>
    computeDefaultUnsurePrecision(today),
  );
  const unsurePrecisionOptions = computeUnsurePrecisionOptions(today);

  // 2단계 — 지역 기본값은 SEOUL_OTHER(서울 강남 외, 2026-08-26 사용자 지시). 강남은 가격이
  // 위로 쏠린 부분집합이라 "만졌든 안 만졌든 항상 유효한 기본값"으로 대표성이 떨어진다고 판단.
  const [regionCode, setRegionCode] = useState("SEOUL_OTHER");
  const [totalBudget, setTotalBudget] = useState("");
  const [totalBudgetUnsure, setTotalBudgetUnsure] = useState(false);
  const [guestCount, setGuestCount] = useState("");
  const [guestCountUnsure, setGuestCountUnsure] = useState(false);

  // 3단계 (스킵 가능 — null 이면 아예 보내지 않는다)
  const [tastePreference, setTastePreference] = useState<TastePreference | null>(null);

  // 4단계 (신규, 스킵 가능 — 빈 배열이면 보내지 않는다)
  const [goals, setGoals] = useState<string[]>([]);

  // 5단계
  const [venuePriority, setVenuePriority] = useState<VenuePriority | null>(null);
  const [sdmPriority, setSdmPriority] = useState<SdmPriority | null>(null);

  // 6단계
  const [doneSoFar, setDoneSoFar] = useState<DoneSoFarCategory[]>([]);

  // 7·8단계 — GET /categories 로 한 번만 채운다. 토글(7)과 배분(8)이 같은 행 배열을 공유한다.
  // 2단계/8단계가 같이 쓰는 참고 벤치마크도 같은 훅이 받아온다(use-onboarding-data.ts —
  // oxlint max-lines 300줄 상한 초과로 뽑아냄). 두 조회 모두 실패를 조용히 삼키지 않는다
  // (레드팀 감사) — categoriesError/benchmarkError로 화면에 알린다.
  const { benchmark, benchmarkError, allocationRows, setAllocationRows, isLoadingCategories, categoriesError } =
    useOnboardingData(regionCode);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedTotalBudget = totalBudget === "" ? 0 : Number(totalBudget);

  // "나중에 설정" 기본값 파생 블록 (2026-08-26 사용자 지시) — 실제 state는 건드리지 않고,
  // 제출/9단계 확인 화면에 쓸 "실제로 반영될 값"만 여기서 계산한다. 각 필드가 비어있는 채로
  // 넘어왔다는 것 자체가 "건드리지 않았다"는 신호라 별도의 "건너뛴 단계" 추적 상태가 필요 없다
  // — 나중에 돌아가서 채우면 이 파생값도 자동으로 "실제 선택"으로 바뀐다.
  //
  // 🚨 이전엔 총예산/하객수를 비운 채로 "다음"만 눌러도 total_budget:0·guest_count:0이 그대로
  // 나갔다(실제 버그, 2026-08-26 발견) — 0은 "미정"이 아니라 진짜 0원/0명으로 해석된다. 아래
  // `isBudgetDefaulted`/`isGuestCountDefaulted`가 이 버그를 "나중에 설정" 여부와 무관하게 항상
  // 닫는다.
  const isBudgetDefaulted = !totalBudgetUnsure && totalBudget === "";
  const effectiveTotalBudgetUnsure = totalBudgetUnsure || isBudgetDefaulted;
  const isGuestCountDefaulted = !guestCountUnsure && guestCount === "";
  const effectiveGuestCountUnsure = guestCountUnsure || isGuestCountDefaulted;
  // 같은 부류의 버그 — "정확한 날짜"를 고르고 값은 비운 채로 "나중에 설정"(1단계에서 바로
  // 9단계로 점프)을 누르면 isDateExact=true·weddingDate=""가 그대로 남는다. 이 조합으로
  // 제출하면 wedding_date:"" 가 Pydantic date 강제 변환에서 422 로 튕긴다(레드팀 감사) — 다른
  // defaulted 필드들과 같은 패턴으로, "선택은 EXACT 지만 값이 없다"를 실제로는 미정 취급한다.
  const isDateDefaulted = isDateExact && weddingDate === "";
  const effectiveIsDateExact = isDateExact && !isDateDefaulted;
  const isTasteDefaulted = tastePreference === null;
  const effectiveTastePreference = tastePreference ?? TASTE_DEFAULT;
  const isGoalsDefaulted = goals.length === 0;
  const effectiveGoals = goals.length > 0 ? goals : GOALS_DEFAULT;

  // 8단계 진행률 바 + 슬라이더 상한의 분모 — 예산을 확정했으면 그 값, 미정(명시적 토글이든
  // 비워둬서 defaulted 처리됐든)이면 참고 벤치마크 중앙값으로 어림한다. 실제 저장값은 이
  // 추정치가 아니라 `total_budget_unsure` 플래그로 서버가 다시 계산한다(03_API_spec.md #6
  // 규칙 4) — 여기서는 사용자가 배분 감을 잡게 하는 화면 전용 추정치일 뿐이다.
  const totalBudgetEstimate = effectiveTotalBudgetUnsure ? (benchmark?.median_price ?? 0) : parsedTotalBudget;
  const allocatedBudget = allocationRows.filter((row) => row.isActive).reduce((sum, row) => sum + row.plannedBudget, 0);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      // createWedding 이 던지는 에러는 곧장 throw 하지 않고 일단 들고만 있는다 — 409
      // (WEDDING_ALREADY_EXISTS, 레드팀 감사 1라운드 #2, dev-35 확인)뿐 아니라 TIMEOUT/
      // NETWORK_ERROR 도 마찬가지로 "서버는 실제로 성공했는데 클라이언트만 응답을 못 받은"
      // 경우일 수 있다(2026-08-27 staging 실사용 중 발견 — net::ERR_ABORTED로 실패한 것처럼
      // 보였지만 서버는 이미 웨딩 생성+개인화까지 끝나 있었음). wedding_id는 URL/바디로 받지
      // 않고 세션에서 서버가 유도하므로(03_API_spec.md:126) PUT /wedding-categories 도 같은
      // 세션 쿠키로 대상 웨딩을 찾는다 — 즉 createWedding 응답을 못 받았어도 카테고리 저장을
      // 밑져야 본전으로 시도할 수 있다.
      //
      // 예전엔 409 이외의 에러를 여기서 바로 rethrow 했다 — 그러면 putWeddingCategories 가
      // 아예 실행되지 않고, 서버엔 이미 wedding row가 생겼는데(hasWedding=true) 카테고리
      // 활성화·예산 배분만 통째로 유실된 채로 남았다. 게다가 라우터 가드가 hasWedding=true인
      // /onboarding 재진입을 대시보드로 강제 리다이렉트하므로(router.tsx), 같은 페이지에서
      // 즉시 재시도하지 않는 한 복구할 방법이 없었다.
      let weddingCreationError: unknown = null;
      try {
        await createWedding({
          user_role: userRole,
          wedding_date: effectiveIsDateExact ? weddingDate : undefined,
          wedding_date_precision: effectiveIsDateExact ? "EXACT" : unsurePrecision,
          total_budget: effectiveTotalBudgetUnsure ? undefined : parsedTotalBudget,
          total_budget_unsure: effectiveTotalBudgetUnsure,
          region_code: regionCode,
          guest_count: effectiveGuestCountUnsure ? undefined : Number(guestCount),
          guest_count_unsure: effectiveGuestCountUnsure,
          taste_preference: effectiveTastePreference,
          venue_priority: venuePriority ?? undefined,
          sdm_priority: sdmPriority ?? undefined,
          primary_goals: effectiveGoals,
          done_so_far: doneSoFar,
        });
      } catch (err) {
        // 409(WEDDING_ALREADY_EXISTS)는 "이미 만들어져 있다"는 기대된 신호이므로 진짜 에러로
        // 취급하지 않는다 — allocationRows 는 실패와 무관하게 화면 state에 남아 있으므로
        // 사용자가 다시 고를 필요 없이 바로 카테고리 저장을 재시도한다. 그 외의 에러(타임아웃 등)는
        // 아래에서 카테고리 저장까지 실패할 때만 진짜 원인으로 보여주기 위해 들고 있는다.
        if (!(err instanceof ApiError && err.code === "WEDDING_ALREADY_EXISTS")) weddingCreationError = err;
      }

      const categoryUpdates: WeddingCategoryUpdateInput[] = allocationRows.map((row) => ({
        category_code: row.categoryCode,
        is_active: row.isActive,
        planned_budget: row.isActive ? row.plannedBudget : 0,
        display_order: row.displayOrder,
        selected_options: row.isActive ? row.selectedOptions : null,
        ...(row.isActive ? {} : { skip_reason: "온보딩에서 사용 안 함으로 표시" }),
      }));
      try {
        await putWeddingCategories(categoryUpdates);
      } catch (categoryErr) {
        // 카테고리 저장 실패보다 createWedding 실패가 더 정확한 원인이면(예: 둘 다 같은
        // 타임아웃 때문에 실패) 그쪽 메시지를 보여준다 — "카테고리 저장에 실패했습니다"보다
        // "요청이 시간 초과되었습니다"가 사용자에게 더 정확하다.
        throw weddingCreationError ?? categoryErr;
      }

      // 웨딩을 막 만들었으니 캐시된 세션의 hasWedding 은 이제 stale 이다 — 무효화해야 다음에
      // 셸 게이트를 통과할 때(대시보드 진입) 새로 조회해 true 를 본다(LoginPage.tsx 와 같은 이유).
      invalidateSession();
      await navigate({ to: "/" });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const stepDots = Array.from({ length: TOTAL_STEPS }, (_, i) => (i + 1) as Step);

  // isSubmitting 은 이미 handleSubmit 이 시작할 때 true, navigate 호출 직전 finally 에서만
  // false 로 돌아간다 — 그래서 성공 시에는 이 오버레이가 사라지는 순간과 라우트가 바뀌는 순간이
  // 거의 같아, 사용자 눈에 "오버레이 → 대시보드"로 자연스럽게 이어진다.
  if (isSubmitting) return <GeneratingOverlay />;

  // 9단계(확인) 라벨 계산 — Step9Review도 이 컴포넌트도 라벨 변환 로직을 갖지 않는다
  // (build-review-labels.ts로 뽑아냄, oxlint max-lines 300줄 상한 초과).
  const reviewLabels = buildReviewLabels({
    isDateExact,
    weddingDate,
    unsurePrecision,
    unsurePrecisionOptions,
    regionCode,
    effectiveTotalBudgetUnsure,
    parsedTotalBudget,
    benchmarkMedianPrice: benchmark?.median_price ?? null,
    effectiveGuestCountUnsure,
    guestCount,
    effectiveTastePreference,
    effectiveGoals,
    venuePriority,
    sdmPriority,
    doneSoFar,
    allocatedBudget,
    totalBudgetEstimate,
  });
  const activeCategoryCount = allocationRows.filter((row) => row.isActive).length;

  return (
    <Page
      title={STEP_HEADLINE[step]}
      subtitle={STEP_SUBTITLE[step]}
      width="max-w-[430px]"
      // 최초 진입(1단계)만 끈다 — 문서 제목과 중복 낭독을 피한다(Page.tsx 규범). 이후 모든 단계
      // 전환은 헤드라인이 바뀌므로(Page.tsx의 focus effect가 title도 의존성으로 본다) 스크린
      // 리더가 화면이 바뀐 것을 알 수 있어야 한다(접근성 감사 2026-08-26, WCAG 4.1.3 관점).
      focusOnMount={step > 1}
    >
      {/*
        장식용 점 표시기다 — 몇 단계인지는 Page 의 title(STEP_HEADLINE)이 이미 텍스트로 전달한다.
        `role="progressbar"` 를 붙이면 jsx-a11y가 네이티브 `<progress>` 태그를 요구하는데(prefer-
        tag-over-role), 그 요소는 이 점 8개 세그먼트 표현을 낼 수 없다 — 별도 정보를 안 주는
        장식 요소이므로 role 대신 aria-hidden 으로 스크린리더에서 아예 뺀다.
      */}
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {stepDots.map((dot) => (
          <span key={dot} className={`h-1 flex-1 rounded-pill ${dot <= step ? "bg-primary" : "bg-line"}`} />
        ))}
      </div>

      <Card className="flex flex-col gap-5">
        {error !== null && (
          <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
            {error}
          </p>
        )}

        {step === 1 && (
          <Step1RoleDate
            userRole={userRole}
            onUserRoleChange={setUserRole}
            isDateExact={isDateExact}
            onDateModeChange={setIsDateExact}
            weddingDate={weddingDate}
            onWeddingDateChange={setWeddingDate}
            unsurePrecisionOptions={unsurePrecisionOptions}
            unsurePrecision={unsurePrecision}
            onUnsurePrecisionChange={setUnsurePrecision}
          />
        )}
        {step === 2 && (
          <Step2RegionBudget
            regionCode={regionCode}
            onRegionCodeChange={setRegionCode}
            totalBudget={totalBudget}
            onTotalBudgetChange={setTotalBudget}
            totalBudgetUnsure={totalBudgetUnsure}
            onTotalBudgetUnsureChange={setTotalBudgetUnsure}
            guestCount={guestCount}
            onGuestCountChange={setGuestCount}
            guestCountUnsure={guestCountUnsure}
            onGuestCountUnsureChange={setGuestCountUnsure}
            benchmark={benchmark}
          />
        )}
        {step === 3 && <Step3Taste tastePreference={tastePreference} onTastePreferenceChange={setTastePreference} />}
        {step === 4 && <Step4Goals goals={goals} onGoalsChange={setGoals} />}
        {step === 5 && (
          <Step5Priority
            sdmPriority={sdmPriority}
            onSdmPriorityChange={setSdmPriority}
            venuePriority={venuePriority}
            onVenuePriorityChange={setVenuePriority}
          />
        )}
        {step === 6 && <Step6Progress doneSoFar={doneSoFar} onDoneSoFarChange={setDoneSoFar} />}
        {step === 9 && (
          <Step9Review
            weddingDateLabel={reviewLabels.weddingDateLabel}
            isDateDefaulted={isDateDefaulted}
            regionLabel={reviewLabels.regionLabel}
            budgetLabel={reviewLabels.budgetLabel}
            isBudgetDefaulted={isBudgetDefaulted}
            guestCountLabel={reviewLabels.guestCountLabel}
            isGuestCountDefaulted={isGuestCountDefaulted}
            tasteLabel={reviewLabels.tasteLabel}
            isTasteDefaulted={isTasteDefaulted}
            goalsLabel={reviewLabels.goalsLabel}
            isGoalsDefaulted={isGoalsDefaulted}
            venuePriorityLabel={reviewLabels.venuePriorityLabel}
            sdmPriorityLabel={reviewLabels.sdmPriorityLabel}
            progressLabel={reviewLabels.progressLabel}
            activeCategoryCount={activeCategoryCount}
            totalCategoryCount={allocationRows.length}
            allocatedBudgetLabel={reviewLabels.allocatedBudgetLabel}
          />
        )}
        {(step === 7 || step === 8) &&
          (isLoadingCategories ? (
            <p className="text-sm text-ink-soft">불러오는 중…</p>
          ) : categoriesError === null ? (
            step === 7 ? (
              <Step7CategoryToggle rows={allocationRows} onRowsChange={setAllocationRows} />
            ) : (
              <Step8Allocation rows={allocationRows} onRowsChange={setAllocationRows} totalBudgetEstimate={totalBudgetEstimate} />
            )
          ) : (
            <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
              {categoriesError}
            </p>
          ))}
        {step === 2 && benchmarkError !== null && (
          <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
            {benchmarkError}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <Button variant="ghost" onClick={() => setStep((current) => (current - 1) as Step)}>
                <span aria-hidden="true">←</span> 이전
              </Button>
            )}
            {/* 모든 입력 단계(1~8)에 "나중에 설정"이 있다(2026-08-26 사용자 지시) — 목적지는
                항상 9단계(확인)다. 몇 단계에서 눌렀든 남은 단계는 그냥 건너뛰고, 비워둔 필드는
                9단계가 정한 기본값으로 채워진다(§ isXxxDefaulted 파생값 블록) — "다음"으로
                하나씩 넘기는 것과 달리 여기선 중간 단계를 굳이 보여줄 필요가 없다. */}
            {step < TOTAL_STEPS && (
              <Button variant="ghost" onClick={() => setStep(9)}>
                나중에 설정
              </Button>
            )}
          </div>
          {step < TOTAL_STEPS ? (
            <Button
              // 1단계에서 "정확한 날짜"를 고르고 값을 비운 채로는 다음으로 넘어가지 못하게 막는다
              // — "나중에 설정"은 여전히 열려 있다(그 경우 isDateDefaulted 파생값이 안전하게
              // 미정 취급한다). 값 없이 "다음"만 눌러 진행하면 결국 9단계 제출 시점에야 422로
              // 알게 되던 문제를 여기서 먼저 막는다(레드팀 감사).
              disabled={step === 1 && isDateDefaulted}
              onClick={() => setStep((current) => (current + 1) as Step)}
            >
              다음
            </Button>
          ) : (
            <Button disabled={isSubmitting} onClick={() => void handleSubmit()}>
              시작하기
            </Button>
          )}
        </div>
      </Card>
    </Page>
  );
}
