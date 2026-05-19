import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

describe("tokenHash", () => {
  before(() => {
    process.env.JWT_SECRET = "test-secret";
    process.env.RFQ_VIEWER_SECRET = "";
    process.env.RFQ_OTP_SECRET = "";
  });

  it("hashViewerToken stable for same inputs", async () => {
    const { hashViewerToken } = await import("../utils/tokenHash.js");
    const a = hashViewerToken("tok1");
    const b = hashViewerToken("tok1");
    assert.equal(a, b);
    assert.notEqual(a, hashViewerToken("tok2"));
  });
});
