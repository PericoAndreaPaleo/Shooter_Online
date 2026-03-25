// ========================
// GAME — stato, sparo, input, onUpdate
// ========================
import { state, GAME_W, GAME_H, hx, hy, hs, isMobile, cambiaArma } from "./state.js";
import { playShootSound, playHitSound, playKillSound, playKnifeSound, playDeathSound } from "./audio.js";
import {
    aggiornaHUDStats, aggiornaHUDAmmo, aggiornaHUDArma, aggiornaHUDPlayers,
    aggiornaLeaderboard, mostraKillFeed, killFeedList, killFeedObjs
} from "./hud.js";
import { aggiornaWeaponBtns, aggiornaReloadBtn, creaTouchUI } from "./touch.js";
import { triggerPunch } from "./weapons.js";

let _distruggiUI   = null;
let _mostraMenu    = null;

export function initGame(distruggiUI, mostraMenu) {
    _distruggiUI = distruggiUI;
    _mostraMenu  = mostraMenu;
}

// ========================
// INPUT TASTIERA
// ========================
const keyMap = { a: "left", d: "right", w: "up", s: "down" };

// ========================
// BARRA ESC — feedback visivo hold 1.5s
// ========================
const ESC_HOLD_MS = 1500;
let escTimer       = null;
let escAnimFrame   = null;
let escStartTime   = null;
let escBarObj      = null;

function creaEscBar() {
    rimuoviEscBar();
    escBarObj = add([fixed(), z(300), {
        draw() {
            if (!escStartTime) return;
            const progress = Math.min((performance.now() - escStartTime) / ESC_HOLD_MS, 1);
            const W = hs(220), H = hs(10), bx = hx(GAME_W / 2) - W / 2, by = hy(40);
            // Sfondo
            drawRect({ pos: vec2(bx, by), width: W, height: H, radius: hs(3), color: rgb(0,0,0), opacity: 0.6 });
            // Barra fill
            if (progress > 0)
                drawRect({ pos: vec2(bx, by), width: Math.round(W * progress), height: H, radius: hs(3), color: rgb(220, 60, 60), opacity: 0.9 });
            // Label
            const label = "Hold ESC to quit...";
            const sz = hs(13);
            drawText({ text: label, pos: vec2(hx(GAME_W / 2) - label.length * sz * 0.29, by + H + hs(5)), size: sz, color: rgb(220, 220, 220) });
        }
    }]);
}

function rimuoviEscBar() {
    if (escBarObj) { destroy(escBarObj); escBarObj = null; }
    escStartTime = null;
}

function annullaEsc() {
    if (escTimer)     { clearTimeout(escTimer);       escTimer     = null; }
    if (escAnimFrame) { cancelAnimationFrame(escAnimFrame); escAnimFrame = null; }
    rimuoviEscBar();
}

export function registraInputTastiera() {
    window.addEventListener("keydown", e => {
        if (e.key === "Escape" && !state.inMenu && !state.inLobbyScreen &&
            state.myId && state.players[state.myId] && !state.players[state.myId].morto && !escTimer) {
            // Avvia hold: mostra barra e spara selfKill dopo 1.5s
            escStartTime = performance.now();
            creaEscBar();
            escTimer = setTimeout(() => {
                annullaEsc();
                if (state.socket) state.socket.emit("selfKill");
            }, ESC_HOLD_MS);
        }
        if (state.inMenu || state.inLobbyScreen) return;
        const dir = keyMap[e.key.toLowerCase()];
        if (dir && !state.input[dir]) { state.input[dir] = true; state.socket.emit("input", state.input); }
        if (e.key === "1") { cambiaArma("gun");    }
        if (e.key === "2") { cambiaArma("pistol"); }
        if (e.key === "3") { cambiaArma("fists");  }
        if ((e.key === "r" || e.key === "R") && !state.isReloading && state.weapon !== "fists") {
            if (state.socket) state.socket.emit("reload");
        }
    });
    window.addEventListener("keyup", e => {
        // Rilascio ESC prima dei 1.5s → annulla tutto
        if (e.key === "Escape") annullaEsc();
        if (state.inMenu || state.inLobbyScreen) return;
        const dir = keyMap[e.key.toLowerCase()];
        if (dir && state.input[dir]) { state.input[dir] = false; state.socket.emit("input", state.input); }
    });
}

// ========================
// SPARO
// ========================
const PISTOL_COOLDOWN_MS = 200, AUTO_FIRE_MS = 100;
let myPunchCount = 0; // conta i pugni del proprio player per alternare le mani
let lastPistolShot = 0, lastAssaltoShot = 0, mouseDown = false;

