const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static("client"));

// ========================
// KEEP-ALIVE (Render)
// ========================
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
    setInterval(() => { fetch(RENDER_URL).catch(() => {}); }, 10 * 60 * 1000);
}

// ========================
// COSTANTI
// ========================
const map = { width: 5000, height: 5000 };
const PLAYER_RADIUS = 20;
const PLAYER_MAX_HP = 100;
const DAMAGE_BY_WEAPON    = { gun: 25, pistol: 15, fists: 100 };
const COOLDOWN_BY_WEAPON  = { gun: 100, pistol: 200, fists: 800 };
const RANGE_BY_WEAPON     = { gun: null, pistol: null, fists: 80 }; // raggio corpo a corpo
const MAX_AMMO = { gun: 30, pistol: 15, fists: 0 };
const RELOAD_TIME = { gun: 2000, pistol: 1500 };
const SPEED = 300;
const SPEED_PROIETTILE = 1750;
const BULLET_LIFETIME = 1.2;
const MAX_PLAYERS = 8;
const REJOIN_TTL = 5 * 60 * 1000; // 5 minuti per fare rejoin

// ========================
// NICKNAME CASUALI
// ========================
const AGGETTIVI = ["Red","Blue","Dark","Wild","Iron","Gold","Shadow","Frost","Storm","Toxic",
    "Ghost","Blaze","Steel","Neon","Brave","Savage","Swift","Quiet","Lone","Cyber"];
const SOSTANTIVI = ["Wolf","Fox","Bear","Eagle","Shark","Tiger","Hawk","Lynx","Viper","Raven",
    "Cobra","Puma","Bison","Falcon","Otter","Moose","Drake","Hyena","Jaguar","Wyvern"];
const usedNicknames = new Set();

function generaNickname() {
    for (let i = 0; i < 200; i++) {
        const a = AGGETTIVI[Math.floor(Math.random() * AGGETTIVI.length)];
        const s = SOSTANTIVI[Math.floor(Math.random() * SOSTANTIVI.length)];
        const n = `${a}${s}`;
        if (!usedNicknames.has(n)) { usedNicknames.add(n); return n; }
    }
    return "Player" + Math.floor(Math.random() * 9000 + 1000);
}

