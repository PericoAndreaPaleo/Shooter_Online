// ========================
// SCHERMATA SELEZIONE LOBBY
// ========================
import { state, GAME_W, GAME_H, hx, hy, hs } from "./state.js";

let _uiLayer = null;
let _distruggiUI = null;
let _setHtmlContainer = null;
let _nascondiElementiHTML = null;
let _connettiALobby = null;

export let lobbyListData = [];

export function initLobby(uiLayer, distruggiUI, nascondiElementiHTML, setHtmlContainer, connettiALobby) {
    _uiLayer            = uiLayer;
    _distruggiUI        = distruggiUI;
    _nascondiElementiHTML = nascondiElementiHTML;
    _setHtmlContainer   = setHtmlContainer;
    _connettiALobby     = connettiALobby;
}

export function mostraSchermataLobby(errorMsg) {
    _distruggiUI();
    state.inMenu = true; state.inLobbyScreen = true;
    _uiLayer.push(add([rect(width(), height()), pos(0, 0), color(rgb(5, 10, 20)), opacity(0.97), fixed(), z(200)]));
    _uiLayer.push(add([text("SHOOTER ONLINE", { size: hs(46) }), pos(hx(GAME_W / 2), hy(54)), anchor("center"), color(rgb(0, 255, 100)), fixed(), z(201)]));

    const S  = Math.min(1, Math.min(window.innerWidth, window.innerHeight * 16 / 9) / 520);
    const fs = (n) => `${Math.max(10, Math.round(n * S))}px`;

    const container = document.createElement("div");
    container.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
        display:flex;flex-direction:column;align-items:center;gap:${Math.round(10 * S)}px;
        z-index:9999;width:min(520px,92vw);`;

    if (errorMsg) {
        const e = document.createElement("div");
        e.textContent = errorMsg;
        e.style.cssText = `color:#f55;font-size:${fs(15)};font-family:monospace;text-align:center;`;
        container.appendChild(e);
    }

    // Riga nome + crea
    const row = document.createElement("div");
    row.style.cssText = `display:flex;gap:${Math.round(8 * S)}px;width:100%;`;
    const nameInput = document.createElement("input");
    nameInput.placeholder = "Lobby name (optional)";
    nameInput.maxLength   = 30;
    nameInput.style.cssText = `flex:1;padding:${Math.round(10 * S)}px ${Math.round(12 * S)}px;
        background:rgba(255,255,255,0.08);border:2px solid rgba(0,255,100,0.4);
        border-radius:6px;color:white;font-size:${fs(16)};font-family:monospace;outline:none;`;
    const createBtn = document.createElement("button");
    createBtn.textContent = "+ CREA";
    createBtn.style.cssText = `padding:${Math.round(10 * S)}px ${Math.round(16 * S)}px;
        background:rgb(0,160,70);color:white;font-size:${fs(16)};font-weight:bold;
        border:none;border-radius:6px;cursor:pointer;font-family:monospace;white-space:nowrap;`;
    row.appendChild(nameInput); row.appendChild(createBtn);
    container.appendChild(row);

    // Opzioni: privata + password
    const optRow = document.createElement("div");
    optRow.style.cssText = `display:flex;align-items:center;gap:${Math.round(10 * S)}px;width:100%;`;

    const privLabel = document.createElement("label");
    privLabel.style.cssText = `display:flex;align-items:center;gap:6px;color:rgba(255,255,255,0.7);font-family:monospace;font-size:${fs(14)};cursor:pointer;white-space:nowrap;`;
    const privCheck = document.createElement("input");
    privCheck.type = "checkbox";
    privCheck.style.cssText = "width:16px;height:16px;cursor:pointer;accent-color:#e93;";
    privLabel.appendChild(privCheck);
    privLabel.appendChild(document.createTextNode("🔒 Private"));

    const pwdInput = document.createElement("input");
    pwdInput.type        = "password";
    pwdInput.placeholder = "Password";
    pwdInput.maxLength   = 30;
    pwdInput.style.cssText = `flex:1;padding:${Math.round(8 * S)}px ${Math.round(10 * S)}px;
        background:rgba(255,255,255,0.08);border:2px solid rgba(255,150,0,0.4);
        border-radius:6px;color:white;font-size:${fs(14)};font-family:monospace;outline:none;display:none;`;

    privCheck.addEventListener("change", () => {
        pwdInput.style.display = privCheck.checked ? "block" : "none";
        if (privCheck.checked) pwdInput.focus();
    });

    optRow.appendChild(privLabel); optRow.appendChild(pwdInput);
    container.appendChild(optRow);

    createBtn.addEventListener("click", () => {
        const name      = nameInput.value.trim();
        const isPrivate = privCheck.checked;
        const pwd       = pwdInput.value.trim();
        if (isPrivate && !pwd) { pwdInput.style.border = "2px solid #f55"; pwdInput.focus(); return; }
        state.mainSocket.emit("createLobby", { name, private: isPrivate, password: isPrivate ? pwd : null });
    });

    const sep = document.createElement("div");
    sep.textContent = "── or join an existing lobby ──";
    sep.style.cssText = `color:rgba(255,255,255,0.3);font-family:monospace;font-size:${fs(13)};`;
    container.appendChild(sep);

    const listEl = document.createElement("div");
    listEl.id = "lobby-list";
    listEl.style.cssText = `width:100%;display:flex;flex-direction:column;gap:${Math.round(6 * S)}px;max-height:50vh;overflow-y:auto;`;
    renderLobbyList(listEl, lobbyListData, S);
    container.appendChild(listEl);

    document.body.appendChild(container);
    _setHtmlContainer(container);
    setTimeout(() => nameInput.focus(), 50);
}

