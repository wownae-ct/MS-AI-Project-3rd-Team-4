// 드롭다운 — 네이티브 `<select>` 를 대체한다 (D22).
//
// ## 왜 대체하나
//
// 1차 개정(2026-08-29)은 네이티브를 **감싸기만** 했다. 닫힌 상자는 앱 토큰으로 그리고 진짜
// `<select>` 를 그 위에 투명하게 덮는 방식이었는데, 사용자 리포트가 그 방식의 한계를 정확히
// 짚었다 — *"드롭다운을 클릭했을 때 열린 목록의 UI와 닫혀 있을 때 UI가 아주 다르다. 이질적이다."*
//
// 열린 목록은 **브라우저와 OS가 그린다.** 모서리·행 높이·하이라이트 색·그림자에 CSS가 닿지
// 않는다. 닫힌 상자를 앱 스타일로 맞출수록 그 대비는 오히려 커진다. 게다가 1차 개정의
// `compact` 변이는 닫힌 라벨이 14px 인데 안쪽 컨트롤이 16px 라, **열린 목록이 닫힌 라벨보다
// 큰 글자**로 떴다.
//
// 그래서 목록까지 우리가 그린다. `NumberInput`(`type="number"`) · `DateField`(D20, `type="date"`)
// 가 같은 이유로 먼저 지나간 길이고, 이 파일도 같은 규칙을 따른다 — **네이티브가 주던 것을
// 파리티 표로 하나씩 갚는다**(decisions.md D22).
//
// ## 검토하고 기각한 것 — Base UI `Select`
//
// 실측했다(스파이크 빌드): `style-guide` 청크가 9.9 kB → **44.08 kB gzip**. 앱 전체 JS 가
// 178 kB 인데 그 19% 다. 게다가 호출부 11곳에 쓰면 공유 청크로 묶여 `modulepreload` 로 초기
// 경로에 얹힌다 — 이 저장소가 이미 두 번 기록한 함정이다(게이트 주석의 `shared/api/client`).
// D20 이 "캘린더를 Popover 로 띄우지 않는다 — floating 위치 계산이 초기 경로에 얹힌다"고 적은
// 것과 같은 판단이다. 위치 계산 없이 **트리거에 붙여 펼친다.**
//
// ## 글자가 한 줄에 안 들어갈 때 — 「고르는 자리에서는 감추지 않는다」
//
//   팝업 폭    트리거 폭이 **하한**이고(`min-w-full`) 내용에 맞춰 늘어나되(`w-max`) 화면 폭으로
//              클램프한다. 네이티브가 이미 이렇게 동작하므로 사용자가 아는 거동이다.
//   넘치면     **말줄임이 아니라 어절 단위 줄바꿈.** 팝업은 결정하는 자리다 — 「청첩장·답…」으로
//              자르면 고를 수가 없다. D19 가 `body` 에 건 조판 규칙을 그대로 상속하므로 여기
//              추가할 유틸리티가 없고, 행 높이는 `min-h-tap` 이 하한이라 필요한 만큼만 늘어난다.
//   트리거     **한 줄 + 말줄임을 유지한다.** 값에 따라 행 높이가 출렁이면 체크리스트 목록과
//              카드 제목 행이 통째로 들썩인다. 여기서 줄여도 정보는 사라지지 않는다 — 전체
//              텍스트는 팝업과 접근명이 갖고 있다.
//   방향       `align` 으로 **호출부가 정한다.** 오른쪽 끝에 붙는 트리거(카드 제목 행의 필터)만
//              `end` 다. 충돌 감지를 런타임에 하지 않으므로 초기 경로에 아무것도 얹지 않는다.
//
// ## 접근성 — APG 「Select-Only Combobox」
//
// 포커스는 **트리거에 머문다.** 활성 항목은 `aria-activedescendant` 로 가리킨다 — 포커스를
// 목록으로 옮기는 변형보다 단순하고, 포커스 트랩이 필요 없다.
// 선택 표시는 색만으로 하지 않는다 — `IconCheck` 를 함께 붙인다(`Tabs.tsx` 가 같은 이유로
// 활성 탭을 보더 유무로 가른다, WCAG 1.4.1).
//
// ⚠️ **iOS 16px 계약이 이 컴포넌트에서는 적용 대상이 아니다.** 트리거가 `<button>` 이라 텍스트
// 입력 포커스가 아니고, iOS Safari 의 자동 확대 조건에 애초에 걸리지 않는다(a11y.md §2.5 는
// 「입력 필드」에 대한 규범이다). 그래서 `compact` 는 14px 를 **그대로** 쓴다 — 1차 개정이
// 두 값을 갈라야 했던 이유가 사라졌다.
//
// ⚠️ **팝업은 포털을 쓰지 않는다.** 조상에 `overflow-hidden` 이 있으면 잘린다. 현재 호출부
// 11곳 중 그런 조상을 가진 곳은 없다(`Card` 의 `@container` 는 `contain: size layout style` 이라
// paint 를 가두지 않는다 — 잘리지 않는다). 새 호출부를 `DisclosurePanel` 안에 두려면 그때
// 포털을 검토한다.
//
// ⚠️ 크기 변이 이름을 진짜 Tailwind 유틸리티와 같은 단어로 짓지 않는다 — 스캐너는 소스를
// 평문으로 훑어 변이 **값**의 이름 하나를 그대로 산출 CSS 로 만든다(`Badge` 의 `outline` 변이가
// 그렇게 게이트 화이트리스트에 등재돼 있다). 그래서 `field`/`compact` 다.
//
// ## 끄는 린트 규칙 3종 — 전부 같은 전제에서 나온다
//
// `jsx-a11y` 의 세 규칙은 **"네이티브 `<select>` 를 쓰라"** 는 하나의 전제를 공유한다. 그 전제를
// 뒤집은 것이 이 파일의 존재 이유이고, 규칙들이 실제로 막으려는 위험은 여기 없다.
//
//   prefer-tag-over-role        네이티브를 쓰라는 규칙이다. 쓸 수 없어서 만든 파일이다.
//                               ⚠️ **파일 단위로 끈다** — 이 규칙은 `role=` **속성 줄**에 보고돼
//                               요소 앞의 `disable-next-line` 이 닿지 않는다(실측).
//                               a11y.md §4 가 `role="img"` 에 대해 "구현 시 걸리는지 확인한다"고
//                               남겨 둔 그 규칙이며, 여기서 실제로 걸린다는 것이 확인됐다.
//   interactive-supports-focus  APG 「Select-Only Combobox」는 **포커스를 트리거에 남기고** 활성
//                               항목을 `aria-activedescendant` 로 가리킨다. 목록과 항목이 포커스를
//                               받지 않는 것이 이 패턴의 정의다(포커스를 옮기는 쪽은 별개 패턴).
//   click-events-have-key-events 키보드 조작은 트리거의 `onKeyDown` 이 전부 맡는다. 항목에 핸들러를
//                               또 달면 같은 일을 두 곳에서 하게 된다.
//
// 뒤 둘은 해당 요소 앞에서만 끈다 — 파일 전체로 넓히면 진짜 위험을 놓친다.
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { IconCheck, IconChevronDown } from "./icons";

