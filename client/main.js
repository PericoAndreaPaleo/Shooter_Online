import kaboom from "./lib/kaboom.mjs";

// ========================
// RICARICA AUTOMATICA — subito, prima di tutto
// ========================
if (!sessionStorage.getItem("reloaded")) {
    sessionStorage.setItem("reloaded", "1");
    location.reload();
}

// ========================
// RISOLUZIONE FISSA (letterbox 16:9)
// ========================
const GAME_W = 1280;
const GAME_H = 720;

function calcolaLetterbox() {
    const scaleX = window.innerWidth  / GAME_W;
    const scaleY = window.innerHeight / GAME_H;
    const scale  = Math.min(scaleX, scaleY);
    const left   = Math.round((window.innerWidth  - GAME_W * scale) / 2);
    const top    = Math.round((window.innerHeight - GAME_H * scale) / 2);
    return { scale, left, top };
}

kaboom({
    width:  window.innerWidth,
    height: window.innerHeight,
    clearColor: [0, 0, 0, 1],
    preventPauseOnBlur: true,
});

document.body.style.cursor = "crosshair";
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
function drawOverlay() { requestAnimationFrame(drawOverlay); octx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height); }

function worldToScreen(wx, wy) {
    const cam = camPos(), zoom = camScale().x;
    return {
        x: (wx - cam.x) * zoom + window.innerWidth  / 2,
        y: (wy - cam.y) * zoom + window.innerHeight / 2,
    };
}

// Coordinate touch in pixel fisici → già corrette perché canvas = schermo intero
function screenToGame(sx, sy) { return { x: sx, y: sy }; }

// ========================
// SOCKET PRINCIPALE (selezione lobby)
// ========================
const mainSocket = io();

// ========================
// STATO GLOBALE
// ========================
// Zoom calcolato in modo che tutti vedano esattamente GAME_W x GAME_H unità di mappa.
// Le bande nere vengono disegnate dentro Kaboom se lo schermo ha aspect ratio diverso da 16:9.
function calcolaZoom() {
    const { scale } = calcolaLetterbox();
    return scale;
}
let CAM_ZOOM = calcolaZoom();
window.addEventListener("resize", () => { CAM_ZOOM = calcolaZoom(); });
let socket = null;           // socket namespace della lobby
let myId = null;
let myLobbyId = null;
let myLobbyName = null;
let myToken = null;
let mapSize = { width: 5000, height: 5000 };
let cameraInizializzata = false;
let inMenu = true;
let inLobbyScreen = true;
let myNickname = "";

const players = {};
const bulletSprites = {};
const input = { left:false, right:false, up:false, down:false };
let prevInput = "";
let weapon = "gun";

const isMobile = () => navigator.maxTouchPoints > 0 || "ontouchstart" in window;

// ========================
// AUDIO
// ========================
let audioCtx = null;
const getAudio = () => { if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; };

function playSound(type, freq, endFreq, duration, waveType="square") {
    try {
        const ctx = getAudio();
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime+duration);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+duration);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime+duration);
    } catch(e){}
}
const playShootSound = () => playSound("shoot", 320, 80, 0.12);
const playHitSound   = () => playSound("hit",   600, 100, 0.15, "sawtooth");
const playKillSound  = () => playSound("kill",  880, 1100, 0.2, "sine");
function playDeathSound() {
    try {
        const ctx = getAudio();
        for (let i=0;i<3;i++) {
            const osc=ctx.createOscillator(), gain=ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 200-i*50;
            gain.gain.setValueAtTime(0.2, ctx.currentTime+i*0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+i*0.1+0.2);
            osc.start(ctx.currentTime+i*0.1); osc.stop(ctx.currentTime+i*0.1+0.2);
        }
    } catch(e){}
}

// ========================
// UI LAYER
// ========================
const uiLayer = [];
function distruggiUI() {
    nascondiElementiHTML();
    for (const o of uiLayer) destroy(o);
    uiLayer.length = 0;
    rimuoviTouchUI();
}
let htmlContainer = null;
function nascondiElementiHTML() { if (htmlContainer) { htmlContainer.remove(); htmlContainer = null; } }

// ========================
// ARMI E MANI
// ========================
let gunDrawObj = null;
function creaGunDrawObj() {
    if (gunDrawObj) destroy(gunDrawObj);
    gunDrawObj = add([pos(0,0), z(1.5), { draw() {
        if (inMenu || inLobbyScreen || !myId) return;
        for (const id in players) {
            const p = players[id];
            if (!p || p.morto || !p.dirIndicator || !p.sprite) continue;
            const angle = p.dirIndicator.angle || 0;
            const wtype = (id===myId) ? weapon : (p.dirIndicator.weapon||"gun");
            const px=p.sprite.pos.x, py=p.sprite.pos.y, R=24;
            const cos=Math.cos(angle), sin=Math.sin(angle);
            const perp={x:-sin,y:cos};
            const drawHand=(hx,hy,r)=>{
                drawCircle({pos:vec2(hx,hy),radius:r+2,color:rgb(0,0,0)});
                drawCircle({pos:vec2(hx,hy),radius:r,color:rgb(222,196,145)});
            };
            if (wtype==="fists") {
                for (const s of [-1,1]) drawHand(px+cos*(R+2)+perp.x*17*s, py+sin*(R+2)+perp.y*17*s, 8);
            } else if (wtype==="pistol") {
                drawRect({pos:vec2(px+cos*R,py+sin*R),width:30,height:9,color:rgb(17,17,17),radius:4,angle:angle*(180/Math.PI),anchor:"left",offset:vec2(0,-4.5)});
                drawHand(px+cos*(R+3),py+sin*(R+3),7);
            } else {
                drawRect({pos:vec2(px+cos*R,py+sin*R),width:60,height:9,color:rgb(17,17,17),radius:4,angle:angle*(180/Math.PI),anchor:"left",offset:vec2(0,-4.5)});
                drawHand(px+cos*(R+2)-perp.x*3, py+sin*(R+2)-perp.y*3, 7);
                drawHand(px+cos*(R+30)+perp.x*5, py+sin*(R+30)+perp.y*5, 7);
            }
        }
    }}]);
}

// ========================
// SCHERMATA SELEZIONE LOBBY
// ========================
let lobbyListData = [];

