# Shooter Online

**Multiplayer shooter 2D top-down in tempo reale** sviluppato con **Kaboom.js** (client) e **Node.js + Socket.IO** (server).

Gioca in lobby da massimo 8 giocatori con movimento fluido, tre armi distinte, una mappa procedurale con ostacoli e supporto completo per dispositivi mobile.

---

## Indice

- [Funzionalità](#funzionalità)
- [Armi](#armi)
- [Controlli](#controlli)
- [Tecnologie](#tecnologie)
- [Struttura del progetto](#struttura-del-progetto)
- [Avvio rapido](#avvio-rapido)
- [Deploy su Render](#deploy-su-render)
- [Architettura](#architettura)
- [Possibili miglioramenti](#possibili-miglioramenti)

---

## Funzionalità

- **Lobby pubbliche e private** — crea o unisciti a una lobby; le lobby private sono protette da password
- **Rejoin automatico** — se ti disconnetti, hai 5 minuti per rientrare mantenendo nickname e statistiche (kill/death)
- **Mappa procedurale** — rocce, alberi e cespugli generati con seed casuale ad ogni nuova lobby
- **Fisica lato server** — movimento, collisioni e validazione degli spari gestiti dal server (anti-cheat di base)
- **Interpolazione client** — i movimenti vengono interpolati per un'esperienza più fluida anche con latenza
- **Audio sintetico** — tutti gli effetti sonori sono generati in tempo reale con Web Audio API (nessun file audio esterno)
- **Supporto mobile completo** — doppio joystick virtuale con mira e sparo automatico
- **HUD responsivo** — barre HP, munizioni, kill feed, leaderboard e minimappa in tempo reale
- **Barre nere (letterbox)** — mantenimento automatico del rapporto 16:9 su qualsiasi schermo
- **Rigenerazione HP** — la vita si rigenera automaticamente dopo 4 secondi senza subire danni
- **60 tick/secondo** — game loop server ottimizzato per bassa latenza

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
| `ESC` (tieni 1.5s) | Suicidio → ritorno al menu di spawn |

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
| [Node.js](https://nodejs.org/) | Runtime server-side |
| [Express](https://expressjs.com/) | Serving dei file statici del client |
| [Socket.IO](https://socket.io/) (server) | Namespace dedicati per ogni lobby |
| `crypto` (built-in) | Generazione token di rejoin e ID lobby |

---

## Struttura del progetto

```
Shooter_Online/
├── client/                     # Tutti i file del frontend
│   ├── index.html              # Entry HTML (carica main.js come modulo)
│   ├── main.js                 # Entry point: init Kaboom, socket, moduli
│   ├── state.js                # Stato globale condiviso (unica sorgente di verità)
│   ├── game.js                 # Input tastiera, logica di sparo, rendering stato
│   ├── hud.js                  # HUD: HP, munizioni, kill feed, leaderboard, minimappa
│   ├── lobby.js                # Schermata selezione/creazione lobby
│   ├── menu.js                 # Menu di spawn (mostrato all'ingresso in una lobby)
│   ├── weapons.js              # Rendering armi e animazione pugni
│   ├── touch.js                # Joystick virtuali e bottoni mobile
│   ├── audio.js                # Effetti sonori via Web Audio API
│   └── lib/
│       └── kaboom.mjs          # Libreria Kaboom.js (bundled, nessuna CDN richiesta)
├── server/
│   └── server.js               # Server completo: lobby, fisica, game loop
├── package.json
├── package-lock.json
└── README.md
```

### Responsabilità dei moduli client

| Modulo | Responsabilità |
|---|---|
| `main.js` | Inizializzazione, connessione socket, injection dipendenze, rejoin automatico |
| `state.js` | Stato globale (socket, ID, arma, munizioni, input, zoom camera) — nessuna dipendenza |
| `game.js` | Input WASD, sparo, camera Kaboom, applicazione snapshot server |
| `hud.js` | Tutti gli elementi overlay: HP, ammo, stats, kill feed, leaderboard, minimappa |
| `lobby.js` | UI di selezione/creazione lobby, gestione eventi Socket.IO del menu principale |
| `menu.js` | Menu di spawn mostrato dopo `init` — prima di entrare in partita |
| `weapons.js` | Disegno grafico di armi e mani (solo rendering, nessuna logica di gioco) |
| `touch.js` | Joystick sinistro (movimento) e destro (mira/sparo), bottoni arma e ricarica |
| `audio.js` | Suoni sintetici per sparo, colpo, kill, pugni e morte |

---

## Avvio rapido

### Prerequisiti

- [Node.js](https://nodejs.org/) v18 o superiore

### Installazione

```bash
# Clona il repository
git clone <url-del-repo>
cd Shooter_Online

# Installa le dipendenze
npm install
```

### Avvio

```bash
npm start
```

Apri il browser su **`http://localhost:4000`**

> Per testare il multiplayer in locale apri più tab o finestre dello stesso browser.

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
  │     ├── createLobby  ──────► │  Crea lobby + namespace dedicato
  │     ├── joinLobby    ──────► │  Verifica capienza e password
  │     └── lobbyList    ◄────── │  Lista lobby aggiornata
  │                               │
  └─── io("/lobby/<id>")          │  Namespace gameplay
        ├── join         ──────► │  Assegna nickname + token
        ├── spawn        ──────► │  Posiziona il giocatore in mappa
        ├── input        ──────► │  Direzione di movimento (WASD)
        ├── aim          ──────► │  Angolo di mira (radianti)
        ├── shoot        ──────► │  Sparo / attacco melee
        ├── setWeapon    ──────► │  Cambio arma
        ├── reload       ──────► │  Ricarica manuale
        ├── selfKill     ──────► │  Suicidio volontario (ESC hold)
        └── state        ◄────── │  Snapshot completo ~60×/sec
```

### Game loop server (60 tick/sec)

Ad ogni tick il server:
1. Calcola il **delta time** (clamped a 50ms per evitare salti dopo lag)
2. Aggiorna la **posizione** di tutti i giocatori vivi in base all'input ricevuto
3. Risolve le **collisioni** con i bordi mappa e gli ostacoli solidi (push-out circolare)
4. Gestisce la **rigenerazione HP** (4s dopo l'ultimo colpo subito, +8 HP/s)
5. Muove i **proiettili** e testa le collisioni con ostacoli e giocatori
6. Emette lo **snapshot di stato** a tutti i client della lobby

### Sistema di rejoin

Alla disconnessione il server salva un token crittografico associato a nickname, kills e deaths. Il token è valido 5 minuti. Se il giocatore si riconnette con lo stesso token (da `localStorage`), recupera la sua sessione precedente senza perdere le statistiche.

Se la lobby rimane vuota per 5 minuti consecutivi, viene rimossa automaticamente.

---

## Possibili miglioramenti

- [ ] Sistema di power-up (velocità, scudo, munizioni extra)
- [ ] Mappe multiple con layout diversi
- [ ] Modalità a squadre (team deathmatch)
- [ ] Statistiche persistenti (database)
- [ ] Skin personalizzabili per i giocatori
- [ ] Chat in-game
- [ ] Spettatore (spectate mode) dopo la morte
- [ ] Suoni ambientali procedurali

---

## Licenza

Questo progetto è stato creato per scopi educativi e di divertimento.
Sentiti libero di modificarlo e migliorarlo.