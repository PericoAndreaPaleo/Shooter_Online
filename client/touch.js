// ========================
// TOUCH UI — doppio joystick
// ========================
import { state, GAME_H, hx, hy, hs, isMobile, cambiaArma } from "./state.js";
import { aggiornaHUDArma, aggiornaHUDAmmo } from "./hud.js";

const JOYSTICK_R = 35, KNOB_R = 14, DEAD_ZONE = 8;

let moveJoyEl = null, moveJoyTouchId = null, moveJoyCenter = { x: 0, y: 0 };
let aimJoyEl  = null, aimJoyTouchId  = null, aimJoyCenter  = { x: 0, y: 0 };

export let weaponBtns = [];
export let reloadBtn  = null;

export function aggiornaWeaponBtns() {
    weaponBtns.forEach(b => {
        const a = b.dataset.weapon === state.weapon;
        b.style.borderColor = a ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.3)";
        b.style.transform   = a ? "scale(1.12)" : "scale(1)";
    });
}

export function aggiornaReloadBtn() {
    if (!reloadBtn) return;
    if (state.isReloading) {
        reloadBtn.textContent = "...";
        reloadBtn.style.opacity = "0.5";
    } else if (state.myAmmo[state.weapon] === 0) {
        reloadBtn.textContent = "[R]";
        reloadBtn.style.opacity = "1";
        reloadBtn.style.color = "#f55";
    } else {
        reloadBtn.textContent = "[R]";
        reloadBtn.style.opacity = "0.7";
        reloadBtn.style.color = "white";
    }
}

function creaCanvasJoystick(lato) {
    const el = document.createElement("canvas");
    el.width  = (JOYSTICK_R + 10) * 2;
    el.height = (JOYSTICK_R + 10) * 2;
    if (lato === "left") {
        el.style.cssText = `position:fixed;left:24px;bottom:24px;pointer-events:none;z-index:500;opacity:0.8;`;
    } else {
        el.style.cssText = `position:fixed;right:24px;bottom:24px;pointer-events:none;z-index:500;opacity:0.8;`;
    }
    document.body.appendChild(el);
    return el;
}