function mostraSchermataLobby(errorMsg) {
    distruggiUI();
    inMenu = true; inLobbyScreen = true;
    uiLayer.push(add([rect(width(),height()), pos(0,0), color(rgb(5,10,20)), opacity(0.97), fixed(), z(200)]));
    uiLayer.push(add([text("SHOOTER ONLINE",{size:hs(46)}), pos(hx(GAME_W/2),hy(54)), anchor("center"), color(rgb(0,255,100)), fixed(), z(201)]));

    const S = Math.min(1, Math.min(window.innerWidth, window.innerHeight*16/9) / 520);
    const fs = (n) => `${Math.max(10, Math.round(n*S))}px`;

    htmlContainer = document.createElement("div");
    htmlContainer.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
        display:flex;flex-direction:column;align-items:center;gap:${Math.round(10*S)}px;
        z-index:9999;width:min(520px,92vw);`;

    if (errorMsg) {
        const e = document.createElement("div");
        e.textContent = errorMsg;
        e.style.cssText = `color:#f55;font-size:${fs(15)};font-family:monospace;text-align:center;`;
        htmlContainer.appendChild(e);
    }

    // Riga nome + crea
    const row = document.createElement("div");
    row.style.cssText = `display:flex;gap:${Math.round(8*S)}px;width:100%;`;
    const nameInput = document.createElement("input");
    nameInput.placeholder = "Lobby name (optional)";
    nameInput.maxLength = 30;
    nameInput.style.cssText = `flex:1;padding:${Math.round(10*S)}px ${Math.round(12*S)}px;
        background:rgba(255,255,255,0.08);border:2px solid rgba(0,255,100,0.4);
        border-radius:6px;color:white;font-size:${fs(16)};font-family:monospace;outline:none;`;
    const createBtn = document.createElement("button");
    createBtn.textContent = "+ CREA";
    createBtn.style.cssText = `padding:${Math.round(10*S)}px ${Math.round(16*S)}px;
        background:rgb(0,160,70);color:white;font-size:${fs(16)};font-weight:bold;
        border:none;border-radius:6px;cursor:pointer;font-family:monospace;white-space:nowrap;`;
    row.appendChild(nameInput); row.appendChild(createBtn);
    htmlContainer.appendChild(row);

    // Riga opzioni: privata + password
    const optRow = document.createElement("div");
    optRow.style.cssText = `display:flex;align-items:center;gap:${Math.round(10*S)}px;width:100%;`;

    const privLabel = document.createElement("label");
    privLabel.style.cssText = `display:flex;align-items:center;gap:6px;color:rgba(255,255,255,0.7);font-family:monospace;font-size:${fs(14)};cursor:pointer;white-space:nowrap;`;
    const privCheck = document.createElement("input");
    privCheck.type = "checkbox";
    privCheck.style.cssText = "width:16px;height:16px;cursor:pointer;accent-color:#e93;";
    privLabel.appendChild(privCheck);
    privLabel.appendChild(document.createTextNode("🔒 Private"));

    const pwdInput = document.createElement("input");
    pwdInput.type = "password";
    pwdInput.placeholder = "Password";
    pwdInput.maxLength = 30;
    pwdInput.style.cssText = `flex:1;padding:${Math.round(8*S)}px ${Math.round(10*S)}px;
        background:rgba(255,255,255,0.08);border:2px solid rgba(255,150,0,0.4);
        border-radius:6px;color:white;font-size:${fs(14)};font-family:monospace;outline:none;
        display:none;`;

    privCheck.addEventListener("change", () => {
        pwdInput.style.display = privCheck.checked ? "block" : "none";
        if (privCheck.checked) pwdInput.focus();
    });

    optRow.appendChild(privLabel);
    optRow.appendChild(pwdInput);
    htmlContainer.appendChild(optRow);

    createBtn.addEventListener("click", () => {
        const name = nameInput.value.trim();
        const isPrivate = privCheck.checked;
        const pwd = pwdInput.value.trim();
        if (isPrivate && !pwd) { pwdInput.style.border="2px solid #f55"; pwdInput.focus(); return; }
        mainSocket.emit("createLobby", { name, private: isPrivate, password: isPrivate ? pwd : null });
    });

    const sep = document.createElement("div");
    sep.textContent = "── or join an existing lobby ──";
    sep.style.cssText = `color:rgba(255,255,255,0.3);font-family:monospace;font-size:${fs(13)};`;
    htmlContainer.appendChild(sep);

    const listEl = document.createElement("div");
    listEl.id = "lobby-list";
    listEl.style.cssText = `width:100%;display:flex;flex-direction:column;gap:${Math.round(6*S)}px;max-height:50vh;overflow-y:auto;`;
    renderLobbyList(listEl, lobbyListData, S);
    htmlContainer.appendChild(listEl);

    document.body.appendChild(htmlContainer);
    setTimeout(() => nameInput.focus(), 50);
}

function renderLobbyList(container, list, S=1) {
    const fs = (n) => `${Math.max(10, Math.round(n*S))}px`;
    container.innerHTML = "";
    if (!list || !list.length) {
        const e = document.createElement("div");
        e.textContent = "No lobbies available. Create one!";
        e.style.cssText = `color:rgba(255,255,255,0.4);font-family:monospace;font-size:${fs(14)};text-align:center;padding:${Math.round(16*S)}px;`;
        container.appendChild(e); return;
    }
    for (const l of list) {
        const full = l.players >= l.max;
        const row = document.createElement("div");
        row.style.cssText = `display:flex;flex-direction:column;gap:6px;
            background:rgba(255,255,255,0.07);border-radius:8px;
            padding:${Math.round(10*S)}px ${Math.round(14*S)}px;
            border:1px solid rgba(255,255,255,${full?"0.1":l.private?"0.35":"0.2"});
            opacity:${full?"0.55":"1"};`;

        // Riga principale: info + bottone
        const mainRow = document.createElement("div");
        mainRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;";

        const info = document.createElement("div");
        info.style.cssText = "display:flex;flex-direction:column;gap:3px;";
        const nameEl = document.createElement("span");
        nameEl.textContent = (l.private ? "🔒 " : "") + (l.name || l.id);
        nameEl.style.cssText = `color:${l.private?"#ffa":"white"};font-family:monospace;font-size:${fs(16)};font-weight:bold;`;
        const countEl = document.createElement("span");
        countEl.textContent = `${l.players}/${l.max} players${full?" — FULL":""}`;
        countEl.style.cssText = `color:${full?"#f88":"#8f8"};font-family:monospace;font-size:${fs(13)};`;
        info.appendChild(nameEl); info.appendChild(countEl);

        const btn = document.createElement("button");
        btn.textContent = "ENTRA"; btn.disabled = full;
        btn.style.cssText = `padding:${Math.round(8*S)}px ${Math.round(16*S)}px;
            background:${full?"rgba(100,100,100,0.5)":l.private?"rgb(180,100,0)":"rgb(0,120,200)"};
            color:white;font-size:${fs(15)};font-weight:bold;border:none;border-radius:6px;
            cursor:${full?"not-allowed":"pointer"};font-family:monospace;`;

        mainRow.appendChild(info); mainRow.appendChild(btn);
        row.appendChild(mainRow);

        // Se privata: campo password nascosto che appare al click di ENTRA
        if (l.private && !full) {
            const pwdRow = document.createElement("div");
            pwdRow.style.cssText = "display:none;flex;gap:6px;align-items:center;";
            const pwdInput = document.createElement("input");
            pwdInput.type = "password";
            pwdInput.placeholder = "Enter password...";
            pwdInput.style.cssText = `flex:1;padding:7px 10px;background:rgba(255,255,255,0.08);
                border:2px solid rgba(255,150,0,0.5);border-radius:6px;color:white;
                font-size:${fs(14)};font-family:monospace;outline:none;`;
            const confirmBtn = document.createElement("button");
            confirmBtn.textContent = "OK";
            confirmBtn.style.cssText = `padding:7px 14px;background:rgb(180,100,0);color:white;
                font-size:${fs(14)};font-weight:bold;border:none;border-radius:6px;cursor:pointer;font-family:monospace;`;

            const doJoin = () => mainSocket.emit("joinLobby", { lobbyId: l.id, password: pwdInput.value });
            confirmBtn.addEventListener("click", doJoin);
            pwdInput.addEventListener("keydown", e => { if (e.key==="Enter") doJoin(); });

            btn.addEventListener("click", () => {
                pwdRow.style.display = "flex";
                pwdInput.focus();
            });

            pwdRow.appendChild(pwdInput); pwdRow.appendChild(confirmBtn);
            row.appendChild(pwdRow);
        } else if (!full) {
            btn.addEventListener("click", () => mainSocket.emit("joinLobby", { lobbyId: l.id }));
        }

        container.appendChild(row);
    }
}

