// ============================================================
// main.js — Entry point del client
//
// Responsabilità:
//   1. Inizializzazione di Kaboom (motore grafico)
//   2. Creazione dell'overlay canvas trasparente
//   3. Importazione e init di tutti i moduli
//   4. Gestione centralizzata del layer UI (Kaboom + HTML)
//   5. Connessione al server Socket.IO
//   6. Connessione al namespace di una lobby specifica
//   7. Tentativo di rejoin automatico all'avvio (se c'è una sessione salvata)
//
// NOTA: il ricaricamento automatico in cima serve per garantire
// che Kaboom parta sempre da un contesto fresco (evita bug di
// re-inizializzazione in alcuni browser).
// ============================================================

import kaboom from "./lib/kaboom.mjs";

// ============================================================
// AUTO-RELOAD AL PRIMO CARICAMENTO
// Kaboom può avere problemi su hot-reload; questo assicura
// un ambiente pulito alla prima visita della pagina.
// ============================================================
if (!sessionStorage.getItem("reloaded")) {
    sessionStorage.setItem("reloaded", "1");
    location.reload();
}

// ============================================================
// INIZIALIZZAZIONE KABOOM
// Deve avvenire PRIMA di qualsiasi import che usi funzioni Kaboom
// (add, pos, rect, camPos…), poiché kaboom() le registra su
// globalThis in modo sincrono.
// ============================================================
kaboom({
    width:               window.innerWidth,
    height:              window.innerHeight,
    clearColor:          [0, 0, 0, 1],
    preventPauseOnBlur:  true, // il gioco non si ferma quando perdi il focus
});

// Cursore a mirino sul canvas di gioco
document.body.style.cursor     = "crosshair";
document.body.style.background = "black";
const gameCanvas = document.querySelector("canvas");
gameCanvas.style.cursor = "crosshair";

// ============================================================
// OVERLAY CANVAS (trasparente, pointer-events: none)
// Un secondo canvas sopra Kaboom usato per draw custom,
// attualmente usato solo per il loop di redraw vuoto.
// ============================================================
const overlayCanvas = document.createElement("canvas");
overlayCanvas.style.cssText = "position: fixed; top: 0; left: 0; pointer-events: none; z-index: 10;";
overlayCanvas.width  = window.innerWidth;
overlayCanvas.height = window.innerHeight;
document.body.appendChild(overlayCanvas);

const overlayCtx = overlayCanvas.getContext("2d");
/** Loop vuoto che pulisce l'overlay ogni frame */
function clearOverlayLoop() {
    requestAnimationFrame(clearOverlayLoop);
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}
clearOverlayLoop();

// ============================================================
// IMPORT MODULI
// Gli import statici sono "hoisted" ma le funzioni Kaboom sono già
// disponibili come globali perché kaboom() le ha registrate sopra.
// ============================================================
import { state, calcolaZoom, isMobile, setWeaponChangeCallback } from "./state.js";
import {
    aggiornaBlackBars, aggiornaHUDArma, aggiornaHUDStats,
    aggiornaHUDLobby, aggiornaHUDPlayers, aggiornaHUDAmmo,
    mostraKillFeed, creaMinimappa,
} from "./hud.js";
import { mostraSchermataLobby, registraEventiLobby, initLobby } from "./lobby.js";
import { mostraMenu, initMenu } from "./menu.js";
import { creaGunDrawObj } from "./weapons.js";
import {
    creaTouchUI, rimuoviTouchUI, registraTouchEvents,
    aggiornaReloadBtn, aggiornaWeaponBtns,
} from "./touch.js";
import {
    registraInputTastiera, registraEventiSparo,
    registraOnUpdate, aggiornaStato, initGame,
} from "./game.js";
import { playKillSound } from "./audio.js";

// ── AGGIUNTA: import modulo autenticazione ───────────────────
// checkSession  → verifica se l'utente ha già un cookie valido
// initAuth      → registra il callback da chiamare dopo il login
// mostraSchermataAuth → mostra la schermata login/registrazione
import { checkSession, initAuth, mostraSchermataAuth } from "./auth.js";
// ─────────────────────────────────────────────────────────────

// ============================================================
// ZOOM CAMERA
// ============================================================

/** Calcola e imposta lo zoom iniziale della camera */
state.CAM_ZOOM = calcolaZoom();

/** Aggiorna lo zoom ad ogni resize della finestra */
window.addEventListener("resize", () => { state.CAM_ZOOM = calcolaZoom(); });

