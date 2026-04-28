const express = require("express");
const { sendBigoConversion } = require("../services/bigoApi");
const { logError, logInfo, logWarn } = require("../utils/logger");

const router = express.Router();
const FALLBACK_DEFAULT_PAYOUT = 35;

function parsePositiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function resolveConversionValue(payload) {
  const ringbaValue = parsePositiveNumber(payload?.conversion_amount);
  if (ringbaValue !== null) {
    return { value: ringbaValue, source: "ringba_dynamic" };
  }

  const envOverrideValue = parsePositiveNumber(process.env.BIGO_VALUE);
  if (envOverrideValue !== null) {
    return { value: envOverrideValue, source: "env_override" };
  }

  const defaultPayoutValue = parsePositiveNumber(process.env.DEFAULT_PAYOUT) || FALLBACK_DEFAULT_PAYOUT;
  return { value: defaultPayoutValue, source: "default_payout" };
}

router.post("/", async (req, res) => {
  const payload = req.body || {};
  const bigoClickId = payload.bigo_clickid;
  const conversion = resolveConversionValue(payload);

  logInfo("WEBHOOK_RECEIVED", {
    bigo_clickid: bigoClickId || null,
    qualified: payload.qualified || null,
    duration: payload.duration ?? null,
    caller_id: payload.caller_id || null,
    age: payload.age || null,
    type: payload.type || null,
    conversion_amount: payload.conversion_amount ?? null,
    resolved_value: conversion.value,
    value_source: conversion.source,
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
    conversionValue: conversion.value,
  });

  if (result.ok) {
    logInfo("BIGO_FORWARD_SUCCESS", {
      status: result.status,
      response: result.data,
      bigo_clickid: bigoClickId,
      conversion_value: conversion.value,
      value_source: conversion.source,
    });
  } else {
    logError("BIGO_FORWARD_FAILURE", {
      status: result.status,
      error: result.error,
      response: result.data,
      bigo_clickid: bigoClickId,
      conversion_value: conversion.value,
      value_source: conversion.source,
    });
  }

  return res.status(200).json({
    accepted: result.ok,
    forwarded: result.ok,
    reason: result.ok ? null : "bigo_api_error",
  });
});

module.exports = router;
