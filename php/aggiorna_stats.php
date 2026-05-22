<?php
// ============================================================
// aggiorna_stats.php  —  Aggiornamento DELTA kills/morti in tempo reale
//
// Chiamato dal client:
//   • a ogni kill  → { token, kills: 1, morti: 0 }
//   • a ogni morte → { token, kills: 0, morti: 1 }
//
// Usa una transazione esplicita perché devono essere atomiche:
//   1) la validazione del token (SELECT su sessioni)
//   2) l'aggiornamento di kills/morti/xp/livello (UPDATE su statistiche_giocatore)
//
// Se una delle due fallisce — errore DB, crash, timeout — il rollback
// garantisce che il DB non rimanga con un token validato ma le stat
// non aggiornate (o viceversa). O tutto va a buon fine, o niente.
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

$data  = json_decode(file_get_contents('php://input'), true);
$token = trim($data['token'] ?? '');
$kills = intval($data['kills'] ?? 0);
$morti = intval($data['morti'] ?? 0);

// Validazione input
if (!$token) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing token.']);
    exit;
}

// Ogni chiamata deve essere esattamente +1 kills OPPURE +1 morti, mai entrambi
// e mai 0+0 (operazione vuota).
if (!( ($kills === 1 && $morti === 0) || ($kills === 0 && $morti === 1) )) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid delta: must be exactly {kills:1,morti:0} or {kills:0,morti:1}.']);
    exit;
}

$deltaXp = $kills * 10; // +10 XP per kill, +0 XP per morte

try {
    $pdo = getDB();

    // Avvia la transazione: validazione token + aggiornamento stat
    // devono essere un'unica operazione atomica.
    $pdo->beginTransaction();

    // 1) Valida il token.
    //    FOR UPDATE blocca la riga per tutta la durata della transazione,
    //    impedendo che due richieste simultanee (es. kill e morte nello
    //    stesso istante) leggano entrambe il token prima che una delle
    //    due abbia finito di aggiornare le stat.
    $stmt = $pdo->prepare('
        SELECT utente_id FROM sessioni
        WHERE token = ? AND scade_il > NOW()
        LIMIT 1
        FOR UPDATE
    ');
    $stmt->execute([$token]);
    $row = $stmt->fetch();

    if (!$row) {
        $pdo->rollBack();
        http_response_code(401);
        echo json_encode(['error' => 'Token non valido o scaduto.']);
        exit;
    }

    $utenteId = $row['utente_id'];

    // 2) Aggiorna kills, morti, XP e livello in un singolo UPDATE.
    //    Dentro la transazione questo UPDATE è garantito ad eseguirsi
    //    o completamente o per niente — se il DB va down a metà scrittura,
    //    al recovery MySQL annulla l'intera transazione.
    $stmt = $pdo->prepare('
        UPDATE statistiche_giocatore
        SET kills_totali = kills_totali + ?,
            morti_totali = morti_totali + ?,
            xp           = xp + ?,
            livello      = GREATEST(1, FLOOR((xp + ?) / 100) + 1)
        WHERE utente_id = ?
    ');
    $stmt->execute([$kills, $morti, $deltaXp, $deltaXp, $utenteId]);

    // 3) Tutto ok: rende permanenti entrambe le operazioni insieme.
    $pdo->commit();

    echo json_encode(['ok' => true]);

} catch (Exception $e) {
    // Qualsiasi eccezione fa rollback: le stat tornano al valore
    // precedente alla chiamata, nessun dato parziale nel DB.
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}