import kaboom from "./lib/kaboom.mjs";

// ========================
// RICARICA AUTOMATICA — deve avvenire subito, prima della lobby
// ========================
if (!sessionStorage.getItem("reloaded")) {
    sessionStorage.setItem("reloaded", "1");
    location.reload();
}

kaboom({
    width: window.innerWidth,
    height: window.innerHeight,
    clearColor: [0.16, 0.55, 0.82, 1],
    preventPauseOnBlur: true,
});

document.body.style.cursor = "crosshair";
const canvas = document.querySelector("canvas");
canvas.style.cursor = "crosshair";

// ========================
// OVERLAY CANVAS
// ========================
const overlayCanvas = document.createElement("canvas");
overlayCanvas.style.cssText = "position:fixed;top:0;left:0;pointer-events:none;z-index:10;";
overlayCanvas.width = window.innerWidth;
overlayCanvas.height = window.innerHeight;
document.body.appendChild(overlayCanvas);
const octx = overlayCanvas.getContext("2d");

function worldToScreen(wx, wy) {
    const cam = camPos();
    const zoom = camScale().x;
    return {
        x: (wx - cam.x) * zoom + window.innerWidth  / 2,
        y: (wy - cam.y) * zoom + window.innerHeight / 2
    };
}

// ========================
// ARMA E MANI
// ========================
let gunDrawObj = null;
function creaGunDrawObj() {
    if (gunDrawObj) destroy(gunDrawObj);
    gunDrawObj = add([pos(0,0), z(1.5), {
        draw() {
            if (inMenu || inLobbyScreen || !myId) return;
            for (const id in players) {
                const p = players[id];
                if (!p || p.morto || !p.dirIndicator || !p.sprite) continue;
                const angle = p.dirIndicator.angle || 0;
                const wtype = (id === myId) ? weapon : (p.dirIndicator.weapon || "gun");
                const px = p.sprite.pos.x, py = p.sprite.pos.y;
                const R = 24;
                const cos = Math.cos(angle), sin = Math.sin(angle);
                const perp = { x: -sin, y: cos };

                const drawHand = (hx, hy, r) => {
                    drawCircle({ pos: vec2(hx,hy), radius: r+2, color: rgb(0,0,0) });
                    drawCircle({ pos: vec2(hx,hy), radius: r,   color: rgb(222,196,145) });
                };

                if (wtype === "fists") {
                    for (const side of [-1,1]) {
                        drawHand(px+cos*(R+2)+perp.x*17*side, py+sin*(R+2)+perp.y*17*side, 8);
                    }
                } else if (wtype === "pistol") {
                    drawRect({ pos: vec2(px+cos*R, py+sin*R), width:30, height:9, color:rgb(17,17,17),
                        radius:4, angle: angle*(180/Math.PI), anchor:"left", offset:vec2(0,-4.5) });
                    drawHand(px+cos*(R+3), py+sin*(R+3), 7);
                } else {
                    drawRect({ pos: vec2(px+cos*R, py+sin*R), width:60, height:9, color:rgb(17,17,17),
                        radius:4, angle: angle*(180/Math.PI), anchor:"left", offset:vec2(0,-4.5) });
                    drawHand(px+cos*(R+2)-perp.x*3,  py+sin*(R+2)-perp.y*3,  7);
                    drawHand(px+cos*(R+30)+perp.x*5, py+sin*(R+30)+perp.y*5, 7);
                }
            }
        }
    }]);
}

function drawOverlay() {
    requestAnimationFrame(drawOverlay);
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// ========================
// COSTANTI / STATO
// ========================
const CAM_ZOOM = 1;
const socket = io();

let myId = null;
let myLobbyId = null;
let myLobbyName = null;
let mapSize = { width: 5000, height: 5000 };
let ostacoliSopra = [];
let cameraInizializzata = false;
let inMenu = true;
let inLobbyScreen = true; // schermata selezione lobby
let myNickname = "";

const players = {};
const bulletSprites = {};
const input = { left: false, right: false, up: false, down: false };
let prevInput = "";
let weapon = "gun";

const isMobile = () => navigator.maxTouchPoints > 0 || "ontouchstart" in window;

// ========================
// AUDIO
// ========================
let audioCtx = null;
function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}
function playShootSound() {
    try {
        const ctx = getAudio();
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "square";
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime+0.08);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.12);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.12);
    } catch(e){}
}
function playHitSound() {
    try {
        const ctx = getAudio();
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime+0.15);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.15);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.15);
    } catch(e){}
}
function playDeathSound() {
    try {
        const ctx = getAudio();
        for (let i=0; i<3; i++) {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 200 - i*50;
            gain.gain.setValueAtTime(0.2, ctx.currentTime+i*0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+i*0.1+0.2);
            osc.start(ctx.currentTime+i*0.1); osc.stop(ctx.currentTime+i*0.1+0.2);
        }
    } catch(e){}
}
function playKillSound() {
    try {
        const ctx = getAudio();
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime+0.05);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.2);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.2);
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
function nascondiElementiHTML() {
    if (htmlContainer) { htmlContainer.remove(); htmlContainer = null; }
}

