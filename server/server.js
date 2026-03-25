// ============================================================
// SERVER — Shooter Online
// Stack: Express + Socket.IO + Node.js
//
// Architettura:
//   • Il socket "principale" (io) gestisce SOLO la lista lobby,
//     la creazione e il join.
//   • Ogni lobby ottiene un namespace dedicato (/lobby/<id>)
//     che gestisce tutto il gameplay (input, sparo, fisica, ecc.)
//   • Il game loop (setInterval) aggiorna fisica e proiettili
//     per tutte le lobby attive e fa broadcast dello stato.
// ============================================================

const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const crypto  = require("crypto");

const app    = express();
const server = http.createServer(app);

// Abilita CORS da qualsiasi origine (utile in sviluppo / deploy su Render)
const io = new Server(server, { cors: { origin: "*" } });

// Serve la cartella "client" come root statica
app.use(express.static("client"));

// ============================================================
// KEEP-ALIVE PER RENDER.COM
// Render mette in standby i server gratuiti dopo 15 min di
// inattività. Facciamo un ping ogni 10 minuti a noi stessi.
// ============================================================
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
    setInterval(() => {
        fetch(RENDER_URL).catch(() => {}); // ignoriamo eventuali errori di rete
    }, 10 * 60 * 1000); // ogni 10 minuti
}

// ============================================================
// COSTANTI DI GIOCO
// ============================================================

/** Dimensioni della mappa di gioco (in pixel-mondo) */
const MAP_SIZE = { width: 5000, height: 5000 };

/** Raggio del cerchio-collisore di ogni giocatore */
const PLAYER_RADIUS = 20;

/** Punti vita massimi di ogni giocatore */
const PLAYER_MAX_HP = 100;

/** Danno inflitto da ciascuna arma ad ogni colpo */
const DAMAGE_BY_WEAPON = {
    gun:   25,   // fucile d'assalto
    pistol: 15,  // pistola
    fists: 100,  // fists (corpo a corpo, 1 hit kill)
};

/** Millisecondi minimi tra uno sparo e il successivo (cooldown) */
const FIRE_COOLDOWN_MS = {
    gun:   100,
    pistol: 200,
    fists:  200,
};

/** Raggio di attacco corpo-a-corpo (null = solo proiettili) */
const MELEE_RANGE = {
    gun:   null,
    pistol: null,
    fists:  100,
};

/** Munizioni massime per ogni arma (0 = arma corpo a corpo, infinita) */
const MAX_AMMO = {
    gun:   30,
    pistol: 15,
    fists:   0,
};

/** Durata ricarica in millisecondi per ciascuna arma */
const RELOAD_TIME_MS = {
    gun:   2000,
    pistol: 1500,
};

/** Velocità di movimento del giocatore (pixel/secondo) */
const PLAYER_SPEED = 300;

/** Velocità dei proiettili (pixel/secondo) */
const BULLET_SPEED = 1750;

/** Secondi di vita di un proiettile prima di scomparire */
const BULLET_LIFETIME_SEC = 1.2;

/** Numero massimo di giocatori per lobby */
const MAX_PLAYERS = 8;

/** Numero massimo di lobby contemporanee sul server */
const MAX_LOBBIES = 20;

/**
 * Millisecondi in cui un token di rejoin rimane valido.
 * Se un giocatore si disconnette, ha 5 minuti per riconnettersi
 * mantenendo nickname e statistiche.
 */
const REJOIN_TOKEN_TTL = 5 * 60 * 1000; // 5 minuti

// ============================================================
// GENERAZIONE NICKNAME CASUALI
// ============================================================

/** Aggettivi usati come prefisso del nickname */
const NICKNAME_ADJECTIVES = [
    "Red","Blue","Dark","Wild","Iron","Gold","Shadow","Frost","Storm","Toxic",
    "Ghost","Blaze","Steel","Neon","Brave","Savage","Swift","Quiet","Lone","Cyber",
];

/** Sostantivi usati come suffisso del nickname */
const NICKNAME_NOUNS = [
    "Wolf","Fox","Bear","Eagle","Shark","Tiger","Hawk","Lynx","Viper","Raven",
    "Cobra","Puma","Bison","Falcon","Otter","Moose","Drake","Hyena","Jaguar","Wyvern",
];

/** Insieme dei nickname attualmente in uso (per evitare duplicati) */
const usedNicknames = new Set();