// ⚠️ 완성된 리터럴만 쓴다 — 조각을 이어 붙이면 스캐너가 못 찾고 빌드는 성공한 채 스타일만
// 사라진다(`Card.tsx` 의 TITLE 짝과 같은 처리).
// 폭(`w-full`/`w-fit`/auto)은 호출부마다 달라 여기 넣지 않고 `className` 으로 받는다.
const TRIGGER_FIELD =
  "flex min-h-tap cursor-pointer items-center justify-between gap-1 rounded-md border border-line bg-surface px-2.5 text-base text-ink";
const TRIGGER_COMPACT =
  "flex min-h-tap cursor-pointer items-center justify-between gap-1 rounded-md border border-line bg-surface px-2 text-sm text-ink";

// `w-max` + `min-w-full` 이 「트리거 폭이 하한, 내용까지 늘어남」을 만든다. 클램프는
// `ConfirmDialog`·`ChatHistoryDrawer` 가 쓰는 `min(고정, 화면-여백)` 관례 그대로다.
// z-10 — 본문 위, 셸 고정바(z-20) 아래. 스킵 링크와 같은 층이다.
// 그림자를 쓰지 않는다(D10) — 표면 구분은 1px 헤어라인 보더로만.
const POPUP_START =
  "absolute top-full left-0 z-10 mt-1 flex max-h-64 w-max min-w-full max-w-[min(18rem,calc(100vw-2rem))] " +
  "flex-col overflow-y-auto rounded-md border border-line bg-surface p-1";
