# Ringba to BIGO Conversion API

Node.js Express API for forwarding qualified Ringba calls to BIGO as conversion events.

## What this service does

1. Receives Ringba webhooks at:
   - `POST /api/conversion` — primary pixel; **POST** JSON to BIGO Web Events with fixed `event_id=consult` (online consultation); **monetary value** = Ringba `payout` field, or `0` if missing / invalid / negative.
   - `POST /api/conversion/secondary` — same as primary with `SECONDARY_BIGO_PIXEL_ID`.
   - `POST /api/conversion/raw` — **Pay per call**: buyer connect → BIGO **`form_button`** via **GET**; **value** = Ringba `payout` or `0`.
   - `POST /api/conversion/billable` — **Pay per call**: billable → BIGO **`phone_consult`** via **GET**; **value** = Ringba `payout` or `0`.
2. Validates:
   - `bigo_clickid` exists (all endpoints). No default payout: **`payout` is always read from the payload**; missing or non-numeric → **0** (never substituted from env).
3. Forwards valid calls to BIGO Event API
4. Always returns HTTP `200` to Ringba (prevents retries)

## Project structure

```text
conversion-api/
├── server.js
├── routes/
│   └── conversion.js
├── services/
│   └── bigoApi.js
├── middleware/
│   ├── logger.js
│   └── ringbaSignature.js
├── utils/
│   └── logger.js
├── logs/
│   ├── conversion.log
│   └── conversion-YYYY-MM-DD.log
├── .env.example
├── package.json
└── README.md
```

## Requirements

- Node.js 18+
- npm

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Update `.env` values (especially `BIGO_PIXEL_ID`, `SECONDARY_BIGO_PIXEL_ID`, and mode settings).

4. Run locally:

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## Environment variables

- `PORT`: Server port (default: `3000`)
- `MIN_DURATION`: Optional legacy field, ignored by forwarding logic
- `BIGO_API_MODE`: `custom` or `web_events`
- `BIGO_ACCESS_TOKEN`: Only required for `custom` mode (ignored in `web_events`)
- `BIGO_PIXEL_ID`: BIGO pixel ID
- `SECONDARY_BIGO_PIXEL_ID`: Secondary pixel ID used by `/api/conversion/secondary`
- `BIGO_CUSTOM_URL`: Custom mode endpoint
- `BIGO_EVENT_NAME`: Custom mode event name (default: `OnlineConsultation`)
- `BIGO_WEB_EVENTS_URL`: Web events mode endpoint
- `BIGO_CURRENCY`: Currency sent to BIGO (default: `USD`)
- `BIGO_TIMEOUT_MS`: BIGO request timeout in ms (default: `10000`)
- `RINGBA_WEBHOOK_SECRET`: Optional. If set, `POST /api/conversion/raw` and `POST /api/conversion/billable` require a valid HMAC-SHA256 signature of the raw JSON body (see below).
- `RINGBA_SIGNATURE_HEADER`: Header name for the signature (default: `x-ringba-signature`).

## API endpoints

### Health check

`GET /health`

Example response:

```json
{
  "status": "ok",
  "timestamp": "2026-04-24T06:00:00.000Z"
}
```

### Conversion webhook

`POST /api/conversion`

Always returns HTTP `200`. JSON body typically includes `accepted`, `forwarded`, `reason` (null on success), and `endpoint` (`primary` | `secondary` | `raw` | `billable`). Ringba HMAC is **not** applied here—only on `/raw` and `/billable` when `RINGBA_WEBHOOK_SECRET` is set.

### Secondary conversion webhook

`POST /api/conversion/secondary`

Same behavior as primary endpoint, but forwards using `SECONDARY_BIGO_PIXEL_ID`.

### Pay per call — raw connect (`form_button`, value from `payout`)

`POST /api/conversion/raw`

