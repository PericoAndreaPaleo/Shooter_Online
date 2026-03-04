import kaboom from "./lib/kaboom.mjs";

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
// OVERLAY CANVAS — braccia + pistola arrotondata
// Disegniamo sopra Kaboom con un canvas HTML2D sincronizzato
// ========================
const overlayCanvas = document.createElement("canvas");
overlayCanvas.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:10;";
overlayCanvas.width = window.innerWidth;
overlayCanvas.height = window.innerHeight;
document.body.appendChild(overlayCanvas);
const octx = overlayCanvas.getContext("2d");

window.addEventListener("resize", () => {
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;
});

// Converte coordinate mondo Kaboom -> schermo
function worldToScreen(wx, wy) {
    const cam = camPos();
    const zoom = camScale().x;
    const sx = (wx - cam.x) * zoom + window.innerWidth  / 2;
    const sy = (wy - cam.y) * zoom + window.innerHeight / 2;
    return { x: sx, y: sy };
}

// Disegna braccia (cerchi beige) + pistola nera arrotondata
// ========================
// ARMA E MANI — Kaboom onDraw a z(1), sotto cespugli z(2)
// ========================
let gunDrawObj = null;

function creaGunDrawObj() {
    if (gunDrawObj) destroy(gunDrawObj);
    gunDrawObj = add([
        pos(0, 0),
        z(1.5),
        {
            draw() {
                if (inMenu || !myId) return;
                for (const id in players) {
                    const p = players[id];
                    if (!p || p.morto || !p.dirIndicator || !p.sprite) continue;

                    // Solo il nome scompare nei cespugli
                    let neiCespugli = false;
                    for (const o of ostacoliSopra) {
                        if (Math.hypot(p.sprite.pos.x - o.x, p.sprite.pos.y - o.y) < o.r) {
                            neiCespugli = true; break;
                        }
                    }
                    if (p.labelObj) p.labelObj.hidden = neiCespugli;
                    if (p.hpBar)    p.hpBar.hidden    = neiCespugli;

                    const angle = p.dirIndicator.angle || 0;
                    const wtype = (id === myId) ? weapon : (p.dirIndicator.weapon || "gun");
                    const px = p.sprite.pos.x;
                    const py = p.sprite.pos.y;
                    const R = 24;
                    const cos = Math.cos(angle);
                    const sin = Math.sin(angle);
                    const perp = { x: -sin, y: cos };

                    // Helper: cerchio con bordo nero (due cerchi sovrapposti)
                    const drawHand = (hx, hy, r) => {
                        drawCircle({ pos: vec2(hx, hy), radius: r + 2, color: rgb(0,0,0) });
                        drawCircle({ pos: vec2(hx, hy), radius: r, color: rgb(222, 196, 145) });
                    };

                    if (wtype === "fists") {
                        // Mani più indietro verso il ventre, meno laterali
                        const fistDist = R + 2;
                        for (const side of [-1, 1]) {
                            const fx = px + cos * fistDist + perp.x * 17 * side;
                            const fy = py + sin * fistDist + perp.y * 17 * side;
                            drawHand(fx, fy, 8);
                        }
                    } else {
                        // Arma: 60px
                        const gunW = 60, gunH = 9, gunRad = 4;
                        drawRect({
                            pos: vec2(px + cos * R, py + sin * R),
                            width: gunW, height: gunH,
                            color: rgb(17, 17, 17),
                            radius: gunRad,
                            angle: angle * (180 / Math.PI),
                            anchor: "left",
                            offset: vec2(0, -gunH / 2),
                        });
                        // Mano 1 (vicina): lato canna
                        drawHand(px + cos*(R+2) - perp.x*3, py + sin*(R+2) - perp.y*3, 7);
                        // Mano 2 (lontana): lato opposto
                        drawHand(px + cos*(R+30) + perp.x*5, py + sin*(R+30) + perp.y*5, 7);
                    }
                }
            }
        }
    ]);
}

// Overlay canvas vuoto (tenuto per compatibilità con il resto del codice)
function drawOverlay() {
    requestAnimationFrame(drawOverlay);
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}


