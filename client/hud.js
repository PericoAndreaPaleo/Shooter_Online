// ============================================================
// hud.js — Heads-Up Display (HUD) e Minimappa
//
// Contiene tutti i widget fissi sullo schermo:
//   • Statistiche K/D
//   • Arma corrente + slot armi
//   • Munizioni + barra di ricarica
//   • Nome lobby + contatore giocatori
//   • Leaderboard
//   • Kill feed
//   • Minimappa (angolo in basso a destra)
//   • Barre nere letterbox
//
// Tutti i widget usano coordinate logiche (hx/hy/hs)
// ricalcolate ogni frame in draw(), così si adattano
// automaticamente al resize della finestra.
// ============================================================

import { state, GAME_W, GAME_H, hx, hy, hs, calcolaLetterbox, isMobile } from "./state.js";

/** Opacità di sfondo comune per i box HUD */
const HUD_BG_ALPHA  = 0.45;
/** Raggio degli angoli arrotondati dei box HUD */
const HUD_BOX_RADIUS = 4;

// ── Riferimenti agli oggetti Kaboom (per poterli distruggere e ricreare) ──
export const killFeedList = [];   // messaggi kill feed: { msg: string, timer: number }
export let   killFeedObjs  = [];  // oggetti Kaboom correnti del kill feed

let leaderboardObjects = [];      // oggetti Kaboom del pannello leaderboard

let hudKillDeathObj = null;        // widget statistiche K/D
let hudWeaponSlotObj = null;       // widget slot arma corrente
let hudLobbyNameObj  = null;       // widget nome lobby
let hudPlayerCountObj = null;      // widget contatore giocatori
let hudAmmoObj       = null;       // widget munizioni + barra ricarica
let blackBarsOverlay = null;       // overlay barre nere letterbox

// ============================================================
// HELPER: hudBox — Widget testo con sfondo rettangolare
// ============================================================

/**
 * Crea un widget HUD generico: un rettangolo semitrasparente
 * con del testo sopra. Posizione e testo sono ricalcolati
 * ogni frame tramite le funzioni getter passate come parametri.
 *
 * @param {function|number} getX       - Getter della coordinata X
 * @param {function|number} getY       - Getter della coordinata Y
 * @param {function|string} getText    - Getter del testo da mostrare
 * @param {Object}          opts       - Opzioni stilistiche opzionali
 * @returns {KaboomObject}
 */
function createHudBox(getX, getY, getText, opts = {}) {
    // Accetta sia valori fissi che getter dinamici
    const resolveX    = typeof getX    === "function" ? getX    : () => getX;
    const resolveY    = typeof getY    === "function" ? getY    : () => getY;
    const resolveText = typeof getText === "function" ? getText : () => getText;

    // Stile con valori di default
    const padding     = opts.pad      ?? 6;
    const fontSize    = opts.size     ?? 13;
    const textColor   = opts.textCol  ?? rgb(220, 220, 220);
    const bgColor     = opts.boxCol   ?? rgb(0, 0, 0);
    const bgAlpha     = opts.boxAlpha ?? 0.45;
    const borderRadius = opts.radius  ?? 4;

    return add([
        fixed(), z(100),
        {
            draw() {
                const x    = resolveX();
                const y    = resolveY();
                const text = resolveText();

                // Risolve valori che potrebbero essere getter
                const sz  = typeof fontSize === "function" ? fontSize() : fontSize;
                const pad = typeof padding  === "function" ? padding()  : padding;

                // Stima dimensioni testo (proporzionale: ~0.58em per carattere)
                const textWidth  = text.length * sz * 0.58;
                const textHeight = sz * 1.3;

                // Sfondo
                drawRect({
                    pos:    vec2(x - pad, y - pad * 0.5),
                    width:  textWidth + pad * 2,
                    height: textHeight + pad,
                    radius: borderRadius,
                    color:  bgColor,
                    opacity: bgAlpha,
                });

                // Testo
                drawText({ text, pos: vec2(x, y), size: sz, color: textColor });
            }
        }
    ]);
}