/**
 * Genera un nickname casuale univoco del tipo "BlazeFalcon".
 * Prova fino a 200 combinazioni; in caso di esaurimento usa "Player<4 cifre>".
 * @returns {string} Nickname univoco
 */
function generateNickname() {
    for (let attempt = 0; attempt < 200; attempt++) {
        const adjective = NICKNAME_ADJECTIVES[Math.floor(Math.random() * NICKNAME_ADJECTIVES.length)];
        const noun      = NICKNAME_NOUNS[Math.floor(Math.random() * NICKNAME_NOUNS.length)];
        const candidate = `${adjective}${noun}`;
        if (!usedNicknames.has(candidate)) {
            usedNicknames.add(candidate);
            return candidate;
        }
    }
    // Fallback se tutte le combinazioni sono occupate
    return "Player" + Math.floor(Math.random() * 9000 + 1000);
}

// ============================================================
// GENERAZIONE MAPPA PROCEDURALE
// ============================================================

/**
 * Crea un generatore di numeri pseudo-casuali deterministico
 * basato sul seed fornito (algoritmo LCG – Park-Miller).
 * Lo stesso seed produce sempre la stessa sequenza.
 * @param {number} seed - Seme iniziale
 * @returns {function(): number} Funzione che restituisce valori in [0, 1)
 */
function createSeededRng(seed) {
    let state = seed;
    return () => {
        state = (state * 16807) % 2147483647;
        return (state - 1) / 2147483646;
    };
}

/**
 * Genera un array di ostacoli (rocce, alberi, cespugli) con
 * posizioni pseudo-casuali ma ripetibili tramite seed.
 * @returns {Array<Object>} Lista degli ostacoli della mappa
 */
function generateMapObstacles() {
    const obstacles = [];
    const rng = createSeededRng(Math.floor(Math.random() * 999999));

    // 80 rocce — solide, bloccano movimento e proiettili
    for (let i = 0; i < 80; i++) {
        const radius = 25 + rng() * 35;
        obstacles.push({
            x: rng() * MAP_SIZE.width,
            y: rng() * MAP_SIZE.height,
            r: radius,
            rCollisione: radius, // raggio di collisione = raggio visivo
            type: "roccia",
        });
    }

    // 60 alberi — solidi, ma il tronco è più stretto del fogliame
    for (let i = 0; i < 60; i++) {
        const radius = 35 + rng() * 50;
        obstacles.push({
            x: rng() * MAP_SIZE.width,
            y: rng() * MAP_SIZE.height,
            r: radius,
            rCollisione: Math.max(10, radius / 3), // solo il tronco è solido
            type: "albero",
        });
    }

    // 70 cespugli — puramente decorativi, non bloccano nulla
    for (let i = 0; i < 70; i++) {
        obstacles.push({
            x: rng() * MAP_SIZE.width,
            y: rng() * MAP_SIZE.height,
            r: 20 + rng() * 30,
            // nessun rCollisione: i cespugli non hanno collisione
            type: "cespuglio",
        });
    }

    return obstacles;
}

// ============================================================
// FISICA — SPAWN E COLLISIONI
// ============================================================

/**
 * Trova una posizione di spawn sicura per un giocatore nella lobby:
 * lontana almeno 200px da ogni altro giocatore vivo.
 * Prova fino a 30 volte; se non trova nulla di adatto, spawna a caso.
 * @param {Object} lobby - La lobby corrente
 * @returns {{x: number, y: number}} Coordinate di spawn
 */
function findSafeSpawnPosition(lobby) {
    for (let attempt = 0; attempt < 30; attempt++) {
        const x = 100 + Math.random() * (MAP_SIZE.width  - 200);
        const y = 100 + Math.random() * (MAP_SIZE.height - 200);

        let positionIsSafe = true;
        for (const id in lobby.players) {
            const otherPlayer = lobby.players[id];
            if (otherPlayer.isDead) continue;
            if (Math.hypot(x - otherPlayer.pos.x, y - otherPlayer.pos.y) < 200) {
                positionIsSafe = false;
                break;
            }
        }
        if (positionIsSafe) return { x, y };
    }
    // Fallback: spawn casuale senza controlli
    return {
        x: 100 + Math.random() * (MAP_SIZE.width  - 200),
        y: 100 + Math.random() * (MAP_SIZE.height - 200),
    };
}

