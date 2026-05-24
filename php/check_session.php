<?php
// ============================================================
// check_session.php — Verifica sessione esistente
//
// Riceve via POST JSON: { token: "..." }
// Risponde con: { ok: true, user: { ... } } oppure { error }
//
// FONTE DI VERITÀ: il token nel DB.
// $_SESSION PHP non viene usata per validare (ogni tab ha una
// sessione PHP separata e causerebbe logout casuali).
//
// SESSIONE UNICA: se il token non esiste nel DB significa che
// l'utente ha fatto login da un altro dispositivo/browser,
// che ha cancellato tutti i token precedenti. In questo caso
// si risponde con { error: "session_replaced" } — codice
// speciale che auth.js usa per mostrare il messaggio corretto
// ("Hai effettuato l'accesso da un altro dispositivo").
//
// ROLLING WINDOW: se mancano meno di 2 minuti alla scadenza
// (su 5 totali), il token viene prorogato automaticamente di
// altri 5 minuti. In produzione con 30 giorni, soglia = 7 giorni.
//
// PULIZIA: ogni chiamata elimina le sessioni scadute
// dell'utente corrente per tenere il DB pulito.
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

session_start();

// Determina il token da verificare:
// Priorità: body POST JSON > cookie > sessione PHP
$token    = '';
$bodyData = json_decode(file_get_contents('php://input'), true);
if (!empty($bodyData['token']))         $token = trim($bodyData['token']);
elseif (!empty($_COOKIE['auth_token'])) $token = trim($_COOKIE['auth_token']);
elseif (!empty($_SESSION['token']))     $token = trim($_SESSION['token']);

if (!$token) {
    http_response_code(400);
    echo json_encode(['error' => 'No active session.']);
    exit;
}

try {
    $pdo = getDB();

    // Controlla se il token esiste nel DB (anche scaduto, per distinguere
    // "mai esistito / già cancellato" da "scaduto per tempo")
    $stmtAny = $pdo->prepare('SELECT s.scade_il, s.utente_id, u.username FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.token = ?');
    $stmtAny->execute([$token]);
    $anyRow = $stmtAny->fetch();

    if (!$anyRow) {
        // Il token non esiste nel DB.
        // Con la sessione unica, questo significa che l'utente ha fatto
        // login da un altro dispositivo che ha cancellato questo token.
        // Pulizia locale e risposta con codice speciale.
        $_SESSION = [];
        session_destroy();
        setcookie('auth_token',    '', time() - 3600, '/', '', true, true);
        setcookie('auth_username', '', time() - 3600, '/', '', true, true);
        http_response_code(401);
        echo json_encode([
            'error'   => 'session_replaced',
            'message' => 'Your account has been logged in from another device. You have been disconnected.'
        ]);
        exit;
    }

    // Il token esiste ma potrebbe essere scaduto per il normale timeout
    $now     = new DateTime();
    $scadeIl = new DateTime($anyRow['scade_il']);
    if ($scadeIl <= $now) {
        // Scaduto per timeout normale (non per sessione unica):
        // elimina il token dal DB e pulisci.
        $pdo->prepare('DELETE FROM sessioni WHERE token = ?')->execute([$token]);
        $_SESSION = [];
        session_destroy();
        setcookie('auth_token',    '', time() - 3600, '/', '', true, true);
        setcookie('auth_username', '', time() - 3600, '/', '', true, true);
        http_response_code(401);
        echo json_encode(['error' => 'Session expired or invalid.']);
        exit;
    }

    // ── Token valido ────────────────────────────────────────────
    $session = $anyRow; // riuso la riga già letta

    // Pulizia opportunistica: elimina le sessioni scadute di questo utente.
    // Operazione leggera, sfrutta l'indice su (utente_id, scade_il).
    $pdo->prepare('DELETE FROM sessioni WHERE utente_id = ? AND scade_il <= NOW()')
        ->execute([$session['utente_id']]);

    // Rolling window: proroga il token se mancano meno di 2 minuti (su 5).
    // Per produzione con 30 giorni, usare: 7 * 86400 e strtotime('+30 days').
    if (($scadeIl->getTimestamp() - $now->getTimestamp()) < 120) {
        $nuovaScadenza = date('Y-m-d H:i:s', strtotime('+5 minutes'));
        $pdo->prepare('UPDATE sessioni SET scade_il = ? WHERE token = ?')
            ->execute([$nuovaScadenza, $token]);
        setcookie('auth_token',    $token,             time() + 300, '/', '', true, true);
        setcookie('auth_username', $session['username'], time() + 300, '/', '', true, true);
        $scadeIl = new DateTime($nuovaScadenza);
    }

    // Leggi statistiche (con lock condiviso per consistenza)
    $pdo->beginTransaction();
    $stmt = $pdo->prepare('
        SELECT livello, xp, kills_totali, morti_totali, partite
        FROM statistiche_giocatore
        WHERE utente_id = ?
        LOCK IN SHARE MODE
    ');
    $stmt->execute([$session['utente_id']]);
    $stats = $stmt->fetch();
    $pdo->commit();

    // Leggi cosmetics
    $stmt = $pdo->prepare('
        SELECT player_color_id, weapon_color_id
        FROM cosmetics_giocatore
        WHERE utente_id = ?
    ');
    $stmt->execute([$session['utente_id']]);
    $cosmetics = $stmt->fetch();

    // Aggiorna sessione PHP (solo per comodità, non usata per validare)
    $_SESSION['logged']   = true;
    $_SESSION['user_id']  = $session['utente_id'];
    $_SESSION['username'] = $session['username'];
    $_SESSION['token']    = $token;

    echo json_encode([
        'ok'   => true,
        'user' => array_merge(
            [
                'utente_id'       => $session['utente_id'],
                'username'        => $session['username'],
                'session_expires' => $scadeIl->format('Y-m-d H:i:s'),
            ],
            $stats     ?: [],
            [
                'player_color_id' => $cosmetics['player_color_id'] ?? null,
                'weapon_color_id' => $cosmetics['weapon_color_id'] ?? null,
            ]
        )
    ]);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}