// ============================================================
// UI LAYER — GESTIONE CENTRALIZZATA
// Tutti gli oggetti Kaboom dell'UI (menu, lobby, hud) vengono
// tracciati nell'array uiLayer per poter essere distrutti in
// blocco. Gli elementi HTML vengono tracciati con htmlContainer.
// ============================================================

/** Array degli oggetti Kaboom del layer UI corrente */
const uiLayer = [];
/** Container HTML attivo (div sovrapposto al canvas per i controlli HTML) */
let activeHTMLContainer = null;

/** Rimuove il container HTML attivo dal DOM */
function removeActiveHTMLContainer() {
    if (activeHTMLContainer) {
        activeHTMLContainer.remove();
        activeHTMLContainer = null;
    }
}

/**
 * Registra un nuovo container HTML come quello attivo.
 * Chiamata dai moduli menu/lobby dopo aver creato il loro div.
 * @param {HTMLElement} element
 */
function setActiveHTMLContainer(element) {
    activeHTMLContainer = element;
}

/**
 * Distrugge tutti gli elementi del layer UI corrente:
 * oggetti Kaboom, container HTML e joystick touch.
 */
function destroyAllUI() {
    removeActiveHTMLContainer();
    for (const kaboomObject of uiLayer) destroy(kaboomObject);
    uiLayer.length = 0;
    rimuoviTouchUI();
}

// ============================================================
// SOCKET PRINCIPALE (namespace "/")
// ============================================================

/** Connessione al socket principale per la gestione delle lobby */
state.mainSocket = io();

// ============================================================
// CONNESSIONE AL NAMESPACE DI UNA LOBBY
// ============================================================

/**
 * Connette il client al namespace Socket.IO della lobby scelta
 * e registra tutti gli handler degli eventi di gameplay.
 *
 * @param {string}      lobbyId   - ID della lobby (8 char hex)
 * @param {string}      lobbyName - Nome visualizzato della lobby
 * @param {string|null} savedToken - Token di rejoin (se disponibile)
 */