// Aggiorna lista in tempo reale
mainSocket.on("lobbyList", (list) => {
    lobbyListData = list;
    if (inLobbyScreen && htmlContainer) {
        const el = document.getElementById("lobby-list");
        const S = Math.min(1, Math.min(window.innerWidth, window.innerHeight*16/9) / 520);
        if (el) renderLobbyList(el, list, S);
    }
});

mainSocket.on("lobbyError", (msg) => { if (inLobbyScreen) mostraSchermataLobby(msg); });

// Risposta a "crea lobby" — connettiti al namespace
mainSocket.on("lobbyCreated", ({ lobbyId, lobbyName }) => {
    connettiALobby(lobbyId, lobbyName, null);
});

// Risposta a "join lobby" — connettiti al namespace
mainSocket.on("lobbyJoinOk", ({ lobbyId, lobbyName }) => {
    connettiALobby(lobbyId, lobbyName, null);
});

// ========================
// CONNESSIONE AL NAMESPACE DELLA LOBBY
// ========================
function connettiALobby(lobbyId, lobbyName, token) {
    // Salva in localStorage per eventuale rejoin
    localStorage.setItem("lobbyId",    lobbyId);
    localStorage.setItem("lobbyName",  lobbyName || "");
    if (token) localStorage.setItem("lobbyToken", token);

    // Connetti al namespace dedicato
    socket = io("/lobby/" + lobbyId);

    socket.on("connect", () => {
        // Manda join con eventuale token di rejoin
        const savedToken = localStorage.getItem("lobbyToken");
        socket.emit("join", { token: savedToken || null });
    });

    socket.on("lobbyFull", () => {
        socket.disconnect();
        localStorage.removeItem("lobbyId");
        localStorage.removeItem("lobbyName");
        localStorage.removeItem("lobbyToken");
        mostraSchermataLobby("Lobby full.");
    });

    socket.on("init", (data) => {
        const { id, token, map: mappa, ostacoli, lobbyId: lid, lobbyName: lname, nickname, playerCount, maxPlayers } = data;
        myId = id; myToken = token; myLobbyId = lid; myLobbyName = lname; myNickname = nickname;
        mapSize = mappa; inLobbyScreen = false;

        // Aggiorna localStorage con il nuovo token
        localStorage.setItem("lobbyToken", token);
        localStorage.setItem("lobbyId",    lid);
        localStorage.setItem("lobbyName",  lname);

        const ostacoliSopra = ostacoli.filter(o => o.type==="cespuglio"||o.type==="albero");

        // Costruisci mappa
        const spiaggia = 80;
        add([pos(-5000,-5000), rect(mappa.width+10000,mappa.height+10000), color(rgb(40,140,210)), z(-12)]);
        add([pos(-spiaggia,-spiaggia), rect(mappa.width+spiaggia*2,mappa.height+spiaggia*2), color(rgb(230,200,100)), z(-11)]);
        add([pos(0,0), rect(mappa.width,mappa.height), color(rgb(60,120,40)), z(-10)]);
        for (const o of ostacoli) {
            if (o.type==="roccia") add([pos(o.x,o.y),anchor("center"),circle(o.r),color(rgb(110,110,110)),outline(3,rgb(60,60,60)),z(2)]);
        }
        for (const o of ostacoli) {
            if (o.type==="albero") {
                add([pos(o.x,o.y),anchor("center"),circle(o.r),color(rgb(20,75,15)),outline(4,rgb(10,45,8)),z(4)]);
                add([pos(o.x,o.y),anchor("center"),circle(o.rCollisione),color(rgb(80,50,20)),z(4)]);
            }
        }
        for (const o of ostacoli) {
            if (o.type==="cespuglio") add([pos(o.x,o.y),anchor("center"),circle(o.r),color(rgb(100,200,40)),outline(2,rgb(60,140,20)),z(2)]);
        }

        aggiornaHUDStats(); aggiornaHUDArma(); aggiornaHUDLobby(); aggiornaHUDPlayers(playerCount, maxPlayers); aggiornaHUDAmmo();
        aggiornaBlackBars();
        creaGunDrawObj();
        onResize(() => { aggiornaHUDArma(); aggiornaHUDStats(); aggiornaHUDLobby(); });
        mostraMenu();
    });

    // ── Eventi di gioco ──
    socket.on("playerLeft", ({ id, nickname: n }) => {
        if (players[id]) {
            if (players[id].labelObj) destroy(players[id].labelObj);
            if (players[id].hpBar)    destroy(players[id].hpBar);
            if (players[id].sprite)   destroy(players[id].sprite);
            delete players[id];
        }
        mostraKillFeed(`${n} left the game`);
    });

    socket.on("killConfirm", ({ victim }) => {
        myKills++; aggiornaHUDStats(); mostraKillFeed(`You eliminated ${victim}!`); playKillSound();
    });

    socket.on("reloadStart", ({ weapon: w, duration }) => {
        isReloading = true;
        reloadStartTime = Date.now();
        reloadDuration  = duration;
        aggiornaHUDAmmo();
    });

    socket.on("reloadDone", ({ weapon: w }) => {
        isReloading = false;
        reloadStartTime = 0;
        reloadDuration  = 0;
        aggiornaHUDAmmo();
    });

    socket.on("state", (state) => aggiornaStato(state));
}

// ========================
// REJOIN AUTOMATICO AL CARICAMENTO
// ========================
(function tentaRejoin() {
    const savedId    = localStorage.getItem("lobbyId");
    const savedName  = localStorage.getItem("lobbyName");
    const savedToken = localStorage.getItem("lobbyToken");
    if (savedId && savedToken) {
        // Controlla se la lobby esiste ancora prima di connettersi
        mainSocket.once("lobbyList", (list) => {
            const found = list.find(l => l.id === savedId);
            if (found) {
                connettiALobby(savedId, savedName || found.name, savedToken);
            } else {
                // Lobby non esiste più, pulisci e mostra selezione
                localStorage.removeItem("lobbyId");
                localStorage.removeItem("lobbyName");
                localStorage.removeItem("lobbyToken");
                mostraSchermataLobby();
            }
        });
    } else {
        // Prima volta, aspetta la lista poi mostra
        setTimeout(() => { if (inLobbyScreen) mostraSchermataLobby(); }, 150);
    }
})();

