'use strict';
/**
 * Scuola Guida · Patente A e B (IT / BN)
 * - nessun download dell'HTML: i contenuti stanno solo sul server e si ottengono solo dopo il login
 * - richiesta accesso -> l'admin approva con un click -> credenziali autogenerate inviate via email
 * - ogni credenziale si lega al primo dispositivo su cui viene usata
 * - login separato per l'admin (/admin)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) { /* .env opzionale */ }
const express = require('express');
const nodemailer = require('nodemailer');

// ---------- configurazione ----------
const env = process.env;
const PORT = +env.PORT || 3000;
const DATA_DIR = path.resolve(env.DATA_DIR || path.join(__dirname, 'data'));
const BASE_URL = (env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const ADMIN_USER = (env.ADMIN_USER || 'admin').trim().toLowerCase();
const ADMIN_EMAIL = (env.ADMIN_EMAIL || '').trim();
const SMTP_ON = !!env.SMTP_HOST;
const MAIL_FROM = env.MAIL_FROM || env.SMTP_USER || 'no-reply@localhost';
const SITE = 'Scuola Guida · Patente A e B';
const USER_SESSION_MS = 30 * 24 * 3600e3;
const ADMIN_SESSION_MS = 12 * 3600e3;
const DEVICE_COOKIE_SEC = 5 * 365 * 24 * 3600;

fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'db.json');

// ---------- contenuti (mai serviti senza login) ----------
const CONTENT_FILE = path.join(__dirname, 'content', 'content.json');
const contentRaw = fs.readFileSync(CONTENT_FILE);
const contentGz = zlib.gzipSync(contentRaw, { level: 6 });

// ---------- database a file (JSON, scrittura atomica) ----------
let db = { admin: null, users: [], sessions: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
db.users ||= []; db.sessions ||= {};
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}

// ---------- utilità crypto ----------
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const rnd = (n = 32) => crypto.randomBytes(n).toString('hex');
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
function pwMatch(pw, salt, hash) {
  const a = Buffer.from(hashPw(pw, salt), 'hex'), b = Buffer.from(hash || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// le password utente si confrontano senza maiuscole/trattini/spazi (comodo da telefono)
const normPw = s => String(s || '').toLowerCase().replace(/[\s-]/g, '');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- admin ----------
(function initAdmin() {
  let pw = env.ADMIN_PASSWORD;
  if (pw) {
    if (!db.admin || db.admin.user !== ADMIN_USER || !pwMatch(pw, db.admin.salt, db.admin.hash)) {
      const salt = rnd(16);
      db.admin = { user: ADMIN_USER, salt, hash: hashPw(pw, salt) };
      for (const [k, s] of Object.entries(db.sessions)) if (s.t === 'admin') delete db.sessions[k];
      save();
    }
  } else if (!db.admin) {
    const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    pw = Array.from({ length: 16 }, () => A[crypto.randomInt(A.length)]).join('');
    const salt = rnd(16);
    db.admin = { user: ADMIN_USER, salt, hash: hashPw(pw, salt) };
    save();
    console.log('\n==============================================================');
    console.log(' ACCESSO ADMIN CREATO (mostrato una sola volta, salvalo ora)');
    console.log(`   indirizzo : ${BASE_URL}/admin`);
    console.log(`   utente    : ${ADMIN_USER}`);
    console.log(`   password  : ${pw}`);
    console.log(' Per sceglierne una tua imposta ADMIN_PASSWORD nel file .env');
    console.log('==============================================================\n');
  }
})();

// ---------- email ----------
const transport = SMTP_ON ? nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: +env.SMTP_PORT || 587,
  secure: (+env.SMTP_PORT || 587) === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
}) : null;

async function sendMail(to, subject, text, html) {
  if (!transport) { console.warn(`[email NON inviata: SMTP non configurato] a ${to} · ${subject}`); return { delivered: false }; }
  await transport.sendMail({ from: `"${SITE}" <${MAIL_FROM}>`, to, subject, text, html });
  return { delivered: true };
}

