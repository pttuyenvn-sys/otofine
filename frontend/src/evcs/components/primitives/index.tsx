import type { ReactNode } from "react";
import { cn } from "@evcs/utils/cn";

type LogoSize = "sm" | "md" | "lg";

interface LogoProps {
  size?: LogoSize;
  showWordmark?: boolean;
  className?: string;
}

const sizeMap: Record<LogoSize, { mark: string; text: string }> = {
  sm: { mark: "evcs-logo--sm", text: "evcs-logo__wordmark--sm" },
  md: { mark: "", text: "" },
  lg: { mark: "evcs-logo--lg", text: "evcs-logo__wordmark--lg" },
};

/**
 * EVCS brand mark — Design System primitive (không dùng asset Marketplace).
 */
export function Logo({ size = "md", showWordmark = true, className }: LogoProps) {
  const s = sizeMap[size];
  return (
    <span className={cn("evcs-logo", className)} aria-label="EVCS">
      <svg
        className={cn("evcs-logo__mark", s.mark)}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <rect width="40" height="40" rx="10" className="evcs-logo__bg" />
        <path
          d="M12 26V14h4.2l3.8 6.2L23.8 14H28v12h-3.6v-7.1L20.6 26h-2.8l-3.8-7.1V26H12z"
          className="evcs-logo__glyph"
        />
        <circle cx="30" cy="12" r="3" className="evcs-logo__dot" />
      </svg>
      {showWordmark && (
        <span className={cn("evcs-logo__wordmark", s.text)}>EVCS</span>
      )}
    </span>
  );
}

interface TextProps {
  as?: "p" | "span" | "div";
  variant?: "body" | "body-lg" | "caption" | "eyebrow";
  children: ReactNode;
  className?: string;
}

export function Text({
  as: Tag = "p",
  variant = "body",
  children,
  className,
}: TextProps) {
  const variantClass = {
    body: "evcs-body",
    "body-lg": "evcs-body-lg",
    caption: "evcs-caption",
    eyebrow: "evcs-eyebrow",
  }[variant];
  return <Tag className={cn(variantClass, className)}>{children}</Tag>;
}

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "accent" | "outline";
  className?: string;
}

export function Badge({
  children,
  variant = "default",
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "evcs-badge",
        variant === "accent" && "evcs-badge--accent",
        variant === "outline" && "evcs-badge--outline",
        className,
      )}
    >
      {children}
    </span>
  );
}

interface CardProps {
  children: ReactNode;
  glass?: boolean;
  className?: string;
}

export function Card({ children, glass, className }: CardProps) {
  return (
    <div
      className={cn("evcs-card", glass && "evcs-card--glass", className)}
    >
      {children}
    </div>
  );
}

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "accent" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
  type?: "button" | "submit";
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  className,
  type = "button",
}: ButtonProps) {
  const classes = cn(
    "evcs-btn",
    variant === "primary" && "evcs-btn--primary",
    variant === "accent" && "evcs-btn--accent",
    variant === "outline" && "evcs-btn--outline",
    variant === "ghost" && "evcs-btn--ghost",
    size === "lg" && "evcs-btn--lg",
    size === "sm" && "evcs-btn--sm",
    className,
  );

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} className={classes}>
      {children}
    </button>
  );
}