// ========================
// MAPPA
// ========================
function seededRandom(seed) {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function generaMappa() {
    const ostacoli = [];
    const rng = seededRandom(Math.floor(Math.random() * 999999));
    for (let i = 0; i < 80; i++) {
        const r = 25 + rng() * 35;
        ostacoli.push({ x: rng() * map.width, y: rng() * map.height, r, rCollisione: r, type: "roccia" });
    }
    for (let i = 0; i < 60; i++) {
        const r = 35 + rng() * 50;
        ostacoli.push({ x: rng() * map.width, y: rng() * map.height, r, rCollisione: Math.max(10, r / 3), type: "albero" });
    }
    for (let i = 0; i < 70; i++) {
        ostacoli.push({ x: rng() * map.width, y: rng() * map.height, r: 20 + rng() * 30, type: "cespuglio" });
    }
    return ostacoli;
}

// ========================
// FISICA
// ========================
function spawnPos(lobby) {
    for (let t = 0; t < 30; t++) {
        const x = 100 + Math.random() * (map.width - 200);
        const y = 100 + Math.random() * (map.height - 200);
        let ok = true;
        for (const id in lobby.players) {
            if (lobby.players[id].morto) continue;
            if (Math.hypot(x - lobby.players[id].pos.x, y - lobby.players[id].pos.y) < 200) { ok = false; break; }
        }
        if (ok) return { x, y };
    }
    return { x: 100 + Math.random() * (map.width - 200), y: 100 + Math.random() * (map.height - 200) };
}

function risolviCollisioni(p, ostacoliSolidi) {
    p.pos.x = Math.max(PLAYER_RADIUS, Math.min(map.width  - PLAYER_RADIUS, p.pos.x));
    p.pos.y = Math.max(PLAYER_RADIUS, Math.min(map.height - PLAYER_RADIUS, p.pos.y));
    for (const o of ostacoliSolidi) {
        const dx = p.pos.x - o.x, dy = p.pos.y - o.y;
        const dist = Math.hypot(dx, dy);
        const minD = PLAYER_RADIUS + o.rCollisione;
        if (dist < minD && dist > 0) {
            p.pos.x += (dx / dist) * (minD - dist);
            p.pos.y += (dy / dist) * (minD - dist);
        }
    }
    p.pos.x = Math.max(PLAYER_RADIUS, Math.min(map.width  - PLAYER_RADIUS, p.pos.x));
    p.pos.y = Math.max(PLAYER_RADIUS, Math.min(map.height - PLAYER_RADIUS, p.pos.y));
}

function getLeaderboard(lobby) {
    return Object.values(lobby.leaderboard).sort((a, b) => b.kills - a.kills).slice(0, 10);
}

// ========================
// LOBBIES
// ========================
const lobbies = {};

function getLobbyList() {
    return Object.values(lobbies).map(l => ({
        id: l.id, name: l.name,
        players: Object.keys(l.players).length,
        max: MAX_PLAYERS, createdAt: l.createdAt,
        private: l.private,
    }));
}

function broadcastLobbyList() {
    io.emit("lobbyList", getLobbyList());
}

function creaLobby(lobbyId, lobbyName, password) {
    const ostacoli = generaMappa();
    const lobby = {
        id: lobbyId, name: lobbyName,
        private: !!password,
        password: password || null,
        players: {},
        tokens: {},
        proiettili: [],
        ostacoli,
        ostacoliSolidi: ostacoli.filter(o => o.type !== "cespuglio"),
        leaderboard: {},
        nextBulletId: 0,
        lastTime: Date.now(),
        createdAt: Date.now(),
        nsp: null,
        cleanupTimer: null,
    };

    // ── Namespace dedicato ──
    const nsp = io.of("/lobby/" + lobbyId);
    lobby.nsp = nsp;

    nsp.on("connection", socket => {
        // Annulla eventuale cleanup in corso (qualcuno è rientrato)
        if (lobby.cleanupTimer) { clearTimeout(lobby.cleanupTimer); lobby.cleanupTimer = null; }

        socket.on("join", (data) => {
            if (socket.playerToken) return;

            let nickname, kills = 0, deaths = 0;
            const token = data && data.token;

            // Prova rejoin
            if (token && lobby.tokens[token] && Date.now() < lobby.tokens[token].expireAt) {
                const saved = lobby.tokens[token];
                nickname = saved.nickname;
                kills    = saved.kills;
                deaths   = saved.deaths;
                delete lobby.tokens[token];
                console.log(`[${lobbyId}] rejoin: ${nickname}`);
            } else {
                // Controlla capienza
                if (Object.keys(lobby.players).length >= MAX_PLAYERS) {
                    socket.emit("lobbyFull");
                    socket.disconnect();
                    return;
                }
                nickname = generaNickname();
            }

            const newToken = crypto.randomBytes(16).toString("hex");
            socket.playerToken = newToken;
            socket.nickname    = nickname;

            lobby.players[socket.id] = {
                pos: spawnPos(lobby), dir: { x: 0, y: 0 },
                angle: 0, hp: PLAYER_MAX_HP, morto: true,
                nickname, lastShot: 0, hitFlash: false, lastHit: 0, weapon: "gun", punchCount: 0,
            };
            lobby.leaderboard[socket.id] = { nickname, kills, deaths };

            socket.emit("init", {
                id: socket.id, token: newToken, map,
                ostacoli: lobby.ostacoli, lobbyId, lobbyName: lobby.name,
                nickname, playerCount: Object.keys(lobby.players).length, maxPlayers: MAX_PLAYERS,
            });

            broadcastLobbyList();
        });

        socket.on("spawn", () => {
            const p = lobby.players[socket.id];
            if (!p) return;
            p.pos = spawnPos(lobby); p.hp = PLAYER_MAX_HP;
            p.morto = false; p.dir = { x: 0, y: 0 }; p.angle = 0;
            p.ammo = { gun: MAX_AMMO.gun, pistol: MAX_AMMO.pistol };
        });

        socket.on("input", (input) => {
            const p = lobby.players[socket.id];
            if (!p || p.morto || typeof input !== "object" || !input) return;
            p.dir = {
                x: (input.right ? 1 : 0) - (input.left ? 1 : 0),
                y: (input.down  ? 1 : 0) - (input.up   ? 1 : 0),
            };
        });

        socket.on("aim", (angle) => {
            const p = lobby.players[socket.id];
            if (!p || p.morto || typeof angle !== "number" || !isFinite(angle)) return;
            p.angle = angle;
        });

        socket.on("setWeapon", (w) => {
            const p = lobby.players[socket.id];
            if (!p || !["gun","pistol","fists"].includes(w)) return;
            // Se si cambia arma durante una ricarica, annullala
            if (p.reloading && p.weapon !== w) {
                p.reloading = false;
                if (p.reloadTimer) { clearTimeout(p.reloadTimer); p.reloadTimer = null; }
                socket.emit("reloadCancelled", { weapon: p.weapon });
            }
            p.weapon = w;
        });

        socket.on("reload", () => {
            const p = lobby.players[socket.id];
            if (!p || p.morto || p.weapon === "fists") return;
            if (!p.ammo) p.ammo = { gun: MAX_AMMO.gun, pistol: MAX_AMMO.pistol };
            if (p.ammo[p.weapon] >= MAX_AMMO[p.weapon]) return;
            if (p.reloading) return;
            p.reloading = true;
            const weaponAlReload = p.weapon;
            socket.emit("reloadStart", { weapon: weaponAlReload, duration: RELOAD_TIME[weaponAlReload] });
            p.reloadTimer = setTimeout(() => {
                if (!p || !lobby.players[socket.id]) return;
                // Completa solo se il player ha ancora la stessa arma
                if (p.weapon !== weaponAlReload) return;
                p.ammo[weaponAlReload] = MAX_AMMO[weaponAlReload];
                p.reloading = false;
                p.reloadTimer = null;
                socket.emit("reloadDone", { weapon: weaponAlReload });
            }, RELOAD_TIME[weaponAlReload]);
        });

        socket.on("shoot", (data) => {
            const p = lobby.players[socket.id];
            if (!p || p.morto || !data || typeof data.dir !== "object") return;
            const now = Date.now();
            if (now - p.lastShot < (COOLDOWN_BY_WEAPON[p.weapon] ?? 100)) return;
            p.lastShot = now;

            // ── Karambit (corpo a corpo) ──
            if (p.weapon === "fists") {
                p.punchCount = (p.punchCount || 0) + 1;
                p.punchFlash = true;
                p.punchHand  = p.punchCount % 2; // 1=destra 0=sinistra
                // Mani a 23+18+9+10 = ~60px, solo cono frontale +-90 gradi
                const range = 60;
                const punchAngle = p.angle;
                for (const id in lobby.players) {
                    if (id === socket.id) continue;
                    const target = lobby.players[id];
                    if (target.morto) continue;
                    const dx = target.pos.x - p.pos.x;
                    const dy = target.pos.y - p.pos.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > range) continue;
                    let angleDiff = Math.atan2(dy, dx) - punchAngle;
                    while (angleDiff >  Math.PI) angleDiff -= 2 * Math.PI;
                    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                    if (Math.abs(angleDiff) > Math.PI / 2) continue;
                    if (dist <= range) {
                        target.hp -= DAMAGE_BY_WEAPON.fists;
                        target.hitFlash = true;
                        target.lastHit  = now;
                        if (target.hp <= 0) {
                            target.hp = 0; target.morto = true;
                            target.dir = { x:0, y:0 };
                            if (lobby.leaderboard[id])         lobby.leaderboard[id].deaths++;
                            if (lobby.leaderboard[socket.id])  lobby.leaderboard[socket.id].kills++;
                            lobby.nsp.to(socket.id).emit("killConfirm", { victim: target.nickname });
                        }
                    }
                }
                return;
            }

            // ── Armi a fuoco ──
            if (!p.ammo) p.ammo = { gun: MAX_AMMO.gun, pistol: MAX_AMMO.pistol };
            if (p.ammo[p.weapon] <= 0) return;
            if (p.reloading) return;
            const { dir, tipOffset } = data;
            if (typeof dir.x !== "number" || typeof dir.y !== "number") return;
            const len = Math.hypot(dir.x, dir.y);
            if (!len || !isFinite(len)) return;
            const nx = dir.x / len, ny = dir.y / len;
            const ox = (tipOffset && Math.abs(tipOffset.x) < 100) ? tipOffset.x : 0;
            const oy = (tipOffset && Math.abs(tipOffset.y) < 100) ? tipOffset.y : 0;
            p.ammo[p.weapon]--;
            lobby.proiettili.push({
                id: lobby.nextBulletId++,
                pos: { x: p.pos.x + ox, y: p.pos.y + oy },
                dir: { x: nx, y: ny },
                owner: socket.id, weapon: p.weapon, spawnTime: now,
            });
        });

        socket.on("disconnect", () => {
            console.log(`[${lobbyId}] disconnesso: ${socket.nickname || socket.id}`);
            const lb = lobby.leaderboard[socket.id];

            // Salva token per rejoin
            if (socket.playerToken) {
                lobby.tokens[socket.playerToken] = {
                    nickname: socket.nickname,
                    kills:    lb ? lb.kills   : 0,
                    deaths:   lb ? lb.deaths  : 0,
                    expireAt: Date.now() + REJOIN_TTL,
                };
                usedNicknames.delete(socket.nickname);
            }

            delete lobby.players[socket.id];
            delete lobby.leaderboard[socket.id];
            lobby.proiettili = lobby.proiettili.filter(b => b.owner !== socket.id);

            nsp.emit("playerLeft", { id: socket.id, nickname: socket.nickname || "?" });

            broadcastLobbyList();

            // Se vuota, cancella dopo 5 minuti
            if (Object.keys(lobby.players).length === 0) {
                lobby.cleanupTimer = setTimeout(() => {
                    if (lobbies[lobbyId] && Object.keys(lobby.players).length === 0) {
                        nsp.disconnectSockets(true);
                        io._nsps.delete("/lobby/" + lobbyId);
                        delete lobbies[lobbyId];
                        console.log(`Lobby rimossa (vuota): ${lobbyId}`);
                        broadcastLobbyList();
                    }
                }, REJOIN_TTL);
            }
        });
    });

    lobbies[lobbyId] = lobby;
    broadcastLobbyList();
    console.log(`Lobby creata: ${lobbyId} ("${lobbyName}")`);
    return lobby;
}