function credentialsMail(u, username, password) {
  const subject = 'Le tue credenziali · আপনার লগইন তথ্য – Scuola Guida';
  const text =
`Ciao ${u.name},
la tua richiesta è stata approvata.

Indirizzo: ${BASE_URL}
Utente:    ${username}
Password:  ${password}

IMPORTANTE: queste credenziali funzionano su UN SOLO dispositivo, quello da cui accedi per la prima volta. Non condividerle.
Se cambi telefono o computer, scrivi all'amministratore per sbloccarle.

------------------------------------------------------------

${u.name}, আপনার অনুরোধ অনুমোদিত হয়েছে।

ঠিকানা:       ${BASE_URL}
ইউজারনেম:    ${username}
পাসওয়ার্ড:   ${password}

গুরুত্বপূর্ণ: এই লগইন তথ্য শুধুমাত্র একটি ডিভাইসে কাজ করবে — যে ডিভাইস থেকে প্রথমবার প্রবেশ করবেন। অন্য কারও সাথে শেয়ার করবেন না।
ডিভাইস বদলালে অ্যাডমিনকে জানান, তিনি আনলক করে দেবেন।
`;
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;line-height:1.5;color:#1b1f24">
<h2 style="margin:0 0 8px">${esc(SITE)}</h2>
<p>Ciao <b>${esc(u.name)}</b>, la tua richiesta è stata approvata.<br>${esc(u.name)}, আপনার অনুরোধ অনুমোদিত হয়েছে।</p>
<table style="border-collapse:collapse;background:#f6f7f9;border:1px solid #dde2e8;border-radius:8px;width:100%">
<tr><td style="padding:8px 12px;color:#5f6b76">Indirizzo · ঠিকানা</td><td style="padding:8px 12px"><a href="${esc(BASE_URL)}">${esc(BASE_URL)}</a></td></tr>
<tr><td style="padding:8px 12px;color:#5f6b76">Utente · ইউজারনেম</td><td style="padding:8px 12px;font-family:monospace;font-size:16px"><b>${esc(username)}</b></td></tr>
<tr><td style="padding:8px 12px;color:#5f6b76">Password · পাসওয়ার্ড</td><td style="padding:8px 12px;font-family:monospace;font-size:16px"><b>${esc(password)}</b></td></tr></table>
<p><b>Importante:</b> funzionano su <b>un solo dispositivo</b> (il primo da cui accedi). Non condividerle. Se cambi dispositivo scrivi all'amministratore.</p>
<p><b>গুরুত্বপূর্ণ:</b> এই লগইন তথ্য শুধুমাত্র <b>একটি ডিভাইসে</b> কাজ করবে — যে ডিভাইস থেকে প্রথমবার প্রবেশ করবেন। অন্য কারও সাথে শেয়ার করবেন না। ডিভাইস বদলালে অ্যাডমিনকে জানান।</p></div>`;
  return { subject, text, html };
}

// ---------- rate limiting ----------
const fails = new Map();
function failCount(key) { const b = fails.get(key); return b && b.reset > Date.now() ? b.n : 0; }
function addFail(key, windowMs = 15 * 60e3) {
  const now = Date.now(); let b = fails.get(key);
  if (!b || b.reset < now) b = { n: 0, reset: now + windowMs };
  b.n++; fails.set(key, b);
}
setInterval(() => { const now = Date.now(); for (const [k, b] of fails) if (b.reset < now) fails.delete(k); }, 10 * 60e3).unref();

// ---------- cookie e sessioni ----------
function parseCookies(req) {
  const o = {};
  for (const p of (req.headers.cookie || '').split(';')) {
    const i = p.indexOf('='); if (i < 1) continue;
    try { o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* ignora */ }
  }
  return o;
}
function setCookie(req, res, name, val, maxAgeSec) {
  const secure = env.COOKIE_SECURE === '1' || (env.COOKIE_SECURE !== '0' && req.secure);
  res.append('Set-Cookie', `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`);
}
function newSession(type, userId, ms) {
  const token = rnd(32);
  db.sessions[sha(token)] = { t: type, u: userId, exp: Date.now() + ms };
  return token;
}
function killSessions(type, userId) {
  for (const [k, s] of Object.entries(db.sessions)) if (s.t === type && s.u === userId) delete db.sessions[k];
}
function cleanSessions() {
  const now = Date.now(); let ch = false;
  for (const [k, s] of Object.entries(db.sessions)) if (s.exp < now) { delete db.sessions[k]; ch = true; }
  if (ch) save();
}
cleanSessions(); setInterval(cleanSessions, 3600e3).unref();

function authUser(req, res, next) {
  const c = parseCookies(req);
  const s = c.sid && db.sessions[sha(c.sid)];
  if (!s || s.t !== 'user' || s.exp < Date.now()) return res.status(401).json({ error: 'auth' });
  const u = db.users.find(x => x.id === s.u);
  // sessione + cookie dispositivo devono combaciare: copiarne uno solo non basta
  if (!u || u.status !== 'approved' || !c.dev || !u.deviceHash || sha(c.dev) !== u.deviceHash) return res.status(401).json({ error: 'auth' });
  req.user = u; next();
}
function authAdmin(req, res, next) {
  const c = parseCookies(req);
  const s = c.asid && db.sessions[sha(c.asid)];
  if (!s || s.t !== 'admin' || s.exp < Date.now()) return res.status(401).json({ error: 'auth' });
  req.sid = sha(c.asid); next();
}

// ---------- app ----------
const app = express();
if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY === '1' ? 1 : env.TRUST_PROXY);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    if (!req.is('application/json')) return res.status(400).json({ error: 'bad_request' });
    const o = req.headers.origin;
    if (o) { try { if (new URL(o).host !== req.headers.host) return res.status(403).json({ error: 'origin' }); } catch (e) { return res.status(403).json({ error: 'origin' }); } }
  }
  next();
});

// ----- pubblico: richiesta accesso -----
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>"`]/g, '').replace(/\s+/g, ' ').trim();
const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,255}\.[^\s@<>"]{2,}$/;

app.post('/api/request', (req, res) => {
  const ipk = 'req:' + req.ip;
  if (failCount(ipk) >= 5) return res.status(429).json({ error: 'too_many' });
  const name = cleanName(req.body.name), email = String(req.body.email || '').trim().toLowerCase();
  if (name.length < 2 || name.length > 80 || !EMAIL_RE.test(email) || email.length > 120) return res.status(400).json({ error: 'invalid' });
  addFail(ipk, 3600e3); // massimo 5 richieste/ora per IP
  const reply = { ok: true }; // risposta identica in ogni caso: non rivela se l'email è già nota
  if (db.users.some(u => u.email === email)) return res.json(reply);
  if (db.users.filter(u => u.status === 'pending').length >= 500) return res.json(reply);
  const u = { id: rnd(8), name, email, status: 'pending', requestedAt: Date.now() };
  db.users.push(u); save();
  if (ADMIN_EMAIL) {
    sendMail(ADMIN_EMAIL, `Nuova richiesta di accesso: ${name}`,
      `${name} <${email}> ha chiesto l'accesso.\nApri il pannello e approva con un click: ${BASE_URL}/admin\n`,
      `<p><b>${esc(name)}</b> &lt;${esc(email)}&gt; ha chiesto l'accesso.</p><p><a href="${esc(BASE_URL)}/admin">Apri il pannello admin</a> e approva con un click.</p>`)
      .catch(e => console.error('email admin non inviata:', e.message));
  }
  res.json(reply);
});

// ----- pubblico: login utente -----
app.post('/api/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase().slice(0, 60);
  const pw = normPw(String(req.body.password || '').slice(0, 100));
  const ipk = 'li:' + req.ip, uk = 'lu:' + username;
  if (failCount(ipk) >= 30 || failCount(uk) >= 8) return res.status(429).json({ error: 'too_many' });
  const u = username && db.users.find(x => x.username === username && x.status === 'approved');
  const ok = u ? pwMatch(pw, u.salt, u.passHash) : (hashPw(pw, 'x'.repeat(32)), false);
  if (!ok) { addFail(ipk); addFail(uk); return res.status(401).json({ error: 'invalid' }); }

  const dev = parseCookies(req).dev;
  if (!u.deviceHash) {                       // primo accesso: il dispositivo si lega alle credenziali
    const t = rnd(32);
    u.deviceHash = sha(t); u.deviceAt = Date.now();
    setCookie(req, res, 'dev', t, DEVICE_COOKIE_SEC);
  } else if (!dev || sha(dev) !== u.deviceHash) {
    return res.status(403).json({ error: 'other_device' });
  }
  killSessions('user', u.id);                // una sola sessione attiva
  setCookie(req, res, 'sid', newSession('user', u.id, USER_SESSION_MS), USER_SESSION_MS / 1000);
  u.lastLoginAt = Date.now(); save();
  res.json({ ok: true, name: u.name });
});