export function renderLobbyList(container, list, S = 1) {
    const fs = (n) => `${Math.max(10, Math.round(n * S))}px`;
    container.innerHTML = "";
    if (!list || !list.length) {
        const e = document.createElement("div");
        e.textContent = "No lobbies available. Create one!";
        e.style.cssText = `color:rgba(255,255,255,0.4);font-family:monospace;font-size:${fs(14)};text-align:center;padding:${Math.round(16 * S)}px;`;
        container.appendChild(e); return;
    }
    for (const l of list) {
        const full = l.players >= l.max;
        const row  = document.createElement("div");
        row.style.cssText = `display:flex;flex-direction:column;gap:6px;
            background:rgba(255,255,255,0.07);border-radius:8px;
            padding:${Math.round(10 * S)}px ${Math.round(14 * S)}px;
            border:1px solid rgba(255,255,255,${full ? "0.1" : l.private ? "0.35" : "0.2"});
            opacity:${full ? "0.55" : "1"};`;

        const mainRow = document.createElement("div");
        mainRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;";

        const info = document.createElement("div");
        info.style.cssText = "display:flex;flex-direction:column;gap:3px;";
        const nameEl = document.createElement("span");
        nameEl.textContent = (l.private ? "🔒 " : "") + (l.name || l.id);
        nameEl.style.cssText = `color:${l.private ? "#ffa" : "white"};font-family:monospace;font-size:${fs(16)};font-weight:bold;`;
        const countEl = document.createElement("span");
        countEl.textContent = `${l.players}/${l.max} players${full ? " — FULL" : ""}`;
        countEl.style.cssText = `color:${full ? "#f88" : "#8f8"};font-family:monospace;font-size:${fs(13)};`;
        info.appendChild(nameEl); info.appendChild(countEl);

        const btn = document.createElement("button");
        btn.textContent = "ENTRA"; btn.disabled = full;
        btn.style.cssText = `padding:${Math.round(8 * S)}px ${Math.round(16 * S)}px;
            background:${full ? "rgba(100,100,100,0.5)" : l.private ? "rgb(180,100,0)" : "rgb(0,120,200)"};
            color:white;font-size:${fs(15)};font-weight:bold;border:none;border-radius:6px;
            cursor:${full ? "not-allowed" : "pointer"};font-family:monospace;`;

        mainRow.appendChild(info); mainRow.appendChild(btn);
        row.appendChild(mainRow);

        if (l.private && !full) {
            const pwdRow = document.createElement("div");
            pwdRow.style.cssText = "display:none;flex;gap:6px;align-items:center;";
            const pwdInput = document.createElement("input");
            pwdInput.type = "password"; pwdInput.placeholder = "Enter password...";
            pwdInput.style.cssText = `flex:1;padding:7px 10px;background:rgba(255,255,255,0.08);
                border:2px solid rgba(255,150,0,0.5);border-radius:6px;color:white;
                font-size:${fs(14)};font-family:monospace;outline:none;`;
            const confirmBtn = document.createElement("button");
            confirmBtn.textContent = "OK";
            confirmBtn.style.cssText = `padding:7px 14px;background:rgb(180,100,0);color:white;
                font-size:${fs(14)};font-weight:bold;border:none;border-radius:6px;cursor:pointer;font-family:monospace;`;

            const doJoin = () => state.mainSocket.emit("joinLobby", { lobbyId: l.id, password: pwdInput.value });
            confirmBtn.addEventListener("click", doJoin);
            pwdInput.addEventListener("keydown", e => { if (e.key === "Enter") doJoin(); });
            btn.addEventListener("click", () => { pwdRow.style.display = "flex"; pwdInput.focus(); });

            pwdRow.appendChild(pwdInput); pwdRow.appendChild(confirmBtn);
            row.appendChild(pwdRow);
        } else if (!full) {
            btn.addEventListener("click", () => state.mainSocket.emit("joinLobby", { lobbyId: l.id }));
        }

        container.appendChild(row);
    }
}

export function registraEventiLobby() {
    state.mainSocket.on("lobbyList", (list) => {
        lobbyListData = list;
        if (state.inLobbyScreen) {
            const el = document.getElementById("lobby-list");
            const S  = Math.min(1, Math.min(window.innerWidth, window.innerHeight * 16 / 9) / 520);
            if (el) renderLobbyList(el, list, S);
        }
    });

    state.mainSocket.on("lobbyError",   (msg) => { if (state.inLobbyScreen) mostraSchermataLobby(msg); });
    state.mainSocket.on("lobbyCreated", ({ lobbyId, lobbyName }) => { _connettiALobby(lobbyId, lobbyName, null); });
    state.mainSocket.on("lobbyJoinOk",  ({ lobbyId, lobbyName }) => { _connettiALobby(lobbyId, lobbyName, null); });
}