function disegnaJoy(el, dx, dy, coloreKnob) {
    if (!el) return;
    const ctx = el.getContext("2d"), cx = JOYSTICK_R + 10, cy = JOYSTICK_R + 10;
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.beginPath(); ctx.arc(cx, cy, JOYSTICK_R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2.5; ctx.stroke();
    const maxDist  = JOYSTICK_R - KNOB_R;
    const dist     = Math.hypot(dx, dy);
    const clampedDx = dist > maxDist ? (dx / dist) * maxDist : dx;
    const clampedDy = dist > maxDist ? (dy / dist) * maxDist : dy;
    ctx.beginPath(); ctx.arc(cx + clampedDx, cy + clampedDy, KNOB_R, 0, Math.PI * 2);
    ctx.fillStyle   = coloreKnob || "rgba(255,255,255,0.7)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2; ctx.stroke();
}

export function creaTouchUI() {
    if (!isMobile() || moveJoyEl) return;

    moveJoyEl = creaCanvasJoystick("left");
    moveJoyCenter = { x: 24 + JOYSTICK_R + 10, y: window.innerHeight - 24 - JOYSTICK_R - 10 };
    disegnaJoy(moveJoyEl, 0, 0, "rgba(255,255,255,0.7)");

    aimJoyEl = creaCanvasJoystick("right");
    aimJoyCenter = { x: window.innerWidth - 24 - JOYSTICK_R - 10, y: window.innerHeight - 24 - JOYSTICK_R - 10 };
    disegnaJoy(aimJoyEl, 0, 0, "rgba(255,100,100,0.8)");

    if (!weaponBtns.length) {
        const barTop   = hy(GAME_H - 44);
        const bottomPx = Math.round(window.innerHeight - barTop + 8);
        const bSize = 28, gap = 8;

        [{ key: "gun", label: "AR", color: "#e55" }, { key: "pistol", label: "PI", color: "#e93" }, { key: "fists", label: "KN", color: "#333" }].forEach((w, i) => {
            const totalW = 3 * bSize + 2 * gap;
            const lp = Math.round(window.innerWidth / 2 - totalW / 2) + i * (bSize + gap);
            const btn = document.createElement("button");
            btn.textContent   = w.label;
            btn.dataset.weapon = w.key;
            btn.style.cssText = `position:fixed;left:${lp}px;bottom:${bottomPx}px;width:${bSize}px;height:${bSize}px;background:${w.color};color:white;font-size:10px;font-weight:bold;border:1px solid rgba(255,255,255,0.3);border-radius:4px;cursor:pointer;z-index:600;opacity:0.9;font-family:monospace;padding:0;line-height:${bSize}px;text-align:center;`;
            btn.addEventListener("touchstart", e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
            btn.addEventListener("touchend", e => {
                e.preventDefault(); e.stopPropagation();
                cambiaArma(w.key);
            }, { passive: false });
            document.body.appendChild(btn);
            weaponBtns.push(btn);
        });

        const totalWArma = 3 * bSize + 2 * gap;
        const reloadLeft = Math.round(window.innerWidth / 2 - totalWArma / 2) + totalWArma + 10;
        reloadBtn = document.createElement("button");
        reloadBtn.textContent = "[R]";
        reloadBtn.style.cssText = `position:fixed;left:${reloadLeft}px;bottom:${bottomPx}px;width:${bSize}px;height:${bSize}px;background:rgba(30,30,30,0.8);color:white;font-size:9px;font-weight:bold;border:1px solid rgba(255,255,255,0.3);border-radius:4px;cursor:pointer;z-index:600;opacity:0.7;font-family:monospace;padding:0;line-height:${bSize}px;text-align:center;`;
        reloadBtn.addEventListener("touchstart", e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
        reloadBtn.addEventListener("touchend", e => {
            e.preventDefault(); e.stopPropagation();
            if (!state.isReloading && state.weapon !== "fists" && state.socket) state.socket.emit("reload");
        }, { passive: false });
        document.body.appendChild(reloadBtn);
    }
    aggiornaWeaponBtns();
    aggiornaReloadBtn();
}

export function rimuoviTouchUI() {
    if (moveJoyEl) { moveJoyEl.remove(); moveJoyEl = null; }
    if (aimJoyEl)  { aimJoyEl.remove();  aimJoyEl  = null; }
    weaponBtns.forEach(b => b.remove());
    weaponBtns = [];
    if (reloadBtn) { reloadBtn.remove(); reloadBtn = null; }
    moveJoyTouchId = null; aimJoyTouchId = null;
    state.aimJoyActive = false; state.aimJoyDir = { x: 0, y: 0 };
}

function resetAimJoyPos() {
    if (!aimJoyEl) return;
    aimJoyEl.style.right = "24px"; aimJoyEl.style.bottom = "24px";
    aimJoyEl.style.left  = "auto"; aimJoyEl.style.top    = "auto";
    aimJoyCenter = { x: window.innerWidth - 24 - JOYSTICK_R - 10, y: window.innerHeight - 24 - JOYSTICK_R - 10 };
}

function rilasciaAimJoy() {
    aimJoyTouchId = null;
    state.aimJoyActive = false; state.aimJoyDir = { x: 0, y: 0 };
    resetAimJoyPos();
    disegnaJoy(aimJoyEl, 0, 0, "rgba(255,100,100,0.8)");
}

function rilasciaMovJoy() {
    moveJoyTouchId = null;
    Object.assign(state.input, { left: false, right: false, up: false, down: false });
    state.socket.emit("input", state.input);
    if (moveJoyEl) { moveJoyEl.style.left = "24px"; moveJoyEl.style.top = "auto"; moveJoyEl.style.bottom = "24px"; }
    moveJoyCenter = { x: 24 + JOYSTICK_R + 10, y: window.innerHeight - 24 - JOYSTICK_R - 10 };
    disegnaJoy(moveJoyEl, 0, 0, "rgba(255,255,255,0.7)");
}

export function registraTouchEvents() {
    window.addEventListener("touchstart", e => {
        if (state.inMenu || state.inLobbyScreen) return;
        for (const t of e.changedTouches) {
            const tx = t.clientX, ty = t.clientY;
            const metà = window.innerWidth * 0.5;
            if (tx < metà && moveJoyTouchId === null) {
                moveJoyTouchId = t.identifier;
                moveJoyCenter  = { x: tx, y: ty };
                if (moveJoyEl) {
                    moveJoyEl.style.left   = (tx - JOYSTICK_R - 10) + "px";
                    moveJoyEl.style.top    = (ty - JOYSTICK_R - 10) + "px";
                    moveJoyEl.style.bottom = "auto";
                }
                disegnaJoy(moveJoyEl, 0, 0, "rgba(255,255,255,0.7)");
            } else if (tx >= metà && aimJoyTouchId === null) {
                aimJoyTouchId = t.identifier;
                aimJoyCenter  = { x: tx, y: ty };
                if (aimJoyEl) {
                    aimJoyEl.style.right  = "auto";
                    aimJoyEl.style.left   = (tx - JOYSTICK_R - 10) + "px";
                    aimJoyEl.style.top    = (ty - JOYSTICK_R - 10) + "px";
                    aimJoyEl.style.bottom = "auto";
                }
                state.aimJoyActive = false; state.aimJoyDir = { x: 0, y: 0 };
                disegnaJoy(aimJoyEl, 0, 0, "rgba(255,100,100,0.8)");
            }
        }
    }, { passive: true });

    window.addEventListener("touchmove", e => {
        if (state.inMenu || state.inLobbyScreen) return;
        for (const t of e.changedTouches) {
            const tx = t.clientX, ty = t.clientY;
            if (t.identifier === moveJoyTouchId) {
                const dx = tx - moveJoyCenter.x, dy = ty - moveJoyCenter.y;
                const ni = { left: dx < -DEAD_ZONE, right: dx > DEAD_ZONE, up: dy < -DEAD_ZONE, down: dy > DEAD_ZONE };
                if (JSON.stringify(ni) !== JSON.stringify(state.input)) {
                    Object.assign(state.input, ni);
                    state.socket.emit("input", state.input);
                }
                disegnaJoy(moveJoyEl, dx, dy, "rgba(255,255,255,0.7)");
            } else if (t.identifier === aimJoyTouchId) {
                const dx = tx - aimJoyCenter.x, dy = ty - aimJoyCenter.y;
                const len = Math.hypot(dx, dy);
                if (len > DEAD_ZONE) {
                    state.aimJoyActive = true;
                    state.aimJoyDir    = { x: dx / len, y: dy / len };
                    state.aimJoyAngle  = Math.atan2(dy, dx);
                    disegnaJoy(aimJoyEl, dx, dy, "rgba(255,80,80,0.95)");
                } else {
                    state.aimJoyActive = false; state.aimJoyDir = { x: 0, y: 0 };
                    disegnaJoy(aimJoyEl, 0, 0, "rgba(255,100,100,0.8)");
                }
            }
        }
    }, { passive: true });

    window.addEventListener("touchend", e => {
        for (const t of e.changedTouches) {
            if (t.identifier === moveJoyTouchId) rilasciaMovJoy();
            if (t.identifier === aimJoyTouchId)  rilasciaAimJoy();
        }
    }, { passive: true });

    window.addEventListener("touchcancel", e => {
        for (const t of e.changedTouches) {
            if (t.identifier === moveJoyTouchId) rilasciaMovJoy();
            if (t.identifier === aimJoyTouchId)  rilasciaAimJoy();
        }
    }, { passive: true });
}