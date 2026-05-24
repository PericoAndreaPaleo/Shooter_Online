// ============================================================
// auth.js — Gestione autenticazione lato client (via PHP)
//
// COOKIE CONSENT:
//   Prima di salvare qualsiasi token, mostriamo un banner che
//   chiede il permesso all'utente:
//
//   • "Accept & Remember me" → cookieConsent = "accepted"
//     Il token viene salvato in localStorage (persiste alla
//     chiusura del browser).
//
//   • "Decline" → cookieConsent = "declined"
//     Il token viene tenuto solo in memoria (variabile JS).
//     Alla chiusura del browser/tab l'utente viene disconnesso.
//
//   La scelta viene anch'essa salvata in localStorage così il
//   banner non riappare ad ogni visita. L'utente può cambiare
//   idea in qualsiasi momento tramite il link nelle impostazioni.
//
// STORAGE:
//   Se consenso accettato  → localStorage   (persiste)
//   Se consenso rifiutato  → _memoryToken   (solo sessione corrente)
//
// FLUSSO PRINCIPALE:
//   1. main.js chiama checkSession() all'avvio
//   2. Se il token è valido → restituisce i dati utente
//   3. Se non valido → main.js chiama mostraSchermataAuth()
//      che prima mostra il banner cookie (se non già scelto),
//      poi il form login.
// ============================================================

import { calcolaLetterbox } from "./state.js";

const PHP_BASE = "/php";

// ── Dipendenza iniettata da main.js ──────────────────────────
let onAuthSuccess = null;

export function initAuth(callback) {
    onAuthSuccess = callback;
}

// ============================================================
// TOKEN STORAGE — rispetta il consenso cookie
// ============================================================

/**
 * Token tenuto in memoria quando l'utente rifiuta i cookie.
 * Viene perso alla chiusura del browser/tab.
 */
let _memoryToken = null;

/** Legge il consenso cookie salvato ("accepted" | "declined" | null) */
function getCookieConsent() {
    return localStorage.getItem("cookie_consent"); // null se mai scelto
}

/** Salva il token nel posto giusto in base al consenso */
function saveToken(token) {
    if (getCookieConsent() === "accepted") {
        localStorage.setItem("auth_token", token);
        _memoryToken = null;
    } else {
        // Rifiutato o non ancora scelto: solo in memoria
        _memoryToken = token;
        localStorage.removeItem("auth_token");
    }
}

/** Legge il token dal posto giusto */
function getToken() {
    if (getCookieConsent() === "accepted") {
        return localStorage.getItem("auth_token");
    }
    return _memoryToken;
}

/** Cancella il token da tutti i posti */
function clearToken() {
    _memoryToken = null;
    localStorage.removeItem("auth_token");
}

// ============================================================
// POLLING DI KEEP-ALIVE / SESSIONE UNICA
// ============================================================

const SESSION_POLL_INTERVAL_MS = 30_000; // 30 secondi
let sessionPollTimer = null;

function avviaSessionPoll() {
    fermaSessionPoll();

    sessionPollTimer = setInterval(async () => {
        const token = getToken();
        if (!token) {
            fermaSessionPoll();
            return;
        }

        try {
            const res  = await fetch(`${PHP_BASE}/check_session.php`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ token }),
            });
            const data = await res.json();

            if (!res.ok || !data.ok) {
                fermaSessionPoll();
                clearToken();
                localStorage.removeItem("bp_player_color");
                localStorage.removeItem("bp_weapon_color");

                if (data.error === "session_replaced") {
                    mostraSchermataAuth(
                        "Your account was accessed from another device. You have been disconnected."
                    );
                } else {
                    mostraSchermataAuth("Your session has expired. Please log in again.");
                }
            }
        } catch (_) {
            // Errore di rete temporaneo: non disconnettere
        }
    }, SESSION_POLL_INTERVAL_MS);
}

function fermaSessionPoll() {
    if (sessionPollTimer !== null) {
        clearInterval(sessionPollTimer);
        sessionPollTimer = null;
    }
}

// ============================================================
// HELPER COSMETICS
// ============================================================