export function shoot() {
    if (state.inMenu || state.inLobbyScreen || !state.socket || !state.myId || !state.players[state.myId] || state.players[state.myId].morto) return;
    if (state.weapon === "pistol") {
        const n = performance.now();
        if (n - lastPistolShot < PISTOL_COOLDOWN_MS) return;
        lastPistolShot = n;
    }
    const me  = state.players[state.myId].sprite;
    const mw  = toWorld(mousePos());
    const dir = { x: mw.x - me.pos.x, y: mw.y - me.pos.y };
    const len = Math.hypot(dir.x, dir.y); if (!len) return;
    const nx = dir.x / len, ny = dir.y / len;
    const angle   = Math.atan2(dir.y, dir.x);
    const tipDist = state.weapon === "fists" ? 0 : 24 + (state.weapon === "pistol" ? 10 : 40);
    state.socket.emit("aim",   angle);
    state.socket.emit("shoot", { dir, tipOffset: { x: nx * tipDist, y: ny * tipDist } });
    if (state.weapon !== "fists") playShootSound();
    else { playKnifeSound(); myPunchCount++; triggerPunch(state.myId, myPunchCount % 2 === 1 ? 1 : 0); }
}

function shootTouchJoy() {
    if (state.inMenu || state.inLobbyScreen || !state.socket || !state.myId || !state.players[state.myId] || state.players[state.myId].morto) return;
    if (!state.aimJoyActive) return;
    const nx = state.aimJoyDir.x, ny = state.aimJoyDir.y;
    if (!nx && !ny) return;
    const tipDist = state.weapon === "fists" ? 0 : 24 + (state.weapon === "pistol" ? 10 : 40);
    state.socket.emit("shoot", { dir: { x: nx, y: ny }, tipOffset: { x: nx * tipDist, y: ny * tipDist } });
    if (state.weapon !== "fists") playShootSound();
    else { playKnifeSound(); myPunchCount++; triggerPunch(state.myId, myPunchCount % 2 === 1 ? 1 : 0); }
}

export function registraEventiSparo(canvas) {
    function fireLoop() {
        const n = performance.now();
        if (mouseDown && state.weapon === "gun"   && n - lastAssaltoShot >= AUTO_FIRE_MS) { shoot(); lastAssaltoShot = n; }
        if (mouseDown && state.weapon === "fists" && n - lastAssaltoShot >= 800)          { shoot(); lastAssaltoShot = n; }
        if (state.aimJoyActive) {
            if (state.socket) state.socket.emit("aim", state.aimJoyAngle);
            const cooldown = state.weapon === "gun" ? AUTO_FIRE_MS : state.weapon === "fists" ? 800 : PISTOL_COOLDOWN_MS;
            if (n - lastPistolShot >= cooldown) { shootTouchJoy(); lastPistolShot = n; }
        }
        requestAnimationFrame(fireLoop);
    }
    requestAnimationFrame(fireLoop);

    window.addEventListener("mousedown", e => { if (e.button !== 0) return; mouseDown = true; shoot(); lastAssaltoShot = performance.now(); });
    window.addEventListener("mouseup",   e => { if (e.button !== 0) return; mouseDown = false; });

    onMouseMove(() => {
        if (isMobile()) return;
        if (state.inMenu || state.inLobbyScreen || !state.socket || !state.myId || !state.players[state.myId] || state.players[state.myId].morto) return;
        const me = state.players[state.myId].sprite, mw = toWorld(mousePos());
        state.socket.emit("aim", Math.atan2(mw.y - me.pos.y, mw.x - me.pos.x));
    });
}

// ========================
// onUpdate (camera + killfeed)
// ========================
export function registraOnUpdate() {
    onUpdate(() => {
        if (state.inMenu || state.inLobbyScreen || !state.myId || !state.players[state.myId]) return;
        if (!state.players[state.myId].morto) camPos(state.players[state.myId].sprite.pos.x, state.players[state.myId].sprite.pos.y);
        camScale(state.CAM_ZOOM);
        for (const o of killFeedObjs) destroy(o);
        killFeedObjs.length = 0;
        for (let i = killFeedList.length - 1; i >= 0; i--) {
            killFeedList[i].timer -= dt();
            if (killFeedList[i].timer <= 0) { killFeedList.splice(i, 1); continue; }
            killFeedObjs.push(add([
                text(killFeedList[i].msg, { size: hs(18) }),
                pos(hx(GAME_W / 2), hy(GAME_H - 80 - (killFeedList.length - 1 - i) * 28)),
                anchor("center"), color(rgb(255, 220, 80)),
                opacity(Math.min(1, killFeedList[i].timer)),
                fixed(), z(100)
            ]));
        }
    });
}