/**
 * Risolve le collisioni tra un giocatore e i bordi della mappa
 * e tra il giocatore e gli ostacoli solidi (rocce e tronchi).
 * Applica un push-out circolare per ogni ostacolo sovrapposto.
 * @param {Object} player        - Oggetto player con { pos: {x, y} }
 * @param {Array}  solidObstacles - Ostacoli con rCollisione definito
 */
function resolvePlayerCollisions(player, solidObstacles) {
    // 1ª passata: clamp ai bordi della mappa
    player.pos.x = Math.max(PLAYER_RADIUS, Math.min(MAP_SIZE.width  - PLAYER_RADIUS, player.pos.x));
    player.pos.y = Math.max(PLAYER_RADIUS, Math.min(MAP_SIZE.height - PLAYER_RADIUS, player.pos.y));

    // Push-out da ogni ostacolo sovrapposto
    for (const obstacle of solidObstacles) {
        const dx   = player.pos.x - obstacle.x;
        const dy   = player.pos.y - obstacle.y;
        const dist = Math.hypot(dx, dy);
        const minAllowedDist = PLAYER_RADIUS + obstacle.rCollisione;

        if (dist < minAllowedDist && dist > 0) {
            // Spingi il player verso l'esterno lungo la normale
            const overlap = minAllowedDist - dist;
            player.pos.x += (dx / dist) * overlap;
            player.pos.y += (dy / dist) * overlap;
        }
    }

    // 2ª passata: reclamp dopo eventuali push-out
    player.pos.x = Math.max(PLAYER_RADIUS, Math.min(MAP_SIZE.width  - PLAYER_RADIUS, player.pos.x));
    player.pos.y = Math.max(PLAYER_RADIUS, Math.min(MAP_SIZE.height - PLAYER_RADIUS, player.pos.y));
}

// ============================================================
// LEADERBOARD
// ============================================================

/**
 * Restituisce la classifica della lobby ordinata per kill (desc),
 * limitata ai primi 10 giocatori.
 * @param {Object} lobby
 * @returns {Array<Object>} Classifica ordinata
 */
function getLeaderboard(lobby) {
    return Object.values(lobby.leaderboard)
        .sort((a, b) => b.kills - a.kills)
        .slice(0, 10);
}

// ============================================================
// GESTIONE LOBBIES
// ============================================================

/** Mappa di tutte le lobby attive: { [lobbyId]: lobbyObject } */
const lobbies = {};

/**
 * Crea e restituisce la lista delle lobby pubblica (senza password)
 * da inviare ai client nella schermata di selezione.
 * @returns {Array<Object>}
 */
function getLobbyListForClients() {
    return Object.values(lobbies).map(lobby => ({
        id:        lobby.id,
        name:      lobby.name,
        players:   Object.keys(lobby.players).length,
        max:       MAX_PLAYERS,
        createdAt: lobby.createdAt,
        private:   lobby.isPrivate,
    }));
}

/**
 * Emette la lista lobby aggiornata a TUTTI i client connessi
 * al socket principale (non ai namespace delle lobby).
 */
function broadcastLobbyList() {
    io.emit("lobbyList", getLobbyListForClients());
}

/**
 * Crea una nuova lobby, configura il suo namespace Socket.IO
 * e registra tutti gli handler degli eventi di gameplay.
 *
 * @param {string}      lobbyId   - ID univoco (8 char hex)
 * @param {string}      lobbyName - Nome visualizzato
 * @param {string|null} password  - Password per lobby private (null = pubblica)
 * @returns {Object} L'oggetto lobby creato
 */
