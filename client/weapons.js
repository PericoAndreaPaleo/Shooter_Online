// ========================
// ARMI E MANI
// ========================
import { state } from "./state.js";

let gunDrawObj = null;

const PUNCH_DURATION = 300; // ms — durata animazione
const PUNCH_ANIM_COOLDOWN = 200; // ms — non può ripartire prima di questo
const punchLastTrigger = {}; // playerId → timestamp ultimo trigger

export function triggerPunch(playerId, hand) {
    const p = state.players[playerId];
    if (!p) return;
    const now = performance.now();
    if (punchLastTrigger[playerId] && now - punchLastTrigger[playerId] < PUNCH_ANIM_COOLDOWN) return;
    punchLastTrigger[playerId] = now;
    p.punchStartTime = now;
    p.punchHand = hand;
}

export function creaGunDrawObj() {
    if (gunDrawObj) destroy(gunDrawObj);
    gunDrawObj = add([pos(0, 0), z(1.5), {
        draw() {
            if (state.inMenu || state.inLobbyScreen || !state.myId) return;

            const now = performance.now();

            for (const id in state.players) {
                const p = state.players[id];
                if (!p || p.morto || !p.dirIndicator || !p.sprite) continue;

                const angle = p.dirIndicator.angle || 0;
                const wtype = (id === state.myId) ? state.weapon : (p.dirIndicator.weapon || "gun");
                const px  = p.sprite.pos.x, py = p.sprite.pos.y;
                const R   = 24;
                const cos = Math.cos(angle), sin = Math.sin(angle);
                const perp = { x: -sin, y: cos };

                const drawHand = (hx, hy, r) => {
                    drawCircle({ pos: vec2(hx, hy), radius: r + 2, color: rgb(0, 0, 0) });
                    drawCircle({ pos: vec2(hx, hy), radius: r,     color: rgb(222, 196, 145) });
                };

                if (wtype === "fists") {
                    // Calcola offset pugno
                    let punchOffset = 0;
                    let punchHand = 1; // default destra
                    if (p.punchStartTime) {
                        const elapsed = now - p.punchStartTime;
                        if (elapsed < PUNCH_DURATION) {
                            const t = elapsed / PUNCH_DURATION;
                            punchOffset = (t < 0.5 ? t * 2 : 2 - t * 2) * 18;
                            punchHand = p.punchHand ?? 1;
                        } else {
                            p.punchStartTime = null;
                        }
                    }

                    // Posizione base delle mani — 20px di separazione laterale
                    const baseForward = 20; // 20px avanti rispetto al centro
                    const SIDE = 15;        // separazione laterale

                    // Offset avanti applicato solo alla mano che sta punchando
                    const rhOffset = punchHand === 1 ? punchOffset : 0;
                    const lhOffset = punchHand === 0 ? punchOffset : 0;

                    const rhX = px + cos * (baseForward + rhOffset) + perp.x * SIDE;
                    const rhY = py + sin * (baseForward + rhOffset) + perp.y * SIDE;
                    const lhX = px + cos * (baseForward + lhOffset) - perp.x * SIDE;
                    const lhY = py + sin * (baseForward + lhOffset) - perp.y * SIDE;

                    drawHand(lhX, lhY, 7);
                    drawHand(rhX, rhY, 7);

                } else if (wtype === "pistol") {
                    drawRect({ pos: vec2(px + cos * R, py + sin * R), width: 30, height: 9, color: rgb(17, 17, 17), radius: 4, angle: angle * (180 / Math.PI), anchor: "left", offset: vec2(0, -4.5) });
                    drawHand(px + cos * (R + 3), py + sin * (R + 3), 7);

                } else {
                    drawRect({ pos: vec2(px + cos * R, py + sin * R), width: 60, height: 9, color: rgb(17, 17, 17), radius: 4, angle: angle * (180 / Math.PI), anchor: "left", offset: vec2(0, -4.5) });
                    drawHand(px + cos * (R + 2)  - perp.x * 3, py + sin * (R + 2)  - perp.y * 3, 7);
                    drawHand(px + cos * (R + 30) + perp.x * 5, py + sin * (R + 30) + perp.y * 5, 7);
                }
            }
        }
    }]);
}