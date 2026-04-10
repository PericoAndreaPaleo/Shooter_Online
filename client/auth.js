// ============================================================
// auth.js — Gestione autenticazione lato client (via PHP)
//
// Questo modulo gestisce:
//   • La schermata di login / registrazione mostrata prima del gioco
//   • Le chiamate HTTP ai file PHP di autenticazione
//   • Il controllo della sessione esistente (token in localStorage)
//   • Il logout
//
// Il token di sessione viene salvato in localStorage dopo il login
// e inviato nel body delle richieste POST ai PHP.
//
// Il flusso è:
//   1. main.js chiama checkSession() all'avvio
//   2. Se il token in localStorage è valido → restituisce i dati utente
//   3. Se non è valido → main.js chiama mostraSchermataAuth()
//   4. Dopo login/registrazione riusciti → chiama onSuccess(userData)
// ============================================================

import { calcolaLetterbox } from "./state.js";

// ============================================================
// URL BASE DEI FILE PHP
// Cambia questo valore con l'URL del tuo server PHP.
// Esempio: "https://miosito.altervista.org/php"
//          "https://miosito.com/shooter/php"
// NON aggiungere lo slash finale.
// ============================================================
const PHP_BASE = "https://IL-TUO-SERVER-PHP.com/php";

// ── Dipendenza iniettata da main.js ──────────────────────────
let onAuthSuccess = null;

/**
 * Registra la funzione da chiamare dopo autenticazione riuscita.
 * @param {function} callback
 */
export function initAuth(callback) {
    onAuthSuccess = callback;
}

// ============================================================
// CHECK SESSIONE ESISTENTE
// Legge il token da localStorage e lo verifica sul server PHP.
// ============================================================

/**
 * Controlla se esiste una sessione valida.
 * @returns {Promise<Object|null>} dati utente se loggato, null altrimenti
 */
export async function checkSession() {
    const token = localStorage.getItem("auth_token");
    if (!token) return null;

    try {
        const res = await fetch(`${PHP_BASE}/check_session.php`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ token }),
        });
        if (res.ok) {
            const data = await res.json();
            if (data.ok) return data.user;
        }
    } catch (_) {}

    // Token non valido o scaduto: pulisci localStorage
    localStorage.removeItem("auth_token");
    return null;
}

// ============================================================
// LOGOUT
// ============================================================

/**
 * Esegue il logout: cancella il token sul server PHP e in localStorage.
 */
export async function logout() {
    const token = localStorage.getItem("auth_token");
    if (token) {
        await fetch(`${PHP_BASE}/logout.php`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ token }),
        }).catch(() => {});
    }
    localStorage.removeItem("auth_token");
}

// ============================================================
// SCHERMATA LOGIN / REGISTRAZIONE
// ============================================================

let authContainer = null;

/**
 * Mostra la schermata di login/registrazione.
 * @param {string} [errorMsg]
 */
