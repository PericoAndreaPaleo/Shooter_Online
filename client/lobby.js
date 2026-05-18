// ============================================================
// lobby.js — Schermata selezione e creazione lobby
//
// Gestisce l'intera UI della schermata iniziale:
//   • Input per nome e password della lobby da creare
//   • Toggle "privata" con field password
//   • Lista delle lobby disponibili (aggiornata in real-time)
//   • Join con password per lobby private
//   • Messaggi di errore (lobby piena, password errata, ecc.)
// ============================================================

import { state, GAME_W, GAME_H, hx, hy, hs } from "./state.js";

// ── Dipendenze iniettate da main.js ──────────────────────────────
let uiElementsArray     = null;
let destroyAllUI        = null;
let hideHTMLOverlay     = null;
let setCurrentContainer = null;
let connectToLobby      = null;   // funzione di main.js per connettersi a un namespace
let _mostraAuth         = null;   // apre schermata login/register
let _logoutFn           = null;   // esegue logout
let _mostraStats        = null;   // apre schermata classifica

/** Cache locale dell'ultima lista lobby ricevuta dal server */
let cachedLobbyList = [];

/**
 * Restituisce la lista lobby attualmente in cache (già ricevuta
 * dal server al momento della connessione socket).
 * Usata da main.js per il rejoin senza dover aspettare
 * un ulteriore evento "lobbyList".
 * @returns {Array}
 */
export function getCachedLobbyList() {
    return cachedLobbyList;
}

/**
 * Inizializza il modulo lobby con le dipendenze di main.js.
 *
 * @param {Array}    uiLayer            - Array degli oggetti Kaboom UI
 * @param {function} distruggiUI        - Cleanup totale del layer UI
 * @param {function} nascondiElementiHTML - Rimuove il container HTML corrente
 * @param {function} setHtmlContainer   - Registra il container HTML attivo
 * @param {function} connettiALobby     - Connette al namespace della lobby scelta
 */
export function initLobby(uiLayer, distruggiUI, nascondiElementiHTML, setHtmlContainer, connettiALobby, mostraAuth, logoutFn, mostraStats) {
    uiElementsArray     = uiLayer;
    destroyAllUI        = distruggiUI;
    hideHTMLOverlay     = nascondiElementiHTML;
    setCurrentContainer = setHtmlContainer;
    connectToLobby      = connettiALobby;
    _mostraAuth         = mostraAuth;
    _logoutFn           = logoutFn;
    _mostraStats        = mostraStats;
}

// ============================================================
// SCHERMATA PRINCIPALE SELEZIONE LOBBY
// ============================================================

/**
 * Mostra (o rimostra) la schermata di selezione lobby.
 * Se viene passato un messaggio di errore, lo mostra in rosso
 * in cima alla schermata (es. "Lobby not found.").
 *
 * @param {string} [errorMessage] - Messaggio di errore opzionale
 */
