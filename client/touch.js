// ============================================================
// touch.js — Controlli touch per mobile (doppio joystick)
//
// Implementa il sistema di input touch con due joystick virtuali:
//   • Joystick SINISTRO  (metà sinistra schermo) → movimento
//   • Joystick DESTRO    (metà destra schermo)   → mira e sparo
//
// Ogni joystick è un canvas HTML sovrapposto al gioco.
// Sono presenti anche i bottoni per il cambio arma e la ricarica.
//
// Il modulo NON dipende da Kaboom: usa esclusivamente il DOM.
// ============================================================

import { state, GAME_H, hx, hy, hs, isMobile, cambiaArma } from "./state.js";
import { aggiornaHUDArma, aggiornaHUDAmmo } from "./hud.js";

// ── Costanti geometria joystick ──────────────────────────────
const JOYSTICK_OUTER_RADIUS = 35;  // raggio del cerchio esterno (base fissa)
const JOYSTICK_KNOB_RADIUS  = 14;  // raggio del knob (parte mobile)
const JOYSTICK_DEAD_ZONE    = 8;   // pixel minimi di spostamento per registrare input

// ── Stato del joystick sinistro (movimento) ──────────────────
let moveJoystickCanvas   = null;   // element canvas del joystick
let moveJoystickTouchId  = null;   // identifier del touch attivo
let moveJoystickCenter   = { x: 0, y: 0 }; // centro del joystick (aggiornato al touch)

// ── Stato del joystick destro (mira) ────────────────────────
let aimJoystickCanvas    = null;
let aimJoystickTouchId   = null;
let aimJoystickCenter    = { x: 0, y: 0 };

// ── Riferimenti ai bottoni UI ────────────────────────────────
let weaponButtonElements = [];    // bottoni cambio arma [AR, PI, KN]
let reloadButtonElement  = null;  // bottone ricarica [R]

// ============================================================
// AGGIORNAMENTO VISIVO DEI BOTTONI
// ============================================================

/**
 * Aggiorna l'aspetto visivo dei bottoni arma:
 * l'arma attiva ha bordo luminoso e scala leggermente maggiore.
 */
export function aggiornaWeaponBtns() {
    weaponButtonElements.forEach((button) => {
        const isActive = button.dataset.weapon === state.weapon;
        button.style.borderColor = isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.3)";
        button.style.transform   = isActive ? "scale(1.12)"            : "scale(1)";
    });
}

/**
 * Aggiorna l'aspetto del pulsante ricarica in base allo stato:
 *   • In ricarica: "..." grigio opaco
 *   • Munizioni 0: "[R]" rosso
 *   • Normale:     "[R]" bianco semitrasparente
 */
export function aggiornaReloadBtn() {
    if (!reloadButtonElement) return;

    if (state.isReloading) {
        reloadButtonElement.textContent   = "...";
        reloadButtonElement.style.opacity = "0.5";
        reloadButtonElement.style.color   = "white";
    } else if (state.myAmmo[state.weapon] === 0) {
        reloadButtonElement.textContent   = "[R]";
        reloadButtonElement.style.opacity = "1";
        reloadButtonElement.style.color   = "#f55";
    } else {
        reloadButtonElement.textContent   = "[R]";
        reloadButtonElement.style.opacity = "0.7";
        reloadButtonElement.style.color   = "white";
    }
}

// ============================================================
// CREAZIONE CANVAS JOYSTICK
// ============================================================

/**
 * Crea un canvas HTML per un joystick e lo aggiunge al DOM.
 * Il canvas è in posizione fixed e non riceve eventi puntatore
 * (pointer-events: none) perché gli eventi vengono catturati
 * direttamente su window.
 *
 * @param {"left"|"right"} side - Lato dello schermo
 * @returns {HTMLCanvasElement}
 */
function createJoystickCanvas(side) {
    const canvas = document.createElement("canvas");
    canvas.width  = (JOYSTICK_OUTER_RADIUS + 10) * 2;
    canvas.height = (JOYSTICK_OUTER_RADIUS + 10) * 2;

    if (side === "left") {
        canvas.style.cssText = `position: fixed; left: 24px; bottom: 24px; pointer-events: none; z-index: 500; opacity: 0.8;`;
    } else {
        canvas.style.cssText = `position: fixed; right: 24px; bottom: 24px; pointer-events: none; z-index: 500; opacity: 0.8;`;
    }

    document.body.appendChild(canvas);
    return canvas;
}

/**
 * Ridisegna un joystick con il knob spostato di (dx, dy) rispetto al centro.
 * Se dx/dy sono 0,0 il knob è al centro (joystick rilasciato).
 *
 * @param {HTMLCanvasElement} canvas     - Il canvas del joystick
 * @param {number}            dx         - Spostamento orizzontale del knob
 * @param {number}            dy         - Spostamento verticale del knob
 * @param {string}            knobColor  - Colore CSS del knob
 */