function connectToLobbyNamespace(lobbyId, lobbyName, savedToken) {
    // Salva in localStorage per il rejoin automatico
    localStorage.setItem("lobbyId",   lobbyId);
    localStorage.setItem("lobbyName", lobbyName || "");
    if (savedToken) localStorage.setItem("lobbyToken", savedToken);

    // Connessione al namespace dedicato alla lobby
    state.socket = io("/lobby/" + lobbyId);

    // ── Connessione stabilita ──────────────────────────────────────
    state.socket.on("connect", () => {
        // Usa il token salvato per il rejoin (se disponibile)
        const rejoinToken = localStorage.getItem("lobbyToken");
        state.socket.emit("join", { token: rejoinToken || null });
    });

    // ── Lobby piena (risposta al join) ─────────────────────────────
    state.socket.on("lobbyFull", () => {
        state.socket.disconnect();
        localStorage.removeItem("lobbyId");
        localStorage.removeItem("lobbyName");
        localStorage.removeItem("lobbyToken");
        mostraSchermataLobby("Lobby full.");
    });

    // ── Init: ricevuto dopo un join accettato ──────────────────────
    // Il server invia tutti i dati necessari per inizializzare la partita.
    state.socket.on("init", (initData) => {
        const {
            id, token, map: mapSize, ostacoli,
            lobbyId: receivedLobbyId, lobbyName: receivedLobbyName,
            nickname, playerCount, maxPlayers,
        } = initData;

        // Aggiorna lo stato locale
        state.myId        = id;
        state.myToken     = token;
        state.myLobbyId   = receivedLobbyId;
        state.myLobbyName = receivedLobbyName;
        state.myNickname  = nickname;
        state.mapSize     = mapSize;
        state.inLobbyScreen = false;
        state.ostacoli    = ostacoli;

        // Aggiorna i dati di sessione persistenti
        localStorage.setItem("lobbyToken", token);
        localStorage.setItem("lobbyId",    receivedLobbyId);
        localStorage.setItem("lobbyName",  receivedLobbyName);

        // ── Costruzione della mappa ──────────────────────────────────
        const beachBorderSize = 80; // fascia sabbia attorno alla mappa

        // Oceano/sfondo (esteso oltre i bordi della mappa)
        add([pos(-5000, -5000), rect(mapSize.width + 10000, mapSize.height + 10000), color(rgb(40, 140, 210)), z(-12)]);

        // Spiaggia (fascia sabbiosa)
        add([pos(-beachBorderSize, -beachBorderSize), rect(mapSize.width + beachBorderSize * 2, mapSize.height + beachBorderSize * 2), color(rgb(230, 200, 100)), z(-11)]);

        // Terreno di gioco (verde)
        add([pos(0, 0), rect(mapSize.width, mapSize.height), color(rgb(60, 120, 40)), z(-10)]);

        // Rocce (solide, disegnate prima degli alberi)
        for (const obstacle of ostacoli) {
            if (obstacle.type === "roccia") {
                add([pos(obstacle.x, obstacle.y), anchor("center"), circle(obstacle.r), color(rgb(110, 110, 110)), outline(3, rgb(60, 60, 60)), z(2)]);
            }
        }

        // Alberi: fogliame (grande) + tronco (piccolo)
        for (const obstacle of ostacoli) {
            if (obstacle.type === "albero") {
                add([pos(obstacle.x, obstacle.y), anchor("center"), circle(obstacle.r),           color(rgb(20, 75, 15)),  outline(4, rgb(10, 45, 8)), z(4)]); // foglie
                add([pos(obstacle.x, obstacle.y), anchor("center"), circle(obstacle.rCollisione), color(rgb(80, 50, 20)),                               z(4)]); // tronco
            }
        }

        // Cespugli (puramente decorativi, senza collisione)
        for (const obstacle of ostacoli) {
            if (obstacle.type === "cespuglio") {
                add([pos(obstacle.x, obstacle.y), anchor("center"), circle(obstacle.r), color(rgb(100, 200, 40)), outline(2, rgb(60, 140, 20)), z(2)]);
            }
        }

        // ── Inizializzazione HUD ──────────────────────────────────────
        aggiornaHUDStats();
        aggiornaHUDArma();
        aggiornaHUDLobby();
        aggiornaHUDPlayers(playerCount, maxPlayers);
        aggiornaHUDAmmo();
        aggiornaBlackBars();
        creaGunDrawObj();
        creaMinimappa();

        // Reagisce al resize ricreando gli HUD responsivi
        onResize(() => {
            aggiornaHUDArma();
            aggiornaHUDStats();
            aggiornaHUDLobby();
        });

        // ── Mostra il menu di spawn ───────────────────────────────────
        mostraMenu();
    });

    // ── Un giocatore ha lasciato la lobby ──────────────────────────
    state.socket.on("playerLeft", ({ id, nickname: playerNickname }) => {
        // Rimuovi gli sprite dal canvas se il giocatore era visibile
        if (state.players[id]) {
            if (state.players[id].labelObj) destroy(state.players[id].labelObj);
            if (state.players[id].hpBar)    destroy(state.players[id].hpBar);
            if (state.players[id].sprite)   destroy(state.players[id].sprite);
            delete state.players[id];
        }
        mostraKillFeed(`${playerNickname} left the game`);
    });

    // ── Conferma di kill: ho eliminato un avversario ───────────────
    state.socket.on("killConfirm", ({ victim }) => {
        state.myKills++;
        aggiornaHUDStats();
        mostraKillFeed(`You eliminated ${victim}!`);
        playKillSound();
    });

    // ── Inizio ricarica (dal server) ───────────────────────────────
    state.socket.on("reloadStart", ({ weapon: _w, duration }) => {
        state.isReloading     = true;
        state.reloadStartTime = Date.now();
        state.reloadDuration  = duration;
        aggiornaHUDAmmo();
        aggiornaReloadBtn();
    });

    // ── Fine ricarica ──────────────────────────────────────────────
    state.socket.on("reloadDone", ({ weapon: _w }) => {
        state.isReloading     = false;
        state.reloadStartTime = 0;
        state.reloadDuration  = 0;
        aggiornaHUDAmmo();
        aggiornaReloadBtn();
    });

    // ── Ricarica annullata (es. cambio arma durante ricarica) ──────
    state.socket.on("reloadCancelled", ({ weapon: _w }) => {
        state.isReloading     = false;
        state.reloadStartTime = 0;
        state.reloadDuration  = 0;
        aggiornaHUDAmmo();
        aggiornaReloadBtn();
    });

    // ── Aggiornamento stato di gioco (ogni ~16ms) ──────────────────
    state.socket.on("state", (serverSnapshot) => {
        aggiornaStato(serverSnapshot, gameCanvas);
    });
}

