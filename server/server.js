/**
 * Entropy Client — Profile Card Server
 * Uses Turso (libsql) for a fully free deployment.
 *
 * Required env vars:
 *   TURSO_URL    — from Turso dashboard e.g. libsql://your-db.turso.io
 *   TURSO_TOKEN  — from Turso dashboard (database token)
 *   BASE_URL     — your Render URL e.g. https://ec-profile-server.onrender.com
 */

'use strict';

const express          = require('express');
const cors             = require('cors');
const rateLimit        = require('express-rate-limit');
const { createClient } = require('@libsql/client');
const { nanoid }       = require('nanoid');

const PORT     = process.env.PORT     || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const PLATFORMS = {
  bluesky:  { label: 'Bluesky',   icon: '🦋', prefix: 'https://bsky.app/profile/' },
  youtube:  { label: 'YouTube',   icon: '▶️',  prefix: 'https://youtube.com/@' },
  discord:  { label: 'Discord',   icon: '🎮', prefix: null },
  github:   { label: 'GitHub',    icon: '🐙', prefix: 'https://github.com/' },
  twitter:  { label: 'Twitter/X', icon: '🐦', prefix: 'https://x.com/' },
  twitch:   { label: 'Twitch',    icon: '💜', prefix: 'https://twitch.tv/' },
  instagram:{ label: 'Instagram', icon: '📸', prefix: 'https://instagram.com/' },
};

// ── Turso client ──────────────────────────────────
const db = createClient({
  url:       process.env.TURSO_URL   || 'file:local.db',
  authToken: process.env.TURSO_TOKEN || undefined,
});

