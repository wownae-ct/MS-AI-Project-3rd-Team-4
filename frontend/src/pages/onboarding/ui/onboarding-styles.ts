// 온보딩 6단계가 공유하는 선택 위젯 클래스 — 목업(s1-onboarding.html)의 choice-card/chip/
// mode-toggle-track을 Tailwind로 옮긴 것. LoginPage.tsx의 INPUT/LABEL과 같은 이유로 파일마다
// 반복하지 않고 여기 한 곳에 모은다. Tailwind는 소스를 평문으로 스캔하므로 완성된 리터럴만 쓴다
// (Card.tsx 머리말과 동일 근거) — 조건부로 조립하지 않고 항상 두 문자열 중 하나를 그대로 고른다.

export const FIELD_LABEL = "flex flex-col gap-1.5 text-sm font-bold text-ink";

export const CHOICE_GRID = "grid grid-cols-2 gap-2.5";

export const CHOICE_CARD_BASE =
  "flex flex-col gap-0.5 rounded-md border border-line bg-surface p-3.5 text-left transition-colors duration-150";
export const CHOICE_CARD_SELECTED = `${CHOICE_CARD_BASE} border-primary bg-primary-soft`;
export const CHOICE_CARD_TITLE = "text-sm font-bold text-ink";
export const CHOICE_CARD_TITLE_SELECTED = "text-sm font-bold text-primary";
export const CHOICE_CARD_SUB = "text-xs text-ink-soft";

export const CHIP_GROUP = "flex flex-wrap gap-2";
// 2026-08-26 사용자 피드백: MODE_TOGGLE_*와 같은 이유로 rounded-pill이 과했다 — rounded-md로
// 낮춘다. Step1(날짜 미정 칩)뿐 아니라 Step4Goals·Step5Priority도 이 토큰을 그대로 쓴다 —
// 화면별로 따로 낮추면 온보딩 안에서 캡슐/각진 모양이 섞여 더 어색해진다.
export const CHIP_BASE =
  "cursor-pointer rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-bold text-ink-soft " +
  "transition-colors duration-150";
export const CHIP_SELECTED = "cursor-pointer rounded-md border border-primary bg-primary px-3.5 py-2 text-sm font-bold text-surface";

// 7단계(카테고리 on/off)의 하위 옵션 칩용 축소판 — 목업의 `.chip.sm`(12_final_prototype_mockup.html:59)
// 대응. 일반 칩과 같은 그룹(`CHIP_GROUP`) 안에 쓰지만 한 단계 작게 눌러 "카테고리 자체보다 부속
// 옵션"이라는 위계를 준다.
export const CHIP_SM_BASE =
  "cursor-pointer rounded-pill border border-line bg-surface px-2.5 py-1 text-xs font-bold text-ink-soft " +
  "transition-colors duration-150";
export const CHIP_SM_SELECTED = "cursor-pointer rounded-pill border border-primary bg-primary px-2.5 py-1 text-xs font-bold text-surface";

// 2026-08-26 사용자 피드백: 캡슐형(rounded-pill)이 이 토글엔 과했다 — 같은 필드의 날짜 <input>이
// 이미 rounded-md라, 토글도 같은 단계로 낮춰 형태 스케일을 맞춘다.
export const MODE_TOGGLE_TRACK = "flex gap-0.5 rounded-md border border-line bg-surface p-[3px]";
export const MODE_TOGGLE_LABEL = "flex-1 rounded-sm py-2 text-center text-sm font-bold text-ink-soft transition-colors duration-150";
export const MODE_TOGGLE_LABEL_ACTIVE = "flex-1 rounded-sm bg-primary py-2 text-center text-sm font-bold text-surface";

export const INPUT =
  "min-h-tap w-full rounded-md border border-line bg-surface px-3 text-base text-ink " +
  "placeholder:text-ink-soft focus-visible:border-primary";

// 비활성 입력칸 — "미정" 토글을 켠 필드가 사라지지 않고 자리에 남을 때 쓴다(2026-08-28).
// `disabled:opacity-50`·`disabled:cursor-not-allowed`는 이 저장소가 이미 버튼/입력에 쓰는 조합이라
// (Button.tsx · ChatPanel.tsx) 새 토큰을 늘리지 않는다. 조건부로 조립하지 않고 완성된 문자열
// 두 개 중 하나를 그대로 고르는 이 파일의 규범을 따른다.
export const INPUT_DISABLED = `${INPUT} disabled:cursor-not-allowed disabled:opacity-50`;

export const SELECT = INPUT;

// 9단계(자유 서술) 전용 — INPUT은 min-h-tap(한 줄 높이) 고정이라 여러 줄 입력엔 안 맞는다.
// resize-none — 카드 폭이 이미 max-w-[430px]로 고정된 화면이라 가로 리사이즈 핸들이 레이아웃을
// 깰 수 있다(다른 온보딩 필드 어디에도 리사이즈 가능한 입력이 없다 — 일관성 유지).
export const TEXTAREA =
  "min-h-24 w-full resize-none rounded-md border border-line bg-surface px-3 py-2.5 text-base text-ink " +
  "placeholder:text-ink-soft focus-visible:border-primary";

// 기울임체 유틸리티는 이 저장소의 bare 후보 화이트리스트(ghost-candidates.test.mjs)에 없는
// 새 토큰이라 뺐다 — 이 화면 하나 때문에 게이트를 넓히지 않는다. 위계는 이미 text-xs+text-ink-soft
// 로 충분히 낮다(본문 대비 톤 다운).
// ⚠️ 이 주석에도 그 유틸리티 이름을 평문으로 적지 않는다 — Tailwind 스캐너는 클래스 속성이 아니라
// 파일 전체를 평문으로 훑으므로, 주석 속 단어 하나가 그대로 산출 CSS 후보가 된다(바로 이 파일이
// 겪은 사고 — 최초 수정 커밋이 설명 주석에 그 단어를 그대로 썼다가 이 게이트에 다시 잡혔다).
export const FIELD_NOTE = "text-xs text-ink-soft";

// [2026-08-29 D19] `FIELD_NOTE_KEEP` 을 삭제했다.
//
// 그 상수는 어절 단위 줄바꿈을 이 문구들에 **다시 걸어 주는 우회책**이었고, 존재 사유가 자기
// 주석에 적혀 있었다 — *"그 규칙은 요소 선택자 기반이라 <div> 안의 <p>인 이 문구들은 상속받지
// 못해서 유틸리티로 다시 건다."* D19 가 `styles.css` 의 조판 규칙을 `body` 로 올려 문서 전체가
// 상속하게 만들었으므로 **이제 필요가 없다.** 호출부는 `FIELD_NOTE` 를 그대로 쓰면 된다.
// (같은 이유로 `ChecklistItemRow.tsx` 의 `break-words` 손패치도 함께 지웠다.)
