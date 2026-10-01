# SafeTube — YouTube whitelist parental control

A Chrome extension for the child's browser that blocks every YouTube video
unless a parent has approved it (or its whole channel is allowed), plus a
parent dashboard webpage for approving/declining requests.

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

## Project layout

- `extension/` — Chrome extension, Manifest V3, no build step. See
  `extension/EXTENSION_README.md`.
- `server/` — Node.js + Express + SQLite parent server & dashboard. See
  `server/SERVER_README.md`.

## Setup — parent side (do this first)

```bash
cd server
npm install
FAMILY_KEY=pick-a-strong-secret PARENT_PASSWORD=another-strong-secret npm start
```

- Dashboard: http://localhost:3000/ (login required when `PARENT_PASSWORD` is set)
- The server must be reachable from the child's browser. On the same home
  network, use the parent computer's LAN IP instead of `localhost`
  (e.g. `http://192.168.1.10:3000`). For access outside the home, host it on
  a small VPS or Raspberry Pi.
- Optional: set `YOUTUBE_API_KEY` (YouTube Data API v3 key) so the server can
  fill in missing video titles / channel names on requests.

## Setup — child side (Chrome extension)

1. On the child's computer, open `chrome://extensions`, enable
   **Developer mode**, click **Load unpacked**, select the `extension/`
   folder.
2. Open the extension's **Options** page: set the server URL
   (e.g. `http://192.168.1.10:3000`), the family key, and the child's name.
   Use **Test connection** to verify.
3. Lock it down: in `chrome://extensions`, the extension can still be
   disabled by anyone with access to that page. For real enforcement, pair
   this with OS-level parental controls:
   - **ChromeOS / Family Link**: manage the child's Google account and
     prevent extension changes.
   - **Windows/macOS**: use a non-admin account for the child so they
     can't install/remove extensions.

## What changed from the old SafeTube (migration notes)

The previous version of this repo was a Flask + `declarativeNetRequest` prototype.
This rewrite keeps every feature that mattered and rebuilds it on a simpler stack:

| Old SafeTube | New SafeTube |
|---|---|
| Flask + SQLAlchemy + Postgres, JWT auth, alembic migrations | Node + Express + SQLite, single file, zero-config DB |
| Blocked videos via `declarativeNetRequest` redirect to a static page | Full-page overlay with **request-approval flow** and 15 s polling |
| Channel allow = bulk-adding every video ID of the channel via YouTube API | **Channel whitelist**: one channel ID allows all its videos; extension reads the channel ID from page metadata; dashboard can "Approve + allow channel" |
| YouTube Data API required for channel features | API key **optional** — only used to enrich request metadata when the extension didn't supply it |
| Parent signup/login + child accounts + device pairing codes (JWT) | Simplified: `PARENT_PASSWORD` env gates the dashboard (scrypt-hashed, session cookie); the extension reports `childName` per request; dashboard shows a per-child summary |
| No parent dashboard for approvals | Full dashboard: pending requests, video whitelist, allowed channels, children, history |

Dropped without replacement: the old `rules.json` DNR approach (the overlay is
strictly better UX for an approval flow) and the committed `.venv/` leftovers
(the old virtualenv directory is still in the repo history but no longer used).

## Honest limitations

- This is a deterrent + approval workflow, not a sandbox. A tech-savvy
  child with admin access can disable the extension or read the family key
  from extension storage.
- Only covers youtube.com watch/shorts pages in Chrome. It does not cover
  the YouTube mobile app, embedded players on other sites, or other
  browsers.
- The dashboard has no login of its own beyond `PARENT_PASSWORD` — keep the
  server on your home network or put it behind your own authentication if
  exposed to the internet.