const CAM_ZOOM = 1;
const socket = io();

let myId = null;
let mapSize = { width: 5000, height: 5000 };
let ostacoliSopra = [];
let cameraInizializzata = false;
let inMenu = true;
let myNickname = "";

const players = {};
const bulletSprites = {};
const input = { left: false, right: false, up: false, down: false };
let prevInput = "";
let weapon = "gun"; // "gun" | "fists"

// ========================
// FIX #12 — Audio con Web Audio API (nessuna dipendenza)
// ========================
let audioCtx = null;
function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}
function playShootSound() {
    try {
        const ctx = getAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "square";
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12);
    } catch (e) {}
}
function playHitSound() {
    try {
        const ctx = getAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
}
function playDeathSound() {
    try {
        const ctx = getAudio();
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 200 - i * 50;
            gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.2);
            osc.start(ctx.currentTime + i * 0.1);
            osc.stop(ctx.currentTime + i * 0.1 + 0.2);
        }
    } catch (e) {}
}
function playKillSound() {
    try {
        const ctx = getAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
}

// ========================
// UI Layer
// ========================
const uiLayer = [];

function distruggiUI() {
    nascondiElementiHTML();
    for (const o of uiLayer) destroy(o);
    uiLayer.length = 0;
}

// ========================
// FIX #5 — Menu con input nickname (FIX #2 — niente reload hack)
// ========================
let htmlContainer = null;

function nascondiElementiHTML() {
    if (htmlContainer) { htmlContainer.remove(); htmlContainer = null; }
}

function mostraMenu(titolo, sottotitolo) {
    distruggiUI();
    inMenu = true;

    uiLayer.push(add([
        rect(width(), height()),
        pos(0, 0), color(rgb(5, 10, 5)), opacity(0.88),
        fixed(), z(200),
    ]));
    uiLayer.push(add([
        text("SHOOTER ONLINE", { size: 52 }),
        pos(width() / 2, height() / 2 - 160),
        anchor("center"), color(rgb(0, 255, 100)),
        fixed(), z(201),
    ]));
    if (sottotitolo) {
        uiLayer.push(add([
            text(sottotitolo, { size: 26 }),
            pos(width() / 2, height() / 2 - 90),
            anchor("center"), color(rgb(220, 80, 80)),
            fixed(), z(201),
        ]));
    }

    // Container HTML per nickname + bottone
    htmlContainer = document.createElement("div");
    htmlContainer.style.cssText = `
        position: fixed; left: 50%; top: 50%;
        transform: translate(-50%, -10px);
        display: flex; flex-direction: column; align-items: center; gap: 12px;
        z-index: 9999;
    `;

    const input_nick = document.createElement("input");
    input_nick.type = "text";
    input_nick.placeholder = "Il tuo nickname...";
    input_nick.maxLength = 12;
    input_nick.value = myNickname || "";
    input_nick.style.cssText = `
        width: 200px; height: 44px; font-size: 20px;
        background: #111; color: #0f0; border: 2px solid #0f0;
        border-radius: 6px; text-align: center; font-family: monospace;
        outline: none; letter-spacing: 1px;
    `;

    const btn = document.createElement("button");
    btn.textContent = "GIOCA";
    btn.style.cssText = `
        width: 200px; height: 56px;
        background: rgb(0,180,70); color: white;
        font-size: 28px; font-weight: bold;
        border: none; border-radius: 6px;
        cursor: pointer; font-family: monospace;
        letter-spacing: 2px;
    `;
    btn.addEventListener("click", () => {
        const nick = input_nick.value.trim().slice(0, 12) || "Player";
        myNickname = nick;
        socket.emit("setNickname", nick);
        nascondiElementiHTML();
        distruggiUI();
        socket.emit("spawn");
    });
    input_nick.addEventListener("keydown", (e) => {
        if (e.key === "Enter") btn.click();
    });

    htmlContainer.appendChild(input_nick);
    htmlContainer.appendChild(btn);
    document.body.appendChild(htmlContainer);
    setTimeout(() => input_nick.focus(), 50);
}

// ========================
// FIX #4 — Kill feed e leaderboard HUD
// ========================
const killFeedList = [];
let killFeedObjs = [];
let leaderboardObjs = [];
let hudKillsObj = null;
let myKills = 0;
let myDeaths = 0;

let hudWeaponObj = null;
function aggiornaHUDArma() {
    if (hudWeaponObj) destroy(hudWeaponObj);
    hudWeaponObj = add([
        text(weapon === "gun" ? "[1] Assalto  3: Pugni" : "1: Assalto  [3] Pugni", { size: 14 }),
        pos(14, height() - 52),
        color(rgb(255, 220, 80)),
        fixed(), z(100),
    ]);
}
function aggiornaHUDStats() {
    if (hudKillsObj) destroy(hudKillsObj);
    hudKillsObj = add([
        text(`K: ${myKills}  M: ${myDeaths}`, { size: 16 }),
        pos(14, height() - 30),
        color(rgb(0, 255, 100)),
        fixed(), z(100),
    ]);
}

function mostraKillFeed(msg) {
    killFeedList.unshift({ msg, timer: 3.5 });
    if (killFeedList.length > 5) killFeedList.pop();
}

function aggiornaLeaderboard(lb) {
    for (const o of leaderboardObjs) destroy(o);
    leaderboardObjs = [];
    if (!lb || lb.length === 0) return;

    leaderboardObjs.push(add([
        text("CLASSIFICA", { size: 14 }),
        pos(width() - 160, 14),
        color(rgb(255, 220, 0)),
        fixed(), z(100),
    ]));
    lb.forEach((entry, i) => {
        leaderboardObjs.push(add([
            text(`${i + 1}. ${entry.nickname}  ${entry.kills}K`, { size: 13 }),
            pos(width() - 160, 34 + i * 18),
            color(i === 0 ? rgb(255, 220, 0) : rgb(200, 200, 200)),
            fixed(), z(100),
        ]));
    });
}

// ========================
// INPUT tastiera (fix #2 — no reload hack)
// ========================
const keyMap = { "a": "left", "d": "right", "w": "up", "s": "down" };
window.addEventListener("keydown", (e) => {
    if (inMenu) return;
    const dir = keyMap[e.key.toLowerCase()];
    if (dir && !input[dir]) {
        input[dir] = true;
        socket.emit("input", input);
        prevInput = JSON.stringify(input);
    }
    // Cambio arma
    if (e.key === "1") { weapon = "gun";   socket.emit("setWeapon", "gun");   aggiornaHUDArma(); }
    if (e.key === "3") { weapon = "fists"; socket.emit("setWeapon", "fists"); aggiornaHUDArma(); }
});
window.addEventListener("keyup", (e) => {
    if (inMenu) return;
    const dir = keyMap[e.key.toLowerCase()];
    if (dir && input[dir]) {
        input[dir] = false;
        socket.emit("input", input);
        prevInput = JSON.stringify(input);
    }
});

// ========================
// FIX #9 — Controlli touch mobile (joystick virtuale)
// ========================
let touchJoystick = null;
let touchMoveId = null;
let joystickCenter = { x: 0, y: 0 };
const JOYSTICK_DEAD = 20;
const JOYSTICK_MAX = 60;

function aggiornaDirezioneTouch(cx, cy, tx, ty) {
    const dx = tx - cx, dy = ty - cy;
    const dist = Math.hypot(dx, dy);
    const newInput = {
        left: dx < -JOYSTICK_DEAD,
        right: dx > JOYSTICK_DEAD,
        up: dy < -JOYSTICK_DEAD,
        down: dy > JOYSTICK_DEAD
    };
    const changed = JSON.stringify(newInput) !== JSON.stringify(input);
    Object.assign(input, newInput);
    if (changed) {
        socket.emit("input", input);
        prevInput = JSON.stringify(input);
    }
    return { dx: Math.max(-JOYSTICK_MAX, Math.min(JOYSTICK_MAX, dx)), dy: Math.max(-JOYSTICK_MAX, Math.min(JOYSTICK_MAX, dy)) };
}

window.addEventListener("touchstart", (e) => {
    if (inMenu) return;
    for (const touch of e.changedTouches) {
        if (touch.clientX < window.innerWidth / 2 && touchMoveId === null) {
            touchMoveId = touch.identifier;
            joystickCenter = { x: touch.clientX, y: touch.clientY };
            if (!touchJoystick) {
                touchJoystick = document.createElement("canvas");
                touchJoystick.style.cssText = `position:fixed;pointer-events:none;z-index:500;`;
                touchJoystick.width = JOYSTICK_MAX * 2 + 40;
                touchJoystick.height = JOYSTICK_MAX * 2 + 40;
                document.body.appendChild(touchJoystick);
            }
            touchJoystick.style.left = (joystickCenter.x - JOYSTICK_MAX - 20) + "px";
            touchJoystick.style.top = (joystickCenter.y - JOYSTICK_MAX - 20) + "px";
            disegnaJoystick(0, 0);
        } else if (touch.clientX >= window.innerWidth / 2) {
            // Tocco destra = sparo
            shoot();
        }
    }
}, { passive: true });

window.addEventListener("touchmove", (e) => {
    if (inMenu) return;
    for (const touch of e.changedTouches) {
        if (touch.identifier === touchMoveId) {
            const { dx, dy } = aggiornaDirezioneTouch(joystickCenter.x, joystickCenter.y, touch.clientX, touch.clientY);
            disegnaJoystick(dx, dy);
            // Invia angolo di mira approssimativo basato su tocco destra
        }
    }
}, { passive: true });

window.addEventListener("touchend", (e) => {
    for (const touch of e.changedTouches) {
        if (touch.identifier === touchMoveId) {
            touchMoveId = null;
            Object.assign(input, { left: false, right: false, up: false, down: false });
            socket.emit("input", input);
            if (touchJoystick) { touchJoystick.remove(); touchJoystick = null; }
        }
    }
}, { passive: true });

function disegnaJoystick(dx, dy) {
    if (!touchJoystick) return;
    const ctx = touchJoystick.getContext("2d");
    const cx = JOYSTICK_MAX + 20, cy = JOYSTICK_MAX + 20;
    ctx.clearRect(0, 0, touchJoystick.width, touchJoystick.height);
    ctx.beginPath(); ctx.arc(cx, cy, JOYSTICK_MAX, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 20, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fill();
}

// ========================
// SPARO
// ========================
function shoot() {
    if (inMenu || !myId || !players[myId] || players[myId].morto) return;
    if (weapon === "fists") return;
    const me = players[myId].sprite;
    const mworld = toWorld(mousePos());
    const dir = { x: mworld.x - me.pos.x, y: mworld.y - me.pos.y };
    const angle = Math.atan2(dir.y, dir.x);
    socket.emit("aim", angle);
    socket.emit("shoot", { dir });
    playShootSound();
}

// Assalto: sparo automatico tenendo premuto il mouse
let mouseDown = false;
let autoFireInterval = null;
const AUTO_FIRE_MS = 120; // ~8 colpi/sec

window.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    mouseDown = true;
    shoot(); // sparo immediato al click
    autoFireInterval = setInterval(shoot, AUTO_FIRE_MS);
});
window.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;
    mouseDown = false;
    clearInterval(autoFireInterval);
    autoFireInterval = null;
});