// ========================
// MENU IN-GAME
// ========================
function mostraMenu(sottotitolo) {
    distruggiUI(); inMenu = true; inLobbyScreen = false;

    // centro della viewport di gioco in coordinate canvas fisiche
    const cx = hx(GAME_W/2), cy = hy(GAME_H/2);
    const sc = calcolaLetterbox().scale;

    uiLayer.push(add([rect(width(),height()), pos(0,0), color(rgb(5,10,5)), opacity(0.88), fixed(), z(200)]));
    uiLayer.push(add([text("SHOOTER ONLINE",{size:hs(52)}), pos(cx, hy(GAME_H/2-140)), anchor("center"), color(rgb(0,255,100)), fixed(), z(201)]));
    if (myNickname) uiLayer.push(add([text(myNickname,{size:hs(22)}), pos(cx, hy(GAME_H/2-70)), anchor("center"), color(rgb(0,200,255)), fixed(), z(201)]));
    if (myLobbyName) uiLayer.push(add([text(`Lobby: ${myLobbyName}`,{size:hs(16)}), pos(cx, hy(GAME_H/2-40)), anchor("center"), color(rgb(180,180,180)), fixed(), z(201)]));
    if (sottotitolo) uiLayer.push(add([text(sottotitolo,{size:hs(26)}), pos(cx, hy(GAME_H/2-8)), anchor("center"), color(rgb(220,80,80)), fixed(), z(201)]));

    const bW = Math.round(220*sc), bH = Math.round(60*sc);
    const bH2 = Math.round(40*sc);
    const gap = Math.round(12*sc);
    const topOffset = Math.round(60*sc);

    htmlContainer = document.createElement("div");
    htmlContainer.style.cssText = `position:fixed;left:${cx}px;top:${hy(GAME_H/2)+topOffset}px;
        transform:translate(-50%,0);display:flex;flex-direction:column;
        align-items:center;gap:${gap}px;z-index:9999;`;

    const btn = document.createElement("button");
    btn.textContent = "PLAY";
    btn.style.cssText = `width:${bW}px;height:${bH}px;background:rgb(0,180,70);color:white;
        font-size:${Math.round(30*sc)}px;font-weight:bold;border:none;border-radius:6px;
        cursor:pointer;font-family:monospace;letter-spacing:2px;`;
    btn.addEventListener("click", () => { nascondiElementiHTML(); distruggiUI(); socket.emit("spawn"); });

    const backBtn = document.createElement("button");
    backBtn.textContent = "← Change Lobby";
    backBtn.style.cssText = `width:${bW}px;height:${bH2}px;background:rgba(255,255,255,0.1);
        color:rgba(255,255,255,0.7);font-size:${Math.round(15*sc)}px;
        border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;font-family:monospace;`;
    backBtn.addEventListener("click", () => {
        localStorage.removeItem("lobbyId");
        localStorage.removeItem("lobbyName");
        localStorage.removeItem("lobbyToken");
        if (socket) socket.disconnect();
        location.reload();
    });

    htmlContainer.appendChild(btn);
    htmlContainer.appendChild(backBtn);
    document.body.appendChild(htmlContainer);
    setTimeout(() => btn.focus(), 50);
}

// ========================
// HUD
// ========================
const killFeedList = [];
let killFeedObjs = [], leaderboardObjs = [];
let hudKillsObj=null, hudWeaponObj=null, hudLobbyObj=null, hudPlayersObj=null, hudAmmoObj=null, hudReloadObj=null;
let myKills=0, myDeaths=0;
let myAmmo = { gun: 30, pistol: 15 };
let isReloading = false;
let reloadTimer = null;

// Helper: converte coordinate 1280×720 → coordinate canvas reali (con letterbox)
function hx(x) { const {scale,left} = calcolaLetterbox(); return left + x * scale; }
function hy(y) { const {scale,top}  = calcolaLetterbox(); return top  + y * scale; }
function hs(s) { const {scale}      = calcolaLetterbox(); return Math.round(s * scale); }

// Disegna un riquadro arrotondato + testo — tutto in un unico oggetto Kaboom
function hudBox(testo, px, py, opts={}) {
    const pad = opts.pad ?? 8;
    const sz  = opts.size ?? 14;
    const textCol  = opts.textCol  ?? rgb(255,255,255);
    const boxCol   = opts.boxCol   ?? rgb(0,0,0);
    const boxAlpha = opts.boxAlpha ?? 0.55;
    const radius   = opts.radius   ?? 6;
    const anchor_  = opts.anchor   ?? "topleft";
    return add([pos(px,py), fixed(), z(100), {
        _text: testo, _sz: sz, _pad: pad,
        _textCol: textCol, _boxCol: boxCol, _boxAlpha: boxAlpha, _r: radius, _anchor: anchor_,
        draw() {
            // misura testo approssimativamente (kaboom non ha measureText facile, usiamo stima)
            const charW = this._sz * 0.6;
            const tw = this._text.length * charW;
            const th = this._sz * 1.2;
            let bx = this.pos.x, by = this.pos.y;
            if (this._anchor === "right")  bx -= tw + this._pad * 2;
            if (this._anchor === "center") bx -= tw / 2 + this._pad;
            // sfondo
            drawRect({ pos: vec2(bx - this._pad, by - this._pad),
                width: tw + this._pad*2, height: th + this._pad*2,
                radius: this._r,
                color: this._boxCol, opacity: this._boxAlpha });
            // testo
            drawText({ text: this._text, pos: vec2(bx, by),
                size: this._sz, color: this._textCol });
        }
    }]);
}

// Stile unico per tutti i box HUD
const HUD_BOX   = rgb(0,0,0);
const HUD_ALPHA = 0.45;
const HUD_TEXT  = rgb(220,220,220);
const HUD_TEXT_DIM = rgb(140,140,140);
const HUD_RADIUS = 4;

// ── Weapon selector (bottom-left, desktop only) ────────────────────────────
function aggiornaHUDArma() {
    if (hudWeaponObj) destroy(hudWeaponObj);
    if (isMobile()) return;
    const names = { gun:"Rifle", pistol:"Pistol", fists:"Fists" };
    const keys  = ["gun","pistol","fists"];
    hudWeaponObj = add([fixed(), z(100), {
        draw() {
            const sz = hs(12), pad = hs(6), gap = hs(4);
            let cx = hx(10);
            const by = hy(GAME_H - 46);
            for (const k of keys) {
                const label = names[k];
                const tw = label.length * sz * 0.58 + pad*2;
                const th = sz * 1.5 + pad;
                const active = k === weapon;
                // box più opaco se attivo
                drawRect({ pos: vec2(cx, by), width: tw, height: th,
                    radius: hs(4), color: rgb(0,0,0), opacity: active ? 0.7 : 0.3 });
                // bordo sottile in alto se attivo
                if (active) drawRect({ pos: vec2(cx, by), width: tw, height: hs(2),
                    color: rgb(220,220,220), opacity: 0.9 });
                drawText({ text: label, pos: vec2(cx + pad, by + pad*0.6),
                    size: sz, color: active ? rgb(240,240,240) : rgb(100,100,100) });
                cx += tw + gap;
            }
        }
    }]);
    aggiornaHUDAmmo();
}

