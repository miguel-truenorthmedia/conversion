const express = require("express");
const { sendBigoConversion, sendBigoWebEventsGet } = require("../services/bigoApi");
const { ringbaSignatureOptional } = require("../middleware/ringbaSignature");
const { logError, logInfo, logWarn } = require("../utils/logger");

const router = express.Router();
const SECONDARY_BIGO_PIXEL_ID = process.env.SECONDARY_BIGO_PIXEL_ID || "906565217281285376";
const PRIMARY_PIXEL_ID = String(process.env.BIGO_PIXEL_ID || "906523332026341632");

function safeString(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Ringba `payout` only: missing, non-numeric, or negative → 0 (no env defaults). */
function resolvePayoutFromPayload(payload) {
  const n = Number(payload?.payout);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return n;
}

async function handleConversion(req, res, options = {}) {
  const endpoint = options.endpoint || "primary";
  const pixelIdOverride = options.pixelIdOverride;
  const payload = req.body || {};
  const bigoClickId = payload.bigo_clickid;
  const payoutValue = resolvePayoutFromPayload(payload);

  logInfo("WEBHOOK_RECEIVED", {
    endpoint,
    pixel_id: pixelIdOverride || process.env.BIGO_PIXEL_ID || null,
    bigo_clickid: bigoClickId || null,
    qualified: payload.qualified || null,
    duration: payload.duration ?? null,
    caller_id: payload.caller_id || null,
    age: payload.age || null,
    type: payload.type || null,
    payout: payload.payout ?? null,
    resolved_payout: payoutValue,
  });

  if (!bigoClickId || String(bigoClickId).trim() === "") {
    logWarn("WEBHOOK_REJECTED reason=missing_bigo_clickid", {
      bigo_clickid: bigoClickId || null,
    });

    return res.status(200).json({
      accepted: false,
      reason: "missing_bigo_clickid",
    });
  }

  const result = await sendBigoConversion({
    bigoClickId,
    eventTimeSeconds: Math.floor(Date.now() / 1000),
    conversionValue: payoutValue,
    pixelIdOverride,
  });

  if (result.ok) {
    logInfo("BIGO_FORWARD_SUCCESS", {
      endpoint,
      pixel_id: pixelIdOverride || process.env.BIGO_PIXEL_ID || null,
      status: result.status,
      response: result.data,
      bigo_clickid: bigoClickId,
      payout: payoutValue,
    });
  } else {
    logError("BIGO_FORWARD_FAILURE", {
      endpoint,
      pixel_id: pixelIdOverride || process.env.BIGO_PIXEL_ID || null,
      status: result.status,
      error: result.error,
      response: result.data,
      bigo_clickid: bigoClickId,
      payout: payoutValue,
    });
  }

  return res.status(200).json({
    accepted: result.ok,
    forwarded: result.ok,
    reason: result.ok ? null : "bigo_api_error",
    endpoint,
  });
}

router.post("/", async (req, res) => handleConversion(req, res, { endpoint: "primary" }));

router.post("/secondary", async (req, res) =>
  handleConversion(req, res, {
    endpoint: "secondary",
    pixelIdOverride: SECONDARY_BIGO_PIXEL_ID,
  })
);

/** POST /api/conversion/raw — any call connect; BIGO form_button, value 0 (GET web_events). */
router.post("/raw", ringbaSignatureOptional, async (req, res) => {
  const payload = req.body || {};
  const bigoClickId = safeString(payload.bigo_clickid);
  const callerId = safeString(payload.caller_id);
  const duration = payload.duration ?? null;
  const buyer = safeString(payload.buyer);
  const payoutValue = resolvePayoutFromPayload(payload);

  logInfo("WEBHOOK_RECEIVED", {
    endpoint: "/api/conversion/raw",
    bigo_clickid: bigoClickId,
    caller_id: callerId,
    duration,
    buyer,
    payout: payload.payout ?? null,
    resolved_payout: payoutValue,
  });

  if (!bigoClickId) {
    logWarn("WEBHOOK_REJECTED reason=missing_bigo_clickid", { endpoint: "/api/conversion/raw" });
    return res.status(200).json({ accepted: false, reason: "missing_bigo_clickid", endpoint: "raw" });
  }

  const result = await sendBigoWebEventsGet({
    bigoClickId,
    pixelId: PRIMARY_PIXEL_ID,
    eventId: "form_button",
    value: payoutValue,
  });

  if (result.ok) {
    logInfo("BIGO_FORWARD_SUCCESS", {
      endpoint: "/api/conversion/raw",
      bigo_clickid: bigoClickId,
      duration,
      buyer,
      event_id: "form_button",
      value: payoutValue,
      status: result.status,
      response: result.data,
    });
  } else {
    logError("BIGO_FORWARD_FAILURE", {
      endpoint: "/api/conversion/raw",
      bigo_clickid: bigoClickId,
      duration,
      buyer,
      event_id: "form_button",
      value: payoutValue,
      status: result.status,
      error: result.error,
      response: result.data,
    });
  }

  return res.status(200).json({
    accepted: result.ok,
    forwarded: result.ok,
    reason: result.ok ? null : "bigo_api_error",
    endpoint: "raw",
  });
});

/** POST /api/conversion/billable — paid conversion; BIGO phone_consult, value = payout (GET web_events). */
router.post("/billable", ringbaSignatureOptional, async (req, res) => {
  const payload = req.body || {};
  const bigoClickId = safeString(payload.bigo_clickid);
  const callerId = safeString(payload.caller_id);
  const duration = payload.duration ?? null;
  const buyer = safeString(payload.buyer);
  const payoutRaw = payload.payout;
  const payoutValue = resolvePayoutFromPayload(payload);

  logInfo("WEBHOOK_RECEIVED", {
    endpoint: "/api/conversion/billable",
    bigo_clickid: bigoClickId,
    caller_id: callerId,
    duration,
    buyer,
    payout: payoutRaw ?? null,
    resolved_payout: payoutValue,
  });

  if (!bigoClickId) {
    logWarn("WEBHOOK_REJECTED reason=missing_bigo_clickid", { endpoint: "/api/conversion/billable" });
    return res.status(200).json({ accepted: false, reason: "missing_bigo_clickid", endpoint: "billable" });
  }

  const result = await sendBigoWebEventsGet({
    bigoClickId,
    pixelId: PRIMARY_PIXEL_ID,
    eventId: "phone_consult",
    value: payoutValue,
  });

  if (result.ok) {
    logInfo("BIGO_FORWARD_SUCCESS", {
      endpoint: "/api/conversion/billable",
      bigo_clickid: bigoClickId,
      duration,
      buyer,
      payout: payoutValue,
      event_id: "phone_consult",
      status: result.status,
      response: result.data,
    });
  } else {
    logError("BIGO_FORWARD_FAILURE", {
      endpoint: "/api/conversion/billable",
      bigo_clickid: bigoClickId,
      duration,
      buyer,
      payout: payoutValue,
      event_id: "phone_consult",
      status: result.status,
      error: result.error,
      response: result.data,
    });
  }

  return res.status(200).json({
    accepted: result.ok,
    forwarded: result.ok,
    reason: result.ok ? null : "bigo_api_error",
    endpoint: "billable",
  });
});

module.exports = router;
