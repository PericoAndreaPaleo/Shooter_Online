# Shooter Online

Un top-down shooter multiplayer browser-based, costruito con **Node.js**, **Socket.IO** e **Kaboom.js**.  
Supporta più lobby simultanee, gioco su mobile con joystick virtuale, lobby private con password e rejoin automatico dopo disconnessione.

---

## Gameplay

- Movimento con **WASD**, mira con il **mouse**
- Tasto sinistro del mouse per sparare (auto-fire con il mitra)
- **R** per ricaricare
- Tasti **1 / 2 / 3** per cambiare arma
- Su mobile: joystick sinistro per muoversi, joystick destro per mirare e sparare

### Armi

| Arma | Danno | Cadenza | Munizioni |
|------|-------|---------|-----------|
| Mitra (`gun`) | 25 | Auto 100ms | 30 |
| Pistola (`pistol`) | 15 | Semi 200ms | 15 |
| Pugni (`fists`) | 100 | 400ms | ∞ |

- Rigenerazione HP automatica dopo 4 secondi senza ricevere danni
- HP massimi: 100

---

### Stack

- **Backend:** Node.js, Express, Socket.IO
- **Frontend:** Kaboom.js (game engine), Socket.IO client
- **Hosting:** [Render](https://render.com) (free tier)

### Come funziona il server

- La fisica gira **server-side a 60fps** (movimento, collisioni, proiettili) — niente cheating lato client
- Ogni lobby ha un **namespace Socket.IO dedicato** (`/lobby/<id>`) per isolare il traffico
- La mappa è **procedurale con seed** — rocce, alberi e cespugli generati casualmente a ogni lobby
- Il broadcast dello stato ai client avviene insieme al game loop

---

## Avvio locale

### Prerequisiti

- Node.js 18+
- npm

### Installazione

```bash
git clone https://github.com/tuo-username/shooter-online.git
cd shooter-online
npm install
npm start
```

Il server si avvia sulla porta `4000` (o sulla porta definita dalla variabile d'ambiente `PORT`).  
Apri il browser su `http://localhost:4000`.

---

## Deploy su Render

1. Crea un account su [render.com](https://render.com)
2. **New → Web Service** → connetti la tua repo GitHub
3. Impostazioni:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Nella sezione **Environment**, aggiungi la variabile:
   - `RENDER_EXTERNAL_URL` → l'URL del tuo servizio (es. `https://shooter-online.onrender.com`)  
     Serve per il keep-alive automatico ogni 10 minuti (evita lo sleep del piano gratuito)

---

## Funzionalità

### Lobby

- Crea lobby pubblica o privata (con password)
- Lista lobby in tempo reale aggiornata via Socket.IO
- Massimo 8 giocatori per lobby
- Nickname generati automaticamente (es. `ShadowWolf`, `IronFalcon`)
- Cleanup automatico dopo 5 minuti di lobby vuota

### Rejoin

Se la connessione cade, il client salva un token in `localStorage` e al ricaricamento della pagina tenta automaticamente il rejoin nella stessa lobby, recuperando kills e deaths.

### Mappa

- 5000×5000 px
- 80 rocce (collidono), 60 alberi (collidono), 70 cespugli (decorativi)
- Generazione procedurale seed-based — diversa a ogni lobby

---

## Variabili d'ambiente

| Variabile | Descrizione | Default |
|-----------|-------------|---------|
| `PORT` | Porta del server | `4000` |
| `RENDER_EXTERNAL_URL` | URL pubblico per il keep-alive | — |

---

## Dipendenze

```json
{
  "express": "^4.18.2",
  "socket.io": "^4.7.1"
}
```

---

## Licenza

MIT