app.post('/api/logout', (req, res) => {
  const c = parseCookies(req);
  if (c.sid) { delete db.sessions[sha(c.sid)]; save(); }
  setCookie(req, res, 'sid', '', 0);        // il cookie "dev" resta: il dispositivo rimane legato
  res.json({ ok: true });
});

app.get('/api/me', authUser, (req, res) => res.json({ name: req.user.name }));

app.get('/api/content', authUser, (req, res) => {
  res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private' });
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { res.set('Content-Encoding', 'gzip'); return res.end(contentGz); }
  res.end(contentRaw);
});

// ----- admin -----
app.post('/api/admin/login', (req, res) => {
  const user = String(req.body.username || '').trim().toLowerCase().slice(0, 60), pw = String(req.body.password || '').slice(0, 200);
  const ipk = 'ai:' + req.ip;
  if (failCount(ipk) >= 10) return res.status(429).json({ error: 'too_many' });
  const ok = user === db.admin.user && pwMatch(pw, db.admin.salt, db.admin.hash);
  if (!ok) { addFail(ipk); return res.status(401).json({ error: 'invalid' }); }
  for (const [k, s] of Object.entries(db.sessions)) if (s.t === 'admin') delete db.sessions[k];
  setCookie(req, res, 'asid', newSession('admin', 'admin', ADMIN_SESSION_MS), ADMIN_SESSION_MS / 1000);
  save(); res.json({ ok: true });
});
app.post('/api/admin/logout', authAdmin, (req, res) => {
  delete db.sessions[req.sid]; save(); setCookie(req, res, 'asid', '', 0); res.json({ ok: true });
});
app.get('/api/admin/me', authAdmin, (req, res) => res.json({ ok: true, user: db.admin.user, smtp: SMTP_ON }));

