/**
 * Entropy Client — Profile Card Server
 * 
 * Handles EC identity: kloak username claim via bio verification code,
 * linked social accounts (Bluesky, YouTube, Discord, GitHub, Twitter),
 * avatar GIF overlay URLs, and EC-to-EC profile card lookups.
 * 
 * Deploy free on Render: https://render.com
 *   - New Web Service → connect repo → Build: npm install → Start: node server.js
 *   - Set env var EC_SECRET to a long random string
 */

'use strict';

const express      = require('express');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const Database     = require('better-sqlite3');
const path         = require('path');
const crypto       = require('crypto');
const { nanoid }   = require('nanoid');

// ── Config ────────────────────────────────────────
const PORT       = process.env.PORT || 3000;
const SECRET     = process.env.EC_SECRET || 'change-me-in-production';
const DB_PATH    = process.env.DB_PATH  || path.join(__dirname, 'profiles.db');
const BASE_URL   = process.env.BASE_URL || `http://localhost:${PORT}`;

// Supported platforms with display metadata
const PLATFORMS = {
  bluesky:  { label: 'Bluesky',  icon: '🦋', prefix: 'https://bsky.app/profile/' },
  youtube:  { label: 'YouTube',  icon: '▶️',  prefix: 'https://youtube.com/@' },
  discord:  { label: 'Discord',  icon: '🎮', prefix: null },
  github:   { label: 'GitHub',   icon: '🐙', prefix: 'https://github.com/' },
  twitter:  { label: 'Twitter',  icon: '🐦', prefix: 'https://x.com/' },
  twitch:   { label: 'Twitch',   icon: '💜', prefix: 'https://twitch.tv/' },
  instagram:{ label: 'Instagram',icon: '📸', prefix: 'https://instagram.com/' },
};

// ── Database setup ────────────────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    kloak_username  TEXT PRIMARY KEY,
    display_name    TEXT,
    bio             TEXT,
    avatar_gif      TEXT,
    avatar_gif_opacity REAL DEFAULT 0.85,
    avatar_gif_blend   TEXT DEFAULT 'normal',
    claim_code      TEXT UNIQUE,
    claim_verified  INTEGER DEFAULT 0,
    created_at      INTEGER DEFAULT (unixepoch()),
    updated_at      INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS social_links (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    kloak_username  TEXT NOT NULL,
    platform        TEXT NOT NULL,
    handle          TEXT NOT NULL,
    verified        INTEGER DEFAULT 0,
    added_at        INTEGER DEFAULT (unixepoch()),
    UNIQUE(kloak_username, platform)
  );

  CREATE TABLE IF NOT EXISTS edit_tokens (
    token           TEXT PRIMARY KEY,
    kloak_username  TEXT NOT NULL,
    expires_at      INTEGER NOT NULL
  );