// ========================
// AGGIORNA STATO (state dal server)
// ========================
function creaHpBar(hp) {
    return add([fixed(), z(200), {
        _disp: hp,
        draw() {
            const bx = hx(GAME_W / 2 - 150), by = hy(GAME_H - 50), r = 4, W = hs(300), H = hs(28);
            drawRect({ pos: vec2(bx - 2, by - 2), width: W + 4, height: H + 4, radius: r + 1, color: rgb(30, 30, 30) });
            drawRect({ pos: vec2(bx, by),         width: W,     height: H,     radius: r,     color: rgb(90, 90, 90) });
            const t = this._disp / 100;
            const c = t > 0.5 ? rgb(Math.round((1 - t) * 2 * 220), 220, 0) : rgb(220, Math.round(t * 2 * 220), 0);
            if (this._disp > 0) drawRect({ pos: vec2(bx, by), width: Math.max(W * (this._disp / 100), r * 2), height: H, radius: r, color: c });
            const hpStr = `${Math.ceil(this._disp)} | 100`;
            const sz = hs(16), tw = hpStr.length * sz * 0.58;
            drawText({ text: hpStr, pos: vec2(bx + W / 2 - tw / 2, by + H / 2 - sz * 0.6), size: sz, color: rgb(255, 255, 255) });
        }
    }]);
}