export function mostraSchermataAuth(errorMsg = "") {
    if (authContainer) { authContainer.remove(); authContainer = null; }

    const { scale } = calcolaLetterbox();

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
    subtitle.textContent = "Accedi per giocare";
    subtitle.style.cssText = `
        font-size:      ${Math.round(14 * scale)}px;
        color:          rgba(255,255,255,0.5);
        margin-bottom:  ${Math.round(28 * scale)}px;
        letter-spacing: 1px;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
        background:    rgba(255,255,255,0.05);
        border:        1px solid rgba(255,255,255,0.12);
        border-radius: 10px;
        padding:       ${Math.round(28 * scale)}px ${Math.round(32 * scale)}px;
        width:         ${Math.round(320 * scale)}px;
        display:       flex;
        flex-direction: column;
        gap:           ${Math.round(12 * scale)}px;
    `;

    const tabRow = document.createElement("div");
    tabRow.style.cssText = `
        display:       flex;
        gap:           ${Math.round(8 * scale)}px;
        margin-bottom: ${Math.round(4 * scale)}px;
    `;

    let activeTab = "login";

    const tabLogin = _creaTab("Accedi",     scale, true);
    const tabReg   = _creaTab("Registrati", scale, false);

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

    const inputUser  = _creaInput("text",     "Username",       inputStyle);
    const inputEmail = _creaInput("email",    "Email",          inputStyle);
    const inputPass  = _creaInput("password", "Password",       inputStyle);
    const inputPass2 = _creaInput("password", "Ripeti password", inputStyle);

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
    btnAzione.textContent = "ACCEDI";
    btnAzione.style.cssText = `
        height:          ${Math.round(46 * scale)}px;
        background:      rgb(0, 180, 70);
        color:           white;
        font-size:       ${Math.round(16 * scale)}px;
        font-weight:     bold;
        font-family:     monospace;
        letter-spacing:  2px;
        border:          none;
        border-radius:   6px;
        cursor:          pointer;
        margin-top:      ${Math.round(4 * scale)}px;
    `;

    const btnOspite = document.createElement("button");
    btnOspite.textContent = "Gioca come ospite";
    btnOspite.style.cssText = `
        height:          ${Math.round(36 * scale)}px;
        background:      transparent;
        color:           rgba(255,255,255,0.45);
        font-size:       ${Math.round(12 * scale)}px;
        font-family:     monospace;
        border:          1px solid rgba(255,255,255,0.12);
        border-radius:   5px;
        cursor:          pointer;
    `;

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
            btnAzione.textContent      = "ACCEDI";
        } else {
            tabReg.style.background    = "rgba(0,255,100,0.15)";
            tabReg.style.color         = "rgb(0,255,100)";
            tabReg.style.borderColor   = "rgb(0,255,100)";
            tabLogin.style.background  = "transparent";
            tabLogin.style.color       = "rgba(255,255,255,0.45)";
            tabLogin.style.borderColor = "rgba(255,255,255,0.15)";
            inputEmail.style.display   = "block";
            inputPass2.style.display   = "block";
            btnAzione.textContent      = "REGISTRATI";
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
        rimuoviSchermataAuth();
        if (onAuthSuccess) onAuthSuccess(null);
    });

    // ── Login o Registrazione ─────────────────────────────────
    async function eseguiAzione() {
        const username  = inputUser.value.trim();
        const email     = inputEmail.value.trim();
        const password  = inputPass.value;
        const password2 = inputPass2.value;

        msgBox.style.color = "rgb(220, 80, 80)";
        msgBox.textContent = "";

        if (activeTab === "login") {
            if (!username || !password) {
                msgBox.textContent = "Inserisci username e password."; return;
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
                    // Salva il token in localStorage
                    localStorage.setItem("auth_token", data.token);
                    rimuoviSchermataAuth();
                    if (onAuthSuccess) onAuthSuccess(data);
                } else {
                    msgBox.textContent    = data.error || "Errore login.";
                    btnAzione.textContent = "ACCEDI";
                    btnAzione.disabled    = false;
                }
            } catch (_) {
                msgBox.textContent    = "Errore di rete.";
                btnAzione.textContent = "ACCEDI";
                btnAzione.disabled    = false;
            }

        } else {
            // ── Registrazione ──────────────────────────────────
            if (!username || !email || !password || !password2) {
                msgBox.textContent = "Compila tutti i campi."; return;
            }
            if (password !== password2) {
                msgBox.textContent = "Le password non coincidono."; return;
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
                    // Registrazione ok → login automatico
                    const resLogin  = await fetch(`${PHP_BASE}/login.php`, {
                        method:  "POST",
                        headers: { "Content-Type": "application/json" },
                        body:    JSON.stringify({ username, password }),
                    });
                    const dataLogin = await resLogin.json();

                    if (dataLogin.ok) {
                        localStorage.setItem("auth_token", dataLogin.token);
                        rimuoviSchermataAuth();
                        if (onAuthSuccess) onAuthSuccess(dataLogin);
                    } else {
                        msgBox.style.color = "rgb(0, 220, 100)";
                        msgBox.textContent = "Account creato! Ora accedi.";
                        switchTab("login");
                        btnAzione.disabled = false;
                    }
                } else {
                    msgBox.textContent    = data.error || "Errore registrazione.";
                    btnAzione.textContent = "REGISTRATI";
                    btnAzione.disabled    = false;
                }
            } catch (_) {
                msgBox.textContent    = "Errore di rete.";
                btnAzione.textContent = "REGISTRATI";
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

    authContainer.appendChild(title);
    authContainer.appendChild(subtitle);
    authContainer.appendChild(card);
    document.body.appendChild(authContainer);

    setTimeout(() => inputUser.focus(), 50);
}

/**
 * Rimuove la schermata di autenticazione dal DOM.
 */
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
        flex:            1;
        height:          ${Math.round(34 * scale)}px;
        background:      ${active ? "rgba(0,255,100,0.15)" : "transparent"};
        color:           ${active ? "rgb(0,255,100)" : "rgba(255,255,255,0.45)"};
        font-size:       ${Math.round(13 * scale)}px;
        font-family:     monospace;
        border:          1px solid ${active ? "rgb(0,255,100)" : "rgba(255,255,255,0.15)"};
        border-radius:   5px;
        cursor:          pointer;
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