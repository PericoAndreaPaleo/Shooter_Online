// ============================================================
// battlepass.js -- Season Pass cosmetics
//
// Ogni 5 livelli si sblocca un reward cosmetico (colore player
// o colore arma). Al livello 50 si sbloccano entrambi in
// modalita' rainbow animata.
//
// I reward selezionati vengono salvati in localStorage e letti
// da weapons.js / game.js per applicare i colori.
// ============================================================

import { state, calcolaLetterbox } from "./state.js";

const PHP_BASE = "/php";

/**
 * Salva le skin selezionate nel DB via AJAX.
 * Chiamato ogni volta che l'utente equipa/desequipa una skin.
 * Non blocca la UI (fire-and-forget con catch silenzioso).
 */
function saveCosmeticsToServer() {
    const token = localStorage.getItem("auth_token");
    if (!token) return; // ospite: non salvare
    fetch(`${PHP_BASE}/salva_cosmetics.php`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            token,
            player_color_id: localStorage.getItem("bp_player_color") || "",
            weapon_color_id: localStorage.getItem("bp_weapon_color") || "",
        }),
    }).catch(() => {}); // ignora errori di rete
}


// ============================================================
// DEFINIZIONE REWARDS
// ============================================================

/**
 * Ogni reward ha:
 *   level       - livello richiesto
 *   type        - "player" | "weapon" | "both"
 *   id          - identificatore unico per localStorage
 *   label       - nome mostrato nella UI
 *   color       - valore CSS del colore (null = rainbow)
 *   rainbow     - true se e' animato RGB
 *   preview     - colore hex per l'anteprima nel pass (quando rainbow = colore gradient)
 */
export const PASS_REWARDS = [
    {
        level: 5,  type: "player", id: "p_red",
        label: "Crimson",
        color: "rgb(220,50,50)",  rainbow: false,
        preview: "#dc3232",
    },
    {
        level: 10, type: "weapon", id: "w_blue",
        label: "Cobalt",
        color: "rgb(40,120,255)", rainbow: false,
        preview: "#2878ff",
    },
    {
        level: 15, type: "player", id: "p_purple",
        label: "Phantom",
        color: "rgb(160,50,240)", rainbow: false,
        preview: "#a032f0",
    },
    {
        level: 20, type: "weapon", id: "w_orange",
        label: "Ember",
        color: "rgb(255,130,20)", rainbow: false,
        preview: "#ff8214",
    },
    {
        level: 25, type: "player", id: "p_neon",
        label: "Neon",
        color: "rgb(0,255,100)",  rainbow: false,
        preview: "#00ff64",
    },
    {
        level: 30, type: "weapon", id: "w_gold",
        label: "Gilded",
        color: "rgb(255,210,0)",  rainbow: false,
        preview: "#ffd200",
    },
    {
        level: 35, type: "player", id: "p_ice",
        label: "Glacial",
        color: "rgb(130,220,255)", rainbow: false,
        preview: "#82dcff",
    },
    {
        level: 40, type: "weapon", id: "w_pink",
        label: "Sakura",
        color: "rgb(255,100,180)", rainbow: false,
        preview: "#ff64b4",
    },
    {
        level: 45, type: "player", id: "p_rainbow",
        label: "Prism",
        color: null, rainbow: true,
        preview: "rainbow",
    },
    {
        level: 50, type: "both",   id: "all_rainbow",
        label: "LEGENDARY",
        color: null, rainbow: true,
        preview: "rainbow",
    },
];

// ============================================================
// ACCESSO ALLO STATO COSMETICO (localStorage)
// ============================================================

const LS_PLAYER = "bp_player_color";
const LS_WEAPON = "bp_weapon_color";

/** Restituisce il colore corrente del player (id reward o null = default) */
export function getPlayerColorId()  { return localStorage.getItem(LS_PLAYER) || null; }
/** Restituisce il colore corrente dell'arma (id reward o null = default) */
export function getWeaponColorId()  { return localStorage.getItem(LS_WEAPON) || null; }

/** Salva la scelta del giocatore */
export function setPlayerColorId(id) { localStorage.setItem(LS_PLAYER, id || ""); }
export function setWeaponColorId(id) { localStorage.setItem(LS_WEAPON, id || ""); }

/**
 * Dato un reward id, restituisce l'oggetto reward.
 * Restituisce null se non trovato.
 */
export function getReward(id) {
    return PASS_REWARDS.find(r => r.id === id) || null;
}

