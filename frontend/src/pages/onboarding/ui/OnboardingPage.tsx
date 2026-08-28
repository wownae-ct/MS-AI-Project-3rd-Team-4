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
  type DoneSoFarCategory,
  type SdmPriority,
  type TastePreference,
  type UserRole,
  type VenuePriority,
} from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { computeDefaultUnsurePrecision, computeUnsurePrecisionOptions } from "@/shared/lib/wedding-date";
import { Button, Card, Loading, Page, SkeletonRows } from "@/shared/ui";
import { buildReviewLabels } from "./build-review-labels";
import {
  GeneratingOverlay,
  GUEST_COUNT_UNSURE_DEFAULT,
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
  allocationRowsToCategoryUpdates,
  useAllocationGuard,
  type Step,
  type UnsurePrecision,
} from "./steps";
import { useOnboardingData } from "./use-onboarding-data";

// 3단계(취향)·4단계(목표)를 "나중에 설정"으로 건너뛸 때 백엔드에 실제로 보낼 기본값
// (2026-08-26 사용자 지시 — 지어낸 값이 아니라 대화로 정한 값). 2단계의 두 필드는 서로 다르게
// 처리된다: 총예산은 고정값 없이 `total_budget_unsure` 플래그만 보내고 서버가 벤치마크로 채우지만,
// 하객수는 서버에 그런 경로가 없어 프론트가 `GUEST_COUNT_UNSURE_DEFAULT`(200명)를 실어 보낸다
// (2026-08-28 사용자 지시 — Step2RegionBudget.tsx의 상수 주석에 배경). 플래그는 둘 다 보낸다.
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
  // 닫는다. 하객수는 여기서 걸린 경우(명시적 미정 토글이든, 비워둬서 defaulted든) 똑같이
  // `GUEST_COUNT_UNSURE_DEFAULT`로 나간다 — 두 경로가 다른 값을 저장하면 9단계 확인 화면이
  // 보여준 값과 실제 저장값이 갈린다.
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

  // 배분 초과 가드(2026-08-28 사용자 지시) — 술어·초기화·미정 해제를 한 곳이 소유한다.
  // 근거와 배경은 use-allocation-guard.ts 머리말에 있다.
  const { isOverAllocated, wasAllocationReset, handleAllocationRowsChange, handleTotalBudgetChange, handleSkipToReview } =
    useAllocationGuard({
      allocatedBudget,
      totalBudgetEstimate,
      setAllocationRows,
      setTotalBudget,
      setTotalBudgetUnsure,
      goToReview: () => setStep(9),
    });

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      // 2026-08-27 재설계 — 카테고리를 createWedding payload에 함께 실어 개인화 LLM 생성을
      // 온보딩당 한 번만 태운다(이전엔 createWedding이 9개 카테고리 전부 활성으로 먼저 생성+
      // 개인화하고, 뒤이은 putWeddingCategories가 실제 온/오프와 달라진 걸 보고 또 한 번
      // 개인화를 재트리거했다 — 실측 Langfuse p95=45.9초짜리 호출을 온보딩마다 두 번 겹쳐
      // 태우던 구조였다). 백엔드가 categories 필드를 받아 처음부터 정확한 활성 집합으로 한 번만
      // 생성하도록 바뀌는 게 전제(별도 세션 dev-35가 backend 쪽 구현). putWeddingCategories는
      // 이제 온보딩 이후 수정(예산 페이지 등)에만 쓰인다 — 여기서는 더 이상 호출하지 않는다.
      // 행→payload 변환은 그 역방향(categoriesToAllocationRows)과 같은 파일에 있다.
      const categoryUpdates = allocationRowsToCategoryUpdates(allocationRows);

      try {
        await createWedding({
          user_role: userRole,
          wedding_date: effectiveIsDateExact ? weddingDate : undefined,
          wedding_date_precision: effectiveIsDateExact ? "EXACT" : unsurePrecision,
          total_budget: effectiveTotalBudgetUnsure ? undefined : parsedTotalBudget,
          total_budget_unsure: effectiveTotalBudgetUnsure,
          region_code: regionCode,
          guest_count: effectiveGuestCountUnsure ? GUEST_COUNT_UNSURE_DEFAULT : Number(guestCount),
          guest_count_unsure: effectiveGuestCountUnsure,
          taste_preference: effectiveTastePreference,
          venue_priority: venuePriority ?? undefined,
          sdm_priority: sdmPriority ?? undefined,
          primary_goals: effectiveGoals,
          done_so_far: doneSoFar,
          categories: categoryUpdates,
        });
      } catch (err) {
        // 단일 호출이라 카테고리 저장으로 넘어갈 "두 번째 기회"가 더 이상 없다 — 그래서 여기서
        // 바로 "복구 가능"과 "진짜 실패"를 가른다.
        // - 409(WEDDING_ALREADY_EXISTS): 이미 만들어져 있다는 확실한 신호(레드팀 감사 1라운드
        //   #2) — 재시도 시 같은 payload가 이미 반영됐을 것이므로 성공으로 취급하고 진행한다.
        // - TIMEOUT: 클라이언트만 응답을 못 받았을 뿐 서버는 실제로 끝냈을 가능성이 높다
        //   (2026-08-27 staging 실사용 중 발견 — net::ERR_ABORTED로 실패한 것처럼 보였지만
        //   서버는 이미 웨딩 생성+개인화까지 끝나 있었음). 두 경우 다, 만에 하나 서버가 정말
        //   실패했더라도 셸 라우트 가드(router.tsx의 `if (!context.user.hasWedding) throw
        //   redirect({ to: "/onboarding" })`)가 다음 진입 시 자동으로 /onboarding으로 되돌리므로
        //   영구히 갇히지 않는다.
        // - 그 외(NETWORK_ERROR/BUDGET_EXCEEDED/VALIDATION_ERROR 등)는 서버가 처리하지
        //   않았다고 확신할 수 있는 진짜 실패라 그대로 사용자에게 보여주고 페이지에 머문다.
        const isRecoverable =
          err instanceof ApiError && (err.code === "WEDDING_ALREADY_EXISTS" || err.code === "TIMEOUT");
        if (!isRecoverable) throw err;
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
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (i + 1) as Step).map((dot) => (
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
        {/* `ReviewLabels`의 10개 필드 이름이 `Step9ReviewProps`와 그대로 일치한다 — 그러라고
            만든 객체다(build-review-labels.ts 머리말). 한 줄씩 옮겨 적으면 필드가 늘 때마다
            여기도 같이 고쳐야 하고, 빠뜨려도 타입이 잡아 주기 전까지는 조용하다. */}
        {step === 9 && (
          <Step9Review
            {...reviewLabels}
            isDateDefaulted={isDateDefaulted}
            isBudgetDefaulted={isBudgetDefaulted}
            isGuestCountDefaulted={isGuestCountDefaulted}
            isTasteDefaulted={isTasteDefaulted}
            isGoalsDefaulted={isGoalsDefaulted}
            activeCategoryCount={activeCategoryCount}
            totalCategoryCount={allocationRows.length}
            isAllocationReset={wasAllocationReset}
          />
        )}
        {(step === 7 || step === 8) &&
          (isLoadingCategories ? (
            // D14 L2 — 카테고리 토글/배분 목록 자리. 줄 수를 늘리지 않으려고 조각으로만 둔다.
            <>
              <SkeletonRows count={5} />
              <Loading srOnly />
            </>
          ) : categoriesError === null ? (
            step === 7 ? (
              <Step7CategoryToggle rows={allocationRows} onRowsChange={handleAllocationRowsChange} />
            ) : (
              <Step8Allocation
                rows={allocationRows}
                onRowsChange={handleAllocationRowsChange}
                totalBudgetEstimate={totalBudgetEstimate}
                allocatedBudget={allocatedBudget}
                isOverAllocated={isOverAllocated}
                onTotalBudgetChange={handleTotalBudgetChange}
              />
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
                하나씩 넘기는 것과 달리 여기선 중간 단계를 굳이 보여줄 필요가 없다.
                배분 초과 상태에서 누르면 배분 금액이 0으로 되돌아간다(§ handleSkipToReview). */}
            {step < TOTAL_STEPS && (
              <Button variant="ghost" onClick={handleSkipToReview}>
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
              //
              // 8단계 배분 초과도 같은 이유로 막는다 — 그대로 두면 9단계 "시작하기"에서 400
              // BUDGET_EXCEEDED로 알게 된다. 여기서도 "나중에 설정"은 열려 있지만, 1단계와 달리
              // 그냥 통과시키지 않고 배분 금액을 비운다(§ handleSkipToReview) — 날짜와 달리
              // 초과 배분은 안전하게 기본값 처리할 방법이 없다.
              disabled={(step === 1 && isDateDefaulted) || (step === 8 && isOverAllocated)}
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
