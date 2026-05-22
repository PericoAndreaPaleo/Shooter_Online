// ============================================================
// auth.js — Gestione autenticazione lato client (via PHP)
//
// Questo modulo gestisce:
//   • La schermata di login / registrazione mostrata prima del gioco
//   • Le chiamate HTTP ai file PHP di autenticazione
//   • Il controllo della sessione esistente (token in localStorage)
//   • Il logout
//   • Il polling periodico per rilevare disconnessioni forzate
//     (es: login da un altro dispositivo con sessione unica)
//
// FLUSSO PRINCIPALE:
//   1. main.js chiama checkSession() all'avvio
//   2. Se il token in localStorage è valido → restituisce i dati utente
//      e avvia il polling di keep-alive
//   3. Se non è valido → main.js chiama mostraSchermataAuth()
//   4. Dopo login/registrazione riusciti → chiama onSuccess(userData)
//      e avvia il polling di keep-alive
//
// SESSIONE UNICA:
//   Ogni login cancella tutte le sessioni precedenti dell'utente.
//   Il polling periodico (ogni 30s) chiama check_session.php:
//   se il server risponde { error: "session_replaced" } significa
//   che l'utente ha fatto login da un altro device, quindi il
//   client corrente mostra un messaggio e torna alla schermata login.
// ============================================================

import { calcolaLetterbox } from "./state.js";

// ============================================================
// URL BASE DEI FILE PHP
// Cambia questo valore con l'URL del tuo server PHP.
// Esempio: "https://miosito.altervista.org/php"
//          "https://miosito.com/shooter/php"
// NON aggiungere lo slash finale.
// ============================================================
const PHP_BASE = "/php";

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
// POLLING DI KEEP-ALIVE / SESSIONE UNICA
//
// Intervallo in millisecondi tra un controllo e il successivo.
// 30 secondi è un buon compromesso: abbastanza frequente da
// accorgersi in tempi ragionevoli di un login concorrente,
// abbastanza raro da non stressare il server.
// ============================================================
const SESSION_POLL_INTERVAL_MS = 30_000; // 30 secondi

/** ID del setInterval del polling (null = polling non attivo) */
let sessionPollTimer = null;

/**
 * Avvia il polling periodico di verifica sessione.
 * Se la sessione risulta invalida (scaduta o sostituita da altro
 * login), il polling si ferma e viene mostrata la schermata auth.
 *
 * Chiamato automaticamente dopo ogni login/checkSession riuscito.
 */
function avviaSessionPoll() {
    // Evita di avviare più timer in parallelo
    fermaSessionPoll();

    sessionPollTimer = setInterval(async () => {
        const token = localStorage.getItem("auth_token");
        if (!token) {
            // Token sparito dal localStorage (logout manuale?): fermati
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
                // Sessione non più valida: ferma il polling e pulisci
                fermaSessionPoll();
                localStorage.removeItem("auth_token");
                localStorage.removeItem("bp_player_color");
                localStorage.removeItem("bp_weapon_color");

                if (data.error === "session_replaced") {
                    // Caso speciale: login da un altro dispositivo ha
                    // invalidato questa sessione (sessione unica).
                    // Mostra un messaggio specifico invece del form generico.
                    mostraSchermataAuth(
                        "Your account was accessed from another device. You have been disconnected."
                    );
                } else {
                    // Sessione scaduta per timeout normale
                    mostraSchermataAuth("Your session has expired. Please log in again.");
                }
            }
            // Se data.ok === true: sessione ancora valida, non fare nulla
        } catch (_) {
            // Errore di rete temporaneo: non disconnettere subito,
            // il prossimo tick riproverà automaticamente.
        }
    }, SESSION_POLL_INTERVAL_MS);
}

/**
 * Ferma il polling di verifica sessione.
 * Chiamato al logout o quando la sessione risulta invalida.
 */
function fermaSessionPoll() {
    if (sessionPollTimer !== null) {
        clearInterval(sessionPollTimer);
        sessionPollTimer = null;
    }
}

// ============================================================
// HELPER COSMETICS
// ============================================================

/**
 * Scrive i cosmetics ricevuti dal server nel localStorage.
 * Chiamato dopo ogni login/checkSession riuscito.
 * Garantisce che cambiare account resetti le skin.
 *
 * @param {Object} userData - Dati utente restituiti dal server
 */
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
//
// Legge il token da localStorage e lo verifica sul server PHP.
// Se valido, avvia il polling di keep-alive e restituisce i
// dati utente → main.js salta la schermata di login.
// Se non valido, restituisce null → main.js mostra il login.
// ============================================================