// ============================================================
// WIDGET: Slot Arma (in basso a sinistra)
// Mostra i tre slot arma con evidenziazione di quella attiva.
// Su mobile non viene mostrata (sostituita dai bottoni touch).
// ============================================================

/** Ricrea il widget degli slot arma. Chiamare dopo ogni cambio arma. */
export function aggiornaHUDArma() {
    if (hudWeaponSlotObj) { destroy(hudWeaponSlotObj); hudWeaponSlotObj = null; }
    if (state.inLobbyScreen) return;
    if (isMobile()) return; // su mobile ci sono i bottoni touch

    const weaponNames     = { gun: "Rifle", pistol: "Pistol", fists: "Knife" };
    const weaponSlotOrder = ["gun", "pistol", "fists"];

    hudWeaponSlotObj = add([
        fixed(), z(100),
        {
            draw() {
                const slotFontSize   = hs(16);
                const slotPadding    = hs(8);
                const slotGap        = hs(5);
                let currentX         = hx(10);
                const baseY          = hy(GAME_H - 46);

                for (const weaponKey of weaponSlotOrder) {
                    const label    = weaponNames[weaponKey];
                    const slotW    = label.length * slotFontSize * 0.58 + slotPadding * 2;
                    const slotH    = slotFontSize * 1.5 + slotPadding;
                    const isActive = weaponKey === state.weapon;

                    // Sfondo slot (più opaco se attivo)
                    drawRect({
                        pos: vec2(currentX, baseY),
                        width: slotW, height: slotH,
                        radius: hs(4),
                        color: rgb(0, 0, 0),
                        opacity: isActive ? 0.7 : 0.3,
                    });

                    // Indicatore attivo: lineetta bianca in cima allo slot
                    if (isActive) {
                        drawRect({
                            pos: vec2(currentX, baseY),
                            width: slotW, height: hs(2),
                            color: rgb(220, 220, 220), opacity: 0.9,
                        });
                    }

                    // Nome arma
                    drawText({
                        text:  label,
                        pos:   vec2(currentX + slotPadding, baseY + slotPadding * 0.6),
                        size:  slotFontSize,
                        color: isActive ? rgb(240, 240, 240) : rgb(100, 100, 100),
                    });

                    currentX += slotW + slotGap;
                }
            }
        }
    ]);

    aggiornaHUDAmmo();
}

// ============================================================
// WIDGET: Munizioni (in basso a destra)
// Mostra "AMMO | MAX" con barra di ricarica sovrapposta.
// ============================================================

