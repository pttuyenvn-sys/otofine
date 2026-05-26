import { describe, expect, it } from "vitest";
import {
  buildMessageDispatchOptionsFromDispatches,
  mergeDispatchOptions,
  mergeStableSortedQuotes,
  stabilizeRfqByTokenData,
} from "./rfqBuyerDataStable.js";

describe("stabilizeRfqByTokenData", () => {
  it("returns prev on noop poll payload", () => {
    const prev = {
      status: "open",
      publicId: "abc",
      partDescription: "phanh",
      quotes: [{ id: 1, dispatchId: 10, priceAmount: 100, shopName: "A" }],
      vehicle: { brand: "Toyota" },
      images: ["/a.jpg"],
    };
    const incoming = {
      ...prev,
      quotes: [{ ...prev.quotes[0] }],
    };
    expect(stabilizeRfqByTokenData(prev, incoming)).toBe(prev);
  });
});

describe("mergeStableSortedQuotes", () => {
  it("keeps prev array when quote rows equal", () => {
    const q = [{ id: 1, dispatchId: 10, priceAmount: 200, shopName: "S" }];
    const prev = [...q];
    const next = mergeStableSortedQuotes(prev, [{ ...q[0] }]);
    expect(next).toBe(prev);
  });
});

describe("mergeDispatchOptions", () => {
  it("keeps prev options ref when unchanged", () => {
    const prev = [{ dispatchId: 10, shopName: "S" }];
    const quotes = [{ id: 1, dispatchId: 10, shopName: "S" }];
    expect(mergeDispatchOptions(prev, quotes)).toBe(prev);
  });
});

describe("buildMessageDispatchOptionsFromDispatches", () => {
  it("includes dispatch rooms before quote exists", () => {
    const opts = buildMessageDispatchOptionsFromDispatches(
      [{ dispatchId: 178, shopId: 5, shopName: "Shop A" }],
      [],
    );
    expect(opts).toEqual([{ dispatchId: 178, shopName: "Shop A", shopId: 5 }]);
  });

  it("prefers quote shop name when both present", () => {
    const opts = buildMessageDispatchOptionsFromDispatches(
      [{ dispatchId: 178, shopId: 5, shopName: "Shop A" }],
      [{ id: 1, dispatchId: 178, shopName: "Shop A Quoted", shopId: 5 }],
    );
    expect(opts[0].shopName).toBe("Shop A Quoted");
  });
});