function createLobby(lobbyId, lobbyName, password) {
    const allObstacles   = generateMapObstacles();
    const solidObstacles = allObstacles.filter(o => o.type !== "cespuglio");

    const lobby = {
        id:           lobbyId,
        name:         lobbyName,
        isPrivate:    !!password,
        password:     password || null,
        players:      {},   // { [socketId]: playerObject }
        rejoinTokens: {},   // { [token]: { nickname, kills, deaths, expireAt } }
        bullets:      [],   // proiettili attivi
        allObstacles,
        solidObstacles,
        leaderboard:  {},   // { [socketId]: { nickname, kills, deaths } }
        nextBulletId: 0,
        lastTickTime: Date.now(),
        createdAt:    Date.now(),
        namespace:    null, // verrà impostato sotto
        cleanupTimer: null, // timer per rimozione lobby vuota
    };

    // ── Namespace Socket.IO dedicato a questa lobby ──────────────
    const namespace = io.of("/lobby/" + lobbyId);
    lobby.namespace = namespace;

    namespace.on("connection", (socket) => {

        // Se qualcuno si (ri)connette, cancella il cleanup pianificato
        if (lobby.cleanupTimer) {
            clearTimeout(lobby.cleanupTimer);
            lobby.cleanupTimer = null;
        }

        // ── join ─────────────────────────────────────────────────
        // Il client emette "join" subito dopo la connessione,
        // opzionalmente con un token per il rejoin.
        socket.on("join", (data) => {
            // Ignora se il socket ha già un player assegnato
            if (socket.playerToken) return;

            let nickname, kills = 0, deaths = 0;
            const incomingToken = data && data.token;

            // Prova rejoin con token valido
            if (incomingToken && lobby.rejoinTokens[incomingToken] &&
                Date.now() < lobby.rejoinTokens[incomingToken].expireAt) {

                const savedData = lobby.rejoinTokens[incomingToken];
                nickname = savedData.nickname;
                kills    = savedData.kills;
                deaths   = savedData.deaths;
                delete lobby.rejoinTokens[incomingToken]; // token usato: rimuovi
                console.log(`[${lobbyId}] rejoin: ${nickname}`);

            } else {
                // Nuovo giocatore: controlla capienza
                if (Object.keys(lobby.players).length >= MAX_PLAYERS) {
                    socket.emit("lobbyFull");
                    socket.disconnect();
                    return;
                }
                nickname = generateNickname();
            }

            // Assegna token al socket per il futuro rejoin
            const newToken = crypto.randomBytes(16).toString("hex");
            socket.playerToken = newToken;
            socket.nickname    = nickname;

            // Crea l'oggetto player (inizialmente "morto" — deve fare spawn)
            lobby.players[socket.id] = {
                pos:        findSafeSpawnPosition(lobby),
                dir:        { x: 0, y: 0 },  // direzione di movimento corrente
                angle:      0,                 // angolo di mira (radianti)
                hp:         PLAYER_MAX_HP,
                isDead:     true,              // parte morto finché non fa "spawn"
                nickname,
                lastShotTime: 0,
                hitFlash:   false,             // lampeggio quando colpito
                lastHitTime: 0,
                weapon:     "gun",
                punchCount: 0,                 // contatore pugni (per animazione mani)
            };

            // Inizializza voce in classifica
            lobby.leaderboard[socket.id] = { nickname, kills, deaths };

            // Invia al client i dati iniziali della partita
            socket.emit("init", {
                id:          socket.id,
                token:       newToken,
                map:         MAP_SIZE,
                ostacoli:    lobby.allObstacles,
                lobbyId,
                lobbyName:   lobby.name,
                nickname,
                playerCount: Object.keys(lobby.players).length,
                maxPlayers:  MAX_PLAYERS,
            });

            broadcastLobbyList();
        });

        // ── spawn ─────────────────────────────────────────────────
        // Il client chiede di entrare in gioco dopo aver visto il menu.
        socket.on("spawn", () => {
            const player = lobby.players[socket.id];
            if (!player) return;

            player.pos    = findSafeSpawnPosition(lobby);
            player.hp     = PLAYER_MAX_HP;
            player.isDead = false;
            player.dir    = { x: 0, y: 0 };
            player.angle  = 0;
            player.ammo   = { gun: MAX_AMMO.gun, pistol: MAX_AMMO.pistol };
        });

        // ── input ─────────────────────────────────────────────────
        // Il client invia i tasti direzionali premuti ogni volta che cambiano.
        socket.on("input", (inputData) => {
            const player = lobby.players[socket.id];
            if (!player || player.isDead || typeof inputData !== "object" || !inputData) return;

            player.dir = {
                x: (inputData.right ? 1 : 0) - (inputData.left ? 1 : 0),
                y: (inputData.down  ? 1 : 0) - (inputData.up   ? 1 : 0),
            };
        });

        // ── aim ───────────────────────────────────────────────────
        // Il client invia l'angolo di mira (in radianti) quando muove il mouse.
        socket.on("aim", (angle) => {
            const player = lobby.players[socket.id];
            if (!player || player.isDead || typeof angle !== "number" || !isFinite(angle)) return;
            player.angle = angle;
        });

        // ── setWeapon ─────────────────────────────────────────────
        // Il client cambia arma (1/2/3 oppure bottoni touch).
        socket.on("setWeapon", (weaponName) => {
            const player = lobby.players[socket.id];
            if (!player || !["gun", "pistol", "fists"].includes(weaponName)) return;

            // Se si cambia arma durante una ricarica, la ricarica viene annullata
            if (player.isReloading && player.weapon !== weaponName) {
                player.isReloading = false;
                if (player.reloadTimer) {
                    clearTimeout(player.reloadTimer);
                    player.reloadTimer = null;
                }
                socket.emit("reloadCancelled", { weapon: player.weapon });
            }

            player.weapon = weaponName;
        });

        // ── reload ────────────────────────────────────────────────
        // Il client richiede una ricarica manuale.
        socket.on("reload", () => {
            const player = lobby.players[socket.id];
            if (!player || player.isDead || player.weapon === "fists") return;

            // Inizializza munizioni se non presenti (compatibilità)
            if (!player.ammo) player.ammo = { gun: MAX_AMMO.gun, pistol: MAX_AMMO.pistol };

            // Non ricaricare se già a piena capienza o già in ricarica
            if (player.ammo[player.weapon] >= MAX_AMMO[player.weapon]) return;
            if (player.isReloading) return;

            player.isReloading = true;
            const weaponBeingReloaded = player.weapon;

            // Notifica il client per mostrare la barra di ricarica
            socket.emit("reloadStart", {
                weapon:   weaponBeingReloaded,
                duration: RELOAD_TIME_MS[weaponBeingReloaded],
            });

            // Completa la ricarica dopo il tempo previsto
            player.reloadTimer = setTimeout(() => {
                if (!player || !lobby.players[socket.id]) return;
                // Completa solo se il giocatore ha ancora la stessa arma
                if (player.weapon !== weaponBeingReloaded) return;

                player.ammo[weaponBeingReloaded] = MAX_AMMO[weaponBeingReloaded];
                player.isReloading = false;
                player.reloadTimer = null;
                socket.emit("reloadDone", { weapon: weaponBeingReloaded });
            }, RELOAD_TIME_MS[weaponBeingReloaded]);
        });

        // ── selfKill ──────────────────────────────────────────────
        // Il client ha tenuto ESC premuto per 1.5s → suicidio volontario
        // per tornare al menu di spawn.
        socket.on("selfKill", () => {
            const player = lobby.players[socket.id];
            if (!player || player.isDead) return;

            player.hp     = 0;
            player.isDead = true;
            player.dir    = { x: 0, y: 0 };
            if (lobby.leaderboard[socket.id]) {
                lobby.leaderboard[socket.id].deaths++;
            }
        });

        // ── shoot ─────────────────────────────────────────────────
        // Il client spara. Gestisce sia armi a fuoco (crea proiettile)
        // che attacco corpo-a-corpo (hit scan immediato).
        socket.on("shoot", (data) => {
            const player = lobby.players[socket.id];
            if (!player || player.isDead || !data || typeof data.dir !== "object") return;

            // Controlla cooldown
            const now = Date.now();
            const cooldown = FIRE_COOLDOWN_MS[player.weapon] ?? 100;
            if (now - player.lastShotTime < cooldown) return;
            player.lastShotTime = now;

            // ── fists (corpo a corpo) ─────────────────────────
            if (player.weapon === "fists") {
                player.punchCount = (player.punchCount || 0) + 1;
                player.punchFlash = true;
                // Alterna mano destra (1) e sinistra (0)
                player.punchHand = player.punchCount % 2;

                const attackRange  = 60; // px di portata del pugno
                const attackAngle  = player.angle;

                for (const targetId in lobby.players) {
                    if (targetId === socket.id) continue; // non colpire sé stessi
                    const target = lobby.players[targetId];
                    if (target.isDead) continue;

                    const dx   = target.pos.x - player.pos.x;
                    const dy   = target.pos.y - player.pos.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > attackRange) continue;

                    // Verifica che il bersaglio sia nel cono frontale (±90°)
                    let angleDiff = Math.atan2(dy, dx) - attackAngle;
                    while (angleDiff >  Math.PI) angleDiff -= 2 * Math.PI;
                    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                    if (Math.abs(angleDiff) > Math.PI / 2) continue;

                    // Infliggi danno
                    target.hp -= DAMAGE_BY_WEAPON.fists;
                    target.hitFlash  = true;
                    target.lastHitTime = now;

                    if (target.hp <= 0) {
                        target.hp     = 0;
                        target.isDead = true;
                        target.dir    = { x: 0, y: 0 };
                        if (lobby.leaderboard[targetId])  lobby.leaderboard[targetId].deaths++;
                        if (lobby.leaderboard[socket.id]) lobby.leaderboard[socket.id].kills++;
                        lobby.namespace.to(socket.id).emit("killConfirm", { victim: target.nickname });
                    }
                }
                return; // corpo a corpo: nessun proiettile da creare
            }

            // ── ARMI A FUOCO ─────────────────────────────────────
            if (!player.ammo) player.ammo = { gun: MAX_AMMO.gun, pistol: MAX_AMMO.pistol };
            if (player.ammo[player.weapon] <= 0) return; // a secco
            if (player.isReloading) return;              // sta ricaricando

            const { dir, tipOffset } = data;
            if (typeof dir.x !== "number" || typeof dir.y !== "number") return;

            // Normalizza la direzione del proiettile
            const dirLength = Math.hypot(dir.x, dir.y);
            if (!dirLength || !isFinite(dirLength)) return;
            const normalizedDirX = dir.x / dirLength;
            const normalizedDirY = dir.y / dirLength;

            // Offset dalla canna dell'arma (già calcolato dal client)
            const offsetX = (tipOffset && Math.abs(tipOffset.x) < 100) ? tipOffset.x : 0;
            const offsetY = (tipOffset && Math.abs(tipOffset.y) < 100) ? tipOffset.y : 0;

            player.ammo[player.weapon]--;

            // Aggiunge il proiettile alla lista della lobby
            lobby.bullets.push({
                id:        lobby.nextBulletId++,
                pos:       { x: player.pos.x + offsetX, y: player.pos.y + offsetY },
                dir:       { x: normalizedDirX, y: normalizedDirY },
                ownerId:   socket.id,
                weapon:    player.weapon,
                spawnTime: now,
            });
        });

        // ── disconnect ────────────────────────────────────────────
        // Gestisce la disconnessione: salva token di rejoin,
        // pulisce stato, e schedula la rimozione della lobby se vuota.
        socket.on("disconnect", () => {
            console.log(`[${lobbyId}] disconnesso: ${socket.nickname || socket.id}`);
            const leaderboardEntry = lobby.leaderboard[socket.id];

            // Salva dati per un eventuale rejoin (token valido 5 minuti)
            if (socket.playerToken) {
                lobby.rejoinTokens[socket.playerToken] = {
                    nickname: socket.nickname,
                    kills:    leaderboardEntry ? leaderboardEntry.kills  : 0,
                    deaths:   leaderboardEntry ? leaderboardEntry.deaths : 0,
                    expireAt: Date.now() + REJOIN_TOKEN_TTL,
                };
                usedNicknames.delete(socket.nickname);
            }

            // Rimuove il player dalla lobby
            delete lobby.players[socket.id];
            delete lobby.leaderboard[socket.id];
            lobby.bullets = lobby.bullets.filter(b => b.ownerId !== socket.id);

            // Notifica gli altri giocatori
            namespace.emit("playerLeft", {
                id:       socket.id,
                nickname: socket.nickname || "?",
            });

            broadcastLobbyList();

            // Se la lobby è rimasta vuota, pianifica la sua rimozione dopo 5 minuti.
            // Se qualcuno si riconnette prima, il cleanupTimer viene cancellato nel "connection".
            if (Object.keys(lobby.players).length === 0) {
                lobby.cleanupTimer = setTimeout(() => {
                    if (lobbies[lobbyId] && Object.keys(lobby.players).length === 0) {
                        // Libera i nickname dei token non ancora scaduti
                        for (const tokenData of Object.values(lobby.rejoinTokens)) {
                            usedNicknames.delete(tokenData.nickname);
                        }
                        namespace.disconnectSockets(true);
                        io._nsps.delete("/lobby/" + lobbyId);
                        delete lobbies[lobbyId];
                        console.log(`Lobby rimossa (vuota): ${lobbyId}`);
                        broadcastLobbyList();
                    }
                }, REJOIN_TOKEN_TTL);
            }
        });
    }); // fine namespace.on("connection")

    lobbies[lobbyId] = lobby;
    broadcastLobbyList();
    console.log(`Lobby creata: ${lobbyId} ("${lobbyName}")`);
    return lobby;
}

