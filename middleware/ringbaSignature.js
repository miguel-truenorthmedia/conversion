const crypto = require("crypto");
const { logWarn } = require("../utils/logger");

const RINGBA_WEBHOOK_SECRET = process.env.RINGBA_WEBHOOK_SECRET || "";
const RINGBA_SIGNATURE_HEADER = (process.env.RINGBA_SIGNATURE_HEADER || "x-ringba-signature").toLowerCase();

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left), "utf8");
  const b = Buffer.from(String(right), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function readSignatureHeader(req) {
  const direct = req.headers[RINGBA_SIGNATURE_HEADER];
  if (direct) return Array.isArray(direct) ? direct[0] : direct;
  const fallbacks = [
    req.headers["x-ringba-signature"],
    req.headers["ringba-signature"],
    req.headers["x-signature"],
    req.headers.signature,
  ].filter(Boolean);
  if (!fallbacks.length) return "";
  const v = fallbacks[0];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * When RINGBA_WEBHOOK_SECRET is set, require valid HMAC-SHA256 of raw body.
 * When unset, skip verification (local/dev).
 */
function ringbaSignatureOptional(req, res, next) {
  if (!RINGBA_WEBHOOK_SECRET) {
    return next();
  }

  const providedRaw = readSignatureHeader(req);
  if (!providedRaw) {
    logWarn("WEBHOOK_REJECTED reason=missing_signature", { path: req.originalUrl });
    return res.status(200).json({ accepted: false, reason: "missing_signature" });
  }

  const provided = String(providedRaw).trim();
  const normalized = provided.replace(/^sha256=/i, "");
  const bodyBuffer =
    req.rawBody && Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body || {}), "utf8");

  const expectedHex = crypto.createHmac("sha256", RINGBA_WEBHOOK_SECRET).update(bodyBuffer).digest("hex");
  const expectedBase64 = crypto
    .createHmac("sha256", RINGBA_WEBHOOK_SECRET)
    .update(bodyBuffer)
    .digest("base64");

  const ok =
    timingSafeEqual(normalized, expectedHex) ||
    timingSafeEqual(normalized, expectedBase64) ||
    timingSafeEqual(provided, `sha256=${expectedHex}`);

  if (!ok) {
    logWarn("WEBHOOK_REJECTED reason=invalid_signature", { path: req.originalUrl });
    return res.status(200).json({ accepted: false, reason: "invalid_signature" });
  }

  next();
}

module.exports = {
  ringbaSignatureOptional,
};