// ── Ammo (bottom-right) — stile "0 | 30" con sweep di ricarica ────────────
function aggiornaHUDAmmo() {
    if (hudAmmoObj) destroy(hudAmmoObj);
    if (weapon === "fists") return;
    const ammo    = myAmmo[weapon] ?? 0;
    const maxAmmo = weapon === "gun" ? 30 : 15;
    hudAmmoObj = add([fixed(), z(100), {
        draw() {
            const sz = hs(22), szSub = hs(13), pad = hs(10);
            const curStr = String(ammo);
            const maxStr = String(maxAmmo);
            const sepStr = " | ";
            const curW  = curStr.length  * sz    * 0.6;
            const sepW  = sepStr.length  * szSub * 0.6;
            const maxW  = maxStr.length  * szSub * 0.6;
            const totalW = curW + sepW + maxW + pad*2;
            const totalH = sz * 1.4 + pad;
            const bx = hx(GAME_W - 14) - totalW;
            const by = hy(GAME_H - 14) - totalH;

            // sfondo
            drawRect({ pos: vec2(bx, by), width: totalW, height: totalH,
                radius: hs(4), color: rgb(0,0,0), opacity: 0.5 });

            // sweep di ricarica — striscia luminosa che scorre da sinistra a destra
            if (isReloading && reloadDuration > 0) {
                const elapsed = Math.min(Date.now() - reloadStartTime, reloadDuration);
                const progress = elapsed / reloadDuration;
                const sweepW = Math.round(totalW * progress);
                drawRect({ pos: vec2(bx, by), width: sweepW, height: totalH,
                    radius: hs(4), color: rgb(200,200,200), opacity: 0.18 });
                // bordo luminoso al fronte dello sweep
                if (sweepW > 0 && sweepW < totalW) {
                    drawRect({ pos: vec2(bx + sweepW - hs(2), by), width: hs(2), height: totalH,
                        color: rgb(255,255,255), opacity: 0.6 });
                }
            }

            // testo colpi correnti (grande) | max (piccolo)
            const col = ammo === 0 ? rgb(200,70,70) : ammo <= maxAmmo*0.3 ? rgb(200,160,60) : rgb(220,220,220);
            let tx = bx + pad;
            drawText({ text: curStr, pos: vec2(tx, by + pad*0.5), size: sz, color: col });
            tx += curW;
            drawText({ text: sepStr, pos: vec2(tx, by + pad*0.5 + (sz-szSub)*0.5), size: szSub, color: rgb(100,100,100) });
            tx += sepW;
            drawText({ text: maxStr, pos: vec2(tx, by + pad*0.5 + (sz-szSub)*0.5), size: szSub, color: rgb(100,100,100) });

            // [R] Reload sotto il box quando vuoto
            if (ammo === 0 && !isReloading) {
                const label = "[R] Reload";
                const lsz = hs(12), lpad = hs(6);
                const lw = label.length * lsz * 0.58 + lpad*2;
                const lh = lsz * 1.4 + lpad;
                const lx = bx + (totalW - lw) / 2;
                const ly = by - lh - hs(4);
                drawRect({ pos: vec2(lx, ly), width: lw, height: lh,
                    radius: hs(4), color: rgb(0,0,0), opacity: 0.6 });
                drawText({ text: label, pos: vec2(lx + lpad, ly + lpad*0.7),
                    size: lsz, color: rgb(220,80,80) });
            }
        }
    }]);
}

function aggiornaHUDStats() {
    if (hudKillsObj) destroy(hudKillsObj);
    hudKillsObj = hudBox(`K: ${myKills}  D: ${myDeaths}`, hx(14), hy(GAME_H-30),
        { size:hs(14), textCol:HUD_TEXT, boxCol:HUD_BOX, boxAlpha:HUD_ALPHA, pad:hs(6), radius:HUD_RADIUS });
}

function aggiornaHUDLobby() {
    if (hudLobbyObj) destroy(hudLobbyObj); if (!myLobbyName) return;
    hudLobbyObj = hudBox(`Lobby: ${myLobbyName}`, hx(14), hy(10),
        { size:hs(11), textCol:HUD_TEXT_DIM, boxCol:HUD_BOX, boxAlpha:0.35, pad:hs(5), radius:HUD_RADIUS });
}

function aggiornaHUDPlayers(count, max) {
    if (hudPlayersObj) destroy(hudPlayersObj);
    hudPlayersObj = hudBox(`Players: ${count}/${max}`, hx(14), hy(30),
        { size:hs(11), textCol:HUD_TEXT_DIM, boxCol:HUD_BOX, boxAlpha:0.35, pad:hs(5), radius:HUD_RADIUS });
}

// Bande nere letterbox disegnate dentro Kaboom (z altissimo, fixed)
let blackBarsObj = null;
function aggiornaBlackBars() {
    if (blackBarsObj) destroy(blackBarsObj);
    const { scale, left, top } = calcolaLetterbox();
    const gameW = GAME_W * scale, gameH = GAME_H * scale;
    const W = window.innerWidth, H = window.innerHeight;
    blackBarsObj = add([fixed(), z(999), {
        draw() {
            const c = rgb(0,0,0);
            // banda sinistra
            if (left > 0) drawRect({ pos: vec2(0,0), width: left, height: H, color: c });
            // banda destra
            if (left > 0) drawRect({ pos: vec2(left + gameW, 0), width: left + 1, height: H, color: c });
            // banda sopra
            if (top > 0) drawRect({ pos: vec2(0,0), width: W, height: top, color: c });
            // banda sotto
            if (top > 0) drawRect({ pos: vec2(0, top + gameH), width: W, height: top + 1, color: c });
        }
    }]);
}
window.addEventListener("resize", aggiornaBlackBars);
function mostraKillFeed(msg) {
    killFeedList.unshift({ msg, timer: 3.5 });
    if (killFeedList.length > 5) killFeedList.pop();
}
function aggiornaLeaderboard(lb) {
    for (const o of leaderboardObjs) destroy(o); leaderboardObjs = [];
    if (!lb || !lb.length) return;
    // Un singolo oggetto che disegna tutto il pannello classifica
    leaderboardObjs.push(add([fixed(), z(100), {
        draw() {
            const sz = hs(12), pad = hs(6), rowH = hs(18), titleSz = hs(11);
            const panelW = hs(160);
            const panelH = hs(16) + lb.length * rowH + pad;
            const bx = hx(GAME_W - 10) - panelW;
            const by = hy(10);
            // sfondo pannello unico
            drawRect({ pos: vec2(bx, by), width: panelW, height: panelH,
                radius: hs(4), color: rgb(0,0,0), opacity: 0.45 });
            // titolo
            drawText({ text: "LEADERBOARD", pos: vec2(bx + pad, by + pad*0.5),
                size: titleSz, color: rgb(160,160,160) });
            // righe giocatori
            lb.forEach((e, i) => {
                const ry = by + hs(16) + i * rowH;
                // separatore leggero
                if (i > 0) drawRect({ pos: vec2(bx + pad, ry), width: panelW - pad*2, height: hs(1),
                    color: rgb(255,255,255), opacity: 0.06 });
                const col = i === 0 ? rgb(240,240,240) : rgb(160,160,160);
                const nameStr = `${i+1}. ${e.nickname}`;
                const killStr = `${e.kills}K`;
                drawText({ text: nameStr, pos: vec2(bx + pad, ry + hs(3)), size: sz, color: col });
                drawText({ text: killStr, pos: vec2(bx + panelW - pad - killStr.length*sz*0.58, ry + hs(3)),
                    size: sz, color: col });
            });
        }
    }]));
}

