// ========================
// MENU IN-GAME (schermata spawn)
// ========================
import { state, GAME_W, GAME_H, hx, hy, hs, calcolaLetterbox } from "./state.js";

// Riferimento all'array uiLayer e alle funzioni di UI — iniettati da main.js
let _uiLayer = null;
let _nascondiElementiHTML = null;
let _distruggiUI = null;
let _htmlContainer = null;
let _setHtmlContainer = null;

export function initMenu(uiLayer, nascondiElementiHTML, distruggiUI, getHtmlContainer, setHtmlContainer) {
    _uiLayer = uiLayer;
    _nascondiElementiHTML = nascondiElementiHTML;
    _distruggiUI = distruggiUI;
    _setHtmlContainer = setHtmlContainer;
}

export function mostraMenu(sottotitolo) {
    _distruggiUI();
    state.inMenu = true; state.inLobbyScreen = false;

    const cx = hx(GAME_W / 2), cy = hy(GAME_H / 2);
    const sc = calcolaLetterbox().scale;

    _uiLayer.push(add([rect(width(), height()), pos(0, 0), color(rgb(5, 10, 5)), opacity(0.88), fixed(), z(200)]));
    _uiLayer.push(add([text("SHOOTER ONLINE", { size: hs(52) }), pos(cx, hy(GAME_H / 2 - 140)), anchor("center"), color(rgb(0, 255, 100)), fixed(), z(201)]));
    if (state.myNickname) _uiLayer.push(add([text(state.myNickname, { size: hs(22) }), pos(cx, hy(GAME_H / 2 - 70)), anchor("center"), color(rgb(0, 200, 255)), fixed(), z(201)]));
    if (state.myLobbyName) _uiLayer.push(add([text(`Lobby: ${state.myLobbyName}`, { size: hs(16) }), pos(cx, hy(GAME_H / 2 - 40)), anchor("center"), color(rgb(180, 180, 180)), fixed(), z(201)]));
    if (sottotitolo) _uiLayer.push(add([text(sottotitolo, { size: hs(26) }), pos(cx, hy(GAME_H / 2 - 8)), anchor("center"), color(rgb(220, 80, 80)), fixed(), z(201)]));

    const bW = Math.round(220 * sc), bH = Math.round(60 * sc);
    const bH2 = Math.round(40 * sc);
    const gap = Math.round(12 * sc);
    const topOffset = Math.round(60 * sc);

    const container = document.createElement("div");
    container.style.cssText = `position:fixed;left:${cx}px;top:${hy(GAME_H / 2) + topOffset}px;
        transform:translate(-50%,0);display:flex;flex-direction:column;
        align-items:center;gap:${gap}px;z-index:9999;`;

    const btn = document.createElement("button");
    btn.textContent = "PLAY";
    btn.style.cssText = `width:${bW}px;height:${bH}px;background:rgb(0,180,70);color:white;
        font-size:${Math.round(30 * sc)}px;font-weight:bold;border:none;border-radius:6px;
        cursor:pointer;font-family:monospace;letter-spacing:2px;`;
    btn.addEventListener("click", () => {
        _nascondiElementiHTML();
        _distruggiUI();
        state.socket.emit("spawn");
    });

    const backBtn = document.createElement("button");
    backBtn.textContent = "← Change Lobby";
    backBtn.style.cssText = `width:${bW}px;height:${bH2}px;background:rgba(255,255,255,0.1);
        color:rgba(255,255,255,0.7);font-size:${Math.round(15 * sc)}px;
        border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;font-family:monospace;`;
    backBtn.addEventListener("click", () => {
        localStorage.removeItem("lobbyId");
        localStorage.removeItem("lobbyName");
        localStorage.removeItem("lobbyToken");
        if (state.socket) state.socket.disconnect();
        location.reload();
    });

    container.appendChild(btn);
    container.appendChild(backBtn);
    document.body.appendChild(container);
    _setHtmlContainer(container);
    setTimeout(() => btn.focus(), 50);
}