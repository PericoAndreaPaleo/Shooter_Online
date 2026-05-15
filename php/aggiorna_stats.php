<?php
// ============================================================
// aggiorna_stats.php — Aggiornamento DELTA kills/morti in tempo reale
//
// Chiamato dal server Node.js a ogni kill e a ogni morte.
// Riceve via POST JSON: token, kills (delta 0 o 1), morti (delta 0 o 1)
//
// NON incrementa "partite" — quello viene gestito da salva_statistiche.php
// alla fine della sessione.
//
// Usa FOR UPDATE per scrittura esclusiva — evita race condition
// se due eventi arrivano contemporaneamente per lo stesso utente.
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

if (!$token) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing token.']);
    exit;
}

// Sanity check: accetta solo delta piccoli (max 1 per evento)
if ($kills < 0 || $kills > 1 || $morti < 0 || $morti > 1 || ($kills === 0 && $morti === 0)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid delta values.']);
    exit;
}

try {
    $pdo = getDB();

    // Verifica token valido
    $stmt = $pdo->prepare('
        SELECT utente_id FROM sessioni
        WHERE token = ? AND scade_il > NOW()
    ');
    $stmt->execute([$token]);
    $row = $stmt->fetch();

    if (!$row) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid token.']);
        exit;
    }

    $utenteId = $row['utente_id'];

    // Transazione con blocco esclusivo per evitare race condition
    $pdo->beginTransaction();

    $stmt = $pdo->prepare('
        SELECT kills_totali, morti_totali, xp, livello
        FROM statistiche_giocatore
        WHERE utente_id = ?
        FOR UPDATE
    ');
    $stmt->execute([$utenteId]);
    $stats = $stmt->fetch();

    // Applica il delta
    $nuoveKills = ($stats['kills_totali'] ?? 0) + $kills;
    $nuoveMorti = ($stats['morti_totali'] ?? 0) + $morti;

    // XP: 10 per kill (morti non danno XP)
    $nuovoXp      = ($stats['xp'] ?? 0) + ($kills * 10);
    $nuovoLivello = max(1, intdiv($nuovoXp, 100) + 1);

    $stmt = $pdo->prepare('
        UPDATE statistiche_giocatore
        SET kills_totali = ?, morti_totali = ?, xp = ?, livello = ?
        WHERE utente_id = ?
    ');
    $stmt->execute([$nuoveKills, $nuoveMorti, $nuovoXp, $nuovoLivello, $utenteId]);

    $pdo->commit();

    echo json_encode([
        'ok'      => true,
        'xp'      => $nuovoXp,
        'livello' => $nuovoLivello,
    ]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}