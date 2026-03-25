// ============================================================
// state.js — Stato globale condiviso tra tutti i moduli client
//
// Tutti i moduli importano da qui invece di usare variabili
// globali disperse, rendendo il flusso dei dati esplicito e
// tracciabile. Questo file NON ha dipendenze sugli altri moduli.
// ============================================================

/** Larghezza logica del canvas di gioco (coordinate HUD) */
export const GAME_W = 1600;

/** Altezza logica del canvas di gioco (coordinate HUD) */
export const GAME_H = 900;

/**
 * Stato globale della sessione corrente.
 * Viene letto e scritto da quasi tutti i moduli.
 */
export const state = {
    // ── Socket ─────────────────────────────────────────────────
    /** Socket del namespace della lobby corrente (gameplay) */
    socket: null,
    /** Socket del namespace principale "/" (lista lobby) */
    mainSocket: null,

    // ── Identità del giocatore ──────────────────────────────────
    myId:        null,   // socket.id assegnato dal server
    myLobbyId:   null,
    myLobbyName: null,
    myToken:     null,   // token per il rejoin dopo disconnessione
    myNickname:  "",

    // ── Mappa e ostacoli ────────────────────────────────────────
    mapSize:   { width: 5000, height: 5000 },
    ostacoli:  [], // array di ostacoli ricevuto dal server all'init

    // ── Camera e schermate ──────────────────────────────────────
    cameraInizializzata: false,
    inMenu:         true,  // true → schermata di spawn visibile
    inLobbyScreen:  true,  // true → schermata selezione lobby visibile
    CAM_ZOOM: 1,           // fattore zoom Kaboom (aggiornato su resize)

    // ── Giocatori e proiettili ──────────────────────────────────
    /** Mappa locale degli sprite dei giocatori: { [socketId]: playerRenderData } */
    players: {},
    /** Mappa degli sprite proiettile attivi: { [bulletId]: kaboomObject } */
    bulletSprites: {},

    // ── Input ───────────────────────────────────────────────────
    /** Stato corrente dei tasti direzionali */
    input: { left: false, right: false, up: false, down: false },
    /** Ultima stringa JSON inviata al server (evita invii ridondanti) */
    prevInput: "",

    // ── Arma corrente ───────────────────────────────────────────
    weapon: "gun",

    // ── HUD — statistiche ───────────────────────────────────────
    myKills:  0,
    myDeaths: 0,

    // ── HUD — munizioni e ricarica ──────────────────────────────
    myAmmo:          { gun: 30, pistol: 15 },
    isReloading:     false,
    reloadStartTime: 0,     // timestamp ms dell'inizio ricarica
    reloadDuration:  0,     // durata totale ricarica in ms

    // ── Joystick touch (mobile) ─────────────────────────────────
    aimJoyAngle:  0,                    // angolo di mira dal joystick destro
    aimJoyActive: false,                // true se il joystick destro è attivo
    aimJoyDir:    { x: 0, y: 0 },      // direzione normalizzata del joystick destro
};

// ============================================================
// RILEVAMENTO MOBILE
// ============================================================

/**
 * Restituisce true se il dispositivo supporta il touch
 * (smartphone, tablet). Usato per mostrare i joystick.
 * @returns {boolean}
 */
export const isMobile = () =>
    navigator.maxTouchPoints > 0 || "ontouchstart" in window;

// ============================================================
// CALCOLO LETTERBOX (PILLARBOX / LETTERBOX)
// ============================================================

/**
 * Calcola i parametri del letterbox per adattare il canvas
 * GAME_W × GAME_H alla finestra corrente, mantenendo l'aspect ratio.
 *
 * @returns {{ scale: number, left: number, top: number }}
 *   scale: fattore di scala uniforme
 *   left:  margine sinistro (pillarbox) in pixel schermo
 *   top:   margine superiore (letterbox) in pixel schermo
 */
export function calcolaLetterbox() {
    const scaleX = window.innerWidth  / GAME_W;
    const scaleY = window.innerHeight / GAME_H;
    const scale  = Math.min(scaleX, scaleY); // usa la scala minore per non uscire dallo schermo

    const left = Math.round((window.innerWidth  - GAME_W * scale) / 2);
    const top  = Math.round((window.innerHeight - GAME_H * scale) / 2);

    return { scale, left, top };
}

/**
 * Restituisce solo il fattore di scala del letterbox.
 * Usato da Kaboom come zoom della camera.
 * @returns {number}
 */
export function calcolaZoom() {
    return calcolaLetterbox().scale;
}

// ============================================================
// HELPER PER COORDINATE HUD
// I widget HUD usano coordinate logiche (0..GAME_W, 0..GAME_H)
// che vanno trasformate in coordinate schermo tenendo conto
// del letterbox.
// ============================================================

/**
 * Converte una coordinata X logica in coordinata X schermo.
 * @param {number} logicalX - Coordinata logica (0..GAME_W)
 * @returns {number} Coordinata pixel sullo schermo
 */
export function hx(logicalX) {
    const { scale, left } = calcolaLetterbox();
    return left + logicalX * scale;
}

/**
 * Converte una coordinata Y logica in coordinata Y schermo.
 * @param {number} logicalY - Coordinata logica (0..GAME_H)
 * @returns {number} Coordinata pixel sullo schermo
 */
export function hy(logicalY) {
    const { scale, top } = calcolaLetterbox();
    return top + logicalY * scale;
}

/**
 * Converte una dimensione logica (font size, padding, ecc.)
 * nella dimensione schermo corrispondente.
 * @param {number} logicalSize - Dimensione in coordinate logiche
 * @returns {number} Dimensione in pixel arrotondata
 */
export function hs(logicalSize) {
    const { scale } = calcolaLetterbox();
    return Math.round(logicalSize * scale);
}

// ============================================================
// CAMBIO ARMA — funzione centrale
//
// Gestita qui (e non in game.js o touch.js) per evitare
// dipendenze circolari: sia la tastiera (game.js) che i bottoni
// touch (touch.js) la importano da questo file neutro.
// ============================================================

/** Callback da invocare dopo ogni cambio arma (iniettata da main.js) */
let weaponChangeCallback = null;

/**
 * Registra la funzione da chiamare ogni volta che l'arma cambia.
 * Usata da main.js per aggiornare tutti gli elementi HUD.
 * @param {function} callback
 */
export function setWeaponChangeCallback(callback) {
    weaponChangeCallback = callback;
}

/**
 * Cambia l'arma corrente, la invia al server e aggiorna l'HUD.
 * Se è in corso una ricarica, la annulla visivamente
 * (il server invierà "reloadCancelled" per confermare).
 *
 * @param {string} newWeapon - "gun" | "pistol" | "fists"
 */
export function cambiaArma(newWeapon) {
    if (!state.socket) return;
    if (state.weapon === newWeapon) return; // già selezionata

    // Annulla visivamente la ricarica in corso
    if (state.isReloading) {
        state.isReloading     = false;
        state.reloadStartTime = 0;
        state.reloadDuration  = 0;
    }

    state.weapon = newWeapon;
    state.socket.emit("setWeapon", newWeapon);

    // Aggiorna tutti gli widget HUD tramite callback
    if (weaponChangeCallback) weaponChangeCallback();
}