function redrawJoystick(canvas, dx, dy, knobColor) {
    if (!canvas) return;

    const ctx    = canvas.getContext("2d");
    const centerX = JOYSTICK_OUTER_RADIUS + 10; // centro del canvas
    const centerY = JOYSTICK_OUTER_RADIUS + 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Cerchio esterno (base)
    ctx.beginPath();
    ctx.arc(centerX, centerY, JOYSTICK_OUTER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle   = "rgba(0, 0, 0, 0.35)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    // Clamp del knob entro il raggio massimo
    const maxKnobDistance = JOYSTICK_OUTER_RADIUS - JOYSTICK_KNOB_RADIUS;
    const distFromCenter  = Math.hypot(dx, dy);
    const clampedDx = distFromCenter > maxKnobDistance ? (dx / distFromCenter) * maxKnobDistance : dx;
    const clampedDy = distFromCenter > maxKnobDistance ? (dy / distFromCenter) * maxKnobDistance : dy;

    // Knob
    ctx.beginPath();
    ctx.arc(centerX + clampedDx, centerY + clampedDy, JOYSTICK_KNOB_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle   = knobColor || "rgba(255, 255, 255, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth   = 2;
    ctx.stroke();
}

// ============================================================
// CREAZIONE E RIMOZIONE TOUCH UI
// ============================================================

/**
 * Crea l'intera UI touch: joystick sinistro, joystick destro,
 * bottoni arma e bottone ricarica.
 * Chiamata al respawn e al primo ingresso in partita.
 * Non fa nulla su desktop o se la UI è già presente.
 */
export function creaTouchUI() {
    if (!isMobile() || moveJoystickCanvas) return;

    // ── Joystick sinistro (movimento) ─────────────────────────────
    moveJoystickCanvas = createJoystickCanvas("left");
    moveJoystickCenter = {
        x: 24 + JOYSTICK_OUTER_RADIUS + 10,
        y: window.innerHeight - 24 - JOYSTICK_OUTER_RADIUS - 10,
    };
    redrawJoystick(moveJoystickCanvas, 0, 0, "rgba(255,255,255,0.7)");

    // ── Joystick destro (mira / sparo) ────────────────────────────
    aimJoystickCanvas = createJoystickCanvas("right");
    aimJoystickCenter = {
        x: window.innerWidth  - 24 - JOYSTICK_OUTER_RADIUS - 10,
        y: window.innerHeight - 24 - JOYSTICK_OUTER_RADIUS - 10,
    };
    redrawJoystick(aimJoystickCanvas, 0, 0, "rgba(255,100,100,0.8)");

    // ── Bottoni arma e ricarica ────────────────────────────────────
    if (!weaponButtonElements.length) {
        // Posizionamento: centrato orizzontalmente, subito sopra l'HUD arma
        const barTopY   = hy(GAME_H - 44);
        const bottomPx  = Math.round(window.innerHeight - barTopY + 8);
        const buttonSize = 28;
        const buttonGap  = 8;

        const weaponConfigs = [
            { key: "gun",   label: "AR", color: "#e55" },
            { key: "pistol", label: "PI", color: "#e93" },
            { key: "fists",  label: "KN", color: "#333" },
        ];

        weaponConfigs.forEach((weapon, index) => {
            const totalButtonsWidth = 3 * buttonSize + 2 * buttonGap;
            const leftPosition = Math.round(window.innerWidth / 2 - totalButtonsWidth / 2) + index * (buttonSize + buttonGap);

            const btn = document.createElement("button");
            btn.textContent    = weapon.label;
            btn.dataset.weapon = weapon.key;
            btn.style.cssText = `
                position:    fixed;
                left:        ${leftPosition}px;
                bottom:      ${bottomPx}px;
                width:       ${buttonSize}px;
                height:      ${buttonSize}px;
                background:  ${weapon.color};
                color:       white;
                font-size:   10px;
                font-weight: bold;
                border:      1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                cursor:      pointer;
                z-index:     600;
                opacity:     0.9;
                font-family: monospace;
                padding:     0;
                line-height: ${buttonSize}px;
                text-align:  center;
            `;

            // Previene il comportamento touch di default (zoom, scroll, ecc.)
            btn.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
            btn.addEventListener("touchend",   (e) => {
                e.preventDefault();
                e.stopPropagation();
                cambiaArma(weapon.key);
            }, { passive: false });

            document.body.appendChild(btn);
            weaponButtonElements.push(btn);
        });

        // ── Bottone Ricarica ─────────────────────────────────────────
        const totalButtonsWidth   = 3 * buttonSize + 2 * buttonGap;
        const reloadButtonLeftPos = Math.round(window.innerWidth / 2 - totalButtonsWidth / 2) + totalButtonsWidth + 10;

        reloadButtonElement = document.createElement("button");
        reloadButtonElement.textContent = "[R]";
        reloadButtonElement.style.cssText = `
            position:    fixed;
            left:        ${reloadButtonLeftPos}px;
            bottom:      ${bottomPx}px;
            width:       ${buttonSize}px;
            height:      ${buttonSize}px;
            background:  rgba(30, 30, 30, 0.8);
            color:       white;
            font-size:   9px;
            font-weight: bold;
            border:      1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            cursor:      pointer;
            z-index:     600;
            opacity:     0.7;
            font-family: monospace;
            padding:     0;
            line-height: ${buttonSize}px;
            text-align:  center;
        `;

        reloadButtonElement.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
        reloadButtonElement.addEventListener("touchend",   (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!state.isReloading && state.weapon !== "fists" && state.socket) {
                state.socket.emit("reload");
            }
        }, { passive: false });

        document.body.appendChild(reloadButtonElement);
    }

    aggiornaWeaponBtns();
    aggiornaReloadBtn();
}

/**
 * Rimuove tutta la UI touch dal DOM e resetta lo stato dei joystick.
 * Chiamata quando si entra in un menu o si cambia schermata.
 */
export function rimuoviTouchUI() {
    if (moveJoystickCanvas)  { moveJoystickCanvas.remove();  moveJoystickCanvas  = null; }
    if (aimJoystickCanvas)   { aimJoystickCanvas.remove();   aimJoystickCanvas   = null; }
    weaponButtonElements.forEach(btn => btn.remove());
    weaponButtonElements = [];
    if (reloadButtonElement) { reloadButtonElement.remove(); reloadButtonElement = null; }

    // Resetta lo stato dei touch
    moveJoystickTouchId = null;
    aimJoystickTouchId  = null;
    state.aimJoyActive = false;
    state.aimJoyDir    = { x: 0, y: 0 };
}

// ============================================================
// HELPER: RESET POSIZIONE JOYSTICK
// ============================================================

/**
 * Riporta il joystick destro (mira) alla posizione angolo
 * in basso a destra quando viene rilasciato.
 */
function resetAimJoystickPosition() {
    if (!aimJoystickCanvas) return;
    aimJoystickCanvas.style.right  = "24px";
    aimJoystickCanvas.style.bottom = "24px";
    aimJoystickCanvas.style.left   = "auto";
    aimJoystickCanvas.style.top    = "auto";
    aimJoystickCenter = {
        x: window.innerWidth  - 24 - JOYSTICK_OUTER_RADIUS - 10,
        y: window.innerHeight - 24 - JOYSTICK_OUTER_RADIUS - 10,
    };
}

/**
 * Gestisce il rilascio del joystick destro (mira):
 * resetta posizione, stato e grafica.
 */
function releaseAimJoystick() {
    aimJoystickTouchId = null;
    state.aimJoyActive = false;
    state.aimJoyDir    = { x: 0, y: 0 };
    resetAimJoystickPosition();
    redrawJoystick(aimJoystickCanvas, 0, 0, "rgba(255,100,100,0.8)");
}

/**
 * Gestisce il rilascio del joystick sinistro (movimento):
 * azzera l'input e notifica il server.
 */
function releaseMoveJoystick() {
    moveJoystickTouchId = null;
    Object.assign(state.input, { left: false, right: false, up: false, down: false });
    state.socket.emit("input", state.input);

    // Riporta il joystick alla posizione angolo in basso a sinistra
    if (moveJoystickCanvas) {
        moveJoystickCanvas.style.left   = "24px";
        moveJoystickCanvas.style.top    = "auto";
        moveJoystickCanvas.style.bottom = "24px";
    }
    moveJoystickCenter = {
        x: 24 + JOYSTICK_OUTER_RADIUS + 10,
        y: window.innerHeight - 24 - JOYSTICK_OUTER_RADIUS - 10,
    };
    redrawJoystick(moveJoystickCanvas, 0, 0, "rgba(255,255,255,0.7)");
}

// ============================================================
// EVENTI TOUCH GLOBALI
// ============================================================

/**
 * Registra tutti i listener touch su window.
 * Deve essere chiamata una sola volta all'avvio.
 */
export function registraTouchEvents() {

    // ── touchstart: assegna i touch ai joystick ────────────────────
    window.addEventListener("touchstart", (event) => {
        if (state.inMenu || state.inLobbyScreen) return;

        for (const touch of event.changedTouches) {
            const touchX    = touch.clientX;
            const touchY    = touch.clientY;
            const halfWidth = window.innerWidth * 0.5;

            if (touchX < halfWidth && moveJoystickTouchId === null) {
                // Touch nella metà sinistra → joystick movimento
                moveJoystickTouchId = touch.identifier;
                moveJoystickCenter  = { x: touchX, y: touchY };

                if (moveJoystickCanvas) {
                    moveJoystickCanvas.style.left   = (touchX - JOYSTICK_OUTER_RADIUS - 10) + "px";
                    moveJoystickCanvas.style.top    = (touchY - JOYSTICK_OUTER_RADIUS - 10) + "px";
                    moveJoystickCanvas.style.bottom = "auto";
                }
                redrawJoystick(moveJoystickCanvas, 0, 0, "rgba(255,255,255,0.7)");

            } else if (touchX >= halfWidth && aimJoystickTouchId === null) {
                // Touch nella metà destra → joystick mira
                aimJoystickTouchId = touch.identifier;
                aimJoystickCenter  = { x: touchX, y: touchY };

                if (aimJoystickCanvas) {
                    aimJoystickCanvas.style.right  = "auto";
                    aimJoystickCanvas.style.left   = (touchX - JOYSTICK_OUTER_RADIUS - 10) + "px";
                    aimJoystickCanvas.style.top    = (touchY - JOYSTICK_OUTER_RADIUS - 10) + "px";
                    aimJoystickCanvas.style.bottom = "auto";
                }
                state.aimJoyActive = false;
                state.aimJoyDir    = { x: 0, y: 0 };
                redrawJoystick(aimJoystickCanvas, 0, 0, "rgba(255,100,100,0.8)");
            }
        }
    }, { passive: true });

    // ── touchmove: aggiorna i joystick attivi ─────────────────────
    window.addEventListener("touchmove", (event) => {
        if (state.inMenu || state.inLobbyScreen) return;

        for (const touch of event.changedTouches) {
            const touchX = touch.clientX;
            const touchY = touch.clientY;

            // ── Joystick sinistro: aggiorna direzione movimento ────
            if (touch.identifier === moveJoystickTouchId) {
                const dx = touchX - moveJoystickCenter.x;
                const dy = touchY - moveJoystickCenter.y;

                // Nuovi stati dei tasti direzionali
                const newInput = {
                    left:  dx < -JOYSTICK_DEAD_ZONE,
                    right: dx >  JOYSTICK_DEAD_ZONE,
                    up:    dy < -JOYSTICK_DEAD_ZONE,
                    down:  dy >  JOYSTICK_DEAD_ZONE,
                };

                // Invia al server solo se cambia qualcosa
                if (JSON.stringify(newInput) !== JSON.stringify(state.input)) {
                    Object.assign(state.input, newInput);
                    state.socket.emit("input", state.input);
                }

                redrawJoystick(moveJoystickCanvas, dx, dy, "rgba(255,255,255,0.7)");

            // ── Joystick destro: aggiorna angolo di mira ───────────
            } else if (touch.identifier === aimJoystickTouchId) {
                const dx = touchX - aimJoystickCenter.x;
                const dy = touchY - aimJoystickCenter.y;
                const distFromCenter = Math.hypot(dx, dy);

                if (distFromCenter > JOYSTICK_DEAD_ZONE) {
                    state.aimJoyActive = true;
                    state.aimJoyDir    = { x: dx / distFromCenter, y: dy / distFromCenter };
                    state.aimJoyAngle  = Math.atan2(dy, dx);
                    redrawJoystick(aimJoystickCanvas, dx, dy, "rgba(255,80,80,0.95)");
                } else {
                    state.aimJoyActive = false;
                    state.aimJoyDir    = { x: 0, y: 0 };
                    redrawJoystick(aimJoystickCanvas, 0, 0, "rgba(255,100,100,0.8)");
                }
            }
        }
    }, { passive: true });

    // ── touchend: rilascia i joystick ─────────────────────────────
    window.addEventListener("touchend", (event) => {
        for (const touch of event.changedTouches) {
            if (touch.identifier === moveJoystickTouchId) releaseMoveJoystick();
            if (touch.identifier === aimJoystickTouchId)  releaseAimJoystick();
        }
    }, { passive: true });

    // ── touchcancel: rilascia i joystick (interruzione di sistema) ─
    window.addEventListener("touchcancel", (event) => {
        for (const touch of event.changedTouches) {
            if (touch.identifier === moveJoystickTouchId) releaseMoveJoystick();
            if (touch.identifier === aimJoystickTouchId)  releaseAimJoystick();
        }
    }, { passive: true });
}