// ============================================================
// game.js — Input, sparo, camera e aggiornamento stato ricevuto
//
// Responsabilità di questo modulo:
//   1. Input tastiera (WASD + ESC + 1/2/3 + R)
//   2. Logica di sparo (mouse e touch) e invio al server
//   3. Aggiornamento camera ogni frame (Kaboom onUpdate)
//   4. Kill feed overlay
//   5. Applicazione dello stato ricevuto dal server: creazione /
//      aggiornamento / rimozione sprite dei giocatori e proiettili
// ============================================================

import { state, GAME_W, GAME_H, hx, hy, hs, isMobile, cambiaArma } from "./state.js";
import { playShootSound, playHitSound, playKillSound, playKnifeSound, playDeathSound } from "./audio.js";
import {
    aggiornaHUDStats, aggiornaHUDAmmo, aggiornaHUDArma, aggiornaHUDPlayers,
    aggiornaLeaderboard, mostraKillFeed, killFeedList, killFeedObjs,
} from "./hud.js";
import { aggiornaWeaponBtns, aggiornaReloadBtn, creaTouchUI } from "./touch.js";
import { triggerPunch } from "./weapons.js";

// ── Dipendenze iniettate da main.js ──────────────────────────
/** Funzione che distrugge tutti gli elementi UI correnti */
let destroyAllUI = null;
/** Funzione che mostra il menu di spawn */
let showSpawnMenu = null;

/**
 * Inizializza il modulo game con le dipendenze che non possono
 * essere importate direttamente (evitare dipendenze circolari).
 * @param {function} distruggiUI - Funzione di cleanup UI
 * @param {function} mostraMenu  - Funzione per mostrare il menu spawn
 */
export function initGame(distruggiUI, mostraMenu) {
    destroyAllUI = distruggiUI;
    showSpawnMenu = mostraMenu;
}

// ============================================================
// INPUT TASTIERA — MAPPATURA TASTI
// ============================================================

/** Mappa tasto → direzione d'input */
const KEYBOARD_DIRECTION_MAP = { a: "left", d: "right", w: "up", s: "down" };

// ============================================================
// BARRA DI HOLD ESC
// Il giocatore deve tenere premuto ESC per 1.5s per tornare
// al menu. Una barra di progresso mostra visivamente il tempo.
// ============================================================

/** Millisecondi che ESC deve essere tenuto per tornare al menu */
const ESC_HOLD_DURATION_MS = 1500;

let escHoldTimer     = null;          // setTimeout del selfKill
let escAnimFrame     = null;          // requestAnimationFrame (non usato, mantenuto per compatibilità)
let escPressedAt     = null;          // timestamp di quando ESC è stato premuto
let escProgressBar   = null;          // oggetto Kaboom della barra

/** Crea la barra visiva di progresso per l'hold ESC */
function createEscProgressBar() {
    removeEscProgressBar();

    escProgressBar = add([
        fixed(), z(300),
        {
            draw() {
                if (!escPressedAt) return;

                const progress = Math.min((performance.now() - escPressedAt) / ESC_HOLD_DURATION_MS, 1);
                const barWidth  = hs(220), barHeight = hs(10);
                const barX      = hx(GAME_W / 2) - barWidth / 2;
                const barY      = hy(40);

                // Sfondo scuro
                drawRect({ pos: vec2(barX, barY), width: barWidth, height: barHeight, radius: hs(3), color: rgb(0, 0, 0), opacity: 0.6 });

                // Barra riempita (rosso)
                if (progress > 0) {
                    drawRect({
                        pos: vec2(barX, barY),
                        width: Math.round(barWidth * progress),
                        height: barHeight,
                        radius: hs(3),
                        color: rgb(220, 60, 60),
                        opacity: 0.9,
                    });
                }

                // Etichetta testuale
                const label   = "Hold ESC to quit...";
                const fontSize = hs(13);
                drawText({
                    text:  label,
                    pos:   vec2(hx(GAME_W / 2) - label.length * fontSize * 0.29, barY + barHeight + hs(5)),
                    size:  fontSize,
                    color: rgb(220, 220, 220),
                });
            }
        }
    ]);
}

/** Rimuove la barra di progresso ESC dal canvas */
function removeEscProgressBar() {
    if (escProgressBar) { destroy(escProgressBar); escProgressBar = null; }
    escPressedAt = null;
}