// ========================
// SOCKET PRINCIPALE — solo selezione lobby
// ========================
io.on("connection", socket => {
    socket.emit("lobbyList", getLobbyList());

    socket.on("createLobby", (data) => {
        const rawName = (data && typeof data.name === "string" && data.name.trim())
            ? data.name.trim().slice(0, 30)
            : "";
        const lobbyName = rawName || "Lobby " + Math.floor(Math.random() * 9000 + 1000);
        const password  = (data && typeof data.password === "string" && data.password.trim())
            ? data.password.trim().slice(0, 30)
            : null;
        const isPrivate = !!(data && data.private && password);

        // Nomi unici — controlla solo se il nome è stato specificato
        if (rawName) {
            const exists = Object.values(lobbies).some(l => l.name.toLowerCase() === lobbyName.toLowerCase());
            if (exists) { socket.emit("lobbyError", `A lobby named "${lobbyName}".`); return; }
        }

        const lobbyId = crypto.randomBytes(4).toString("hex");
        creaLobby(lobbyId, lobbyName, isPrivate ? password : null);
        socket.emit("lobbyCreated", { lobbyId, lobbyName });
    });

    socket.on("joinLobby", (data) => {
        const lobbyId  = data && data.lobbyId;
        const password = data && data.password;
        if (!lobbyId || !lobbies[lobbyId]) { socket.emit("lobbyError", "Lobby not found."); return; }
        const lobby = lobbies[lobbyId];
        if (Object.keys(lobby.players).length >= MAX_PLAYERS) { socket.emit("lobbyError", "Lobby full."); return; }
        // Controlla password se lobby privata
        if (lobby.private) {
            if (!password || password !== lobby.password) {
                socket.emit("lobbyError", "Wrong password.");
                return;
            }
        }
        socket.emit("lobbyJoinOk", { lobbyId, lobbyName: lobby.name });
    });
});

