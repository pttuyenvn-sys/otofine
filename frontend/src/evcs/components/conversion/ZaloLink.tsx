import { SITE } from "@evcs/constants/site";
import { cn } from "@evcs/utils/cn";

interface ZaloLinkProps {
  label?: string;
  className?: string;
}

export function ZaloLink({
  label = "Tư vấn Zalo",
  className,
}: ZaloLinkProps) {
  return (
    <a
      href={SITE.zaloUrl}
      className={cn("evcs-cta evcs-cta--accent", className)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </a>
  );
}
