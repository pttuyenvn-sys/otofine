import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePdpArchiveState,
  getPdpVisibilityClauses,
  getProductPublicVisibilityClauses,
  resetProductPublicVisibilityCacheForTests,
} from "../../../utils/productPublicVisibility.server.js";

test("resolvePdpArchiveState — public shop is active PDP", () => {
  assert.deepEqual(resolvePdpArchiveState("public"), {
    archived: false,
    sellerUnavailable: false,
  });
});

test("resolvePdpArchiveState — suspended shop is archived", () => {
  assert.deepEqual(resolvePdpArchiveState("suspended"), {
    archived: true,
    sellerUnavailable: true,
  });
});

test("resolvePdpArchiveState — private shop is archived", () => {
  assert.deepEqual(resolvePdpArchiveState("private"), {
    archived: true,
    sellerUnavailable: true,
  });
});

test("resolvePdpArchiveState — pending shop is not archived banner", () => {
  assert.deepEqual(resolvePdpArchiveState("pending"), {
    archived: false,
    sellerUnavailable: false,
  });
});

test("PDP clauses omit shop gate", async () => {
  resetProductPublicVisibilityCacheForTests();
  const store = await getProductPublicVisibilityClauses("p", "s");
  const pdp = await getPdpVisibilityClauses("p");
  const storeShopGate = store.some((c) => c.includes("public_status"));
  const pdpShopGate = pdp.some((c) => c.includes("public_status"));
  assert.equal(storeShopGate, true);
  assert.equal(pdpShopGate, false);
});

test("STORE clauses include shop gate by default", async () => {
  resetProductPublicVisibilityCacheForTests();
  const store = await getProductPublicVisibilityClauses("p", "s", {
    skipShopGate: true,
  });
  assert.equal(
    store.some((c) => c.includes("public_status")),
    false,
  );
});