// ========================
// GAME LOOP — 60fps fisica, 40fps broadcast
// ========================
setInterval(() => {
    const now = Date.now();
    const doBroadcast = true;

    for (const lobbyId in lobbies) {
        const lobby = lobbies[lobbyId];
        if (Object.keys(lobby.players).length === 0) continue;

        const dt = Math.min((now - lobby.lastTime) / 1000, 0.05);
        lobby.lastTime = now;

        for (const id in lobby.players) { lobby.players[id].hitFlash = false; lobby.players[id].punchFlash = false; }

        // Movimento
        for (const id in lobby.players) {
            const p = lobby.players[id];
            if (p.morto) continue;
            const len = Math.hypot(p.dir.x, p.dir.y);
            if (len > 0) {
                p.pos.x += (p.dir.x / len) * SPEED * dt;
                p.pos.y += (p.dir.y / len) * SPEED * dt;
            }
            risolviCollisioni(p, lobby.ostacoliSolidi);
        }

        // Regen vita
        for (const id in lobby.players) {
            const p = lobby.players[id];
            if (p.morto || p.hp >= PLAYER_MAX_HP) continue;
            if (now - p.lastHit >= 4000) p.hp = Math.min(PLAYER_MAX_HP, p.hp + 8 * dt);
        }

        // Proiettili
        for (let i = lobby.proiettili.length - 1; i >= 0; i--) {
            const b = lobby.proiettili[i];
            b.pos.x += b.dir.x * SPEED_PROIETTILE * dt;
            b.pos.y += b.dir.y * SPEED_PROIETTILE * dt;

            if ((now - b.spawnTime) / 1000 >= BULLET_LIFETIME) { lobby.proiettili.splice(i, 1); continue; }

            let hitWall = false;
            for (const o of lobby.ostacoliSolidi) {
                if (Math.hypot(b.pos.x - o.x, b.pos.y - o.y) < o.rCollisione + 4) { hitWall = true; break; }
            }
            if (hitWall) { lobby.proiettili.splice(i, 1); continue; }

            let hit = false;
            for (const id in lobby.players) {
                if (id === b.owner) continue;
                const p = lobby.players[id];
                if (p.morto) continue;
                if (Math.hypot(b.pos.x - p.pos.x, b.pos.y - p.pos.y) < PLAYER_RADIUS + 6) {
                    p.hp -= DAMAGE_BY_WEAPON[b.weapon] ?? 20;
                    p.hitFlash = true; p.lastHit = now; hit = true;
                    if (p.hp <= 0) {
                        p.hp = 0; p.morto = true; p.dir = { x: 0, y: 0 };
                        if (lobby.leaderboard[id])      lobby.leaderboard[id].deaths++;
                        if (lobby.leaderboard[b.owner]) lobby.leaderboard[b.owner].kills++;
                        lobby.nsp.to(b.owner).emit("killConfirm", { victim: p.nickname });
                    }
                    break;
                }
            }
            if (hit) lobby.proiettili.splice(i, 1);
        }

        // Broadcast
        if (doBroadcast) {
            const playersState = {};
            for (const id in lobby.players) {
                const p = lobby.players[id];
                playersState[id] = {
                    pos: { x: Math.round(p.pos.x), y: Math.round(p.pos.y) },
                    hp: p.hp, morto: p.morto, nickname: p.nickname,
                    angle: p.angle, weapon: p.weapon,
                    hitFlash: p.hitFlash || undefined,
                    punchFlash: p.punchFlash || undefined,
                    punchHand: p.punchHand,
                    ammo: p.ammo || { gun: MAX_AMMO.gun, pistol: MAX_AMMO.pistol },
                };
            }
            lobby.nsp.emit("state", {
                players: playersState,
                proiettili: lobby.proiettili,
                lb: getLeaderboard(lobby),
                playerCount: Object.keys(lobby.players).length,
                maxPlayers: MAX_PLAYERS,
            });
        }
    }
}, 1000 / 60);

server.listen(process.env.PORT || 4000, () => {
    console.log("Server avviato sulla porta", process.env.PORT || 4000);
});