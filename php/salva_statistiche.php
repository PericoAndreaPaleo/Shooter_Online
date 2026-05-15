<?php
// ============================================================
// salva_statistiche.php — Aggiorna kills e morti nel DB
//
// Chiamato dal server Node.js alla disconnessione del giocatore.
// Riceve via POST JSON: token, kills, morti
//
// Usa FOR UPDATE per scrittura esclusiva — evita che due
// disconnessioni simultanee sovrascrivano i dati a vicenda.
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

try {
    $pdo = getDB();

    // Trova l'utente dal token
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

    // FOR UPDATE — blocco esclusivo sulla riga durante l'aggiornamento.
    // Evita race condition se il giocatore si disconnette due volte contemporaneamente.
    $pdo->beginTransaction();

    $stmt = $pdo->prepare('
        SELECT kills_totali, morti_totali, partite, xp, livello
        FROM statistiche_giocatore
        WHERE utente_id = ?
        FOR UPDATE
    ');
    $stmt->execute([$utenteId]);
    $stats = $stmt->fetch();

    // Calcola nuovi valori cumulativi
    $nuoveKills  = ($stats['kills_totali'] ?? 0) + $kills;
    $nuoveMorti  = ($stats['morti_totali'] ?? 0) + $morti;
    $nuovePartite = ($stats['partite'] ?? 0) + 1;

    // XP: 10 per kill, 2 per partita completata
    $nuovoXp    = ($stats['xp'] ?? 0) + ($kills * 10) + 2;
    // Livello: ogni 100 XP
    $nuovoLivello = max(1, intdiv($nuovoXp, 100) + 1);

    $stmt = $pdo->prepare('
        UPDATE statistiche_giocatore
        SET kills_totali = ?, morti_totali = ?, partite = ?, xp = ?, livello = ?
        WHERE utente_id = ?
    ');
    $stmt->execute([$nuoveKills, $nuoveMorti, $nuovePartite, $nuovoXp, $nuovoLivello, $utenteId]);

    $pdo->commit();

    echo json_encode(['ok' => true, 'xp' => $nuovoXp, 'livello' => $nuovoLivello]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}