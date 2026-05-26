import { describe, expect, it } from "vitest";
import {
  conversationItemsUnchanged,
  conversationMessageEqual,
  enrichMessagesForDisplay,
  mergeSortedMessages,
} from "./rfqConversationMessages.js";

const base = (id, patch = {}) => ({
  id,
  dispatchId: 1,
  message_type: "text",
  sender_type: "shop",
  message_text: `msg-${id}`,
  created_at: `2026-05-19T10:00:0${id}Z`,
  attachments: [],
  metadata_json: null,
  ...patch,
});

describe("mergeSortedMessages", () => {
  it("returns prev reference on noop silent poll", () => {
    const prev = [base(1), base(2)];
    const incoming = [base(1), base(2)].map((m) => ({ ...m, attachments: [] }));
    const next = mergeSortedMessages(prev, incoming);
    expect(next).toBe(prev);
    expect(next[0]).toBe(prev[0]);
    expect(next[1]).toBe(prev[1]);
  });

  it("appends new tail without replacing existing refs", () => {
    const prev = [base(1), base(2)];
    const incoming = [base(1), base(2), base(3)];
    const next = mergeSortedMessages(prev, incoming);
    expect(next).not.toBe(prev);
    expect(next[0]).toBe(prev[0]);
    expect(next[1]).toBe(prev[1]);
    expect(next[2].id).toBe(3);
  });

  it("updates message when content changed", () => {
    const prev = [base(1)];
    const incoming = [base(1, { message_text: "edited" })];
    const next = mergeSortedMessages(prev, incoming);
    expect(next).not.toBe(prev);
    expect(next[0].message_text).toBe("edited");
  });
});

describe("enrichMessagesForDisplay", () => {
  it("returns cached display array when items content unchanged", () => {
    const items = [base(1), base(2)];
    const a = enrichMessagesForDisplay(items);
    const b = enrichMessagesForDisplay([...items]);
    expect(b).toBe(a);
  });
});

describe("conversationMessageEqual", () => {
  it("ignores attachment array identity", () => {
    const a = base(1, { attachments: [{ id: 9, url: "/a.jpg", sort_order: 0 }] });
    const b = base(1, { attachments: [{ id: 9, url: "/a.jpg", sort_order: 0 }] });
    expect(conversationMessageEqual(a, b)).toBe(true);
    expect(conversationItemsUnchanged([a], [b])).toBe(true);
  });
});
