// ============================================================
// menu.js — Menu di spawn in-game
// ============================================================

import { state, GAME_W, GAME_H, hx, hy, hs, calcolaLetterbox } from "./state.js";
import { salvaStat, registraPartita, resetPartitaFlag } from "./main.js";
import { mostraHowToPlay } from "./lobby.js";
import { mostraBattlePass } from "./battlepass.js";

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
    const displayName = state.accountUsername || state.myNickname || "Guest";
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
        const kd = d > 0 ? (k / d).toFixed(2) : k > 0 ? k.toFixed(2) : "—";

        // kills/morti della sessione di gioco corrente
        const sk = state.myKills  || 0;
        const sd = state.myDeaths || 0;

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
            <span style="color:rgba(255,255,255,0.45);font-size:${Math.round(11*scaleUI)}px">TOTALE</span><br>
            K: ${k} &nbsp; D: ${d} &nbsp; K/D: ${kd}
            ${(sk > 0 || sd > 0) ? `<br><span style="color:rgba(255,255,255,0.45);font-size:${Math.round(11*scaleUI)}px">QUESTA PARTITA</span><br>K: ${sk} &nbsp; D: ${sd}` : ""}
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
        // AJAX: registra +1 partita al primo PLAY della sessione.
        // registraPartita() usa un flag interno per non contarla
        // più volte se il giocatore fa selfKill e respawna.
        registraPartita();
        state.socket.emit("spawn");
    });
    container.appendChild(playButton);

    // Navbar: LOBBY | STATS
    const navRow = document.createElement("div");
    navRow.style.cssText = `display:flex; gap:${Math.round(8*scaleUI)}px; width:${buttonWidth}px;`;

    const lobbyBtn = creaBtn("← LOBBY", "rgba(255,255,255,0.5)");
    lobbyBtn.addEventListener("click", () => {
        // Resetta il flag partita così la prossima sessione conta correttamente.
        // salvaStat() è ora no-op (tutto già salvato in tempo reale).
        resetPartitaFlag();
        salvaStat();

        localStorage.removeItem("lobbyId");
        localStorage.removeItem("lobbyName");
        localStorage.removeItem("lobbyToken");
        if (state.socket) { state.socket.disconnect(); state.socket = null; }
        state.myId      = null;
        state.myLobbyId = null;
        state.myLobbyName = null;
        state.myToken   = null;
        state.myKills   = 0;
        state.myDeaths  = 0;
        if (_goToLobby) _goToLobby();
    });

    const statsBtn = creaBtn("STATS", "rgba(0,200,255,0.8)");
    statsBtn.addEventListener("click", () => mostraSchermataStats(container));

    const howToPlayBtn = creaBtn("HOW TO PLAY", "rgba(255,200,0,0.85)");
    howToPlayBtn.addEventListener("click", () => mostraHowToPlay(container));

    const bpBtn = creaBtn("BATTLE PASS", "rgba(160,0,255,0.85)");
    bpBtn.addEventListener("click", () => mostraBattlePass(container));

    navRow.appendChild(lobbyBtn);
    navRow.appendChild(howToPlayBtn);
    navRow.appendChild(statsBtn);
    navRow.appendChild(bpBtn);
    container.appendChild(navRow);

    // Auth row
    const authRow = document.createElement("div");
    authRow.style.cssText = `display:flex; gap:${Math.round(8*scaleUI)}px; width:${buttonWidth}px;`;

    if (state.accountUsername) {
        // Loggato → solo LOGOUT
        const logoutBtn = creaBtn("LOGOUT", "rgba(220,80,80,0.8)");
        logoutBtn.addEventListener("click", async () => {
            // Salva kills/morti PRIMA del logout e del reload
            salvaStat();
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

    // Titolo + badge LIVE pulsante
    const titleRow = document.createElement("div");
    titleRow.style.cssText = `display:flex; align-items:center; gap:${Math.round(10*scaleUI)}px;
        margin-bottom:${Math.round(20*scaleUI)}px;`;
    const title = document.createElement("div");
    title.textContent = "GLOBAL LEADERBOARD";
    title.style.cssText = `font-size:${Math.round(28*scaleUI)}px; color:rgb(0,255,100); letter-spacing:3px;`;
    const liveDot = document.createElement("div");
    liveDot.textContent = "LIVE";
    liveDot.style.cssText = `font-size:${Math.round(10*scaleUI)}px; color:rgb(0,255,100);
        background:rgba(0,255,100,0.12); border:1px solid rgba(0,255,100,0.35);
        border-radius:4px; padding:2px 6px; letter-spacing:2px; animation:livePulse 2s infinite;`;
    titleRow.appendChild(title);
    titleRow.appendChild(liveDot);

    // Stile animazione pulse (aggiunto una volta sola)
    if (!document.getElementById("livePulseStyle")) {
        const style = document.createElement("style");
        style.id = "livePulseStyle";
        style.textContent = `@keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`;
        document.head.appendChild(style);
    }

    // Box statistiche personali (aggiornato automaticamente ad ogni poll)
    let myBox = null;
    if (state.accountUsername) {
        myBox = document.createElement("div");
        myBox.style.cssText = `width:min(90vw,${Math.round(480*scaleUI)}px);
            background:rgba(0,200,255,0.08); border:1px solid rgba(0,200,255,0.25);
            border-radius:8px; padding:${Math.round(12*scaleUI)}px ${Math.round(16*scaleUI)}px;
            font-family:monospace; font-size:${Math.round(13*scaleUI)}px;
            color:rgba(255,255,255,0.75); margin-bottom:${Math.round(14*scaleUI)}px;
            text-align:center; line-height:1.8;`;
        overlay.appendChild(myBox);
    }

    const table = document.createElement("div");
    table.style.cssText = `width:min(90vw,${Math.round(480*scaleUI)}px);
        background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12);
        border-radius:10px; overflow:hidden; font-size:${Math.round(14*scaleUI)}px;`;
    table.innerHTML = `<div style="padding:16px;text-align:center;color:rgba(255,255,255,0.5)">Loading...</div>`;

    // Solo bottone BACK (niente refresh manuale)
    const backBtn = document.createElement("button");
    backBtn.textContent = "\u2190 BACK";
    backBtn.style.cssText = `margin-top:${Math.round(20*scaleUI)}px;
        padding:${Math.round(10*scaleUI)}px ${Math.round(28*scaleUI)}px;
        background:transparent; color:rgba(255,255,255,0.6);
        font-size:${Math.round(14*scaleUI)}px; font-family:monospace;
        border:1px solid rgba(255,255,255,0.2); border-radius:6px; cursor:pointer;`;

    overlay.appendChild(titleRow);
    overlay.appendChild(table);
    overlay.appendChild(backBtn);
    document.body.appendChild(overlay);

    // Aggiorna myBox con i dati freschi dal DB (o dallo state se non trovato)
    function aggiornaMyBox(dbRow) {
        if (!myBox) return;
        const k  = dbRow ? Number(dbRow.kills_totali) : (state.accountKills   || 0);
        const d  = dbRow ? Number(dbRow.morti_totali) : (state.accountMorti   || 0);
        const lv = dbRow ? Number(dbRow.livello)      : (state.accountLivello || 1);
        const xp = dbRow ? Number(dbRow.xp)           : (state.accountXp      || 0);
        const kd = d > 0 ? (k / d).toFixed(2) : k > 0 ? k.toFixed(2) : "\u2014";
        // Sincronizza lo state locale coi valori reali del DB
        if (dbRow) {
            state.accountKills   = k;
            state.accountMorti   = d;
            state.accountLivello = lv;
            state.accountXp      = xp;
        }
        myBox.innerHTML = `
            <span style="color:rgb(0,200,255);font-size:${Math.round(16*scaleUI)}px;font-weight:bold">${state.accountUsername}</span><br>
            <span style="color:rgb(0,255,100)">Lv.${lv}</span> &nbsp;&middot;&nbsp; <span style="color:rgb(255,200,0)">${xp} XP</span><br>
            Kills: <b style="color:#8f8">${k}</b> &nbsp; Deaths: <b style="color:#f88">${d}</b> &nbsp; K/D: <b style="color:#ff8">${kd}</b>`;
    }

    let pollTimer = null;

    async function caricaClassifica() {
        try {
            const res  = await fetch("/php/classifica.php");
            const data = await res.json();

            // Cerca la riga dell'utente corrente per aggiornare le sue stats
            const myRow = state.accountUsername
                ? (data.classifica || []).find(p => p.username === state.accountUsername) || null
                : null;
            aggiornaMyBox(myRow);

            if (!data.ok || !data.classifica.length) {
                table.innerHTML = `<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4)">No data available.</div>`;
                return;
            }

            const cols = "40px 1fr 60px 60px 60px 50px";
            const pad  = `${Math.round(10*scaleUI)}px ${Math.round(16*scaleUI)}px`;
            const fs   = Math.round(12*scaleUI);

            let html = `<div style="display:grid;grid-template-columns:${cols};padding:${pad};
                background:rgba(0,255,100,0.08);color:rgb(0,255,100);font-size:${fs}px;
                border-bottom:1px solid rgba(255,255,255,0.08)">
                <span>#</span><span>Username</span>
                <span>Kills</span><span>Deaths</span><span>Games</span><span>Lv.</span>
            </div>`;

            data.classifica.forEach((p, i) => {
                const medalColor = i === 0 ? "rgb(255,210,0)" : i === 1 ? "rgb(200,200,200)" : i === 2 ? "rgb(205,127,50)" : "rgba(255,255,255,0.35)";
                const medalBg    = i === 0 ? "rgba(255,210,0,0.14)" : i === 1 ? "rgba(200,200,200,0.09)" : i === 2 ? "rgba(205,127,50,0.11)" : "transparent";
                const medalText  = `#${i+1}`;
                const isMe  = p.username === state.accountUsername;
                const col   = isMe ? "rgb(0,230,255)" : i === 0 ? "rgb(255,210,0)" : "rgba(255,255,255,0.85)";
                const bg    = isMe ? "rgba(0,200,255,0.13)" : i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent";
                const border = isMe ? "border-left:3px solid rgb(0,200,255);" : i < 3 ? `border-left:3px solid ${medalColor};` : "border-left:3px solid transparent;";
                html += `<div style="display:grid;grid-template-columns:${cols};padding:${pad};
                    background:${bg};color:${col};border-bottom:1px solid rgba(255,255,255,0.05);${border}">
                    <span style="color:${medalColor};background:${medalBg};border-radius:4px;padding:1px 5px;font-weight:bold;text-align:center">${medalText}</span>
                    <span>${isMe ? `<span style="color:rgb(0,230,255);font-weight:bold">${p.username}</span> <span style="color:rgb(0,230,255);background:rgba(0,200,255,0.18);border:1px solid rgba(0,200,255,0.35);border-radius:3px;padding:0 4px;font-size:0.75em;letter-spacing:1px">YOU</span>` : p.username}</span>
                    <span>${p.kills_totali}</span><span>${p.morti_totali}</span>
                    <span>${p.partite}</span><span>${p.livello}</span>
                </div>`;
            });

            table.innerHTML = html;
        } catch (e) {
            table.innerHTML = `<div style="padding:20px;text-align:center;color:rgb(220,80,80)">Failed to load.</div>`;
        }
    }

    // Prima chiamata immediata, poi ogni 5 secondi
    await caricaClassifica();
    pollTimer = setInterval(caricaClassifica, 5000);

    // Chiudi: ferma il poll e ripristina il menu
    backBtn.addEventListener("click", () => {
        clearInterval(pollTimer);
        overlay.remove();
        if (parentContainer) parentContainer.style.display = "flex";
    });
}