import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMessageText,
  isEffectivelyEmpty,
  validateMessageText,
  RFQ_MESSAGE_TEXT_MAX,
} from "../utils/rfqMessageValidation.js";

describe("normalizeMessageText", () => {
  it("trims and collapses horizontal spaces", () => {
    assert.equal(normalizeMessageText("  hello   world  "), "hello world");
  });

  it("collapses excessive blank lines", () => {
    assert.equal(normalizeMessageText("a\n\n\n\nb"), "a\n\nb");
  });

  it("strips zero-width characters", () => {
    assert.equal(normalizeMessageText("a\u200Bb"), "ab");
  });
});

describe("isEffectivelyEmpty", () => {
  it("detects unicode blank spam", () => {
    assert.equal(isEffectivelyEmpty("\u00A0\u200B"), true);
  });
});

describe("validateMessageText", () => {
  it("accepts normal text", () => {
    assert.equal(validateMessageText("  Xin chào shop  "), "Xin chào shop");
  });

  it("rejects empty", () => {
    assert.throws(
      () => validateMessageText("   \n\n  "),
      (e) => e.message === "EMPTY_MESSAGE",
    );
  });

  it("rejects excessive char repeat", () => {
    assert.throws(
      () => validateMessageText("a".repeat(50)),
      (e) => e.message === "MESSAGE_SPAM",
    );
  });

  it("rejects too long", () => {
    assert.throws(
      () => validateMessageText("x".repeat(RFQ_MESSAGE_TEXT_MAX + 1)),
      (e) => e.message === "MESSAGE_TOO_LONG",
    );
  });
});