/** Ricrea il widget munizioni. Chiamare dopo ogni sparo o cambio arma. */
export function aggiornaHUDAmmo() {
    if (hudAmmoObj) { destroy(hudAmmoObj); hudAmmoObj = null; }
    if (state.weapon === "fists") return; // karambit: munizioni infinite, non mostrare

    const currentAmmo = state.myAmmo[state.weapon] ?? 0;
    const maxAmmo     = state.weapon === "gun" ? 30 : 15;

    hudAmmoObj = add([
        fixed(), z(100),
        {
            draw() {
                // Font size diversi per valore corrente (grande) e massimo (piccolo)
                const bigFontSize   = hs(22);
                const smallFontSize = hs(13);
                const boxPadding    = hs(10);

                const currentStr   = String(currentAmmo);
                const separatorStr = " | ";
                const maxStr       = String(maxAmmo);

                // Larghezza di ogni componente testuale
                const currentW   = currentStr.length   * bigFontSize   * 0.6;
                const separatorW = separatorStr.length * smallFontSize * 0.6;
                const maxW       = maxStr.length       * smallFontSize * 0.6;
                const totalWidth = currentW + separatorW + maxW + boxPadding * 2;
                const totalHeight = bigFontSize * 1.4 + boxPadding;

                // Posiziona il box nell'angolo in basso a destra
                const boxX = hx(GAME_W - 14) - totalWidth;
                const boxY = hy(GAME_H - 14) - totalHeight;

                // Sfondo scuro
                drawRect({
                    pos: vec2(boxX, boxY),
                    width: totalWidth, height: totalHeight,
                    radius: hs(4), color: rgb(0, 0, 0), opacity: 0.5,
                });

                // Barra di ricarica sovrapposta (progress sweep)
                if (state.isReloading && state.reloadDuration > 0) {
                    const elapsed      = Math.min(Date.now() - state.reloadStartTime, state.reloadDuration);
                    const reloadProgress = elapsed / state.reloadDuration;
                    const sweepWidth   = Math.round(totalWidth * reloadProgress);

                    // Fill grigio chiaro che scorre da sinistra a destra
                    drawRect({
                        pos: vec2(boxX, boxY),
                        width: sweepWidth, height: totalHeight,
                        radius: hs(4), color: rgb(200, 200, 200), opacity: 0.18,
                    });

                    // Linea verticale al fronte del fill (effetto "cursore")
                    if (sweepWidth > 0 && sweepWidth < totalWidth) {
                        drawRect({
                            pos: vec2(boxX + sweepWidth - hs(2), boxY),
                            width: hs(2), height: totalHeight,
                            color: rgb(255, 255, 255), opacity: 0.6,
                        });
                    }
                }

                // Colore del numero di munizioni: rosso se vuoto, giallo se basso, bianco altrimenti
                const ammoColor = currentAmmo === 0
                    ? rgb(200, 70, 70)
                    : currentAmmo <= maxAmmo * 0.3
                        ? rgb(200, 160, 60)
                        : rgb(220, 220, 220);

                // Disegna "AMMO | MAX" con font misti
                let textX = boxX + boxPadding;
                const textBaseY = boxY + boxPadding * 0.5;

                drawText({ text: currentStr,   pos: vec2(textX, textBaseY), size: bigFontSize,   color: ammoColor });
                textX += currentW;
                drawText({ text: separatorStr, pos: vec2(textX, textBaseY + (bigFontSize - smallFontSize) * 0.5), size: smallFontSize, color: rgb(100, 100, 100) });
                textX += separatorW;
                drawText({ text: maxStr,        pos: vec2(textX, textBaseY + (bigFontSize - smallFontSize) * 0.5), size: smallFontSize, color: rgb(100, 100, 100) });

                // Suggerimento [R] Reload quando a secco
                if (currentAmmo === 0 && !state.isReloading) {
                    const hint     = "[R] Reload";
                    const hintSize = hs(12);
                    const hintPad  = hs(6);
                    const hintW    = hint.length * hintSize * 0.58 + hintPad * 2;
                    const hintH    = hintSize * 1.4 + hintPad;
                    const hintX    = boxX + (totalWidth - hintW) / 2;
                    const hintY    = boxY - hintH - hs(4);

                    drawRect({ pos: vec2(hintX, hintY), width: hintW, height: hintH, radius: hs(4), color: rgb(0, 0, 0), opacity: 0.6 });
                    drawText({ text: hint, pos: vec2(hintX + hintPad, hintY + hintPad * 0.7), size: hintSize, color: rgb(220, 80, 80) });
                }
            }
        }
    ]);
}

// ============================================================
// WIDGET: Statistiche K/D (in basso a sinistra, sopra le armi)
// ============================================================

/** Ricrea il widget Kill/Death. Chiamare quando cambiano le statistiche. */
export function aggiornaHUDStats() {
    if (hudKillDeathObj) { destroy(hudKillDeathObj); hudKillDeathObj = null; }

    hudKillDeathObj = createHudBox(
        () => hx(10),
        () => hy(GAME_H - 90),
        () => `K: ${state.myKills}  D: ${state.myDeaths}`,
        {
            size:     () => hs(18),
            textCol:  rgb(220, 220, 220),
            boxCol:   rgb(0, 0, 0),
            boxAlpha: HUD_BG_ALPHA,
            pad:      () => hs(7),
            radius:   HUD_BOX_RADIUS,
        }
    );
}

