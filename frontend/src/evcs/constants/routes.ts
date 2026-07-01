/**
 * Public URL paths on EVCS host (browser-visible).
 * Internal files live under app/(evcs)/evcs/* → /evcs/*
 */
export const EVCS_ROUTES = {
  home: "/",
  solutions: "/giai-phap",
  investmentCenter: "/trung-tam-dau-tu",
  academy: "/hoc-vien-ev",
  projects: "/du-an",
  contact: "/lien-he",
  stationMap: "/ban-do-tram-sac",
} as const;

export type EvcsRouteKey = keyof typeof EVCS_ROUTES;