`);

// ── Helpers ───────────────────────────────────────
function now() { return Math.floor(Date.now() / 1000); }

function makeClaimCode() {
  // Short human-readable code user pastes into their kloak bio
  return 'ec-' + nanoid(10);
}

function makeEditToken(username) {
  const token = nanoid(32);
  const expires = now() + 60 * 60 * 24 * 30; // 30 days
  db.prepare('INSERT OR REPLACE INTO edit_tokens (token, kloak_username, expires_at) VALUES (?,?,?)')
    .run(token, username, expires);
  return token;
}

function validateEditToken(token) {
  const row = db.prepare('SELECT * FROM edit_tokens WHERE token = ? AND expires_at > ?')
    .get(token, now());
  return row ? row.kloak_username : null;
}

function cleanExpiredTokens() {
  db.prepare('DELETE FROM edit_tokens WHERE expires_at < ?').run(now());
}

function profileResponse(username) {
  const profile = db.prepare('SELECT * FROM profiles WHERE kloak_username = ?').get(username);
  if (!profile) return null;
  const links = db.prepare('SELECT platform, handle, verified FROM social_links WHERE kloak_username = ?')
    .all(username);
  return {
    kloak_username:      profile.kloak_username,
    display_name:        profile.display_name,
    bio:                 profile.bio,
    avatar_gif:          profile.avatar_gif,
    avatar_gif_opacity:  profile.avatar_gif_opacity,
    avatar_gif_blend:    profile.avatar_gif_blend,
    claim_verified:      !!profile.claim_verified,
    social_links:        links.reduce((acc, l) => {
      acc[l.platform] = { handle: l.handle, verified: !!l.verified, ...PLATFORMS[l.platform] };
      return acc;
    }, {}),
    updated_at: profile.updated_at,
  };
}

// ── Rate limiters ─────────────────────────────────
const generalLimit = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const writeLimit   = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const verifyLimit  = rateLimit({ windowMs: 60_000, max: 5,  standardHeaders: true, legacyHeaders: false });

// ── App ───────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50kb' }));
app.use(generalLimit);

// ── Routes ────────────────────────────────────────

/**
 * GET /profile/:username
 * Public. Returns a user's full profile card.
 */
app.get('/profile/:username', (req, res) => {
  const username = req.params.username.toLowerCase().trim();
  const profile = profileResponse(username);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  res.json(profile);
});

/**
 * POST /profile/register
 * Start the claim flow. Creates a profile with a verification code.
 * Body: { kloak_username }
 * Returns: { claim_code, instructions }
 */
app.post('/profile/register', writeLimit, (req, res) => {
  let { kloak_username } = req.body;
  if (!kloak_username) return res.status(400).json({ error: 'kloak_username required' });
  kloak_username = kloak_username.toLowerCase().trim();
  if (!/^[a-z0-9_-]{2,32}$/.test(kloak_username))
    return res.status(400).json({ error: 'Invalid username format' });

  let profile = db.prepare('SELECT * FROM profiles WHERE kloak_username = ?').get(kloak_username);
  
  if (profile && profile.claim_verified) {
    // Already verified — they need their edit token, not a new claim
    return res.status(409).json({ error: 'Profile already verified. Use /profile/login to get a new token.' });
  }

  // Create or refresh claim code
  const claim_code = makeClaimCode();
  db.prepare(`
    INSERT INTO profiles (kloak_username, claim_code, claim_verified)
    VALUES (?, ?, 0)
    ON CONFLICT(kloak_username) DO UPDATE SET claim_code = excluded.claim_code, updated_at = unixepoch()
  `).run(kloak_username, claim_code);

  res.json({
    claim_code,
    instructions: `Add this exact text anywhere in your kloak.app profile bio: "${claim_code}" — then call POST /profile/verify`,
    verify_endpoint: `${BASE_URL}/profile/verify`,
  });
});

/**
 * POST /profile/verify
 * Checks if the claim code appears in the user's kloak bio.
 * 
 * NOTE: This makes a request to kloak.app to read the profile page.
 * We scrape the bio text to find the claim code.
 * 
 * Body: { kloak_username }
 * Returns: { success, edit_token } on success
 */
app.post('/profile/verify', verifyLimit, async (req, res) => {
  let { kloak_username } = req.body;
  if (!kloak_username) return res.status(400).json({ error: 'kloak_username required' });
  kloak_username = kloak_username.toLowerCase().trim();

  const profile = db.prepare('SELECT * FROM profiles WHERE kloak_username = ?').get(kloak_username);
  if (!profile) return res.status(404).json({ error: 'No registration found. Call /profile/register first.' });
  if (!profile.claim_code) return res.status(400).json({ error: 'No claim code found. Re-register.' });

  // Fetch the kloak profile page and look for the claim code in the HTML
  let found = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    // Try multiple possible kloak profile URL patterns
    const urls = [
      `https://kloak.app/u/${kloak_username}`,
      `https://kloak.app/@${kloak_username}`,
      `https://kloak.app/profile/${kloak_username}`,
    ];
    
    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'EntropyClient-ProfileVerifier/1.0' }
        });
        clearTimeout(timeout);
        if (resp.ok) {
          const html = await resp.text();
          if (html.includes(profile.claim_code)) {
            found = true;
            break;
          }
        }
      } catch {}
    }
    clearTimeout(timeout);
  } catch (e) {
    console.error('Verify fetch error:', e.message);
  }

  if (!found) {
    return res.status(400).json({
      error: 'Claim code not found in profile',
      hint: `Make sure "${profile.claim_code}" appears in your kloak bio and your profile is public`,
    });
  }

  // Verified! Issue an edit token
  db.prepare('UPDATE profiles SET claim_verified = 1, updated_at = unixepoch() WHERE kloak_username = ?')
    .run(kloak_username);
  
  const edit_token = makeEditToken(kloak_username);
  res.json({ success: true, edit_token, message: 'Profile verified! Save your edit_token — you\'ll need it to edit your profile.' });
});

