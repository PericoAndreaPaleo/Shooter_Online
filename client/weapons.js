// ========================
// ARMI E MANI
// ========================
import { state } from "./state.js";

let gunDrawObj = null;

// Slash attivi: { x, y, angle, startTime }
// L'animazione dura 250ms — la mano avanza e torna
const slashList = [];
const SLASH_DURATION = 250;

export function triggerSlash(x, y, angle) {
    slashList.push({ x, y, angle, startTime: performance.now() });
}

// Disegna il coltello da combattimento blu/cyan con outline nero chiuso
// ox, oy = offset di posizione (usato per l'animazione slash)
function drawKnife(cx, cy, angle, perp, ox, oy) {
    const cos = Math.cos(angle), sin = Math.sin(angle);

    // Tutti i punti sono relativi al centro (cx+ox, cy+oy)
    const bx = cx + ox, by = cy + oy;

    // ── MANICO ──
    // Va da 0 a +20 nella direzione dell'angolo
    const hS = { x: bx,           y: by           };
    const hE = { x: bx + cos*20,  y: by + sin*20  };

    // Pomolo (fondo manico) — quadrato arrotondato
    drawCircle({ pos: vec2(hS.x - cos*5, hS.y - sin*5), radius: 6,   color: rgb(0,  0,  0)  });
    drawCircle({ pos: vec2(hS.x - cos*5, hS.y - sin*5), radius: 4.5, color: rgb(15, 45, 140) });

    // Outline manico
    drawLine({ p1: vec2(hS.x, hS.y), p2: vec2(hE.x, hE.y), width: 11, color: rgb(0, 0, 0) });
    // Corpo manico blu
    drawLine({ p1: vec2(hS.x, hS.y), p2: vec2(hE.x, hE.y), width: 7,  color: rgb(25, 70, 175) });
    // Riflesso manico
    drawLine({
        p1: vec2(hS.x + perp.x*1.5 + cos*2, hS.y + perp.y*1.5 + sin*2),
        p2: vec2(hE.x + perp.x*1.5 - cos*2, hE.y + perp.y*1.5 - sin*2),
        width: 2, color: rgb(90, 140, 235)
    });

    // ── GUARDIA A CROCE ──
    const gx = hE.x, gy = hE.y;
    // Outline guardia (croce nera spessa)
    drawLine({ p1: vec2(gx + perp.x*13, gy + perp.y*13), p2: vec2(gx - perp.x*13, gy - perp.y*13), width: 10, color: rgb(0, 0, 0) });
    drawLine({ p1: vec2(gx - cos*5, gy - sin*5), p2: vec2(gx + cos*5, gy + sin*5), width: 10, color: rgb(0, 0, 0) });
    // Corpo guardia
    drawLine({ p1: vec2(gx + perp.x*11, gy + perp.y*11), p2: vec2(gx - perp.x*11, gy - perp.y*11), width: 6, color: rgb(10, 10, 15) });
    drawLine({ p1: vec2(gx - cos*4, gy - sin*4), p2: vec2(gx + cos*4, gy + sin*4), width: 6, color: rgb(10, 10, 15) });

    // ── LAMA ──
    // Parte dalla guardia (+cos*2), lunga 40px, si assottiglia a punta
    const blS = { x: gx + cos*3,  y: gy + sin*3  };
    const blT = { x: gx + cos*43, y: gy + sin*43 }; // punta
    const blM = { x: gx + cos*23, y: gy + sin*23 }; // metà

    // Outline lama (chiuso = disegno i bordi come linee separate convergenti)
    // Bordo superiore: da blS+perp*4 → blT
    drawLine({ p1: vec2(blS.x + perp.x*4.5, blS.y + perp.y*4.5), p2: vec2(blT.x, blT.y), width: 3, color: rgb(0, 0, 0) });
    // Bordo inferiore: da blS-perp*4 → blT
    drawLine({ p1: vec2(blS.x - perp.x*4.5, blS.y - perp.y*4.5), p2: vec2(blT.x, blT.y), width: 3, color: rgb(0, 0, 0) });
    // Base della lama (linea perpendicolare alla guardia)
    drawLine({ p1: vec2(blS.x + perp.x*4.5, blS.y + perp.y*4.5), p2: vec2(blS.x - perp.x*4.5, blS.y - perp.y*4.5), width: 3, color: rgb(0, 0, 0) });

    // Riempimento lama azzurro
    drawLine({ p1: vec2(blS.x, blS.y), p2: vec2(blT.x, blT.y), width: 7, color: rgb(55, 155, 225) });
    // Riflesso chiaro superiore
    drawLine({ p1: vec2(blS.x + perp.x*3, blS.y + perp.y*3), p2: vec2(blT.x, blT.y), width: 4, color: rgb(140, 215, 255) });
    // Riflesso brillante centrale
    drawLine({ p1: vec2(blM.x + perp.x*2, blM.y + perp.y*2), p2: vec2(blT.x, blT.y), width: 2, color: rgb(215, 242, 255) });
    // Filo inferiore scuro
    drawLine({ p1: vec2(blS.x - perp.x*3, blS.y - perp.y*3), p2: vec2(blT.x, blT.y), width: 2.5, color: rgb(30, 105, 190) });

    // Buco nella lama
    const holeX = blS.x + cos*26 + perp.x*1.5;
    const holeY = blS.y + sin*26 + perp.y*1.5;
    drawCircle({ pos: vec2(holeX, holeY), radius: 4.5, color: rgb(0,  0,  0)  });
    drawCircle({ pos: vec2(holeX, holeY), radius: 3,   color: rgb(25, 85, 170) });
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
                    // ══════════════════════════════════════════
                    // Mano destra regge il coltello (+perp)
                    // Mano sinistra è sul lato -perp
                    // Per lo slash: la mano destra avanza verso la punta
                    // ══════════════════════════════════════════

                    // Calcola offset slash per questa posizione
                    // Cerca se c'è uno slash attivo per questo player
                    let slashOffset = 0;
                    if (id === state.myId && slashList.length > 0) {
                        // Prendi l'ultimo slash
                        const sl = slashList[slashList.length - 1];
                        const elapsed = now - sl.startTime;
                        if (elapsed < SLASH_DURATION) {
                            // t: 0→0.5 avanza, 0.5→1 torna
                            const t = elapsed / SLASH_DURATION;
                            const swing = t < 0.5 ? t * 2 : 2 - t * 2;  // 0→1→0
                            slashOffset = swing * 16;  // avanza fino a 16px
                        }
                    }

                    // Mano sinistra — fissa, lato -perp
                    const lhX = px + cos * (R + 6) - perp.x * 18;
                    const lhY = py + sin * (R + 6) - perp.y * 18;
                    drawHand(lhX, lhY, 8);

                    // Origine del coltello: mano destra + offset slash lungo la direzione
                    const knifeOriginX = px + cos * (R + 6) + perp.x * 18 + cos * slashOffset;
                    const knifeOriginY = py + sin * (R + 6) + perp.y * 18 + sin * slashOffset;

                    // Disegna il coltello (la funzione usa knifeOrigin come base del manico)
                    drawKnife(knifeOriginX, knifeOriginY, angle, perp, 0, 0);

                    // Mano destra — sopra il coltello, si muove con esso
                    drawHand(knifeOriginX, knifeOriginY, 8);

                } else if (wtype === "pistol") {
                    drawRect({ pos: vec2(px + cos * R, py + sin * R), width: 30, height: 9, color: rgb(17, 17, 17), radius: 4, angle: angle * (180 / Math.PI), anchor: "left", offset: vec2(0, -4.5) });
                    drawHand(px + cos * (R + 3), py + sin * (R + 3), 7);

                } else {
                    drawRect({ pos: vec2(px + cos * R, py + sin * R), width: 60, height: 9, color: rgb(17, 17, 17), radius: 4, angle: angle * (180 / Math.PI), anchor: "left", offset: vec2(0, -4.5) });
                    drawHand(px + cos * (R + 2)  - perp.x * 3, py + sin * (R + 2)  - perp.y * 3, 7);
                    drawHand(px + cos * (R + 30) + perp.x * 5, py + sin * (R + 30) + perp.y * 5, 7);
                }
            }

            // Pulisci slash scaduti
            for (let i = slashList.length - 1; i >= 0; i--) {
                if (now - slashList[i].startTime >= SLASH_DURATION) slashList.splice(i, 1);
            }
        }
    }]);
}