// ============================================================
// SOCKET PRINCIPALE — selezione e creazione lobby
// Il namespace di default "/" gestisce solo la lista lobby,
// la creazione e il join. Il gameplay avviene nei namespace dedicati.
// ============================================================
io.on("connection", (socket) => {

    // Invia subito la lista lobby corrente al client appena connesso
    socket.emit("lobbyList", getLobbyListForClients());

    // ── createLobby ───────────────────────────────────────────
    socket.on("createLobby", (data) => {
        // Sanifica il nome: max 30 caratteri, trimmed
        const rawName  = (data && typeof data.name === "string" && data.name.trim())
            ? data.name.trim().slice(0, 30)
            : "";
        const lobbyName = rawName || "Lobby " + Math.floor(Math.random() * 9000 + 1000);

        // Sanifica la password
        const rawPassword  = (data && typeof data.password === "string" && data.password.trim())
            ? data.password.trim().slice(0, 30)
            : null;
        const isPrivateLobby = !!(data && data.private && rawPassword);

        // Controlla limite di lobby attive
        if (Object.keys(lobbies).length >= MAX_LOBBIES) {
            socket.emit("lobbyError", "Server is full. Too many active lobbies, try again later.");
            return;
        }

        // Nomi devono essere unici (solo se il nome è stato specificato)
        if (rawName) {
            const nameAlreadyTaken = Object.values(lobbies)
                .some(l => l.name.toLowerCase() === lobbyName.toLowerCase());
            if (nameAlreadyTaken) {
                socket.emit("lobbyError", `A lobby named "${lobbyName}" already exists.`);
                return;
            }
        }

        const newLobbyId = crypto.randomBytes(4).toString("hex");
        createLobby(newLobbyId, lobbyName, isPrivateLobby ? rawPassword : null);
        socket.emit("lobbyCreated", { lobbyId: newLobbyId, lobbyName });
    });

    // ── joinLobby ─────────────────────────────────────────────
    socket.on("joinLobby", (data) => {
        const lobbyId = data && data.lobbyId;
        const password = data && data.password;

        if (!lobbyId || !lobbies[lobbyId]) {
            socket.emit("lobbyError", "Lobby not found.");
            return;
        }

        const lobby = lobbies[lobbyId];

        if (Object.keys(lobby.players).length >= MAX_PLAYERS) {
            socket.emit("lobbyError", "Lobby full.");
            return;
        }

        // Verifica password per lobby private
        if (lobby.isPrivate) {
            if (!password || password !== lobby.password) {
                socket.emit("lobbyError", "Wrong password.");
                return;
            }
        }

        socket.emit("lobbyJoinOk", { lobbyId, lobbyName: lobby.name });
    });
});

