// ============================================================
// menu.js — Menu di spawn in-game
// ============================================================

import { state, GAME_W, GAME_H, hx, hy, hs, calcolaLetterbox } from "./state.js";

// ── Dipendenze iniettate da main.js ──────────────────────────────
let uiElementsArray      = null;
let hideHTMLOverlay      = null;
let destroyAllUI         = null;
let setCurrentContainer  = null;
let _mostraAuth          = null;   // iniettata da main.js
let _logout              = null;   // iniettata da main.js
let _goToLobby           = null;   // iniettata da main.js — torna alla lobby SENZA reload

export function initMenu(uiLayer, nascondiElementiHTML, distruggiUI, setHtmlContainer, mostraAuth, logoutFn, goToLobby) {
    uiElementsArray     = uiLayer;
    hideHTMLOverlay     = nascondiElementiHTML;
    destroyAllUI        = distruggiUI;
    setCurrentContainer = setHtmlContainer;
    _mostraAuth         = mostraAuth;
    _logout             = logoutFn;
    _goToLobby          = goToLobby;
}

export function mostraMenu(subtitleMessage) {
    destroyAllUI();
    state.inMenu        = true;
    state.inLobbyScreen = false;

    const centerX = hx(GAME_W / 2);
    const { scale: scaleUI } = calcolaLetterbox();

    uiElementsArray.push(add([
        rect(width(), height()), pos(0, 0),
        color(rgb(5, 10, 5)), opacity(0.88),
        fixed(), z(200),
    ]));

    uiElementsArray.push(add([
        text("SHOOTER ONLINE", { size: hs(52) }),
        pos(centerX, hy(GAME_H / 2 - 140)),
        anchor("center"), color(rgb(0, 255, 100)),
        fixed(), z(201),
    ]));

    // Nome: username se loggato, nickname random se ospite
    const displayName = state.accountUsername || state.myNickname || "Ospite";
    uiElementsArray.push(add([
        text(displayName, { size: hs(22) }),
        pos(centerX, hy(GAME_H / 2 - 70)),
        anchor("center"),
        color(state.accountUsername ? rgb(0, 200, 255) : rgb(180, 180, 180)),
        fixed(), z(201),
    ]));

    if (state.myLobbyName) {
        uiElementsArray.push(add([
            text(`Lobby: ${state.myLobbyName}`, { size: hs(16) }),
            pos(centerX, hy(GAME_H / 2 - 40)),
            anchor("center"), color(rgb(180, 180, 180)),
            fixed(), z(201),
        ]));
    }

    if (subtitleMessage) {
        uiElementsArray.push(add([
            text(subtitleMessage, { size: hs(26) }),
            pos(centerX, hy(GAME_H / 2 - 8)),
            anchor("center"), color(rgb(220, 80, 80)),
            fixed(), z(201),
        ]));
    }

    const buttonWidth        = Math.round(220 * scaleUI);
    const buttonHeight       = Math.round(60  * scaleUI);
    const secondaryBtnHeight = Math.round(40  * scaleUI);
    const buttonGap          = Math.round(12  * scaleUI);
    const topOffset          = Math.round(60  * scaleUI);

    const container = document.createElement("div");
    container.style.cssText = `
        position: fixed;
        left: ${centerX}px; top: ${hy(GAME_H / 2) + topOffset}px;
        transform: translate(-50%, 0);
        display: flex; flex-direction: column; align-items: center;
        gap: ${buttonGap}px; z-index: 9999;
    `;

    function creaBtn(label, fg) {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.style.cssText = `
            flex: 1; height: ${secondaryBtnHeight}px;
            background: transparent; color: ${fg};
            font-size: ${Math.round(13 * scaleUI)}px;
            font-family: monospace; letter-spacing: 1px;
            border: 1px solid ${fg}; border-radius: 6px; cursor: pointer;
        `;
        return btn;
    }

    // Box statistiche (solo se loggato)
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
            border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;
            padding: ${Math.round(8*scaleUI)}px ${Math.round(12*scaleUI)}px;
            font-family: monospace; font-size: ${Math.round(13*scaleUI)}px;
            color: rgba(255,255,255,0.7); text-align: center; line-height: 1.7;
        `;
        statsBox.innerHTML = `
            <span style="color:rgb(0,200,255);font-size:${Math.round(15*scaleUI)}px">${state.accountUsername}</span><br>
            Lv.${lv} &nbsp;·&nbsp; ${xp} XP<br>
            K: ${k} &nbsp; D: ${d} &nbsp; K/D: ${kd}
        `;
        container.appendChild(statsBox);
    }

    // PLAY
    const playButton = document.createElement("button");
    playButton.textContent = "PLAY";
    playButton.style.cssText = `
        width: ${buttonWidth}px; height: ${buttonHeight}px;
        background: rgb(0,180,70); color: white;
        font-size: ${Math.round(30*scaleUI)}px; font-weight: bold;
        border: none; border-radius: 6px; cursor: pointer;
        font-family: monospace; letter-spacing: 2px;
    `;
    playButton.addEventListener("click", () => {
        hideHTMLOverlay();
        destroyAllUI();
        state.socket.emit("spawn");
    });
    container.appendChild(playButton);

    // Navbar: LOBBY | STATS
    const navRow = document.createElement("div");
    navRow.style.cssText = `display:flex; gap:${Math.round(8*scaleUI)}px; width:${buttonWidth}px;`;

    const lobbyBtn = creaBtn("← LOBBY", "rgba(255,255,255,0.5)");
    lobbyBtn.addEventListener("click", () => {
        localStorage.removeItem("lobbyId");
        localStorage.removeItem("lobbyName");
        localStorage.removeItem("lobbyToken");
        if (state.socket) { state.socket.disconnect(); state.socket = null; }
        state.myId = null;
        state.myLobbyId = null;
        state.myLobbyName = null;
        state.myToken = null;
        state.myKills = 0;
        state.myDeaths = 0;
        if (_goToLobby) _goToLobby();
    });

    const statsBtn = creaBtn("STATS", "rgba(0,200,255,0.8)");
    statsBtn.addEventListener("click", () => mostraSchermataStats(container));

    navRow.appendChild(lobbyBtn);
    navRow.appendChild(statsBtn);
    container.appendChild(navRow);

    // Auth row
    const authRow = document.createElement("div");
    authRow.style.cssText = `display:flex; gap:${Math.round(8*scaleUI)}px; width:${buttonWidth}px;`;

    if (state.accountUsername) {
        // Loggato → solo LOGOUT
        const logoutBtn = creaBtn("LOGOUT", "rgba(220,80,80,0.8)");
        logoutBtn.addEventListener("click", async () => {
            if (_logout) await _logout();
            state.accountUsername = null;
            state.accountLivello  = 1;
            state.accountXp       = 0;
            state.accountKills    = 0;
            state.accountMorti    = 0;
            location.reload();
        });
        authRow.appendChild(logoutBtn);
    } else {
        // Ospite → LOGIN + REGISTER
        const loginBtn    = creaBtn("LOGIN",    "rgba(0,200,255,0.8)");
        const registerBtn = creaBtn("REGISTER", "rgba(0,255,100,0.8)");
        loginBtn.addEventListener("click",    () => { if (_mostraAuth) _mostraAuth("login");    });
        registerBtn.addEventListener("click", () => { if (_mostraAuth) _mostraAuth("register"); });
        authRow.appendChild(loginBtn);
        authRow.appendChild(registerBtn);
    }

    container.appendChild(authRow);
    document.body.appendChild(container);
    setCurrentContainer(container);

    setTimeout(() => playButton.focus(), 50);
}

// ============================================================
// SCHERMATA CLASSIFICA
// ============================================================

export async function mostraSchermataStats(parentContainer) {
    if (parentContainer) parentContainer.style.display = "none";
    const { scale: scaleUI } = calcolaLetterbox();

    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(5,10,5,0.96);
        display:flex; flex-direction:column; align-items:center;
        justify-content:flex-start; padding-top:${Math.round(40*scaleUI)}px;
        z-index:99999; font-family:monospace; color:white; overflow-y:auto;
    `;

    const title = document.createElement("div");
    title.textContent = "CLASSIFICA GLOBALE";
    title.style.cssText = `font-size:${Math.round(28*scaleUI)}px; color:rgb(0,255,100);
        letter-spacing:3px; margin-bottom:${Math.round(20*scaleUI)}px;`;

    // Box statistiche personali (solo se loggato)
    if (state.accountUsername) {
        const k  = state.accountKills   || 0;
        const d  = state.accountMorti   || 0;
        const lv = state.accountLivello || 1;
        const xp = state.accountXp      || 0;
        const kd = d > 0 ? (k / d).toFixed(2) : k > 0 ? k.toFixed(2) : "—";
        const myBox = document.createElement("div");
        myBox.style.cssText = `width:min(90vw,${Math.round(480*scaleUI)}px);
            background:rgba(0,200,255,0.08); border:1px solid rgba(0,200,255,0.25);
            border-radius:8px; padding:${Math.round(12*scaleUI)}px ${Math.round(16*scaleUI)}px;
            font-family:monospace; font-size:${Math.round(13*scaleUI)}px;
            color:rgba(255,255,255,0.75); margin-bottom:${Math.round(14*scaleUI)}px; text-align:center; line-height:1.8;`;
        myBox.innerHTML = `<span style="color:rgb(0,200,255);font-size:${Math.round(16*scaleUI)}px;font-weight:bold">${state.accountUsername}</span><br>
            <span style="color:rgb(0,255,100)">Lv.${lv}</span> &nbsp;·&nbsp; <span style="color:rgb(255,200,0)">${xp} XP</span><br>
            Kills: <b style="color:#8f8">${k}</b> &nbsp; Morti: <b style="color:#f88">${d}</b> &nbsp; K/D: <b style="color:#ff8">${kd}</b>`;
        overlay.appendChild(myBox);
    }

    const table = document.createElement("div");
    table.style.cssText = `width:min(90vw,${Math.round(480*scaleUI)}px);
        background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12);
        border-radius:10px; overflow:hidden; font-size:${Math.round(14*scaleUI)}px;`;
    table.innerHTML = `<div style="padding:16px;text-align:center;color:rgba(255,255,255,0.5)">Caricamento...</div>`;

    // Riga pulsanti: AGGIORNA + INDIETRO
    const btnRow = document.createElement("div");
    btnRow.style.cssText = `display:flex; gap:${Math.round(10*scaleUI)}px; margin-top:${Math.round(20*scaleUI)}px;`;

    const refreshBtn = document.createElement("button");
    refreshBtn.textContent = "↻ AGGIORNA";
    refreshBtn.style.cssText = `padding:${Math.round(10*scaleUI)}px ${Math.round(20*scaleUI)}px;
        background:rgba(0,255,100,0.1); color:rgb(0,255,100);
        font-size:${Math.round(14*scaleUI)}px; font-family:monospace;
        border:1px solid rgba(0,255,100,0.3); border-radius:6px; cursor:pointer;`;

    const backBtn = document.createElement("button");
    backBtn.textContent = "← INDIETRO";
    backBtn.style.cssText = `padding:${Math.round(10*scaleUI)}px ${Math.round(28*scaleUI)}px;
        background:transparent; color:rgba(255,255,255,0.6);
        font-size:${Math.round(14*scaleUI)}px; font-family:monospace;
        border:1px solid rgba(255,255,255,0.2); border-radius:6px; cursor:pointer;`;
    backBtn.addEventListener("click", () => {
        overlay.remove();
        if (parentContainer) parentContainer.style.display = "flex";
    });

    btnRow.appendChild(refreshBtn);
    btnRow.appendChild(backBtn);

    overlay.appendChild(title);
    overlay.appendChild(table);
    overlay.appendChild(btnRow);
    document.body.appendChild(overlay);

    async function caricaClassifica() {
        table.innerHTML = `<div style="padding:16px;text-align:center;color:rgba(255,255,255,0.5)">Caricamento...</div>`;
        refreshBtn.disabled = true;
        try {
            const res  = await fetch("/php/classifica.php");
            const data = await res.json();

            if (!data.ok || !data.classifica.length) {
                table.innerHTML = `<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4)">Nessun dato disponibile.</div>`;
                return;
            }

            const cols = "40px 1fr 60px 60px 60px 50px";
            const pad  = `${Math.round(10*scaleUI)}px ${Math.round(16*scaleUI)}px`;
            const fs   = Math.round(12*scaleUI);

            let html = `<div style="display:grid;grid-template-columns:${cols};padding:${pad};
                background:rgba(0,255,100,0.08);color:rgb(0,255,100);font-size:${fs}px;
                border-bottom:1px solid rgba(255,255,255,0.08)">
                <span>#</span><span>Username</span>
                <span>Kills</span><span>Morti</span><span>Partite</span><span>Lv.</span>
            </div>`;

            data.classifica.forEach((p, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}`;
                const isMe  = p.username === state.accountUsername;
                const col   = isMe ? "rgb(0,220,255)" : i === 0 ? "rgb(255,215,0)" : "rgba(255,255,255,0.85)";
                const bg    = isMe ? "rgba(0,200,255,0.08)" : i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent";
                const border = isMe ? "border-left:2px solid rgb(0,200,255);" : "";
                html += `<div style="display:grid;grid-template-columns:${cols};padding:${pad};
                    background:${bg};color:${col};border-bottom:1px solid rgba(255,255,255,0.05);${border}">
                    <span>${medal}</span><span>${p.username}</span>
                    <span>${p.kills_totali}</span><span>${p.morti_totali}</span>
                    <span>${p.partite}</span><span>${p.livello}</span>
                </div>`;
            });

            table.innerHTML = html;
        } catch (e) {
            table.innerHTML = `<div style="padding:20px;text-align:center;color:rgb(220,80,80)">Errore nel caricamento.</div>`;
        } finally {
            refreshBtn.disabled = false;
        }
    }

    refreshBtn.addEventListener("click", caricaClassifica);
    caricaClassifica();
}