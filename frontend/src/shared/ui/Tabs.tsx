// 탭 — Base UI 래퍼 (ADR 0004).
//
// compound 를 유지하는 이유(디자인 패턴 규약): 슬롯이 3개 이상이면 props API 로 접지 않는다.
// Root/List/Tab/Panel 을 그대로 노출해야 패널 내용과 탭 라벨을 호출부가 자유롭게 구성할 수 있다.
//
// Base UI 가 담당하는 것: role="tablist"/"tab"/"tabpanel", aria-selected·aria-controls 동기화,
// 로빙 tabindex, 화살표 키 순환. 손으로 만들면 조용히 틀리는 영역이라 외부화했다.
//
// 활성 상태를 색으로만 알리지 않는다 — 굵기와 하단 보더를 함께 바꾼다(WCAG 1.4.1 「색만으로 전달 금지」).
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

export interface TabsRootProps {
  /** 선택된 탭 값. 미지정이면 defaultValue 로 비제어 동작. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

function Root({ value, defaultValue, onValueChange, children, className }: TabsRootProps) {
  return (
    <BaseTabs.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next: string) => onValueChange?.(next)}
      className={className ? `flex flex-col gap-4 ${className}` : "flex flex-col gap-4"}
    >
      {children}
    </BaseTabs.Root>
  );
}

// 활성화는 **수동**이다 — 화살표 키는 포커스만 옮기고 Enter/Space 가 선택한다.
// Base UI 의 activateOnFocus 기본값(false)을 그대로 둔 것이다. 패널이 데이터를 불러오는 탭에서
// 화살표로 훑을 때마다 자동 활성화되면 지나치는 탭마다 요청이 나간다 —
// WAI-ARIA 도 패널이 비싼 경우 수동 활성화를 권한다.
// 값이 싼 탭 그룹이 생겨 자동 활성화가 필요해지면 그때 activateOnFocus 를 prop 으로 연다.
function List({ children, label }: { children: ReactNode; label: string }) {
  return (
    <BaseTabs.List aria-label={label} className="flex border-b border-line">
      {children}
    </BaseTabs.List>
  );
}

const TAB =
  "min-h-tap cursor-pointer border-b-2 border-transparent px-4 text-sm font-bold text-ink-soft " +
  "transition-[color,border-color] duration-150 hover:text-ink " +
  "data-[active]:border-primary data-[active]:text-primary";

function Tab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <BaseTabs.Tab value={value} className={TAB}>
      {children}
    </BaseTabs.Tab>
  );
}

function Panel({ value, children }: { value: string; children: ReactNode }) {
  return <BaseTabs.Panel value={value}>{children}</BaseTabs.Panel>;
}

export const Tabs = { Root, List, Tab, Panel };
