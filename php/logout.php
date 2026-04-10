<?php
// ============================================================
// logout.php — Logout utente
//
// Riceve via POST: token
// Cancella il token dalla tabella sessioni.
// Risponde con JSON: { ok: true }
// ============================================================

require_once 'db.php';

header('Content-Type: application/json');

$data  = json_decode(file_get_contents('php://input'), true);
$token = trim($data['token'] ?? '');

if (!$token) {
    http_response_code(400);
    echo json_encode(['error' => 'Token mancante.']);
    exit;
}

try {
    $pdo  = getDB();
    $stmt = $pdo->prepare('DELETE FROM sessioni WHERE token = ?');
    $stmt->execute([$token]);
    echo json_encode(['ok' => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}