// ========================
// SCHERMATA SELEZIONE LOBBY
// ========================
let lobbyListData = [];

function mostraSchermataLobby(errorMsg) {
    distruggiUI();
    inMenu = true;
    inLobbyScreen = true;

    // Sfondo
    uiLayer.push(add([rect(width(),height()), pos(0,0), color(rgb(5,10,20)), opacity(0.97), fixed(), z(200)]));
    uiLayer.push(add([text("SHOOTER ONLINE", {size:46}), pos(width()/2, 54), anchor("center"), color(rgb(0,255,100)), fixed(), z(201)]));

    htmlContainer = document.createElement("div");
    htmlContainer.style.cssText = `
        position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
        display:flex;flex-direction:column;align-items:center;gap:16px;
        z-index:9999;width:min(520px,92vw);
    `;

    // Errore se c'è
    if (errorMsg) {
        const errDiv = document.createElement("div");
        errDiv.textContent = errorMsg;
        errDiv.style.cssText = "color:#f55;font-size:15px;font-family:monospace;text-align:center;";
        htmlContainer.appendChild(errDiv);
    }

    // CREA NUOVA LOBBY
    const createSection = document.createElement("div");
    createSection.style.cssText = "display:flex;gap:10px;width:100%;";

    const nameInput = document.createElement("input");
    nameInput.placeholder = "Nome lobby (opzionale)";
    nameInput.maxLength = 30;
    nameInput.style.cssText = `
        flex:1;padding:12px 14px;background:rgba(255,255,255,0.08);
        border:2px solid rgba(0,255,100,0.4);border-radius:6px;
        color:white;font-size:16px;font-family:monospace;outline:none;
    `;

    const createBtn = document.createElement("button");
    createBtn.textContent = "+ CREA";
    createBtn.style.cssText = `
        padding:12px 20px;background:rgb(0,160,70);color:white;
        font-size:16px;font-weight:bold;border:none;border-radius:6px;
        cursor:pointer;font-family:monospace;white-space:nowrap;
    `;
    createBtn.addEventListener("click", () => {
        socket.emit("createLobby", { name: nameInput.value.trim() || "" });
    });

    createSection.appendChild(nameInput);
    createSection.appendChild(createBtn);
    htmlContainer.appendChild(createSection);

    // Separatore
    const sep = document.createElement("div");
    sep.style.cssText = "color:rgba(255,255,255,0.3);font-family:monospace;font-size:13px;";
    sep.textContent = "── oppure entra in una lobby esistente ──";
    htmlContainer.appendChild(sep);

    // LISTA LOBBY
    const listContainer = document.createElement("div");
    listContainer.id = "lobby-list-container";
    listContainer.style.cssText = "width:100%;display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow-y:auto;";
    renderLobbyList(listContainer, lobbyListData);
    htmlContainer.appendChild(listContainer);

    document.body.appendChild(htmlContainer);
    setTimeout(() => nameInput.focus(), 50);
}

function renderLobbyList(container, lobbies) {
    container.innerHTML = "";
    if (!lobbies || lobbies.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "Nessuna lobby disponibile. Creane una!";
        empty.style.cssText = "color:rgba(255,255,255,0.4);font-family:monospace;font-size:14px;text-align:center;padding:20px;";
        container.appendChild(empty);
        return;
    }

    for (const l of lobbies) {
        const isFull = l.players >= l.max;
        const row = document.createElement("div");
        row.style.cssText = `
            display:flex;align-items:center;justify-content:space-between;
            background:rgba(255,255,255,0.07);border-radius:8px;padding:12px 16px;
            border:1px solid rgba(255,255,255,${isFull ? "0.1" : "0.2"});
            opacity:${isFull ? "0.55" : "1"};
        `;

        const info = document.createElement("div");
        info.style.cssText = "display:flex;flex-direction:column;gap:3px;";

        const nameEl = document.createElement("span");
        nameEl.textContent = l.name || l.id;
        nameEl.style.cssText = "color:white;font-family:monospace;font-size:16px;font-weight:bold;";

        const countEl = document.createElement("span");
        countEl.textContent = `${l.players}/${l.max} giocatori${isFull ? " — PIENA" : ""}`;
        countEl.style.cssText = `color:${isFull ? "#f88" : "#8f8"};font-family:monospace;font-size:13px;`;

        info.appendChild(nameEl);
        info.appendChild(countEl);

        const joinBtn = document.createElement("button");
        joinBtn.textContent = "ENTRA";
        joinBtn.disabled = isFull;
        joinBtn.style.cssText = `
            padding:10px 20px;background:${isFull ? "rgba(100,100,100,0.5)" : "rgb(0,120,200)"};
            color:white;font-size:15px;font-weight:bold;border:none;border-radius:6px;
            cursor:${isFull ? "not-allowed" : "pointer"};font-family:monospace;
        `;
        if (!isFull) {
            joinBtn.addEventListener("click", () => {
                socket.emit("joinLobby", { lobbyId: l.id });
            });
        }

        row.appendChild(info);
        row.appendChild(joinBtn);
        container.appendChild(row);
    }
}

