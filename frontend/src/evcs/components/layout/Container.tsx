import type { ReactNode } from "react";
import { cn } from "@evcs/utils/cn";

interface ContainerProps {
  children: ReactNode;
  narrow?: boolean;
  className?: string;
}

export function Container({ children, narrow, className }: ContainerProps) {
  return (
    <div
      className={cn(
        "evcs-container",
        narrow && "evcs-container--narrow",
        className,
      )}
    >
      {children}
    </div>
  );
}
