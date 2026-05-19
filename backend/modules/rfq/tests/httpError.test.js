import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sendHttpError } from "../utils/httpError.js";

describe("sendHttpError", () => {
  it("maps 400 codes with message", () => {
    let status = 0;
    let body;
    const res = {
      status(s) {
        status = s;
        return {
          json(b) {
            body = b;
          },
        };
      },
    };
    sendHttpError(res, Object.assign(new Error("INVALID_PHONE"), { status: 400 }));
    assert.equal(status, 400);
    assert.equal(body.code, "INVALID_PHONE");
  });

  it("includes existingPublicId for DEDUPE_COOLDOWN", () => {
    let body;
    const res = {
      status() {
        return {
          json(b) {
            body = b;
          },
        };
      },
    };
    sendHttpError(
      res,
      Object.assign(new Error("DEDUPE_COOLDOWN"), {
        status: 429,
        existingPublicId: "abc123",
      }),
    );
    assert.equal(body.code, "DEDUPE_COOLDOWN");
    assert.equal(body.existingPublicId, "abc123");
  });
});