- **Ringba**: fire when any call connects to a buyer.
- **BIGO** (`BIGO_API_MODE=web_events`): **GET** `https://api.bytegle.site/bigoad/trackingevent` with query params: `bbg`, `pixel_id` (= `BIGO_PIXEL_ID`), `event_id=form_button`, `timestamp_ms`, `monetary` (= numeric `payout` from body, or **0**), `currency=USD`.
- Body example:

```json
{
  "bigo_clickid": "[tag:User:bigo_clickid]",
  "caller_id": "[tag:InboundNumber:Number-NoPlus]",
  "duration": "[Call:DurationInSeconds]",
  "buyer": "[Target:Name]",
  "payout": "[Call:Payout]"
}
```

Include `payout` so the GET `value` matches Ringba (often `0` on connect if payout is not yet available).

### Pay per call — billable (`phone_consult`, value = payout)

`POST /api/conversion/billable`

- **Ringba**: fire when your rules say billable (e.g. duration ≥ 30s and payout &gt; 0 — configure in Ringba).
- **API**: always forwards when `bigo_clickid` is present; **`value` sent to BIGO** = numeric `payout` from the body, or **0** if missing, non-numeric, or negative.
- **BIGO**: **GET** same URL with `event_id=phone_consult` and `value=<resolved payout>`.
- Body example:

```json
{
  "bigo_clickid": "[tag:User:bigo_clickid]",
  "caller_id": "[tag:InboundNumber:Number-NoPlus]",
  "duration": "[Call:DurationInSeconds]",
  "payout": "[Call:Payout]",
  "buyer": "[Target:Name]"
}
```

### Ringba webhook setup (two webhooks)

Replace `https://your-server.com` with your public base URL (e.g. `https://192.241.129.11` or your domain).

**Webhook 1 — Raw call (connect)**

- **URL**: `https://your-server.com/api/conversion/raw`
- **Method**: `POST`
- **Content-Type**: `application/json`
- **Body** (paste into Ringba JSON body; tokens are Ringba dynamic fields):

```json
{
  "bigo_clickid": "[tag:User:bigo_clickid]",
  "caller_id": "[tag:InboundNumber:Number-NoPlus]",
  "duration": "[Call:DurationInSeconds]",
  "buyer": "[Target:Name]",
  "payout": "[Call:Payout]"
}
```

- **Trigger**: your Ringba automation when a call connects to any buyer (match your account UI).

If you set `RINGBA_WEBHOOK_SECRET` in the server `.env`, configure Ringba to send an HMAC-SHA256 of the **exact** JSON body in header `x-ringba-signature` (hex, base64, or `sha256=<hex>`), same secret as the server. **`POST /api/conversion` and `/secondary` do not require this header** (signature middleware applies only to `/raw` and `/billable`).

**Webhook 2 — Billable**

- **URL**: `https://your-server.com/api/conversion/billable`
- **Method**: `POST`
- **Body**:

```json
{
  "bigo_clickid": "[tag:User:bigo_clickid]",
  "caller_id": "[tag:InboundNumber:Number-NoPlus]",
  "duration": "[Call:DurationInSeconds]",
  "payout": "[Call:Payout]",
  "buyer": "[Target:Name]"
}
```

- **Trigger**: duration ≥ 30 seconds **and** payout &gt; 0 (set in Ringba; the API does not substitute defaults — it sends `value=0` if `payout` is absent or invalid).

## Local testing with curl

### 1) Valid conversion (should forward to BIGO)

```bash
curl -X POST http://localhost:3000/api/conversion \
  -H "Content-Type: application/json" \
  -d '{
    "bigo_clickid": "EihBMzQyVALID_CLICK_ID_EXAMPLE",
    "payout": 35
  }'
```

### 2) Rejection test: missing `bigo_clickid`

