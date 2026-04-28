# Ringba to BIGO Conversion API

Node.js Express API for forwarding qualified Ringba calls to BIGO as conversion events.

## What this service does

1. Receives Ringba webhooks at `/api/conversion`
2. Validates:
   - `bigo_clickid` exists
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
│   └── logger.js
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

3. Update `.env` values (especially `BIGO_PIXEL_ID`, `RINGBA_WEBHOOK_SECRET`, and mode settings).
3. Update `.env` values (especially `BIGO_PIXEL_ID` and mode settings).

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
- `DEFAULT_PAYOUT`: Default conversion payout/value fallback (default: `35`)
- `BIGO_CUSTOM_URL`: Custom mode endpoint
- `BIGO_EVENT_NAME`: Custom mode event name (default: `OnlineConsultation`)
- `BIGO_WEB_EVENTS_URL`: Web events mode endpoint
- `BIGO_EVENT_ID`: Web events mode event ID (default: `consult`)
- `BIGO_CURRENCY`: Currency sent to BIGO (default: `USD`)
- `BIGO_VALUE`: Conversion value override (defaults to `DEFAULT_PAYOUT`)
- `BIGO_TIMEOUT_MS`: BIGO request timeout in ms (default: `10000`)

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

Always returns HTTP `200`.

## Local testing with curl

### 1) Valid conversion (should forward to BIGO)

```bash
curl -X POST http://localhost:3000/api/conversion \
  -H "Content-Type: application/json" \
  -d '{
    "bigo_clickid": "EihBMzQyVALID_CLICK_ID_EXAMPLE"
  }'
```

### 2) Rejection test: missing `bigo_clickid`

```bash
curl -X POST http://localhost:3000/api/conversion \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Logging behavior

- Logs every incoming request via middleware
- Logs webhook payload summary: timestamp, click ID, duration, qualified status
- Logs rejection reason when validation fails
- Logs BIGO response success/failure
- Writes logs to `logs/conversion.log`
- Performs daily rotation to `logs/conversion-YYYY-MM-DD.log`

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
