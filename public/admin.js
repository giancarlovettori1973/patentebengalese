(function () {
  const R = document.querySelector('#root');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = t => t ? new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const STATUS = { pending: 'In attesa', approved: 'Approvato', rejected: 'Rifiutato', revoked: 'Revocato' };
  let tab = 'pending', data = null, timer = null, notice = '';

  async function api(path, body) {
    try {
      const r = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      let d = {}; try { d = await r.json(); } catch (e) { /* vuoto */ }
      return { ok: r.ok, status: r.status, data: d };
    } catch (e) { return { ok: false, status: 0, data: { error: 'network' } }; }
  }

  function loginView(err) {
    clearInterval(timer);
    R.innerHTML = `<div class="auth"><form class="card" id="f">
      <h1>🔐 Admin · Scuola Guida</h1>
      <label>Utente<input name="username" autocomplete="username" autocapitalize="none" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="pri" type="submit">Accedi</button>
      <div class="msg err" id="m">${esc(err || '')}</div></form></div>`;
    R.querySelector('#f').onsubmit = async e => {
      e.preventDefault(); const f = e.target, m = R.querySelector('#m'); m.textContent = '…';
      const r = await api('/api/admin/login', { username: f.username.value, password: f.password.value });
      if (r.ok) return load();
      m.textContent = r.data.error === 'too_many' ? 'Troppi tentativi, riprova più tardi.' : r.data.error === 'invalid' ? 'Credenziali non corrette.' : 'Server non raggiungibile.';
    };
  }

  async function load() {
    const r = await api('/api/admin/users');
    if (r.status === 401) return loginView();
    if (!r.ok) return;
    data = r.data; render();
    clearInterval(timer); timer = setInterval(async () => { if (document.hidden) return; const x = await api('/api/admin/users'); if (x.ok) { data = x.data; render(); } }, 15000);
  }

  function actions(u) {
    const b = (a, label, cls) => `<button data-a="${a}" data-id="${esc(u.id)}" class="${cls || ''}">${label}</button>`;
    if (u.status === 'pending') return b('approve', '✓ Approva e invia credenziali', 'pri') + b('reject', 'Rifiuta');
    if (u.status === 'approved') return b('resend', 'Nuove credenziali') + b('reset-device', 'Sblocca dispositivo') + b('revoke', 'Revoca', 'danger');
    return b('approve', '✓ Approva e invia credenziali', 'pri') + b('delete', 'Elimina', 'danger');
  }

  function card(u) {
    const dev = u.status !== 'approved' ? '' : `<br>Dispositivo: ${u.deviceBound ? `vincolato dal ${fmt(u.deviceAt)}` : 'nessuno ancora (si lega al primo accesso)'}<br>Ultimo accesso: ${fmt(u.lastLoginAt)}`;
    return `<div class="ucard"><div class="who"><b>${esc(u.name)}</b><span class="chip ${u.status}">${STATUS[u.status]}</span>
      <div class="meta">${esc(u.email)}<br>Richiesta: ${fmt(u.requestedAt)}${u.username ? `<br>Utente: <b>${esc(u.username)}</b>` : ''}${dev}</div></div>
      <div class="btns">${actions(u)}</div></div>`;
  }

  function render() {
    const users = data.users, by = s => users.filter(u => s.includes(u.status));
    const tabs = { pending: ['In attesa', by(['pending'])], approved: ['Approvati', by(['approved'])], other: ['Rifiutati / revocati', by(['rejected', 'revoked'])] };
    const list = tabs[tab][1];
    R.innerHTML = `<div class="adm"><header><b>Admin · Scuola Guida</b><button id="rf">Aggiorna</button><button id="lo">Esci</button></header>
      ${data.smtp ? '' : '<div class="banner"><b>Email non configurata (SMTP).</b> Le credenziali non vengono inviate: al momento dell\'approvazione compaiono qui sotto e vanno passate a mano. Configura SMTP nel file .env.</div>'}
      ${notice}
      <div class="tabs" style="margin-bottom:12px">${Object.entries(tabs).map(([k, [l, a]]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l} (${a.length})</button>`).join('')}</div>
      ${list.map(card).join('') || '<div class="empty">Nessun utente in questa lista.</div>'}</div>`;
    R.querySelectorAll('.tabs button').forEach(x => x.onclick = () => { tab = x.dataset.t; notice = ''; render(); });
    R.querySelector('#rf').onclick = load;
    R.querySelector('#lo').onclick = async () => { await api('/api/admin/logout', {}); loginView(); };
    R.querySelectorAll('.btns button').forEach(x => x.onclick = () => run(x));
  }

  const CONFIRM = {
    resend: 'Generare NUOVE credenziali e inviarle via email? Le vecchie smetteranno di funzionare.',
    'reset-device': 'Sbloccare il dispositivo? L\'utente potrà accedere da un nuovo dispositivo (il primo in cui riusa le credenziali).',
    revoke: 'Revocare l\'accesso a questo utente?',
    delete: 'Eliminare definitivamente questa richiesta?',
  };
  const ERR = { mail_failed: 'Invio email non riuscito: controlla la configurazione SMTP. L\'utente NON è stato approvato.', busy: 'Operazione già in corso.', network: 'Server non raggiungibile.' };

  async function run(btn) {
    const a = btn.dataset.a, id = btn.dataset.id;
    if (CONFIRM[a] && !confirm(CONFIRM[a])) return;
    document.querySelectorAll('.btns button').forEach(x => x.disabled = true);
    const r = await api(`/api/admin/users/${encodeURIComponent(id)}/${a}`, {});
    notice = '';
    if (r.status === 401) return loginView();
    if (!r.ok) notice = `<div class="banner">${esc(ERR[r.data.error] || 'Operazione non riuscita (' + (r.data.error || r.status) + ').')}</div>`;
    else if (r.data.credentials) notice = `<div class="banner" style="border-color:var(--ok);background:var(--okbg)"><b>Email non inviata (SMTP non configurato).</b> Passa all'utente queste credenziali:<div class="cred">Utente: ${esc(r.data.credentials.username)}<br>Password: ${esc(r.data.credentials.password)}</div>Non verranno più mostrate.</div>`;
    else if (a === 'approve' || a === 'resend') { notice = '<div class="banner" style="border-color:var(--ok);background:var(--okbg)">✓ Credenziali inviate via email.</div>'; if (a === 'approve') tab = 'approved'; }
    await load();
  }

  (async () => { const m = await api('/api/admin/me'); if (m.ok) load(); else loginView(); })();
})();