export function mostraSchermataLobby(errorMessage) {
    destroyAllUI();
    state.inMenu        = true;
    state.inLobbyScreen = true;

    // Overlay di sfondo (Kaboom)
    uiElementsArray.push(add([
        rect(width(), height()), pos(0, 0),
        color(rgb(5, 10, 20)), opacity(0.97),
        fixed(), z(200),
    ]));

    // Titolo (Kaboom)
    uiElementsArray.push(add([
        text("SHOOTER ONLINE", { size: hs(46) }),
        pos(hx(GAME_W / 2), hy(54)),
        anchor("center"),
        color(rgb(0, 255, 100)),
        fixed(), z(201),
    ]));

    // Fattore di scala per i componenti HTML (adattivo alle dimensioni schermo)
    const uiScale = Math.min(1, Math.min(window.innerWidth, window.innerHeight * 16 / 9) / 520);
    const scaledPx = (n) => `${Math.max(10, Math.round(n * uiScale))}px`;

    // ── Container principale HTML ──────────────────────────────────
    const container = document.createElement("div");
    container.style.cssText = `
        position:   fixed;
        left:       50%;
        top:        50%;
        transform:  translate(-50%, -50%);
        display:    flex;
        flex-direction: column;
        align-items: center;
        gap:        ${Math.round(10 * uiScale)}px;
        z-index:    9999;
        width:      min(520px, 92vw);
    `;

    // ── Messaggio di errore (se presente) ─────────────────────────
    if (errorMessage) {
        const errorDiv = document.createElement("div");
        errorDiv.textContent  = errorMessage;
        errorDiv.style.cssText = `color: #f55; font-size: ${scaledPx(15)}; font-family: monospace; text-align: center;`;
        container.appendChild(errorDiv);
    }

    // ── Riga superiore: nome lobby + pulsante Crea ─────────────────
    const createRow = document.createElement("div");
    createRow.style.cssText = `display: flex; gap: ${Math.round(8 * uiScale)}px; width: 100%;`;

    const lobbyNameInput = document.createElement("input");
    lobbyNameInput.placeholder = "Lobby name (optional)";
    lobbyNameInput.maxLength   = 30;
    lobbyNameInput.style.cssText = `
        flex:       1;
        padding:    ${Math.round(10 * uiScale)}px ${Math.round(12 * uiScale)}px;
        background: rgba(255, 255, 255, 0.08);
        border:     2px solid rgba(0, 255, 100, 0.4);
        border-radius: 6px;
        color:      white;
        font-size:  ${scaledPx(16)};
        font-family: monospace;
        outline:    none;
    `;

    const createButton = document.createElement("button");
    createButton.textContent = "+ CREATE";
    createButton.style.cssText = `
        padding:    ${Math.round(10 * uiScale)}px ${Math.round(16 * uiScale)}px;
        background: rgb(0, 160, 70);
        color:      white;
        font-size:  ${scaledPx(16)};
        font-weight: bold;
        border:     none;
        border-radius: 6px;
        cursor:     pointer;
        font-family: monospace;
        white-space: nowrap;
    `;

    createRow.appendChild(lobbyNameInput);
    createRow.appendChild(createButton);
    container.appendChild(createRow);

    // ── Riga opzioni: checkbox "Privata" + campo password ─────────
    const optionsRow = document.createElement("div");
    optionsRow.style.cssText = `display: flex; align-items: center; gap: ${Math.round(10 * uiScale)}px; width: 100%;`;

    // Checkbox "Privata"
    const privateLabel = document.createElement("label");
    privateLabel.style.cssText = `
        display:    flex;
        align-items: center;
        gap:        6px;
        color:      rgba(255, 255, 255, 0.7);
        font-family: monospace;
        font-size:  ${scaledPx(14)};
        cursor:     pointer;
        white-space: nowrap;
    `;

    const privateCheckbox = document.createElement("input");
    privateCheckbox.type  = "checkbox";
    privateCheckbox.style.cssText = "width: 16px; height: 16px; cursor: pointer; accent-color: #e93;";

    privateLabel.appendChild(privateCheckbox);
    const privateLockSpan = document.createElement("span");
    privateLockSpan.textContent = "PRIVATE";
    privateLockSpan.style.cssText = "color:rgb(255,170,50);background:rgba(255,150,0,0.15);border:1px solid rgba(255,150,0,0.35);border-radius:4px;padding:1px 6px;font-size:0.9em;letter-spacing:1px;";
    privateLabel.appendChild(privateLockSpan);

    // Campo password (nascosto finché non si spunta "Privata")
    const passwordInput = document.createElement("input");
    passwordInput.type        = "password";
    passwordInput.placeholder = "Password";
    passwordInput.maxLength   = 30;
    passwordInput.style.cssText = `
        flex:       1;
        padding:    ${Math.round(8 * uiScale)}px ${Math.round(10 * uiScale)}px;
        background: rgba(255, 255, 255, 0.08);
        border:     2px solid rgba(255, 150, 0, 0.4);
        border-radius: 6px;
        color:      white;
        font-size:  ${scaledPx(14)};
        font-family: monospace;
        outline:    none;
        display:    none;
    `;

    // Mostra/nasconde il campo password al cambio della checkbox
    privateCheckbox.addEventListener("change", () => {
        passwordInput.style.display = privateCheckbox.checked ? "block" : "none";
        if (privateCheckbox.checked) passwordInput.focus();
    });

    optionsRow.appendChild(privateLabel);
    optionsRow.appendChild(passwordInput);
    container.appendChild(optionsRow);

    // ── Handler creazione lobby ────────────────────────────────────
    createButton.addEventListener("click", () => {
        const lobbyName    = lobbyNameInput.value.trim();
        const isPrivate    = privateCheckbox.checked;
        const lobbyPassword = passwordInput.value.trim();

        // Valida: se privata, la password è obbligatoria
        if (isPrivate && !lobbyPassword) {
            passwordInput.style.border = "2px solid #f55";
            passwordInput.focus();
            return;
        }

        state.mainSocket.emit("createLobby", {
            name:     lobbyName,
            private:  isPrivate,
            password: isPrivate ? lobbyPassword : null,
        });
    });

    // ── Separatore visivo ──────────────────────────────────────────
    const separator = document.createElement("div");
    separator.textContent = "── or join an existing lobby ──";
    separator.style.cssText = `color: rgba(255,255,255,0.3); font-family: monospace; font-size: ${scaledPx(13)};`;
    container.appendChild(separator);

    // ── Lista lobby (aggiornabile) ─────────────────────────────────
    const lobbyListContainer = document.createElement("div");
    lobbyListContainer.id    = "lobby-list";
    lobbyListContainer.style.cssText = `
        width:          100%;
        display:        flex;
        flex-direction: column;
        gap:            ${Math.round(6 * uiScale)}px;
        max-height:     50vh;
        overflow-y:     auto;
    `;

    renderLobbyListItems(lobbyListContainer, cachedLobbyList, uiScale);
    container.appendChild(lobbyListContainer);

    // ── Riga inferiore: STATS + auth ──────────────────────────────
    const bottomRow = document.createElement("div");
    bottomRow.style.cssText = `display:flex; gap:${Math.round(8*uiScale)}px; width:100%; margin-top:${Math.round(4*uiScale)}px;`;

    function creaBottomBtn(label, fg) {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.style.cssText = `
            flex: 1; padding: ${Math.round(9*uiScale)}px;
            background: transparent; color: ${fg};
            font-size: ${scaledPx(13)}; font-family: monospace; letter-spacing: 1px;
            border: 1px solid ${fg}; border-radius: 6px; cursor: pointer;
        `;
        return btn;
    }

    const howToPlayBtn = creaBottomBtn("HOW TO PLAY", "rgba(255,200,0,0.85)");
    howToPlayBtn.addEventListener("click", () => mostraHowToPlay(container));
    bottomRow.appendChild(howToPlayBtn);

    const statsBtn = creaBottomBtn("STATS", "rgba(0,200,255,0.8)");
    statsBtn.addEventListener("click", () => {
        if (_mostraStats) _mostraStats(container);
    });
    bottomRow.appendChild(statsBtn);

    if (state.accountUsername) {
        const logoutBtn = creaBottomBtn("LOGOUT", "rgba(220,80,80,0.8)");
        logoutBtn.addEventListener("click", async () => {
            if (_logoutFn) await _logoutFn();
            state.accountUsername = null;
            state.accountLivello  = 1;
            state.accountXp       = 0;
            state.accountKills    = 0;
            state.accountMorti    = 0;
            mostraSchermataLobby();
        });
        bottomRow.appendChild(logoutBtn);
    } else {
        const loginBtn    = creaBottomBtn("LOGIN",    "rgba(0,200,255,0.8)");
        const registerBtn = creaBottomBtn("REGISTER", "rgba(0,255,100,0.8)");
        loginBtn.addEventListener("click",    () => { if (_mostraAuth) _mostraAuth("login");    });
        registerBtn.addEventListener("click", () => { if (_mostraAuth) _mostraAuth("register"); });
        bottomRow.appendChild(loginBtn);
        bottomRow.appendChild(registerBtn);
    }

    container.appendChild(bottomRow);

    // Mostra username loggato se presente
    if (state.accountUsername) {
        const userLabel = document.createElement("div");
        userLabel.textContent = `${state.accountUsername}  ·  Lv.${state.accountLivello || 1}`;
        userLabel.style.cssText = `color:rgba(0,200,255,0.7); font-family:monospace; font-size:${scaledPx(13)}; text-align:center;`;
        container.appendChild(userLabel);
    }

    document.body.appendChild(container);
    setCurrentContainer(container);

    // Focus automatico sull'input nome lobby
    setTimeout(() => lobbyNameInput.focus(), 50);
}

