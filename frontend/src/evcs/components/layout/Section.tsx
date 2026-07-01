import type { ReactNode } from "react";
import { cn } from "@evcs/utils/cn";

interface SectionProps {
  children: ReactNode;
  muted?: boolean;
  sm?: boolean;
  className?: string;
  id?: string;
}

export function Section({
  children,
  muted,
  sm,
  className,
  id,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "evcs-section",
        sm && "evcs-section--sm",
        muted && "evcs-section--muted",
        className,
      )}
    >
      {children}
    </section>
  );
}