// ========================
// Aggiorno angolo di mira (fix #13)
// ========================
onMouseMove(() => {
    if (inMenu || !myId || !players[myId] || players[myId].morto) return;
    const me = players[myId].sprite;
    const mworld = toWorld(mousePos());
    const angle = Math.atan2(mworld.y - me.pos.y, mworld.x - me.pos.x);
    socket.emit("aim", angle);
});

// ========================
// INIT
// ========================
socket.on("init", ({ id, map, ostacoli }) => {
    if (!sessionStorage.getItem("reloaded")) {
        sessionStorage.setItem("reloaded", "1");
        location.reload();
        return;
    }
    myId = id;
    mapSize = map;
    ostacoliSopra = ostacoli.filter(o => o.type === "cespuglio" || o.type === "albero");

    const spiaggia = 80;
    add([pos(-5000, -5000), rect(map.width + 10000, map.height + 10000), color(rgb(40, 140, 210)), z(-12)]);
    add([pos(-spiaggia, -spiaggia), rect(map.width + spiaggia * 2, map.height + spiaggia * 2), color(rgb(230, 200, 100)), z(-11)]);
    add([pos(0, 0), rect(map.width, map.height), color(rgb(60, 120, 40)), z(-10)]);

    for (const o of ostacoli) {
        if (o.type === "roccia") {
            add([pos(o.x, o.y), anchor("center"), circle(o.r), color(rgb(110, 110, 110)), outline(3, rgb(60, 60, 60)), z(2)]);
        }
    }
    for (const o of ostacoli) {
        if (o.type === "albero") {
            add([pos(o.x, o.y), anchor("center"), circle(o.r), color(rgb(20, 75, 15)), outline(4, rgb(10, 45, 8)), z(2)]);
            add([pos(o.x, o.y), anchor("center"), circle(o.rCollisione), color(rgb(80, 50, 20)), z(2)]);
        }
    }
    for (const o of ostacoli) {
        if (o.type === "cespuglio") {
            add([pos(o.x, o.y), anchor("center"), circle(o.r), color(rgb(100, 200, 40)), outline(2, rgb(60, 140, 20)), z(2)]);
        }
    }

    aggiornaHUDStats();
    aggiornaHUDArma();
    creaGunDrawObj();
    mostraMenu();
});

