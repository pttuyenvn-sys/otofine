import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildMarketplaceListQueryKey,
  buildMarketplaceListingRouteKey,
  buildMarketplaceListingSnapshot,
  clearMarketplaceListingExitFlag,
  markMarketplaceListingProductExit,
  peekMarketplaceListingSnapshot,
  resetMarketplaceListingSessionForTests,
  saveMarketplaceListingSnapshot,
  takeMarketplaceListingSnapshotForRestore,
} from "./marketplaceListingSession.js";

describe("marketplaceListingSession", () => {
  beforeEach(() => {
    global.window = {};
    global.sessionStorage = {
      store: {},
      getItem(k) {
        return this.store[k] ?? null;
      },
      setItem(k, v) {
        this.store[k] = String(v);
      },
      removeItem(k) {
        delete this.store[k];
      },
    };
    resetMarketplaceListingSessionForTests();
  });

  afterEach(() => {
    resetMarketplaceListingSessionForTests();
  });

  it("builds stable query and route keys", () => {
    expect(
      buildMarketplaceListQueryKey({
        category: "Má phanh",
        brand: "Toyota",
        page: 2,
        sort: "popular",
        keyword: "phanh",
      }),
    ).toContain("Toyota");
    expect(buildMarketplaceListingRouteKey("/", "?keyword=phanh")).toBe(
      "/?keyword=phanh",
    );
  });

  it("restores snapshot only after product exit flag", () => {
    const snapshot = buildMarketplaceListingSnapshot({
      filters: { keyword: "phanh", page: 2 },
      pathname: "/",
      search: "?keyword=phanh&page=2",
      scrollY: 480,
      products: [{ id: 1 }],
      totalPages: 3,
    });
    saveMarketplaceListingSnapshot(snapshot);

    expect(takeMarketplaceListingSnapshotForRestore("/", "?keyword=phanh&page=2")).toBeNull();
    expect(peekMarketplaceListingSnapshot("/", "?keyword=phanh&page=2")).toEqual(snapshot);

    markMarketplaceListingProductExit();
    const restored = takeMarketplaceListingSnapshotForRestore(
      "/",
      "?keyword=phanh&page=2",
    );

    expect(restored?.scrollY).toBe(480);
    expect(restored?.products).toEqual([{ id: 1 }]);
    expect(restored?.filters.page).toBe(2);
    expect(peekMarketplaceListingSnapshot("/", "?keyword=phanh&page=2")).toEqual(
      snapshot,
    );
    clearMarketplaceListingExitFlag();
  });
});