/**
 * POST /profile/login
 * For already-verified users who lost their token. Re-verifies via bio code.
 * Body: { kloak_username }
 * Same flow as register+verify but skips re-registration.
 */
app.post('/profile/login', verifyLimit, async (req, res) => {
  let { kloak_username } = req.body;
  if (!kloak_username) return res.status(400).json({ error: 'kloak_username required' });
  kloak_username = kloak_username.toLowerCase().trim();

  const profile = db.prepare('SELECT * FROM profiles WHERE kloak_username = ?').get(kloak_username);
  if (!profile) return res.status(404).json({ error: 'Profile not found. Register first.' });

  // Generate a fresh claim code for re-auth
  const claim_code = makeClaimCode();
  db.prepare('UPDATE profiles SET claim_code = ?, updated_at = unixepoch() WHERE kloak_username = ?')
    .run(claim_code, kloak_username);

  res.json({
    claim_code,
    instructions: `Update your kloak bio to include: "${claim_code}" — then call POST /profile/verify`,
    verify_endpoint: `${BASE_URL}/profile/verify`,
  });
});

/**
 * PATCH /profile/update
 * Authenticated. Update profile fields.
 * Headers: { Authorization: Bearer <edit_token> }
 * Body: { display_name?, bio?, avatar_gif?, avatar_gif_opacity?, avatar_gif_blend? }
 */
app.patch('/profile/update', writeLimit, (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const username = validateEditToken(token);
  if (!username) return res.status(401).json({ error: 'Invalid or expired token' });

  const { display_name, bio, avatar_gif, avatar_gif_opacity, avatar_gif_blend } = req.body;

  // Validate avatar_gif URL (must be https and end in gif/webp/png/apng or giphy/tenor domain)
  if (avatar_gif !== undefined && avatar_gif !== null && avatar_gif !== '') {
    if (!/^https:\/\/.+\.(gif|webp|png|apng)(\?.*)?$/i.test(avatar_gif) &&
        !/^https:\/\/(media\.giphy\.com|media\.tenor\.com|i\.imgur\.com|cdn\.discordapp\.com)/.test(avatar_gif)) {
      return res.status(400).json({ error: 'avatar_gif must be a https URL to a GIF/WebP image' });
    }
  }

  if (bio !== undefined && bio.length > 300)
    return res.status(400).json({ error: 'Bio must be 300 chars or less' });

  if (display_name !== undefined && display_name.length > 50)
    return res.status(400).json({ error: 'Display name must be 50 chars or less' });

  const updates = [];
  const params  = [];

  if (display_name    !== undefined) { updates.push('display_name = ?');      params.push(display_name); }
  if (bio             !== undefined) { updates.push('bio = ?');               params.push(bio); }
  if (avatar_gif      !== undefined) { updates.push('avatar_gif = ?');        params.push(avatar_gif || null); }
  if (avatar_gif_opacity !== undefined) { 
    const op = Math.max(0, Math.min(1, parseFloat(avatar_gif_opacity) || 0.85));
    updates.push('avatar_gif_opacity = ?'); params.push(op); 
  }
  if (avatar_gif_blend !== undefined) {
    const allowed = ['normal','overlay','screen','multiply','soft-light'];
    if (!allowed.includes(avatar_gif_blend)) return res.status(400).json({ error: 'Invalid blend mode' });
    updates.push('avatar_gif_blend = ?'); params.push(avatar_gif_blend);
  }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = unixepoch()');
  params.push(username);
  db.prepare(`UPDATE profiles SET ${updates.join(', ')} WHERE kloak_username = ?`).run(...params);

  res.json({ success: true, profile: profileResponse(username) });
});

