import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBuyerEngagementPayload,
  computeBuyerPhase,
} from "../utils/rfqBuyerEngagement.js";

describe("rfqBuyerEngagement", () => {
  it("computeBuyerPhase priority: quoted > engaged > dispatched > pending", () => {
    assert.equal(computeBuyerPhase({}), "pending");
    assert.equal(computeBuyerPhase({ dispatchCount: 1 }), "dispatched");
    assert.equal(
      computeBuyerPhase({
        dispatchCount: 1,
        firstShopMessageAt: "2026-05-19T10:00:00.000Z",
      }),
      "engaged",
    );
    assert.equal(
      computeBuyerPhase({
        dispatchCount: 1,
        firstShopMessageAt: "2026-05-19T10:00:00.000Z",
        quoteCount: 2,
      }),
      "quoted",
    );
  });

  it("buildBuyerEngagementPayload maps rfq row fields", () => {
    const payload = buildBuyerEngagementPayload(
      { first_shop_message_at: "2026-05-19T10:00:00.000Z" },
      { dispatchCount: 3, quoteCount: 0 },
    );
    assert.equal(payload.buyerPhase, "engaged");
    assert.equal(payload.dispatchCount, 3);
    assert.equal(payload.firstShopMessageAt, "2026-05-19T10:00:00.000Z");
  });
});
