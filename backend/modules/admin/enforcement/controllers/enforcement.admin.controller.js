/**
 * Enforcement & Moderation controller — Slice 6.
 *
 * Responsibilities:
 *   - Parse request params/body
 *   - Call the appropriate service function
 *   - Guard against alreadySuspended before calling logAdminAction (C1)
 *   - Call logAdminAction(req, {...}).catch(() => {}) — never block response
 *   - Return HTTP response
 *
 * logAdminAction is NEVER called from service files (Slice 4/5 B2 constraint).
 * All audit calls are in this file only.
 *
 * Import path: "../../index.js" (from enforcement/controllers/ → modules/admin/index.js)
 */

import * as enforcementService from "../../core/enforcement/enforcement.service.js";
import * as suspensionService from "../../core/enforcement/suspension.service.js";
import * as riskFlagService from "../../core/enforcement/riskFlag.service.js";
import * as noteService from "../../core/enforcement/moderationNote.service.js";
import { logAdminAction } from "../../index.js";

// ---------------------------------------------------------------------------
// Helper: handle service-thrown HTTP errors
// ---------------------------------------------------------------------------

function serviceError(err, res, label) {
  if (err && typeof err.status === "number") {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`[enforcement:${label}]`, err?.message ?? err);
  return res.status(500).json({ error: "Internal error" });
}

// ---------------------------------------------------------------------------
// Case handlers
// ---------------------------------------------------------------------------

export async function listCases(req, res) {
  try {
    const { status, target_type, target_id, page, limit } = req.query;
    // C3 — clamp page ≥ 1 (file-spec review patch).
    // page < 1 produces a negative OFFSET which MySQL rejects with a syntax error.
    const safePage  = Math.max(1, Number(page)  || 1);
    const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const cases = await enforcementService.listCases({
      status, target_type, target_id,
      page: safePage, limit: safeLimit,
    });
    return res.json({ cases });
  } catch (err) {
    return serviceError(err, res, "listCases");
  }
}

export async function getCase(req, res) {
  try {
    const caseRow = await enforcementService.getCase(Number(req.params.id));
    if (!caseRow) return res.status(404).json({ error: "Case not found" });
    return res.json({ case: caseRow });
  } catch (err) {
    return serviceError(err, res, "getCase");
  }
}

export async function openCase(req, res) {
  try {
    // For target_type "shop", target_id MUST be shops.id (integer), not shop_accounts.id.
    const result = await enforcementService.createCase(req.body, req.user.id);
    logAdminAction(req, {
      action: "enforcement.case.open",
      target_type: "admin_enforcement_cases",
      target_id: result.caseId,
      before: null,
      after: result.newState,
    }).catch(() => {});
    return res.status(201).json({ caseId: result.caseId });
  } catch (err) {
    return serviceError(err, res, "openCase");
  }
}

// Handles all case mutations:
//   - { assignTo: adminId }                       → assignment
//   - { status: 'pending_review' }                → move to review (same as assign)
//   - { status: 'open' }                          → return to open / unassign
//   - { status: 'resolved', resolution, resolvedNote } → resolve
//   - { status: 'closed' }                        → close (blocked if active suspension)
//   - { status: 'appealed' }                      → appeal
export async function updateCase(req, res) {
  try {
    const caseId = Number(req.params.id);
    const { status, resolution, resolvedNote, assignTo } = req.body;

    const result = await enforcementService.transitionCase(
      caseId,
      { status, resolution, resolvedNote, assignTo },
      req.user.id,
    );

    logAdminAction(req, {
      action: `enforcement.case.${result.verb}`,
      target_type: "admin_enforcement_cases",
      target_id: caseId,
      before: result.oldState,
      after: result.newState,
    }).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    return serviceError(err, res, "updateCase");
  }
}

// ---------------------------------------------------------------------------
// Suspension / reinstatement handlers
// ---------------------------------------------------------------------------