function applyCosmeticsFromServer(userData) {
    if (userData.player_color_id !== undefined) {
        if (userData.player_color_id) {
            localStorage.setItem("bp_player_color", userData.player_color_id);
        } else {
            localStorage.removeItem("bp_player_color");
        }
    }
    if (userData.weapon_color_id !== undefined) {
        if (userData.weapon_color_id) {
            localStorage.setItem("bp_weapon_color", userData.weapon_color_id);
        } else {
            localStorage.removeItem("bp_weapon_color");
        }
    }
}

// ============================================================
// CHECK SESSIONE ESISTENTE
// ============================================================

export async function checkSession() {
    const token = getToken();
    if (!token) return null;

    for (let tentativo = 0; tentativo < 2; tentativo++) {
        try {
            const res = await fetch(`${PHP_BASE}/check_session.php`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ token }),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.ok) {
                    applyCosmeticsFromServer(data.user);
                    avviaSessionPoll();
                    return data.user;
                }
                // Errore esplicito dal server: token non valido
                clearToken();
                localStorage.removeItem("bp_player_color");
                localStorage.removeItem("bp_weapon_color");
                return null;
            }

            if (tentativo === 0) {
                await new Promise(r => setTimeout(r, 1500));
                continue;
            }
        } catch (_) {
            if (tentativo === 0) {
                await new Promise(r => setTimeout(r, 1500));
                continue;
            }
            // Secondo tentativo fallito per rete: conserva il token
            return null;
        }
    }

    return null;
}

// ============================================================
// LOGOUT
// ============================================================

export async function logout() {
    fermaSessionPoll();

    const token = getToken();
    if (token) {
        await fetch(`${PHP_BASE}/logout.php`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ token }),
        }).catch(() => {});
    }

    clearToken();
    localStorage.removeItem("bp_player_color");
    localStorage.removeItem("bp_weapon_color");
}

// ============================================================
// COOKIE CONSENT BANNER
// ============================================================

/**
 * Mostra il banner cookie e restituisce una Promise che si
 * risolve con "accepted" o "declined" quando l'utente sceglie.
 * Se l'utente ha già scelto in passato, non mostra nulla e
 * risolve immediatamente con la scelta precedente.
 */
function chiediCookieConsent(scale) {
    return new Promise((resolve) => {
        const existingConsent = getCookieConsent();
        if (existingConsent) {
            resolve(existingConsent);
            return;
        }

        // ── Banner ───────────────────────────────────────────────
        const banner = document.createElement("div");
        banner.id = "cookie-banner";
        banner.style.cssText = `
            position:        fixed;
            inset:           0;
            background:      rgba(5, 10, 5, 0.97);
            display:         flex;
            flex-direction:  column;
            align-items:     center;
            justify-content: center;
            gap:             ${Math.round(20 * scale)}px;
            z-index:         999999;
            font-family:     monospace;
            color:           rgba(255,255,255,0.85);
        `;

        const icon = document.createElement("div");
        icon.textContent = "";
        icon.style.fontSize = `${Math.round(28 * scale)}px`;

        const textWrap = document.createElement("div");
        textWrap.style.cssText = `text-align: center; max-width: ${Math.round(560 * scale)}px;`;

        const title = document.createElement("div");
        title.textContent = "Cookie & Session Preferences";
        title.style.cssText = `
            font-size:     ${Math.round(15 * scale)}px;
            font-weight:   bold;
            color:         rgb(0, 255, 100);
            margin-bottom: ${Math.round(6 * scale)}px;
            letter-spacing: 1px;
        `;

        const desc = document.createElement("div");
        desc.style.cssText = `font-size: ${Math.round(12 * scale)}px; line-height: 1.6; color: rgba(255,255,255,0.6);`;
        desc.textContent =
            "We use a session cookie to keep you logged in. " +
            "If you Accept, your login is saved and you stay logged in for 5 minutes after closing the game. " +
            "If you Decline, your session ends as soon as you close the tab or browser.";

        textWrap.appendChild(title);
        textWrap.appendChild(desc);

        const btnRow = document.createElement("div");
        btnRow.style.cssText = `display: flex; gap: ${Math.round(12 * scale)}px;`;

        const btnAccept = document.createElement("button");
        btnAccept.textContent = "✓  Accept & Remember me";
        btnAccept.style.cssText = `
            height:         ${Math.round(40 * scale)}px;
            padding:        0 ${Math.round(22 * scale)}px;
            background:     rgb(0, 180, 70);
            color:          white;
            font-size:      ${Math.round(13 * scale)}px;
            font-weight:    bold;
            font-family:    monospace;
            letter-spacing: 1px;
            border:         none;
            border-radius:  6px;
            cursor:         pointer;
        `;

        const btnDecline = document.createElement("button");
        btnDecline.textContent = "✕  Decline";
        btnDecline.style.cssText = `
            height:       ${Math.round(40 * scale)}px;
            padding:      0 ${Math.round(22 * scale)}px;
            background:   transparent;
            color:        rgba(255,255,255,0.5);
            font-size:    ${Math.round(13 * scale)}px;
            font-family:  monospace;
            border:       1px solid rgba(255,255,255,0.2);
            border-radius: 6px;
            cursor:       pointer;
        `;

        btnAccept.addEventListener("click", () => {
            localStorage.setItem("cookie_consent", "accepted");
            banner.remove();
            resolve("accepted");
        });

        btnDecline.addEventListener("click", () => {
            localStorage.setItem("cookie_consent", "declined");
            banner.remove();
            resolve("declined");
        });

        btnRow.appendChild(btnAccept);
        btnRow.appendChild(btnDecline);
        banner.appendChild(icon);
        banner.appendChild(textWrap);
        banner.appendChild(btnRow);
        document.body.appendChild(banner);
    });
}