// ── Database init ─────────────────────────────────
async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS profiles (
      kloak_username       TEXT    PRIMARY KEY,
      display_name         TEXT,
      bio                  TEXT,
      avatar_gif           TEXT,
      avatar_gif_opacity   REAL    DEFAULT 0.85,
      avatar_gif_blend     TEXT    DEFAULT 'normal',
      claim_code           TEXT    UNIQUE,
      claim_verified       INTEGER DEFAULT 0,
      created_at           INTEGER DEFAULT (unixepoch()),
      updated_at           INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS social_links (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      kloak_username  TEXT    NOT NULL,
      platform        TEXT    NOT NULL,
      handle          TEXT    NOT NULL,
      verified        INTEGER DEFAULT 0,
      added_at        INTEGER DEFAULT (unixepoch()),
      UNIQUE(kloak_username, platform)
    );
    CREATE TABLE IF NOT EXISTS edit_tokens (
      token           TEXT    PRIMARY KEY,
      kloak_username  TEXT    NOT NULL,
      expires_at      INTEGER NOT NULL
    );
  `);
  console.log('Database ready');
}

// ── Helpers ───────────────────────────────────────
function now() { return Math.floor(Date.now() / 1000); }
function makeClaimCode() { return 'ec-' + nanoid(10); }

async function makeEditToken(username) {
  const token   = nanoid(32);
  const expires = now() + 60 * 60 * 24 * 30;
  await db.execute({
    sql:  'INSERT OR REPLACE INTO edit_tokens (token, kloak_username, expires_at) VALUES (?,?,?)',
    args: [token, username, expires],
  });
  return token;
}

async function validateEditToken(token) {
  if (!token) return null;
  const r = await db.execute({
    sql:  'SELECT kloak_username FROM edit_tokens WHERE token = ? AND expires_at > ?',
    args: [token, now()],
  });
  return r.rows[0]?.kloak_username ?? null;
}

async function cleanExpiredTokens() {
  await db.execute({ sql: 'DELETE FROM edit_tokens WHERE expires_at < ?', args: [now()] });
}

async function getProfileResponse(username) {
  const pr = await db.execute({
    sql: 'SELECT * FROM profiles WHERE kloak_username = ?', args: [username],
  });
  const p = pr.rows[0];
  if (!p) return null;

  const lr = await db.execute({
    sql: 'SELECT platform, handle, verified FROM social_links WHERE kloak_username = ?', args: [username],
  });

  const social_links = {};
  for (const row of lr.rows) {
    social_links[row.platform] = {
      handle:   row.handle,
      verified: !!row.verified,
      ...(PLATFORMS[row.platform] || {}),
    };
  }

  return {
    kloak_username:     p.kloak_username,
    display_name:       p.display_name,
    bio:                p.bio,
    avatar_gif:         p.avatar_gif,
    avatar_gif_opacity: p.avatar_gif_opacity ?? 0.85,
    avatar_gif_blend:   p.avatar_gif_blend   ?? 'normal',
    claim_verified:     !!p.claim_verified,
    social_links,
    updated_at:         p.updated_at,
  };
}

// ── Rate limiters ─────────────────────────────────
const generalLimit = rateLimit({ windowMs: 60_000, max: 60 });
const writeLimit   = rateLimit({ windowMs: 60_000, max: 20 });
const verifyLimit  = rateLimit({ windowMs: 60_000, max: 5  });

// ── App ───────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50kb' }));
app.use(generalLimit);

// ── GET /profile/:username ────────────────────────
app.get('/profile/:username', async (req, res) => {
  try {
    const profile = await getProfileResponse(req.params.username.toLowerCase().trim());
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json(profile);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /profile/register ────────────────────────
app.post('/profile/register', writeLimit, async (req, res) => {
  try {
    let { kloak_username } = req.body;
    if (!kloak_username) return res.status(400).json({ error: 'kloak_username required' });
    kloak_username = kloak_username.toLowerCase().trim();
    if (!/^[a-z0-9_-]{2,32}$/.test(kloak_username))
      return res.status(400).json({ error: 'Invalid username format' });

    const existing = await db.execute({
      sql: 'SELECT claim_verified FROM profiles WHERE kloak_username = ?', args: [kloak_username],
    });
    if (existing.rows[0]?.claim_verified)
      return res.status(409).json({ error: 'Already verified. Use /profile/login instead.' });

    const claim_code = makeClaimCode();
    await db.execute({
      sql:  `INSERT INTO profiles (kloak_username, claim_code, claim_verified) VALUES (?, ?, 0)
             ON CONFLICT(kloak_username) DO UPDATE SET claim_code = excluded.claim_code, updated_at = unixepoch()`,
      args: [kloak_username, claim_code],
    });

    res.json({
      claim_code,
      instructions: `Add this exact text to your kloak.app profile bio: "${claim_code}" — then call POST /profile/verify`,
      verify_endpoint: `${BASE_URL}/profile/verify`,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /profile/verify ──────────────────────────
app.post('/profile/verify', verifyLimit, async (req, res) => {
  try {
    let { kloak_username } = req.body;
    if (!kloak_username) return res.status(400).json({ error: 'kloak_username required' });
    kloak_username = kloak_username.toLowerCase().trim();

    const r = await db.execute({
      sql: 'SELECT * FROM profiles WHERE kloak_username = ?', args: [kloak_username],
    });
    const profile = r.rows[0];
    if (!profile)           return res.status(404).json({ error: 'No registration found. Register first.' });
    if (!profile.claim_code) return res.status(400).json({ error: 'No claim code. Re-register.' });

    // Fetch kloak profile page and look for the claim code
    let found = false;
    for (const url of [
      `https://kloak.app/u/${kloak_username}`,
      `https://kloak.app/@${kloak_username}`,
      `https://kloak.app/profile/${kloak_username}`,
    ]) {
      try {
        const resp = await fetch(url, {
          signal:  AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'EntropyClient-ProfileVerifier/1.0' },
        });
        if (resp.ok && (await resp.text()).includes(profile.claim_code)) { found = true; break; }
      } catch {}
    }

    if (!found) {
      return res.status(400).json({
        error: 'Claim code not found in profile',
        hint:  `Make sure "${profile.claim_code}" is in your kloak bio and your profile is public`,
      });
    }

    await db.execute({
      sql: 'UPDATE profiles SET claim_verified = 1, updated_at = unixepoch() WHERE kloak_username = ?',
      args: [kloak_username],
    });
    const edit_token = await makeEditToken(kloak_username);
    res.json({ success: true, edit_token, message: 'Verified! Save your edit_token.' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /profile/login ───────────────────────────
app.post('/profile/login', verifyLimit, async (req, res) => {
  try {
    let { kloak_username } = req.body;
    if (!kloak_username) return res.status(400).json({ error: 'kloak_username required' });
    kloak_username = kloak_username.toLowerCase().trim();

    const r = await db.execute({
      sql: 'SELECT kloak_username FROM profiles WHERE kloak_username = ?', args: [kloak_username],
    });
    if (!r.rows[0]) return res.status(404).json({ error: 'Profile not found. Register first.' });

    const claim_code = makeClaimCode();
    await db.execute({
      sql: 'UPDATE profiles SET claim_code = ?, updated_at = unixepoch() WHERE kloak_username = ?',
      args: [claim_code, kloak_username],
    });
    res.json({
      claim_code,
      instructions: `Update your kloak bio to include: "${claim_code}" — then call POST /profile/verify`,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── PATCH /profile/update ─────────────────────────
app.patch('/profile/update', writeLimit, async (req, res) => {
  try {
    const token    = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const username = await validateEditToken(token);
    if (!username) return res.status(401).json({ error: 'Invalid or expired token' });

    const { display_name, bio, avatar_gif, avatar_gif_opacity, avatar_gif_blend } = req.body;

    if (avatar_gif) {
      const ok = /^https:\/\/.+\.(gif|webp|png|apng)(\?.*)?$/i.test(avatar_gif) ||
                 /^https:\/\/(media\.giphy\.com|media\.tenor\.com|i\.imgur\.com|cdn\.discordapp\.com)/.test(avatar_gif);
      if (!ok) return res.status(400).json({ error: 'avatar_gif must be a https GIF/WebP URL' });
    }
    if (bio          && bio.length > 300)          return res.status(400).json({ error: 'Bio max 300 chars' });
    if (display_name && display_name.length > 50)  return res.status(400).json({ error: 'Display name max 50 chars' });

    const sets = [], args = [];
    if (display_name       !== undefined) { sets.push('display_name = ?');        args.push(display_name); }
    if (bio                !== undefined) { sets.push('bio = ?');                 args.push(bio); }
    if (avatar_gif         !== undefined) { sets.push('avatar_gif = ?');          args.push(avatar_gif || null); }
    if (avatar_gif_opacity !== undefined) {
      sets.push('avatar_gif_opacity = ?');
      args.push(Math.max(0, Math.min(1, parseFloat(avatar_gif_opacity) || 0.85)));
    }
    if (avatar_gif_blend !== undefined) {
      if (!['normal','overlay','screen','multiply','soft-light'].includes(avatar_gif_blend))
        return res.status(400).json({ error: 'Invalid blend mode' });
      sets.push('avatar_gif_blend = ?'); args.push(avatar_gif_blend);
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

    sets.push('updated_at = unixepoch()');
    args.push(username);
    await db.execute({ sql: `UPDATE profiles SET ${sets.join(', ')} WHERE kloak_username = ?`, args });
    res.json({ success: true, profile: await getProfileResponse(username) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /profile/links ───────────────────────────
app.post('/profile/links', writeLimit, async (req, res) => {
  try {
    const token    = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const username = await validateEditToken(token);
    if (!username) return res.status(401).json({ error: 'Invalid or expired token' });

    const { platform, handle } = req.body;
    if (!platform || !handle) return res.status(400).json({ error: 'platform and handle required' });
    if (!PLATFORMS[platform]) return res.status(400).json({ error: `Supported: ${Object.keys(PLATFORMS).join(', ')}` });

    const cleanHandle = handle.replace(/^@/, '').trim();
    if (!cleanHandle || cleanHandle.length > 100) return res.status(400).json({ error: 'Invalid handle' });

    // Auto-verify Bluesky via public AT Protocol API
    let verified = false;
    if (platform === 'bluesky') {
      try {
        const r = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(cleanHandle)}`,
          { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
        );
        if (r.ok) verified = true;
      } catch {}
    }

    await db.execute({
      sql:  `INSERT INTO social_links (kloak_username, platform, handle, verified) VALUES (?,?,?,?)
             ON CONFLICT(kloak_username, platform) DO UPDATE SET
               handle = excluded.handle, verified = excluded.verified, added_at = unixepoch()`,
      args: [username, platform, cleanHandle, verified ? 1 : 0],
    });

    const profile = await getProfileResponse(username);
    res.json({ success: true, platform, handle: cleanHandle, verified, links: profile.social_links });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── DELETE /profile/links/:platform ──────────────
app.delete('/profile/links/:platform', writeLimit, async (req, res) => {
  try {
    const token    = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const username = await validateEditToken(token);
    if (!username) return res.status(401).json({ error: 'Invalid or expired token' });
    await db.execute({
      sql: 'DELETE FROM social_links WHERE kloak_username = ? AND platform = ?',
      args: [username, req.params.platform],
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── DELETE /profile ───────────────────────────────
app.delete('/profile', writeLimit, async (req, res) => {
  try {
    const token    = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const username = await validateEditToken(token);
    if (!username) return res.status(401).json({ error: 'Invalid or expired token' });
    await db.execute({ sql: 'DELETE FROM social_links WHERE kloak_username = ?', args: [username] });
    await db.execute({ sql: 'DELETE FROM edit_tokens  WHERE kloak_username = ?', args: [username] });
    await db.execute({ sql: 'DELETE FROM profiles     WHERE kloak_username = ?', args: [username] });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── GET /platforms ────────────────────────────────
app.get('/platforms', (_req, res) => res.json(PLATFORMS));

// ── GET /health ───────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Cleanup + Start ───────────────────────────────
setInterval(cleanExpiredTokens, 1000 * 60 * 60);

initDb()
  .then(() => app.listen(PORT, () => {
    console.log(`EC Profile Server on port ${PORT} — ${BASE_URL}`);
  }))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });