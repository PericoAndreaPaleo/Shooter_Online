// ========================
// ARMI E MANI
// ========================
import { state } from "./state.js";

let gunDrawObj = null;

// Disegna una curva di Bezier quadratica come serie di segmenti
function drawCurve(p0, p1, p2, steps, width, color) {
    let prev = p0;
    for (let i = 1; i <= steps; i++) {
        const t  = i / steps;
        const it = 1 - t;
        const x  = it * it * p0.x + 2 * it * t * p1.x + t * t * p2.x;
        const y  = it * it * p0.y + 2 * it * t * p1.y + t * t * p2.y;
        drawLine({ p1: vec2(prev.x, prev.y), p2: vec2(x, y), width, color });
        prev = { x, y };
    }
}

export function creaGunDrawObj() {
    if (gunDrawObj) destroy(gunDrawObj);
    gunDrawObj = add([pos(0, 0), z(1.5), {
        draw() {
            if (state.inMenu || state.inLobbyScreen || !state.myId) return;
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
                    // ══════════════════════════════════════
                    // KARAMBIT
                    // Mano principale: sopra rispetto alla direzione
                    // Mano secondaria (anello): sotto
                    // ══════════════════════════════════════

                    const hand1X = px + cos * (R + 6) + perp.x * 8;
                    const hand1Y = py + sin * (R + 6) + perp.y * 8;
                    const hand2X = px + cos * (R + 6) - perp.x * 8;
                    const hand2Y = py + sin * (R + 6) - perp.y * 8;

                    // Manico
                    const hBaseX = px + cos * (R + 4);
                    const hBaseY = py + sin * (R + 4);
                    const hTipX  = hBaseX + cos * 16;
                    const hTipY  = hBaseY + sin * 16;

                    drawLine({ p1: vec2(hBaseX, hBaseY), p2: vec2(hTipX, hTipY), width: 7, color: rgb(18, 14, 12) });
                    drawLine({ p1: vec2(hBaseX + cos*2, hBaseY + sin*2), p2: vec2(hTipX - cos*2, hTipY - sin*2), width: 3, color: rgb(45, 35, 28) });

                    // Guardia (linea perpendicolare alla giunzione lama-manico)
                    drawLine({
                        p1: vec2(hTipX + perp.x * 5, hTipY + perp.y * 5),
                        p2: vec2(hTipX - perp.x * 5, hTipY - perp.y * 5),
                        width: 4, color: rgb(30, 25, 20)
                    });

                    // Lama curva (Bezier): parte dalla punta del manico, curva a uncino
                    const bladeAngle = angle + Math.PI * 0.55;
                    const bcos = Math.cos(bladeAngle), bsin = Math.sin(bladeAngle);
                    const ctrlX    = hTipX + bcos * 14 + cos * 8;
                    const ctrlY    = hTipY + bsin * 14 + sin * 8;
                    const bladeTipX = hTipX + bcos * 26 - cos * 4;
                    const bladeTipY = hTipY + bsin * 26 - sin * 4;

                    // Outline lama
                    drawCurve({ x: hTipX, y: hTipY }, { x: ctrlX, y: ctrlY }, { x: bladeTipX, y: bladeTipY }, 8, 6, rgb(15, 12, 18));
                    // Corpo lama
                    drawCurve({ x: hTipX, y: hTipY }, { x: ctrlX, y: ctrlY }, { x: bladeTipX, y: bladeTipY }, 8, 4, rgb(35, 30, 45));
                    // Filo rosso (base)
                    drawCurve(
                        { x: hTipX, y: hTipY },
                        { x: ctrlX + perp.x, y: ctrlY + perp.y },
                        { x: bladeTipX, y: bladeTipY },
                        8, 2, rgb(160, 30, 30)
                    );
                    // Filo blu (verso punta, come nell'immagine)
                    drawCurve(
                        { x: hTipX + cos * 6, y: hTipY + sin * 6 },
                        { x: ctrlX + perp.x * 0.5, y: ctrlY + perp.y * 0.5 },
                        { x: bladeTipX, y: bladeTipY },
                        6, 1.5, rgb(60, 130, 220)
                    );

                    // Anello alla base del manico
                    const ringX = hBaseX - cos * 5 - perp.x * 6;
                    const ringY = hBaseY - sin * 5 - perp.y * 6;
                    drawCircle({ pos: vec2(ringX, ringY), radius: 7,   color: rgb(0,  0,  0)  });
                    drawCircle({ pos: vec2(ringX, ringY), radius: 5.5, color: rgb(25, 20, 18) });
                    drawCircle({ pos: vec2(ringX, ringY), radius: 3.5, color: rgb(0,  0,  0)  });

                    // Mani sopra tutto
                    drawHand(hand2X, hand2Y, 7);
                    drawHand(hand1X, hand1Y, 7);

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