// ============================================================
// WIDGET: Nome Lobby (in alto a sinistra)
// ============================================================

/** Ricrea il widget nome lobby. Chiamare dopo l'init della lobby. */
export function aggiornaHUDLobby() {
    if (hudLobbyNameObj) { destroy(hudLobbyNameObj); hudLobbyNameObj = null; }
    if (!state.myLobbyName) return;

    hudLobbyNameObj = createHudBox(
        () => hx(10),
        () => hy(10),
        () => `Lobby: ${state.myLobbyName}`,
        {
            size:     () => hs(15),
            textCol:  rgb(230, 230, 230),
            boxCol:   rgb(0, 0, 0),
            boxAlpha: 0.55,
            pad:      () => hs(6),
            radius:   HUD_BOX_RADIUS,
        }
    );
}

// ============================================================
// WIDGET: Contatore Giocatori (in alto a sinistra, sotto la lobby)
// ============================================================

/**
 * Ricrea il widget contatore giocatori.
 * @param {number} count - Giocatori correnti
 * @param {number} max   - Capienza massima della lobby
 */
export function aggiornaHUDPlayers(count, max) {
    if (hudPlayerCountObj) { destroy(hudPlayerCountObj); hudPlayerCountObj = null; }

    hudPlayerCountObj = createHudBox(
        () => hx(10),
        () => hy(46),
        () => `Players: ${count}/${max}`,
        {
            size:     () => hs(15),
            textCol:  rgb(230, 230, 230),
            boxCol:   rgb(0, 0, 0),
            boxAlpha: 0.55,
            pad:      () => hs(6),
            radius:   HUD_BOX_RADIUS,
        }
    );
}

// ============================================================
// OVERLAY: Barre Nere Letterbox
// Copre le aree fuori dal canvas di gioco quando il rapporto
// d'aspetto della finestra non è 16:9.
// ============================================================

/** Ricrea le barre nere. Chiamare su ogni resize della finestra. */
export function aggiornaBlackBars() {
    if (blackBarsOverlay) { destroy(blackBarsOverlay); blackBarsOverlay = null; }

    const { scale, left, top } = calcolaLetterbox();
    const gameScreenWidth  = GAME_W * scale;
    const gameScreenHeight = GAME_H * scale;
    const screenWidth      = window.innerWidth;
    const screenHeight     = window.innerHeight;

    blackBarsOverlay = add([
        fixed(), z(999), // z altissima: sopra tutto
        {
            draw() {
                const c = rgb(0, 0, 0);
                // Barre laterali (pillarbox: schermo più largo del gioco)
                if (left > 0) {
                    drawRect({ pos: vec2(0, 0),                        width: left,        height: screenHeight, color: c });
                    drawRect({ pos: vec2(left + gameScreenWidth, 0),   width: left + 1,    height: screenHeight, color: c });
                }
                // Barre sopra/sotto (letterbox: schermo più alto del gioco)
                if (top > 0) {
                    drawRect({ pos: vec2(0, 0),                        width: screenWidth, height: top,          color: c });
                    drawRect({ pos: vec2(0, top + gameScreenHeight),   width: screenWidth, height: top + 1,      color: c });
                }
            }
        }
    ]);
}

// ============================================================
// KILL FEED
// ============================================================

/**
 * Aggiunge un messaggio al kill feed (max 5 messaggi).
 * I messaggi scompaiono automaticamente dopo 3.5 secondi.
 * @param {string} message - Es. "You eliminated DarkWolf!"
 */
export function mostraKillFeed(message) {
    killFeedList.unshift({ msg: message, timer: 3.5 });
    if (killFeedList.length > 5) killFeedList.pop(); // mantieni massimo 5
}