// Aggiorna la lista lobby in tempo reale senza ricostruire tutto
socket.on("lobbyList", (list) => {
    lobbyListData = list;
    if (inLobbyScreen && htmlContainer) {
        const container = document.getElementById("lobby-list-container");
        if (container) renderLobbyList(container, list);
    }
});

socket.on("lobbyError", (msg) => {
    if (inLobbyScreen) mostraSchermataLobby(msg);
});

// ========================
// MENU IN-GAME (spawn/morte)
// ========================
function mostraMenu(titolo, sottotitolo) {
    distruggiUI();
    inMenu = true;
    inLobbyScreen = false;
    uiLayer.push(add([rect(width(),height()), pos(0,0), color(rgb(5,10,5)), opacity(0.88), fixed(), z(200)]));
    uiLayer.push(add([text("SHOOTER ONLINE",{size:52}), pos(width()/2,height()/2-140), anchor("center"), color(rgb(0,255,100)), fixed(), z(201)]));
    if (myNickname) {
        uiLayer.push(add([text(myNickname,{size:22}), pos(width()/2,height()/2-70), anchor("center"), color(rgb(0,200,255)), fixed(), z(201)]));
    }
    if (myLobbyName) {
        uiLayer.push(add([text(`Lobby: ${myLobbyName}`,{size:16}), pos(width()/2,height()/2-40), anchor("center"), color(rgb(180,180,180)), fixed(), z(201)]));
    }
    if (sottotitolo) {
        uiLayer.push(add([text(sottotitolo,{size:26}), pos(width()/2,height()/2-8), anchor("center"), color(rgb(220,80,80)), fixed(), z(201)]));
    }

    htmlContainer = document.createElement("div");
    htmlContainer.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,60px);display:flex;flex-direction:column;align-items:center;gap:12px;z-index:9999;";

    const btn = document.createElement("button");
    btn.textContent = "GIOCA";
    btn.style.cssText = "width:220px;height:60px;background:rgb(0,180,70);color:white;font-size:30px;font-weight:bold;border:none;border-radius:6px;cursor:pointer;font-family:monospace;letter-spacing:2px;";
    btn.addEventListener("click", () => {
        nascondiElementiHTML();
        distruggiUI();
        socket.emit("spawn");
    });

    // Pulsante per tornare alla selezione lobby
    const backBtn = document.createElement("button");
    backBtn.textContent = "← Cambia Lobby";
    backBtn.style.cssText = "width:220px;height:40px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);font-size:15px;border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;font-family:monospace;";
    backBtn.addEventListener("click", () => {
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
let killFeedObjs = [];
let leaderboardObjs = [];
let hudKillsObj = null;
let myKills = 0, myDeaths = 0;
let hudWeaponObj = null;
let hudLobbyObj = null;
let hudPlayersObj = null;

function aggiornaHUDArma() {
    if (hudWeaponObj) destroy(hudWeaponObj);
    if (isMobile()) return;
    hudWeaponObj = add([
        text(weapon==="gun" ? "[1] Assalto  2: Pistola  3: Pugni" :
             weapon==="pistol" ? "1: Assalto  [2] Pistola  3: Pugni" :
                                 "1: Assalto  2: Pistola  [3] Pugni", {size:14}),
        pos(14, height()-52), color(rgb(255,220,80)), fixed(), z(100)
    ]);
}
function aggiornaHUDStats() {
    if (hudKillsObj) destroy(hudKillsObj);
    hudKillsObj = add([text(`K: ${myKills}  M: ${myDeaths}`,{size:16}), pos(14,height()-30), color(rgb(0,255,100)), fixed(), z(100)]);
}
function aggiornaHUDLobby() {
    if (hudLobbyObj) destroy(hudLobbyObj);
    if (!myLobbyName) return;
    hudLobbyObj = add([text(`Lobby: ${myLobbyName}`,{size:11}), pos(14,14), color(rgb(120,120,120)), fixed(), z(100)]);
}
function aggiornaHUDPlayers(count, max) {
    if (hudPlayersObj) destroy(hudPlayersObj);
    hudPlayersObj = add([text(`Giocatori: ${count}/${max}`,{size:11}), pos(14,28), color(rgb(100,180,100)), fixed(), z(100)]);
}
function mostraKillFeed(msg) {
    killFeedList.unshift({ msg, timer: 3.5 });
    if (killFeedList.length > 5) killFeedList.pop();
}
function aggiornaLeaderboard(lb) {
    for (const o of leaderboardObjs) destroy(o);
    leaderboardObjs = [];
    if (!lb || !lb.length) return;
    leaderboardObjs.push(add([text("CLASSIFICA",{size:14}), pos(width()-160,14), color(rgb(255,220,0)), fixed(), z(100)]));
    lb.forEach((entry,i) => {
        leaderboardObjs.push(add([text(`${i+1}. ${entry.nickname}  ${entry.kills}K`,{size:13}),
            pos(width()-160, 34+i*18), color(i===0?rgb(255,220,0):rgb(200,200,200)), fixed(), z(100)]));
    });
}

// ========================
// INPUT TASTIERA (desktop)
// ========================
const keyMap = { a:"left", d:"right", w:"up", s:"down" };
window.addEventListener("keydown", (e) => {
    if (inMenu || inLobbyScreen) return;
    const dir = keyMap[e.key.toLowerCase()];
    if (dir && !input[dir]) { input[dir]=true; socket.emit("input",input); }
    if (e.key==="1") { weapon="gun";    socket.emit("setWeapon","gun");    aggiornaHUDArma(); aggiornaWeaponBtns(); }
    if (e.key==="2") { weapon="pistol"; socket.emit("setWeapon","pistol"); aggiornaHUDArma(); aggiornaWeaponBtns(); }
    if (e.key==="3") { weapon="fists";  socket.emit("setWeapon","fists");  aggiornaHUDArma(); aggiornaWeaponBtns(); }
});
window.addEventListener("keyup", (e) => {
    if (inMenu || inLobbyScreen) return;
    const dir = keyMap[e.key.toLowerCase()];
    if (dir && input[dir]) { input[dir]=false; socket.emit("input",input); }
});

// ========================
// TOUCH UI
// ========================
const JOYSTICK_R = 70;
const KNOB_R = 28;
const DEAD_ZONE = 15;

let joystickEl = null;
let weaponBtns = [];
let joystickTouchId = null;
let joystickCenter = { x:0, y:0 };
let aimTouchId = null;
let aimTouchPos = { x:0, y:0 };
let touchFireInterval = null;
let touchFiring = false;

function aggiornaWeaponBtns() {
    weaponBtns.forEach(btn => {
        const active = btn.dataset.weapon === weapon;
        btn.style.borderColor = active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.3)";
        btn.style.transform   = active ? "scale(1.12)" : "scale(1)";
    });
}

function creaTouchUI() {
    if (!isMobile() || joystickEl) return;

    joystickEl = document.createElement("canvas");
    joystickEl.width  = (JOYSTICK_R+10)*2;
    joystickEl.height = (JOYSTICK_R+10)*2;
    joystickEl.style.cssText = "position:fixed;left:24px;bottom:24px;pointer-events:none;z-index:500;opacity:0.8;";
    document.body.appendChild(joystickEl);
    joystickCenter = { x: 24+JOYSTICK_R+10, y: window.innerHeight-24-JOYSTICK_R-10 };
    disegnaJoystick(0,0);

    if (!weaponBtns.length) {
        const wdefs = [
            { key:"gun",    label:"AR", color:"#e55" },
            { key:"pistol", label:"PI", color:"#e93" },
            { key:"fists",  label:"PU", color:"#59e" },
        ];
        wdefs.forEach((w,i) => {
            const btn = document.createElement("button");
            btn.textContent = w.label;
            btn.dataset.weapon = w.key;
            const bSize=56,gap=10,totalW=3*bSize+2*gap;
            const leftPos=Math.round(window.innerWidth/2-totalW/2)+i*(bSize+gap);
            btn.style.cssText = `position:fixed;left:${leftPos}px;bottom:24px;width:56px;height:56px;background:${w.color};color:white;font-size:16px;font-weight:bold;border:3px solid rgba(255,255,255,0.3);border-radius:10px;cursor:pointer;z-index:600;opacity:0.9;font-family:monospace;`;
            btn.addEventListener("touchstart", (e) => {
                e.stopPropagation();
                weapon = w.key;
                socket.emit("setWeapon", w.key);
                aggiornaHUDArma();
                aggiornaWeaponBtns();
            }, { passive: true });
            document.body.appendChild(btn);
            weaponBtns.push(btn);
        });
    }
    aggiornaWeaponBtns();
}

function rimuoviTouchUI() {
    if (joystickEl) { joystickEl.remove(); joystickEl = null; }
    weaponBtns.forEach(b => b.remove());
    weaponBtns = [];
    joystickTouchId = null;
    aimTouchId = null;
    touchFiring = false;
}

function disegnaJoystick(dx, dy) {
    if (!joystickEl) return;
    const ctx = joystickEl.getContext("2d");
    const cx = JOYSTICK_R+10, cy = JOYSTICK_R+10;
    ctx.clearRect(0,0,joystickEl.width,joystickEl.height);
    ctx.beginPath(); ctx.arc(cx,cy,JOYSTICK_R,0,Math.PI*2);
    ctx.fillStyle="rgba(0,0,0,0.35)"; ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.5)"; ctx.lineWidth=2.5; ctx.stroke();
    const kx = cx + Math.max(-JOYSTICK_R+KNOB_R, Math.min(JOYSTICK_R-KNOB_R, dx));
    const ky = cy + Math.max(-JOYSTICK_R+KNOB_R, Math.min(JOYSTICK_R-KNOB_R, dy));
    ctx.beginPath(); ctx.arc(kx,ky,KNOB_R,0,Math.PI*2);
    ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.9)"; ctx.lineWidth=2; ctx.stroke();
}

