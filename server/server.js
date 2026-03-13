const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("client"));

// ========================
// KEEP-ALIVE
// ========================
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
    setInterval(() => {
        fetch(RENDER_URL).catch(() => {});
    }, 10 * 60 * 1000);
}

const map = { width: 5000, height: 5000 };

function seededRandom(seed) {
    let s = seed;
    return function () {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function generaMappa() {
    const ostacoli = [];
    const seed = Math.floor(Math.random() * 999999);
    const rng = seededRandom(seed);

    // Rocce — rCollisione = r (tutta la roccia è solida)
    for (let i = 0; i < 80; i++) {
        const r = 25 + rng() * 35;
        ostacoli.push({ x: rng() * map.width, y: rng() * map.height, r, rCollisione: r, type: "roccia" });
    }
    // Alberi — rCollisione = solo il tronco (r/3)
    for (let i = 0; i < 60; i++) {
        const r = 35 + rng() * 50;
        ostacoli.push({ x: rng() * map.width, y: rng() * map.height, r, rCollisione: Math.max(10, r / 3), type: "albero" });
    }
    // Cespugli — non solidi, solo visivi
    for (let i = 0; i < 70; i++) {
        ostacoli.push({ x: rng() * map.width, y: rng() * map.height, r: 20 + rng() * 30, type: "cespuglio" });
    }
    return ostacoli;
}

const PLAYER_RADIUS = 20;
const PLAYER_MAX_HP = 100;
const DAMAGE_BY_WEAPON = { gun: 20, pistol: 15, fists: 0 };
const COOLDOWN_BY_WEAPON = { gun: 120, pistol: 250, fists: 0 };
const SPEED = 320;
const SPEED_PROIETTILE = 1300;
const BULLET_LIFETIME = 0.8;

// ========================
// LOBBY
// ========================
const lobbies = {};

function creaLobby(lobbyId) {
    const ostacoli = generaMappa();
    lobbies[lobbyId] = {
        players: {},
        proiettili: [],
        ostacoli,
        // ostacoliSolidi = rocce + alberi (non cespugli) — tutti con rCollisione definito
        ostacoliSolidi: ostacoli.filter(o => o.type !== "cespuglio"),
        leaderboard: {},
        nextBulletId: 0,
        lastTime: Date.now(),
    };
    console.log(`Lobby creata: ${lobbyId}`);
    return lobbies[lobbyId];
}

function trovaOCreaLobby() {
    for (const id in lobbies) {
        const lobby = lobbies[id];
        if (Object.keys(lobby.players).length < 8) return id;
    }
    const newId = "lobby_" + Date.now();
    creaLobby(newId);
    return newId;
}

function rimuoviLobbySeVuota(lobbyId) {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;
    if (Object.keys(lobby.players).length === 0) {
        delete lobbies[lobbyId];
        console.log(`Lobby rimossa: ${lobbyId}`);
    }
}

// ========================
// FISICA
// ========================
function spawnPos(lobby) {
    const MIN_DIST = 200;
    for (let t = 0; t < 30; t++) {
        const x = 100 + Math.random() * (map.width - 200);
        const y = 100 + Math.random() * (map.height - 200);
        let ok = true;
        for (const id in lobby.players) {
            if (lobby.players[id].morto) continue;
            if (Math.hypot(x - lobby.players[id].pos.x, y - lobby.players[id].pos.y) < MIN_DIST) {
                ok = false; break;
            }
        }
        if (ok) return { x, y };
    }
    return { x: 100 + Math.random() * (map.width - 200), y: 100 + Math.random() * (map.height - 200) };
}

function risolviCollisioni(p, ostacoliSolidi) {
    // Bordi mappa
    p.pos.x = Math.max(PLAYER_RADIUS, Math.min(map.width - PLAYER_RADIUS, p.pos.x));
    p.pos.y = Math.max(PLAYER_RADIUS, Math.min(map.height - PLAYER_RADIUS, p.pos.y));

    // Collisione con ogni ostacolo solido — rCollisione è sempre definito ora
    for (const o of ostacoliSolidi) {
        const dx = p.pos.x - o.x, dy = p.pos.y - o.y;
        const dist = Math.hypot(dx, dy);
        const minDist = PLAYER_RADIUS + o.rCollisione;
        if (dist < minDist && dist > 0) {
            const overlap = minDist - dist;
            p.pos.x += (dx / dist) * overlap;
            p.pos.y += (dy / dist) * overlap;
        }
    }

    // Ri-clamp dopo push degli ostacoli
    p.pos.x = Math.max(PLAYER_RADIUS, Math.min(map.width - PLAYER_RADIUS, p.pos.x));
    p.pos.y = Math.max(PLAYER_RADIUS, Math.min(map.height - PLAYER_RADIUS, p.pos.y));
}

function getLeaderboard(lobby) {
    return Object.values(lobby.leaderboard)
        .sort((a, b) => b.kills - a.kills)
        .slice(0, 10);
}

// ========================
// CONTATORE GLOBALE
// ========================
let playerCounter = 0;

// ========================
// SOCKET
// ========================
io.on("connection", socket => {
    console.log("Utente connesso:", socket.id);

    playerCounter++;
    const nickname = `player_${playerCounter}`;

    const lobbyId = trovaOCreaLobby();
    const lobby = lobbies[lobbyId];
    socket.join(lobbyId);
    socket.lobbyId = lobbyId;

    lobby.players[socket.id] = {
        pos: spawnPos(lobby),
        dir: { x: 0, y: 0 },
        angle: 0,
        hp: PLAYER_MAX_HP,
        morto: true,
        nickname,
        lastShot: 0,
        hitFlash: false,
        lastHit: 0,
        weapon: "gun"
    };
    lobby.leaderboard[socket.id] = { nickname, kills: 0, deaths: 0 };

    socket.emit("init", { id: socket.id, map, ostacoli: lobby.ostacoli, lobbyId, nickname });

    socket.on("spawn", () => {
        const p = lobby.players[socket.id];
        if (!p) return;
        p.pos = spawnPos(lobby);
        p.hp = PLAYER_MAX_HP;
        p.morto = false;
        p.dir = { x: 0, y: 0 };
        p.angle = 0;
    });

    socket.on("input", (input) => {
        const p = lobby.players[socket.id];
        if (!p || p.morto || typeof input !== "object" || input === null) return;
        p.dir = {
            x: (input.right === true ? 1 : 0) - (input.left === true ? 1 : 0),
            y: (input.down  === true ? 1 : 0) - (input.up   === true ? 1 : 0)
        };
    });

    socket.on("aim", (angle) => {
        const p = lobby.players[socket.id];
        if (!p || p.morto || typeof angle !== "number" || !isFinite(angle)) return;
        p.angle = angle;
    });

    socket.on("setWeapon", (w) => {
        const p = lobby.players[socket.id];
        if (!p || (w !== "gun" && w !== "pistol" && w !== "fists")) return;
        p.weapon = w;
    });

    socket.on("shoot", (data) => {
        const p = lobby.players[socket.id];
        if (!p || p.morto) return;
        const now = Date.now();
        const cooldown = COOLDOWN_BY_WEAPON[p.weapon] ?? 120;
        if (now - p.lastShot < cooldown) return;
        p.lastShot = now;
        if (!data || typeof data.dir !== "object" || data.dir === null) return;
        const { dir, tipOffset } = data;
        if (typeof dir.x !== "number" || typeof dir.y !== "number") return;
        const len = Math.hypot(dir.x, dir.y);
        if (len === 0 || !isFinite(len)) return;
        const nx = dir.x / len, ny = dir.y / len;
        const MAX_TIP = 100;
        const ox = (tipOffset && Math.abs(tipOffset.x) < MAX_TIP) ? tipOffset.x : 0;
        const oy = (tipOffset && Math.abs(tipOffset.y) < MAX_TIP) ? tipOffset.y : 0;
        lobby.proiettili.push({
            id: lobby.nextBulletId++,
            pos: { x: p.pos.x + ox, y: p.pos.y + oy },
            dir: { x: nx, y: ny },
            owner: socket.id,
            weapon: p.weapon,
            spawnTime: now
        });
    });

    socket.on("disconnect", () => {
        console.log("Utente disconnesso:", socket.id);
        delete lobby.players[socket.id];
        delete lobby.leaderboard[socket.id];
        rimuoviLobbySeVuota(lobbyId);
    });
});

// ========================
// GAME LOOP — fisica 60fps, broadcast 40fps
// ========================
let broadcastAccumulator = 0;
const BROADCAST_INTERVAL = 1000 / 40;

setInterval(() => {
    const now = Date.now();

    for (const lobbyId in lobbies) {
        const lobby = lobbies[lobbyId];
        const dt = (now - lobby.lastTime) / 1000;
        lobby.lastTime = now;

        for (const id in lobby.players) lobby.players[id].hitFlash = false;

        // Movimento
        for (const id in lobby.players) {
            const p = lobby.players[id];
            if (p.morto) continue;
            const len = Math.hypot(p.dir.x, p.dir.y);
            const nx = len > 0 ? p.dir.x / len : 0;
            const ny = len > 0 ? p.dir.y / len : 0;
            p.pos.x += nx * SPEED * dt;
            p.pos.y += ny * SPEED * dt;
            risolviCollisioni(p, lobby.ostacoliSolidi);
        }

        // Rigenerazione vita
        const REGEN_DELAY = 4000;
        const REGEN_RATE  = 8;
        for (const id in lobby.players) {
            const p = lobby.players[id];
            if (p.morto || p.hp >= PLAYER_MAX_HP) continue;
            if (now - p.lastHit >= REGEN_DELAY) {
                p.hp = Math.min(PLAYER_MAX_HP, p.hp + REGEN_RATE * dt);
            }
        }

        // Proiettili
        for (let i = lobby.proiettili.length - 1; i >= 0; i--) {
            const b = lobby.proiettili[i];
            b.pos.x += b.dir.x * SPEED_PROIETTILE * dt;
            b.pos.y += b.dir.y * SPEED_PROIETTILE * dt;

            // Lifetime
            if ((now - b.spawnTime) / 1000 >= BULLET_LIFETIME) {
                lobby.proiettili.splice(i, 1); continue;
            }

            // Collisione ostacoli — usa rCollisione (ora sempre definito)
            let hitWall = false;
            for (const o of lobby.ostacoliSolidi) {
                if (Math.hypot(b.pos.x - o.x, b.pos.y - o.y) < o.rCollisione + 4) {
                    hitWall = true; break;
                }
            }
            if (hitWall) { lobby.proiettili.splice(i, 1); continue; }

            // Collisione giocatori
            let hit = false;
            for (const id in lobby.players) {
                if (id === b.owner) continue;
                const p = lobby.players[id];
                if (p.morto) continue;
                if (Math.hypot(b.pos.x - p.pos.x, b.pos.y - p.pos.y) < PLAYER_RADIUS + 6) {
                    p.hp -= DAMAGE_BY_WEAPON[b.weapon] ?? 20;
                    p.hitFlash = true;
                    p.lastHit = now;
                    hit = true;
                    if (p.hp <= 0) {
                        p.hp = 0;
                        p.morto = true;
                        p.dir = { x: 0, y: 0 };
                        if (lobby.leaderboard[id]) lobby.leaderboard[id].deaths++;
                        if (lobby.leaderboard[b.owner]) lobby.leaderboard[b.owner].kills++;
                        io.to(b.owner).emit("killConfirm", { victim: lobby.players[id]?.nickname || "?" });
                    }
                    break;
                }
            }
            if (hit) lobby.proiettili.splice(i, 1);
        }
    }

    // Broadcast a 40fps
    broadcastAccumulator += 1000 / 60;
    if (broadcastAccumulator >= BROADCAST_INTERVAL) {
        broadcastAccumulator -= BROADCAST_INTERVAL;

        for (const lobbyId in lobbies) {
            const lobby = lobbies[lobbyId];
            const playersState = {};
            for (const id in lobby.players) {
                const p = lobby.players[id];
                playersState[id] = {
                    pos: { x: Math.round(p.pos.x), y: Math.round(p.pos.y) },
                    hp: p.hp,
                    morto: p.morto,
                    nickname: p.nickname,
                    angle: p.angle,
                    weapon: p.weapon,
                    hitFlash: p.hitFlash || undefined
                };
            }
            io.to(lobbyId).emit("state", {
                players: playersState,
                proiettili: lobby.proiettili,
                lb: getLeaderboard(lobby)
            });
        }
    }

}, 1000 / 60);

server.listen(process.env.PORT || 4000, () => console.log("Server avviato"));