// ========================
// INPUT TASTIERA
// ========================
const keyMap = { a:"left", d:"right", w:"up", s:"down" };
window.addEventListener("keydown", e => {
    if (inMenu || inLobbyScreen) return;
    const dir = keyMap[e.key.toLowerCase()];
    if (dir && !input[dir]) { input[dir]=true; socket.emit("input",input); }
    if (e.key==="1") { weapon="gun";    socket.emit("setWeapon","gun");    aggiornaHUDArma(); aggiornaWeaponBtns(); aggiornaHUDAmmo(); }
    if (e.key==="2") { weapon="pistol"; socket.emit("setWeapon","pistol"); aggiornaHUDArma(); aggiornaWeaponBtns(); aggiornaHUDAmmo(); }
    if (e.key==="3") { weapon="fists";  socket.emit("setWeapon","fists");  aggiornaHUDArma(); aggiornaWeaponBtns(); aggiornaHUDAmmo(); }
    if ((e.key==="r"||e.key==="R") && !isReloading && weapon!=="fists") {
        if (socket) socket.emit("reload");
    }
});
window.addEventListener("keyup", e => {
    if (inMenu || inLobbyScreen) return;
    const dir = keyMap[e.key.toLowerCase()];
    if (dir && input[dir]) { input[dir]=false; socket.emit("input",input); }
});

// ========================
// TOUCH UI — doppio joystick
// ========================
const JOYSTICK_R=35, KNOB_R=14, DEAD_ZONE=8;

// Joystick sinistro (movimento)
let moveJoyEl=null, moveJoyTouchId=null, moveJoyCenter={x:0,y:0};
// Joystick destro (mira + sparo)
let aimJoyEl=null,  aimJoyTouchId=null,  aimJoyCenter={x:0,y:0};
let aimJoyDir={x:0,y:0};   // direzione normalizzata corrente del joystick mira
let aimJoyActive=false;     // joystick destro premuto → sparo attivo

let weaponBtns=[];

function aggiornaWeaponBtns() {
    weaponBtns.forEach(b => {
        const a = b.dataset.weapon===weapon;
        b.style.borderColor = a?"rgba(255,255,255,0.95)":"rgba(255,255,255,0.3)";
        b.style.transform   = a?"scale(1.12)":"scale(1)";
    });
}

function creaCanvasJoystick(lato) {
    const el = document.createElement("canvas");
    el.width  = (JOYSTICK_R+10)*2;
    el.height = (JOYSTICK_R+10)*2;
    const base = JOYSTICK_R+10;
    const bottom = window.innerHeight - 24 - base;
    if (lato==="left") {
        el.style.cssText=`position:fixed;left:24px;bottom:24px;pointer-events:none;z-index:500;opacity:0.8;`;
    } else {
        el.style.cssText=`position:fixed;right:24px;bottom:24px;pointer-events:none;z-index:500;opacity:0.8;`;
    }
    document.body.appendChild(el);
    return el;
}

function disegnaJoy(el, dx, dy, coloreKnob) {
    if (!el) return;
    const ctx=el.getContext("2d"), cx=JOYSTICK_R+10, cy=JOYSTICK_R+10;
    ctx.clearRect(0,0,el.width,el.height);
    ctx.beginPath(); ctx.arc(cx,cy,JOYSTICK_R,0,Math.PI*2);
    ctx.fillStyle="rgba(0,0,0,0.35)"; ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.4)"; ctx.lineWidth=2.5; ctx.stroke();
    // Clamp circolare: il knob non esce mai dal cerchio
    const maxDist = JOYSTICK_R - KNOB_R;
    const dist = Math.hypot(dx, dy);
    const clampedDx = dist > maxDist ? (dx/dist)*maxDist : dx;
    const clampedDy = dist > maxDist ? (dy/dist)*maxDist : dy;
    ctx.beginPath(); ctx.arc(cx+clampedDx, cy+clampedDy, KNOB_R, 0, Math.PI*2);
    ctx.fillStyle=coloreKnob||"rgba(255,255,255,0.7)"; ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.9)"; ctx.lineWidth=2; ctx.stroke();
}

function creaTouchUI() {
    if (!isMobile()||moveJoyEl) return;

    // Joystick movimento (sinistra)
    moveJoyEl = creaCanvasJoystick("left");
    moveJoyCenter = { x:24+JOYSTICK_R+10, y:window.innerHeight-24-JOYSTICK_R-10 };
    disegnaJoy(moveJoyEl, 0, 0, "rgba(255,255,255,0.7)");

    // Joystick mira (destra) — knob rosso per distinguerlo
    aimJoyEl = creaCanvasJoystick("right");
    aimJoyCenter = { x:window.innerWidth-24-JOYSTICK_R-10, y:window.innerHeight-24-JOYSTICK_R-10 };
    disegnaJoy(aimJoyEl, 0, 0, "rgba(255,100,100,0.8)");

    // Bottoni arma — 28px (doppio), centrati, sopra la barra vita
    if (!weaponBtns.length) {
        [{key:"gun",label:"AR",color:"#e55"},{key:"pistol",label:"PI",color:"#e93"},{key:"fists",label:"PU",color:"#59e"}].forEach((w,i)=>{
            const btn=document.createElement("button");
            btn.textContent=w.label; btn.dataset.weapon=w.key;
            const bSize=28, gap=8, totalW=3*bSize+2*gap;
            const lp=Math.round(window.innerWidth/2-totalW/2)+i*(bSize+gap);
            // posizione: sopra la barra vita di ~8px
            const barTop = hy(GAME_H-44);
            const bottomPx = Math.round(window.innerHeight - barTop + 8);
            btn.style.cssText=`position:fixed;left:${lp}px;bottom:${bottomPx}px;width:${bSize}px;height:${bSize}px;background:${w.color};color:white;font-size:10px;font-weight:bold;border:1px solid rgba(255,255,255,0.3);border-radius:4px;cursor:pointer;z-index:600;opacity:0.9;font-family:monospace;padding:0;line-height:${bSize}px;text-align:center;`;
            btn.addEventListener("touchstart", e=>{ e.preventDefault(); e.stopPropagation(); }, {passive:false});
            btn.addEventListener("touchend",   e=>{ e.preventDefault(); e.stopPropagation(); weapon=w.key; socket.emit("setWeapon",w.key); aggiornaHUDArma(); aggiornaWeaponBtns(); aggiornaHUDAmmo(); }, {passive:false});
            document.body.appendChild(btn); weaponBtns.push(btn);
        });
    }
    aggiornaWeaponBtns();
}

function rimuoviTouchUI() {
    if (moveJoyEl){moveJoyEl.remove();moveJoyEl=null;}
    if (aimJoyEl){aimJoyEl.remove();aimJoyEl=null;}
    weaponBtns.forEach(b=>b.remove()); weaponBtns=[];
    moveJoyTouchId=null; aimJoyTouchId=null; aimJoyActive=false; aimJoyDir={x:0,y:0};
}

function resetAimJoyPos() {
    if (!aimJoyEl) return;
    aimJoyEl.style.right="24px"; aimJoyEl.style.bottom="24px";
    aimJoyEl.style.left="auto"; aimJoyEl.style.top="auto";
    aimJoyCenter={x:window.innerWidth-24-JOYSTICK_R-10, y:window.innerHeight-24-JOYSTICK_R-10};
}

