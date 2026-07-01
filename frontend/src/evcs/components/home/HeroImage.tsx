/**
 * Hero visual — placeholder until production asset (Sprint 04+).
 * Ratio: --evcs-ratio-card (4:3) per Brand Guideline.
 */
export function HeroImage() {
  return (
    <div className="evcs-hero-image" aria-hidden>
      <div className="evcs-hero-image__frame">
        <div className="evcs-hero-image__mesh" />
        <div className="evcs-hero-image__silhouette">
          <svg
            viewBox="0 0 120 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="evcs-hero-image__svg"
            aria-hidden
          >
            <rect
              x="20"
              y="28"
              width="28"
              height="44"
              rx="4"
              className="evcs-hero-image__station"
            />
            <path
              d="M48 40h44M70 40v20M58 52h24"
              className="evcs-hero-image__cable"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="92" cy="36" r="10" className="evcs-hero-image__glow" />
          </svg>
        </div>
        <span className="evcs-hero-image__caption">Ảnh minh họa trạm sạc</span>
      </div>
    </div>
  );
}
