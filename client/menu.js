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

    const centerX = hx(GAME_W / 2);
    const { scale: scaleUI } = calcolaLetterbox();

    // ── Overlay scuro ──────────────────────────────────────────────
    uiElementsArray.push(add([
        rect(width(), height()), pos(0, 0),
        color(rgb(5, 10, 5)), opacity(0.88),
        fixed(), z(200),
    ]));

    // ── Titolo ─────────────────────────────────────────────────────
    uiElementsArray.push(add([
        text("SHOOTER ONLINE", { size: hs(52) }),
        pos(centerX, hy(GAME_H / 2 - 140)),
        anchor("center"),
        color(rgb(0, 255, 100)),
        fixed(), z(201),
    ]));

    // ── Nome giocatore (account o ospite) ──────────────────────────
    const displayName = state.accountUsername || state.myNickname || "Ospite";
    uiElementsArray.push(add([
        text(displayName, { size: hs(22) }),
        pos(centerX, hy(GAME_H / 2 - 70)),
        anchor("center"),
        color(state.accountUsername ? rgb(0, 200, 255) : rgb(180, 180, 180)),
        fixed(), z(201),
    ]));

    // ── Nome lobby ─────────────────────────────────────────────────
    if (state.myLobbyName) {
        uiElementsArray.push(add([
            text(`Lobby: ${state.myLobbyName}`, { size: hs(16) }),
            pos(centerX, hy(GAME_H / 2 - 40)),
            anchor("center"),
            color(rgb(180, 180, 180)),
            fixed(), z(201),
        ]));
    }

    // ── Messaggio eliminazione ──────────────────────────────────────
    if (subtitleMessage) {
        uiElementsArray.push(add([
            text(subtitleMessage, { size: hs(26) }),
            pos(centerX, hy(GAME_H / 2 - 8)),
            anchor("center"),
            color(rgb(220, 80, 80)),
            fixed(), z(201),
        ]));
    }

    // ── Container pulsanti ─────────────────────────────────────────
    const buttonWidth        = Math.round(220 * scaleUI);
    const buttonHeight       = Math.round(60  * scaleUI);
    const secondaryBtnHeight = Math.round(40  * scaleUI);
    const buttonGap          = Math.round(12  * scaleUI);
    const topOffset          = Math.round(60  * scaleUI);

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

    // ── Helper: crea bottone ───────────────────────────────────────
    function creaBtn(label, bg, fg, h) {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.style.cssText = `
            width: ${buttonWidth}px; height: ${h}px;
            background: ${bg}; color: ${fg};
            font-size: ${Math.round(15 * scaleUI)}px;
            font-family: monospace; letter-spacing: 1px;
            border: 1px solid ${fg}; border-radius: 6px; cursor: pointer;
        `;
        return btn;
    }

    // ── PLAY ───────────────────────────────────────────────────────
    const playBtn = document.createElement("button");
    playBtn.textContent = "PLAY";
    playBtn.style.cssText = `
        width: ${buttonWidth}px; height: ${buttonHeight}px;
        background: rgb(0,180,70); color: white;
        font-size: ${Math.round(30 * scaleUI)}px; font-weight: bold;
        font-family: monospace; letter-spacing: 2px;
        border: none; border-radius: 6px; cursor: pointer;
    `;
    playBtn.addEventListener("click", () => {
        hideHTMLOverlay();
        destroyAllUI();
        state.socket.emit("spawn");
    });

    // ── STATISTICHE (solo se loggato) ──────────────────────────────
    if (state.accountUsername) {
        const k  = state.accountKills   || 0;
        const d  = state.accountMorti   || 0;
        const lv = state.accountLivello || 1;
        const xp = state.accountXp      || 0;
        const kd = d > 0 ? (k / d).toFixed(2) : k.toFixed(2);

        const statsBox = document.createElement("div");
        statsBox.style.cssText = `
            width: ${buttonWidth}px;
            background: rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            padding: ${Math.round(8*scaleUI)}px ${Math.round(12*scaleUI)}px;
            font-family: monospace;
            font-size: ${Math.round(13*scaleUI)}px;
            color: rgba(255,255,255,0.7);
            text-align: center; line-height: 1.7;
        `;
        statsBox.innerHTML = `
            <span style="color:rgb(0,200,255);font-size:${Math.round(15*scaleUI)}px">${state.accountUsername}</span><br>
            Lv.${lv} &nbsp;·&nbsp; ${xp} XP<br>
            K: ${k} &nbsp; D: ${d} &nbsp; K/D: ${kd}
        `;
        container.appendChild(statsBox);
    }

    container.appendChild(playBtn);

    // ── NAVBAR: Lobby | Statistiche | Login/Logout ─────────────────
    const navRow = document.createElement("div");
    navRow.style.cssText = `
        display: flex; gap: ${Math.round(8*scaleUI)}px;
        width: ${buttonWidth}px;
    `;

    // Bottone Lobby
    const lobbyBtn = creaBtn("← LOBBY", "transparent", "rgba(255,255,255,0.5)", secondaryBtnHeight);
    lobbyBtn.addEventListener("click", () => {
        localStorage.removeItem("lobbyId");
        localStorage.removeItem("lobbyName");
        localStorage.removeItem("lobbyToken");
        if (state.socket) state.socket.disconnect();
        location.reload();
    });

    // Bottone Statistiche (apre classifica PHP)
    const statsBtn = creaBtn("STATS", "transparent", "rgba(0,200,255,0.8)", secondaryBtnHeight);
    statsBtn.addEventListener("click", () => mostraSchermataStats(container));

    navRow.appendChild(lobbyBtn);
    navRow.appendChild(statsBtn);
    container.appendChild(navRow);

    // ── AUTH ROW: Login+Register (ospite) o Logout (loggato) ───────
    const authRow = document.createElement("div");
    authRow.style.cssText = `
        display: flex; gap: ${Math.round(8*scaleUI)}px;
        width: ${buttonWidth}px;
    `;

    if (state.accountUsername) {
        // Loggato → solo Logout
        const logoutBtn = creaBtn("LOGOUT", "transparent", "rgba(220,80,80,0.8)", secondaryBtnHeight);
        logoutBtn.addEventListener("click", async () => {
            await logout();
            state.accountUsername = null;
            state.accountLivello  = 1;
            state.accountXp       = 0;
            state.accountKills    = 0;
            state.accountMorti    = 0;
            location.reload();
        });
        authRow.appendChild(logoutBtn);
    } else {
        // Ospite → Login e Register
        const loginBtn    = creaBtn("LOGIN",    "transparent", "rgba(0,200,255,0.8)", secondaryBtnHeight);
        const registerBtn = creaBtn("REGISTER", "transparent", "rgba(0,255,100,0.8)", secondaryBtnHeight);

        function apriAuth(tab) {
            localStorage.removeItem("lobbyId");
            localStorage.removeItem("lobbyName");
            localStorage.removeItem("lobbyToken");
            if (state.socket) state.socket.disconnect();
            initAuth(() => { location.reload(); });
            mostraSchermataAuth();
            if (tab === "register") {
                setTimeout(() => {
                    const t = [...document.querySelectorAll("button")].find(b => b.textContent === "Registrati");
                    if (t) t.click();
                }, 50);
            }
        }

        loginBtn.addEventListener("click",    () => apriAuth("login"));
        registerBtn.addEventListener("click", () => apriAuth("register"));
        authRow.appendChild(loginBtn);
        authRow.appendChild(registerBtn);
    }

    container.appendChild(authRow);
    document.body.appendChild(container);
    setCurrentContainer(container);

    setTimeout(() => playBtn.focus(), 50);
}