/** Annulla completamente l'operazione di hold ESC */
function cancelEscHold() {
    if (escHoldTimer)   { clearTimeout(escHoldTimer);           escHoldTimer   = null; }
    if (escAnimFrame)   { cancelAnimationFrame(escAnimFrame);   escAnimFrame   = null; }
    removeEscProgressBar();
}

// ============================================================
// INPUT TASTIERA — EVENT LISTENER
// ============================================================

/**
 * Registra i listener globali per tastiera.
 * Deve essere chiamata una sola volta all'avvio.
 */
export function registraInputTastiera() {
    window.addEventListener("keydown", (event) => {
        // ── ESC: avvia hold per tornare al menu ─────────────────
        if (event.key === "Escape" &&
            !state.inMenu && !state.inLobbyScreen &&
            state.myId &&
            state.players[state.myId] &&
            !state.players[state.myId].morto &&
            !escHoldTimer) {

            escPressedAt = performance.now();
            createEscProgressBar();

            // Dopo 1.5s: suicidio volontario → torna al menu
            escHoldTimer = setTimeout(() => {
                cancelEscHold();
                if (state.socket) state.socket.emit("selfKill");
            }, ESC_HOLD_DURATION_MS);
        }

        // Ignora gli altri tasti quando si è in menu o lobby
        if (state.inMenu || state.inLobbyScreen) return;

        // ── WASD: movimento ──────────────────────────────────────
        const directionKey = KEYBOARD_DIRECTION_MAP[event.key.toLowerCase()];
        if (directionKey && !state.input[directionKey]) {
            state.input[directionKey] = true;
            state.socket.emit("input", state.input);
        }

        // ── 1/2/3: cambio arma ───────────────────────────────────
        if (event.key === "1") cambiaArma("gun");
        if (event.key === "2") cambiaArma("pistol");
        if (event.key === "3") cambiaArma("fists");

        // ── R: ricarica manuale ──────────────────────────────────
        if ((event.key === "r" || event.key === "R") &&
            !state.isReloading &&
            state.weapon !== "fists") {
            if (state.socket) state.socket.emit("reload");
        }
    });

    window.addEventListener("keyup", (event) => {
        // Rilascio ESC prima dei 1.5s → annulla tutto
        if (event.key === "Escape") cancelEscHold();

        if (state.inMenu || state.inLobbyScreen) return;

        // Rilascia il tasto direzionale
        const directionKey = KEYBOARD_DIRECTION_MAP[event.key.toLowerCase()];
        if (directionKey && state.input[directionKey]) {
            state.input[directionKey] = false;
            state.socket.emit("input", state.input);
        }
    });
}

// ============================================================
// LOGICA DI SPARO
// ============================================================

/** Cooldown della pistola in ms (verificato client-side) */
const PISTOL_CLIENT_COOLDOWN_MS = 200;
/** Intervallo di fuoco automatico in ms per il fucile */
const AUTO_FIRE_INTERVAL_MS     = 100;

/** Contatore pugni locali (per alternare mano destra/sinistra nell'animazione) */
let localPunchCount = 0;

/** Timestamp dell'ultimo sparo con pistola */
let lastPistolShotTime   = 0;
/** Timestamp dell'ultimo sparo automatico (fucile/karambit) */
let lastAutoFireTime     = 0;
/** true se il tasto sinistro del mouse è premuto */
let isMouseButtonHeld    = false;

/**
 * Spara con il mouse: calcola direzione verso il cursore e
 * invia "shoot" al server. Gestisce il cooldown della pistola.
 * Per il karambit, suona e anima la mano.
 */
