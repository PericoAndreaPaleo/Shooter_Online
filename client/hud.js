// ========================
// HUD
// ========================
import { state, GAME_W, GAME_H, hx, hy, hs, calcolaLetterbox, isMobile } from "./state.js";

const HUD_ALPHA   = 0.45;
const HUD_RADIUS  = 4;

export const killFeedList = [];
export let killFeedObjs   = [];
let leaderboardObjs = [];

let hudKillsObj   = null;
let hudWeaponObj  = null;
let hudLobbyObj   = null;
let hudPlayersObj = null;
let hudAmmoObj    = null;
let blackBarsObj  = null;

// hudBox — ricalcola posizione ogni frame tramite draw()
function hudBox(getX, getY, getText, opts = {}) {
    const gx = typeof getX === "function" ? getX : () => getX;
    const gy = typeof getY === "function" ? getY : () => getY;
    const gt = typeof getText === "function" ? getText : () => getText;
    const pad_    = opts.pad    ?? 6;
    const size_   = opts.size   ?? 13;
    const textCol = opts.textCol  ?? rgb(220, 220, 220);
    const boxCol  = opts.boxCol   ?? rgb(0, 0, 0);
    const alpha_  = opts.boxAlpha ?? 0.45;
    const r_      = opts.radius   ?? 4;
    return add([fixed(), z(100), {
        draw() {
            const px = gx(), py = gy(), text = gt();
            const sz  = typeof size_ === "function" ? size_() : size_;
            const pad = typeof pad_  === "function" ? pad_()  : pad_;
            const tw  = text.length * sz * 0.58;
            const th  = sz * 1.3;
            drawRect({ pos: vec2(px - pad, py - pad * 0.5),
                width: tw + pad * 2, height: th + pad,
                radius: r_, color: boxCol, opacity: alpha_ });
            drawText({ text, pos: vec2(px, py), size: sz, color: textCol });
        }
    }]);
}

export function aggiornaHUDArma() {
    if (hudWeaponObj) { destroy(hudWeaponObj); hudWeaponObj = null; }
    if (state.inLobbyScreen) return;
    if (isMobile()) return;
    const names = { gun: "Rifle", pistol: "Pistol", fists: "Knife" };
    const keys  = ["gun", "pistol", "fists"];
    hudWeaponObj = add([fixed(), z(100), {
        draw() {
            const sz = hs(16), pad = hs(8), gap = hs(5);
            let cx = hx(10);
            const by = hy(GAME_H - 46);
            for (const k of keys) {
                const label = names[k];
                const tw = label.length * sz * 0.58 + pad * 2;
                const th = sz * 1.5 + pad;
                const active = k === state.weapon;
                drawRect({ pos: vec2(cx, by), width: tw, height: th,
                    radius: hs(4), color: rgb(0, 0, 0), opacity: active ? 0.7 : 0.3 });
                if (active) drawRect({ pos: vec2(cx, by), width: tw, height: hs(2),
                    color: rgb(220, 220, 220), opacity: 0.9 });
                drawText({ text: label, pos: vec2(cx + pad, by + pad * 0.6),
                    size: sz, color: active ? rgb(240, 240, 240) : rgb(100, 100, 100) });
                cx += tw + gap;
            }
        }
    }]);
    aggiornaHUDAmmo();
}