// ============================================================
// INIZIALIZZAZIONE MODULI (injection delle dipendenze)
// I moduli non possono importarsi circolarmente, quindi
// ricevono le dipendenze necessarie tramite funzioni di init.
// ============================================================

initMenu(uiLayer, removeActiveHTMLContainer, destroyAllUI, setActiveHTMLContainer);
initLobby(uiLayer, destroyAllUI, removeActiveHTMLContainer, setActiveHTMLContainer, connectToLobbyNamespace);
initGame(destroyAllUI, mostraMenu);

// Callback per cambiaArma: aggiorna tutti gli elementi HUD dopo un cambio arma
setWeaponChangeCallback(() => {
    aggiornaHUDArma();
    aggiornaWeaponBtns();
    aggiornaHUDAmmo();
    aggiornaReloadBtn();
});

// ============================================================
// REGISTRAZIONE EVENTI
// ============================================================

registraEventiLobby();
registraInputTastiera();
registraTouchEvents();
registraEventiSparo(gameCanvas);
registraOnUpdate();

/** Aggiorna le barre nere ad ogni resize della finestra */
window.addEventListener("resize", aggiornaBlackBars);

// ============================================================
// AGGIUNTA: AVVIO CON CONTROLLO AUTENTICAZIONE
//
// Il flusso all'avvio è ora:
//   1. checkSession() → chiede al server se c'è un cookie valido
//   2a. Se loggato → salva i dati utente in state e avvia il gioco
//   2b. Se non loggato → mostra la schermata login/registrazione
//   3. Dopo login/registrazione → richiama avvioGioco()
//
// avvioGioco() contiene la logica di rejoin che prima stava
// direttamente nel blocco IIFE in fondo al file originale.
// ============================================================

/**
 * Avvia il gioco dopo l'autenticazione (o come ospite).
 * Contiene la logica di rejoin automatico originale.
 *
 * @param {Object|null} userData - Dati utente dal login, o null se ospite
 */
function avvioGioco(userData) {
    // ── AGGIUNTA: salva i dati utente nello state se loggato ─────
    // userData è null per gli ospiti, oppure { username, livello, xp, ... }
    if (userData) {
        state.accountUsername = userData.username;
        state.accountLivello  = userData.livello  || 1;
        state.accountXp       = userData.xp       || 0;
    }
    // ─────────────────────────────────────────────────────────────

    // ── Rejoin automatico (logica originale invariata) ────────────
    const savedLobbyId   = localStorage.getItem("lobbyId");
    const savedLobbyName = localStorage.getItem("lobbyName");
    const savedToken     = localStorage.getItem("lobbyToken");

    if (savedLobbyId && savedToken) {
        // Aspetta che il server invii la lista lobby prima di verificare
        // se la lobby esiste ancora
        state.mainSocket.once("lobbyList", (lobbyList) => {
            const lobbyStillExists = lobbyList.find(l => l.id === savedLobbyId);

            if (lobbyStillExists) {
                // La lobby è ancora attiva → connettiti con il token di rejoin
                connectToLobbyNamespace(savedLobbyId, savedLobbyName || lobbyStillExists.name, savedToken);
            } else {
                // La lobby non esiste più → pulisci i dati salvati e mostra la lista
                localStorage.removeItem("lobbyId");
                localStorage.removeItem("lobbyName");
                localStorage.removeItem("lobbyToken");
                mostraSchermataLobby();
            }
        });
    } else {
        // Nessun dato di sessione → mostra la schermata lobby dopo 150ms
        // (piccolo delay per attendere la connessione socket iniziale)
        setTimeout(() => {
            if (state.inLobbyScreen) mostraSchermataLobby();
        }, 150);
    }
}

// ── AGGIUNTA: punto di ingresso con autenticazione ───────────
// Sostituisce il vecchio IIFE tryAutoRejoin() in fondo al file.
// Prima controlla la sessione, poi mostra auth o avvia direttamente.
(async function avvio() {
    // Registra il callback che auth.js chiamerà dopo login/registrazione
    initAuth(avvioGioco);

    // Controlla se c'è già una sessione valida (cookie httpOnly)
    const userData = await checkSession();

    if (userData) {
        // Sessione valida → avvia direttamente il gioco
        avvioGioco(userData);
    } else {
        // Nessuna sessione → mostra login/registrazione
        mostraSchermataAuth();
    }
})();
// ─────────────────────────────────────────────────────────────