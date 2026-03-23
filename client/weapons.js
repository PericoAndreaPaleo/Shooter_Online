// ========================
// ARMI E MANI
// ========================
import { state } from "./state.js";

let gunDrawObj = null;

// Array degli slash attivi: { x, y, angle, startTime, duration }
const slashList = [];
const SLASH_DURATION = 800; // ms — uguale al cooldown fists sul server

// Chiamata da game.js ogni volta che il player attacca con il coltello
export function triggerSlash(x, y, angle) {
    slashList.push({ x, y, angle, startTime: performance.now(), duration: SLASH_DURATION });
}

export function creaGunDrawObj() {
    if (gunDrawObj) destroy(gunDrawObj);
    gunDrawObj = add([pos(0, 0), z(1.5), {
        draw() {
            if (state.inMenu || state.inLobbyScreen || !state.myId) return;

            // ── Disegna slash attivi ──
            const now = performance.now();
            for (let i = slashList.length - 1; i >= 0; i--) {
                const sl = slashList[i];
                const elapsed = now - sl.startTime;
                if (elapsed >= sl.duration) { slashList.splice(i, 1); continue; }

                const t       = elapsed / sl.duration;       // 0→1
                const opacity = 1 - t;                       // sfuma
                const radius  = 28 + t * 22;                 // si espande
                // Arco di slash: da -60° a +60° rispetto alla direzione di attacco
                const arcStart = sl.angle - Math.PI * 0.45;
                const arcEnd   = sl.angle + Math.PI * 0.45;
                const steps    = 12;
                for (let j = 0; j < steps; j++) {
                    const a1 = arcStart + (arcEnd - arcStart) * (j / steps);
                    const a2 = arcStart + (arcEnd - arcStart) * ((j + 1) / steps);
                    // Colore: cyan/azzurro come il coltello, sfuma
                    const alpha = opacity * (1 - j / steps * 0.3);
                    drawLine({
                        p1: vec2(sl.x + Math.cos(a1) * (radius - 4), sl.y + Math.sin(a1) * (radius - 4)),
                        p2: vec2(sl.x + Math.cos(a2) * radius,       sl.y + Math.sin(a2) * radius),
                        width: Math.max(1, (1 - t) * 5),
                        color: rgb(80, 200, 255),
                        opacity: alpha,
                    });
                }
                // Secondo arco interno più luminoso
                const r2 = radius * 0.65;
                for (let j = 0; j < steps - 2; j++) {
                    const a1 = arcStart + (arcEnd - arcStart) * (j / (steps - 2));
                    const a2 = arcStart + (arcEnd - arcStart) * ((j + 1) / (steps - 2));
                    drawLine({
                        p1: vec2(sl.x + Math.cos(a1) * r2, sl.y + Math.sin(a1) * r2),
                        p2: vec2(sl.x + Math.cos(a2) * r2, sl.y + Math.sin(a2) * r2),
                        width: Math.max(1, (1 - t) * 2.5),
                        color: rgb(200, 240, 255),
                        opacity: opacity * 0.7,
                    });
                }
            }

            // ── Disegna armi e mani di tutti i player ──
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
                    // ══════════════════════════════════════════════════
                    // COLTELLO — stile azzurro/cyan come nell'immagine
                    // Tenuto nella mano destra (+perp)
                    // ══════════════════════════════════════════════════

                    // Posizione mano destra (tiene il coltello)
                    const handX = px + cos * (R + 2) + perp.x * 10;
                    const handY = py + sin * (R + 2) + perp.y * 10;

                    // ── MANICO blu scuro ──
                    const hStartX = handX;
                    const hStartY = handY;
                    const hEndX   = handX + cos * 14;
                    const hEndY   = handY + sin * 14;

                    // Outline manico
                    drawLine({ p1: vec2(hStartX, hStartY), p2: vec2(hEndX, hEndY), width: 9,  color: rgb(0, 0, 0) });
                    // Corpo manico blu
                    drawLine({ p1: vec2(hStartX, hStartY), p2: vec2(hEndX, hEndY), width: 6,  color: rgb(20, 60, 160) });
                    // Riflesso manico
                    drawLine({ p1: vec2(hStartX + cos*2 + perp.x, hStartY + sin*2 + perp.y), p2: vec2(hEndX - cos*2 + perp.x, hEndY - sin*2 + perp.y), width: 1.5, color: rgb(80, 130, 220) });

                    // Pomolo (fondo manico)
                    drawCircle({ pos: vec2(hStartX - cos*3, hStartY - sin*3), radius: 5,   color: rgb(0, 0, 0) });
                    drawCircle({ pos: vec2(hStartX - cos*3, hStartY - sin*3), radius: 3.5, color: rgb(15, 45, 130) });

                    // ── GUARDIA A CROCE nera ──
                    const gx = hEndX, gy = hEndY;
                    drawLine({ p1: vec2(gx + perp.x * 8, gy + perp.y * 8), p2: vec2(gx - perp.x * 8, gy - perp.y * 8), width: 7, color: rgb(0, 0, 0) });
                    drawLine({ p1: vec2(gx + perp.x * 6, gy + perp.y * 6), p2: vec2(gx - perp.x * 6, gy - perp.y * 6), width: 4, color: rgb(15, 15, 20) });

                    // ── LAMA azzurra/cyan ──
                    const bStartX = gx + cos;
                    const bStartY = gy + sin;
                    const bTipX   = bStartX + cos * 26;
                    const bTipY   = bStartY + sin * 26;
                    const bMidX   = bStartX + cos * 13;
                    const bMidY   = bStartY + sin * 13;

                    // Outline lama
                    drawLine({ p1: vec2(bStartX, bStartY), p2: vec2(bTipX, bTipY), width: 8, color: rgb(0, 0, 0) });
                    // Corpo lama azzurro
                    drawLine({ p1: vec2(bStartX, bStartY), p2: vec2(bTipX, bTipY), width: 5, color: rgb(50, 150, 220) });
                    // Riflesso chiaro (lato +perp, filo superiore)
                    drawLine({ p1: vec2(bStartX + perp.x*2, bStartY + perp.y*2), p2: vec2(bTipX, bTipY), width: 3, color: rgb(150, 220, 255) });
                    // Riflesso centrale brillante
                    drawLine({ p1: vec2(bMidX + perp.x*1, bMidY + perp.y*1), p2: vec2(bTipX, bTipY), width: 1.5, color: rgb(220, 245, 255) });
                    // Filo inferiore
                    drawLine({ p1: vec2(bStartX - perp.x*1.5, bStartY - perp.y*1.5), p2: vec2(bTipX, bTipY), width: 1.5, color: rgb(30, 100, 180) });

                    // Buco nella lama (dettaglio dell'immagine)
                    const holeX = bStartX + cos * 18 + perp.x * 1;
                    const holeY = bStartY + sin * 18 + perp.y * 1;
                    drawCircle({ pos: vec2(holeX, holeY), radius: 3,   color: rgb(0, 0, 0) });
                    drawCircle({ pos: vec2(holeX, holeY), radius: 1.5, color: rgb(20, 80, 160) });

                    // ── MANI (sopra il coltello) ──
                    // Mano sinistra — lato -perp
                    drawHand(px + cos * (R + 2) - perp.x * 10, py + sin * (R + 2) - perp.y * 10, 7);
                    // Mano destra — regge il coltello
                    drawHand(handX, handY, 7);

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