/**
 * Controlla se esiste una sessione valida in localStorage.
 * @returns {Promise<Object|null>} dati utente se loggato, null altrimenti
 */
export async function checkSession() {
    const token = localStorage.getItem("auth_token");
    if (!token) return null; // nessun token salvato → non loggato

    try {
        const res  = await fetch(`${PHP_BASE}/check_session.php`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ token }),
        });
        if (res.ok) {
            const data = await res.json();
            if (data.ok) {
                // Sessione valida: applica i cosmetics e avvia il polling
                applyCosmeticsFromServer(data.user);
                avviaSessionPoll(); // ← inizia il monitoraggio in background
                return data.user;
            }
        }
    } catch (_) {
        // Errore di rete: tratta come sessione non valida
    }

    // Token non valido o scaduto: pulisci tutto dal localStorage
    localStorage.removeItem("auth_token");
    localStorage.removeItem("bp_player_color");
    localStorage.removeItem("bp_weapon_color");
    return null;
}

// ============================================================
// LOGOUT
// ============================================================

/**
 * Esegue il logout:
 *   1. Ferma il polling di sessione
 *   2. Cancella il token sul server PHP (e tutte le sessioni dell'utente)
 *   3. Pulisce localStorage
 */
export async function logout() {
    // Prima di tutto ferma il polling per evitare chiamate inutili
    fermaSessionPoll();

    const token = localStorage.getItem("auth_token");
    if (token) {
        await fetch(`${PHP_BASE}/logout.php`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ token }),
        }).catch(() => {}); // ignora errori di rete al logout
    }

    // Rimuovi token e cosmetics dal localStorage
    localStorage.removeItem("auth_token");
    localStorage.removeItem("bp_player_color");
    localStorage.removeItem("bp_weapon_color");
}

// ============================================================
// SCHERMATA LOGIN / REGISTRAZIONE
// ============================================================

/** Riferimento al container DOM della schermata auth (singleton) */
let authContainer = null;

/**
 * Mostra la schermata di login/registrazione sovrapposta al gioco.
 *
 * @param {string} [errorMsg] - Messaggio di errore/info da mostrare subito
 */