window.addEventListener("touchstart",e=>{
    if (inMenu||inLobbyScreen) return;
    for (const t of e.changedTouches){
        const tx=t.clientX, ty=t.clientY;
        const metà=window.innerWidth*0.5;

        if (tx<metà && moveJoyTouchId===null){
            moveJoyTouchId=t.identifier;
            moveJoyCenter={x:tx,y:ty};
            if(moveJoyEl){
                moveJoyEl.style.left=(tx-JOYSTICK_R-10)+"px";
                moveJoyEl.style.top=(ty-JOYSTICK_R-10)+"px";
                moveJoyEl.style.bottom="auto";
            }
            disegnaJoy(moveJoyEl,0,0,"rgba(255,255,255,0.7)");
        }
        else if (tx>=metà && aimJoyTouchId===null){
            aimJoyTouchId=t.identifier;
            aimJoyCenter={x:tx,y:ty};
            if(aimJoyEl){
                aimJoyEl.style.right="auto";
                aimJoyEl.style.left=(tx-JOYSTICK_R-10)+"px";
                aimJoyEl.style.top=(ty-JOYSTICK_R-10)+"px";
                aimJoyEl.style.bottom="auto";
            }
            aimJoyActive=false;
            aimJoyDir={x:0,y:0};
            disegnaJoy(aimJoyEl,0,0,"rgba(255,100,100,0.8)");
        }
    }
},{passive:true});

window.addEventListener("touchmove",e=>{
    if (inMenu||inLobbyScreen) return;
    for (const t of e.changedTouches){
        const tx=t.clientX, ty=t.clientY;

        if (t.identifier===moveJoyTouchId){
            const dx=tx-moveJoyCenter.x, dy=ty-moveJoyCenter.y;
            const ni={left:dx<-DEAD_ZONE,right:dx>DEAD_ZONE,up:dy<-DEAD_ZONE,down:dy>DEAD_ZONE};
            if(JSON.stringify(ni)!==JSON.stringify(input)){Object.assign(input,ni);socket.emit("input",input);}
            disegnaJoy(moveJoyEl,dx,dy,"rgba(255,255,255,0.7)");
        }
        else if (t.identifier===aimJoyTouchId){
            const dx=tx-aimJoyCenter.x, dy=ty-aimJoyCenter.y;
            const len=Math.hypot(dx,dy);
            if (len>DEAD_ZONE){
                aimJoyActive=true;
                aimJoyDir={x:dx/len, y:dy/len};
                aimJoyAngle=Math.atan2(dy,dx); // salva angolo, verrà inviato nel fireLoop
                disegnaJoy(aimJoyEl,dx,dy,"rgba(255,80,80,0.95)");
            } else {
                aimJoyActive=false;
                aimJoyDir={x:0,y:0};
                disegnaJoy(aimJoyEl,0,0,"rgba(255,100,100,0.8)");
            }
        }
    }
},{passive:true});

function rilasciaAimJoy() {
    aimJoyTouchId=null; aimJoyActive=false; aimJoyDir={x:0,y:0};
    resetAimJoyPos();
    disegnaJoy(aimJoyEl,0,0,"rgba(255,100,100,0.8)");
}
function rilasciaMovJoy() {
    moveJoyTouchId=null;
    Object.assign(input,{left:false,right:false,up:false,down:false});
    socket.emit("input",input);
    if(moveJoyEl){moveJoyEl.style.left="24px";moveJoyEl.style.top="auto";moveJoyEl.style.bottom="24px";}
    moveJoyCenter={x:24+JOYSTICK_R+10,y:window.innerHeight-24-JOYSTICK_R-10};
    disegnaJoy(moveJoyEl,0,0,"rgba(255,255,255,0.7)");
}

window.addEventListener("touchend",e=>{
    for (const t of e.changedTouches){
        if(t.identifier===moveJoyTouchId) rilasciaMovJoy();
        if(t.identifier===aimJoyTouchId)  rilasciaAimJoy();
    }
},{passive:true});
window.addEventListener("touchcancel",e=>{
    for (const t of e.changedTouches){
        if(t.identifier===moveJoyTouchId) rilasciaMovJoy();
        if(t.identifier===aimJoyTouchId)  rilasciaAimJoy();
    }
},{passive:true});

// ========================
// SPARO
// ========================
const PISTOL_COOLDOWN_MS=250, AUTO_FIRE_MS=120;
let lastPistolShot=0, lastAssaltoShot=0, mouseDown=false;
let aimJoyAngle=0; // angolo corrente del joystick mira, aggiornato in touchmove

// Sparo desktop (mouse)
function shoot() {
    if (inMenu||inLobbyScreen||!socket||!myId||!players[myId]||players[myId].morto||weapon==="fists") return;
    if (weapon==="pistol"){const n=performance.now();if(n-lastPistolShot<PISTOL_COOLDOWN_MS)return;lastPistolShot=n;}
    const me=players[myId].sprite, mw=toWorld(mousePos());
    const dir={x:mw.x-me.pos.x,y:mw.y-me.pos.y};
    const len=Math.hypot(dir.x,dir.y); if(!len) return;
    const nx=dir.x/len,ny=dir.y/len,angle=Math.atan2(dir.y,dir.x);
    const tipDist=24+(weapon==="pistol"?10:40);
    socket.emit("aim",angle);
    socket.emit("shoot",{dir,tipOffset:{x:nx*tipDist,y:ny*tipDist}});
    playShootSound();
}

// Sparo touch — usa la direzione del joystick destro
function shootTouchJoy() {
    if (inMenu||inLobbyScreen||!socket||!myId||!players[myId]||players[myId].morto) return;
    if (weapon==="fists"||!aimJoyActive) return;
    const nx=aimJoyDir.x, ny=aimJoyDir.y;
    if (!nx&&!ny) return;
    const tipDist=24+(weapon==="pistol"?10:40);
    socket.emit("shoot",{dir:{x:nx,y:ny},tipOffset:{x:nx*tipDist,y:ny*tipDist}});
    playShootSound();
}

function fireLoop(){
    const n=performance.now();
    // Desktop: autofire assalto, singolo pistola
    if(mouseDown&&weapon==="gun"&&n-lastAssaltoShot>=AUTO_FIRE_MS){shoot();lastAssaltoShot=n;}
    // Touch: joystick mira attivo → invia aim ogni frame + autofire
    if(aimJoyActive){
        if(socket) socket.emit("aim", aimJoyAngle); // mantiene la visuale bloccata
        if(weapon!=="fists"){
            const cooldown=weapon==="gun"?AUTO_FIRE_MS:PISTOL_COOLDOWN_MS;
            if(n-lastPistolShot>=cooldown){
                shootTouchJoy();
                lastPistolShot=n;
            }
        }
    }
    requestAnimationFrame(fireLoop);
}
requestAnimationFrame(fireLoop);
window.addEventListener("mousedown",e=>{if(e.button!==0)return;mouseDown=true;shoot();lastAssaltoShot=performance.now();});
window.addEventListener("mouseup",e=>{if(e.button!==0)return;mouseDown=false;});
onMouseMove(()=>{
    if(isMobile())return; // su mobile l'aim è gestito dal joystick destro
    if(inMenu||inLobbyScreen||!socket||!myId||!players[myId]||players[myId].morto)return;
    const me=players[myId].sprite,mw=toWorld(mousePos());
    socket.emit("aim",Math.atan2(mw.y-me.pos.y,mw.x-me.pos.x));
});

