// 스타일가이드 문서용 조각. 이 슬라이스 안에서만 쓴다 — shared/ui 로 올리지 않는다.
// 제품 화면이 쓰는 프리미티브가 아니라 "디자인 시스템을 설명하는 장치"라서 성격이 다르다.
import type { ReactNode } from "react";
import { IconInfo } from "@/shared/ui";

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {hint !== undefined && <p className="text-sm text-ink-soft">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** 확정된 규범 — 문서를 따로 열지 않아도 보이게 화면에 남긴다. */
export function Rule({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-sm border border-line bg-surface p-3 text-base text-ink">
      <span className="mt-1 shrink-0 text-primary">
        <IconInfo size={16} />
      </span>
      <span>{children}</span>
    </p>
  );
}

/** 아직 확정되지 않은 결정. 디자인 오너가 화면에서 보고 판단하도록 눈에 띄게 표시한다. */
export function OpenDecision({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-sm border border-primary bg-primary-soft p-3 text-base text-ink">
      <span className="shrink-0 font-bold text-primary">열린 결정</span>
      <span>{children}</span>
    </p>
  );
}