export function mostraSchermataAuth(errorMsg = "") {
    // Rimuovi eventuale schermata precedente
    if (authContainer) { authContainer.remove(); authContainer = null; }

    const { scale } = calcolaLetterbox();

    // ── Container principale (overlay a schermo intero) ──────────
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

    // ── Titolo del gioco ─────────────────────────────────────────
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

    // ── Card centrale con il form ─────────────────────────────────
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

    // ── Tabs Login / Sign up ──────────────────────────────────────
    const tabRow = document.createElement("div");
    tabRow.style.cssText = `
        display:       flex;
        gap:           ${Math.round(8 * scale)}px;
        margin-bottom: ${Math.round(4 * scale)}px;
    `;

    let activeTab = "login";

    const tabLogin = _creaTab("Log in",  scale, true);
    const tabReg   = _creaTab("Sign up", scale, false);

    // ── Stile condiviso per i campi input ─────────────────────────
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

    // Campi del form (email e conferma password solo per la registrazione)
    const inputUser  = _creaInput("text",     "Username",         inputStyle);
    const inputEmail = _creaInput("email",    "Email",            inputStyle);
    const inputPass  = _creaInput("password", "Password",         inputStyle);
    const inputPass2 = _creaInput("password", "Confirm password", inputStyle);

    // Nasconde i campi solo per la registrazione (visibili solo nel tab Sign up)
    inputEmail.style.display = "none";
    inputPass2.style.display = "none";

    // ── Box messaggio (errori / conferme) ─────────────────────────
    const msgBox = document.createElement("div");
    msgBox.style.cssText = `
        font-size:   ${Math.round(13 * scale)}px;
        min-height:  ${Math.round(18 * scale)}px;
        text-align:  center;
        color:       rgb(220, 80, 80);
    `;
    // Se è stato passato un messaggio iniziale (es. "sessione scaduta"),
    // mostralo subito non appena la schermata compare.
    if (errorMsg) msgBox.textContent = errorMsg;

    // ── Bottone azione principale (Login / Sign up) ───────────────
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

    // ── Bottone "Gioca come ospite" ───────────────────────────────
    const btnOspite = document.createElement("button");
    btnOspite.textContent = "Play as guest";
    btnOspite.style.cssText = `
        height:      ${Math.round(36 * scale)}px;
        background:  transparent;
        color:       rgba(255,255,255,0.45);
        font-size:   ${Math.round(12 * scale)}px;
        font-family: monospace;
        border:      1px solid rgba(255,255,255,0.12);
        border-radius: 5px;
        cursor:      pointer;
    `;

    // ── Logica cambio tab ─────────────────────────────────────────
    function switchTab(tab) {
        activeTab = tab;
        if (tab === "login") {
            // Attiva tab Login, nasconde i campi solo per la registrazione
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
            // Attiva tab Sign up, mostra i campi aggiuntivi
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
        msgBox.textContent = ""; // pulisce i messaggi al cambio tab
    }

    tabLogin.addEventListener("click", () => switchTab("login"));
    tabReg.addEventListener("click",   () => switchTab("register"));

    btnAzione.addEventListener("click", () => eseguiAzione());

    // Permette di inviare il form con il tasto Enter da qualsiasi campo
    [inputUser, inputEmail, inputPass, inputPass2].forEach(el => {
        el.addEventListener("keydown", e => { if (e.key === "Enter") eseguiAzione(); });
    });

    // Ospite: salta l'auth e entra nel gioco senza account
    btnOspite.addEventListener("click", () => {
        rimuoviSchermataAuth();
        if (onAuthSuccess) onAuthSuccess(null); // null = ospite
    });

    // ── Login o Registrazione ─────────────────────────────────────
    async function eseguiAzione() {
        const username  = inputUser.value.trim();
        const email     = inputEmail.value.trim();
        const password  = inputPass.value;
        const password2 = inputPass2.value;

        msgBox.style.color = "rgb(220, 80, 80)"; // colore errore
        msgBox.textContent = "";

        if (activeTab === "login") {
            // ── LOGIN ──────────────────────────────────────────────
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
                    // Login riuscito:
                    //   1. Salva il token nel localStorage
                    //   2. Applica i cosmetics dell'account
                    //   3. Avvia il polling di keep-alive (sessione unica)
                    //   4. Chiama il callback di main.js per entrare nel gioco
                    localStorage.setItem("auth_token", data.token);
                    applyCosmeticsFromServer(data);
                    rimuoviSchermataAuth();
                    avviaSessionPoll(); // ← inizia il monitoraggio in background
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
            // ── REGISTRAZIONE ──────────────────────────────────────
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
                    // Registrazione ok → login automatico senza richiedere
                    // all'utente di rifare il login manualmente
                    const resLogin  = await fetch(`${PHP_BASE}/login.php`, {
                        method:  "POST",
                        headers: { "Content-Type": "application/json" },
                        body:    JSON.stringify({ username, password }),
                    });
                    const dataLogin = await resLogin.json();

                    if (dataLogin.ok) {
                        localStorage.setItem("auth_token", dataLogin.token);
                        applyCosmeticsFromServer(dataLogin);
                        rimuoviSchermataAuth();
                        avviaSessionPoll(); // ← inizia il monitoraggio
                        if (onAuthSuccess) onAuthSuccess(dataLogin);
                    } else {
                        // Login automatico fallito (raro): mostra il form login
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

    // ── Assembla il DOM ───────────────────────────────────────────
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

    // Focus automatico sul campo username per comodità
    setTimeout(() => inputUser.focus(), 50);
}

/**
 * Rimuove la schermata di autenticazione dal DOM.
 * Chiamato dopo login/registrazione riusciti o selezione ospite.
 */
export function rimuoviSchermataAuth() {
    if (authContainer) {
        authContainer.remove();
        authContainer = null;
    }
}

// ── Helper privati ────────────────────────────────────────────

/**
 * Crea un bottone tab (Login / Sign up) con lo stile corretto.
 * @param {string}  label  - Testo del tab
 * @param {number}  scale  - Fattore di scala letterbox
 * @param {boolean} active - Se true, viene stilato come tab attivo
 */
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

/**
 * Crea un campo input con il tipo, placeholder e stile specificati.
 * @param {string} type        - "text" | "email" | "password"
 * @param {string} placeholder - Testo segnaposto
 * @param {string} cssText     - Stile CSS inline
 */
function _creaInput(type, placeholder, cssText) {
    const input       = document.createElement("input");
    input.type        = type;
    input.placeholder = placeholder;
    input.style.cssText = cssText;
    // autocomplete appropriato per la password
    if (type === "password") input.autocomplete = "current-password";
    return input;
}