const pub = u => ({
  id: u.id, name: u.name, email: u.email, status: u.status, requestedAt: u.requestedAt,
  approvedAt: u.approvedAt || null, username: u.username || null,
  deviceBound: !!u.deviceHash, deviceAt: u.deviceAt || null, lastLoginAt: u.lastLoginAt || null,
});
app.get('/api/admin/users', authAdmin, (req, res) =>
  res.json({ smtp: SMTP_ON, users: db.users.map(pub).sort((a, b) => b.requestedAt - a.requestedAt) }));

function genCreds(name) {
  const base = name.split(' ')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'utente';
  let username;
  do { username = base + crypto.randomInt(1000, 10000); } while (db.users.some(x => x.username === username));
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  const raw = Array.from({ length: 12 }, () => A[crypto.randomInt(A.length)]).join('');
  return { username, password: raw.replace(/(.{4})(?=.)/g, '$1-') };
}

const busy = new Set();
// genera credenziali, le invia via email e SOLO se l'invio riesce segna l'utente come approvato
async function issue(u) {
  if (busy.has(u.id)) { const e = new Error('busy'); e.status = 409; throw e; }
  busy.add(u.id);
  try {
    const { username, password } = genCreds(u.name);
    const m = credentialsMail(u, username, password);
    let delivered;
    try { delivered = (await sendMail(u.email, m.subject, m.text, m.html)).delivered; }
    catch (e) { console.error('invio email fallito:', e.message); const err = new Error('mail_failed'); err.status = 502; throw err; }
    const salt = rnd(16);
    Object.assign(u, { status: 'approved', username, salt, passHash: hashPw(normPw(password), salt), approvedAt: Date.now(), deviceHash: null, deviceAt: null });
    killSessions('user', u.id); save();
    // senza SMTP le credenziali vengono mostrate all'admin, che può passarle a mano
    return delivered ? { ok: true, delivered } : { ok: true, delivered, credentials: { username, password } };
  } finally { busy.delete(u.id); }
}