// ============================================================
// RENDER LISTA LOBBY
// ============================================================

/**
 * Popola il container HTML con le card delle lobby disponibili.
 * Chiamata sia al mount iniziale che ad ogni aggiornamento ricevuto.
 *
 * @param {HTMLElement} container   - Il div#lobby-list da popolare
 * @param {Array}       lobbyList   - Array di { id, name, players, max, private }
 * @param {number}      uiScale     - Fattore di scala UI
 */
function renderLobbyListItems(container, lobbyList, uiScale = 1) {
    const scaledPx = (n) => `${Math.max(10, Math.round(n * uiScale))}px`;
    container.innerHTML = ""; // pulisce le card precedenti

    // Stato vuoto
    if (!lobbyList || !lobbyList.length) {
        const emptyMessage = document.createElement("div");
        emptyMessage.textContent  = "No lobbies available. Create one!";
        emptyMessage.style.cssText = `
            color:       rgba(255, 255, 255, 0.4);
            font-family: monospace;
            font-size:   ${scaledPx(14)};
            text-align:  center;
            padding:     ${Math.round(16 * uiScale)}px;
        `;
        container.appendChild(emptyMessage);
        return;
    }

    for (const lobby of lobbyList) {
        const isFull = lobby.players >= lobby.max;

        // ── Card della lobby ───────────────────────────────────────
        const card = document.createElement("div");
        card.style.cssText = `
            display:          flex;
            flex-direction:   column;
            gap:              6px;
            background:       rgba(255, 255, 255, 0.07);
            border-radius:    8px;
            padding:          ${Math.round(10 * uiScale)}px ${Math.round(14 * uiScale)}px;
            border:           1px solid rgba(255, 255, 255, ${isFull ? "0.1" : lobby.private ? "0.35" : "0.2"});
            opacity:          ${isFull ? "0.55" : "1"};
        `;

        // Riga principale: info sinistra + pulsante destra
        const mainRow = document.createElement("div");
        mainRow.style.cssText = "display: flex; align-items: center; justify-content: space-between;";

        // Colonna info (nome + contatore giocatori)
        const infoColumn = document.createElement("div");
        infoColumn.style.cssText = "display: flex; flex-direction: column; gap: 3px;";

        const nameElement = document.createElement("span");
        const lobbyDisplayName = lobby.name || lobby.id;
        const privateBadge = lobby.private
            ? `<span style="color:rgb(255,170,50);background:rgba(255,150,0,0.15);border:1px solid rgba(255,150,0,0.3);border-radius:3px;padding:0 5px;font-size:0.8em;margin-right:5px;letter-spacing:1px">PRIV</span>`
            : "";
        nameElement.innerHTML = privateBadge + lobbyDisplayName;
        nameElement.style.cssText = `
            color:       ${lobby.private ? "#ffd080" : "white"};
            font-family: monospace;
            font-size:   ${scaledPx(16)};
            font-weight: bold;
        `;

        const playersElement = document.createElement("span");
        playersElement.textContent = `${lobby.players}/${lobby.max} players${isFull ? " — FULL" : ""}`;
        playersElement.style.cssText = `
            color:       ${isFull ? "#f88" : "#8f8"};
            font-family: monospace;
            font-size:   ${scaledPx(13)};
        `;

        infoColumn.appendChild(nameElement);
        infoColumn.appendChild(playersElement);

        // Pulsante ENTRA
        const joinButton = document.createElement("button");
        joinButton.textContent = "JOIN";
        joinButton.disabled    = isFull;
        joinButton.style.cssText = `
            padding:     ${Math.round(8 * uiScale)}px ${Math.round(16 * uiScale)}px;
            background:  ${isFull ? "rgba(100,100,100,0.5)" : lobby.private ? "rgb(180,100,0)" : "rgb(0,120,200)"};
            color:       white;
            font-size:   ${scaledPx(15)};
            font-weight: bold;
            border:      none;
            border-radius: 6px;
            cursor:      ${isFull ? "not-allowed" : "pointer"};
            font-family: monospace;
        `;

        mainRow.appendChild(infoColumn);
        mainRow.appendChild(joinButton);
        card.appendChild(mainRow);

        // ── Lobby privata: mostra campo password al click ──────────
        if (lobby.private && !isFull) {
            const passwordRow = document.createElement("div");
            passwordRow.style.cssText = "display: none; flex; gap: 6px; align-items: center;";

            const passwordField = document.createElement("input");
            passwordField.type        = "password";
            passwordField.placeholder = "Enter password...";
            passwordField.style.cssText = `
                flex:       1;
                padding:    7px 10px;
                background: rgba(255, 255, 255, 0.08);
                border:     2px solid rgba(255, 150, 0, 0.5);
                border-radius: 6px;
                color:      white;
                font-size:  ${scaledPx(14)};
                font-family: monospace;
                outline:    none;
            `;

            const confirmButton = document.createElement("button");
            confirmButton.textContent = "OK";
            confirmButton.style.cssText = `
                padding:    7px 14px;
                background: rgb(180, 100, 0);
                color:      white;
                font-size:  ${scaledPx(14)};
                font-weight: bold;
                border:     none;
                border-radius: 6px;
                cursor:     pointer;
                font-family: monospace;
            `;

            const doJoinWithPassword = () => {
                state.mainSocket.emit("joinLobby", { lobbyId: lobby.id, password: passwordField.value });
            };

            confirmButton.addEventListener("click", doJoinWithPassword);
            passwordField.addEventListener("keydown", (e) => { if (e.key === "Enter") doJoinWithPassword(); });

            // Mostra il campo password quando si clicca ENTRA
            joinButton.addEventListener("click", () => {
                passwordRow.style.display = "flex";
                passwordField.focus();
            });

            passwordRow.appendChild(passwordField);
            passwordRow.appendChild(confirmButton);
            card.appendChild(passwordRow);

        // ── Lobby pubblica: join diretto ───────────────────────────
        } else if (!isFull) {
            joinButton.addEventListener("click", () => {
                state.mainSocket.emit("joinLobby", { lobbyId: lobby.id });
            });
        }

        container.appendChild(card);
    }
}