const POPUP_END =
  "absolute top-full right-0 z-10 mt-1 flex max-h-64 w-max min-w-full max-w-[min(18rem,calc(100vw-2rem))] " +
  "flex-col overflow-y-auto rounded-md border border-line bg-surface p-1";

// 네 리터럴 — 「선택됨」과 「활성(키보드/포인터가 지금 가리키는 항목)」은 **다른 축**이다.
// 선택됨은 `MessageBubble` 의 평가 버튼과 같은 조합(primary-soft + primary), 활성은 배경 톤만.
// ⚠️ `truncate` 를 쓰지 않는다 — 여기가 「감추지 않는 자리」다. 넘치면 어절 단위로 접힌다(D19).
const ITEM = "flex min-h-tap cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ink";
const ITEM_ACTIVE = "flex min-h-tap cursor-pointer items-center gap-2 rounded-sm bg-bg px-2 py-1.5 text-left text-ink";
const ITEM_SELECTED =
  "flex min-h-tap cursor-pointer items-center gap-2 rounded-sm bg-primary-soft px-2 py-1.5 text-left font-bold text-primary";
const ITEM_SELECTED_ACTIVE =
  "flex min-h-tap cursor-pointer items-center gap-2 rounded-sm bg-primary-soft px-2 py-1.5 text-left font-bold text-primary outline-1 outline-primary";

/** 선택 표시는 색만으로 하지 않는다(WCAG 1.4.1) — 자리는 항상 차지하고 선택된 행에서만 보인다. */
const CHECK_SLOT = "flex-none text-primary";
const CHECK_SLOT_EMPTY = "flex-none opacity-0";

