import { SITE } from "@evcs/constants/site";

/** Hotline — icon nhỏ, không chiếm visual hierarchy của CTA chính. */
export function HeroHotlineIcon() {
  return (
    <a
      href={`tel:${SITE.hotline}`}
      className="evcs-hero-hotline"
      aria-label={`Gọi hotline ${SITE.hotlineDisplay}`}
      title={`Gọi hotline ${SITE.hotlineDisplay}`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M5.5 4h2.8l1.2 4.5-2.1 1.2a12 12 0 0 0 5.1 5.1l1.2-2.1 4.5 1.2v2.8c0 .6-.4 1-1 1.1-1 .2-2 .3-3 .3C8.1 18 6 15.9 6 12.5c0-1 .1-2 .3-3 .1-.6.6-1 1.2-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}
