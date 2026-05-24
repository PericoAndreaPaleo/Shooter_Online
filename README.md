# Shooter Online

**Multiplayer shooter 2D top-down in tempo reale** sviluppato con **Kaboom.js** (client) e **Node.js + Socket.IO** (server).

Gioca in lobby da massimo 8 giocatori con movimento fluido, tre armi distinte, una mappa procedurale con ostacoli, un sistema di account con statistiche persistenti, un Battle Pass con skin cosmetiche in tempo reale e supporto completo per dispositivi mobile.

---

## Indice

- [Funzionalità](#funzionalità)
- [Account e statistiche](#account-e-statistiche)
- [Battle Pass e cosmetics](#battle-pass-e-cosmetics)
- [Armi](#armi)
- [Controlli](#controlli)
- [Tecnologie](#tecnologie)
- [Struttura del progetto](#struttura-del-progetto)
- [Database](#database)
- [Avvio rapido](#avvio-rapido)
- [Deploy con Docker](#deploy-con-docker)
- [Deploy su Render](#deploy-su-render)
- [Architettura](#architettura)

---

## Funzionalità

- **Lobby pubbliche e private** — crea o unisciti a una lobby; le lobby private sono protette da password
- **Rejoin automatico** — se ti disconnetti, hai 5 minuti per rientrare mantenendo nickname e statistiche di sessione
- **Sistema di account** — registrazione, login e logout con sessione persistente tramite cookie sicuro (httpOnly)
- **Statistiche persistenti** — kills, morti, partite, XP e livello salvati in database MySQL in tempo reale
- **Leaderboard globale** — classifica aggiornata accessibile direttamente dal menu di spawn
- **Mappa procedurale** — rocce, alberi e cespugli generati con seed casuale ad ogni nuova lobby
- **Fisica lato server** — movimento, collisioni e validazione degli spari gestiti dal server (anti-cheat di base)
- **Interpolazione client** — i movimenti vengono interpolati per un'esperienza più fluida anche con latenza
- **Audio sintetico** — tutti gli effetti sonori sono generati in tempo reale con Web Audio API (nessun file audio esterno)
- **Supporto mobile completo** — doppio joystick virtuale con mira e sparo automatico
- **HUD responsivo** — barre HP, munizioni, kill feed, leaderboard e minimappa in tempo reale
- **Barre nere (letterbox)** — mantenimento automatico del rapporto 16:9 su qualsiasi schermo
- **Rigenerazione HP** — la vita si rigenera automaticamente dopo 4 secondi senza subire danni
- **60 tick/secondo** — game loop server ottimizzato per bassa latenza
- **Skin cosmetiche in tempo reale** — i cambi di skin vengono propagati a tutti i giocatori della lobby istantaneamente via socket

---

## Account e statistiche

### Registrazione e login

All'avvio il gioco controlla se esiste una sessione attiva (cookie). Se non sei loggato, viene mostrata la schermata di login/registrazione. Puoi anche giocare come **ospite** (nickname casuale, nessuna statistica salvata).

### Statistiche salvate

| Campo | Descrizione |
|---|---|
| **Kills** | Numero totale di eliminazioni |
| **Morti** | Numero totale di volte che sei stato eliminato da un avversario |
| **Partite** | Numero di sessioni di gioco (conta solo al primo spawn per sessione) |
| **XP** | Esperienza accumulata (+10 per kill, +2 per partecipazione a una partita) |
| **Livello** | Calcolato automaticamente: `floor(XP / 100) + 1` |

### Comportamento del conteggio morti

Il **selfKill volontario** (tenere ESC per 1.5 secondi per tornare al menu di spawn) **non conta come morte** né nel database né nei contatori di sessione. Solo le eliminazioni da parte di altri giocatori incrementano il contatore morti.

### Menu di spawn — statistiche mostrate

Il menu di spawn mostra, se sei loggato:

- Username, livello e XP totali
- **TOTALE**: kills e morti cumulativi dell'account con K/D ratio
- **QUESTA PARTITA**: kills e morti della sessione corrente (visibile solo dopo il primo kill o la prima morte)

### Integrità dei dati — transazioni SQL

L'endpoint `aggiorna_stats.php` usa una **transazione esplicita** per garantire che la validazione del token e l'aggiornamento delle statistiche siano sempre atomici. Se una delle due operazioni fallisce (errore di rete, crash, timeout), viene eseguito un rollback automatico e il database torna allo stato precedente alla chiamata, senza lasciare dati parziali.

---

## Battle Pass e cosmetics

### Panoramica

Il Battle Pass è un sistema di progressione cosmetica che sblocca colori per il personaggio e per l'arma al raggiungimento di determinati livelli. Non influenza il gameplay.

### Reward disponibili

| Livello | Tipo | Nome | Colore |
|---|---|---|---|
| 5 | Player | Crimson | Rosso |
| 10 | Weapon | Cobalt | Blu |
| 15 | Player | Phantom | Viola |
| 20 | Weapon | Ember | Arancione |
| 25 | Player | Neon | Verde neon |
| 30 | Weapon | Gilded | Oro |
| 35 | Player | Glacial | Azzurro ghiaccio |
| 40 | Weapon | Sakura | Rosa |
| 45 | Player | Prism | 🌈 Rainbow animato |
| 50 | Player + Weapon | LEGENDARY | 🌈 Rainbow animato (entrambi) |

### Funzionamento

- Le skin sbloccate vengono selezionate dalla schermata Battle Pass accessibile dal menu
- La scelta viene salvata nel database via `salva_cosmetics.php`
- Ogni volta che si equipa o desequipa una skin, il client emette l'evento socket `updateCosmetics` al server
- Il server aggiorna immediatamente l'oggetto player e al tick successivo (~16ms) lo snapshot include già il nuovo colore, visibile a tutti i giocatori della lobby in tempo reale
- Il giocatore locale legge il colore direttamente da `localStorage` (aggiornamento immediato senza attendere il round-trip server); gli avversari lo ricevono tramite lo snapshot

---

## Armi

| Arma | Tipo | Munizioni | Danno | Cooldown | Ricarica |
|---|---|---|---|---|---|
| **Rifle** | Fucile d'assalto | 30 | 25 | 100ms | 2.0s |
| **Pistol** | Pistola semi-automatica | 15 | 15 | 200ms | 1.5s |
| **Fists** | Corpo a corpo | ∞ | 100 | 200ms | — |

> **Fists**: attacco melee in un raggio di 60px con cono frontale di ±90°. Un colpo è letale.

---

## Controlli

### Desktop (Mouse + Tastiera)

| Tasto | Azione |
|---|---|
| `W A S D` | Movimento |
| `Mouse` | Mira |
| `Click sinistro` | Sparo |
| `1` | Seleziona Rifle |
| `2` | Seleziona Pistol |
| `3` | Seleziona Fists |
| `R` | Ricarica manuale |
| `ESC` (tieni 1.5s) | Ritorno al menu di spawn (non conta come morte) |

### Mobile (Touch)

| Controllo | Azione |
|---|---|
| Joystick sinistro | Movimento |
| Joystick destro | Mira + sparo automatico |
| Pulsanti `AR` / `PI` / `FI` | Cambio arma |
| Pulsante `R` | Ricarica manuale |

---

## Tecnologie

### Client

| Tecnologia | Utilizzo |
|---|---|
| [Kaboom.js](https://kaboomjs.com/) | Motore grafico 2D (rendering, camera, input) |
| [Socket.IO](https://socket.io/) (client) | Comunicazione in tempo reale con il server |
| Web Audio API | Effetti sonori procedurali (nessun file esterno) |
| HTML5 Canvas + CSS | Overlay UI, HUD, joystick touch |
| ES Modules | Architettura modulare del client |

### Server

| Tecnologia | Utilizzo |
|---|---|
| [Node.js](https://nodejs.org/) v20 | Runtime server-side |
| [Express](https://expressjs.com/) ^4.18 | Serving dei file statici del client |
| [Socket.IO](https://socket.io/) ^4.7 (server) | Namespace dedicati per ogni lobby |
| `crypto` (built-in) | Generazione token di rejoin e ID lobby |

### Backend / Persistenza

| Tecnologia | Utilizzo |
|---|---|
| PHP 8.2 | API REST per autenticazione, statistiche e cosmetics |
| MySQL 8.0 | Database utenti, sessioni, statistiche e cosmetics giocatore |
| Apache 2 | Server PHP (porta interna 8080) |
| nginx | Reverse proxy: instrada `/php/` verso Apache, tutto il resto verso Node.js |

---

## Struttura del progetto

```
Shooter_Online/
├── client/                     # Tutti i file del frontend
│   ├── index.html              # Entry HTML (carica main.js come modulo)
│   ├── main.js                 # Entry point: init Kaboom, socket, moduli, AJAX stats
│   ├── state.js                # Stato globale condiviso (unica sorgente di verità)
│   ├── game.js                 # Input tastiera, logica di sparo, rendering stato
│   ├── hud.js                  # HUD: HP, munizioni, kill feed, leaderboard, minimappa
│   ├── lobby.js                # Schermata selezione/creazione lobby
│   ├── menu.js                 # Menu di spawn con statistiche account e leaderboard
│   ├── auth.js                 # Schermata login/registrazione e gestione sessione
│   ├── battlepass.js           # Battle Pass: reward, equip/unequip skin, sync server in tempo reale
│   ├── weapons.js              # Rendering armi e animazione pugni
│   ├── touch.js                # Joystick virtuali e bottoni mobile
│   ├── audio.js                # Effetti sonori via Web Audio API
│   └── lib/
│       └── kaboom.mjs          # Libreria Kaboom.js (bundled, nessuna CDN richiesta)
├── server/
│   └── server.js               # Server completo: lobby, fisica, game loop, handler updateCosmetics
├── php/
│   ├── auth.php                # Endpoint autenticazione centralizzato
│   ├── login.php               # Login utente (restituisce token + stats)
│   ├── register.php            # Registrazione nuovo account
│   ├── logout.php              # Invalidazione sessione e cookie
│   ├── check_session.php       # Verifica sessione attiva al caricamento
│   ├── aggiorna_stats.php      # +1 kill oppure +1 morte in tempo reale (con transazione SQL)
│   ├── salva_statistiche.php   # +1 partita al primo spawn della sessione
│   ├── salva_cosmetics.php     # Salva/legge skin Battle Pass nel DB (POST con transazione SQL)
│   ├── classifica.php          # Leaderboard globale
│   └── db.php                  # Connessione PDO al database MySQL
├── Dockerfile                  # Build immagine: PHP 8.2 + Apache + Node.js 20 + nginx
├── nginx.conf                  # Reverse proxy: porta 10000 → Apache :8080 / Node :4000
├── start.sh                    # Script di avvio: Apache + Node.js + nginx
├── package.json
└── README.md
```

### Responsabilità dei moduli client

| Modulo | Responsabilità |
|---|---|
| `main.js` | Inizializzazione, connessione socket, injection dipendenze, AJAX kills/morti/partite, rejoin automatico |
| `state.js` | Stato globale (socket, ID, arma, munizioni, input, zoom camera, dati account) — nessuna dipendenza |
| `game.js` | Input WASD, sparo, camera Kaboom, applicazione snapshot server, gestione selfKill, rendering skin |
| `hud.js` | Tutti gli elementi overlay: HP, ammo, stats di sessione, kill feed, leaderboard, minimappa |
| `lobby.js` | UI di selezione/creazione lobby, gestione eventi Socket.IO del menu principale |
| `menu.js` | Menu di spawn con stats account (totale + sessione corrente) e accesso alla leaderboard |
| `auth.js` | Schermata login/registrazione, checkSession, logout, callback post-autenticazione |
| `battlepass.js` | Reward cosmetics, equip/unequip skin, salvataggio DB, notifica server via `updateCosmetics` |
| `weapons.js` | Disegno grafico di armi e mani con colori cosmetici (solo rendering, nessuna logica di gioco) |
| `touch.js` | Joystick sinistro (movimento) e destro (mira/sparo), bottoni arma e ricarica |
| `audio.js` | Suoni sintetici per sparo, colpo, kill, pugni e morte |

---

## Database

Schema MySQL con 4 tabelle. Il file di dump è `bfeokmrnutfoddieljtb.sql`.

### Tabelle

#### `utenti`
| Campo | Tipo | Note |
|---|---|---|
| `id` | int AUTO_INCREMENT | Primary key |
| `username` | varchar(30) | Unico |
| `email` | varchar(100) | Unica |
| `password_hash` | varchar(255) | bcrypt (`$2y$10$...`) |
| `creato_il` | datetime | Default: NOW() |
| `ultimo_accesso` | datetime | Default: NOW() |

#### `sessioni`
| Campo | Tipo | Note |
|---|---|---|
| `token` | varchar(64) | Primary key (hash hex) |
| `utente_id` | int | FK → `utenti.id` CASCADE DELETE |
| `scade_il` | datetime | Scadenza sessione |
| `ip` | varchar(45) | IP del client (nullable) |

#### `statistiche_giocatore`
| Campo | Tipo | Note |
|---|---|---|
| `utente_id` | int | PK + FK → `utenti.id` CASCADE DELETE |
| `kills_totali` | int | Default: 0 |
| `morti_totali` | int | Default: 0 |
| `partite` | int | Default: 0 |
| `xp` | int | Default: 0 |
| `livello` | int | Default: 1 |

#### `cosmetics_giocatore`
| Campo | Tipo | Note |
|---|---|---|
| `utente_id` | int | PK + FK → `utenti.id` CASCADE DELETE |
| `player_color_id` | varchar(32) | ID skin selezionata per il personaggio (nullable) |
| `weapon_color_id` | varchar(32) | ID skin selezionata per l'arma (nullable) |

### Configurazione connessione

Imposta le credenziali in `php/db.php`:

```php
$host = 'localhost';
$dbname = 'nome_database';
$user = 'utente';
$password = 'password';
```

---

## Avvio rapido

### Prerequisiti

- [Node.js](https://nodejs.org/) v18 o superiore
- PHP 8.x con estensioni PDO e pdo_mysql
- MySQL / MariaDB

### Installazione

```bash
# Clona il repository
git clone <url-del-repo>
cd Shooter_Online

# Installa le dipendenze Node
npm install
```

Configura le credenziali del database in `php/db.php`, quindi importa lo schema:

```bash
mysql -u utente -p nome_database < bfeokmrnutfoddieljtb.sql
```

### Avvio

```bash
npm start
```

Apri il browser su **`http://localhost:4000`**

> Per testare il multiplayer in locale apri più tab o finestre dello stesso browser.

---

## Deploy con Docker

Il `Dockerfile` costruisce un'immagine all-in-one con **PHP 8.2 + Apache**, **Node.js 20** e **nginx**, tutti in un singolo container.

### Architettura interna del container

```
Internet → nginx :10000
               ├── /php/*  → Apache :8080 (PHP)
               └── /*      → Node.js :4000 (gioco + Socket.IO)
```

Lo script `start.sh` avvia in sequenza:
1. Apache sulla porta `8080`
2. Node.js sulla porta `4000`
3. nginx in foreground sulla porta `10000` (processo principale del container)

### Build e avvio

```bash
docker build -t shooter-online .
docker run -p 10000:10000 shooter-online
```

Apri il browser su **`http://localhost:10000`**

> Ricorda di impostare le variabili d'ambiente o configurare `php/db.php` con i dati del database prima della build, oppure montare il file come volume.

---

## Deploy su Render

Il progetto include un meccanismo di **keep-alive** integrato per il piano gratuito di [Render.com](https://render.com), che mette in standby i server dopo 15 minuti di inattività.

Se la variabile d'ambiente `RENDER_EXTERNAL_URL` è definita, il server si auto-pinga ogni 10 minuti per restare attivo.

### Passaggi

1. Crea un nuovo **Web Service** su Render
2. Collega il repository GitHub
3. Imposta:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Render assegnerà automaticamente `RENDER_EXTERNAL_URL` — il keep-alive si attiva da solo

> Per il deploy su Render senza Docker assicurati che il database MySQL sia raggiungibile esternamente (es. Clever Cloud, PlanetScale, Railway) e che le credenziali in `php/db.php` siano aggiornate.

---

## Architettura

### Comunicazione client ↔ server

Il server usa **due livelli di namespace Socket.IO**:

- **`/` (namespace principale)** — gestisce la lista lobby, la creazione e il join. Tutti i client connessi lo usano prima di entrare in una partita.
- **`/lobby/<id>` (namespace per lobby)** — creato dinamicamente ad ogni nuova lobby. Gestisce tutto il gameplay: input, sparo, fisica, broadcast stato.

```
Client                          Server
  │                               │
  ├─── io("/")                    │  Namespace principale
  │     ├── createLobby  ───────► │  Crea lobby + namespace dedicato
  │     ├── joinLobby    ───────► │  Verifica capienza e password
  │     └── lobbyList    ◄─────── │  Lista lobby aggiornata
  │                               │
  └─── io("/lobby/<id>")          │  Namespace gameplay
        ├── join           ──────► │  Assegna nickname + token + skin iniziali
        ├── spawn          ──────► │  Posiziona il giocatore in mappa
        ├── input          ──────► │  Direzione di movimento (WASD)
        ├── aim            ──────► │  Angolo di mira (radianti)
        ├── shoot          ──────► │  Sparo / attacco melee
        ├── setWeapon      ──────► │  Cambio arma
        ├── reload         ──────► │  Ricarica manuale
        ├── selfKill       ──────► │  Respawn volontario (ESC hold, non conta come morte)
        ├── updateCosmetics ─────► │  Aggiorna skin in tempo reale (propagata a tutti al tick successivo)
        └── state          ◄────── │  Snapshot completo ~60×/sec (include playerColorId, weaponColorId)
```

### Game loop server (60 tick/sec)

Ad ogni tick il server:
1. Calcola il **delta time** (clamped a 50ms per evitare salti dopo lag)
2. Aggiorna la **posizione** di tutti i giocatori vivi in base all'input ricevuto
3. Risolve le **collisioni** con i bordi mappa e gli ostacoli solidi (push-out circolare)
4. Gestisce la **rigenerazione HP** (4s dopo l'ultimo colpo subito, +8 HP/s)
5. Muove i **proiettili** e testa le collisioni con ostacoli e giocatori
6. Emette lo **snapshot di stato** a tutti i client della lobby (include colori cosmetici di ogni giocatore)

### Sistema di statistiche

Le statistiche vengono salvate in tempo reale via AJAX al verificarsi dell'evento, senza attendere la disconnessione:

- `aggiorna_stats.php` → chiamato su ogni kill o morte reale (+1 kill o +1 morte) — usa transazione SQL
- `salva_statistiche.php` → chiamato al primo spawn della sessione (+1 partita, +2 XP)

Il **selfKill** (ESC hold) non invia nessuna chiamata AJAX: il flag `selfKillPending` sul client intercetta la morte nel snapshot successivo e la scarta silenziosamente.

### Sistema cosmetics in tempo reale

Quando un giocatore equipaggia o desequipa una skin:
1. `battlepass.js` aggiorna `localStorage` (effetto immediato sul giocatore locale)
2. Emette `updateCosmetics` al server con i nuovi `playerColorId` e `weaponColorId`
3. Il server aggiorna l'oggetto player nel suo stato interno
4. Al tick successivo (~16ms) lo snapshot include già i nuovi colori
5. Tutti i client della lobby applicano il colore al rendering del giocatore interessato

### Sistema di rejoin

Alla disconnessione il server salva un token crittografico associato a nickname, kills e deaths. Il token è valido 5 minuti. Se il giocatore si riconnette con lo stesso token (da `localStorage`), recupera la sua sessione precedente senza perdere le statistiche.

Se la lobby rimane vuota per 5 minuti consecutivi, viene rimossa automaticamente.

---

## Licenza

Questo progetto è stato creato per scopi educativi e di divertimento. Sentiti libero di modificarlo e migliorarlo.