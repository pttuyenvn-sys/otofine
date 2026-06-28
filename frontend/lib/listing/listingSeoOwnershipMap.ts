/**
 * SEO ownership map for listing pages (ARCH-MP-03B.2).
 * Documentation-only constants — no runtime effect.
 */

export type SeoOwnershipRow = {
  surface: string;
  before: string[];
  after: string[];
};

/** Current SEO owners before MP-03B.2 collapse (runtime still active). */
export const LISTING_SEO_OWNERSHIP_BEFORE: SeoOwnershipRow[] = [
  {
    surface: "Title",
    before: [
      "app/[slug]/page.js generateMetadata → listingTitleFromEntity + '| Otofine'",
      "Home.jsx document.title useEffect → pageTitle",
    ],
    after: [],
  },
  {
    surface: "Description",
    before: [
      "app/[slug]/page.js generateMetadata → listing title string",
    ],
    after: [],
  },
  {
    surface: "Canonical",
    before: [
      "app/[slug]/page.js → resolveCategoryOwnerPath / resolveVehicleOwnerPath → absoluteUrl",
      "Client navigateToState → buildPathFromState (may diverge from SSR owner path)",
    ],
    after: [],
  },
  {
    surface: "H1 (SSR source)",
    before: [
      "listingSeoState.buildListingH1 / buildPageTitle",
      "Home.jsx listingIdentity.h1 → ListingHero",
    ],
    after: [],
  },
];

/** Target SEO owners after collapse (shadow engine ready; runtime not swapped). */
export const LISTING_SEO_OWNERSHIP_AFTER: SeoOwnershipRow[] = [
  {
    surface: "Title",
    before: [],
    after: [
      "ListingIdentity → buildListingSeoIdentity → title",
      "SSR generateMetadata (future wire)",
    ],
  },
  {
    surface: "Description",
    before: [],
    after: [
      "ListingIdentity → buildListingSeoIdentity → description",
    ],
  },
  {
    surface: "Canonical",
    before: [],
    after: [
      "ListingIdentity → buildListingSeoIdentity → canonicalPath",
      "SSR absoluteUrl(canonicalPath) (future wire)",
    ],
  },
  {
    surface: "H1 (SSR source)",
    before: [],
    after: [
      "ListingIdentity → buildListingDisplayLabel → h1",
      "initialSeo.h1 prop to Home (future MP-03B.3+)",
    ],
  },
];
