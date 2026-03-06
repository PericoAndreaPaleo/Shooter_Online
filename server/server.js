const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("client"));

const map = { width: 5000, height: 5000 };

// ========================
// MAPPA — seed casuale ad ogni avvio (fix #10)
// ========================
function seededRandom(seed) {
    let s = seed;
    return function () {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

const mapSeed = Math.floor(Math.random() * 999999);
const ostacoli = [];
const rng = seededRandom(mapSeed);

for (let i = 0; i < 80; i++) {
    const r = 25 + rng() * 35;
    ostacoli.push({ x: rng() * map.width, y: rng() * map.height, r, type: "roccia" });
}
for (let i = 0; i < 60; i++) {
    const r = 35 + rng() * 50;
    ostacoli.push({ x: rng() * map.width, y: rng() * map.height, r, rCollisione: Math.max(10, r / 3), type: "albero" });
}
for (let i = 0; i < 70; i++) {
    ostacoli.push({ x: rng() * map.width, y: rng() * map.height, r: 20 + rng() * 30, type: "cespuglio" });
}

const PLAYER_RADIUS = 20;
const PLAYER_MAX_HP = 100;
const DAMAGE_BY_WEAPON = { gun: 20, pistol: 15, fists: 0 };
const COOLDOWN_BY_WEAPON = { gun: 120, pistol: 150, fists: 0 };
const ostacoliSolidi = ostacoli.filter(o => o.type !== "cespuglio");

const players = {};
const proiettili = [];
let nextBulletId = 0;

const SPEED = 320;
const SPEED_PROIETTILE = 1300;
const BULLET_LIFETIME = 0.8;

// ========================
// SPAWN SICURO — distanza minima dagli altri (fix #7)
// ========================
function spawnPos() {
    const MIN_DIST = 200;
    for (let t = 0; t < 30; t++) {
        const x = 100 + Math.random() * (map.width - 200);
        const y = 100 + Math.random() * (map.height - 200);
        let ok = true;
        for (const id in players) {
            if (players[id].morto) continue;
            if (Math.hypot(x - players[id].pos.x, y - players[id].pos.y) < MIN_DIST) {
                ok = false; break;
            }
        }
        if (ok) return { x, y };
    }
    return { x: 100 + Math.random() * (map.width - 200), y: 100 + Math.random() * (map.height - 200) };
}

function risolviCollisioni(p) {
    p.pos.x = Math.max(PLAYER_RADIUS, Math.min(map.width - PLAYER_RADIUS, p.pos.x));
    p.pos.y = Math.max(PLAYER_RADIUS, Math.min(map.height - PLAYER_RADIUS, p.pos.y));
    for (const o of ostacoliSolidi) {
        const rColl = o.rCollisione !== undefined ? o.rCollisione : o.r;
        const dx = p.pos.x - o.x, dy = p.pos.y - o.y;
        const dist = Math.hypot(dx, dy);
        const minDist = PLAYER_RADIUS + rColl;
        if (dist < minDist && dist > 0) {
            const overlap = minDist - dist;
            p.pos.x += (dx / dist) * overlap;
            p.pos.y += (dy / dist) * overlap;
        }
    }
    p.pos.x = Math.max(PLAYER_RADIUS, Math.min(map.width - PLAYER_RADIUS, p.pos.x));
    p.pos.y = Math.max(PLAYER_RADIUS, Math.min(map.height - PLAYER_RADIUS, p.pos.y));
}

// ========================
// LEADERBOARD live in memoria (fix #4)
// ========================
const leaderboard = {};
function getLeaderboard() {
    return Object.values(leaderboard)
        .sort((a, b) => b.kills - a.kills)
        .slice(0, 10);
}

// ========================
// SOCKET
// ========================
io.on("connection", socket => {
    console.log("Utente connesso:", socket.id);

    players[socket.id] = {
        pos: spawnPos(),
        dir: { x: 0, y: 0 },
        angle: 0,
        hp: PLAYER_MAX_HP,
        morto: true,
        nickname: "Player",
        lastShot: 0,
        hitFlash: false,
        lastHit: 0,
        weapon: "gun"
    };

    socket.emit("init", { id: socket.id, map, ostacoli });

    // fix #5 — nickname personalizzato
    socket.on("setNickname", (raw) => {
        if (typeof raw !== "string") return;
        const nick = raw.trim().replace(/[<>]/g, "").slice(0, 12) || "Player";
        players[socket.id].nickname = nick;
        leaderboard[socket.id] = { nickname: nick, kills: 0, deaths: 0 };
    });

    socket.on("spawn", () => {
        const p = players[socket.id];
        if (!p) return;
        p.pos = spawnPos();
        p.hp = PLAYER_MAX_HP;
        p.morto = false;
        p.dir = { x: 0, y: 0 };
        p.angle = 0;
    });

    // fix #8 — validazione input server-side
    socket.on("input", (input) => {
        const p = players[socket.id];
        if (!p || p.morto || typeof input !== "object" || input === null) return;
        p.dir = {
            x: (input.right === true ? 1 : 0) - (input.left === true ? 1 : 0),
            y: (input.down  === true ? 1 : 0) - (input.up   === true ? 1 : 0)
        };
    });

    // fix #13 — angolo di puntamento
    socket.on("aim", (angle) => {
        const p = players[socket.id];
        if (!p || p.morto || typeof angle !== "number" || !isFinite(angle)) return;
        p.angle = angle;
    });

    socket.on("setWeapon", (w) => {
        const p = players[socket.id];
        if (!p || (w !== "gun" && w !== "pistol" && w !== "fists")) return;
        p.weapon = w;
    });

    // fix #1 — rate limiting sparo (150ms cooldown)
    socket.on("shoot", (data) => {
        const p = players[socket.id];
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
        // Offset punta arma sulla posizione server (sempre centrato)
        const MAX_TIP = 100;
        const ox = (tipOffset && Math.abs(tipOffset.x) < MAX_TIP) ? tipOffset.x : 0;
        const oy = (tipOffset && Math.abs(tipOffset.y) < MAX_TIP) ? tipOffset.y : 0;
        const bx = p.pos.x + ox, by = p.pos.y + oy;
        proiettili.push({
            id: nextBulletId++,
            pos: { x: bx, y: by },
            dir: { x: nx, y: ny },
            owner: socket.id,
            weapon: p.weapon,
            spawnTime: now
        });
    });

    socket.on("disconnect", () => {
        console.log("Utente disconnesso:", socket.id);
        delete players[socket.id];
    });
});

// ========================
// GAME LOOP 60fps
// ========================
let lastTime = Date.now();

setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Reset hitFlash ogni frame
    for (const id in players) players[id].hitFlash = false;

    // Movimento giocatori
    for (const id in players) {
        const p = players[id];
        if (p.morto) continue;
        const len = Math.hypot(p.dir.x, p.dir.y);
        const nx = len > 0 ? p.dir.x / len : 0;
        const ny = len > 0 ? p.dir.y / len : 0;
        p.pos.x += nx * SPEED * dt;
        p.pos.y += ny * SPEED * dt;
        risolviCollisioni(p);
    }

    // Rigenerazione vita: +2hp/sec dopo 4s senza danni
    const REGEN_DELAY = 4000;   // ms prima di rigenerare
    const REGEN_RATE  = 8;      // hp/sec
    for (const id in players) {
        const p = players[id];
        if (p.morto || p.hp >= PLAYER_MAX_HP) continue;
        if (now - p.lastHit >= REGEN_DELAY) {
            p.hp = Math.min(PLAYER_MAX_HP, p.hp + REGEN_RATE * dt);
        }
    }

    // Aggiornamento proiettili
    for (let i = proiettili.length - 1; i >= 0; i--) {
        const b = proiettili[i];
        b.pos.x += b.dir.x * SPEED_PROIETTILE * dt;
        b.pos.y += b.dir.y * SPEED_PROIETTILE * dt;

        // Solo lifetime — nessun controllo bordi mappa
        if ((now - b.spawnTime) / 1000 >= BULLET_LIFETIME) {
            proiettili.splice(i, 1); continue;
        }
        // Collisione ostacoli solidi
        let hitWall = false;
        for (const o of ostacoliSolidi) {
            const rColl = o.rCollisione !== undefined ? o.rCollisione : o.r;
            if (Math.hypot(b.pos.x - o.x, b.pos.y - o.y) < rColl + 6) { hitWall = true; break; }
        }
        if (hitWall) { proiettili.splice(i, 1); continue; }

        // Collisione giocatori
        let hit = false;
        for (const id in players) {
            if (id === b.owner) continue;
            const p = players[id];
            if (p.morto) continue;
            if (Math.hypot(b.pos.x - p.pos.x, b.pos.y - p.pos.y) < PLAYER_RADIUS + 6) {
                p.hp -= DAMAGE_BY_WEAPON[b.weapon] ?? 20;
                p.hitFlash = true; // fix #6
                p.lastHit = now;
                hit = true;
                if (p.hp <= 0) {
                    p.hp = 0;
                    p.morto = true;
                    p.dir = { x: 0, y: 0 };
                    // fix #4 — statistiche kill/death
                    if (leaderboard[id]) leaderboard[id].deaths++;
                    if (leaderboard[b.owner]) leaderboard[b.owner].kills++;
                    // fix #4 — notifica kill all'uccisore
                    io.to(b.owner).emit("killConfirm", { victim: players[id]?.nickname || "?" });
                    // Respawn manuale — il giocatore preme il bottone
                }
                break;
            }
        }
        if (hit) proiettili.splice(i, 1);
    }

    // Costruisco stato da inviare (fix #3 — dati compatti)
    const playersState = {};
    for (const id in players) {
        const p = players[id];
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

    io.emit("state", {
        players: playersState,
        proiettili,
        lb: getLeaderboard()
    });

}, 1000 / 60);

server.listen(4000, () => console.log("Server avviato su http://localhost:4000"));