// 온보딩 — S1, 8단계 위저드. 시각 스펙: docs/mockups/s1-onboarding.html, 필드 계약: 03_API_spec.md
// #6(POST /weddings) · #10(PUT /wedding-categories) · #31(GET /benchmarks/total-average).
//
// 8단계 순서는 최종 프로토타입(docs/wedding/plan/new/12_final_prototype_mockup.html)의
// onbStep1~8 번호와 그대로 맞춘다: 1 역할/날짜 · 2 지역/예산/하객수 · 3 취향(스킵) ·
// 4 목표(스킵) · 5 우선순위 · 6 진행상황 · 7 카테고리 on/off · 8 예산 배분.
//
// **이 컴포넌트는 라우터를 모르지 않는다 — LoginPage.tsx 와 같은 관례.** 콜백 prop(onSuccess) 대신
// `useNavigate` 를 직접 쓴다 — 이 브랜치의 `_authed`/`_shell` 가드·`LoginPage.tsx` 가 이미 이
// 방식이라(§5 인계 문서 §2/§5), 온보딩만 다른 패턴을 쓰면 두 화면이 서로 다른 라우팅 관례를 갖게 된다.
//
// 상태를 하나의 객체 대신 필드별 useState로 쪼갠 이유 — 각 스텝이 자기 필드만 구독하게 하면
// prop 목록이 스텝별 데이터 계약을 그대로 드러낸다(각 Step 컴포넌트의 Props 인터페이스가 실제로
// 그 단계가 무엇을 묻는지 문서 역할을 한다). reducer 하나로 합치면 그 문서화 효과가 사라진다.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { invalidateSession } from "@/entities/session";
import {
  createWedding,
  getCategories,
  getTotalAverageBenchmark,
  putWeddingCategories,
  type DoneSoFarCategory,
  type SdmPriority,
  type TastePreference,
  type TotalAverageBenchmark,
  type UserRole,
  type VenuePriority,
  type WeddingCategoryUpdateInput,
} from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { Button, Card, Page } from "@/shared/ui";
import { GeneratingOverlay } from "./GeneratingOverlay";
import {
  categoriesToAllocationRows,
  Step1RoleDate,
  Step2RegionBudget,
  Step3Taste,
  Step4Goals,
  Step5Priority,
  Step6Progress,
  Step7CategoryToggle,
  Step8Allocation,
  type AllocationRow,
  type UnsurePrecision,
} from "./steps";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
const TOTAL_STEPS = 8;

const STEP_HEADLINE: Record<Step, string> = {
  1: "당신에 대해 알려주세요",
  2: "예산과 규모를 알려주세요",
  3: "어떤 결혼식을 꿈꾸세요?",
  4: "이번 준비에서 가장 바라는 건요?",
  5: "가장 중요하게 생각하는 건요?",
  6: "지금까지 진행한 게 있나요?",
  7: "카테고리를 켜고 꺼볼까요?",
  8: "카테고리별 예산을 나눠볼까요?",
};