export function aggiornaHUDAmmo() {
    if (hudAmmoObj) { destroy(hudAmmoObj); hudAmmoObj = null; }
    if (state.weapon === "fists") return;
    const ammo    = state.myAmmo[state.weapon] ?? 0;
    const maxAmmo = state.weapon === "gun" ? 30 : 15;
    hudAmmoObj = add([fixed(), z(100), {
        draw() {
            const sz = hs(22), szSub = hs(13), pad = hs(10);
            const curStr = String(ammo);
            const maxStr = String(maxAmmo);
            const sepStr = " | ";
            const curW   = curStr.length * sz    * 0.6;
            const sepW   = sepStr.length * szSub * 0.6;
            const maxW   = maxStr.length * szSub * 0.6;
            const totalW = curW + sepW + maxW + pad * 2;
            const totalH = sz * 1.4 + pad;
            const bx = hx(GAME_W - 14) - totalW;
            const by = hy(GAME_H - 14) - totalH;

            drawRect({ pos: vec2(bx, by), width: totalW, height: totalH,
                radius: hs(4), color: rgb(0, 0, 0), opacity: 0.5 });

            if (state.isReloading && state.reloadDuration > 0) {
                const elapsed  = Math.min(Date.now() - state.reloadStartTime, state.reloadDuration);
                const progress = elapsed / state.reloadDuration;
                const sweepW   = Math.round(totalW * progress);
                drawRect({ pos: vec2(bx, by), width: sweepW, height: totalH,
                    radius: hs(4), color: rgb(200, 200, 200), opacity: 0.18 });
                if (sweepW > 0 && sweepW < totalW) {
                    drawRect({ pos: vec2(bx + sweepW - hs(2), by), width: hs(2), height: totalH,
                        color: rgb(255, 255, 255), opacity: 0.6 });
                }
            }

            const col = ammo === 0 ? rgb(200, 70, 70) : ammo <= maxAmmo * 0.3 ? rgb(200, 160, 60) : rgb(220, 220, 220);
            let tx = bx + pad;
            drawText({ text: curStr, pos: vec2(tx, by + pad * 0.5), size: sz, color: col });
            tx += curW;
            drawText({ text: sepStr, pos: vec2(tx, by + pad * 0.5 + (sz - szSub) * 0.5), size: szSub, color: rgb(100, 100, 100) });
            tx += sepW;
            drawText({ text: maxStr, pos: vec2(tx, by + pad * 0.5 + (sz - szSub) * 0.5), size: szSub, color: rgb(100, 100, 100) });

            if (ammo === 0 && !state.isReloading) {
                const label = "[R] Reload";
                const lsz = hs(12), lpad = hs(6);
                const lw = label.length * lsz * 0.58 + lpad * 2;
                const lh = lsz * 1.4 + lpad;
                const lx = bx + (totalW - lw) / 2;
                const ly = by - lh - hs(4);
                drawRect({ pos: vec2(lx, ly), width: lw, height: lh,
                    radius: hs(4), color: rgb(0, 0, 0), opacity: 0.6 });
                drawText({ text: label, pos: vec2(lx + lpad, ly + lpad * 0.7),
                    size: lsz, color: rgb(220, 80, 80) });
            }
        }
    }]);
}

export function aggiornaHUDStats() {
    if (hudKillsObj) { destroy(hudKillsObj); hudKillsObj = null; }
    hudKillsObj = hudBox(
        () => hx(10), () => hy(GAME_H - 90),
        () => `K: ${state.myKills}  D: ${state.myDeaths}`,
        { size: () => hs(18), textCol: rgb(220, 220, 220), boxCol: rgb(0, 0, 0), boxAlpha: HUD_ALPHA, pad: () => hs(7), radius: HUD_RADIUS }
    );
}

export function aggiornaHUDLobby() {
    if (hudLobbyObj) { destroy(hudLobbyObj); hudLobbyObj = null; }
    if (!state.myLobbyName) return;
    hudLobbyObj = hudBox(
        () => hx(10), () => hy(10),
        () => `Lobby: ${state.myLobbyName}`,
        { size: () => hs(15), textCol: rgb(230, 230, 230), boxCol: rgb(0, 0, 0), boxAlpha: 0.55, pad: () => hs(6), radius: HUD_RADIUS }
    );
}

export function aggiornaHUDPlayers(count, max) {
    if (hudPlayersObj) { destroy(hudPlayersObj); hudPlayersObj = null; }
    hudPlayersObj = hudBox(
        () => hx(10), () => hy(46),
        () => `Players: ${count}/${max}`,
        { size: () => hs(15), textCol: rgb(230, 230, 230), boxCol: rgb(0, 0, 0), boxAlpha: 0.55, pad: () => hs(6), radius: HUD_RADIUS }
    );
}

export function aggiornaBlackBars() {
    if (blackBarsObj) { destroy(blackBarsObj); blackBarsObj = null; }
    const { scale, left, top } = calcolaLetterbox();
    const gameW = GAME_W * scale, gameH = GAME_H * scale;
    const W = window.innerWidth, H = window.innerHeight;
    blackBarsObj = add([fixed(), z(999), {
        draw() {
            const c = rgb(0, 0, 0);
            if (left > 0) drawRect({ pos: vec2(0, 0), width: left, height: H, color: c });
            if (left > 0) drawRect({ pos: vec2(left + gameW, 0), width: left + 1, height: H, color: c });
            if (top > 0)  drawRect({ pos: vec2(0, 0), width: W, height: top, color: c });
            if (top > 0)  drawRect({ pos: vec2(0, top + gameH), width: W, height: top + 1, color: c });
        }
    }]);
}

export function mostraKillFeed(msg) {
    killFeedList.unshift({ msg, timer: 3.5 });
    if (killFeedList.length > 5) killFeedList.pop();
}

