# SafeTube Server — Parent Dashboard & API

The parent-side half of SafeTube. It receives video-approval requests from the
child's Chrome extension, stores everything in SQLite, watches device
heartbeats for tampering, and serves the parent dashboard at `/`.

## Run it

```bash
cd server
npm install
FAMILY_KEY=$(openssl rand -hex 32) npm start
```

- Dashboard: http://localhost:3000/ — first visit shows a one-time setup
  page to create the parent account (email + password).
- The server must be reachable from the child's browser. On the same home
  network use the parent computer's LAN IP (e.g. `http://192.168.1.10:3000`).

### Docker

```bash
cd server
docker build -t safetube .
docker run -d --name safetube -p 3000:3000 \
  -e FAMILY_KEY=$(openssl rand -hex 32) \
  -v safetube-data:/data \
  safetube
```

The SQLite database persists in the `safetube-data` volume.

## Architecture

Built to stay small but grow cleanly. All server code lives in `src/`:

```
server.js              thin entry point: validates config, boots app + watchdog
src/
  config.js            env parsing + validation (fails fast on bad config)
  logger.js            leveled timestamped logger
  app.js               Express assembly: middleware, routes, error handler
  db/
    index.js           SQLite connection, schema, lightweight migrations
    parents.js         parent accounts (bcrypt)
    sessions.js        login sessions
    devices.js         child devices + heartbeats
    requests.js        approval requests
    whitelists.js      video + channel whitelists
  middleware/
    auth.js            requireParent (session cookie) / requireFamilyKey
    validate.js        input validation helpers
    rateLimit.js       brute-force + abuse protection
  routes/
    auth.js            setup / login / logout / me / change-password
    devices.js         register + heartbeat (extension) / list + test-email (parent)
    requests.js        submit + poll (extension) / list + decision (parent)
    whitelist.js       video whitelist
    channels.js        channel whitelist
    children.js        per-child request stats
  services/
    mailer.js          SMTP email (tamper alerts)
    monitor.js         heartbeat watchdog → raises email alerts
    youtube.js         optional YouTube Data API enrichment
public/
  index.html / app.js  parent dashboard (session auth, no family key in browser)
  login.html / setup.html (+ .js)  login and one-time setup pages
```

Conventions that keep it scalable:

- **All SQL lives in `src/db/`** behind small function APIs. Swapping SQLite
  for Postgres later means re-implementing those modules, not hunting SQL
  through route handlers.
- **Two credentials, two audiences**: the extension uses `X-Family-Key`;
  dashboard management requires a parent login session. A leaked family key
  can't manage the dashboard.
- **Validation at the boundary** (`middleware/validate.js`); **errors in one
  place** (central error handler in `app.js`); **config validated at boot**.
- The watchdog (`services/monitor.js`) is a plain module with a `checkOnce()`
  export — easy to unit test or move to a worker later.

## Configuration (env vars, see `.env.example`)

| Var | Required | What it does |
|---|---|---|
| `FAMILY_KEY` | **yes** (min 12 chars) | Shared secret the child's extension sends as `X-Family-Key`. |
| `TAMPER_ALERT_AFTER_MINUTES` | no (30) | Quiet period before a device is flagged. |
| `ALERT_COOLDOWN_HOURS` | no (12) | Min gap between repeat alerts per device. |
| `MONITOR_INTERVAL_MINUTES` | no (5) | Watchdog scan interval. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | no | SMTP for tamper-alert emails. Unset → alerts only log + show in dashboard. Gmail works with an App Password. |
| `ALERT_EMAIL` | no | Alert recipient. Defaults to the parent account email. |
| `YOUTUBE_API_KEY` | no | YouTube Data API v3 key; fills in missing titles/channels on requests. |
| `BCRYPT_ROUNDS` | no (12) | bcrypt cost for parent passwords. |
| `COOKIE_SECURE` | no (false) | Set `true` when serving over HTTPS. |
| `PORT` / `DB_PATH` / `LOG_LEVEL` | no | Defaults `3000`, `./safetube.db`, `info`. |

## What the dashboard does

- **Pending requests** — thumbnail, title, channel, who asked, when.
  *Approve* / *Decline*, or *Approve + allow channel*.
- **Devices** — every browser running the extension: online/quiet status,
  last check-in, alert state; *Send test email* verifies SMTP; forget a device.
