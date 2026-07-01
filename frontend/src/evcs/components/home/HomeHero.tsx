"use client";

import { HeroCta } from "@evcs/components/home/HeroCta";
import { HeroImage } from "@evcs/components/home/HeroImage";
import { KpiBand } from "@evcs/components/home/KpiBand";
import { ScrollIndicator } from "@evcs/components/home/ScrollIndicator";
import { Container } from "@evcs/components/layout/Container";
import { HERO_CONTENT } from "@evcs/constants/homeContent";
import { useReveal } from "@evcs/hooks/useReveal";
import { cn } from "@evcs/utils/cn";

import "@evcs/styles/home.css";

export function HomeHero() {
  const copy = useReveal({ immediate: true, delay: 0 });
  const image = useReveal<HTMLDivElement>({ immediate: true, delay: 100 });
  const kpi = useReveal<HTMLDivElement>({ immediate: true, delay: 220 });

  return (
    <section className="evcs-atf" id="hero" aria-label="Giới thiệu EVCS">
      <div className="evcs-atf__background" aria-hidden>
        <div className="evcs-atf__glow evcs-atf__glow--left" />
        <div className="evcs-atf__glow evcs-atf__glow--right" />
        <div className="evcs-atf__grid-pattern" />
      </div>

      <Container className="evcs-atf__container">
        <div className="evcs-atf__main">
          <div
            ref={copy.ref}
            className={cn(
              "evcs-atf__copy evcs-home-reveal",
              copy.visible && "evcs-home-reveal--visible",
            )}
          >
            <p className="evcs-eyebrow">{HERO_CONTENT.eyebrow}</p>
            <h1 className="evcs-atf__headline">{HERO_CONTENT.headline}</h1>
            <p className="evcs-atf__lead">{HERO_CONTENT.lead}</p>
            <p className="evcs-atf__subline">{HERO_CONTENT.subline}</p>
            <HeroCta />
          </div>

          <div
            ref={image.ref}
            className={cn(
              "evcs-atf__visual evcs-home-reveal",
              image.visible && "evcs-home-reveal--visible",
            )}
          >
            <HeroImage />
          </div>
        </div>

        <div
          ref={kpi.ref}
          className={cn(
            "evcs-atf__kpi-wrap evcs-home-reveal",
            kpi.visible && "evcs-home-reveal--visible",
          )}
        >
          <KpiBand />
        </div>
      </Container>

      <ScrollIndicator />
    </section>
  );
}
