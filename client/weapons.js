// ========================
// ARMI E MANI
// ========================
import { state } from "./state.js";

let gunDrawObj = null;

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
                // perp punta a "destra" del player rispetto alla direzione
                const perp = { x: -sin, y: cos };

                const drawHand = (hx, hy, r) => {
                    drawCircle({ pos: vec2(hx, hy), radius: r + 2, color: rgb(0, 0, 0) });
                    drawCircle({ pos: vec2(hx, hy), radius: r,     color: rgb(222, 196, 145) });
                };

                if (wtype === "fists") {
                    // ══════════════════════════════════════════════════
                    // COLTELLO DA COMBATTIMENTO
                    // Il coltello è tenuto nella mano destra del player
                    // (lato +perp rispetto alla direzione di mira).
                    // Struttura: manico ocra → guardia a croce → lama grigia a punta
                    // ══════════════════════════════════════════════════

                    // Centro della mano destra — lato +perp, appena fuori dal corpo
                    const handX = px + cos * (R + 2) + perp.x * 10;
                    const handY = py + sin * (R + 2) + perp.y * 10;

                    // ── MANICO ──
                    // Parte dalla mano, si prolunga nella direzione di mira
                    const handleStartX = handX;
                    const handleStartY = handY;
                    const handleEndX   = handX + cos * 14;
                    const handleEndY   = handY + sin * 14;

                    // Outline manico
                    drawLine({ p1: vec2(handleStartX, handleStartY), p2: vec2(handleEndX, handleEndY), width: 9,  color: rgb(0, 0, 0) });
                    // Corpo manico ocra/verde militare
                    drawLine({ p1: vec2(handleStartX, handleStartY), p2: vec2(handleEndX, handleEndY), width: 6,  color: rgb(100, 88, 48) });
                    // Dettaglio centrale più chiaro
                    drawLine({ p1: vec2(handleStartX + cos*2, handleStartY + sin*2), p2: vec2(handleEndX - cos*2, handleEndY - sin*2), width: 2, color: rgb(130, 115, 65) });

                    // Pomolo (fine del manico, lato opposto alla lama)
                    drawCircle({ pos: vec2(handleStartX - cos*2, handleStartY - sin*2), radius: 5, color: rgb(0, 0, 0) });
                    drawCircle({ pos: vec2(handleStartX - cos*2, handleStartY - sin*2), radius: 3.5, color: rgb(75, 65, 35) });

                    // ── GUARDIA A CROCE ──
                    // Linea perpendicolare alla giunzione manico-lama
                    const guardX = handleEndX;
                    const guardY = handleEndY;
                    // Outline guardia
                    drawLine({ p1: vec2(guardX + perp.x * 8, guardY + perp.y * 8), p2: vec2(guardX - perp.x * 8, guardY - perp.y * 8), width: 7, color: rgb(0, 0, 0) });
                    // Corpo guardia
                    drawLine({ p1: vec2(guardX + perp.x * 7, guardY + perp.y * 7), p2: vec2(guardX - perp.x * 7, guardY - perp.y * 7), width: 4, color: rgb(20, 20, 20) });

                    // ── LAMA ──
                    // Parte dalla guardia, lunga e dritta, si assottiglia verso la punta
                    const bladeStartX = guardX + cos * 1;
                    const bladeStartY = guardY + sin * 1;
                    const bladeTipX   = bladeStartX + cos * 26;
                    const bladeTipY   = bladeStartY + sin * 26;
                    const bladeMidX   = bladeStartX + cos * 13;
                    const bladeMidY   = bladeStartY + sin * 13;

                    // Outline lama (spesso alla base, va a punta)
                    drawLine({ p1: vec2(bladeStartX, bladeStartY), p2: vec2(bladeTipX, bladeTipY), width: 8, color: rgb(0, 0, 0) });
                    // Corpo lama grigio scuro
                    drawLine({ p1: vec2(bladeStartX, bladeStartY), p2: vec2(bladeTipX, bladeTipY), width: 5, color: rgb(65, 70, 75) });
                    // Filo superiore (riflesso chiaro)
                    drawLine({ p1: vec2(bladeStartX + perp.x*1.5, bladeStartY + perp.y*1.5), p2: vec2(bladeTipX, bladeTipY), width: 2, color: rgb(140, 148, 155) });
                    // Filo inferiore
                    drawLine({ p1: vec2(bladeStartX - perp.x*1.5, bladeStartY - perp.y*1.5), p2: vec2(bladeTipX, bladeTipY), width: 1.5, color: rgb(90, 95, 100) });
                    // Riflesso centrale della lama
                    drawLine({ p1: vec2(bladeMidX + perp.x*0.5, bladeMidY + perp.y*0.5), p2: vec2(bladeTipX, bladeTipY), width: 1, color: rgb(180, 185, 190) });

                    // ── MANO che regge il coltello (destra) — sopra tutto ──
                    drawHand(handX, handY, 7);

                    // ── MANO sinistra — lato -perp, più vicina al corpo ──
                    const hand2X = px + cos * (R + 2) - perp.x * 10;
                    const hand2Y = py + sin * (R + 2) - perp.y * 10;
                    drawHand(hand2X, hand2Y, 7);

                } else if (wtype === "pistol") {
                    // ── PISTOLA ──
                    drawRect({ pos: vec2(px + cos * R, py + sin * R), width: 30, height: 9, color: rgb(17, 17, 17), radius: 4, angle: angle * (180 / Math.PI), anchor: "left", offset: vec2(0, -4.5) });
                    drawHand(px + cos * (R + 3), py + sin * (R + 3), 7);

                } else {
                    // ── RIFLE ──
                    drawRect({ pos: vec2(px + cos * R, py + sin * R), width: 60, height: 9, color: rgb(17, 17, 17), radius: 4, angle: angle * (180 / Math.PI), anchor: "left", offset: vec2(0, -4.5) });
                    drawHand(px + cos * (R + 2)  - perp.x * 3, py + sin * (R + 2)  - perp.y * 3, 7);
                    drawHand(px + cos * (R + 30) + perp.x * 5, py + sin * (R + 30) + perp.y * 5, 7);
                }
            }
        }
    }]);
}