```bash
curl -X POST http://localhost:3000/api/conversion \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 3) Secondary pixel endpoint test

```bash
curl -X POST http://localhost:3000/api/conversion/secondary \
  -H "Content-Type: application/json" \
  -d '{
    "bigo_clickid": "EihBMzQyVALID_CLICK_ID_EXAMPLE",
    "payout": 25
  }'
```

### 4) Pay per call — valid raw (`form_button`, `value` = `payout` or 0)

```bash
curl -X POST http://localhost:3000/api/conversion/raw \
  -H "Content-Type: application/json" \
  -d '{
    "bigo_clickid": "EihBMzQyVALID_CLICK_ID_EXAMPLE",
    "caller_id": "15551234567",
    "duration": 45,
    "buyer": "Test Buyer",
    "payout": 0
  }'
```

### 5) Pay per call — valid billable (`phone_consult`, value = payout)

```bash
curl -X POST http://localhost:3000/api/conversion/billable \
  -H "Content-Type: application/json" \
  -d '{
    "bigo_clickid": "EihBMzQyVALID_CLICK_ID_EXAMPLE",
    "caller_id": "15551234567",
    "duration": 120,
    "payout": 42.5,
    "buyer": "Test Buyer"
  }'
```

### 6) Missing `bigo_clickid` (raw or billable)

```bash
curl -X POST http://localhost:3000/api/conversion/raw \
  -H "Content-Type: application/json" \
  -d '{"caller_id":"15551234567","duration":10,"buyer":"X"}'
```

### 7) Billable — zero payout (still forwards to BIGO with `value=0`)

```bash
curl -X POST http://localhost:3000/api/conversion/billable \
  -H "Content-Type: application/json" \
  -d '{
    "bigo_clickid": "EihBMzQyVALID_CLICK_ID_EXAMPLE",
    "duration": 120,
    "payout": 0,
    "buyer": "Test Buyer"
  }'
```

## Logging behavior

- Logs every incoming request via middleware (method, path, timing).
- Logs webhook summaries to console and **`logs/conversion.log`** (with daily rotation to `logs/conversion-YYYY-MM-DD.log`): endpoint, `bigo_clickid`, `payout` / `resolved_payout`, duration, buyer (raw/billable), plus BIGO success or failure and rejection reasons (`missing_bigo_clickid`, `missing_signature`, `invalid_signature`, etc.).
- Primary routes may still log extra Ringba fields if present (`qualified`, `age`, `type`, etc.).

## BIGO GET endpoints (`/raw`, `/billable`)

- These routes call BIGO via **GET** only when **`BIGO_API_MODE=web_events`**. Otherwise the GET helper returns an error (logged; HTTP response is still **200** with `bigo_api_error` when BIGO forward fails).

## Deploy on Ubuntu VPS

1. Install Node.js and PM2.
2. Copy project to server and install dependencies:

```bash
npm install --production
```

3. Configure `.env`.
4. Start with PM2:

```bash
pm2 start server.js --name conversion-api
```

5. Enable auto-start on reboot:

```bash
pm2 save
pm2 startup
```

## BIGO API mode notes

- Use `BIGO_API_MODE=custom` to follow your requested bearer-token contract.
- Use `BIGO_API_MODE=web_events` to send to BIGO documented Web Events API format.
- In `web_events` mode, the service does not send an `Authorization` header and does not require `BIGO_ACCESS_TOKEN`.
- **Primary** `POST /api/conversion` uses fixed **`consult`** for Web Events POST JSON (not configurable via env). **`/raw`** and **`/billable`** use **`form_button`** and **`phone_consult`** respectively (path-based).
- **Raw / billable** endpoints use **GET** to `BIGO_WEB_EVENTS_URL` with flat query parameters (`bbg`, `pixel_id`, `event_id`, `timestamp_ms`, `monetary`, `currency`). **All monetary values** come from the Ringba JSON field **`payout`** (or **0** if missing/invalid); there are **no** `DEFAULT_PAYOUT` / `BIGO_VALUE` env fallbacks.