// ============================================================
// SCHERMATA LOGIN / REGISTRAZIONE
// ============================================================

let authContainer = null;

export async function mostraSchermataAuth(errorMsg = "") {
    if (authContainer) { authContainer.remove(); authContainer = null; }

    const { scale } = calcolaLetterbox();

    // Mostra prima il banner cookie (se non ancora scelto)
    await chiediCookieConsent(scale);

    // ── Container principale ──────────────────────────────────
    authContainer = document.createElement("div");
    authContainer.style.cssText = `
        position:        fixed;
        inset:           0;
        background:      rgba(5, 10, 5, 0.96);
        display:         flex;
        flex-direction:  column;
        align-items:     center;
        justify-content: center;
        z-index:         99999;
        font-family:     monospace;
        color:           white;
    `;

    const title = document.createElement("div");
    title.textContent = "SHOOTER ONLINE";
    title.style.cssText = `
        font-size:      ${Math.round(42 * scale)}px;
        font-weight:    bold;
        color:          rgb(0, 255, 100);
        letter-spacing: 3px;
        margin-bottom:  ${Math.round(8 * scale)}px;
    `;

    const subtitle = document.createElement("div");
    subtitle.textContent = "Log in to play";
    subtitle.style.cssText = `
        font-size:      ${Math.round(14 * scale)}px;
        color:          rgba(255,255,255,0.5);
        margin-bottom:  ${Math.round(28 * scale)}px;
        letter-spacing: 1px;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
        background:     rgba(255,255,255,0.05);
        border:         1px solid rgba(255,255,255,0.12);
        border-radius:  10px;
        padding:        ${Math.round(28 * scale)}px ${Math.round(32 * scale)}px;
        width:          ${Math.round(320 * scale)}px;
        display:        flex;
        flex-direction: column;
        gap:            ${Math.round(12 * scale)}px;
    `;

    const tabRow = document.createElement("div");
    tabRow.style.cssText = `display: flex; gap: ${Math.round(8 * scale)}px; margin-bottom: ${Math.round(4 * scale)}px;`;

    let activeTab = "login";

    const tabLogin = _creaTab("Log in",  scale, true);
    const tabReg   = _creaTab("Sign up", scale, false);

    const fontSize    = `${Math.round(14 * scale)}px`;
    const inputHeight = `${Math.round(40 * scale)}px`;
    const inputStyle  = `
        width:         100%;
        height:        ${inputHeight};
        background:    rgba(255,255,255,0.07);
        border:        1px solid rgba(255,255,255,0.18);
        border-radius: 5px;
        color:         white;
        font-size:     ${fontSize};
        font-family:   monospace;
        padding:       0 ${Math.round(12 * scale)}px;
        outline:       none;
        box-sizing:    border-box;
    `;

    const inputUser  = _creaInput("text",     "Username",         inputStyle);
    const inputEmail = _creaInput("email",    "Email",            inputStyle);
    const inputPass  = _creaInput("password", "Password",         inputStyle);
    const inputPass2 = _creaInput("password", "Confirm password", inputStyle);

    inputEmail.style.display = "none";
    inputPass2.style.display = "none";

    const msgBox = document.createElement("div");
    msgBox.style.cssText = `
        font-size:   ${Math.round(13 * scale)}px;
        min-height:  ${Math.round(18 * scale)}px;
        text-align:  center;
        color:       rgb(220, 80, 80);
    `;
    if (errorMsg) msgBox.textContent = errorMsg;

    const btnAzione = document.createElement("button");
    btnAzione.textContent = "LOG IN";
    btnAzione.style.cssText = `
        height:         ${Math.round(46 * scale)}px;
        background:     rgb(0, 180, 70);
        color:          white;
        font-size:      ${Math.round(16 * scale)}px;
        font-weight:    bold;
        font-family:    monospace;
        letter-spacing: 2px;
        border:         none;
        border-radius:  6px;
        cursor:         pointer;
        margin-top:     ${Math.round(4 * scale)}px;
    `;

    const btnOspite = document.createElement("button");
    btnOspite.textContent = "Play as guest";
    btnOspite.style.cssText = `
        height:       ${Math.round(36 * scale)}px;
        background:   transparent;
        color:        rgba(255,255,255,0.45);
        font-size:    ${Math.round(12 * scale)}px;
        font-family:  monospace;
        border:       1px solid rgba(255,255,255,0.12);
        border-radius: 5px;
        cursor:       pointer;
    `;

    // Link per cambiare preferenze cookie
    const cookieLink = document.createElement("div");
    const consentLabel = getCookieConsent() === "accepted"
        ? "Cookies accepted — change preference"
        : "Cookies declined — change preference";
    cookieLink.textContent = consentLabel;
    cookieLink.style.cssText = `
        font-size:   ${Math.round(11 * scale)}px;
        color:       rgba(255,255,255,0.25);
        text-align:  center;
        cursor:      pointer;
        text-decoration: underline;
        margin-top:  ${Math.round(2 * scale)}px;
    `;
    cookieLink.addEventListener("click", () => {
        // Resetta la scelta e mostra di nuovo il banner
        localStorage.removeItem("cookie_consent");
        authContainer.remove();
        authContainer = null;
        mostraSchermataAuth();
    });

    function switchTab(tab) {
        activeTab = tab;
        if (tab === "login") {
            tabLogin.style.background  = "rgba(0,255,100,0.15)";
            tabLogin.style.color       = "rgb(0,255,100)";
            tabLogin.style.borderColor = "rgb(0,255,100)";
            tabReg.style.background    = "transparent";
            tabReg.style.color         = "rgba(255,255,255,0.45)";
            tabReg.style.borderColor   = "rgba(255,255,255,0.15)";
            inputEmail.style.display   = "none";
            inputPass2.style.display   = "none";
            btnAzione.textContent      = "LOG IN";
        } else {
            tabReg.style.background    = "rgba(0,255,100,0.15)";
            tabReg.style.color         = "rgb(0,255,100)";
            tabReg.style.borderColor   = "rgb(0,255,100)";
            tabLogin.style.background  = "transparent";
            tabLogin.style.color       = "rgba(255,255,255,0.45)";
            tabLogin.style.borderColor = "rgba(255,255,255,0.15)";
            inputEmail.style.display   = "block";
            inputPass2.style.display   = "block";
            btnAzione.textContent      = "SIGN UP";
        }
        msgBox.textContent = "";
    }

    tabLogin.addEventListener("click", () => switchTab("login"));
    tabReg.addEventListener("click",   () => switchTab("register"));
    btnAzione.addEventListener("click", () => eseguiAzione());

    [inputUser, inputEmail, inputPass, inputPass2].forEach(el => {
        el.addEventListener("keydown", e => { if (e.key === "Enter") eseguiAzione(); });
    });

    btnOspite.addEventListener("click", () => {
        // Ospite: nessuna skin, nessun account → pulisci tutto
        localStorage.removeItem("bp_player_color");
        localStorage.removeItem("bp_weapon_color");
        rimuoviSchermataAuth();
        if (onAuthSuccess) onAuthSuccess(null);
    });

    async function eseguiAzione() {
        const username  = inputUser.value.trim();
        const email     = inputEmail.value.trim();
        const password  = inputPass.value;
        const password2 = inputPass2.value;

        msgBox.style.color = "rgb(220, 80, 80)";
        msgBox.textContent = "";

        if (activeTab === "login") {
            if (!username || !password) {
                msgBox.textContent = "Enter username and password.";
                return;
            }
            btnAzione.textContent = "...";
            btnAzione.disabled    = true;

            try {
                const res  = await fetch(`${PHP_BASE}/login.php`, {
                    method:  "POST",
                    headers: { "Content-Type": "application/json" },
                    body:    JSON.stringify({ username, password }),
                });
                const data = await res.json();

                if (data.ok) {
                    saveToken(data.token);
                    applyCosmeticsFromServer(data);
                    rimuoviSchermataAuth();
                    avviaSessionPoll();
                    if (onAuthSuccess) onAuthSuccess(data);
                } else {
                    msgBox.textContent    = data.error || "Login error.";
                    btnAzione.textContent = "LOG IN";
                    btnAzione.disabled    = false;
                }
            } catch (_) {
                msgBox.textContent    = "Network error.";
                btnAzione.textContent = "LOG IN";
                btnAzione.disabled    = false;
            }

        } else {
            if (!username || !email || !password || !password2) {
                msgBox.textContent = "Please fill in all fields.";
                return;
            }
            if (password !== password2) {
                msgBox.textContent = "Passwords do not match.";
                return;
            }
            btnAzione.textContent = "...";
            btnAzione.disabled    = true;

            try {
                const res  = await fetch(`${PHP_BASE}/register.php`, {
                    method:  "POST",
                    headers: { "Content-Type": "application/json" },
                    body:    JSON.stringify({ username, email, password }),
                });
                const data = await res.json();

                if (data.ok) {
                    const resLogin  = await fetch(`${PHP_BASE}/login.php`, {
                        method:  "POST",
                        headers: { "Content-Type": "application/json" },
                        body:    JSON.stringify({ username, password }),
                    });
                    const dataLogin = await resLogin.json();

                    if (dataLogin.ok) {
                        saveToken(dataLogin.token);
                        applyCosmeticsFromServer(dataLogin);
                        rimuoviSchermataAuth();
                        avviaSessionPoll();
                        if (onAuthSuccess) onAuthSuccess(dataLogin);
                    } else {
                        msgBox.style.color = "rgb(0, 220, 100)";
                        msgBox.textContent = "Account created! You can now log in.";
                        switchTab("login");
                        btnAzione.disabled = false;
                    }
                } else {
                    msgBox.textContent    = data.error || "Registration error.";
                    btnAzione.textContent = "SIGN UP";
                    btnAzione.disabled    = false;
                }
            } catch (_) {
                msgBox.textContent    = "Network error.";
                btnAzione.textContent = "SIGN UP";
                btnAzione.disabled    = false;
            }
        }
    }

    tabRow.appendChild(tabLogin);
    tabRow.appendChild(tabReg);
    card.appendChild(tabRow);
    card.appendChild(inputUser);
    card.appendChild(inputEmail);
    card.appendChild(inputPass);
    card.appendChild(inputPass2);
    card.appendChild(msgBox);
    card.appendChild(btnAzione);
    card.appendChild(btnOspite);
    card.appendChild(cookieLink);

    authContainer.appendChild(title);
    authContainer.appendChild(subtitle);
    authContainer.appendChild(card);
    document.body.appendChild(authContainer);

    setTimeout(() => inputUser.focus(), 50);
}

export function rimuoviSchermataAuth() {
    if (authContainer) {
        authContainer.remove();
        authContainer = null;
    }
}

// ── Helper privati ────────────────────────────────────────────

function _creaTab(label, scale, active) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = `
        flex:          1;
        height:        ${Math.round(34 * scale)}px;
        background:    ${active ? "rgba(0,255,100,0.15)" : "transparent"};
        color:         ${active ? "rgb(0,255,100)" : "rgba(255,255,255,0.45)"};
        font-size:     ${Math.round(13 * scale)}px;
        font-family:   monospace;
        border:        1px solid ${active ? "rgb(0,255,100)" : "rgba(255,255,255,0.15)"};
        border-radius: 5px;
        cursor:        pointer;
    `;
    return btn;
}

function _creaInput(type, placeholder, cssText) {
    const input       = document.createElement("input");
    input.type        = type;
    input.placeholder = placeholder;
    input.style.cssText = cssText;
    if (type === "password") input.autocomplete = "current-password";
    return input;
}