window.addEventListener("touchstart", (e) => {
    if (inMenu || inLobbyScreen) return;
    for (const t of e.changedTouches) {
        const tx = t.clientX, ty = t.clientY;
        if (tx < window.innerWidth*0.5 && joystickTouchId===null) {
            joystickTouchId = t.identifier;
            joystickCenter = { x:tx, y:ty };
            if (joystickEl) {
                joystickEl.style.left   = (tx-JOYSTICK_R-10)+"px";
                joystickEl.style.top    = (ty-JOYSTICK_R-10)+"px";
                joystickEl.style.bottom = "auto";
            }
            disegnaJoystick(0,0);
        } else if (tx >= window.innerWidth*0.5 && aimTouchId===null) {
            aimTouchId = t.identifier;
            aimTouchPos = { x:tx, y:ty };
            if (myId && players[myId] && players[myId].sprite) {
                const sp = worldToScreen(players[myId].sprite.pos.x, players[myId].sprite.pos.y);
                socket.emit("aim", Math.atan2(ty-sp.y, tx-sp.x));
            }
            touchFiring = true;
        }
    }
}, { passive:true });

window.addEventListener("touchmove", (e) => {
    if (inMenu || inLobbyScreen) return;
    for (const t of e.changedTouches) {
        const tx = t.clientX, ty = t.clientY;
        if (t.identifier === joystickTouchId) {
            const dx = tx-joystickCenter.x, dy = ty-joystickCenter.y;
            const ni = { left:dx<-DEAD_ZONE, right:dx>DEAD_ZONE, up:dy<-DEAD_ZONE, down:dy>DEAD_ZONE };
            if (JSON.stringify(ni) !== JSON.stringify(input)) { Object.assign(input,ni); socket.emit("input",input); }
            disegnaJoystick(dx,dy);
        } else if (t.identifier === aimTouchId) {
            aimTouchPos = { x:tx, y:ty };
            if (myId && players[myId] && players[myId].sprite) {
                const sp = worldToScreen(players[myId].sprite.pos.x, players[myId].sprite.pos.y);
                socket.emit("aim", Math.atan2(ty-sp.y, tx-sp.x));
            }
        }
    }
}, { passive:true });

