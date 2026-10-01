# SafeTube Server — Parent Dashboard & API

The parent-side half of SafeTube. It receives video-approval requests from the
child's Chrome extension, stores everything in SQLite, and serves the parent
dashboard at `/`.

## Run it

```bash
cd server
npm install
FAMILY_KEY=pick-a-strong-secret npm start
```

- Dashboard: http://localhost:3000/
- The server must be reachable from the child's browser. On the same home
  network use the parent computer's LAN IP (e.g. `http://192.168.1.10:3000`).

## Configuration (env vars, see `.env.example`)

| Var | Required | What it does |
|---|---|---|
| `FAMILY_KEY` | **yes** | Shared secret. The extension and dashboard send it as the `X-Family-Key` header on every `/api/*` call. Change from the default! |
| `PARENT_PASSWORD` | no | When set, the dashboard pages require a parent login (session cookie, 30 days). The password is stored as a salted scrypt hash, never plaintext. Leave empty only on a trusted home network. |
| `YOUTUBE_API_KEY` | no | YouTube Data API v3 key. When set, the server fills in missing video titles / channel names on approval requests. Everything works without it. |
| `PORT` | no | Default `3000`. |
| `DB_PATH` | no | Default `./safetube.db` in this directory (created automatically). |

## What the dashboard does

- **Pending requests** — each card shows the video thumbnail, title, channel,
  who asked, and when. *Approve* / *Decline*, or *Approve + allow channel* to
  approve the video and whitelist its entire channel at once.
- **Video whitelist** — approved videos; add by pasting a URL/ID, remove any.
- **Allowed channels** — every video from these channels plays without a
  request. Add by channel URL (`youtube.com/channel/UC…`) or raw channel ID.
- **Children** — child names seen in requests, with total/pending counts.
- **History** — past approve/decline decisions.

## API reference

All `/api/*` routes (except `/api/auth/login` and `/api/auth/logout`) require
the `X-Family-Key` header. `401` JSON on missing/wrong key.

| Method & path | Body | Returns |
|---|---|---|
| `POST /api/requests` | `{videoId, title?, url?, childName?, channelId?, channelTitle?}` | `201 {id, status:"pending"}` |
| `GET /api/requests?status=pending\|approved\|denied\|all` | — | `[{id, videoId, title, url, childName, channelId, channelTitle, status, createdAt}]` |
| `GET /api/requests/:id` | — | `{id, status}` (the extension polls this) |
| `POST /api/requests/:id/decision` | `{decision:"approved"\|"denied", alsoAllowChannel?}` | `{id, status, channelAllowed}` — approving auto-adds the video to the whitelist; `alsoAllowChannel:true` also whitelists its channel |
| `GET /api/whitelist` | — | `{videoIds:[...]}` |
| `POST /api/whitelist` | `{videoId}` | `{ok:true}` |
| `DELETE /api/whitelist/:videoId` | — | `{ok:true}` |
| `GET /api/channel-whitelist` | — | `{channels:[{channelId,title,addedAt}], channelIds:[...]}` |
| `POST /api/channel-whitelist` | `{channelId, title?}` | `{ok:true}` |
| `DELETE /api/channel-whitelist/:channelId` | — | `{ok:true}` |
| `GET /api/children` | — | `{children:[{name, requests, pending}]}` |
| `POST /api/auth/login` | `{password}` (no family key needed) | sets `st_session` cookie; `{ok:true}` |
| `POST /api/auth/logout` | — | clears the session |

## Smoke test

```bash
FAMILY_KEY=test PORT=3001 DB_PATH=/tmp/st-test.db node server.js &
K=test B=http://localhost:3001
curl -s -H "X-Family-Key: $K" $B/api/whitelist   # {"videoIds":[]}
```

## Notes

- The extension polls `GET /api/whitelist` ~1/min and `GET /api/channel-whitelist`
  with it, plus one `GET /api/requests/:id` every 15 s per pending request.
- `channelIds` on requests come from the extension's page metadata; if the
  extension couldn't read them and `YOUTUBE_API_KEY` is set, the server fills
  them in. Either way the request is never blocked by a failed lookup.
- Keep `node_modules/`, `*.db*`, and `.env` out of git (see `.gitignore`).
