import kaboom from "./lib/kaboom.mjs";

// ========================
// RICARICA AUTOMATICA — subito, prima di tutto
// ========================
if (!sessionStorage.getItem("reloaded")) {
    sessionStorage.setItem("reloaded", "1");
    location.reload();
}

// ========================
// INIT KABOOM — deve essere il primo
// ========================
kaboom({
    width:  window.innerWidth,
    height: window.innerHeight,
    clearColor: [0, 0, 0, 1],
    preventPauseOnBlur: true,
});

document.body.style.cursor    = "crosshair";
document.body.style.background = "black";
const canvas = document.querySelector("canvas");
canvas.style.cursor = "crosshair";

// ========================
// OVERLAY CANVAS
// ========================
const overlayCanvas = document.createElement("canvas");
overlayCanvas.style.cssText = "position:fixed;top:0;left:0;pointer-events:none;z-index:10;";
overlayCanvas.width  = window.innerWidth;
overlayCanvas.height = window.innerHeight;
document.body.appendChild(overlayCanvas);
const octx = overlayCanvas.getContext("2d");
function drawOverlay() { requestAnimationFrame(drawOverlay); octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); }
drawOverlay();

// ========================
// IMPORT MODULI
// IMPORTANTE: gli import statici vengono "hoisted" ma le funzioni Kaboom
// (add, pos, rect, camPos...) sono già globali prima che i moduli le usino
// perché kaboom() sopra le registra sul globalThis in modo sincrono.
// ========================
import { state, calcolaZoom, isMobile, setWeaponChangeCallback } from "./state.js";
import { aggiornaBlackBars, aggiornaHUDArma, aggiornaHUDStats, aggiornaHUDLobby, aggiornaHUDPlayers, aggiornaHUDAmmo, mostraKillFeed } from "./hud.js";
import { mostraSchermataLobby, registraEventiLobby, initLobby } from "./lobby.js";
import { mostraMenu, initMenu } from "./menu.js";
import { creaGunDrawObj } from "./weapons.js";
import { creaTouchUI, rimuoviTouchUI, registraTouchEvents, aggiornaReloadBtn, aggiornaWeaponBtns } from "./touch.js";
import { registraInputTastiera, registraEventiSparo, registraOnUpdate, aggiornaStato, initGame } from "./game.js";
import { playKillSound } from "./audio.js";

// ========================
// ZOOM
// ========================
state.CAM_ZOOM = calcolaZoom();
window.addEventListener("resize", () => { state.CAM_ZOOM = calcolaZoom(); });

// ========================
// UI LAYER — gestione centralizzata
// ========================
const uiLayer = [];
let htmlContainer = null;

function nascondiElementiHTML() {
    if (htmlContainer) { htmlContainer.remove(); htmlContainer = null; }
}
function setHtmlContainer(el) { htmlContainer = el; }
function distruggiUI() {
    nascondiElementiHTML();
    for (const o of uiLayer) destroy(o);
    uiLayer.length = 0;
    rimuoviTouchUI();
}

// ========================
// SOCKET PRINCIPALE
// ========================
state.mainSocket = io();

