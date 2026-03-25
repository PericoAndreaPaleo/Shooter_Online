# Shooter Online

**Un multiplayer shooter 2D top-down in tempo reale** sviluppato con **Kaboom.js** (client) e **Node.js + Socket.IO** (server).

Gioca in lobby da massimo 8 giocatori, con movimento fluido, tre armi distinte e una mappa procedurale con ostacoli.

---

## Armi Disponibili

| Arma       | Tipo              | Munizioni | Danno | Note |
|------------|-------------------|---------|-------|------|
| **Rifle**  | Fucile d'assalto  | 30      | 25    | Fuoco automatico |
| **Pistol** | Pistola           | 15      | 15    | Fuoco semi-automatico |
| **Fists**  | Pugni (corpo a corpo) | -     | 100   | 1-hit kill in mischia |

---

## Caratteristiche Principali

- **Grafica procedurale** con Kaboom.js (nessun asset esterno)
- **Audio sintetico** generato in tempo reale con Web Audio API
- **Supporto completo mobile** con doppio joystick virtuale
- **Sistema di lobby** pubblico e privato con password
- **Rejoin automatico** (puoi riconnetterti dopo una disconnessione)
- **Mappa procedurale** con rocce, alberi e cespugli
- **Fisica** con collisioni e risoluzione push-out
- **Rigenerazione HP** automatica dopo 4 secondi senza subire danni
- **Kill feed**, leaderboard e HUD responsivo
- **Ottimizzato** per bassa latenza (60 tick/sec)

---

## Controlli

### Desktop (Mouse + Tastiera)

- **WASD** → Movimento
- **Mouse** → Mira e sparo
- **1 / 2 / 3** → Cambia arma (Rifle / Pistol / Fists)
- **R** → Ricarica (quando non si usano i pugni)
- **ESC** (tenuto 1.5 secondi) → Suicidio e ritorno al menu di spawn

### Mobile (Touch)

- **Joystick sinistro** → Movimento
- **Joystick destro** → Mira e sparo automatico
- **Pulsanti in basso** → Cambio arma (AR / PI / FI) e Ricarica

---

## Tecnologie Utilizzate

### Client
- **Kaboom.js** – Motore grafico 2D
- **Socket.IO** – Comunicazione in tempo reale
- **Web Audio API** – Effetti sonori procedurali
- HTML5 Canvas + CSS per overlay UI

### Server
- **Node.js**
- **Express**
- **Socket.IO** (con namespace dedicati per lobby)
- Fisica e logica di gioco lato server per anti-cheat di base

---

## Struttura del Progetto

```
Shooter-Online/
├── client/                  # Tutti i file frontend
│   ├── index.html
│   ├── main.js             # Entry point
│   ├── state.js
│   ├── game.js
│   ├── weapons.js
│   ├── hud.js
│   ├── menu.js
│   ├── lobby.js
│   ├── touch.js
│   ├── audio.js
│   └── lib/kaboom.mjs
├── server.js                # Backend completo
├── package.json
└── README.md
```

---

## Come Avviare il Progetto

### Prerequisiti
- Node.js (v18 o superiore)

### Installazione

```bash
# Clona il repository
git clone <url-del-tuo-repo>
cd Shooter-Online

# Installa le dipendenze
npm install
```

### Avvio in Sviluppo

```bash
node server.js
```

Apri il browser e vai su:  
**`http://localhost:4000`**

---

## Funzionalità Avanzate

- **Rejoin Token**: se ti disconnetti, hai 5 minuti per rientrare con le stesse statistiche
- **Lobby private** con password
- **Minimappa** in tempo reale
- **Barre nere (letterbox)** automatiche per mantenere il rapporto 16:9
- **Auto-reload** della pagina al primo caricamento (risolve problemi di Kaboom)

---

## Note di Sviluppo

- Tutti i suoni sono **sintetizzati** (nessun file audio esterno)
- Il server gestisce la fisica e la validazione degli spari
- Il client interpola il movimento per una sensazione più fluida
- L'arma corpo a corpo si chiama **Fists** in tutto il codice e nell'interfaccia

---

## Possibili Miglioramenti Futuri

- Sistema di power-up
- Diverse mappe
- Modalità a squadre
- Statistiche persistenti
- Skin per i giocatori
- Chat in-game

---

## Licenza

Questo progetto è stato creato per scopi educativi e di divertimento.  
Sentiti libero di modificarlo e migliorarlo.

---