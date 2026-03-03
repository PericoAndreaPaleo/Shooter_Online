import kaboom from "./lib/kaboom.mjs";

kaboom({
    width: window.innerWidth,
    height: window.innerHeight,
    clearColor: [0.16, 0.55, 0.82, 1],
    preventPauseOnBlur: true,
});

document.body.style.cursor = "crosshair";
const canvas = document.querySelector("canvas");
canvas.style.cursor = "crosshair";


const CAM_ZOOM = 1;
const socket = io();

let myId = null;
let mapSize = { width: 5000, height: 5000 };
let ostacoliSopra = [];
let cameraInizializzata = false;
let kaboomPronto = false;
let inMenu = true; // true = mostro menu, false = in gioco

const players = {};
const bulletSprites = {};
const input = { left: false, right: false, up: false, down: false };
let prevInput = "";

// =================
// UI: schermata di caricamento e menu
// =================
const uiLayer = [];

function creaLoadingScreen() {
    const bg = add([
        rect(width(), height()),
        pos(0, 0),
        color(rgb(10, 15, 8)),
        fixed(), z(200),
    ]);
    const t = add([
        text("Connessione...", { size: 28 }),
        pos(width() / 2, height() / 2),
        anchor("center"),
        color(rgb(0, 200, 80)),
        fixed(), z(201),
    ]);
    return [bg, t];
}

function distruggiUI() {
    nascondiBottoneHTML();
    for (const o of uiLayer) destroy(o);
    uiLayer.length = 0;
}

function mostraMenu(titolo, sottotitolo) {
    distruggiUI();
    inMenu = true;

    // Sfondo scuro semitrasparente
    uiLayer.push(add([
        rect(width(), height()),
        pos(0, 0),
        color(rgb(5, 10, 5)),
        opacity(0.85),
        fixed(), z(200),
    ]));

    // Titolo gioco
    uiLayer.push(add([
        text("SHOOTER ONLINE", { size: 52 }),
        pos(width() / 2, height() / 2 - 120),
        anchor("center"),
        color(rgb(0, 255, 100)),
        fixed(), z(201),
    ]));

    // Sottotitolo (es. "Sei morto!")
    if (sottotitolo) {
        uiLayer.push(add([
            text(sottotitolo, { size: 28 }),
            pos(width() / 2, height() / 2 - 50),
            anchor("center"),
            color(rgb(220, 80, 80)),
            fixed(), z(201),
        ]));
    }

    mostraBottoneHTML();
}

// Handler nativo DOM per il bottone GIOCA — kaboom richiede focus al canvas
// e ignora il primo click, quindi usiamo direttamente window
// Bottone GIOCA come elemento HTML sovrapposto al canvas — zero problemi di focus/coordinate
let htmlBtn = null;

function mostraBottoneHTML() {
    if (htmlBtn) return;
    htmlBtn = document.createElement("button");
    htmlBtn.textContent = "GIOCA";
    htmlBtn.style.cssText = `
        position: fixed;
        left: 50%; top: 50%;
        transform: translate(-50%, 10px);
        width: 200px; height: 60px;
        background: rgb(0,180,70); color: white;
        font-size: 30px; font-weight: bold;
        border: none; border-radius: 6px;
        cursor: crosshair; z-index: 9999;
        font-family: monospace;
        letter-spacing: 2px;
    `;
    htmlBtn.addEventListener("click", () => {
        nascondiBottoneHTML();
        distruggiUI();
        socket.emit("spawn");
    });
    document.body.appendChild(htmlBtn);
}

function nascondiBottoneHTML() {
    if (htmlBtn) { htmlBtn.remove(); htmlBtn = null; }
}

// Avvio con loading screen
const loadingObjs = creaLoadingScreen();
uiLayer.push(...loadingObjs);

// =================
// INPUT
// =================
// Input via DOM nativo — funziona indipendentemente dal focus del canvas
const keyMap = { "a": "left", "d": "right", "w": "up", "s": "down" };
window.addEventListener("keydown", (e) => {
    if (inMenu) return;
    const dir = keyMap[e.key.toLowerCase()];
    if (dir && !input[dir]) {
        input[dir] = true;
        socket.emit("input", input);
        prevInput = JSON.stringify(input);
    }
});
window.addEventListener("keyup", (e) => {
    if (inMenu) return;
    const dir = keyMap[e.key.toLowerCase()];
    if (dir && input[dir]) {
        input[dir] = false;
        socket.emit("input", input);
        prevInput = JSON.stringify(input);
    }
});

