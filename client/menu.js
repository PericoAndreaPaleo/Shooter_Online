// ============================================================
// menu.js — Menu di spawn in-game
//
// Questo modulo gestisce la schermata che appare tra una vita
// e l'altra (o all'ingresso in una lobby), con:
//   • Titolo del gioco
//   • Nickname del giocatore
//   • Nome della lobby
//   • Eventuale messaggio (es. "You were eliminated!")
//   • Pulsante PLAY per fare spawn
//   • Pulsante "Change Lobby" per tornare alla selezione lobby
// ============================================================

import { state, GAME_W, GAME_H, hx, hy, hs, calcolaLetterbox } from "./state.js";

// ── Dipendenze iniettate da main.js ──────────────────────────────
let uiElementsArray      = null;   // array condiviso con main.js per cleanup UI
let hideHTMLOverlay      = null;   // rimuove il container HTML corrente
let destroyAllUI         = null;   // distrugge tutti gli oggetti Kaboom UI
let setCurrentContainer  = null;   // registra il container HTML attivo in main.js

/**
 * Inizializza il modulo menu con le dipendenze di main.js.
 * Deve essere chiamata una sola volta prima di mostraMenu().
 *
 * @param {Array}    uiLayer            - Array degli oggetti Kaboom UI
 * @param {function} nascondiElementiHTML - Rimuove il container HTML corrente
 * @param {function} distruggiUI        - Distrugge tutto il layer UI
 * @param {function} setHtmlContainer   - Registra il container HTML attivo
 */
export function initMenu(uiLayer, nascondiElementiHTML, distruggiUI, setHtmlContainer) {
    uiElementsArray     = uiLayer;
    hideHTMLOverlay     = nascondiElementiHTML;
    destroyAllUI        = distruggiUI;
    setCurrentContainer = setHtmlContainer;
}

// ============================================================
// SCHERMATA MENU DI SPAWN
// ============================================================

/**
 * Mostra il menu di spawn. Distrugge prima qualsiasi UI precedente.
 *
 * Il menu è ibrido: usa oggetti Kaboom per lo sfondo e i testi
 * grafici, e HTML per i pulsanti interattivi (più facili da
 * stilare e accessibili da tastiera/touch).
 *
 * @param {string} [subtitleMessage] - Messaggio opzionale in rosso
 *        (es. "You were eliminated!" mostrato dopo una morte)
 */
export function mostraMenu(subtitleMessage) {
    destroyAllUI();
    state.inMenu        = true;
    state.inLobbyScreen = false;

    // ── Testi Kaboom ───────────────────────────────────────────────
    const centerX = hx(GAME_W / 2);
    const centerY = hy(GAME_H / 2);

    // Overlay scuro semitrasparente
    uiElementsArray.push(add([
        rect(width(), height()), pos(0, 0),
        color(rgb(5, 10, 5)), opacity(0.88),
        fixed(), z(200),
    ]));

    // Titolo principale
    uiElementsArray.push(add([
        text("SHOOTER ONLINE", { size: hs(52) }),
        pos(centerX, hy(GAME_H / 2 - 140)),
        anchor("center"),
        color(rgb(0, 255, 100)),
        fixed(), z(201),
    ]));

    // Nickname del giocatore (in azzurro)
    if (state.myNickname) {
        uiElementsArray.push(add([
            text(state.myNickname, { size: hs(22) }),
            pos(centerX, hy(GAME_H / 2 - 70)),
            anchor("center"),
            color(rgb(0, 200, 255)),
            fixed(), z(201),
        ]));
    }

    // Nome della lobby
    if (state.myLobbyName) {
        uiElementsArray.push(add([
            text(`Lobby: ${state.myLobbyName}`, { size: hs(16) }),
            pos(centerX, hy(GAME_H / 2 - 40)),
            anchor("center"),
            color(rgb(180, 180, 180)),
            fixed(), z(201),
        ]));
    }

    // Messaggio opzionale (eliminazione, ecc.) in rosso
    if (subtitleMessage) {
        uiElementsArray.push(add([
            text(subtitleMessage, { size: hs(26) }),
            pos(centerX, hy(GAME_H / 2 - 8)),
            anchor("center"),
            color(rgb(220, 80, 80)),
            fixed(), z(201),
        ]));
    }

    // ── Pulsanti HTML ──────────────────────────────────────────────
    const scaleUI     = calcolaLetterbox().scale;
    const buttonWidth = Math.round(220 * scaleUI);
    const buttonHeight      = Math.round(60 * scaleUI);
    const secondaryBtnHeight = Math.round(40 * scaleUI);
    const buttonGap   = Math.round(12 * scaleUI);
    const topOffset   = Math.round(60 * scaleUI); // distanza dal centro verticale

    const container = document.createElement("div");
    container.style.cssText = `
        position: fixed;
        left:      ${centerX}px;
        top:       ${hy(GAME_H / 2) + topOffset}px;
        transform: translate(-50%, 0);
        display:   flex;
        flex-direction: column;
        align-items: center;
        gap:       ${buttonGap}px;
        z-index:   9999;
    `;

    // ── Pulsante PLAY ──────────────────────────────────────────────
    const playButton = document.createElement("button");
    playButton.textContent = "PLAY";
    playButton.style.cssText = `
        width:       ${buttonWidth}px;
        height:      ${buttonHeight}px;
        background:  rgb(0, 180, 70);
        color:       white;
        font-size:   ${Math.round(30 * scaleUI)}px;
        font-weight: bold;
        border:      none;
        border-radius: 6px;
        cursor:      pointer;
        font-family: monospace;
        letter-spacing: 2px;
    `;
    playButton.addEventListener("click", () => {
        hideHTMLOverlay();
        destroyAllUI();
        state.socket.emit("spawn");
    });

    // ── Pulsante Change Lobby ──────────────────────────────────────
    const changeLobbyButton = document.createElement("button");
    changeLobbyButton.textContent = "← Change Lobby";
    changeLobbyButton.style.cssText = `
        width:       ${buttonWidth}px;
        height:      ${secondaryBtnHeight}px;
        background:  rgba(255, 255, 255, 0.1);
        color:       rgba(255, 255, 255, 0.7);
        font-size:   ${Math.round(15 * scaleUI)}px;
        border:      1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        cursor:      pointer;
        font-family: monospace;
    `;
    changeLobbyButton.addEventListener("click", () => {
        // Rimuovi i dati di sessione salvati e ricarica la pagina
        localStorage.removeItem("lobbyId");
        localStorage.removeItem("lobbyName");
        localStorage.removeItem("lobbyToken");
        if (state.socket) state.socket.disconnect();
        location.reload();
    });

    container.appendChild(playButton);
    container.appendChild(changeLobbyButton);
    document.body.appendChild(container);
    setCurrentContainer(container);

    // Focus automatico sul pulsante PLAY (accessibilità tastiera)
    setTimeout(() => playButton.focus(), 50);
}