export function shoot() {
    // Controlli di guardia: non sparare se in menu, morto, senza socket, ecc.
    if (state.inMenu || state.inLobbyScreen || !state.socket ||
        !state.myId || !state.players[state.myId] || state.players[state.myId].morto) return;

    // Cooldown client-side per la pistola (il server ha comunque il suo)
    if (state.weapon === "pistol") {
        const now = performance.now();
        if (now - lastPistolShotTime < PISTOL_CLIENT_COOLDOWN_MS) return;
        lastPistolShotTime = now;
    }

    const mySprite   = state.players[state.myId].sprite;
    const mouseWorld = toWorld(mousePos()); // converte coordinate schermo → mondo

    // Direzione dal centro del giocatore al cursore
    const direction = { x: mouseWorld.x - mySprite.pos.x, y: mouseWorld.y - mySprite.pos.y };
    const dirLength = Math.hypot(direction.x, direction.y);
    if (!dirLength) return; // cursore esattamente sul giocatore

    const normalizedDirX = direction.x / dirLength;
    const normalizedDirY = direction.y / dirLength;
    const aimAngle       = Math.atan2(direction.y, direction.x);

    // Distanza dalla canna dell'arma all'origine del proiettile
    // (fists = 0, pistola = 34px, fucile = 64px dal centro)
    const muzzleDistance = state.weapon === "fists" ? 0 : 24 + (state.weapon === "pistol" ? 10 : 40);

    state.socket.emit("aim",   aimAngle);
    state.socket.emit("shoot", {
        dir:       direction,
        tipOffset: { x: normalizedDirX * muzzleDistance, y: normalizedDirY * muzzleDistance },
    });

    // Effetti sonori e animazione
    if (state.weapon !== "fists") {
        playShootSound();
    } else {
        playKnifeSound();
        localPunchCount++;
        // Mano destra se dispari, sinistra se pari
        triggerPunch(state.myId, localPunchCount % 2 === 1 ? 1 : 0);
    }
}

/**
 * Spara con il joystick touch (mobile): usa la direzione del
 * joystick destro invece del cursore del mouse.
 */
function shootWithTouchJoystick() {
    if (state.inMenu || state.inLobbyScreen || !state.socket ||
        !state.myId || !state.players[state.myId] || state.players[state.myId].morto) return;
    if (!state.aimJoyActive) return;

    const nx = state.aimJoyDir.x;
    const ny = state.aimJoyDir.y;
    if (!nx && !ny) return;

    const muzzleDistance = state.weapon === "fists" ? 0 : 24 + (state.weapon === "pistol" ? 10 : 40);

    state.socket.emit("shoot", {
        dir:       { x: nx, y: ny },
        tipOffset: { x: nx * muzzleDistance, y: ny * muzzleDistance },
    });

    if (state.weapon !== "fists") {
        playShootSound();
    } else {
        playKnifeSound();
        localPunchCount++;
        triggerPunch(state.myId, localPunchCount % 2 === 1 ? 1 : 0);
    }
}

/**
 * Registra i listener per gli eventi di sparo (mouse e touch).
 * Il loop di fuoco automatico viene avviato tramite requestAnimationFrame.
 *
 * @param {HTMLCanvasElement} canvas - Il canvas di gioco (per gli eventi mouse)
 */
export function registraEventiSparo(canvas) {

    // ── Loop di fuoco automatico ─────────────────────────────────
    // Gestisce: fuoco tenuto (fucile/karambit) + joystick touch
    function autoFireLoop() {
        const now = performance.now();

        // Fuoco automatico con tasto mouse tenuto premuto
        if (isMouseButtonHeld && state.weapon === "gun" && now - lastAutoFireTime >= AUTO_FIRE_INTERVAL_MS) {
            shoot();
            lastAutoFireTime = now;
        }
        if (isMouseButtonHeld && state.weapon === "fists" && now - lastAutoFireTime >= 800) {
            shoot();
            lastAutoFireTime = now;
        }

        // Fuoco automatico con joystick touch
        if (state.aimJoyActive) {
            if (state.socket) state.socket.emit("aim", state.aimJoyAngle);

            const touchCooldown = state.weapon === "gun"
                ? AUTO_FIRE_INTERVAL_MS
                : state.weapon === "fists"
                    ? 800
                    : PISTOL_CLIENT_COOLDOWN_MS;

            if (now - lastPistolShotTime >= touchCooldown) {
                shootWithTouchJoystick();
                lastPistolShotTime = now;
            }
        }

        requestAnimationFrame(autoFireLoop);
    }
    requestAnimationFrame(autoFireLoop);

    // ── Mouse down: inizia a sparare ─────────────────────────────
    window.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return; // solo tasto sinistro
        isMouseButtonHeld = true;
        shoot();
        lastAutoFireTime = performance.now();
    });

    // ── Mouse up: smette di sparare ──────────────────────────────
    window.addEventListener("mouseup", (event) => {
        if (event.button !== 0) return;
        isMouseButtonHeld = false;
    });

    // ── Mouse move: aggiorna l'angolo di mira ────────────────────
    // Solo su desktop; su mobile il joystick aggiorna l'angolo nel loop
    onMouseMove(() => {
        if (isMobile()) return;
        if (state.inMenu || state.inLobbyScreen || !state.socket ||
            !state.myId || !state.players[state.myId] || state.players[state.myId].morto) return;

        const mySprite   = state.players[state.myId].sprite;
        const mouseWorld = toWorld(mousePos());
        state.socket.emit("aim", Math.atan2(mouseWorld.y - mySprite.pos.y, mouseWorld.x - mySprite.pos.x));
    });
}