export function aggiornaLeaderboard(lb) {
    for (const o of leaderboardObjs) destroy(o);
    leaderboardObjs = [];
    if (!lb || !lb.length) return;
    leaderboardObjs.push(add([fixed(), z(100), {
        draw() {
            const sz = hs(15), pad = hs(7), rowH = hs(24), titleSz = hs(13);
            const panelW = hs(190);
            const panelH = hs(20) + lb.length * rowH + pad;
            const bx = hx(GAME_W - 10) - panelW;
            const by = hy(10);
            drawRect({ pos: vec2(bx, by), width: panelW, height: panelH,
                radius: hs(4), color: rgb(0, 0, 0), opacity: 0.65 });
            drawRect({ pos: vec2(bx, by), width: panelW, height: hs(1),
                color: rgb(200, 200, 200), opacity: 0.3 });
            drawText({ text: "LEADERBOARD", pos: vec2(bx + pad, by + pad * 0.6),
                size: titleSz, color: rgb(200, 200, 200) });
            lb.forEach((e, i) => {
                const ry = by + hs(16) + i * rowH;
                if (i > 0) drawRect({ pos: vec2(bx + pad, ry), width: panelW - pad * 2, height: hs(1),
                    color: rgb(255, 255, 255), opacity: 0.08 });
                const col = i === 0 ? rgb(255, 255, 255) : rgb(190, 190, 190);
                const nameStr = `${i + 1}. ${e.nickname}`;
                const killStr = `${e.kills}K`;
                drawText({ text: nameStr, pos: vec2(bx + pad, ry + hs(3)), size: sz, color: col });
                drawText({ text: killStr,
                    pos: vec2(bx + panelW - pad - killStr.length * sz * 0.58, ry + hs(3)),
                    size: sz, color: col });
            });
        }
    }]));
}

// ========================
// MINIMAPPA
// ========================
let minimapObj = null;

export function creaMinimappa() {
    if (minimapObj) destroy(minimapObj);
    minimapObj = add([fixed(), z(150), {
        draw() {
            if (state.inMenu || state.inLobbyScreen || !state.myId) return;
            if (!state.players[state.myId] || state.players[state.myId].morto) return;

            const MAP_W = state.mapSize.width;
            const MAP_H = state.mapSize.height;

            // Dimensione e posizione minimappa (angolo in basso a destra)
            const MM_SIZE = hs(130);
            const PAD     = hs(10);
            const bx = hx(GAME_W) - MM_SIZE - PAD;
            const by = hy(GAME_H) - MM_SIZE - PAD - hs(50); // sopra l'HUD ammo

            const scaleX = MM_SIZE / MAP_W;
            const scaleY = MM_SIZE / MAP_H;

            // Converte coordinate mondo → minimappa
            const wx = (worldX) => bx + worldX * scaleX;
            const wy = (worldY) => by + worldY * scaleY;

            // ── Sfondo ──
            drawRect({ pos: vec2(bx - 2, by - 2), width: MM_SIZE + 4, height: MM_SIZE + 4,
                radius: hs(4), color: rgb(0, 0, 0), opacity: 0.75 });
            // Terreno verde
            drawRect({ pos: vec2(bx, by), width: MM_SIZE, height: MM_SIZE,
                radius: hs(3), color: rgb(45, 100, 35), opacity: 0.9 });
            // Bordo sabbia (sottile fascia)
            drawRect({ pos: vec2(bx, by), width: MM_SIZE, height: MM_SIZE,
                radius: hs(3), color: rgb(0, 0, 0), opacity: 0 }); // placeholder clip

            // ── Ostacoli ──
            for (const o of state.ostacoli) {
                const ox = wx(o.x), oy = wy(o.y);
                // Solo se dentro la minimappa
                if (ox < bx || ox > bx + MM_SIZE || oy < by || oy > by + MM_SIZE) continue;
                const r = Math.max(1.5, o.r * scaleX);
                if (o.type === "roccia") {
                    drawCircle({ pos: vec2(ox, oy), radius: r, color: rgb(100, 100, 105), opacity: 0.85 });
                } else if (o.type === "albero") {
                    drawCircle({ pos: vec2(ox, oy), radius: r, color: rgb(20, 65, 15), opacity: 0.9 });
                } else if (o.type === "cespuglio") {
                    drawCircle({ pos: vec2(ox, oy), radius: Math.max(1, r * 0.6), color: rgb(60, 130, 30), opacity: 0.6 });
                }
            }

            // ── Il mio player — punto azzurro con freccia di direzione ──
            const me = state.players[state.myId];
            if (me && me.sprite) {
                const mx = wx(me.sprite.pos.x), my = wy(me.sprite.pos.y);
                // Alone
                drawCircle({ pos: vec2(mx, my), radius: hs(6), color: rgb(0, 180, 255), opacity: 0.25 });
                // Punto principale
                drawCircle({ pos: vec2(mx, my), radius: hs(4.5), color: rgb(0, 0, 0) });
                drawCircle({ pos: vec2(mx, my), radius: hs(3.5), color: rgb(0, 220, 255) });

            }

            // ── Bordo esterno ──
            drawRect({ pos: vec2(bx, by), width: MM_SIZE, height: MM_SIZE,
                radius: hs(3), color: rgb(255, 255, 255), opacity: 0.15 });
        }
    }]);
}