// ========================
// FIX #4 — Kill confirm dal server
// ========================
socket.on("killConfirm", ({ victim }) => {
    myKills++;
    aggiornaHUDStats();
    mostraKillFeed(`Hai eliminato ${victim}!`);
    playKillSound(); // fix #12
});

// ========================
// onUpdate
// ========================
let killFeedTimer = 0;

onUpdate(() => {
    if (inMenu || !myId || !players[myId]) return;

    if (!players[myId].morto) {
        camPos(players[myId].sprite.pos.x, players[myId].sprite.pos.y);
    }
    camScale(CAM_ZOOM);



    // Fix #4 — kill feed HUD
    killFeedTimer += dt();
    for (const o of killFeedObjs) destroy(o);
    killFeedObjs = [];
    for (let i = killFeedList.length - 1; i >= 0; i--) {
        killFeedList[i].timer -= dt();
        if (killFeedList[i].timer <= 0) { killFeedList.splice(i, 1); continue; }
        const alpha = Math.min(1, killFeedList[i].timer);
        killFeedObjs.push(add([
            text(killFeedList[i].msg, { size: 15 }),
            pos(width() / 2, height() - 60 - (killFeedList.length - 1 - i) * 22),
            anchor("center"),
            color(rgb(255, 220, 80)),
            opacity(alpha),
            fixed(), z(100),
        ]));
    }
});