// ============================================================
// SCHERMATA STATISTICHE (classifica globale)
// ============================================================

async function mostraSchermataStats(parentContainer) {
    // Nasconde il container del menu
    if (parentContainer) parentContainer.style.display = "none";

    const { scale: scaleUI } = calcolaLetterbox();

    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; inset: 0;
        background: rgba(5,10,5,0.96);
        display: flex; flex-direction: column;
        align-items: center; justify-content: flex-start;
        padding-top: ${Math.round(40 * scaleUI)}px;
        z-index: 99999; font-family: monospace; color: white;
        overflow-y: auto;
    `;

    const title = document.createElement("div");
    title.textContent = "CLASSIFICA GLOBALE";
    title.style.cssText = `
        font-size: ${Math.round(28*scaleUI)}px;
        color: rgb(0,255,100); letter-spacing: 3px;
        margin-bottom: ${Math.round(20*scaleUI)}px;
    `;

    const table = document.createElement("div");
    table.style.cssText = `
        width: min(90vw, ${Math.round(480*scaleUI)}px);
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 10px;
        overflow: hidden;
        font-size: ${Math.round(14*scaleUI)}px;
    `;

    table.innerHTML = `<div style="padding:16px;text-align:center;color:rgba(255,255,255,0.5)">Caricamento...</div>`;

    const backBtn = document.createElement("button");
    backBtn.textContent = "← INDIETRO";
    backBtn.style.cssText = `
        margin-top: ${Math.round(20*scaleUI)}px;
        padding: ${Math.round(10*scaleUI)}px ${Math.round(28*scaleUI)}px;
        background: transparent; color: rgba(255,255,255,0.6);
        font-size: ${Math.round(14*scaleUI)}px; font-family: monospace;
        border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; cursor: pointer;
    `;
    backBtn.addEventListener("click", () => {
        overlay.remove();
        if (parentContainer) parentContainer.style.display = "flex";
    });

    overlay.appendChild(title);
    overlay.appendChild(table);
    overlay.appendChild(backBtn);
    document.body.appendChild(overlay);

    // Carica classifica dal PHP
    try {
        const res  = await fetch("/php/classifica.php");
        const data = await res.json();

        if (!data.ok || !data.classifica.length) {
            table.innerHTML = `<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4)">Nessun dato disponibile.</div>`;
            return;
        }

        // Header tabella
        const headerStyle = `
            display: grid; grid-template-columns: 40px 1fr 60px 60px 60px 50px;
            padding: ${Math.round(10*scaleUI)}px ${Math.round(16*scaleUI)}px;
            background: rgba(0,255,100,0.08);
            color: rgb(0,255,100); font-size: ${Math.round(12*scaleUI)}px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
        `;
        const rowStyle = (i) => `
            display: grid; grid-template-columns: 40px 1fr 60px 60px 60px 50px;
            padding: ${Math.round(10*scaleUI)}px ${Math.round(16*scaleUI)}px;
            background: ${i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent"};
            border-bottom: 1px solid rgba(255,255,255,0.05);
            color: ${i === 0 ? "rgb(255,215,0)" : "rgba(255,255,255,0.85)"};
        `;

        let html = `<div style="${headerStyle}">
            <span>#</span><span>Username</span>
            <span>Kills</span><span>Morti</span><span>Partite</span><span>Lv.</span>
        </div>`;

        data.classifica.forEach((p, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}`;
            html += `<div style="${rowStyle(i)}">
                <span>${medal}</span>
                <span>${p.username}</span>
                <span>${p.kills_totali}</span>
                <span>${p.morti_totali}</span>
                <span>${p.partite}</span>
                <span>${p.livello}</span>
            </div>`;
        });

        table.innerHTML = html;

    } catch (e) {
        table.innerHTML = `<div style="padding:20px;text-align:center;color:rgb(220,80,80)">Errore nel caricamento.</div>`;
    }
}