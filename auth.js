(function () {
  const R = document.querySelector('#root');
  const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };

  async function api(path, body) {
    try {
      const r = await fetch(path, {
        method: body ? 'POST' : 'GET', credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = {}; try { data = await r.json(); } catch (e) { /* vuoto */ }
      return { ok: r.ok, status: r.status, data };
    } catch (e) { return { ok: false, status: 0, data: { error: 'network' } }; }
  }

  const MSG = {
    invalid: 'Utente o password non corretti · ইউজারনেম বা পাসওয়ার্ড ভুল।',
    other_device: 'Queste credenziali sono già attive su un altro dispositivo. Contatta l\'amministratore per sbloccarle. · এই লগইন তথ্য অন্য ডিভাইসে সক্রিয়। আনলক করতে অ্যাডমিনের সাথে যোগাযোগ করুন।',
    too_many: 'Troppi tentativi. Riprova tra qualche minuto. · অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন।',
    network: 'Connessione assente o server non raggiungibile. · সংযোগ নেই।',
    bad_form: 'Controlla i dati inseriti. · তথ্য যাচাই করুন।',
    expired: 'Sessione scaduta, accedi di nuovo. · সেশন শেষ, আবার লগইন করুন।',
  };

  function showLogin(note) {
    R.replaceChildren(el(`<div class="auth"><div class="card">
      <h1>Scuola Guida</h1>
      <p class="sub" style="margin:0">Patente A e B · Italiano / বাংলা</p>
      <div class="tabs"><button type="button" class="on" data-t="in">Accedi · প্রবেশ</button><button type="button" data-t="rq">Richiedi accesso · অনুরোধ</button></div>
      <form id="fin" class="pane" style="display:flex;flex-direction:column;gap:10px" autocomplete="on">
        <label>Utente · ইউজারনেম<input name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
        <label>Password · পাসওয়ার্ড<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="pri" type="submit">Accedi · প্রবেশ করুন</button>
      </form>
      <form id="frq" class="pane" style="display:none;flex-direction:column;gap:10px">
        <p class="sub" style="margin:0">Invia la richiesta: dopo l'approvazione riceverai utente e password via email. · অনুরোধ পাঠান; অনুমোদনের পর ইমেইলে ইউজারনেম ও পাসওয়ার্ড পাবেন।</p>
        <label>Nome e cognome · নাম<input name="name" autocomplete="name" maxlength="80" required></label>
        <label>Email · ইমেইল<input name="email" type="email" autocomplete="email" maxlength="120" required></label>
        <button class="pri" type="submit">Invia richiesta · অনুরোধ পাঠান</button>
      </form>
      <div class="msg" id="msg" role="status"></div>
    </div></div>`));
    const msg = R.querySelector('#msg'), say = (t, cls) => { msg.textContent = t || ''; msg.className = 'msg ' + (cls || ''); };
    if (note) say(note, 'err');
    R.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
      R.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
      R.querySelector('#fin').style.display = b.dataset.t === 'in' ? 'flex' : 'none';
      R.querySelector('#frq').style.display = b.dataset.t === 'rq' ? 'flex' : 'none';
      say('');
    });
    R.querySelector('#fin').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, btn = f.querySelector('button'); btn.disabled = true; say('…');
      const r = await api('/api/login', { username: f.username.value, password: f.password.value });
      btn.disabled = false;
      if (r.ok) return enter(r.data.name);
      say(MSG[r.data.error] || MSG.network, 'err');
    };
    R.querySelector('#frq').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, btn = f.querySelector('button'); btn.disabled = true; say('…');
      const r = await api('/api/request', { name: f.name.value, email: f.email.value });
      btn.disabled = false;
      if (r.ok) { f.reset(); return say('Richiesta inviata. Se approvata, riceverai le credenziali via email. · অনুরোধ পাঠানো হয়েছে। অনুমোদিত হলে ইমেইলে লগইন তথ্য পাবেন।', 'good'); }
      say(r.data.error === 'invalid' ? MSG.bad_form : (MSG[r.data.error] || MSG.network), 'err');
    };
  }

  async function enter(name) {
    R.replaceChildren(el('<div class="auth"><p class="sub" style="text-align:center">Caricamento… · লোড হচ্ছে…</p></div>'));
    const c = await api('/api/content');
    if (!c.ok) return showLogin(c.status === 401 ? MSG.expired : MSG.network);
    window.startStudy(c.data, name, async () => { await api('/api/logout', {}); location.hash = ''; location.reload(); });
  }

  (async function boot() {
    R.replaceChildren(el('<div class="auth"><p class="sub" style="text-align:center">…</p></div>'));
    const me = await api('/api/me');
    if (me.ok) enter(me.data.name); else showLogin();
  })();
})();
