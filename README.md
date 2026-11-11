# Scuola Guida · Patente A e B (IT / বাংলা) – versione con accesso

Cosa è cambiato rispetto al file HTML singolo:

- **Niente più download dell'HTML.** Il pulsante è stato tolto e i contenuti (domande, traduzioni, immagini) non sono più dentro la pagina: stanno sul server e vengono inviati solo a chi ha fatto login.
- **Richiesta accesso**: chiunque inserisce nome ed email dalla schermata di login.
- **Approvazione admin con un click** nel pannello `/admin`: il sistema genera utente e password e le invia via email (italiano + bengalese).
- **Un solo dispositivo per credenziale**: al primo login il dispositivo si lega alle credenziali; da un altro dispositivo il login viene rifiutato. L'admin può sbloccare, rigenerare o revocare.
- **Login admin** separato su `/admin`.

## Avvio

```bash
npm install
cp .env.example .env     # compila i valori (vedi sotto)
npm start                # http://localhost:3000   (admin: /admin)
```

Serve Node 20.12 o superiore. Se non imposti `ADMIN_PASSWORD`, al primo avvio ne viene generata una e stampata **una volta sola** nel terminale.

## Configurazione (`.env`)

| Variabile | A cosa serve |
|---|---|
| `BASE_URL` | indirizzo pubblico del sito (link nelle email) |
| `ADMIN_USER`, `ADMIN_PASSWORD` | accesso al pannello `/admin` |
| `ADMIN_EMAIL` | riceve un avviso a ogni nuova richiesta |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | invio email. Con Gmail usa una *password per le app* |
| `DATA_DIR` | dove si salva `db.json` (utenti e sessioni) |
| `TRUST_PROXY=1` | se l'hosting mette HTTPS davanti al server |

Senza SMTP il sito funziona, ma le email non partono: all'approvazione le credenziali compaiono nel pannello admin e vanno inoltrate a mano.

## Pubblicazione

Serve un hosting che esegua Node.js **e** abbia un **disco persistente** per `DATA_DIR` (VPS, Railway/Fly con volume, Render con disco a pagamento). Sui piani gratuiti con disco temporaneo gli utenti verrebbero cancellati a ogni riavvio. Usa sempre HTTPS.

## Uso quotidiano

1. L'utente chiede l'accesso → l'admin riceve l'avviso via email.
2. Admin → `/admin` → **Approva e invia credenziali** (un click).
3. L'utente riceve l'email e accede: da quel momento le credenziali valgono solo sul suo dispositivo.
4. Ha cambiato telefono? Admin → **Sblocca dispositivo**. Ha perso l'email? **Nuove credenziali**.

## Limiti da conoscere

- Il vincolo al dispositivo usa un cookie: se l'utente cancella i dati del browser o cambia browser, serve **Sblocca dispositivo**.
- Chi ha accesso può comunque fare screenshot o stampare (la stampa resta disponibile). Il sistema impedisce di scaricare/condividere il file e di usare le credenziali su più dispositivi, non di copiare ciò che si vede.
- I contenuti originali sono in `content/content.json` (non pubblico): non metterlo in cartelle servite dal web.

## Test

`npm test` avvia un server email finto e verifica l'intero flusso (richiesta, approvazione, email, login, blocco secondo dispositivo, sblocco, revoca, rate limit).