/**
 * Restituisce true se il reward e' sbloccato dal livello corrente.
 */
export function isUnlocked(reward) {
    return (state.accountLivello || 1) >= reward.level;
}

// ============================================================
// CALCOLO COLORE RAINBOW (usato da weapons.js e game.js)
// ============================================================

/**
 * Calcola il colore HSL animato del rainbow al timestamp corrente.
 * @param {number} offset - offset in gradi per sfalsare player vs arma
 * @returns {string} stringa "rgb(r,g,b)"
 */
export function getRainbowColor(offset = 0) {
    const t = (Date.now() / 2000 + offset / 360) % 1; // ciclo 2 secondi
    const hue = Math.round(t * 360);
    return hslToRgb(hue, 100, 55);
}

/** Converte HSL (0-360, 0-100, 0-100) in stringa "rgb(r,g,b)" */
function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return `rgb(${Math.round(f(0)*255)},${Math.round(f(8)*255)},${Math.round(f(4)*255)})`;
}

// ============================================================
// SCHERMATA BATTLE PASS
// ============================================================

/**
 * Apre la schermata del Battle Pass.
 * @param {HTMLElement|null} parentContainer - da ripristinare alla chiusura
 */
export function mostraBattlePass(parentContainer) {
    if (parentContainer) parentContainer.style.display = "none";

    const { scale: sc } = calcolaLetterbox();
    const sp = n => `${Math.max(8, Math.round(n * sc))}px`;

    // ── Overlay ──────────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position:fixed; inset:0;
        background:rgb(6,8,14);
        display:flex; flex-direction:column; align-items:center;
        justify-content:flex-start;
        padding: ${sp(24)} ${sp(12)} ${sp(28)};
        z-index:99999; font-family:monospace; color:white;
        overflow-y:auto; box-sizing:border-box;
        background-image: radial-gradient(ellipse at 50% 0%, rgba(80,0,180,0.18) 0%, transparent 60%);
    `;
    document.body.appendChild(overlay);

    // ── Titolo ────────────────────────────────────────────────
    const titleWrap = document.createElement("div");
    titleWrap.style.cssText = `text-align:center; margin-bottom:${sp(6)};`;
    titleWrap.innerHTML = `
        <div style="font-size:${sp(9)};letter-spacing:4px;color:rgba(255,255,255,0.35);margin-bottom:${sp(4)}">SEASON 1</div>
        <div id="bp-title" style="font-size:${sp(26)};letter-spacing:3px;font-weight:bold">BATTLE PASS</div>
    `;
    overlay.appendChild(titleWrap);

    // Anima il titolo rainbow
    const bpTitle = titleWrap.querySelector("#bp-title");
    let titleRaf = null;
    function animateBpTitle() {
        bpTitle.style.color = getRainbowColor(0);
        titleRaf = requestAnimationFrame(animateBpTitle);
    }
    animateBpTitle();

    // ── Barra XP e livello ────────────────────────────────────
    const lv  = state.accountLivello || 1;
    const xp  = state.accountXp      || 0;
    const xpForNext = lv * 100;
    const xpCur     = xp - (lv - 1) * 100;
    const xpPct     = Math.min(100, Math.round(xpCur / 100 * 100));
    const nextRew   = PASS_REWARDS.find(r => r.level > lv);

    const levelWrap = document.createElement("div");
    levelWrap.style.cssText = `
        width:min(94vw,${Math.round(540*sc)}px);
        display:flex; flex-direction:column; gap:${sp(6)};
        margin: ${sp(14)} 0 ${sp(18)};
    `;
    levelWrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:${sp(13)}">
            <span style="color:rgb(255,200,0);font-size:${sp(18)};font-weight:bold">Lv.${lv}</span>
            <span style="color:rgba(255,255,255,0.45);font-size:${sp(11)}">${xp} XP total</span>
            ${nextRew ? `<span style="color:rgba(255,255,255,0.45);font-size:${sp(11)}">Next unlock: Lv.${nextRew.level}</span>` : `<span style="color:rgb(255,200,0);font-size:${sp(11)}">MAX LEVEL REACHED</span>`}
        </div>
        <div style="height:${sp(8)};background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden">
            <div id="bp-xpbar" style="height:100%;width:${xpPct}%;background:linear-gradient(90deg,rgb(120,0,255),rgb(255,200,0));border-radius:99px;transition:width 0.5s"></div>
        </div>
    `;
    overlay.appendChild(levelWrap);

    // ── Griglia reward ────────────────────────────────────────
    const grid = document.createElement("div");
    grid.style.cssText = `
        display:grid;
        grid-template-columns: repeat(auto-fill, minmax(${Math.round(110*sc)}px, 1fr));
        gap:${sp(10)};
        width:min(94vw,${Math.round(540*sc)}px);
    `;

    // Leggi selezioni correnti
    let selPlayer = getPlayerColorId();
    let selWeapon = getWeaponColorId();

    PASS_REWARDS.forEach(reward => {
        const unlocked  = isUnlocked(reward);
        const isSelP    = (reward.type === "player" || reward.type === "both") && selPlayer === reward.id;
        const isSelW    = (reward.type === "weapon" || reward.type === "both") && selWeapon === reward.id;
        const isSelected = isSelP || isSelW;

        const card = document.createElement("div");
        card.dataset.rewardId = reward.id;
        card.style.cssText = `
            background: ${unlocked ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.025)"};
            border: 1px solid ${isSelected ? "rgb(255,200,0)" : unlocked ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)"};
            border-radius: ${sp(10)};
            padding: ${sp(12)} ${sp(8)};
            display:flex; flex-direction:column; align-items:center; gap:${sp(6)};
            cursor: ${unlocked ? "pointer" : "default"};
            transition: border-color 0.15s, transform 0.1s;
            position:relative; overflow:hidden;
            ${!unlocked ? "opacity:0.45;" : ""}
        `;

        // Anteprima colore (cerchio player e/o arma)
        const preview = document.createElement("div");
        preview.style.cssText = `display:flex;gap:${sp(6)};align-items:center;justify-content:center;`;

        function makeCircle(isRainbow, colorStr, size = 28, isWeapon = false) {
            const c = document.createElement("div");
            const px = Math.round(size * sc);
            if (isWeapon) {
                // Rettangolino per arma
                c.style.cssText = `width:${Math.round(40*sc)}px;height:${Math.round(10*sc)}px;
                    border-radius:${sp(3)};background:${isRainbow ? "linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" : colorStr};
                    border:2px solid rgba(0,0,0,0.4);`;
            } else {
                c.style.cssText = `width:${px}px;height:${px}px;border-radius:50%;
                    background:${isRainbow ? "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" : colorStr};
                    border:2px solid rgba(0,0,0,0.4);`;
            }
            return c;
        }

        if (reward.type === "player" || reward.type === "both") {
            preview.appendChild(makeCircle(reward.rainbow, reward.color));
        }
        if (reward.type === "weapon" || reward.type === "both") {
            preview.appendChild(makeCircle(reward.rainbow, reward.color, 28, true));
        }

        // Level badge
        const lvBadge = document.createElement("div");
        lvBadge.style.cssText = `font-size:${sp(10)};color:${unlocked ? "rgb(255,200,0)" : "rgba(255,255,255,0.35)"};
            background:${unlocked ? "rgba(255,200,0,0.12)" : "rgba(255,255,255,0.04)"};
            border-radius:4px;padding:1px 6px;letter-spacing:1px;`;
        lvBadge.textContent = `LV.${reward.level}`;

        // Nome reward
        const nameEl = document.createElement("div");
        nameEl.style.cssText = `font-size:${sp(12)};color:${unlocked ? "white" : "rgba(255,255,255,0.35)"};
            text-align:center;letter-spacing:1px;font-weight:${reward.rainbow ? "bold" : "normal"};`;
        nameEl.textContent = reward.label;

        // Tipo badge
        const typeBadge = document.createElement("div");
        const typeColors = { player: "rgb(0,200,255)", weapon: "rgb(255,130,20)", both: "rgb(255,200,0)" };
        typeBadge.style.cssText = `font-size:${sp(9)};color:${typeColors[reward.type]};
            opacity:0.7;letter-spacing:1px;text-transform:uppercase;`;
        typeBadge.textContent = reward.type === "both" ? "PLAYER + WEAPON" : reward.type;

        // Indicatore selezionato
        const selTag = document.createElement("div");
        selTag.id    = `sel-${reward.id}`;
        selTag.style.cssText = `font-size:${sp(9)};color:rgb(255,200,0);letter-spacing:1px;
            height:${sp(14)};display:flex;align-items:center;`;
        selTag.textContent = isSelected ? "EQUIPPED" : "";

        // Lock icon per i non sbloccati
        if (!unlocked) {
            const lock = document.createElement("div");
            lock.style.cssText = `position:absolute;top:${sp(6)};right:${sp(8)};
                font-size:${sp(11)};color:rgba(255,255,255,0.25);`;
            lock.textContent = "[LOCKED]";
            card.appendChild(lock);
        }

        card.appendChild(preview);
        card.appendChild(lvBadge);
        card.appendChild(nameEl);
        card.appendChild(typeBadge);
        card.appendChild(selTag);

        // Click: equip / unequip
        if (unlocked) {
            card.addEventListener("mouseenter", () => {
                if (!isSelected) card.style.transform = "translateY(-2px)";
                card.style.borderColor = "rgba(255,200,0,0.5)";
            });
            card.addEventListener("mouseleave", () => {
                card.style.transform = "";
                const stillSel = isCurrentlySelected(reward.id);
                card.style.borderColor = stillSel ? "rgb(255,200,0)" : "rgba(255,255,255,0.12)";
            });

            card.addEventListener("click", () => {
                toggleReward(reward);
                saveCosmeticsToServer();
                rebuildGrid();
            });
        }

        grid.appendChild(card);
    });

    overlay.appendChild(grid);

    // ── Legenda tipo ──────────────────────────────────────────
    const legend = document.createElement("div");
    legend.style.cssText = `
        display:flex; gap:${sp(16)}; margin-top:${sp(14)};
        font-size:${sp(11)}; color:rgba(255,255,255,0.45);
    `;
    legend.innerHTML = `
        <span><span style="color:rgb(0,200,255)">■</span> PLAYER</span>
        <span><span style="color:rgb(255,130,20)">■</span> WEAPON</span>
        <span><span style="color:rgb(255,200,0)">■</span> PLAYER + WEAPON</span>
    `;
    overlay.appendChild(legend);

    // ── BACK ──────────────────────────────────────────────────
    const backBtn = document.createElement("button");
    backBtn.textContent = "\u2190 BACK";
    backBtn.style.cssText = `
        margin-top:${sp(20)};
        padding:${sp(10)} ${sp(28)};
        background:transparent; color:rgba(255,255,255,0.6);
        font-size:${sp(13)}; font-family:monospace;
        border:1px solid rgba(255,255,255,0.2); border-radius:6px; cursor:pointer;
    `;
    backBtn.addEventListener("click", () => {
        cancelAnimationFrame(titleRaf);
        overlay.remove();
        if (parentContainer) parentContainer.style.display = "flex";
    });
    overlay.appendChild(backBtn);

    // ── Helpers ───────────────────────────────────────────────
    function isCurrentlySelected(id) {
        return getPlayerColorId() === id || getWeaponColorId() === id;
    }

    function toggleReward(reward) {
        const currP = getPlayerColorId();
        const currW = getWeaponColorId();

        if (reward.type === "both") {
            // both: equip entrambi, oppure unequip se erano gia' attivi
            const activeP = currP === reward.id;
            const activeW = currW === reward.id;
            if (activeP || activeW) {
                if (activeP) setPlayerColorId("");
                if (activeW) setWeaponColorId("");
            } else {
                setPlayerColorId(reward.id);
                setWeaponColorId(reward.id);
            }
        } else if (reward.type === "player") {
            setPlayerColorId(currP === reward.id ? "" : reward.id);
        } else if (reward.type === "weapon") {
            setWeaponColorId(currW === reward.id ? "" : reward.id);
        }
    }

    function rebuildGrid() {
        selPlayer = getPlayerColorId();
        selWeapon = getWeaponColorId();

        // Aggiorna visivamente ogni card senza rifare tutto il DOM
        PASS_REWARDS.forEach(r => {
            const card = grid.querySelector(`[data-reward-id="${r.id}"]`);
            if (!card) return;
            const unlocked = isUnlocked(r);
            if (!unlocked) return;

            const isSelP = (r.type === "player" || r.type === "both") && selPlayer === r.id;
            const isSelW = (r.type === "weapon" || r.type === "both") && selWeapon === r.id;
            const isSel  = isSelP || isSelW;

            card.style.borderColor = isSel ? "rgb(255,200,0)" : "rgba(255,255,255,0.12)";
            const tag = card.querySelector(`#sel-${r.id}`);
            if (tag) tag.textContent = isSel ? "EQUIPPED" : "";
        });
    }
}