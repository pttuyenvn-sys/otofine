import { SITE } from "@evcs/constants/site";
import { cn } from "@evcs/utils/cn";

interface HotlineLinkProps {
  className?: string;
  showIcon?: boolean;
}

export function HotlineLink({ className, showIcon }: HotlineLinkProps) {
  return (
    <a
      href={`tel:${SITE.hotline}`}
      className={cn(
        !className?.includes("evcs-header") && "evcs-cta evcs-cta--hotline",
        className,
      )}
      title={`Gọi hotline ${SITE.hotlineDisplay}`}
    >
      {showIcon && (
        <span className="evcs-hotline-icon" aria-hidden>
          ☎
        </span>
      )}
      {SITE.hotlineDisplay}
    </a>
  );
}
