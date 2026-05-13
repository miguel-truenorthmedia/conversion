const axios = require("axios");

const BIGO_API_MODE = (process.env.BIGO_API_MODE || "custom").toLowerCase();
const BIGO_CUSTOM_URL =
  process.env.BIGO_CUSTOM_URL || "https://api.bigo.sg/bigo_api_gateway/adsc/v1/event";
const BIGO_WEB_EVENTS_URL =
  process.env.BIGO_WEB_EVENTS_URL || "https://api.bytegle.site/bigoad/trackingevent";
const BIGO_ACCESS_TOKEN = process.env.BIGO_ACCESS_TOKEN || "";
const BIGO_PIXEL_ID = String(process.env.BIGO_PIXEL_ID || "906523332026341632");
const BIGO_EVENT_NAME = process.env.BIGO_EVENT_NAME || "OnlineConsultation";
/** Primary POST /api/conversion web_events: fixed online-consultation mapping (not env-driven). */
const PRIMARY_WEB_EVENTS_EVENT_ID = "consult";
const BIGO_CURRENCY = process.env.BIGO_CURRENCY || "USD";
const BIGO_TIMEOUT_MS = Number(process.env.BIGO_TIMEOUT_MS || 10000);

function buildCustomPayload({ bigoClickId, eventTimeSeconds, conversionValue, pixelId }) {
  return {
    pixel_id: String(pixelId),
    event: BIGO_EVENT_NAME,
    event_time: eventTimeSeconds,
    user_data: {
      bbg: bigoClickId,
    },
    custom_data: {
      currency: BIGO_CURRENCY,
      value: conversionValue,
    },
  };
}

function buildWebEventsPayload({ bigoClickId, conversionValue, pixelId }) {
  return {
    bbg: bigoClickId,
    pixel_id: String(pixelId),
    timestamp_ms: Date.now(),
    event: {
      event_id: PRIMARY_WEB_EVENTS_EVENT_ID,
      currency: BIGO_CURRENCY,
      monetary: String(conversionValue),
    },
  };
}

async function sendBigoConversion({
  bigoClickId,
  eventTimeSeconds,
  conversionValue = 0,
  pixelIdOverride,
}) {
  try {
    const resolvedPixelId = String(pixelIdOverride || BIGO_PIXEL_ID);
    let url = BIGO_CUSTOM_URL;
    let headers = {
      "Content-Type": "application/json",
    };
    let payload = buildCustomPayload({
      bigoClickId,
      eventTimeSeconds,
      conversionValue,
      pixelId: resolvedPixelId,
    });

    if (BIGO_API_MODE === "web_events") {
      url = BIGO_WEB_EVENTS_URL;
      payload = buildWebEventsPayload({
        bigoClickId,
        conversionValue,
        pixelId: resolvedPixelId,
      });
      headers = {
        "Content-Type": "application/json",
      };
    } else {
      if (!BIGO_ACCESS_TOKEN) {
        return {
          ok: false,
          status: 400,
          data: null,
          error: "missing_bigo_access_token_for_custom_mode",
        };
      }
      headers.Authorization = `Bearer ${BIGO_ACCESS_TOKEN}`;
    }

    const response = await axios.post(url, payload, {
      headers,
      timeout: BIGO_TIMEOUT_MS,
      validateStatus: () => true,
    });

    const isSuccess =
      BIGO_API_MODE === "web_events"
        ? response.status >= 200 && response.status < 300 && Number(response.data?.code) === 1
        : response.status >= 200 && response.status < 300;

    return {
      ok: isSuccess,
      status: response.status,
      data: response.data,
      error: isSuccess ? null : "upstream_rejected",
    };
  } catch (error) {
    return {
      ok: false,
      status: error.response?.status || 500,
      data: error.response?.data || null,
      error: error.message || "unknown_error",
    };
  }
}

/**
 * BIGO Web Events API — GET variant (Pay Per Call raw / billable postbacks).
 * Query: bbg, pixel_id, event_id, timestamp_ms, monetary, currency
 */
async function sendBigoWebEventsGet({
  bigoClickId,
  pixelId,
  eventId,
  value,
  currency = BIGO_CURRENCY,
}) {
  if ((process.env.BIGO_API_MODE || "custom").toLowerCase() !== "web_events") {
    return {
      ok: false,
      status: 400,
      data: null,
      error: "web_events_mode_required_for_get_tracking",
    };
  }

  try {
    const resolvedPixelId = String(pixelId || BIGO_PIXEL_ID);
    const timestampMs = Date.now();
    const numericValue = Number(value);
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

    const params = {
      bbg: String(bigoClickId),
      pixel_id: resolvedPixelId,
      event_id: String(eventId),
      timestamp_ms: timestampMs,
      monetary: safeValue,
      currency: String(currency || "USD"),
    };

    const response = await axios.get(BIGO_WEB_EVENTS_URL, {
      params,
      timeout: BIGO_TIMEOUT_MS,
      validateStatus: () => true,
    });

    const isSuccess =
      response.status >= 200 && response.status < 300 && Number(response.data?.code) === 1;

    return {
      ok: isSuccess,
      status: response.status,
      data: response.data,
      error: isSuccess ? null : "upstream_rejected",
      request_url: response.config?.url || BIGO_WEB_EVENTS_URL,
    };
  } catch (error) {
    return {
      ok: false,
      status: error.response?.status || 500,
      data: error.response?.data || null,
      error: error.message || "unknown_error",
    };
  }
}

module.exports = {
  sendBigoConversion,
  sendBigoWebEventsGet,
};
