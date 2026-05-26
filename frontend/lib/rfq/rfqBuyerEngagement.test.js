import { describe, expect, it } from "vitest";
import {
  computeBuyerPhase,
  deriveBuyerEngagement,
  getThreadEmptyState,
  pickDefaultDispatchId,
} from "./rfqBuyerEngagement.js";

describe("computeBuyerPhase", () => {
  it("returns pending when no dispatch", () => {
    expect(computeBuyerPhase({})).toBe("pending");
  });

  it("returns dispatched when dispatch but no shop message", () => {
    expect(computeBuyerPhase({ dispatchCount: 2 })).toBe("dispatched");
  });

  it("returns engaged when first shop message exists", () => {
    expect(
      computeBuyerPhase({
        dispatchCount: 1,
        firstShopMessageAt: "2026-05-19T10:00:00.000Z",
      }),
    ).toBe("engaged");
  });

  it("returns quoted when quote exists", () => {
    expect(
      computeBuyerPhase({
        dispatchCount: 1,
        firstShopMessageAt: "2026-05-19T10:00:00.000Z",
        quoteCount: 1,
      }),
    ).toBe("quoted");
  });
});

describe("pickDefaultDispatchId", () => {
  const options = [
    { dispatchId: 10, shopName: "A" },
    { dispatchId: 20, shopName: "B" },
  ];

  it("prefers deep link when valid", () => {
    expect(
      pickDefaultDispatchId(options, { deepLinkDispatchId: 20 }),
    ).toBe(20);
  });

  it("prefers unread dispatch", () => {
    expect(
      pickDefaultDispatchId(options, {
        unreadByDispatch: { 10: 0, 20: 2 },
      }),
    ).toBe(20);
  });

  it("prefers latest activity when no unread", () => {
    expect(
      pickDefaultDispatchId(options, {
        timelineItems: [
          { dispatchId: 10, created_at: "2026-05-19T09:00:00.000Z" },
          { dispatchId: 20, created_at: "2026-05-19T11:00:00.000Z" },
        ],
      }),
    ).toBe(20);
  });

  it("falls back to first dispatch", () => {
    expect(pickDefaultDispatchId(options, {})).toBe(10);
  });
});

describe("getThreadEmptyState", () => {
  it("shows finding shop when no dispatch", () => {
    expect(getThreadEmptyState({ hasDispatches: false })).toEqual({
      emptyTitle: "Đang tìm shop",
      showComposer: false,
    });
  });

  it("shows shop reviewing when dispatch but no messages", () => {
    expect(
      getThreadEmptyState({
        hasDispatches: true,
        activeDispatchId: 10,
        activeThreadItems: [],
      }),
    ).toEqual({
      emptyTitle: "Shop đang xem yêu cầu",
      showComposer: true,
    });
  });

  it("shows thread when messages exist", () => {
    expect(
      getThreadEmptyState({
        hasDispatches: true,
        activeDispatchId: 10,
        activeThreadItems: [{ id: 1 }],
      }),
    ).toEqual({
      emptyTitle: null,
      showComposer: true,
    });
  });
});

describe("deriveBuyerEngagement", () => {
  it("uses conversation-first headlines", () => {
    const ux = deriveBuyerEngagement({
      status: "dispatching",
      dispatches: [{ dispatchId: 1 }],
      dispatchCount: 1,
    });
    expect(ux.headline).toBe("Shop đang xem yêu cầu");
    expect(ux.buyerPhase).toBe("dispatched");
  });

  it("builds timeline with exchange before quote", () => {
    const ux = deriveBuyerEngagement({
      status: "dispatching",
      dispatchCount: 1,
      firstShopMessageAt: "2026-05-19T10:00:00.000Z",
    });
    expect(ux.timeline[1]).toMatchObject({
      key: "exchange",
      title: "Shop trao đổi",
      done: true,
    });
    expect(ux.timeline[2]).toMatchObject({
      key: "quotes",
      current: true,
      done: false,
    });
  });
});
