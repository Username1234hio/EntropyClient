# EC Profile Server

Backend for Entropy Client identity cards. **100% free** — no disk or credit card needed.

## Stack
- **Render** free tier — web server
- **Turso** free tier — database (500MB, no disk required)

---

## Setup: Turso (do this first)

1. Go to [turso.tech](https://turso.tech) and sign up free
2. Install the CLI: `curl -sSfL https://get.tur.so/install.sh | bash`
3. Create a database:
   ```
   turso db create ec-profiles
   ```
4. Get your URL:
   ```
   turso db show ec-profiles
   ```
   Copy the **URL** (looks like `libsql://ec-profiles-yourname.turso.io`)
5. Create an auth token:
   ```
   turso db tokens create ec-profiles
   ```
   Copy the token output.

---

## Setup: Render

1. Push this entire repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Set **Root Directory** to `server`
5. Build command: `npm install`
6. Start command: `node server.js`
7. Under **Environment Variables**, add:
   - `TURSO_URL` → your Turso database URL
   - `TURSO_TOKEN` → your Turso auth token
   - `BASE_URL` → your Render URL (e.g. `https://ec-profile-server.onrender.com`)
8. Deploy

---

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/profile/:username` | None | Get a profile card |
| POST | `/profile/register` | None | Start claim flow, get code |
| POST | `/profile/verify` | None | Verify bio code, get token |
| POST | `/profile/login` | None | Re-auth if token expired |
| PATCH | `/profile/update` | Bearer token | Update profile |
| POST | `/profile/links` | Bearer token | Add social link |
| DELETE | `/profile/links/:platform` | Bearer token | Remove link |
| DELETE | `/profile` | Bearer token | Delete profile |
| GET | `/platforms` | None | List supported platforms |
| GET | `/health` | None | Health check |

## Verification flow

1. Client calls `POST /profile/register` with kloak username
2. Server returns `claim_code` like `ec-abc123xyz`  
3. User adds code to their kloak.app profile bio
4. Client calls `POST /profile/verify`
5. Server fetches kloak profile page, finds the code
6. Returns `edit_token` (valid 30 days)
7. All edits use `Authorization: Bearer <edit_token>`