const STEP_SUBTITLE: Record<Step, string> = {
  1: "맞춤 체크리스트와 타임라인을 만드는 데 써요.",
  2: "나중에 언제든 바꿀 수 있어요.",
  3: "체크리스트 추천 우선순위에 참고할게요.",
  4: "여러 개 고를 수 있어요.",
  5: "카테고리별로 하나씩 골라주세요.",
  6: "체크한 항목은 타임라인에 완료로 미리 표시해드려요.",
  7: "필요 없는 카테고리는 꺼두면 체크리스트·타임라인에서 제외돼요.",
  8: "총 예산 안에서 자유롭게 배분하세요.",
};

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);

  // 1단계
  const [userRole, setUserRole] = useState<UserRole>("BRIDE");
  const [isDateExact, setIsDateExact] = useState(false);
  const [weddingDate, setWeddingDate] = useState("");
  const [unsurePrecision, setUnsurePrecision] = useState<UnsurePrecision>("APPROX_H1_NEXT_YEAR");

  // 2단계
  const [regionCode, setRegionCode] = useState("SEOUL_GANGNAM");
  const [totalBudget, setTotalBudget] = useState("");
  const [totalBudgetUnsure, setTotalBudgetUnsure] = useState(false);
  const [guestCount, setGuestCount] = useState("");
  const [guestCountUnsure, setGuestCountUnsure] = useState(false);
  const [benchmark, setBenchmark] = useState<TotalAverageBenchmark | null>(null);

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
  const [allocationRows, setAllocationRows] = useState<AllocationRow[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 지역이 바뀔 때마다 참고 벤치마크를 다시 받는다 — 2단계 캡션과 8단계 "미정일 때 참고 총예산"이
  // 같은 값을 쓴다(Step2RegionBudget.tsx 머리말 참조). 실패해도 화면을 막지 않는다.
  useEffect(() => {
    let cancelled = false;
    getTotalAverageBenchmark(regionCode)
      .then((result) => {
        if (!cancelled) setBenchmark(result);
      })
      .catch(() => {
        if (!cancelled) setBenchmark(null);
      });
    return () => {
      cancelled = true;
    };
  }, [regionCode]);

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((result) => {
        if (!cancelled) {
          setAllocationRows(categoriesToAllocationRows(result.categories));
          setIsLoadingCategories(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingCategories(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const parsedTotalBudget = totalBudget === "" ? 0 : Number(totalBudget);
  // 8단계 진행률 바의 분모 — 예산을 확정했으면 그 값, 미정이면 참고 벤치마크 중앙값으로 어림한다.
  // 실제 저장값은 이 추정치가 아니라 `total_budget_unsure` 플래그로 서버가 다시 계산한다
  // (03_API_spec.md #6 규칙 4) — 여기서는 사용자가 배분 감을 잡게 하는 화면 전용 추정치일 뿐이다.
  const totalBudgetEstimate = totalBudgetUnsure ? (benchmark?.median_price ?? 0) : parsedTotalBudget;

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      // 응답의 웨딩 id는 쓰지 않는다 — wedding_id는 URL/바디로 받지 않고 세션에서 서버가 유도한다
      // (03_API_spec.md:126) — PUT /wedding-categories 도 같은 세션 쿠키로 대상 웨딩을 찾는다.
      await createWedding({
        user_role: userRole,
        wedding_date: isDateExact ? weddingDate : undefined,
        wedding_date_precision: isDateExact ? "EXACT" : unsurePrecision,
        total_budget: totalBudgetUnsure ? undefined : parsedTotalBudget,
        total_budget_unsure: totalBudgetUnsure,
        region_code: regionCode,
        guest_count: guestCountUnsure ? undefined : Number(guestCount),
        guest_count_unsure: guestCountUnsure,
        taste_preference: tastePreference ?? undefined,
        venue_priority: venuePriority ?? undefined,
        sdm_priority: sdmPriority ?? undefined,
        primary_goals: goals.length > 0 ? goals : undefined,
        done_so_far: doneSoFar,
      });

      const categoryUpdates: WeddingCategoryUpdateInput[] = allocationRows.map((row) => ({
        category_code: row.categoryCode,
        is_active: row.isActive,
        planned_budget: row.isActive ? row.plannedBudget : 0,
        display_order: row.displayOrder,
        selected_options: row.isActive ? row.selectedOptions : null,
        ...(row.isActive ? {} : { skip_reason: "온보딩에서 사용 안 함으로 표시" }),
      }));
      await putWeddingCategories(categoryUpdates);

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

  return (
    <Page title={STEP_HEADLINE[step]} subtitle={STEP_SUBTITLE[step]} width="max-w-[430px]">
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
        {(step === 7 || step === 8) &&
          (isLoadingCategories ? (
            <p className="text-sm text-ink-soft">불러오는 중…</p>
          ) : step === 7 ? (
            <Step7CategoryToggle rows={allocationRows} onRowsChange={setAllocationRows} />
          ) : (
            <Step8Allocation rows={allocationRows} onRowsChange={setAllocationRows} totalBudgetEstimate={totalBudgetEstimate} />
          ))}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <Button variant="ghost" onClick={() => setStep((current) => (current - 1) as Step)}>
                ← 이전
              </Button>
            )}
            {/* 목업(12_final_prototype_mockup.html onbStep3/onbStep4)의 스킵 타깃 — 둘 다 6단계
                (진행상황)로 간다. 취향(3)을 건너뛰면 목표(4)·우선순위(5)까지 함께 건너뛰고,
                목표(4) 자체를 건너뛰면 우선순위(5)만 건너뛴다 — 우연히 같은 목적지가 된다. */}
            {(step === 3 || step === 4) && (
              <Button variant="ghost" onClick={() => setStep(6)}>
                나중에 설정
              </Button>
            )}
          </div>
          {step < TOTAL_STEPS ? (
            <Button onClick={() => setStep((current) => (current + 1) as Step)}>다음</Button>
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
