import type { CtaVariant } from "@evcs/types";
import { CTA_DEFINITIONS } from "@evcs/constants/cta";
import { CtaButton } from "@evcs/components/conversion/CtaButton";

const SHOWCASE_VARIANTS: CtaVariant[] = [
  "quote",
  "consult",
  "survey",
  "hotline",
];

/**
 * Showcase all 4 CTA variants — mock data only, Sprint 01.
 */
export function CtaShowcase() {
  return (
    <div className="evcs-cta-showcase">
      {SHOWCASE_VARIANTS.map((variant) => {
        const def = CTA_DEFINITIONS[variant];
        return (
          <div key={variant} className="evcs-cta-showcase__item">
            <CtaButton variant={variant} />
            <span className="evcs-cta-showcase__desc">{def.description}</span>
          </div>
        );
      })}
    </div>
  );
}