// ========================
// CONNESSIONE AL NAMESPACE DELLA LOBBY
// ========================
function connettiALobby(lobbyId, lobbyName, token) {
    localStorage.setItem("lobbyId",   lobbyId);
    localStorage.setItem("lobbyName", lobbyName || "");
    if (token) localStorage.setItem("lobbyToken", token);

    state.socket = io("/lobby/" + lobbyId);

    state.socket.on("connect", () => {
        const savedToken = localStorage.getItem("lobbyToken");
        state.socket.emit("join", { token: savedToken || null });
    });

    state.socket.on("lobbyFull", () => {
        state.socket.disconnect();
        localStorage.removeItem("lobbyId");
        localStorage.removeItem("lobbyName");
        localStorage.removeItem("lobbyToken");
        mostraSchermataLobby("Lobby full.");
    });

    state.socket.on("init", (data) => {
        const { id, token, map: mappa, ostacoli, lobbyId: lid, lobbyName: lname, nickname, playerCount, maxPlayers } = data;
        state.myId        = id;
        state.myToken     = token;
        state.myLobbyId   = lid;
        state.myLobbyName = lname;
        state.myNickname  = nickname;
        state.mapSize     = mappa;
        state.inLobbyScreen = false;

        localStorage.setItem("lobbyToken", token);
        localStorage.setItem("lobbyId",    lid);
        localStorage.setItem("lobbyName",  lname);

        // Costruisci mappa
        const spiaggia = 80;
        add([pos(-5000, -5000), rect(mappa.width + 10000, mappa.height + 10000), color(rgb(40, 140, 210)), z(-12)]);
        add([pos(-spiaggia, -spiaggia), rect(mappa.width + spiaggia * 2, mappa.height + spiaggia * 2), color(rgb(230, 200, 100)), z(-11)]);
        add([pos(0, 0), rect(mappa.width, mappa.height), color(rgb(60, 120, 40)), z(-10)]);
        for (const o of ostacoli) {
            if (o.type === "roccia") add([pos(o.x, o.y), anchor("center"), circle(o.r), color(rgb(110, 110, 110)), outline(3, rgb(60, 60, 60)), z(2)]);
        }
        for (const o of ostacoli) {
            if (o.type === "albero") {
                add([pos(o.x, o.y), anchor("center"), circle(o.r),           color(rgb(20, 75, 15)), outline(4, rgb(10, 45, 8)), z(4)]);
                add([pos(o.x, o.y), anchor("center"), circle(o.rCollisione), color(rgb(80, 50, 20)), z(4)]);
            }
        }
        for (const o of ostacoli) {
            if (o.type === "cespuglio") add([pos(o.x, o.y), anchor("center"), circle(o.r), color(rgb(100, 200, 40)), outline(2, rgb(60, 140, 20)), z(2)]);
        }

        aggiornaHUDStats(); aggiornaHUDArma(); aggiornaHUDLobby();
        aggiornaHUDPlayers(playerCount, maxPlayers); aggiornaHUDAmmo();
        aggiornaBlackBars();
        creaGunDrawObj();
        onResize(() => { aggiornaHUDArma(); aggiornaHUDStats(); aggiornaHUDLobby(); });
        mostraMenu();
    });

    state.socket.on("playerLeft", ({ id, nickname: n }) => {
        if (state.players[id]) {
            if (state.players[id].labelObj) destroy(state.players[id].labelObj);
            if (state.players[id].hpBar)    destroy(state.players[id].hpBar);
            if (state.players[id].sprite)   destroy(state.players[id].sprite);
            delete state.players[id];
        }
        mostraKillFeed(`${n} left the game`);
    });

    state.socket.on("killConfirm", ({ victim }) => {
        state.myKills++;
        aggiornaHUDStats();
        mostraKillFeed(`You eliminated ${victim}!`);
        playKillSound();
    });

    state.socket.on("reloadStart", ({ weapon: w, duration }) => {
        state.isReloading     = true;
        state.reloadStartTime = Date.now();
        state.reloadDuration  = duration;
        aggiornaHUDAmmo(); aggiornaReloadBtn();
    });

    state.socket.on("reloadDone", ({ weapon: w }) => {
        state.isReloading     = false;
        state.reloadStartTime = 0;
        state.reloadDuration  = 0;
        aggiornaHUDAmmo(); aggiornaReloadBtn();
    });

    // Ricarica annullata dal server perché il player ha cambiato arma
    state.socket.on("reloadCancelled", ({ weapon: w }) => {
        state.isReloading     = false;
        state.reloadStartTime = 0;
        state.reloadDuration  = 0;
        aggiornaHUDAmmo(); aggiornaReloadBtn();
    });

    state.socket.on("state", (serverState) => aggiornaStato(serverState, canvas));
}

// ========================
// INIT MODULI (inietta dipendenze circolari via funzione)
// ========================
initMenu(uiLayer, nascondiElementiHTML, distruggiUI, () => htmlContainer, setHtmlContainer);
initLobby(uiLayer, distruggiUI, nascondiElementiHTML, setHtmlContainer, connettiALobby);
initGame(distruggiUI, mostraMenu);

// Callback per cambiaArma in state.js: aggiorna tutti gli HUD dopo un cambio arma
setWeaponChangeCallback(() => {
    aggiornaHUDArma();
    aggiornaWeaponBtns();
    aggiornaHUDAmmo();
    aggiornaReloadBtn();
});

// ========================
// REGISTRA TUTTI GLI EVENTI
// ========================
registraEventiLobby();
registraInputTastiera();
registraTouchEvents();
registraEventiSparo(canvas);
registraOnUpdate();
window.addEventListener("resize", aggiornaBlackBars);

// ========================
// REJOIN AUTOMATICO AL CARICAMENTO
// ========================
(function tentaRejoin() {
    const savedId    = localStorage.getItem("lobbyId");
    const savedName  = localStorage.getItem("lobbyName");
    const savedToken = localStorage.getItem("lobbyToken");
    if (savedId && savedToken) {
        state.mainSocket.once("lobbyList", (list) => {
            const found = list.find(l => l.id === savedId);
            if (found) {
                connettiALobby(savedId, savedName || found.name, savedToken);
            } else {
                localStorage.removeItem("lobbyId");
                localStorage.removeItem("lobbyName");
                localStorage.removeItem("lobbyToken");
                mostraSchermataLobby();
            }
        });
    } else {
        setTimeout(() => { if (state.inLobbyScreen) mostraSchermataLobby(); }, 150);
    }
})();