'use strict';
// Test end-to-end: avvia un server SMTP finto e il server vero, poi percorre tutto il flusso.
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');

const PORT = 4100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const inbox = [];
let smtp;
const startSmtp = (port) => new Promise(r => {
  smtp = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onData(stream, s, cb) {
    let b = []; stream.on('data', d => b.push(d)); stream.on('end', async () => { inbox.push(await simpleParser(Buffer.concat(b))); cb(); });
  } });
  smtp.listen(port, '127.0.0.1', r);
});

class Client {   // "dispositivo" con il proprio cookie jar
  constructor() { this.jar = {}; }
  async req(method, url, body, headers = {}) {
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const r = await fetch(BASE + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/Max-Age=0/i.test(sc)) delete this.jar[k]; else this.jar[k] = v; }
    let data = null; const t = await r.text(); try { data = JSON.parse(t); } catch (e) { data = t; }
    return { status: r.status, data, headers: r.headers };
  }
  get(u) { return this.req('GET', u); } post(u, b) { return this.req('POST', u, b || {}); }
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-'));
  const smtpPort = PORT + 1000;
  await startSmtp(smtpPort);
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, DATA_DIR: dir, BASE_URL: BASE, ADMIN_PASSWORD: 'AdminPass!42', ADMIN_EMAIL: 'admin@example.test', SMTP_HOST: '127.0.0.1', SMTP_PORT: smtpPort, MAIL_FROM: 'noreply@example.test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', d => process.stderr.write(d));
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
  const waitMail = async (n) => { for (let i = 0; i < 40 && inbox.length < n; i++) await new Promise(r => setTimeout(r, 100)); assert(inbox.length >= n, 'email attesa non arrivata'); return inbox[n - 1]; };
  let n = 0; const ok = m => console.log('✓', m);
  try {
    const anon = new Client();
    // 1. la pagina pubblica non contiene contenuti né download
    const home = await anon.get('/');
    assert.equal(home.status, 200); assert(home.data.length < 3000, 'index troppo grande'); assert(!/Scarica|download|Blob/i.test(home.data));
    const study = await anon.get('/study.js'); assert(!/createObjectURL|\.download\s*=|Scarica il file/.test(study.data)); ok('pagina pubblica leggera, nessun download HTML');
    assert.equal((await anon.get('/api/content')).status, 401);
    assert.equal((await anon.get('/content/content.json')).status, 404);
    assert.equal((await anon.get('/data/db.json')).status, 404);
    assert.equal((await anon.get('/server.js')).status, 404); ok('contenuti e file server non raggiungibili senza login');

    // 2. richiesta accesso (+ nome con HTML sanitizzato) e avviso all'admin
    assert.equal((await anon.post('/api/request', { name: 'Mario <b>Rossi</b>', email: 'Mario@Example.test' })).status, 200);
    const adminMail = await waitMail(++n); assert(/admin@example.test/.test(adminMail.to.text)); assert(adminMail.text.includes('/admin')); ok('richiesta registrata, email di avviso all\'admin');
    assert.equal((await anon.post('/api/request', { name: 'x', email: 'bad' })).status, 400);
    assert.equal((await anon.post('/api/request', { name: 'Mario Rossi', email: 'mario@example.test' })).status, 200); // duplicato: risposta identica, nessun doppione

    // 3. admin
    const admin = new Client();
    assert.equal((await admin.get('/api/admin/users')).status, 401);
    assert.equal((await admin.post('/api/admin/login', { username: 'admin', password: 'sbagliata' })).status, 401);
    assert.equal((await admin.post('/api/admin/login', { username: 'admin', password: 'AdminPass!42' })).status, 200);
    let list = (await admin.get('/api/admin/users')).data.users; assert.equal(list.length, 1); assert.equal(list[0].status, 'pending');
    assert(!JSON.stringify(list).match(/hash|salt|passHash/i)); assert.equal(list[0].name, 'Mario bRossi/b'); ok('login admin; lista senza dati sensibili');
    const uid = list[0].id;

    // utente non approvato non può entrare, nemmeno indovinando
    assert.equal((await anon.post('/api/login', { username: 'mario1234', password: 'x' })).status, 401);

    // 4. approvazione con un click => email con credenziali
    const ap = await admin.post(`/api/admin/users/${uid}/approve`); assert.equal(ap.status, 200); assert.equal(ap.data.delivered, true); assert(!ap.data.credentials, 'con SMTP le credenziali non devono tornare nel pannello');
    const m = await waitMail(++n); assert.equal(m.to.value[0].address, 'mario@example.test');
    const username = /Utente:\s+(\S+)/.exec(m.text)[1], password = /Password:\s+(\S+)/.exec(m.text)[1];
    assert(/^[a-z]+\d{4}$/.test(username)); assert(/^([a-z2-9]{4}-){2}[a-z2-9]{4}$/.test(password)); assert(/একটি ডিভাইসে/.test(m.text)); ok(`credenziali inviate via email (${username})`);
    assert.equal((await admin.post(`/api/admin/users/${uid}/approve`)).status, 409);

    // 5. login su dispositivo A
    const A = new Client(), B = new Client();
    assert.equal((await A.post('/api/login', { username, password: 'sbagliata' })).status, 401);
    const la = await A.post('/api/login', { username: username.toUpperCase(), password: password.toUpperCase().replace(/-/g, ' ') }); assert.equal(la.status, 200); assert(A.jar.dev && A.jar.sid);
    const c = await A.get('/api/content'); assert.equal(c.status, 200); assert.equal(c.data.B.length, 718); assert.equal(c.data.S.length, 10); ok('login A ok, contenuti caricati (718 blocchi)');

    // 6. dispositivo B: stesse credenziali bloccate; cookie sid copiato da A non basta
    assert.equal((await B.post('/api/login', { username, password })).status, 403);
    B.jar.sid = A.jar.sid; assert.equal((await B.get('/api/content')).status, 401); delete B.jar.sid; ok('secondo dispositivo bloccato (anche copiando la sessione)');

    // 7. logout e rientro da A (il cookie dispositivo resta)
    await A.post('/api/logout'); assert.equal((await A.get('/api/content')).status, 401);
    assert.equal((await A.post('/api/login', { username, password })).status, 200); ok('logout/rientro sullo stesso dispositivo');

    // 8. admin sblocca => B entra, A viene tagliato fuori
    assert.equal((await admin.post(`/api/admin/users/${uid}/reset-device`)).status, 200);
    assert.equal((await A.get('/api/content')).status, 401);
    assert.equal((await B.post('/api/login', { username, password })).status, 200); assert.equal((await B.get('/api/content')).status, 200);
    assert.equal((await A.post('/api/login', { username, password })).status, 403); ok('sblocco dispositivo da admin');

    // 9. reinvio nuove credenziali: le vecchie non valgono più
    assert.equal((await admin.post(`/api/admin/users/${uid}/resend`)).status, 200); const m2 = await waitMail(++n);
    const u2 = /Utente:\s+(\S+)/.exec(m2.text)[1], p2 = /Password:\s+(\S+)/.exec(m2.text)[1];
    assert.equal((await B.get('/api/content')).status, 401); assert.equal((await new Client().post('/api/login', { username, password })).status, 401);
    const B2 = new Client(); assert.equal((await B2.post('/api/login', { username: u2, password: p2 })).status, 200); ok('nuove credenziali sostituiscono le vecchie');

    // 10. revoca
    assert.equal((await admin.post(`/api/admin/users/${uid}/revoke`)).status, 200);
    assert.equal((await B2.get('/api/content')).status, 401); assert.equal((await new Client().post('/api/login', { username: u2, password: p2 })).status, 401); ok('revoca');

    // 11. protezioni: origin, content-type, brute force
    assert.equal((await anon.req('POST', '/api/login', { username: 'a', password: 'b' }, { Origin: 'https://evil.example' })).status, 403);
    const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }); assert.equal(r.status, 400);
    const bf = new Client(); let last; for (let i = 0; i < 10; i++) last = await bf.post('/api/login', { username: 'bruteuser', password: 'x' + i }); assert.equal(last.status, 429); ok('rate limit e controlli origin/content-type');

    // 12. se l'email non parte, l'utente NON risulta approvato
    await anon.post('/api/request', { name: 'Luisa Bianchi', email: 'luisa@example.test' });
    await new Promise(r => smtp.close(r));
    const id2 = (await admin.get('/api/admin/users')).data.users.find(x => x.email === 'luisa@example.test').id;
    const bad = await admin.post(`/api/admin/users/${id2}/approve`); assert.equal(bad.status, 502);
    assert.equal((await admin.get('/api/admin/users')).data.users.find(x => x.id === id2).status, 'pending'); ok('invio email fallito => resta in attesa');

    // 13. persistenza su riavvio e permessi del db
    const mode = fs.statSync(path.join(dir, 'db.json')).mode & 0o777; assert.equal(mode, 0o600);
    console.log('\nTUTTI I TEST OK');
  } catch (e) { console.error('\n✗ FALLITO:', e.stack || e); process.exitCode = 1; }
  finally { srv.kill(); try { smtp.close(); } catch (e) { /* già chiuso */ } fs.rmSync(dir, { recursive: true, force: true }); }
})();