// ============================================================
// EVENTI SOCKET — aggiornamenti real-time lista lobby
// ============================================================

/**
 * Registra gli handler per gli eventi Socket.IO relativi alle lobby.
 * Deve essere chiamata una sola volta all'avvio.
 */
export function registraEventiLobby() {

    // ── Aggiornamento lista lobby ──────────────────────────────────
    state.mainSocket.on("lobbyList", (updatedList) => {
        cachedLobbyList = updatedList;

        // Se la schermata lobby è visibile, aggiorna il DOM in real-time
        if (state.inLobbyScreen) {
            const listElement = document.getElementById("lobby-list");
            if (listElement) {
                const uiScale = Math.min(1, Math.min(window.innerWidth, window.innerHeight * 16 / 9) / 520);
                renderLobbyListItems(listElement, updatedList, uiScale);
            }
        }
    });

    // ── Errore (lobby piena, password errata, ecc.) ────────────────
    state.mainSocket.on("lobbyError", (errorMessage) => {
        if (state.inLobbyScreen) mostraSchermataLobby(errorMessage);
    });

    // ── Lobby creata con successo → connettiti ─────────────────────
    state.mainSocket.on("lobbyCreated", ({ lobbyId, lobbyName }) => {
        connectToLobby(lobbyId, lobbyName, null);
    });

    // ── Join lobby accettato → connettiti ──────────────────────────
    state.mainSocket.on("lobbyJoinOk", ({ lobbyId, lobbyName }) => {
        connectToLobby(lobbyId, lobbyName, null);
    });
}