// ============================================================
// KABOOM onUpdate — Camera e Kill Feed
// ============================================================

/**
 * Registra il callback onUpdate di Kaboom.
 * Aggiorna la posizione della camera e renderizza il kill feed.
 */
export function registraOnUpdate() {
    onUpdate(() => {
        // Non aggiornare nulla se siamo in menu o non ancora entrati in gioco
        if (state.inMenu || state.inLobbyScreen || !state.myId || !state.players[state.myId]) return;

        // ── Camera: segue il giocatore locale ────────────────────
        if (!state.players[state.myId].morto) {
            camPos(state.players[state.myId].sprite.pos.x, state.players[state.myId].sprite.pos.y);
        }
        camScale(state.CAM_ZOOM);

        // ── Kill Feed: overlay con i messaggi di kill ─────────────
        // Distrugge i testi vecchi e li ricrea aggiornati ogni frame
        for (const textObj of killFeedObjs) destroy(textObj);
        killFeedObjs.length = 0;

        for (let i = killFeedList.length - 1; i >= 0; i--) {
            killFeedList[i].timer -= dt();

            if (killFeedList[i].timer <= 0) {
                killFeedList.splice(i, 1);
                continue;
            }

            // Ogni messaggio appare in una riga diversa dal basso verso l'alto
            const rowIndex    = killFeedList.length - 1 - i;
            const messageText = killFeedList[i].msg;

            killFeedObjs.push(add([
                text(messageText, { size: hs(18) }),
                pos(hx(GAME_W / 2), hy(GAME_H - 80 - rowIndex * 28)),
                anchor("center"),
                color(rgb(255, 220, 80)),
                opacity(Math.min(1, killFeedList[i].timer)), // fade out nell'ultimo secondo
                fixed(),
                z(100),
            ]));
        }
    });
}

// ============================================================
// BARRA HP — WIDGET KABOOM PERSONALIZZATO
// ============================================================

/**
 * Crea l'oggetto Kaboom della barra HP del giocatore locale.
 * Usa un draw() custom per il gradiente verde→rosso e il testo.
 *
 * @param {number} initialHp - HP iniziali da mostrare
 * @returns {KaboomObject} Oggetto Kaboom della barra HP
 */
function createHealthBar(initialHp) {
    return add([
        fixed(), z(200),
        {
            /** Valore HP da mostrare (interpolato lentamente) */
            _displayedHp: initialHp,

            draw() {
                const barX = hx(GAME_W / 2 - 150);
                const barY = hy(GAME_H - 50);
                const cornerRadius = 4;
                const barWidth     = hs(300);
                const barHeight    = hs(28);

                // Bordo esterno scuro
                drawRect({
                    pos: vec2(barX - 2, barY - 2),
                    width: barWidth + 4, height: barHeight + 4,
                    radius: cornerRadius + 1, color: rgb(30, 30, 30),
                });

                // Sfondo grigio (HP mancanti)
                drawRect({
                    pos: vec2(barX, barY),
                    width: barWidth, height: barHeight,
                    radius: cornerRadius, color: rgb(90, 90, 90),
                });

                // Barra riempita con colore che va dal verde (100%) al rosso (0%)
                const hpPercent = this._displayedHp / 100;
                let barColor;
                if (hpPercent > 0.5) {
                    // Verde → giallo (50% → 100%)
                    barColor = rgb(Math.round((1 - hpPercent) * 2 * 220), 220, 0);
                } else {
                    // Giallo → rosso (0% → 50%)
                    barColor = rgb(220, Math.round(hpPercent * 2 * 220), 0);
                }

                if (this._displayedHp > 0) {
                    drawRect({
                        pos: vec2(barX, barY),
                        width:  Math.max(barWidth * (this._displayedHp / 100), cornerRadius * 2),
                        height: barHeight,
                        radius: cornerRadius,
                        color:  barColor,
                    });
                }

                // Testo "HP | 100"
                const hpText   = `${Math.ceil(this._displayedHp)} | 100`;
                const fontSize = hs(16);
                const textWidth = hpText.length * fontSize * 0.58;
                drawText({
                    text:  hpText,
                    pos:   vec2(barX + barWidth / 2 - textWidth / 2, barY + barHeight / 2 - fontSize * 0.6),
                    size:  fontSize,
                    color: rgb(255, 255, 255),
                });
            }
        }
    ]);
}

