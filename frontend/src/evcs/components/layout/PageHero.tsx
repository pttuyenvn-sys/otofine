import type { ReactNode } from "react";
import type { PageHeroProps } from "@evcs/types";
import { cn } from "@evcs/utils/cn";

interface PageHeroComponentProps extends PageHeroProps {
  children?: ReactNode;
  actions?: ReactNode;
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
  align = "left",
  variant = "default",
  children,
  actions,
}: PageHeroComponentProps) {
  return (
    <div
      className={cn(
        "evcs-page-hero",
        align === "center" && "evcs-page-hero--center",
        variant === "dark" && "evcs-page-hero--dark",
        variant === "gradient" && "evcs-page-hero--gradient",
      )}
    >
      {variant === "gradient" && <div className="evcs-page-hero__glow" aria-hidden />}
      <div className="evcs-container">
        <div className="evcs-page-hero__content evcs-animate-in">
          {eyebrow && <p className="evcs-eyebrow">{eyebrow}</p>}
          <h1 className="evcs-heading-1 evcs-page-hero__title">{title}</h1>
          {subtitle && <p className="evcs-body-lg">{subtitle}</p>}
          {children}
          {actions && (
            <div className="evcs-page-hero__actions">{actions}</div>
          )}
        </div>
      </div>
    </div>
  );
}