// ============================================================
// HOW TO PLAY — Tutorial overlay
// ============================================================

/**
 * Mostra la schermata tutorial con controlli, armi, XP e regole.
 * Può essere aperta sia dalla lobby che dal menu di spawn.
 * @param {HTMLElement|null} parentContainer - Container da ripristinare alla chiusura
 */
export function mostraHowToPlay(parentContainer) {
    if (parentContainer) parentContainer.style.display = "none";

    const uiScale  = Math.min(1, Math.min(window.innerWidth, window.innerHeight * 16 / 9) / 520);
    const sp       = (n) => `${Math.max(9, Math.round(n * uiScale))}px`;

    // ── Overlay sfondo ─────────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; inset: 0;
        background: rgba(5,10,20,0.97);
        display: flex; flex-direction: column; align-items: center;
        justify-content: flex-start;
        padding: ${sp(24)} ${sp(16)} ${sp(24)};
        z-index: 99999; font-family: monospace; color: white;
        overflow-y: auto; box-sizing: border-box;
    `;

    // ── Titolo ─────────────────────────────────────────────────────
    const title = document.createElement("div");
    title.textContent = "HOW TO PLAY";
    title.style.cssText = `
        font-size: ${sp(28)}; color: rgb(255,200,0);
        letter-spacing: 4px; margin-bottom: ${sp(18)};
        text-align: center;
    `;
    overlay.appendChild(title);

    // ── Contenuto principale ───────────────────────────────────────
    const body = document.createElement("div");
    body.style.cssText = `
        width: min(92vw, ${Math.round(560 * uiScale)}px);
        display: flex; flex-direction: column; gap: ${sp(14)};
    `;

    // section colors map: icon tag -> accent color
    const sectionColors = {
        "[>]":   "rgb(0,255,100)",
        "[KB]":  "rgb(255,220,80)",
        "[MOB]": "rgb(80,200,255)",
        "[GUN]": "rgb(255,120,80)",
        "[HP]":  "rgb(220,60,60)",
        "[XP]":  "rgb(255,200,0)",
        "[LBY]": "rgb(100,180,255)",
        "[!]":   "rgb(180,100,255)",
    };

    // Helper -- crea un blocco sezione con titolo colorato + contenuto
    function section(icon, heading, contentHTML) {
        const accentColor = sectionColors[icon] || "rgb(255,200,0)";
        const wrap = document.createElement("div");
        wrap.style.cssText = `
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.09);
            border-left: 3px solid ${accentColor};
            border-radius: 8px;
            padding: ${sp(12)} ${sp(16)};
        `;
        const h = document.createElement("div");
        h.innerHTML = `<span style="color:${accentColor};font-weight:bold;font-size:${sp(12)};letter-spacing:1px;opacity:0.8">${icon}</span>
            <span style="color:${accentColor};letter-spacing:2px;font-size:${sp(13)};font-weight:bold"> ${heading}</span>`;
        h.style.cssText = `margin-bottom:${sp(8)}; font-size:${sp(13)};`;
        wrap.appendChild(h);
        const c = document.createElement("div");
        c.innerHTML = contentHTML;
        c.style.cssText = `font-size:${sp(13)}; line-height:1.75; color:rgba(255,255,255,0.82);`;
        wrap.appendChild(c);
        return wrap;
    }

    // Helper — riga tasto → descrizione
    function row(key, desc, keyColor = "rgb(255,220,80)") {
        return `<div style="display:flex;align-items:baseline;gap:${sp(8)};margin-bottom:${sp(3)}">
            <span style="color:${keyColor};min-width:${sp(90)};display:inline-block;font-weight:bold">${key}</span>
            <span>${desc}</span>
        </div>`;
    }

    // ── GOAL ──────────────────────────────────────────────────────
    body.appendChild(section("[>]", "GOAL",
        `Eliminate other players in real-time multiplayer matches.
        Up to <b style="color:#8f8">8 players</b> per lobby.
        There are no rounds — respawn and keep fighting!`
    ));

    // ── KEYBOARD CONTROLS ─────────────────────────────────────────
    body.appendChild(section("[KB]", "KEYBOARD CONTROLS",
        row("W A S D", "Move your character") +
        row("Mouse", "Aim in any direction") +
        row("Left Click", "Shoot / punch") +
        row("1", "Switch to Rifle (30 ammo)") +
        row("2", "Switch to Pistol (15 ammo)") +
        row("3", "Switch to Fists (melee, infinite)") +
        row("R", "Reload manually") +
        row("ESC  (hold 1.5s)", "Respawn — return to spawn menu<br><span style=\"color:rgba(255,255,255,0.45);font-size:${sp(11)}\">This does NOT count as a death.</span>")
    ));

    // ── MOBILE CONTROLS ──────────────────────────────────────────
    body.appendChild(section("[MOB]", "MOBILE CONTROLS",
        row("Left joystick", "Move your character") +
        row("Right joystick", "Aim + auto-fire when active") +
        row("AR / PI / FI buttons", "Switch weapon") +
        row("R button", "Reload")
    ));

    // ── WEAPONS ───────────────────────────────────────────────────
    body.appendChild(section("[GUN]", "WEAPONS",
        `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:${sp(4)} ${sp(6)};margin-top:${sp(4)}">
            <span style="color:rgb(255,200,0)">Weapon</span>
            <span style="color:rgb(255,200,0)">Ammo</span>
            <span style="color:rgb(255,200,0)">Damage</span>
            <span style="color:rgb(255,200,0)">Fire rate</span>
            <span style="color:rgb(255,200,0)">Reload</span>
            <span>Rifle</span><span>30</span><span>25 HP</span><span>Fast (100ms)</span><span>2.0s</span>
            <span>Pistol</span><span>15</span><span>15 HP</span><span>Medium (200ms)</span><span>1.5s</span>
            <span>Fists</span><span>∞</span><span style="color:#f88">100 HP</span><span>200ms</span><span>—</span>
        </div>
        <div style="margin-top:${sp(8)};color:rgba(255,255,255,0.55);font-size:${sp(11)}">
            NOTE: Fists hit in a 60px cone (±90°) in front of you. One hit kill.
        </div>`
    ));

    // ── HP & HEALING ─────────────────────────────────────────────
    body.appendChild(section("[HP]", "HP & HEALING",
        `Every player starts with <b style="color:#8f8">100 HP</b>.<br>
        If you take no damage for <b style="color:#ff8">4 seconds</b>, you automatically
        regenerate <b style="color:#8f8">+8 HP per second</b> until full.`
    ));

    // ── XP & LEVELS ──────────────────────────────────────────────
    body.appendChild(section("[XP]", "XP & LEVELS",
        row("+10 XP", "per kill", "rgb(255,200,0)") +
        row("+2 XP",  "per match played (first spawn only)", "rgb(255,200,0)") +
        `<div style="margin-top:${sp(6)}">
            Level formula: <span style="color:rgb(255,200,0)">Level = floor(XP / 100) + 1</span><br>
            <span style="color:rgba(255,255,255,0.5);font-size:${sp(11)}">
                XP and stats are only saved for registered accounts, not guests.
            </span>
        </div>`
    ));

    // ── LOBBY ─────────────────────────────────────────────────────
    body.appendChild(section("[LBY]", "LOBBY",
        row("Public lobby", "Anyone can join with one click", "rgb(100,200,255)") +
        row("Private lobby", "Requires a password to join", "rgb(255,180,80)") +
        `<div style="margin-top:${sp(6)};color:rgba(255,255,255,0.55);font-size:${sp(11)}">
            If you disconnect, you have <b style="color:#ff8">5 minutes</b> to rejoin
            the same lobby and keep your session stats.
        </div>`
    ));

    // ── DEATHS & SELFKILL ─────────────────────────────────────────
    body.appendChild(section("[!]", "DEATHS",
        `<div>Only deaths caused by <b style="color:#f88">other players</b> count toward your death total.</div>
        <div style="margin-top:${sp(5)}">Using <b style="color:rgb(255,220,80)">ESC (hold)</b> to respawn voluntarily
        does <b style="color:#8f8">NOT</b> add a death to your stats.</div>`
    ));

    overlay.appendChild(body);

    // ── Bottone CLOSE ─────────────────────────────────────────────
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "← BACK";
    closeBtn.style.cssText = `
        margin-top: ${sp(20)};
        padding: ${sp(11)} ${sp(32)};
        background: transparent; color: rgba(255,255,255,0.6);
        font-size: ${sp(14)}; font-family: monospace;
        border: 1px solid rgba(255,255,255,0.25);
        border-radius: 6px; cursor: pointer; letter-spacing: 1px;
    `;
    closeBtn.addEventListener("click", () => {
        overlay.remove();
        if (parentContainer) parentContainer.style.display = "flex";
    });
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
}