// ============================================================
// AGGIORNAMENTO STATO RICEVUTO DAL SERVER
// ============================================================

/**
 * Applica lo snapshot di stato ricevuto dal server ogni tick:
 *   • Aggiorna HUD (leaderboard, ammo, contatori)
 *   • Crea sprite per nuovi giocatori
 *   • Aggiorna posizione/HP/animazioni degli sprite esistenti
 *   • Rimuove sprite di giocatori disconnessi
 *   • Sincronizza i proiettili visibili
 *
 * @param {Object}            serverSnapshot - Payload dell'evento "state"
 * @param {HTMLCanvasElement} canvas         - Canvas di gioco
 */
export function aggiornaStato(serverSnapshot, canvas) {

    // ── Inizializzazione camera al primo frame ────────────────────
    if (!state.cameraInizializzata && state.myId &&
        serverSnapshot.players[state.myId] && !state.inMenu) {

        const myServerData = serverSnapshot.players[state.myId];
        camPos(myServerData.pos.x, myServerData.pos.y);
        camScale(state.CAM_ZOOM);
        state.cameraInizializzata = true;
    }

    // ── Aggiornamento HUD ─────────────────────────────────────────
    if (serverSnapshot.lb) {
        aggiornaLeaderboard(serverSnapshot.lb);
    }
    if (serverSnapshot.playerCount !== undefined) {
        aggiornaHUDPlayers(serverSnapshot.playerCount, serverSnapshot.maxPlayers);
    }

    // Sincronizza munizioni locali con quelle del server
    if (state.myId && serverSnapshot.players[state.myId] && serverSnapshot.players[state.myId].ammo) {
        const serverAmmo = serverSnapshot.players[state.myId].ammo;
        if (serverAmmo.gun !== state.myAmmo.gun || serverAmmo.pistol !== state.myAmmo.pistol) {
            state.myAmmo = serverAmmo;
            aggiornaHUDAmmo();
            aggiornaReloadBtn();
        }
    }

    // ── Rimuove giocatori non più presenti nel server snapshot ────
    for (const playerId in state.players) {
        if (!serverSnapshot.players[playerId]) {
            // Pulisci tutti gli oggetti Kaboom associati
            if (state.players[playerId].labelObj) destroy(state.players[playerId].labelObj);
            if (state.players[playerId].hpBar)    destroy(state.players[playerId].hpBar);
            if (state.players[playerId].sprite)   destroy(state.players[playerId].sprite);
            delete state.players[playerId];
        }
    }

    // ── Crea o aggiorna ogni giocatore nel snapshot ────────────────
    for (const playerId in serverSnapshot.players) {
        const serverPlayerData = serverSnapshot.players[playerId];
        const isLocalPlayer    = (playerId === state.myId);

        // Gestisci transizione da vivo → morto per il giocatore locale
        if (isLocalPlayer &&
            serverPlayerData.morto &&
            state.players[playerId] &&
            !state.players[playerId].morto &&
            !state.inMenu) {

            state.myDeaths++;
            aggiornaHUDStats();
            playDeathSound();
            showSpawnMenu("You were eliminated!");
        }

        // ── Nuovo giocatore: crea sprite ─────────────────────────
        if (!state.players[playerId]) {
            if (serverPlayerData.morto) continue; // non creare sprite per giocatori morti

            // Cerchio che rappresenta il corpo del giocatore
            const playerSprite = add([
                pos(serverPlayerData.pos.x, serverPlayerData.pos.y),
                anchor("center"),
                circle(24),
                color(rgb(222, 196, 145)), // colore pelle
                outline(4, rgb(0, 0, 0)),
                z(1),
            ]);

            // Label con nickname sopra il giocatore locale (solo per sé stessi)
            const nicknameLabel = isLocalPlayer
                ? add([
                    pos(serverPlayerData.pos.x, serverPlayerData.pos.y + 40),
                    anchor("center"),
                    text(state.myNickname || "TU", { size: 17 }),
                    color(rgb(0, 220, 255)),
                    z(0.5),
                ])
                : null;

            // Barra HP (solo per il giocatore locale)
            const healthBar = isLocalPlayer ? createHealthBar(serverPlayerData.hp) : null;

            state.players[playerId] = {
                sprite:        playerSprite,
                labelObj:      nicknameLabel,
                hpBar:         healthBar,
                dirIndicator:  { angle: serverPlayerData.angle || 0, visible: true, weapon: serverPlayerData.weapon || "gun" },
                morto:         serverPlayerData.morto,
                lastPunchCount: serverPlayerData.punchCount || 0,
                punchStartTime: null,
                punchHand:      1,
            };

            // Quando il giocatore locale entra in partita per la prima volta
            if (isLocalPlayer) {
                destroyAllUI();
                state.inMenu = false;
                state.cameraInizializzata = false;

                // Azzera input: tasti già premuti non devono muovere il player
                Object.assign(state.input, { left: false, right: false, up: false, down: false });
                state.prevInput = "";
                state.socket.emit("input", state.input);

                if (isMobile()) creaTouchUI();
            }

        // ── Giocatore già esistente: aggiorna ────────────────────
        } else {
            const lerp = isLocalPlayer ? 0.8 : 0.3; // il proprio sprite è più reattivo
            const localPlayerData = state.players[playerId];
            const wasDeadBefore   = localPlayerData.morto;
            localPlayerData.morto = serverPlayerData.morto;

            // Nasconde sprite quando morto
            if (serverPlayerData.morto) {
                localPlayerData.sprite.hidden = true;
                if (localPlayerData.labelObj) localPlayerData.labelObj.hidden = true;
                if (localPlayerData.hpBar)    localPlayerData.hpBar.hidden    = true;
                localPlayerData.dirIndicator.visible = false;
            }

            // Aggiorna quando il giocatore è vivo
            if (!serverPlayerData.morto) {

                // Transizione morto → vivo per il giocatore locale (respawn)
                if (isLocalPlayer && wasDeadBefore) {
                    destroyAllUI();
                    state.inMenu = false;
                    state.cameraInizializzata = false;

                    // Azzera input residui dalla sessione precedente
                    Object.assign(state.input, { left: false, right: false, up: false, down: false });
                    state.prevInput = "";
                    state.socket.emit("input", state.input);

                    // Simula un movimento del mouse per aggiornare l'angolo di mira al respawn
                    canvas.dispatchEvent(new MouseEvent("mousemove", {
                        bubbles: true,
                        clientX: window.innerWidth  / 2,
                        clientY: window.innerHeight / 2,
                    }));

                    // Ricrea la barra HP (era nascosta dopo la morte)
                    localPlayerData.hpBar = createHealthBar(serverPlayerData.hp);

                    // Ricrea il nickname label
                    if (localPlayerData.labelObj) destroy(localPlayerData.labelObj);
                    localPlayerData.labelObj = add([
                        pos(serverPlayerData.pos.x, serverPlayerData.pos.y + 40),
                        anchor("center"),
                        text(state.myNickname || "TU", { size: 17 }),
                        color(rgb(0, 220, 255)),
                        z(0.5),
                    ]);

                    if (isMobile()) creaTouchUI();
                }

                // Mostra sprite nascosti
                localPlayerData.sprite.hidden = false;
                if (localPlayerData.hpBar) localPlayerData.hpBar.hidden = false;

                // Effetto flash quando colpito (bianco per 80ms)
                if (serverPlayerData.hitFlash) {
                    localPlayerData.sprite.color = rgb(255, 255, 255);
                    if (isLocalPlayer) playHitSound();
                    setTimeout(() => {
                        if (localPlayerData.sprite) localPlayerData.sprite.color = rgb(222, 196, 145);
                    }, 80);
                }

                // Animazione pugno per i giocatori avversari (confronta contatore)
                if (!isLocalPlayer && serverPlayerData.punchCount &&
                    serverPlayerData.punchCount !== localPlayerData.lastPunchCount) {
                    localPlayerData.lastPunchCount = serverPlayerData.punchCount;
                    triggerPunch(playerId, serverPlayerData.punchHand ?? 1);
                }

                // Interpolazione posizione (lerp) per movimento fluido
                localPlayerData.sprite.pos.x += (serverPlayerData.pos.x - localPlayerData.sprite.pos.x) * lerp;
                localPlayerData.sprite.pos.y += (serverPlayerData.pos.y - localPlayerData.sprite.pos.y) * lerp;

                // Aggiorna posizione del nickname label
                if (localPlayerData.labelObj) {
                    localPlayerData.labelObj.pos.x += (serverPlayerData.pos.x - localPlayerData.labelObj.pos.x) * lerp;
                    localPlayerData.labelObj.pos.y += (serverPlayerData.pos.y + 40 - localPlayerData.labelObj.pos.y) * lerp;
                }

                // Interpolazione lenta della barra HP (effetto "drain")
                if (localPlayerData.hpBar) {
                    localPlayerData.hpBar._displayedHp += (serverPlayerData.hp - localPlayerData.hpBar._displayedHp) * 0.15;
                    // Snap quando abbastanza vicino al valore reale
                    if (Math.abs(serverPlayerData.hp - localPlayerData.hpBar._displayedHp) < 0.3) {
                        localPlayerData.hpBar._displayedHp = serverPlayerData.hp;
                    }
                }

                // Aggiorna indicatore di direzione (usato da weapons.js per disegnare l'arma)
                localPlayerData.dirIndicator.angle   = serverPlayerData.angle  || 0;
                localPlayerData.dirIndicator.weapon  = serverPlayerData.weapon || "gun";
                localPlayerData.dirIndicator.visible = true;
            }
        }
    }

    // ── Sincronizzazione proiettili visibili ──────────────────────
    // Rimuovi proiettili non più presenti nel server snapshot
    const bulletIdsFromServer = new Set(serverSnapshot.proiettili.map(b => b.id));
    for (const bulletId in state.bulletSprites) {
        if (!bulletIdsFromServer.has(Number(bulletId))) {
            destroy(state.bulletSprites[bulletId]);
            delete state.bulletSprites[bulletId];
        }
    }

    const now = Date.now();
    for (const bulletData of serverSnapshot.proiettili) {

        if (!state.bulletSprites[bulletData.id]) {
            // ── Crea nuovo sprite proiettile ─────────────────────
            // Il proiettile viene disegnato come una linea con glow
            const dirX = bulletData.dir.x;
            const dirY = bulletData.dir.y;

            state.bulletSprites[bulletData.id] = add([
                pos(bulletData.pos.x, bulletData.pos.y),
                z(3),
                {
                    _dirX: dirX,
                    _dirY: dirY,
                    _bornAt: now,

                    draw() {
                        const LENGTH = 18, THICKNESS = 3.5;

                        // Ombra/glow esterno
                        drawLine({
                            p1:    vec2(-this._dirX * (LENGTH / 2 + 1), -this._dirY * (LENGTH / 2 + 1)),
                            p2:    vec2( this._dirX * (LENGTH / 2 + 1),  this._dirY * (LENGTH / 2 + 1)),
                            width: THICKNESS + 2,
                            color: rgb(80, 60, 20),
                            opacity: 0.35,
                        });

                        // Corpo principale (bossolo dorato)
                        drawLine({
                            p1:    vec2(-this._dirX * LENGTH / 2, -this._dirY * LENGTH / 2),
                            p2:    vec2( this._dirX * LENGTH / 2,  this._dirY * LENGTH / 2),
                            width: THICKNESS,
                            color: rgb(220, 195, 140),
                        });

                        // Riflesso chiaro al centro
                        drawLine({
                            p1:    vec2(-this._dirX * LENGTH * 0.3, -this._dirY * LENGTH * 0.3),
                            p2:    vec2( this._dirX * LENGTH * 0.3,  this._dirY * LENGTH * 0.3),
                            width: THICKNESS * 0.45,
                            color: rgb(245, 230, 185),
                        });
                    }
                }
            ]);

        } else {
            // ── Aggiorna sprite proiettile esistente ─────────────
            const bulletSprite = state.bulletSprites[bulletData.id];

            // Rimuovi proiettili che superano 500ms di vita (sicurezza client)
            if (now - bulletSprite._bornAt >= 500) {
                destroy(bulletSprite);
                delete state.bulletSprites[bulletData.id];
            } else {
                bulletSprite.pos = vec2(bulletData.pos.x, bulletData.pos.y);
            }
        }
    }
}