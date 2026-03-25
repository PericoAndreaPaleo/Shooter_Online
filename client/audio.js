// ============================================================
// audio.js — Effetti sonori procedurali via Web Audio API
//
// Tutti i suoni sono sintetizzati al volo con oscillatori;
// non sono richiesti file audio esterni.
// L'AudioContext viene creato in modo lazy al primo utilizzo
// (i browser bloccano la creazione prima di un'interazione utente).
// ============================================================

/** Istanza singleton dell'AudioContext (lazy init) */
let audioContext = null;

/**
 * Restituisce l'AudioContext, creandolo al primo accesso.
 * Usare una singola istanza evita di consumare risorse.
 * @returns {AudioContext}
 */
function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

// ============================================================
// HELPER GENERICO PER SUONI BREVI
// ============================================================

/**
 * Riproduce un suono breve usando un oscillatore.
 * La frequenza scende (o sale) esponenzialmente da `startFreq`
 * a `endFreq` nel tempo `durationSec`.
 *
 * @param {string} _type        - Etichetta descrittiva (non usata tecnicamente)
 * @param {number} startFreq    - Frequenza iniziale in Hz
 * @param {number} endFreq      - Frequenza finale in Hz (usata se fornita)
 * @param {number} durationSec  - Durata del suono in secondi
 * @param {OscillatorType} waveType - Tipo d'onda: "square" | "sine" | "sawtooth" | "triangle"
 */
function playGenericSound(_type, startFreq, endFreq, durationSec, waveType = "square") {
    try {
        const ctx        = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode   = ctx.createGain();

        // Catena: oscillator → gain → uscita
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = waveType;
        oscillator.frequency.setValueAtTime(startFreq, ctx.currentTime);

        // Sweep di frequenza (portamento) se endFreq è specificato
        if (endFreq) {
            oscillator.frequency.exponentialRampToValueAtTime(
                endFreq,
                ctx.currentTime + durationSec
            );
        }

        // Inviluppo d'ampiezza: attacco immediato → fade out esponenziale
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + durationSec);
    } catch (e) {
        // Ignora errori (es. AudioContext non supportato o bloccato)
    }
}

// ============================================================
// SUONI SPECIFICI
// ============================================================

/**
 * Suono di sparo — onda quadra con discesa rapida di frequenza.
 * Durata: ~120ms. Simula lo sparo secco di un fucile.
 */
export const playShootSound = () => playGenericSound("shoot", 320, 80, 0.12);

/**
 * Suono di colpo ricevuto — onda a dente di sega, breve e acuto.
 * Durata: ~150ms. Feedback uditivo quando si viene colpiti.
 */
export const playHitSound = () => playGenericSound("hit", 600, 100, 0.15, "sawtooth");

/**
 * Suono di kill — onda sinusoidale con ascesa di frequenza.
 * Durata: ~200ms. Segnala al giocatore che ha eliminato un avversario.
 */
export const playKillSound = () => playGenericSound("kill", 880, 1100, 0.2, "sine");

/**
 * Suono del karambit (corpo a corpo) — colpo corto e sordo.
 * Onda a dente di sega con forte discesa: simula un impatto fisico.
 * Durata: ~80ms.
 */
export function playKnifeSound() {
    try {
        const ctx        = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode   = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = "sawtooth";

        // Scende velocemente da 180 Hz a 60 Hz
        oscillator.frequency.setValueAtTime(180, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.06);

        // Volume più alto del normale per l'impatto fisico
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.08);
    } catch (e) {}
}

/**
 * Suono di morte — tre toni discendenti sovrapposti.
 * Simula una caduta drammatica in tre "strati" sonori
 * con piccoli ritardi tra loro.
 * Durata totale: ~400ms.
 */
export function playDeathSound() {
    try {
        const ctx = getAudioContext();

        // Tre oscillatori sfasati di 100ms l'uno
        for (let i = 0; i < 3; i++) {
            const oscillator = ctx.createOscillator();
            const gainNode   = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            // Frequenze discendenti: 200Hz → 150Hz → 100Hz
            oscillator.frequency.value = 200 - i * 50;

            const startTime = ctx.currentTime + i * 0.1;
            gainNode.gain.setValueAtTime(0.2, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

            oscillator.start(startTime);
            oscillator.stop(startTime + 0.2);
        }
    } catch (e) {}
}