// ============================================================
// weapons.js — Rendering delle armi e animazione delle mani
//
// Questo modulo si occupa esclusivamente della grafica:
//   • creaGunDrawObj() aggiunge a Kaboom un oggetto draw-only
//     che disegna armi e mani sopra ogni giocatore ogni frame.
//   • triggerPunch() avvia l'animazione del pugno su un giocatore.
//
// NON gestisce la logica di sparo (quella è in game.js / server).
// ============================================================

import { state } from "./state.js";

/** Riferimento all'oggetto Kaboom che disegna le armi (singleton) */
let weaponDrawObject = null;

/** Durata dell'animazione di un pugno in millisecondi */
const PUNCH_ANIMATION_DURATION_MS = 200;

// ============================================================
// ANIMAZIONE PUGNO
// ============================================================

/**
 * Avvia l'animazione del pugno per un giocatore specifico.
 * Imposta il timestamp di inizio e quale mano viene usata.
 * Il rendering effettivo avviene in creaGunDrawObj().
 *
 * @param {string} playerId - socket.id del giocatore che attacca
 * @param {number} hand     - 1 = mano destra, 0 = mano sinistra
 */
export function triggerPunch(playerId, hand) {
    const playerRenderData = state.players[playerId];
    if (playerRenderData) {
        playerRenderData.punchStartTime = performance.now();
        playerRenderData.punchHand      = hand;
    }
}

// ============================================================
// OGGETTO DI DISEGNO KABOOM
// ============================================================

/**
 * Crea (o ricrea) l'oggetto Kaboom responsabile del disegno
 * di armi e mani per tutti i giocatori visibili.
 *
 * Viene chiamato una sola volta all'ingresso in una lobby.
 * Usa il component personalizzato `draw()` di Kaboom che viene
 * eseguito ogni frame, prima del resto del canvas.
 */
