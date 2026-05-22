<?php
// ============================================================
// check_session.php — Verifica sessione esistente
//
// Legge il token da: $_SESSION > cookie > body POST
// Risponde con: { ok: true, user: { ... } } oppure { error }
//
// FIX: usa SOLO il token DB come fonte di verità.
//      $_SESSION non viene usata per la validazione (ogni tab
//      ha una sessione PHP diversa — causerebbe logout random).
//      Il token viene prorogato automaticamente se mancano
//      meno di 7 giorni alla scadenza (rolling window 30gg).
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

session_start();

// Determina il token (localStorage via POST > cookie > sessione PHP)
$token = '';
$bodyData = json_decode(file_get_contents('php://input'), true);
if (!empty($bodyData['token']))       $token = trim($bodyData['token']);
elseif (!empty($_COOKIE['auth_token'])) $token = trim($_COOKIE['auth_token']);
elseif (!empty($_SESSION['token']))   $token = trim($_SESSION['token']);

if (!$token) {
    http_response_code(400);
    echo json_encode(['error' => 'No active session.']);
    exit;
}

try {
    $pdo = getDB();

    // Verifica token nel DB — $_SESSION non usata per validare
    $stmt = $pdo->prepare('
        SELECT s.utente_id, s.scade_il, u.username
        FROM sessioni s
        JOIN utenti u ON u.id = s.utente_id
        WHERE s.token = ? AND s.scade_il > NOW()
    ');
    $stmt->execute([$token]);
    $session = $stmt->fetch();

    if (!$session) {
        // Token scaduto o inesistente: pulisci tutto
        $_SESSION = [];
        session_destroy();
        setcookie('auth_token',    '', time() - 3600, '/', '', true, true);
        setcookie('auth_username', '', time() - 3600, '/', '', true, true);
        http_response_code(401);
        echo json_encode(['error' => 'Session expired or invalid.']);
        exit;
    }

    // Rolling window: se mancano meno di 7 giorni alla scadenza, proroga a 30gg
    $scadeIl    = new DateTime($session['scade_il']);
    $ora        = new DateTime();
    $diff       = $ora->diff($scadeIl);
    $giorniRima = $diff->days + ($diff->invert ? 0 : 0);
    if ($scadeIl > $ora && ($scadeIl->getTimestamp() - $ora->getTimestamp()) < 7 * 86400) {
        $nuovaScadenza = date('Y-m-d H:i:s', strtotime('+30 days'));
        $upd = $pdo->prepare('UPDATE sessioni SET scade_il = ? WHERE token = ?');
        $upd->execute([$nuovaScadenza, $token]);
        // Aggiorna il cookie con la nuova scadenza
        setcookie('auth_token',    $token,                    time() + (30 * 24 * 3600), '/', '', true, true);
        setcookie('auth_username', $session['username'],      time() + (30 * 24 * 3600), '/', '', true, true);
    }

    // Leggi statistiche
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

    // Aggiorna sessione PHP (solo per comodità lato server, non usata per validare)
    $_SESSION['logged']   = true;
    $_SESSION['user_id']  = $session['utente_id'];
    $_SESSION['username'] = $session['username'];
    $_SESSION['token']    = $token;

    echo json_encode([
        'ok'   => true,
        'user' => array_merge(
            ['utente_id' => $session['utente_id'], 'username' => $session['username']],
            $stats     ?: [],
            ['player_color_id' => $cosmetics['player_color_id'] ?? null,
             'weapon_color_id' => $cosmetics['weapon_color_id'] ?? null]
        )
    ]);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}