// ========================
// onUpdate
// ========================
onUpdate(()=>{
    if(inMenu||inLobbyScreen||!myId||!players[myId])return;
    if(!players[myId].morto) camPos(players[myId].sprite.pos.x,players[myId].sprite.pos.y);
    camScale(CAM_ZOOM);
    for(const o of killFeedObjs)destroy(o); killFeedObjs=[];
    for(let i=killFeedList.length-1;i>=0;i--){
        killFeedList[i].timer-=dt();
        if(killFeedList[i].timer<=0){killFeedList.splice(i,1);continue;}
        killFeedObjs.push(add([text(killFeedList[i].msg,{size:hs(15)}),pos(hx(GAME_W/2),hy(GAME_H-60-(killFeedList.length-1-i)*22)),anchor("center"),color(rgb(255,220,80)),opacity(Math.min(1,killFeedList[i].timer)),fixed(),z(100)]));
    }
});

// ========================
// AGGIORNA STATO (state dal server)
// ========================
function aggiornaStato(state) {
    if(!cameraInizializzata&&myId&&state.players[myId]&&!inMenu){
        const s=state.players[myId];camPos(s.pos.x,s.pos.y);camScale(CAM_ZOOM);cameraInizializzata=true;
    }
    if(state.lb) aggiornaLeaderboard(state.lb);
    if(state.playerCount!==undefined) aggiornaHUDPlayers(state.playerCount,state.maxPlayers);
    if(myId && state.players[myId] && state.players[myId].ammo){
        const a=state.players[myId].ammo;
        if(a.gun!==myAmmo.gun||a.pistol!==myAmmo.pistol){ myAmmo=a; aggiornaHUDAmmo(); }
    }

    // Rimuovi player non più presenti
    for(const id in players){
        if(!state.players[id]){
            if(players[id].labelObj)destroy(players[id].labelObj);
            if(players[id].hpBar)destroy(players[id].hpBar);
            if(players[id].sprite)destroy(players[id].sprite);
            delete players[id];
        }
    }

    for(const id in state.players){
        const s=state.players[id], isMe=(id===myId);
        if(isMe&&s.morto&&players[id]&&!players[id].morto&&!inMenu){
            myDeaths++;aggiornaHUDStats();playDeathSound();mostraMenu("You were eliminated!");
        }
        if(!players[id]){
            if(s.morto)continue;
            const sprite=add([pos(s.pos.x,s.pos.y),anchor("center"),circle(24),color(rgb(222,196,145)),outline(4,rgb(0,0,0)),z(1)]);
            const labelObj=isMe?add([pos(s.pos.x,s.pos.y-40),anchor("center"),text(myNickname||"TU",{size:13}),color(rgb(0,220,255)),z(5)]):null;
            const hpBar=isMe?add([fixed(),z(200),{_disp:s.hp,draw(){
                const bx=hx(GAME_W/2-150),by=hy(GAME_H-44),r=4,W=hs(300),H=hs(20);
                drawRect({pos:vec2(bx-2,by-2),width:W+4,height:H+4,radius:r+1,color:rgb(30,30,30)});
                drawRect({pos:vec2(bx,by),width:W,height:H,radius:r,color:rgb(90,90,90)});
                const t=this._disp/100,c=t>0.5?rgb(Math.round((1-t)*2*220),220,0):rgb(220,Math.round(t*2*220),0);
                if(this._disp>0)drawRect({pos:vec2(bx,by),width:Math.max(W*(this._disp/100),r*2),height:H,radius:r,color:c});
            }}]):null;
            players[id]={sprite,labelObj,hpBar,dirIndicator:{angle:s.angle||0,visible:true},morto:s.morto};
            if(isMe){distruggiUI();inMenu=false;cameraInizializzata=false;prevInput="";socket.emit("input",input);if(isMobile())creaTouchUI();}
        } else {
            const lerp=isMe?0.8:0.3, p=players[id], eraMorto=p.morto;
            p.morto=s.morto;
            if(s.morto){p.sprite.hidden=true;if(p.labelObj)p.labelObj.hidden=true;if(p.hpBar)p.hpBar.hidden=true;p.dirIndicator.visible=false;}
            if(!s.morto){
                if(isMe&&eraMorto){
                    distruggiUI();inMenu=false;cameraInizializzata=false;prevInput="";
                    canvas.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,clientX:window.innerWidth/2,clientY:window.innerHeight/2}));
                    p.hpBar=add([fixed(),z(200),{_disp:s.hp,draw(){
                        const bx=hx(GAME_W/2-150),by=hy(GAME_H-44),r=4,W=hs(300),H=hs(20);
                        drawRect({pos:vec2(bx-2,by-2),width:W+4,height:H+4,radius:r+1,color:rgb(30,30,30)});
                        drawRect({pos:vec2(bx,by),width:W,height:H,radius:r,color:rgb(90,90,90)});
                        const t=this._disp/100,c=t>0.5?rgb(Math.round((1-t)*2*220),220,0):rgb(220,Math.round(t*2*220),0);
                        if(this._disp>0)drawRect({pos:vec2(bx,by),width:Math.max(W*(this._disp/100),r*2),height:H,radius:r,color:c});
                    }}]);
                    if(isMobile())creaTouchUI();
                }
                p.sprite.hidden=false;if(p.hpBar)p.hpBar.hidden=false;
                if(s.hitFlash){p.sprite.color=rgb(255,255,255);if(isMe)playHitSound();setTimeout(()=>{if(p.sprite)p.sprite.color=rgb(222,196,145);},80);}
                p.sprite.pos.x+=(s.pos.x-p.sprite.pos.x)*lerp;
                p.sprite.pos.y+=(s.pos.y-p.sprite.pos.y)*lerp;
                if(p.labelObj){p.labelObj.pos.x+=(s.pos.x-p.labelObj.pos.x)*lerp;p.labelObj.pos.y+=(s.pos.y+41-p.labelObj.pos.y)*lerp;}
                if(p.hpBar){p.hpBar._disp+=(s.hp-p.hpBar._disp)*0.15;if(Math.abs(s.hp-p.hpBar._disp)<0.3)p.hpBar._disp=s.hp;}
                p.dirIndicator.angle=s.angle||0;p.dirIndicator.weapon=s.weapon||"gun";p.dirIndicator.visible=true;
            }
        }
    }

    // Proiettili
    const serverIds=new Set(state.proiettili.map(b=>b.id));
    for(const id in bulletSprites){if(!serverIds.has(Number(id))){destroy(bulletSprites[id]);delete bulletSprites[id];}}
    for(const b of state.proiettili){
        if(!bulletSprites[b.id]) bulletSprites[b.id]=add([pos(b.pos.x,b.pos.y),anchor("center"),circle(3),color(rgb(255,200,0)),z(3)]);
        else bulletSprites[b.id].pos=vec2(b.pos.x,b.pos.y);
    }
}

drawOverlay();