export function creaGunDrawObj() {
    // Distruggi l'eventuale oggetto precedente
    if (weaponDrawObject) destroy(weaponDrawObject);

    weaponDrawObject = add([
        pos(0, 0),
        z(1.5), // sopra i player (z:1) ma sotto gli HUD
        {
            draw() {
                // Non disegnare nulla nelle schermate menu/lobby
                if (state.inMenu || state.inLobbyScreen || !state.myId) return;

                const now = performance.now();

                for (const playerId in state.players) {
                    const playerData = state.players[playerId];
                    if (!playerData || playerData.morto || !playerData.dirIndicator || !playerData.sprite) continue;

                    const angle      = playerData.dirIndicator.angle || 0;
                    // Il mio giocatore usa l'arma locale (più reattiva), gli altri usano quella dal server
                    const weaponType = (playerId === state.myId)
                        ? state.weapon
                        : (playerData.dirIndicator.weapon || "gun");

                    const playerX = playerData.sprite.pos.x;
                    const playerY = playerData.sprite.pos.y;
                    const BODY_RADIUS = 24; // raggio visivo del cerchio-giocatore

                    // Vettori direzionali lungo e perpendicolare all'angolo di mira
                    const cosAngle = Math.cos(angle);
                    const sinAngle = Math.sin(angle);
                    const perpDir  = { x: -sinAngle, y: cosAngle }; // perpendicolare (90°)

                    // ── Helper: disegna una mano (cerchio con bordo) ─────────────
                    const drawHand = (handX, handY, radius) => {
                        // Contorno nero
                        drawCircle({ pos: vec2(handX, handY), radius: radius + 2, color: rgb(0, 0, 0) });
                        // Colore pelle
                        drawCircle({ pos: vec2(handX, handY), radius,             color: rgb(222, 196, 145) });
                    };

                    // ── KARAMBIT (mani nude / coltello) ─────────────────────────
                    if (weaponType === "fists") {
                        // Calcola l'avanzamento animato del pugno
                        let punchForwardOffset = 0;  // pixel extra avanti durante il pugno
                        let activePunchHand    = 1;  // quale mano sta punchando (default: destra)

                        if (playerData.punchStartTime) {
                            const elapsed = now - playerData.punchStartTime;

                            if (elapsed < PUNCH_ANIMATION_DURATION_MS) {
                                // t: 0 → 1 durante la prima metà, 1 → 0 nella seconda
                                const t = elapsed / PUNCH_ANIMATION_DURATION_MS;
                                punchForwardOffset = (t < 0.5 ? t * 2 : 2 - t * 2) * 18;
                                activePunchHand    = playerData.punchHand ?? 1;
                            } else {
                                // Animazione terminata
                                playerData.punchStartTime = null;
                            }
                        }

                        // Posizione base delle due mani
                        const BASE_FORWARD_DIST = 22; // px davanti al centro del giocatore
                        const HAND_SIDE_OFFSET  = 16; // px di separazione laterale

                        // Solo la mano che sta punchando avanza
                        const rightHandForwardBoost = (activePunchHand === 1) ? punchForwardOffset : 0;
                        const leftHandForwardBoost  = (activePunchHand === 0) ? punchForwardOffset : 0;

                        // Posizioni finali delle mani nello spazio-mondo
                        const rightHandX = playerX + cosAngle * (BASE_FORWARD_DIST + rightHandForwardBoost) + perpDir.x * HAND_SIDE_OFFSET;
                        const rightHandY = playerY + sinAngle * (BASE_FORWARD_DIST + rightHandForwardBoost) + perpDir.y * HAND_SIDE_OFFSET;
                        const leftHandX  = playerX + cosAngle * (BASE_FORWARD_DIST + leftHandForwardBoost)  - perpDir.x * HAND_SIDE_OFFSET;
                        const leftHandY  = playerY + sinAngle * (BASE_FORWARD_DIST + leftHandForwardBoost)  - perpDir.y * HAND_SIDE_OFFSET;

                        drawHand(leftHandX,  leftHandY,  7.5);
                        drawHand(rightHandX, rightHandY, 7.5);

                    // ── PISTOLA ──────────────────────────────────────────────────
                    } else if (weaponType === "pistol") {
                        // Rettangolo corto (30px) per la pistola
                        drawRect({
                            pos:    vec2(playerX + cosAngle * BODY_RADIUS, playerY + sinAngle * BODY_RADIUS),
                            width:  30,
                            height: 9,
                            color:  rgb(17, 17, 17),
                            radius: 4,
                            angle:  angle * (180 / Math.PI),
                            anchor: "left",
                            offset: vec2(0, -4.5),
                        });
                        // Una sola mano per la pistola
                        drawHand(
                            playerX + cosAngle * (BODY_RADIUS + 3),
                            playerY + sinAngle * (BODY_RADIUS + 3),
                            7.5
                        );

                    // ── FUCILE D'ASSALTO ─────────────────────────────────────────
                    } else {
                        // Rettangolo lungo (60px) per il fucile
                        drawRect({
                            pos:    vec2(playerX + cosAngle * BODY_RADIUS, playerY + sinAngle * BODY_RADIUS),
                            width:  60,
                            height: 9,
                            color:  rgb(17, 17, 17),
                            radius: 4,
                            angle:  angle * (180 / Math.PI),
                            anchor: "left",
                            offset: vec2(0, -4.5),
                        });
                        // Due mani per il fucile: una posteriore (impugnatura) e una anteriore (calcio)
                        drawHand(
                            playerX + cosAngle * (BODY_RADIUS + 2)  - perpDir.x * 3,
                            playerY + sinAngle * (BODY_RADIUS + 2)  - perpDir.y * 3,
                            7.5
                        );
                        drawHand(
                            playerX + cosAngle * (BODY_RADIUS + 30) + perpDir.x * 5,
                            playerY + sinAngle * (BODY_RADIUS + 30) + perpDir.y * 5,
                            7.5
                        );
                    }
                }
            }
        }
    ]);
}