- **Video whitelist** — approved videos; add by URL/ID, remove any.
- **Allowed channels** — every video from these channels plays freely.
- **Children** — request totals per child name. **History** — past decisions.
- **Account** — change the parent password.

## API reference

Two auth schemes:

- **Extension/device routes** require the `X-Family-Key` header.
- **Parent routes** require the `st_session` login cookie (set by `/api/auth/login`).

### Auth (public except where noted)

| Method & path | Body | Returns |
|---|---|---|
| `GET /api/auth/status` | — | `{setupRequired, loggedIn, email?}` |
| `POST /api/auth/setup` | `{email, password}` (min 8) | `201 {ok, email}` — only when no parent exists |
| `POST /api/auth/login` | `{email, password}` | sets `st_session` cookie; `{ok, email}` |
| `POST /api/auth/logout` | — | clears the session |
| `GET /api/auth/me` | — | `{id, email, createdAt}` (login required) |
| `POST /api/auth/change-password` | `{currentPassword, newPassword}` | `{ok:true}` (login required) |

### Devices

| Method & path | Auth | Body | Returns |
|---|---|---|---|
| `POST /api/devices/register` | family key | `{deviceId, childName?}` | `201 {ok, device}` |
| `POST /api/devices/heartbeat` | family key | `{deviceId, childName?}` | `{ok:true}` (auto-registers unknown IDs) |
| `GET /api/devices` | parent | — | `{devices:[{deviceId, childName, lastSeenAt, status, alerted, …}]}` |
| `DELETE /api/devices/:deviceId` | parent | — | `{ok:true}` |
| `POST /api/devices/test-email` | parent | — | `{ok:true, to}` |

### Requests & whitelists

| Method & path | Auth | Body | Returns |
|---|---|---|---|
| `POST /api/requests` | family key | `{videoId, title?, url?, childName?, channelId?, channelTitle?}` | `201 {id, status:"pending"}` |
| `GET /api/requests/:id` | family key | — | `{id, status}` (the extension polls this) |
| `GET /api/requests?status=pending\|approved\|denied\|all` | parent | — | `[{…}]` |
| `POST /api/requests/:id/decision` | parent | `{decision:"approved"\|"denied", alsoAllowChannel?}` | `{id, status, channelAllowed}` |
| `GET /api/whitelist` | family key | — | `{videoIds:[...]}` |
| `POST /api/whitelist` | parent | `{videoId}` | `{ok:true}` |
| `DELETE /api/whitelist/:videoId` | parent | — | `{ok:true}` |
| `GET /api/channel-whitelist` | family key | — | `{channels:[…], channelIds:[…]}` |
| `POST /api/channel-whitelist` | parent | `{channelId, title?}` | `{ok:true}` |
| `DELETE /api/channel-whitelist/:channelId` | parent | — | `{ok:true}` |
| `GET /api/children` | parent | — | `{children:[{name, requests, pending}]}` |

## Tamper detection in detail

1. The extension registers a stable device ID on install and POSTs
   `/api/devices/heartbeat` every 3 minutes (`chrome.alarms`).
2. `services/monitor.js` runs every `MONITOR_INTERVAL_MINUTES` and finds
   devices quieter than `TAMPER_ALERT_AFTER_MINUTES` that haven't been
   alerted within `ALERT_COOLDOWN_HOURS`.
3. Each is emailed to the parent (`ALERT_EMAIL` or the parent account email)
   and marked alerted. When the device checks in again, the alert state
   clears and a "back online" email is sent.
4. A quiet device is usually just a powered-off PC — the email says so.

## Smoke test

```bash
FAMILY_KEY=testsecret123 PORT=3001 DB_PATH=/tmp/st-test.db node server.js &
K=testsecret123 B=http://localhost:3001
curl -s -H "X-Family-Key: $K" $B/api/whitelist          # {"videoIds":[]}
curl -s -H "X-Family-Key: $K" -X POST $B/api/devices/register \
  -H 'Content-Type: application/json' -d '{"deviceId":"d1","childName":"Alex"}'
curl -s $B/api/auth/status                              # {"setupRequired":true,...}
```

## Notes

- Rate limiting: auth endpoints 20 req/15 min per IP; general API 1000/15 min.
- Sessions live in the DB (30-day expiry), so restarts don't log the parent out.
- Keep `node_modules/`, `*.db*`, and `.env` out of git (see `.gitignore`).
