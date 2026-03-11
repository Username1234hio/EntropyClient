# EC Profile Server

Backend for Entropy Client identity cards.

## Deploy to Render (free)

1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo
4. Build command: `npm install`
5. Start command: `node server.js`
6. Add env var: `EC_SECRET` = any long random string
7. Add env var: `BASE_URL` = your Render URL (e.g. `https://ec-profile-server.onrender.com`)
8. Add a Disk: mount path `/data`, 1GB (free tier)
9. Update `DB_PATH` env var to `/data/profiles.db`

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/profile/:username` | None | Get a profile card |
| POST | `/profile/register` | None | Start claim flow |
| POST | `/profile/verify` | None | Verify bio code |
| POST | `/profile/login` | None | Re-auth (lost token) |
| PATCH | `/profile/update` | Bearer token | Update profile |
| POST | `/profile/links` | Bearer token | Add social link |
| DELETE | `/profile/links/:platform` | Bearer token | Remove social link |
| DELETE | `/profile` | Bearer token | Delete profile |
| GET | `/platforms` | None | List supported platforms |

## Verification flow

1. Client calls `POST /profile/register` with their kloak username
2. Server returns a `claim_code` like `ec-abc123xyz`
3. User adds that code to their kloak.app profile bio
4. Client calls `POST /profile/verify`
5. Server fetches the kloak profile page and looks for the code
6. On success, server returns an `edit_token` (valid 30 days)
7. All future edits use `Authorization: Bearer <edit_token>`