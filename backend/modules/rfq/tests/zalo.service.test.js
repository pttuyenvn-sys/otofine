import test from "node:test";
import assert from "node:assert/strict";
import {
  isLikelyOaUserId,
  hasShopZaloField,
  normalizeVietnamesePhone,
  validateVietnamesePhone,
  selectEscalationChannel,
  resolveEscalationRecipient,
  buildCsMessagePayload,
  buildEscalationMessageText,
} from "../../../services/zalo.service.js";
import { SHOP_ZALO_CTA_TITLE } from "../utils/rfqZaloEscalationPayload.js";

test("isLikelyOaUserId distinguishes OA id vs phone", () => {
  assert.equal(isLikelyOaUserId("4106984553499884062"), true);
  assert.equal(isLikelyOaUserId("0914489595"), false);
  assert.equal(isLikelyOaUserId("84914489595"), false);
});

test("normalizeVietnamesePhone", () => {
  assert.equal(normalizeVietnamesePhone("0914489595"), "84914489595");
  assert.equal(normalizeVietnamesePhone("84914489595"), "84914489595");
  assert.equal(normalizeVietnamesePhone("+84 914 489 595"), "84914489595");
  assert.equal(normalizeVietnamesePhone("0847770777"), "84847770777");
});

test("validateVietnamesePhone rejects invalid prefix", () => {
  assert.equal(validateVietnamesePhone("0212345678").ok, false);
  assert.equal(validateVietnamesePhone("0914489595").ok, true);
  assert.equal(validateVietnamesePhone("0847770777").ok, true);
});

test("selectEscalationChannel: shops.zalo OA user_id → oa_cs", () => {
  const plan = selectEscalationChannel({
    shopZalo: "4106984553499884062",
    shopPhone: "0914489595",
    znsTemplateId: "tpl-1",
  });
  assert.equal(plan.channel, "oa_cs");
  assert.equal(plan.selectionReason, "shops_zalo_oa_user_id");
  assert.equal(plan.fallbackReason, null);
});

test("selectEscalationChannel: no shops.zalo → zns phone fallback", () => {
  const plan = selectEscalationChannel({
    shopZalo: null,
    shopPhone: "0847770777",
    znsTemplateId: "tpl-1",
  });
  assert.equal(plan.channel, "zns");
  assert.equal(plan.selectionReason, "zns_phone_fallback");
  assert.equal(plan.fallbackReason, "no_shops_zalo");
  assert.equal(plan.phone, "84847770777");
});

test("selectEscalationChannel: no shops.zalo without template → blocked", () => {
  const plan = selectEscalationChannel({
    shopZalo: null,
    shopPhone: "0847770777",
    znsTemplateId: "",
  });
  assert.equal(plan.channel, null);
  assert.equal(plan.blockReason, "missing_zns_template_id");
});

test("selectEscalationChannel: shops.zalo invalid format → zns fallback", () => {
  const plan = selectEscalationChannel({
    shopZalo: "0914489595",
    shopPhone: "0914489595",
    znsTemplateId: "tpl-1",
  });
  assert.equal(plan.channel, "zns");
  assert.equal(plan.fallbackReason, "shops_zalo_not_oa_user_id");
});

test("resolveEscalationRecipient back-compat", () => {
  assert.deepEqual(
    resolveEscalationRecipient({ shopZalo: "4106984553499884062", shopPhone: "0914489595" }),
    { oaUserId: "4106984553499884062", phone: "84914489595" },
  );
});

test("buildCsMessagePayload includes oa.open.url button", () => {
  const payload = buildCsMessagePayload({
    text: "Hello",
    cta: { title: SHOP_ZALO_CTA_TITLE, url: "https://otofine.com/rfq/shop/1" },
  });
  assert.equal(payload.message.text, "Hello");
  assert.equal(payload.message.attachment.payload.buttons[0].type, "oa.open.url");
});

test("buildEscalationMessageText includes snippet", () => {
  const text = buildEscalationMessageText({
    shopName: "AutoPT",
    snippet: "Lò xo",
    actionUrl: "https://otofine.com/rfq/shop/1",
  });
  assert.match(text, /AutoPT/);
  assert.match(text, /Lò xo/);
});
