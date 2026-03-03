const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("client"));

const map = { width: 5000, height: 5000 };

function seededRandom(seed) {
    let s = seed;
    return function() {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

const ostacoli = [];
const rng = seededRandom(42);

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
const BULLET_DAMAGE = 20;
const ostacoliSolidi = ostacoli.filter(o => o.type !== "cespuglio");

const players = {};
const proiettili = [];
let nextBulletId = 0;

const SPEED = 320;
const SPEED_PROIETTILE = 1300;
const BULLET_LIFETIME = 0.8;

function spawnPos() {
    return {
        x: 100 + Math.random() * (map.width  - 200),
        y: 100 + Math.random() * (map.height - 200)
    };
}

function risolviCollisioni(p) {
    p.pos.x = Math.max(PLAYER_RADIUS, Math.min(map.width  - PLAYER_RADIUS, p.pos.x));
    p.pos.y = Math.max(PLAYER_RADIUS, Math.min(map.height - PLAYER_RADIUS, p.pos.y));

    for (const o of ostacoliSolidi) {
        const rColl = o.rCollisione !== undefined ? o.rCollisione : o.r;
        const dx = p.pos.x - o.x;
        const dy = p.pos.y - o.y;
        const dist = Math.hypot(dx, dy);
        const minDist = PLAYER_RADIUS + rColl;
        if (dist < minDist && dist > 0) {
            const overlap = minDist - dist;
            p.pos.x += (dx / dist) * overlap;
            p.pos.y += (dy / dist) * overlap;
        }
    }

    p.pos.x = Math.max(PLAYER_RADIUS, Math.min(map.width  - PLAYER_RADIUS, p.pos.x));
    p.pos.y = Math.max(PLAYER_RADIUS, Math.min(map.height - PLAYER_RADIUS, p.pos.y));
}

io.on("connection", socket => {
    console.log("Utente connesso:", socket.id);

    // Player creato ma morto finché non preme GIOCA
    players[socket.id] = {
        pos: spawnPos(),
        dir: { x: 0, y: 0 },
        hp: PLAYER_MAX_HP,
        morto: true
    };

    socket.emit("init", { id: socket.id, map, ostacoli });

    // Il client ha premuto GIOCA
    socket.on("spawn", () => {
        const p = players[socket.id];
        if (!p) return;
        p.pos = spawnPos();
        p.hp = PLAYER_MAX_HP;
        p.morto = false;
        p.dir = { x: 0, y: 0 };
    });

    socket.on("input", input => {
        const p = players[socket.id];
        if (!p || p.morto) return;
        p.dir = {
            x: (input.right ? 1 : 0) - (input.left ? 1 : 0),
            y: (input.down  ? 1 : 0) - (input.up   ? 1 : 0)
        };
    });

    socket.on("shoot", (data) => {
        const p = players[socket.id];
        if (!p || p.morto) return;
        const { dir } = data;
        const len = Math.hypot(dir.x, dir.y);
        if (len === 0) return;
        proiettili.push({
            id: nextBulletId++,
            pos: { x: p.pos.x, y: p.pos.y },
            dir: { x: dir.x / len, y: dir.y / len },
            owner: socket.id,
            spawnTime: Date.now()
        });
    });

    socket.on("disconnect", () => {
        console.log("Utente disconnesso:", socket.id);
        delete players[socket.id];
    });
});

let lastTime = Date.now();

setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

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

    for (let i = proiettili.length - 1; i >= 0; i--) {
        const b = proiettili[i];
        b.pos.x += b.dir.x * SPEED_PROIETTILE * dt;
        b.pos.y += b.dir.y * SPEED_PROIETTILE * dt;

        if ((now - b.spawnTime) / 1000 >= BULLET_LIFETIME) {
            proiettili.splice(i, 1);
            continue;
        }

        // Collisione proiettile con ostacoli solidi (rocce e tronchi alberi)
        let colpitaRoccia = false;
        for (const o of ostacoliSolidi) {
            const rColl = o.rCollisione !== undefined ? o.rCollisione : o.r;
            const dist = Math.hypot(b.pos.x - o.x, b.pos.y - o.y);
            if (dist < rColl + 6) {
                colpitaRoccia = true;
                break;
            }
        }
        if (colpitaRoccia) {
            proiettili.splice(i, 1);
            continue;
        }
        let colpito = false;
        for (const id in players) {
            if (id === b.owner) continue;
            const p = players[id];
            if (p.morto) continue;
            const dist = Math.hypot(b.pos.x - p.pos.x, b.pos.y - p.pos.y);
            if (dist < PLAYER_RADIUS + 6) {
                p.hp -= BULLET_DAMAGE;
                colpito = true;
                if (p.hp <= 0) {
                    p.hp = 0;
                    p.morto = true;
                    p.dir = { x: 0, y: 0 };
                    // Respawn automatico dopo 3 secondi
                    const deadId = id;
                    setTimeout(() => {
                        const rp = players[deadId];
                        if (rp && rp.morto) {
                            rp.pos = spawnPos();
                            rp.hp = PLAYER_MAX_HP;
                            rp.morto = false;
                            rp.dir = { x: 0, y: 0 };
                        }
                    }, 3000);
                }
                break;
            }
        }
        if (colpito) proiettili.splice(i, 1);
    }

    const playersState = {};
    for (const id in players) {
        const p = players[id];
        playersState[id] = { pos: p.pos, hp: p.hp, morto: p.morto };
    }
    io.emit("state", { players: playersState, proiettili });

}, 1000 / 60);

server.listen(4000, () => console.log("Server avviato su http://localhost:4000"));