window.addEventListener("touchend", (e) => {
    for (const t of e.changedTouches) {
        if (t.identifier === joystickTouchId) {
            joystickTouchId = null;
            Object.assign(input,{left:false,right:false,up:false,down:false});
            socket.emit("input",input);
            if (joystickEl) { joystickEl.style.left="24px"; joystickEl.style.top="auto"; joystickEl.style.bottom="24px"; }
            joystickCenter = { x:24+JOYSTICK_R+10, y:window.innerHeight-24-JOYSTICK_R-10 };
            disegnaJoystick(0,0);
        }
        if (t.identifier === aimTouchId) {
            aimTouchId = null;
            touchFiring = false;
        }
    }
}, { passive:true });

window.addEventListener("touchcancel", (e) => {
    for (const t of e.changedTouches) {
        if (t.identifier === joystickTouchId) {
            joystickTouchId = null;
            Object.assign(input,{left:false,right:false,up:false,down:false});
            socket.emit("input",input);
            disegnaJoystick(0,0);
        }
        if (t.identifier === aimTouchId) {
            aimTouchId = null;
            touchFiring = false;
        }
    }
}, { passive:true });

// ========================
// SPARO DESKTOP
// ========================
const PISTOL_COOLDOWN_MS = 250;
const AUTO_FIRE_MS = 120;
let lastPistolShot = 0;
let lastAssaltoShot = 0;
let lastTouchShot = 0;
let mouseDown = false;

