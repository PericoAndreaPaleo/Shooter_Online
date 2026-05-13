<?php
// ============================================================
// classifica.php — Classifica globale giocatori
//
// Risponde con JSON: array dei top 10 giocatori per kills totali.
// Chiamato dal client per mostrare la leaderboard.
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

try {
    $pdo = getDB();

    $stmt = $pdo->prepare('
        SELECT u.username, g.kills_totali, g.morti_totali, g.partite, g.livello, g.xp
        FROM statistiche_giocatore g
        JOIN utenti u ON u.id = g.utente_id
        ORDER BY g.kills_totali DESC, g.morti_totali ASC
        LIMIT 10
    ');
    $stmt->execute();
    $classifica = $stmt->fetchAll();

    echo json_encode(['ok' => true, 'classifica' => $classifica]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}