export function aggiornaStato(state_arg, canvas) {
    // Nota: usiamo state_arg come alias locale per chiarezza, ma è lo stesso oggetto state
    if (!state.cameraInizializzata && state.myId && state_arg.players[state.myId] && !state.inMenu) {
        const s = state_arg.players[state.myId];
        camPos(s.pos.x, s.pos.y); camScale(state.CAM_ZOOM);
        state.cameraInizializzata = true;
    }
    if (state_arg.lb) aggiornaLeaderboard(state_arg.lb);
    if (state_arg.playerCount !== undefined) aggiornaHUDPlayers(state_arg.playerCount, state_arg.maxPlayers);
    if (state.myId && state_arg.players[state.myId] && state_arg.players[state.myId].ammo) {
        const a = state_arg.players[state.myId].ammo;
        if (a.gun !== state.myAmmo.gun || a.pistol !== state.myAmmo.pistol) {
            state.myAmmo = a; aggiornaHUDAmmo(); aggiornaReloadBtn();
        }
    }

    // Rimuovi player non più presenti
    for (const id in state.players) {
        if (!state_arg.players[id]) {
            if (state.players[id].labelObj) destroy(state.players[id].labelObj);
            if (state.players[id].hpBar)    destroy(state.players[id].hpBar);
            if (state.players[id].sprite)   destroy(state.players[id].sprite);
            delete state.players[id];
        }
    }

    for (const id in state_arg.players) {
        const s    = state_arg.players[id];
        const isMe = (id === state.myId);

        if (isMe && s.morto && state.players[id] && !state.players[id].morto && !state.inMenu) {
            state.myDeaths++;
            aggiornaHUDStats(); playDeathSound();
            _mostraMenu("You were eliminated!");
        }

        if (!state.players[id]) {
            if (s.morto) continue;
            const sprite   = add([pos(s.pos.x, s.pos.y), anchor("center"), circle(24), color(rgb(222, 196, 145)), outline(4, rgb(0, 0, 0)), z(1)]);
            const labelObj = isMe ? add([pos(s.pos.x, s.pos.y - 40), anchor("center"), text(state.myNickname || "TU", { size: 17 }), color(rgb(0, 220, 255)), z(0.5)]) : null;
            const hpBar    = isMe ? creaHpBar(s.hp) : null;
            state.players[id] = { sprite, labelObj, hpBar, dirIndicator: { angle: s.angle || 0, visible: true, weapon: s.weapon || "gun" }, morto: s.morto, lastPunchCount: s.punchCount || 0, punchStartTime: null, punchHand: 1 };
            if (isMe) {
                _distruggiUI(); state.inMenu = false; state.cameraInizializzata = false;
                // Azzera input prima di emettere, così il player non si muove da solo
                Object.assign(state.input, { left: false, right: false, up: false, down: false });
                state.prevInput = ""; state.socket.emit("input", state.input);
                if (isMobile()) creaTouchUI();
            }
        } else {
            const lerp = isMe ? 0.8 : 0.3;
            const p    = state.players[id];
            const eraMorto = p.morto;
            p.morto = s.morto;

            if (s.morto) {
                p.sprite.hidden = true;
                if (p.labelObj) p.labelObj.hidden = true;
                if (p.hpBar)    p.hpBar.hidden    = true;
                p.dirIndicator.visible = false;
            }

            if (!s.morto) {
                if (isMe && eraMorto) {
                    _distruggiUI(); state.inMenu = false; state.cameraInizializzata = false;
                    // Azzera input: i tasti tenuti premuti durante la morte non devono muovere il player
                    Object.assign(state.input, { left: false, right: false, up: false, down: false });
                    state.prevInput = ""; state.socket.emit("input", state.input);
                    canvas.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }));
                    p.hpBar = creaHpBar(s.hp);
                    // Ricreo il labelObj con il nickname aggiornato (era nascosto dopo la morte)
                    if (p.labelObj) destroy(p.labelObj);
                    p.labelObj = add([pos(s.pos.x, s.pos.y - 40), anchor("center"), text(state.myNickname || "TU", { size: 17 }), color(rgb(0, 220, 255)), z(0.5)]);
                    if (isMobile()) creaTouchUI();
                }
                p.sprite.hidden = false;
                if (p.hpBar) p.hpBar.hidden = false;
                if (s.hitFlash) {
                    p.sprite.color = rgb(255, 255, 255);
                    if (isMe) playHitSound();
                    setTimeout(() => { if (p.sprite) p.sprite.color = rgb(222, 196, 145); }, 80);
                }
                // Animazione pugno per i player avversari — confronta contatore
                if (!isMe && s.punchCount && s.punchCount !== p.lastPunchCount) {
                    p.lastPunchCount = s.punchCount;
                    triggerPunch(id, s.punchHand ?? 1);
                }
                p.sprite.pos.x += (s.pos.x - p.sprite.pos.x) * lerp;
                p.sprite.pos.y += (s.pos.y - p.sprite.pos.y) * lerp;
                if (p.labelObj) {
                    p.labelObj.pos.x += (s.pos.x - p.labelObj.pos.x) * lerp;
                    p.labelObj.pos.y += (s.pos.y + 41 - p.labelObj.pos.y) * lerp;
                }
                if (p.hpBar) {
                    p.hpBar._disp += (s.hp - p.hpBar._disp) * 0.15;
                    if (Math.abs(s.hp - p.hpBar._disp) < 0.3) p.hpBar._disp = s.hp;
                }
                p.dirIndicator.angle  = s.angle  || 0;
                p.dirIndicator.weapon = s.weapon || "gun";
                p.dirIndicator.visible = true;
            }
        }
    }

    // Proiettili
    const serverIds = new Set(state_arg.proiettili.map(b => b.id));
    for (const id in state.bulletSprites) {
        if (!serverIds.has(Number(id))) { destroy(state.bulletSprites[id]); delete state.bulletSprites[id]; }
    }
    const nowBullet = Date.now();
    for (const b of state_arg.proiettili) {
        if (!state.bulletSprites[b.id]) {
            const hdx = b.dir.x, hdy = b.dir.y;
            state.bulletSprites[b.id] = add([pos(b.pos.x, b.pos.y), z(3), {
                _hdx: hdx, _hdy: hdy, _born: nowBullet,
                draw() {
                    const len = 18, thick = 3.5;
                    drawLine({ p1: vec2(-this._hdx * (len / 2 + 1), -this._hdy * (len / 2 + 1)), p2: vec2(this._hdx * (len / 2 + 1), this._hdy * (len / 2 + 1)), width: thick + 2, color: rgb(80, 60, 20), opacity: 0.35 });
                    drawLine({ p1: vec2(-this._hdx * len / 2, -this._hdy * len / 2), p2: vec2(this._hdx * len / 2, this._hdy * len / 2), width: thick, color: rgb(220, 195, 140) });
                    drawLine({ p1: vec2(-this._hdx * len * 0.3, -this._hdy * len * 0.3), p2: vec2(this._hdx * len * 0.3, this._hdy * len * 0.3), width: thick * 0.45, color: rgb(245, 230, 185) });
                }
            }]);
        } else {
            if (nowBullet - state.bulletSprites[b.id]._born >= 500) {
                destroy(state.bulletSprites[b.id]); delete state.bulletSprites[b.id];
            } else {
                state.bulletSprites[b.id].pos = vec2(b.pos.x, b.pos.y);
            }
        }
    }
}