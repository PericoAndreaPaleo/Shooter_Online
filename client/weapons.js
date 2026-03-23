// ========================
// ARMI E MANI
// ========================
import { state } from "./state.js";

let gunDrawObj = null;

// Slash attivi per animazione pugno
const slashList = [];
const PUNCH_DURATION = 200; // ms — il pugno avanza e torna

export function triggerSlash(x, y, angle) {
    slashList.push({ x, y, angle, startTime: performance.now() });
}

export function creaGunDrawObj() {
    if (gunDrawObj) destroy(gunDrawObj);
    gunDrawObj = add([pos(0, 0), z(1.5), {
        draw() {
            if (state.inMenu || state.inLobbyScreen || !state.myId) return;

            const now = performance.now();

            // Pulisci punch scaduti
            for (let i = slashList.length - 1; i >= 0; i--) {
                if (now - slashList[i].startTime >= PUNCH_DURATION) slashList.splice(i, 1);
            }

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
                    // ── calcola offset pugno per il player corrente ──
                    let punchOffset = 0;
                    if (id === state.myId && slashList.length > 0) {
                        const sl = slashList[slashList.length - 1];
                        const t  = (now - sl.startTime) / PUNCH_DURATION; // 0→1
                        // Avanza nella prima metà, torna nella seconda
                        punchOffset = (t < 0.5 ? t * 2 : 2 - t * 2) * 18;
                    }

                    // Mano destra — si muove col pugno (+perp)
                    const rhX = px + cos * (R + 8 + punchOffset) + perp.x * 16;
                    const rhY = py + sin * (R + 8 + punchOffset) + perp.y * 16;

                    // Mano sinistra — ferma (-perp)
                    const lhX = px + cos * (R + 8) - perp.x * 16;
                    const lhY = py + sin * (R + 8) - perp.y * 16;

                    drawHand(lhX, lhY, 9);
                    drawHand(rhX, rhY, 9);

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