export async function suspendShop(req, res) {
  try {
    const caseId = Number(req.params.id);
    const {
      shopId,
      suspension_type,
      category,
      reason,
      expires_at: rawExpiresAt,
      duration_days,
      suspend_login,
    } = req.body;

    // shopId MUST be shops.id (integer PK), NOT shop_accounts.id or shop_accounts.shopId UUID.
    if (!shopId) {
      return res.status(400).json({ error: "shopId is required" });
    }

    // Backend is the authoritative source for suspension timing.
    // duration_days (semantic value from UI) takes precedence over a raw
    // expires_at string. This keeps timestamp arithmetic out of the frontend.
    let expires_at = rawExpiresAt ?? null;
    if (duration_days && Number(duration_days) > 0) {
      const expiry = new Date();
      expiry.setUTCDate(expiry.getUTCDate() + Number(duration_days));
      expires_at = expiry.toISOString().slice(0, 19).replace("T", " ");
    }

    const result = await suspensionService.suspendShop(
      caseId,
      Number(shopId),
      { suspension_type, category, reason, expires_at, suspend_login },
      req.user.id,
    );

    // C1: Guard — do NOT call logAdminAction when no suspension occurred.
    // alreadySuspended:true means shop was already suspended before this request
    // (caught at Step 1 or Step 3). Logging would produce a spurious audit entry
    // with undefined snapshot fields and would violate the concurrency test
    // invariant (exactly 1 audit entry per shop per suspension event).
    if (result.alreadySuspended) {
      return res.status(200).json({ ok: true, alreadySuspended: true });
    }

    logAdminAction(req, {
      action: "shop.suspend",
      target_type: "shop",
      target_id: Number(shopId),
      before: {
        public_status: result.shopStatusBefore,
        accounts_status: result.accountsStatusBefore,
      },
      after: {
        public_status: "suspended",
        suspension_id: result.suspensionId,
        case_id: caseId,
        reason,
      },
    }).catch(() => {});

    return res.status(200).json({ ok: true, suspensionId: result.suspensionId });
  } catch (err) {
    return serviceError(err, res, "suspendShop");
  }
}

export async function reinstateShop(req, res) {
  try {
    const { shopId, lift_reason } = req.body;

    // shopId MUST be shops.id (integer PK), NOT shop_accounts.id or shop_accounts.shopId UUID.
    if (!shopId) {
      return res.status(400).json({ error: "shopId is required" });
    }

    const result = await suspensionService.reinstateShop(
      Number(shopId),
      lift_reason,
      req.user.id,
    );

    if (result.notSuspended) {
      return res.status(200).json({ ok: true, notSuspended: true });
    }

    logAdminAction(req, {
      action: "shop.reinstate",
      target_type: "shop",
      target_id: Number(shopId),
      before: { public_status: "suspended" },
      after: {
        public_status: result.restoredStatus,
        lift_reason,
        lifted_suspension_id: result.liftedSuspensionId,
      },
    }).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    return serviceError(err, res, "reinstateShop");
  }
}

// ---------------------------------------------------------------------------
// Termination handler (superadmin only; guard is in enforcement.service.js)
// ---------------------------------------------------------------------------

export async function terminateShop(req, res) {
  try {
    const caseId = Number(req.params.id);
    const { shopId } = req.body;

    // shopId MUST be shops.id (integer PK), NOT shop_accounts.id or shop_accounts.shopId UUID.
    if (!shopId) {
      return res.status(400).json({ error: "shopId is required" });
    }

    const result = await enforcementService.terminateShop(
      caseId,
      Number(shopId),
      req.user.id,
    );

    logAdminAction(req, {
      action: "shop.terminate",
      target_type: "shop",
      target_id: Number(shopId),
      before: {
        public_status: result.shopStatusBefore,
        accounts_status: result.accountsStatusBefore,
      },
      after: {
        public_status: "suspended",
        accounts_status: "deleted",
        case_id: caseId,
      },
    }).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    return serviceError(err, res, "terminateShop");
  }
}

// ---------------------------------------------------------------------------
// Moderation note handlers
// ---------------------------------------------------------------------------

