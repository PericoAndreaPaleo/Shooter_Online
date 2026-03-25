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

/** Cache locale dell'ultima lista lobby ricevuta dal server */
let cachedLobbyList = [];

/**
 * Inizializza il modulo lobby con le dipendenze di main.js.
 *
 * @param {Array}    uiLayer            - Array degli oggetti Kaboom UI
 * @param {function} distruggiUI        - Cleanup totale del layer UI
 * @param {function} nascondiElementiHTML - Rimuove il container HTML corrente
 * @param {function} setHtmlContainer   - Registra il container HTML attivo
 * @param {function} connettiALobby     - Connette al namespace della lobby scelta
 */
export function initLobby(uiLayer, distruggiUI, nascondiElementiHTML, setHtmlContainer, connettiALobby) {
    uiElementsArray     = uiLayer;
    destroyAllUI        = distruggiUI;
    hideHTMLOverlay     = nascondiElementiHTML;
    setCurrentContainer = setHtmlContainer;
    connectToLobby      = connettiALobby;
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
    createButton.textContent = "+ CREA";
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
    privateLabel.appendChild(document.createTextNode("🔒 Private"));

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
        nameElement.textContent = (lobby.private ? "🔒 " : "") + (lobby.name || lobby.id);
        nameElement.style.cssText = `
            color:       ${lobby.private ? "#ffa" : "white"};
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
        joinButton.textContent = "ENTRA";
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