// ============================================================
// GAME LOOP — ~60 tick/secondo
// Aggiorna: movimento, rigenerazione HP, proiettili, broadcast.
// ============================================================
setInterval(() => {
    const now = Date.now();

    for (const lobbyId in lobbies) {
        const lobby = lobbies[lobbyId];
        if (Object.keys(lobby.players).length === 0) continue; // skip lobby vuote

        // Delta time in secondi (clamped a 50ms per evitare "salti" dopo lag)
        const deltaTime = Math.min((now - lobby.lastTickTime) / 1000, 0.05);
        lobby.lastTickTime = now;

        // Reset del flag hitFlash ad ogni tick (lampeggio dura 1 frame)
        for (const id in lobby.players) {
            lobby.players[id].hitFlash = false;
        }

        // ── Movimento giocatori ───────────────────────────────────
        for (const id in lobby.players) {
            const player = lobby.players[id];
            if (player.isDead) continue;

            const dirLength = Math.hypot(player.dir.x, player.dir.y);
            if (dirLength > 0) {
                // Normalizza la direzione per velocità costante in diagonale
                player.pos.x += (player.dir.x / dirLength) * PLAYER_SPEED * deltaTime;
                player.pos.y += (player.dir.y / dirLength) * PLAYER_SPEED * deltaTime;
            }
            resolvePlayerCollisions(player, lobby.solidObstacles);
        }

        // ── Rigenerazione HP ──────────────────────────────────────
        // Inizia a rigenerare 4 secondi dopo l'ultimo colpo subito.
        for (const id in lobby.players) {
            const player = lobby.players[id];
            if (player.isDead || player.hp >= PLAYER_MAX_HP) continue;
            if (now - player.lastHitTime >= 4000) {
                player.hp = Math.min(PLAYER_MAX_HP, player.hp + 8 * deltaTime);
            }
        }

        // ── Aggiornamento proiettili ──────────────────────────────
        // Itera al contrario per poter rimuovere elementi in sicurezza
        for (let i = lobby.bullets.length - 1; i >= 0; i--) {
            const bullet = lobby.bullets[i];

            // Muovi il proiettile
            bullet.pos.x += bullet.dir.x * BULLET_SPEED * deltaTime;
            bullet.pos.y += bullet.dir.y * BULLET_SPEED * deltaTime;

            // Rimuovi se supera il tempo di vita
            const bulletAgeSeconds = (now - bullet.spawnTime) / 1000;
            if (bulletAgeSeconds >= BULLET_LIFETIME_SEC) {
                lobby.bullets.splice(i, 1);
                continue;
            }

            // Rimuovi se colpisce un ostacolo solido
            let hitObstacle = false;
            for (const obstacle of lobby.solidObstacles) {
                if (Math.hypot(bullet.pos.x - obstacle.x, bullet.pos.y - obstacle.y) < obstacle.rCollisione + 4) {
                    hitObstacle = true;
                    break;
                }
            }
            if (hitObstacle) {
                lobby.bullets.splice(i, 1);
                continue;
            }

            // Controlla collisione con giocatori
            let hitPlayer = false;
            for (const targetId in lobby.players) {
                if (targetId === bullet.ownerId) continue; // non colpire il proprietario
                const target = lobby.players[targetId];
                if (target.isDead) continue;

                const distToPlayer = Math.hypot(bullet.pos.x - target.pos.x, bullet.pos.y - target.pos.y);
                if (distToPlayer < PLAYER_RADIUS + 6) {
                    // Colpito!
                    target.hp         -= DAMAGE_BY_WEAPON[bullet.weapon] ?? 20;
                    target.hitFlash    = true;
                    target.lastHitTime = now;
                    hitPlayer = true;

                    if (target.hp <= 0) {
                        target.hp     = 0;
                        target.isDead = true;
                        target.dir    = { x: 0, y: 0 };
                        if (lobby.leaderboard[targetId])    lobby.leaderboard[targetId].deaths++;
                        if (lobby.leaderboard[bullet.ownerId]) lobby.leaderboard[bullet.ownerId].kills++;
                        lobby.namespace.to(bullet.ownerId).emit("killConfirm", { victim: target.nickname });
                    }
                    break; // un proiettile colpisce al massimo un giocatore
                }
            }
            if (hitPlayer) {
                lobby.bullets.splice(i, 1);
            }
        }

        // ── Broadcast dello stato a tutti i client della lobby ────
        const playersStateSnapshot = {};
        for (const id in lobby.players) {
            const player = lobby.players[id];
            playersStateSnapshot[id] = {
                pos:        { x: Math.round(player.pos.x), y: Math.round(player.pos.y) },
                hp:         player.hp,
                morto:      player.isDead,       // "morto" mantenuto per compatibilità client
                nickname:   player.nickname,
                angle:      player.angle,
                weapon:     player.weapon,
                hitFlash:   player.hitFlash || undefined,
                punchCount: player.punchCount || 0,
                punchHand:  player.punchHand  || 0,
                ammo:       player.ammo || { gun: MAX_AMMO.gun, pistol: MAX_AMMO.pistol },
            };
        }

        lobby.namespace.emit("state", {
            players:     playersStateSnapshot,
            proiettili:  lobby.bullets,          // "proiettili" mantenuto per compatibilità client
            lb:          getLeaderboard(lobby),
            playerCount: Object.keys(lobby.players).length,
            maxPlayers:  MAX_PLAYERS,
        });
    }
}, 1000 / 60); // ~60 tick al secondo

// ============================================================
// AVVIO SERVER
// ============================================================
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log("Server avviato sulla porta", PORT);
});