const act = (fn) => async (req, res) => {
  const u = db.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  try { res.json(await fn(u, req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message || 'error' }); }
};
const bad = (m) => { const e = new Error(m); e.status = 409; return e; };

app.post('/api/admin/users/:id/approve', authAdmin, act(u => {
  if (u.status === 'approved') throw bad('already_approved');
  return issue(u);
}));
app.post('/api/admin/users/:id/resend', authAdmin, act(u => {      // nuove credenziali (le vecchie non sono recuperabili)
  if (u.status !== 'approved') throw bad('not_approved');
  return issue(u);
}));
app.post('/api/admin/users/:id/reject', authAdmin, act(u => {
  if (u.status !== 'pending') throw bad('not_pending');
  u.status = 'rejected'; save(); return { ok: true };
}));
app.post('/api/admin/users/:id/revoke', authAdmin, act(u => {
  if (u.status !== 'approved') throw bad('not_approved');
  u.status = 'revoked'; killSessions('user', u.id); save(); return { ok: true };
}));
app.post('/api/admin/users/:id/reset-device', authAdmin, act(u => {
  u.deviceHash = null; u.deviceAt = null; killSessions('user', u.id); save(); return { ok: true };
}));
app.post('/api/admin/users/:id/delete', authAdmin, act(u => {
  if (u.status === 'approved') throw bad('revoke_first');
  db.users = db.users.filter(x => x !== u); save(); return { ok: true };
}));

// ----- pagine statiche -----
const PUB = path.join(__dirname, 'public');
app.get('/', (req, res) => res.sendFile(path.join(PUB, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
app.get('/admin', (req, res) => res.sendFile(path.join(PUB, 'admin.html'), { headers: { 'Cache-Control': 'no-cache' } }));
app.use(express.static(PUB, { index: false, extensions: [], setHeaders: r => r.setHeader('Cache-Control', 'no-cache') }));
app.get('/healthz', (req, res) => res.type('text').send('ok'));

app.use((err, req, res, next) => {            // JSON malformato ecc.
  if (res.headersSent) return next(err);
  res.status(err.status || 400).json({ error: 'bad_request' });
});

app.listen(PORT, () => {
  console.log(`Scuola Guida in ascolto su ${BASE_URL}  (admin: ${BASE_URL}/admin)`);
  if (!SMTP_ON) console.warn('ATTENZIONE: SMTP non configurato. Le email NON vengono inviate: alla approvazione le credenziali compaiono solo nel pannello admin.');
  if (!ADMIN_EMAIL) console.warn('Nota: ADMIN_EMAIL non impostata, nessuna email di avviso per le nuove richieste.');
});