/** 타이핑 점프의 버퍼 유효 시간. 네이티브 select 의 감각을 옮긴 값이다. */
const TYPEAHEAD_RESET_MS = 800;

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onValueChange: (next: string) => void;
  options: readonly SelectOption[];
  /**
   * `field`(기본) 16px — 전용 입력 폼 안. 형제 `<input>` 이 16px 라 맞춘다.
   * `compact` 14px — 콘텐츠 안에 놓이는 컨트롤(체크리스트 행의 상태, 카드 제목 옆 필터, 캘린더 헤더).
   */
  size?: "field" | "compact";
  /**
   * 팝업이 넓어질 때 늘어나는 방향. 기본 `start`(왼쪽 정렬).
   * **오른쪽 끝에 붙는 트리거만 `end`** — 그러지 않으면 넓어진 팝업이 화면 밖으로 나간다.
   */
  align?: "start" | "end";
  /** 폭만 지정한다(`w-full` · `w-fit`). 크기·색·모양은 이 컴포넌트가 소유한다. */
  className?: string;
  /**
   * 보이는 라벨이 있는 자리는 `<label htmlFor>` 로 잇는다 — `<button>` 은 labelable 요소라
   * 네이티브 `<select>` 때와 배선이 같다(라벨 클릭이 컨트롤을 연다는 거동까지 그대로다).
   */
  id?: string;
  /** 보이는 라벨이 **없는** 자리에서만 쓴다. `id` 와 함께 주지 않는다 — 이름이 이중으로 낭독된다. */
  "aria-label"?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  size,
  align,
  className,
  id,
  "aria-label": ariaLabel,
}: SelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef({ buffer: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedIndex = options.findIndex((option) => option.value === value);
  // 값에 대응하는 옵션이 없으면 원값을 그대로 보인다 — 빈 칸을 그리느니 무엇이 들어 있는지 보인다.
  // (`""` 는 「전체 카테고리」·「카테고리 무관」처럼 **실재하는 옵션**이라 여기서 걸리지 않는다.)
  const selectedLabel = selectedIndex === -1 ? value : options[selectedIndex].label;
  const optionId = (index: number) => `${listId}-${index}`;

  // 바깥을 누르면 닫는다. `pointerdown` 이라 클릭이 완성되기 전에 닫혀, 뒤에 있던 요소가
  // 같은 제스처로 눌리는 일이 없다.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // 활성 항목을 보이는 범위로 끌어온다 — 연도 16개처럼 `max-h` 를 넘는 목록에서 필요하다.
  // jsdom 에는 `scrollIntoView` 가 없어 선택 호출로 둔다(테스트가 이 줄 때문에 깨지지 않는다).
  useEffect(() => {
    if (!open) return;
    const element = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    (element as HTMLElement | null)?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex]);

  function openAt(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (option !== undefined && option.value !== value) onValueChange(option.value);
    setOpen(false);
  }

  /** 타이핑 점프. 버퍼가 살아 있는 동안 이어 붙여 `startsWith` 로 찾는다. */
  function typeahead(key: string) {
    const now = Date.now();
    const previous = typeaheadRef.current;
    const buffer = now - previous.at > TYPEAHEAD_RESET_MS ? key : previous.buffer + key;
    typeaheadRef.current = { buffer, at: now };
    const found = options.findIndex((option) => option.label.toLowerCase().startsWith(buffer.toLowerCase()));
    if (found === -1) return;
    if (open) setActiveIndex(found);
    else commit(found);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1;
    const from = selectedIndex === -1 ? 0 : selectedIndex;

    if (!open) {
      // 닫힌 상태의 ↑↓·Enter·Space·Home·End 는 전부 「연다」 — 네이티브와 같다.
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openAt(from);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        openAt(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        openAt(last);
        return;
      }
      // 닫힌 채로 글자를 치면 네이티브는 **열지 않고 값만 바꾼다.** 그 거동을 옮긴다.
      if (event.key.length === 1) typeahead(event.key);
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex(activeIndex >= last ? last : activeIndex + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex(activeIndex <= 0 ? 0 : activeIndex - 1);
        return;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(last);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(activeIndex);
        return;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        return;
      case "Tab":
        // APG — Tab 은 활성 항목을 확정하고 포커스를 넘긴다. `preventDefault` 하지 않는다.
        commit(activeIndex);
        return;
      default:
        if (event.key.length === 1) typeahead(event.key);
    }
  }

  const trigger = size === "compact" ? TRIGGER_COMPACT : TRIGGER_FIELD;

  return (
    <span ref={rootRef} className="relative flex">
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        aria-label={ariaLabel}
        className={className === undefined ? trigger : `${trigger} ${className}`}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex === -1 ? 0 : selectedIndex))}
        onKeyDown={handleKeyDown}
      >
        {/* 트리거는 한 줄 + 말줄임 — 값에 따라 행 높이가 출렁이지 않게 한다(머리말 §글자가 한 줄에).
            `min-w-0` 이 없으면 flex 아이템의 자동 최소 크기가 내용 폭이라 애초에 줄지 않는다
            (`ChatPanel` 의 입력 행이 같은 이유로 잘렸던 그 규칙이다). */}
        <span className="min-w-0 truncate">{selectedLabel}</span>
        {/* 장식이다 — 뜻은 `role="combobox"` 와 `aria-expanded` 가 전달한다.
            D18 — 「▾」 같은 문자 글리프를 쓰지 않는다(Wanted Sans 조각에 없어 OS 폰트로 폴백한다). */}
        <IconChevronDown size={16} className="flex-none text-ink-soft" />
      </button>
      {open && (
        // eslint-disable-next-line jsx-a11y/interactive-supports-focus
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={align === "end" ? POPUP_END : POPUP_START}
          // 포커스는 트리거에 머물러야 한다(APG select-only). 목록을 눌러도 트리거가 포커스를
          // 잃지 않도록 기본 동작을 막는다 — 이게 없으면 누르는 순간 포커스가 body 로 떨어진다.
          // ⚠️ 이 주석에 그 이벤트의 영어 이름을 평문으로 적지 않는다 — 그 단어는 진짜 Tailwind
          // 유틸리티(흐림 필터)라 스캐너가 후보로 삼고 `ghost-candidates.test.mjs` 가 잡는다.
          // 실제로 이 줄의 첫 판이 그렇게 걸렸다.
          onMouseDown={(event) => event.preventDefault()}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              // eslint-disable-next-line jsx-a11y/interactive-supports-focus, jsx-a11y/click-events-have-key-events
              <div
                key={option.value}
                id={optionId(index)}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                className={
                  isSelected
                    ? isActive
                      ? ITEM_SELECTED_ACTIVE
                      : ITEM_SELECTED
                    : isActive
                      ? ITEM_ACTIVE
                      : ITEM
                }
                onClick={() => commit(index)}
                onMouseMove={() => setActiveIndex(index)}
              >
                <span className={isSelected ? CHECK_SLOT : CHECK_SLOT_EMPTY}>
                  <IconCheck size={14} />
                </span>
                {option.label}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