function shoot() {
    if (inMenu || inLobbyScreen || !myId || !players[myId] || players[myId].morto) return;
    if (weapon === "fists") return;
    if (weapon === "pistol") {
        const now = performance.now();
        if (now - lastPistolShot < PISTOL_COOLDOWN_MS) return;
        lastPistolShot = now;
    }
    const me = players[myId].sprite;
    const mworld = toWorld(mousePos());
    const dir = { x: mworld.x-me.pos.x, y: mworld.y-me.pos.y };
    const len = Math.hypot(dir.x,dir.y);
    if (len===0) return;
    const nx=dir.x/len, ny=dir.y/len;
    const angle = Math.atan2(dir.y,dir.x);
    const tipDist = 24 + (weapon==="pistol"?10:40);
    socket.emit("aim", angle);
    socket.emit("shoot", { dir, tipOffset:{ x:nx*tipDist, y:ny*tipDist } });
    playShootSound();
}

function shootTouch() {
    if (inMenu || inLobbyScreen || !myId || !players[myId] || players[myId].morto) return;
    if (weapon === "fists") return;
    if (weapon === "pistol") {
        const now = performance.now();
        if (now - lastPistolShot < PISTOL_COOLDOWN_MS) return;
        lastPistolShot = now;
    }
    const me = players[myId].sprite;
    const sp = worldToScreen(me.pos.x, me.pos.y);
    const dx = aimTouchPos.x-sp.x, dy = aimTouchPos.y-sp.y;
    const len = Math.hypot(dx,dy);
    if (len===0) return;
    const nx=dx/len, ny=dy/len;
    const angle = Math.atan2(dy,dx);
    const tipDist = 24 + (weapon==="pistol"?10:40);
    socket.emit("aim", angle);
    socket.emit("shoot", { dir:{x:nx,y:ny}, tipOffset:{x:nx*tipDist,y:ny*tipDist} });
    playShootSound();
}

function fireLoop() {
    const now = performance.now();
    if (mouseDown && weapon === "gun") {
        if (now - lastAssaltoShot >= AUTO_FIRE_MS) {
            shoot();
            lastAssaltoShot = now;
        }
    }
    if (touchFiring) {
        const cooldown = weapon === "gun" ? AUTO_FIRE_MS : PISTOL_COOLDOWN_MS;
        if (weapon !== "fists" && now - lastTouchShot >= cooldown) {
            shootTouch();
            lastTouchShot = now;
        }
    }
    requestAnimationFrame(fireLoop);
}
requestAnimationFrame(fireLoop);

window.addEventListener("mousedown", (e) => {
    if (e.button!==0) return;
    mouseDown=true; shoot(); lastAssaltoShot=performance.now();
});
window.addEventListener("mouseup", (e) => { if (e.button!==0) return; mouseDown=false; });

onMouseMove(() => {
    if (inMenu || inLobbyScreen || !myId || !players[myId] || players[myId].morto) return;
    const me=players[myId].sprite;
    const mw=toWorld(mousePos());
    socket.emit("aim", Math.atan2(mw.y-me.pos.y, mw.x-me.pos.x));
});