// ========================
// STATO DAL SERVER
// ========================
socket.on("state", (state) => {
    if (!cameraInizializzata && myId && state.players[myId] && !inMenu) {
        const s = state.players[myId];
        camPos(s.pos.x, s.pos.y);
        camScale(CAM_ZOOM);
        cameraInizializzata = true;
    }

    // Aggiorna leaderboard (fix #4)
    if (state.lb) aggiornaLeaderboard(state.lb);

    // Rimuovi player disconnessi
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
        const s = state.players[id];
        const isMe = (id === myId);

        if (isMe && s.morto && players[id] && !players[id].morto && !inMenu) {
            myDeaths++;
            aggiornaHUDStats();
            playDeathSound(); // fix #12
            mostraMenu(null, "Sei stato eliminato! Respawn tra 3 secondi...");
        }

        if (!players[id]) {
            if (s.morto) continue;

            // Corpo: cerchio beige (bordo nero disegnato nell'overlay)
            const sprite = add([
                pos(s.pos.x, s.pos.y),
                anchor("center"),
                circle(24),
                color(rgb(222, 196, 145)),
                outline(4, rgb(0, 0, 0)),
                z(1),
            ]);
            const spriteInner = null;

            // Pistola e braccia: gestite da overlayCanvas ogni frame
            const dirIndicator = { angle: s.angle || 0, visible: true };

            // fix #5 — nickname leggibile (non socket id)
            const labelObj = add([
                pos(s.pos.x, s.pos.y - 32),
                anchor("center"),
                text(isMe ? (myNickname || "TU") : (s.nickname || id.slice(0, 4)), { size: 13 }),
                color(isMe ? rgb(0, 255, 100) : rgb(220, 80, 80)),
                z(3),
            ]);

            const hpBar = isMe ? add([
                pos(s.pos.x - 25, s.pos.y - 44),
                rect(50 * (s.hp / 100), 6),
                color(rgb(0, 220, 0)),
                z(3),
            ]) : null;

            players[id] = { sprite, spriteInner, labelObj, hpBar, dirIndicator, morto: s.morto };

            if (isMe) {
                distruggiUI();
                inMenu = false;
                cameraInizializzata = false;
                prevInput = "";
                socket.emit("input", input);
            }

        } else {
            const lerp = isMe ? 0.8 : 0.3;
            const p = players[id];
            const eraMorto = p.morto;
            p.morto = s.morto;

            if (s.morto) {
                p.labelObj.hidden = true;
                if (p.hpBar) p.hpBar.hidden = true;
                p.dirIndicator.visible = false;
            }

            if (!s.morto) {
                // Respawn: chiudo menu se sono io
                if (isMe && eraMorto) {
                    distruggiUI();
                    inMenu = false;
                    cameraInizializzata = false;
                    prevInput = "";
                    canvas.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }));
                }

                // fix #6 — hit flash
                if (s.hitFlash) {
                    p.sprite.color = rgb(255, 255, 255);
                    if (isMe) playHitSound();
                    setTimeout(() => {
                        if (p.sprite) p.sprite.color = rgb(222, 196, 145);
                    }, 80);
                }

                p.sprite.pos.x += (s.pos.x - p.sprite.pos.x) * lerp;
                p.sprite.pos.y += (s.pos.y - p.sprite.pos.y) * lerp;
                if (p.spriteInner) {
                    p.spriteInner.pos.x = p.sprite.pos.x;
                    p.spriteInner.pos.y = p.sprite.pos.y;
                }

                p.labelObj.pos.x += (s.pos.x - p.labelObj.pos.x) * lerp;
                p.labelObj.pos.y += (s.pos.y - 32 - p.labelObj.pos.y) * lerp;
                // fix #5 — aggiorno nickname in tempo reale
                if (!isMe && s.nickname) p.labelObj.text = s.nickname;

                if (p.hpBar) {
                    p.hpBar.pos.x = p.sprite.pos.x - 25;
                    p.hpBar.pos.y = p.sprite.pos.y - 44;
                    p.hpBar.width = 50 * (s.hp / 100);
                }

                // fix #13 — aggiorno angolo pistola (disegnata da overlayCanvas)
                p.dirIndicator.angle = s.angle || 0;
                p.dirIndicator.weapon = s.weapon || "gun";
                p.dirIndicator.visible = true;
            }
        }
    }

    // Proiettili
    const serverBulletIds = new Set(state.proiettili.map(b => b.id));
    for (const id in bulletSprites) {
        if (!serverBulletIds.has(Number(id))) {
            destroy(bulletSprites[id]);
            delete bulletSprites[id];
        }
    }
    for (const b of state.proiettili) {
        if (!bulletSprites[b.id]) {
            bulletSprites[b.id] = add([
                pos(b.pos.x, b.pos.y),
                anchor("center"),
                circle(3),
                color(rgb(255, 200, 0)),
                z(0),
            ]);
        } else {
            bulletSprites[b.id].pos = vec2(b.pos.x, b.pos.y);
        }
    }
});

drawOverlay();