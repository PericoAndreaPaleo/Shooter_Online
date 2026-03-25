// ========================
// STATO GLOBALE CONDIVISO
// ========================
// Tutti i moduli importano da qui invece di usare variabili globali sparse.

export const GAME_W = 1600;
export const GAME_H = 900;

export const state = {
    socket: null,           // socket namespace della lobby corrente
    mainSocket: null,       // socket principale (selezione lobby)
    myId: null,
    myLobbyId: null,
    myLobbyName: null,
    myToken: null,
    myNickname: "",
    mapSize: { width: 5000, height: 5000 },
    ostacoli: [],
    cameraInizializzata: false,
    inMenu: true,
    inLobbyScreen: true,
    CAM_ZOOM: 1,

    players: {},
    bulletSprites: {},
    input: { left: false, right: false, up: false, down: false },
    prevInput: "",
    weapon: "gun",

    // HUD
    myKills: 0,
    myDeaths: 0,
    myAmmo: { gun: 30, pistol: 15 },
    isReloading: false,
    reloadStartTime: 0,
    reloadDuration: 0,

    // Touch
    aimJoyAngle: 0,
    aimJoyActive: false,
    aimJoyDir: { x: 0, y: 0 },
};

export const isMobile = () => navigator.maxTouchPoints > 0 || "ontouchstart" in window;

export function calcolaLetterbox() {
    const scaleX = window.innerWidth  / GAME_W;
    const scaleY = window.innerHeight / GAME_H;
    const scale  = Math.min(scaleX, scaleY);
    const left   = Math.round((window.innerWidth  - GAME_W * scale) / 2);
    const top    = Math.round((window.innerHeight - GAME_H * scale) / 2);
    return { scale, left, top };
}

export function calcolaZoom() {
    const { scale } = calcolaLetterbox();
    return scale;
}

// Helper coordinate HUD (usati da hud.js e altri)
export function hx(x) { const { scale, left } = calcolaLetterbox(); return left + x * scale; }
export function hy(y) { const { scale, top  } = calcolaLetterbox(); return top  + y * scale; }
export function hs(s) { const { scale }       = calcolaLetterbox(); return Math.round(s * scale); }

// ========================
// CAMBIO ARMA — funzione centrale usata da tastiera e touch
// Sta in state.js per evitare dipendenze circolari tra game.js e touch.js
// ========================
// Le callback HUD vengono iniettate da main.js dopo l'init
let _onWeaponChange = null;
export function setWeaponChangeCallback(fn) { _onWeaponChange = fn; }

export function cambiaArma(nuovaArma) {
    if (!state.socket) return;
    if (state.weapon === nuovaArma) return;
    // Annulla visivamente la ricarica in corso (il server manderà reloadCancelled)
    if (state.isReloading) {
        state.isReloading     = false;
        state.reloadStartTime = 0;
        state.reloadDuration  = 0;
    }
    state.weapon = nuovaArma;
    state.socket.emit("setWeapon", nuovaArma);
    // Notifica tutti i moduli HUD tramite callback
    if (_onWeaponChange) _onWeaponChange();
}