// ========================
// INIT — ricevuto dopo joinLobby/createLobby
// ========================
socket.on("init", ({ id, map, ostacoli, lobbyId, lobbyName, nickname, playerCount, maxPlayers }) => {
    myId=id; mapSize=map; myLobbyId=lobbyId; myLobbyName=lobbyName; myNickname=nickname;
    inLobbyScreen = false;
    ostacoliSopra=ostacoli.filter(o=>o.type==="cespuglio"||o.type==="albero");

    const spiaggia=80;
    add([pos(-5000,-5000), rect(map.width+10000,map.height+10000), color(rgb(40,140,210)), z(-12)]);
    add([pos(-spiaggia,-spiaggia), rect(map.width+spiaggia*2,map.height+spiaggia*2), color(rgb(230,200,100)), z(-11)]);
    add([pos(0,0), rect(map.width,map.height), color(rgb(60,120,40)), z(-10)]);

    for (const o of ostacoli) {
        if (o.type==="roccia") add([pos(o.x,o.y), anchor("center"), circle(o.r), color(rgb(110,110,110)), outline(3,rgb(60,60,60)), z(2)]);
    }
    for (const o of ostacoli) {
        if (o.type==="albero") {
            add([pos(o.x,o.y), anchor("center"), circle(o.r), color(rgb(20,75,15)), outline(4,rgb(10,45,8)), z(4)]);
            add([pos(o.x,o.y), anchor("center"), circle(o.rCollisione), color(rgb(80,50,20)), z(4)]);
        }
    }
    for (const o of ostacoli) {
        if (o.type==="cespuglio") add([pos(o.x,o.y), anchor("center"), circle(o.r), color(rgb(100,200,40)), outline(2,rgb(60,140,20)), z(2)]);
    }

    aggiornaHUDStats();
    aggiornaHUDArma();
    aggiornaHUDLobby();
    aggiornaHUDPlayers(playerCount, maxPlayers);
    creaGunDrawObj();
    onResize(() => { aggiornaHUDArma(); aggiornaHUDStats(); aggiornaHUDLobby(); aggiornaHUDPlayers(playerCount, maxPlayers); });
    mostraMenu();
});

// ========================
// PLAYER LEFT — disconnessione altrui
// ========================
socket.on("playerLeft", ({ id, nickname: leftNick }) => {
    // Rimuovi sprite se esiste ancora
    if (players[id]) {
        if (players[id].labelObj) destroy(players[id].labelObj);
        if (players[id].hpBar) destroy(players[id].hpBar);
        if (players[id].spriteInner) destroy(players[id].spriteInner);
        if (players[id].sprite) destroy(players[id].sprite);
        delete players[id];
    }
    mostraKillFeed(`${leftNick} ha lasciato la partita`);
});

// ========================
// KILL CONFIRM
// ========================
socket.on("killConfirm", ({ victim }) => {
    myKills++; aggiornaHUDStats(); mostraKillFeed(`Hai eliminato ${victim}!`); playKillSound();
});

// ========================
// onUpdate
// ========================
onUpdate(() => {
    if (inMenu || inLobbyScreen || !myId || !players[myId]) return;
    if (!players[myId].morto) camPos(players[myId].sprite.pos.x, players[myId].sprite.pos.y);
    camScale(CAM_ZOOM);

    for (const o of killFeedObjs) destroy(o);
    killFeedObjs=[];
    for (let i=killFeedList.length-1; i>=0; i--) {
        killFeedList[i].timer -= dt();
        if (killFeedList[i].timer<=0) { killFeedList.splice(i,1); continue; }
        killFeedObjs.push(add([
            text(killFeedList[i].msg,{size:15}),
            pos(width()/2, height()-60-(killFeedList.length-1-i)*22),
            anchor("center"), color(rgb(255,220,80)), opacity(Math.min(1,killFeedList[i].timer)),
            fixed(), z(100)
        ]));
    }
});

