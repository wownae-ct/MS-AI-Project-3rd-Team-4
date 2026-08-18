// 공용 배너 — 필수 4용처(README): Wake Lock 실패(§5.3) · 코칭 기본값/비활성(§4.5.1 — 조용한 비활성화 금지)
// · 수동 재연결(「백오프」) · 각종 안내. danger는 role="alert"(즉시 낭독), 그 외 role="status".
import type { ReactNode } from "react";
import { IconCheck, IconWarning } from "./icons";

export type BannerVariant = "info" | "warning" | "danger" | "success";

export interface BannerProps {
  variant: BannerVariant;
  children: ReactNode;
  /** 행동 버튼 슬롯 (예: 수동 재연결) */
  action?: ReactNode;
}

export function Banner({ variant, children, action }: BannerProps) {
  return (
    <div className={`banner banner--${variant}`} role={variant === "danger" ? "alert" : "status"}>
      <span className="banner__icon">{variant === "success" ? <IconCheck /> : <IconWarning />}</span>
      <span className="banner__body">
        <span>{children}</span>
        {action}
      </span>
    </div>
  );
}
