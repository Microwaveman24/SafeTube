# SafeTube — YouTube whitelist parental control

A Chrome extension for the child's browser that blocks every YouTube video
unless a parent has approved it (or its whole channel is allowed), plus a
parent dashboard webpage for approving/declining requests.

**New in v4:** real parent accounts (email + bcrypt password, one-time setup),
tamper detection — if the child disables the extension the parent gets an
email — and a modular, scalable server codebase (see
`server/SERVER_README.md`).

## How it works

1. Child opens any YouTube video or Short → the extension checks the
   parent-approved **video whitelist** and **channel whitelist** → not on
   either? The video is paused and a full-screen overlay appears:
   "This video needs a parent's approval."
2. Child taps **Ask parent for approval** → the request (video + channel info)
   goes to the parent server.
3. Parent opens the dashboard, sees the request (thumbnail, title, channel,
   who asked), and taps **Approve**, **Decline**, or **Approve + allow channel**
   (approves the video and whitelists its entire channel at once).
4. The extension polls every 15 seconds. Approved → video plays and is
   whitelisted from then on. Declined → child sees "Parent declined this video."

If the extension can't reach the server, videos stay blocked (fail closed).

### Tamper detection

Each browser running the extension registers as a **device** and sends a
heartbeat every 3 minutes. If a device goes quiet longer than
`TAMPER_ALERT_AFTER_MINUTES` (default 30), the server emails the parent:
the PC may simply be off — or the extension may have been disabled or removed.
The dashboard's **Devices** section shows every device, its last check-in,
and whether an alert was sent.

## Project layout

- `extension/` — Chrome extension, Manifest V3, no build step. See
  `extension/EXTENSION_README.md`.
- `server/` — Node.js + Express + SQLite parent server & dashboard, modular
  `src/` layout (config, db layer, routes, services, middleware). See
  `server/SERVER_README.md`. Includes a `Dockerfile` for deployment.

## Setup — parent side (do this first)

```bash
cd server
npm install
FAMILY_KEY=$(openssl rand -hex 32) npm start
```

- Open the dashboard at http://localhost:3000/ — first run shows a
  **one-time setup page** to create your parent account (email + password).
  Log in with it from then on.
- The server must be reachable from the child's browser. On the same home
  network, use the parent computer's LAN IP instead of `localhost`
  (e.g. `http://192.168.1.10:3000`). For access outside the home, host it on
  a small VPS or Raspberry Pi (or build/run the included `Dockerfile`).
- To receive tamper alerts by email, configure SMTP (see `.env.example`;
  Gmail works with an App Password), then use the dashboard's **Send test
  email** button to verify.

## Setup — child side (Chrome extension)

1. On the child's computer, open `chrome://extensions`, enable
   **Developer mode**, click **Load unpacked**, select the `extension/`
   folder.
2. Open the extension's **Options** page: set the server URL
   (e.g. `http://192.168.1.10:3000`), the family key, and the child's name.
   Use **Test connection** to verify. The options page also shows this
   browser's device ID.
3. Lock it down: a child with access to `chrome://extensions` can still
   disable the extension — but now you'll get an email when they do. For
   real enforcement, pair this with OS-level parental controls:
   - **ChromeOS / Family Link**: manage the child's Google account and
     prevent extension changes.
   - **Windows/macOS**: use a non-admin account for the child so they
     can't install/remove extensions.

## What changed from the old SafeTube (migration notes)

The previous version of this repo was a Flask + `declarativeNetRequest` prototype.
This rewrite keeps every feature that mattered and rebuilds it on a simpler stack:

## Honest limitations

- This is a deterrent + approval workflow, not a sandbox. A tech-savvy
  child with admin access can disable the extension — but tamper detection
  means you'll know about it within ~30 minutes.
- Only covers youtube.com watch/shorts pages in Chrome. It does not cover
  the YouTube mobile app, embedded players on other sites, or other
  browsers.
- If the server is exposed to the internet, serve it over HTTPS and set
  `COOKIE_SECURE=true` (see `server/.env.example`).