// ========================
// STATO DAL SERVER
// ========================
socket.on("state", (state) => {
    if (!cameraInizializzata && myId && state.players[myId] && !inMenu) {
        const s=state.players[myId];
        camPos(s.pos.x,s.pos.y); camScale(CAM_ZOOM); cameraInizializzata=true;
    }
    if (state.lb) aggiornaLeaderboard(state.lb);
    if (state.playerCount !== undefined) aggiornaHUDPlayers(state.playerCount, state.maxPlayers);

    for (const id in players) {
        if (!state.players[id]) {
            if (players[id].labelObj) destroy(players[id].labelObj);
            if (players[id].hpBar) destroy(players[id].hpBar);
            if (players[id].spriteInner) destroy(players[id].spriteInner);
            destroy(players[id].sprite);
            delete players[id];
        }
    }

    for (const id in state.players) {
        const s=state.players[id];
        const isMe=(id===myId);

        if (isMe && s.morto && players[id] && !players[id].morto && !inMenu) {
            myDeaths++; aggiornaHUDStats(); playDeathSound();
            mostraMenu(null,"Sei stato eliminato!");
        }

        if (!players[id]) {
            if (s.morto) continue;
            const sprite=add([pos(s.pos.x,s.pos.y), anchor("center"), circle(24), color(rgb(222,196,145)), outline(4,rgb(0,0,0)), z(1)]);
            const dirIndicator={ angle:s.angle||0, visible:true };
            const labelObj=isMe ? add([pos(s.pos.x,s.pos.y+41), anchor("center"), text(myNickname||"TU",{size:13}), color(rgb(0,220,255)), z(-1)]) : null;
            const hpBar=isMe ? add([fixed(), z(200), { _disp:s.hp, draw() {
                const bx=width()/2-150, by=height()-44, r=4, W=300, H=20;
                drawRect({pos:vec2(bx-2,by-2),width:W+4,height:H+4,radius:r+1,color:rgb(30,30,30)});
                drawRect({pos:vec2(bx,by),width:W,height:H,radius:r,color:rgb(90,90,90)});
                const t=this._disp/100;
                const c=t>0.5?rgb(Math.round((1-t)*2*220),220,0):rgb(220,Math.round(t*2*220),0);
                if(this._disp>0) drawRect({pos:vec2(bx,by),width:Math.max(W*(this._disp/100),r*2),height:H,radius:r,color:c});
            }}]) : null;

            players[id]={ sprite, spriteInner:null, labelObj, hpBar, hpBarGray:null, hpBarBg:null, dirIndicator, morto:s.morto };

            if (isMe) {
                distruggiUI(); inMenu=false; cameraInizializzata=false; prevInput="";
                socket.emit("input",input);
                if (isMobile()) creaTouchUI();
            }

        } else {
            const lerp=isMe?0.8:0.3;
            const p=players[id];
            const eraMorto=p.morto;
            p.morto=s.morto;

            if (s.morto) {
                p.sprite.hidden=true;
                if (p.labelObj) p.labelObj.hidden=true;
                if (p.hpBar) p.hpBar.hidden=true;
                p.dirIndicator.visible=false;
            }

            if (!s.morto) {
                if (isMe && eraMorto) {
                    distruggiUI(); inMenu=false; cameraInizializzata=false; prevInput="";
                    canvas.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,clientX:window.innerWidth/2,clientY:window.innerHeight/2}));
                    p.hpBar=add([fixed(),z(200),{_disp:s.hp,draw(){
                        const bx=width()/2-150,by=height()-47,r=4,W=300,H=20;
                        drawRect({pos:vec2(bx-2,by-2),width:W+4,height:H+4,radius:r+1,color:rgb(30,30,30)});
                        drawRect({pos:vec2(bx,by),width:W,height:H,radius:r,color:rgb(90,90,90)});
                        const t=this._disp/100;
                        const c=t>0.5?rgb(Math.round((1-t)*2*220),220,0):rgb(220,Math.round(t*2*220),0);
                        if(this._disp>0)drawRect({pos:vec2(bx,by),width:Math.max(W*(this._disp/100),r*2),height:H,radius:r,color:c});
                    }}]);
                    if (isMobile()) creaTouchUI();
                }
                p.sprite.hidden=false;
                if (p.hpBar) p.hpBar.hidden=false;

                if (s.hitFlash) {
                    p.sprite.color=rgb(255,255,255);
                    if (isMe) playHitSound();
                    setTimeout(()=>{ if(p.sprite) p.sprite.color=rgb(222,196,145); },80);
                }

                p.sprite.pos.x += (s.pos.x-p.sprite.pos.x)*lerp;
                p.sprite.pos.y += (s.pos.y-p.sprite.pos.y)*lerp;
                if (p.labelObj) {
                    p.labelObj.pos.x += (s.pos.x-p.labelObj.pos.x)*lerp;
                    p.labelObj.pos.y += (s.pos.y+41-p.labelObj.pos.y)*lerp;
                }
                if (p.hpBar) {
                    p.hpBar._disp += (s.hp-p.hpBar._disp)*0.15;
                    if (Math.abs(s.hp-p.hpBar._disp)<0.3) p.hpBar._disp=s.hp;
                }
                p.dirIndicator.angle=s.angle||0;
                p.dirIndicator.weapon=s.weapon||"gun";
                p.dirIndicator.visible=true;
            }
        }
    }

    const serverIds=new Set(state.proiettili.map(b=>b.id));
    for (const id in bulletSprites) {
        if (!serverIds.has(Number(id))) { destroy(bulletSprites[id]); delete bulletSprites[id]; }
    }
    for (const b of state.proiettili) {
        if (!bulletSprites[b.id]) {
            bulletSprites[b.id]=add([pos(b.pos.x,b.pos.y), anchor("center"), circle(3), color(rgb(255,200,0)), z(0)]);
        } else {
            bulletSprites[b.id].pos=vec2(b.pos.x,b.pos.y);
        }
    }
});

// ========================
// AVVIO — mostra subito schermata lobby
// ========================
// Aspetta che kaboom sia pronto, poi mostra la lobby
// (la lista arriva dal socket "lobbyList" in automatico)
setTimeout(() => {
    if (inLobbyScreen) mostraSchermataLobby();
}, 100);

drawOverlay();