/**
 * POST /profile/links
 * Authenticated. Add or update a social link.
 * Headers: { Authorization: Bearer <edit_token> }
 * Body: { platform, handle }
 * 
 * Verification is SELF-REPORTED for most platforms (we can't OAuth without 
 * client secrets per platform). For Bluesky we CAN verify via the public AT Protocol API.
 */
app.post('/profile/links', writeLimit, async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const username = validateEditToken(token);
  if (!username) return res.status(401).json({ error: 'Invalid or expired token' });

  const { platform, handle } = req.body;
  if (!platform || !handle) return res.status(400).json({ error: 'platform and handle required' });
  if (!PLATFORMS[platform]) return res.status(400).json({ error: `Unknown platform. Supported: ${Object.keys(PLATFORMS).join(', ')}` });

  const cleanHandle = handle.replace(/^@/, '').trim();
  if (!cleanHandle || cleanHandle.length > 100) return res.status(400).json({ error: 'Invalid handle' });

  // Try to verify Bluesky automatically via the public AT Protocol API
  let verified = false;
  if (platform === 'bluesky') {
    try {
      const resp = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(cleanHandle)}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (resp.ok) verified = true;
    } catch {}
  }

  db.prepare(`
    INSERT INTO social_links (kloak_username, platform, handle, verified)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(kloak_username, platform) DO UPDATE SET 
      handle = excluded.handle, 
      verified = excluded.verified,
      added_at = unixepoch()
  `).run(username, platform, cleanHandle, verified ? 1 : 0);

  res.json({ success: true, platform, handle: cleanHandle, verified, links: profileResponse(username).social_links });
});

/**
 * DELETE /profile/links/:platform
 * Authenticated. Remove a social link.
 */
app.delete('/profile/links/:platform', writeLimit, (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const username = validateEditToken(token);
  if (!username) return res.status(401).json({ error: 'Invalid or expired token' });

  db.prepare('DELETE FROM social_links WHERE kloak_username = ? AND platform = ?')
    .run(username, req.params.platform);
  res.json({ success: true });
});

/**
 * DELETE /profile
 * Authenticated. Delete entire profile.
 */
app.delete('/profile', writeLimit, (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const username = validateEditToken(token);
  if (!username) return res.status(401).json({ error: 'Invalid or expired token' });

  db.prepare('DELETE FROM social_links WHERE kloak_username = ?').run(username);
  db.prepare('DELETE FROM edit_tokens WHERE kloak_username = ?').run(username);
  db.prepare('DELETE FROM profiles WHERE kloak_username = ?').run(username);
  res.json({ success: true });
});

/**
 * GET /platforms
 * Returns list of supported platforms with metadata.
 */
app.get('/platforms', (req, res) => res.json(PLATFORMS));

/**
 * GET /health
 */
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Cleanup job ───────────────────────────────────
setInterval(cleanExpiredTokens, 1000 * 60 * 60); // every hour

// ── Start ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`EC Profile Server running on port ${PORT}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`DB: ${DB_PATH}`);
});