export async function listNotes(req, res) {
  try {
    const caseId = Number(req.params.id);
    const notes = await noteService.listNotes({ caseId });
    return res.json({ notes });
  } catch (err) {
    return serviceError(err, res, "listNotes");
  }
}

export async function createNote(req, res) {
  try {
    const caseId = Number(req.params.id);
    const { target_type, target_id, content, visibility, pinned } = req.body;

    const result = await noteService.createNote(
      { target_type, target_id, caseId, content, visibility, pinned },
      req.user.id,
    );

    logAdminAction(req, {
      action: "moderation.note.create",
      target_type: "admin_moderation_notes",
      target_id: result.noteId,
      before: null,
      after: {
        note_id: result.noteId,
        target_type,
        target_id,
        pinned: pinned ? 1 : 0,
        case_id: caseId || null,
      },
    }).catch(() => {});

    return res.status(201).json({ noteId: result.noteId });
  } catch (err) {
    return serviceError(err, res, "createNote");
  }
}

export async function pinNote(req, res) {
  try {
    const noteId = Number(req.params.id);
    const { pinned } = req.body;
    const result = await noteService.setPinned(noteId, !!pinned, req.user.id);

    logAdminAction(req, {
      action: "moderation.note.pin",
      target_type: "admin_moderation_notes",
      target_id: noteId,
      before: { pinned: result.oldPinned ? 1 : 0 },
      after: { pinned: pinned ? 1 : 0 },
    }).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    return serviceError(err, res, "pinNote");
  }
}

export async function deleteNote(req, res) {
  try {
    const noteId = Number(req.params.id);
    const result = await noteService.deleteNote(noteId, req.user.id);

    logAdminAction(req, {
      action: "moderation.note.delete",
      target_type: "admin_moderation_notes",
      target_id: noteId,
      before: { content_length: result.contentLength },
      after: { deleted_at: result.deletedAt },
    }).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    return serviceError(err, res, "deleteNote");
  }
}

// ---------------------------------------------------------------------------
// Risk flag handlers
// ---------------------------------------------------------------------------

export async function listFlags(req, res) {
  try {
    const { status, target_type, target_id, page, limit } = req.query;
    // C3 — clamp page ≥ 1 (file-spec review patch). Same guard as listCases.
    const safePage  = Math.max(1, Number(page)  || 1);
    const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const flags = await riskFlagService.listFlags({
      status, target_type, target_id,
      page: safePage, limit: safeLimit,
    });
    return res.json({ flags });
  } catch (err) {
    return serviceError(err, res, "listFlags");
  }
}

export async function createFlag(req, res) {
  try {
    const result = await riskFlagService.createFlag(req.body, req.user.id);

    logAdminAction(req, {
      action: "risk.flag.create",
      target_type: "admin_risk_flags",
      target_id: result.flagId,
      before: null,
      after: result.newState,
    }).catch(() => {});

    return res.status(201).json({ flagId: result.flagId });
  } catch (err) {
    return serviceError(err, res, "createFlag");
  }
}

// C4 — Map disposition value (past participle) to audit action verb (infinitive).
// Design §9.2 specifies: risk.flag.confirm / risk.flag.dismiss / risk.flag.resolve.
// `disposition` values from the API are "confirmed" / "dismissed" / "resolved".
const RISK_FLAG_VERB = {
  confirmed: "confirm",
  dismissed: "dismiss",
  resolved:  "resolve",
};

export async function reviewFlag(req, res) {
  try {
    const flagId = Number(req.params.id);
    const { disposition } = req.body;
    const result = await riskFlagService.reviewFlag(flagId, disposition, req.user.id);

    logAdminAction(req, {
      action: `risk.flag.${RISK_FLAG_VERB[disposition] ?? disposition}`,
      target_type: "admin_risk_flags",
      target_id: flagId,
      before: result.oldState,
      after: result.newState,
    }).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    return serviceError(err, res, "reviewFlag");
  }
}