// ============================================================
// LEADERBOARD (in alto a destra)
// ============================================================

/**
 * Aggiorna il pannello della classifica.
 * @param {Array<{nickname: string, kills: number}>} leaderboardData
 */
export function aggiornaLeaderboard(leaderboardData) {
    // Distruggi il pannello precedente
    for (const obj of leaderboardObjects) destroy(obj);
    leaderboardObjects = [];

    if (!leaderboardData || !leaderboardData.length) return;

    leaderboardObjects.push(add([
        fixed(), z(100),
        {
            draw() {
                const entryFontSize  = hs(15);
                const titleFontSize  = hs(13);
                const rowPadding     = hs(7);
                const rowHeight      = hs(24);
                const panelWidth     = hs(190);
                const panelHeight    = hs(20) + leaderboardData.length * rowHeight + rowPadding;

                const panelX = hx(GAME_W - 10) - panelWidth;
                const panelY = hy(10);

                // Sfondo semitrasparente
                drawRect({
                    pos: vec2(panelX, panelY),
                    width: panelWidth, height: panelHeight,
                    radius: hs(4), color: rgb(0, 0, 0), opacity: 0.65,
                });

                // Linea decorativa in cima
                drawRect({
                    pos: vec2(panelX, panelY),
                    width: panelWidth, height: hs(1),
                    color: rgb(200, 200, 200), opacity: 0.3,
                });

                // Titolo "LEADERBOARD"
                drawText({
                    text:  "LEADERBOARD",
                    pos:   vec2(panelX + rowPadding, panelY + rowPadding * 0.6),
                    size:  titleFontSize,
                    color: rgb(200, 200, 200),
                });

                // Righe della classifica
                leaderboardData.forEach((entry, index) => {
                    const rowY = panelY + hs(16) + index * rowHeight;

                    // Separatore orizzontale tra le righe
                    if (index > 0) {
                        drawRect({
                            pos:    vec2(panelX + rowPadding, rowY),
                            width:  panelWidth - rowPadding * 2,
                            height: hs(1),
                            color:  rgb(255, 255, 255), opacity: 0.08,
                        });
                    }

                    // Il primo posto è bianco brillante, gli altri grigi
                    const entryColor = index === 0 ? rgb(255, 255, 255) : rgb(190, 190, 190);

                    const nameText  = `${index + 1}. ${entry.nickname}`;
                    const killsText = `${entry.kills}K`;

                    drawText({ text: nameText,  pos: vec2(panelX + rowPadding, rowY + hs(3)), size: entryFontSize, color: entryColor });
                    drawText({
                        text:  killsText,
                        pos:   vec2(panelX + panelWidth - rowPadding - killsText.length * entryFontSize * 0.58, rowY + hs(3)),
                        size:  entryFontSize,
                        color: entryColor,
                    });
                });
            }
        }
    ]));
}

// ============================================================
// MINIMAPPA (in basso a destra, sopra l'HUD ammo)
// ============================================================

/** Riferimento all'oggetto Kaboom della minimappa */
let minimapObject = null;

/**
 * Crea (o ricrea) la minimappa.
 * Chiamare una sola volta dopo l'init della lobby.
 * La minimappa mostra la posizione del giocatore locale e
 * tutti gli ostacoli della mappa in scala ridotta.
 */
