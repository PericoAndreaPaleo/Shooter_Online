<?php
// ============================================================
// logout.php — Logout utente
//
// Cancella:
//   • Token dal DB
//   • $_SESSION (sessione PHP nativa)
//   • Cookie auth_token e auth_username
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

// Avvia sessione per poterla distruggere
session_start();

$data  = json_decode(file_get_contents('php://input'), true);
$token = trim($data['token'] ?? $_SESSION['token'] ?? $_COOKIE['auth_token'] ?? '');

try {
    if ($token) {
        $pdo  = getDB();
        $stmt = $pdo->prepare('DELETE FROM sessioni WHERE token = ?');
        $stmt->execute([$token]);
    }

    // Distruggi sessione PHP
    $_SESSION = [];
    session_destroy();

    // Cancella cookie impostando scadenza nel passato
    setcookie('auth_token',    '', time() - 3600, '/', '', true, true);
    setcookie('auth_username', '', time() - 3600, '/', '', true, true);

    echo json_encode(['ok' => true]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}