onUpdate(() => {
    // Primo frame: kaboom è pronto
    if (!kaboomPronto) {
        kaboomPronto = true;
        // Se già connesso mostra menu, altrimenti aspetta init
        if (myId) mostraMenu();
    }

    if (inMenu || !myId || !players[myId]) return;

    if (!players[myId].morto) {
        camPos(players[myId].sprite.pos.x, players[myId].sprite.pos.y);
    }
    camScale(CAM_ZOOM);

    // Nascondo label/hp se il player (chiunque) è sotto cespuglio o albero
    for (const id in players) {
        const p = players[id];
        if (p.morto) continue;

        const sprite = p.sprite;
        let nascosto = false;
        for (const o of ostacoliSopra) {
            if (Math.hypot(sprite.pos.x - o.x, sprite.pos.y - o.y) < o.r) {
                nascosto = true;
                break;
            }
        }
        if (p.labelObj) p.labelObj.hidden = nascosto;
        if (p.hpBar)    p.hpBar.hidden    = nascosto;
    }
});

// =================
// SPARO
// =================
function shoot() {
    if (!kaboomPronto || inMenu || !myId || !players[myId] || players[myId].morto) return;
    const me = players[myId].sprite;
    const mworld = toWorld(mousePos());
    socket.emit("shoot", { dir: { x: mworld.x - me.pos.x, y: mworld.y - me.pos.y } });
}
onClick(shoot);

// =================
// INIT
// =================
socket.on("init", ({ id, map, ostacoli }) => {
    // Ricarica automatica al primo caricamento per evitare bug di stato iniziale
    if (!sessionStorage.getItem("reloaded")) {
        sessionStorage.setItem("reloaded", "1");
        location.reload();
        return;
    }
    myId = id;
    mapSize = map;
    ostacoliSopra = ostacoli.filter(o => o.type === "cespuglio" || o.type === "albero");

    // Costruisco la mappa
    const spiaggia = 80; // larghezza fascia spiaggia in pixel

    // Mare (sfondo azzurro, oltre i bordi della mappa)
    add([
        pos(-5000, -5000),
        rect(map.width + 10000, map.height + 10000),
        color(rgb(40, 140, 210)),
        z(-12),
    ]);

    // Spiaggia (fascia gialla attorno alla mappa giocabile)
    add([
        pos(-spiaggia, -spiaggia),
        rect(map.width + spiaggia * 2, map.height + spiaggia * 2),
        color(rgb(230, 200, 100)),
        z(-11),
    ]);

    // Terreno interno (erba verde)
    add([
        pos(0, 0),
        rect(map.width, map.height),
        color(rgb(60, 120, 40)),
        z(-10),
    ]);

    for (const o of ostacoli) {
        if (o.type === "roccia") {
            add([
                pos(o.x, o.y), anchor("center"),
                circle(o.r),
                color(rgb(110, 110, 110)),
                outline(3, rgb(60, 60, 60)),
                z(2),
            ]);
        }
    }
    for (const o of ostacoli) {
        if (o.type === "albero") {
            add([
                pos(o.x, o.y), anchor("center"),
                circle(o.r),
                color(rgb(20, 75, 15)),
                outline(4, rgb(10, 45, 8)),
                z(2),
            ]);
            add([
                pos(o.x, o.y), anchor("center"),
                circle(o.rCollisione),
                color(rgb(80, 50, 20)),
                z(2),
            ]);
        }
    }
    for (const o of ostacoli) {
        if (o.type === "cespuglio") {
            add([
                pos(o.x, o.y), anchor("center"),
                circle(o.r),
                color(rgb(100, 200, 40)),
                outline(2, rgb(60, 140, 20)),
                z(2),
            ]);
        }
    }

    // Mostro sempre il menu (kaboom è sicuramente pronto, init arriva dopo la connessione)
    mostraMenu();
});