export function creaMinimappa() {
    if (minimapObject) destroy(minimapObject);

    minimapObject = add([
        fixed(), z(150),
        {
            draw() {
                // Non mostrare in menu/lobby o se il giocatore locale è morto
                if (state.inMenu || state.inLobbyScreen || !state.myId) return;
                if (!state.players[state.myId] || state.players[state.myId].morto) return;

                const mapWorldWidth  = state.mapSize.width;
                const mapWorldHeight = state.mapSize.height;

                // Dimensione e posizione della minimappa sullo schermo
                const MINIMAP_SIZE_PX = hs(130);
                const MINIMAP_PADDING = hs(10);
                const minimapX = hx(GAME_W) - MINIMAP_SIZE_PX - MINIMAP_PADDING;
                const minimapY = hy(GAME_H) - MINIMAP_SIZE_PX - MINIMAP_PADDING - hs(50); // sopra HUD ammo

                // Fattori di scala: da coordinate-mondo a pixel-minimappa
                const scaleX = MINIMAP_SIZE_PX / mapWorldWidth;
                const scaleY = MINIMAP_SIZE_PX / mapWorldHeight;

                // Funzioni di conversione mondo → minimappa
                const worldToMinimapX = (worldX) => minimapX + worldX * scaleX;
                const worldToMinimapY = (worldY) => minimapY + worldY * scaleY;

                // Bordo esterno scuro
                drawRect({
                    pos: vec2(minimapX - 2, minimapY - 2),
                    width: MINIMAP_SIZE_PX + 4, height: MINIMAP_SIZE_PX + 4,
                    radius: hs(4), color: rgb(0, 0, 0), opacity: 0.75,
                });

                // Sfondo terreno verde
                drawRect({
                    pos: vec2(minimapX, minimapY),
                    width: MINIMAP_SIZE_PX, height: MINIMAP_SIZE_PX,
                    radius: hs(3), color: rgb(45, 100, 35), opacity: 0.9,
                });

                // Ostacoli in scala
                for (const obstacle of state.ostacoli) {
                    const obstacleScreenX = worldToMinimapX(obstacle.x);
                    const obstacleScreenY = worldToMinimapY(obstacle.y);

                    // Salta ostacoli fuori dai bordi della minimappa
                    if (obstacleScreenX < minimapX || obstacleScreenX > minimapX + MINIMAP_SIZE_PX ||
                        obstacleScreenY < minimapY || obstacleScreenY > minimapY + MINIMAP_SIZE_PX) continue;

                    const displayRadius = Math.max(1.5, obstacle.r * scaleX);

                    if (obstacle.type === "roccia") {
                        drawCircle({ pos: vec2(obstacleScreenX, obstacleScreenY), radius: displayRadius, color: rgb(100, 100, 105), opacity: 0.85 });
                    } else if (obstacle.type === "albero") {
                        drawCircle({ pos: vec2(obstacleScreenX, obstacleScreenY), radius: displayRadius, color: rgb(20, 65, 15),   opacity: 0.9 });
                    } else if (obstacle.type === "cespuglio") {
                        drawCircle({ pos: vec2(obstacleScreenX, obstacleScreenY), radius: Math.max(1, displayRadius * 0.6), color: rgb(60, 130, 30), opacity: 0.6 });
                    }
                }

                // Punto azzurro = giocatore locale
                const myPlayerData = state.players[state.myId];
                if (myPlayerData && myPlayerData.sprite) {
                    const myScreenX = worldToMinimapX(myPlayerData.sprite.pos.x);
                    const myScreenY = worldToMinimapY(myPlayerData.sprite.pos.y);

                    // Alone semitrasparente
                    drawCircle({ pos: vec2(myScreenX, myScreenY), radius: hs(6),   color: rgb(0, 180, 255), opacity: 0.25 });
                    // Bordo nero
                    drawCircle({ pos: vec2(myScreenX, myScreenY), radius: hs(4.5), color: rgb(0, 0, 0) });
                    // Punto principale azzurro
                    drawCircle({ pos: vec2(myScreenX, myScreenY), radius: hs(3.5), color: rgb(0, 220, 255) });
                }

                // Bordo interno bianco semitrasparente
                drawRect({
                    pos: vec2(minimapX, minimapY),
                    width: MINIMAP_SIZE_PX, height: MINIMAP_SIZE_PX,
                    radius: hs(3), color: rgb(255, 255, 255), opacity: 0.15,
                });
            }
        }
    ]);
}