import type { CtaVariant } from "@evcs/types";
import { CTA_DEFINITIONS } from "@evcs/constants/cta";
import { cn } from "@evcs/utils/cn";

interface CtaButtonProps {
  variant: CtaVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function resolveStyle(variant: CtaVariant): string {
  switch (variant) {
    case "plan":
    case "quote":
      return "evcs-cta--primary";
    case "consult":
      return "evcs-cta--accent";
    case "survey":
      return "evcs-cta--outline";
    case "hotline":
      return "evcs-cta--hotline";
    default:
      return "evcs-cta--primary";
  }
}

export function CtaButton({
  variant,
  size = "md",
  className,
}: CtaButtonProps) {
  const def = CTA_DEFINITIONS[variant];
  const isExternal = def.href.startsWith("http");

  return (
    <a
      href={def.href}
      className={cn(
        "evcs-cta",
        resolveStyle(variant),
        size === "lg" && "evcs-cta--lg",
        className,
      )}
      title={def.description}
      {...(isExternal
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      {def.label}
    </a>
  );
}
