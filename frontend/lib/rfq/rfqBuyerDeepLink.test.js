import { describe, expect, it } from "vitest";

import {
  parseDeepLinkDispatchId,
  persistDeepLinkDispatchId,
} from "./rfqBuyerDeepLink.js";

describe("parseDeepLinkDispatchId", () => {
  it("reads dispatchId from search params", () => {
    const sp = new URLSearchParams("dispatchId=178");
    expect(parseDeepLinkDispatchId(sp)).toBe(178);
  });

  it("returns null when missing", () => {
    const sp = new URLSearchParams("");
    expect(parseDeepLinkDispatchId(sp)).toBeNull();
  });
});

describe("persistDeepLinkDispatchId", () => {
  it("stores in sessionStorage", () => {
    const store = {};
    global.sessionStorage = {
      setItem(k, v) {
        store[k] = v;
      },
      getItem(k) {
        return store[k] ?? null;
      },
    };
    global.window = { location: { hash: "" } };
    persistDeepLinkDispatchId(178);
    expect(store.rfq_push_dispatch_id).toBe("178");
  });
});
