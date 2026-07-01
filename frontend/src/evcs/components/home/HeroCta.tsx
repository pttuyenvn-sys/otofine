import { CtaButton } from "@evcs/components/conversion/CtaButton";
import { HeroHotlineIcon } from "@evcs/components/home/HeroHotlineIcon";

export function HeroCta() {
  return (
    <div className="evcs-hero-cta">
      <div className="evcs-hero-cta__buttons">
        <CtaButton variant="plan" size="lg" />
        <CtaButton variant="survey" size="lg" />
      </div>
      <HeroHotlineIcon />
    </div>
  );
}
