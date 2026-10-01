# SafeTube — Chrome Extension (child's browser)

Blocks every YouTube video (`youtube.com/watch` and `youtube.com/shorts`) unless the
video ID is on the parent-approved video whitelist **or** its channel is on the
parent-approved channel whitelist, both served by the SafeTube parent server.
Blocked videos show a full-page overlay where the child can request parent approval;
the overlay polls the server every 15 seconds until the request is approved or denied.
If the server can't be reached, the extension **fails closed** — the video stays blocked.

No build step: plain JS/CSS/HTML, load unpacked via `chrome://extensions`.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3: content scripts, host permissions, service worker, options page |
| `content.js` | Runs on YouTube watch/shorts pages. Extracts video ID, checks whitelist, pauses video ASAP, injects the blocking overlay, handles the approval-request + polling flow, re-checks on YouTube SPA navigations |
| `background.js` | Service worker. Caches the video + channel whitelists (refresh every 60 s via `chrome.alarms`), proxies all backend API calls with the `X-Family-Key` header, remembers session-approved video IDs |
| `overlay.css` | Full-viewport blocking overlay styles |
| `options.html` / `options.js` | Settings page: backend base URL, family key, child name + **Test connection** button |

## Load unpacked

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder.
4. Open the extension's **Details → Extension options** (or right-click the toolbar icon → Options).

## Configure (a parent should do this)

- **Parent server base URL** — default `http://localhost:3000`. Point it at wherever the
  SafeTube server runs (e.g. `http://192.168.1.10:3000` on the home network).
- **Family key** — the shared secret; must match the server's `FAMILY_KEY`.
- **Child name** — sent with approval requests so the parent knows who asked.
- Click **Test connection**: it does `GET {base}/api/whitelist` with your key and reports
  success/failure plus the current whitelist size.

## How it works

1. On any `youtube.com/watch?v=…` or `youtube.com/shorts/…` page, the content script
   extracts the 11-character video ID and the uploader's channel ID
   (`<meta itemprop="channelId">`, with a short retry since YouTube renders it
   after `document_start`), then asks the background worker for the whitelists.
2. The background worker serves its cache (refreshed from `GET /api/whitelist` and
   `GET /api/channel-whitelist` every 60 s, and whenever the cache is stale at
   navigation time).
3. Video-whitelisted, channel-whitelisted, or approved-this-session → video plays normally.
4. Otherwise → all `<video>` elements are paused immediately (including vetoing `play`
   events), and a full-viewport overlay appears showing the thumbnail
   (`https://i.ytimg.com/vi/{id}/hqdefault.jpg`), the video title (and channel name
   when known), and an **Ask parent for approval** button.
5. Clicking it sends `POST /api/requests {videoId, title, url, childName, channelId, channelTitle}` → the overlay
   switches to "Request sent — waiting for parent…" and polls `GET /api/requests/{id}`
   every 15 s. On `approved` the overlay is removed and the video plays (the ID is also
   remembered for the session). On `denied` it shows "Parent declined this video."
6. YouTube navigations without full reloads are caught via `yt-navigate-finish` plus a
   fallback URL-change poll, so hopping between videos re-runs the check every time.

## Permissions rationale

- `storage` — settings + whitelist cache.
- `alarms` — reliable 60-second whitelist refresh (MV3 service workers can't use `setInterval`).
- `host_permissions: <all_urls>` — the backend URL is user-configurable (localhost today,
  a LAN IP or public HTTPS host tomorrow), so a fixed host list can't cover it. If your
  deployment uses one fixed server, narrow this to that origin in `manifest.json`.

## API contract used (implemented exactly as specified)

| Call | Details |
|---|---|
| `GET {base}/api/whitelist` | Header `X-Family-Key`. Expects `{videoIds:[...]}`. Used by background refresh (60 s) and options "Test connection". |
| `GET {base}/api/channel-whitelist` | Header `X-Family-Key`. Expects `{channelIds:[...]}` (the dashboard shape also includes `channels`). Refreshed alongside the video whitelist; failures are tolerated (treated as empty). |
| `POST {base}/api/requests` | Header `X-Family-Key`. Body `{videoId, title, url, childName, channelId, channelTitle}`. Expects `201 {id, status:"pending"}`. Any non-2xx → request shown as failed, video stays blocked. |
| `GET {base}/api/requests/{id}` | Header `X-Family-Key`. Expects `{id, status}` with `status` ∈ `pending`/`approved`/`denied`. Polled every 15 s per pending request. |

## Known limitations (be honest with parents)

- **Client-side control, not a sandbox.** A determined child can disable/remove the
  extension, use Incognito (unless the extension is explicitly allowed there), another
  browser/profile, or the YouTube mobile app. Pair with OS-level controls
  (managed Chromebook profile, DNS filtering, etc.) for real enforcement.
- **Family key is stored in plaintext** in `chrome.storage.local`. Anyone with access
  to the browser profile can read it and could approve their own requests directly
  against the server API.
- **Options page has no parent PIN.** A child who finds the options can change the
  server URL/key to bypass blocking. Consider OS-level restrictions on
  `chrome://extensions`.
- **Scope:** only `youtube.com/watch` and `youtube.com/shorts` pages are intercepted —
  not the YouTube homepage, search results, channel pages, embeds on other sites,
  `youtu.be` short links, or YouTube Music.
- The blocked video's **thumbnail and title remain visible** in the overlay (needed so
  the parent knows what is being requested).
- **Fail-closed by design:** if the parent server is down or unreachable, *no* videos
  play (except none — everything is blocked until the whitelist can be verified).
- Approval is per-browser-session: the extension remembers approved IDs locally, but
  other devices/browsers only allow the video once the server adds it to the whitelist
  (recommended server behavior on approval).