// =================
// STATO DAL SERVER
// =================
socket.on("state", (state) => {

    // Calibro camera al primo stato ricevuto
    if (!cameraInizializzata && myId && state.players[myId] && !inMenu) {
        const s = state.players[myId];
        camPos(s.pos.x, s.pos.y);
        camScale(CAM_ZOOM);
        cameraInizializzata = true;
    }

    // Rimuovo player disconnessi
    for (const id in players) {
        if (!state.players[id]) {
            if (players[id].labelObj) destroy(players[id].labelObj);
            if (players[id].hpBar)    destroy(players[id].hpBar);
            destroy(players[id].sprite);
            delete players[id];
        }
    }

    for (const id in state.players) {
        const s = state.players[id];
        const isMe = (id === myId);

        // Se sono io e sono morto, mostro menu morte
        if (isMe && s.morto && players[id] && !players[id].morto && !inMenu) {
            mostraMenu("Sei morto!", "Rispawnerai automaticamente tra 3 secondi...");
        }

        if (!players[id]) {
            if (s.morto) continue; // non creo sprite per player morti non ancora spawnati

            // Creo sprite (player vivo, prima apparizione)
            const sprite = add([
                pos(s.pos.x, s.pos.y),
                anchor("center"),
                circle(20),
                color(isMe ? rgb(0, 255, 100) : rgb(220, 80, 80)),
                z(1),
            ]);
            const labelObj = add([
                pos(s.pos.x, s.pos.y - 30),
                anchor("center"),
                text(isMe ? "TU" : id.slice(0, 4), { size: 12 }),
                color(isMe ? rgb(0, 255, 100) : rgb(220, 80, 80)),
                z(3),
            ]);
            const hpBar = add([
                pos(s.pos.x - 25, s.pos.y - 42),
                rect(50 * (s.hp / 100), 6),
                color(isMe ? rgb(0, 220, 0) : rgb(220, 0, 0)),
                z(3),
            ]);
            players[id] = { sprite, labelObj, hpBar, morto: s.morto };

            // Se sono io e ho appena spawnato, entro in gioco
            if (isMe) {
                distruggiUI();
                inMenu = false;
                cameraInizializzata = false;
                prevInput = "";
                socket.emit("input", input); // forza invio immediato
            }

        } else {
            const lerp = isMe ? 0.8 : 0.3;
            const p = players[id];
            const eraMorto = p.morto;
            p.morto = s.morto;

            p.sprite.hidden = s.morto;
            // label e hpBar: se morto nascondo; altrimenti ci pensa onUpdate (alberi/cespugli)
            if (s.morto) {
                p.labelObj.hidden = true;
                p.hpBar.hidden    = true;
            }

            if (!s.morto) {
                // Se è appena respawnato e sono io, chiudo il menu
                if (isMe && eraMorto && !s.morto) {
                    distruggiUI();
                    inMenu = false;
                    cameraInizializzata = false;
                    prevInput = "";
                    canvas.dispatchEvent(new MouseEvent("mousemove", {
                        bubbles: true, cancelable: true,
                        clientX: window.innerWidth / 2,
                        clientY: window.innerHeight / 2
                    }));
                }

                p.sprite.pos.x += (s.pos.x - p.sprite.pos.x) * lerp;
                p.sprite.pos.y += (s.pos.y - p.sprite.pos.y) * lerp;

                p.labelObj.pos.x += (s.pos.x - p.labelObj.pos.x) * lerp;
                p.labelObj.pos.y += (s.pos.y - 30 - p.labelObj.pos.y) * lerp;

                p.hpBar.pos.x = p.sprite.pos.x - 25;
                p.hpBar.pos.y = p.sprite.pos.y - 42;
                p.hpBar.width = 50 * (s.hp / 100);
            }
        }
    }

    // Proiettili
    const serverBulletIds = new Set(state.proiettili.map(b => b.id));
    for (const id in bulletSprites) {
        if (!serverBulletIds.has(Number(id))) {
            destroy(bulletSprites[id]);
            delete bulletSprites[id];
        }
    }
    for (const b of state.proiettili) {
        if (!bulletSprites[b.id]) {
            bulletSprites[b.id] = add([
                pos(b.pos.x, b.pos.y),
                anchor("center"),
                circle(6),
                color(rgb(255, 200, 0)),
                z(1),
            ]);
        } else {
            bulletSprites[b.id].pos = vec2(b.pos.x, b.pos.y);
        }
    }
});