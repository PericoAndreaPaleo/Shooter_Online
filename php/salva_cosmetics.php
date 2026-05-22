<?php
// ============================================================
// salva_cosmetics.php — Salva/leggi skin Battle Pass nel DB
//
// POST { token, player_color_id, weapon_color_id }
//   → aggiorna cosmetics_giocatore per l'utente del token
//   → risponde { ok: true }
//
// GET { token } (via querystring)
//   → risponde { ok: true, player_color_id, weapon_color_id }
// ============================================================

require_once 'db.php';

header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

session_start();

$pdo = getDB();

// Recupera token (POST body > cookie > sessione)
$bodyData = json_decode(file_get_contents('php://input'), true) ?: [];
$token = trim($bodyData['token'] ?? $_COOKIE['auth_token'] ?? $_SESSION['token'] ?? '');

if (!$token) {
    http_response_code(401);
    echo json_encode(['error' => 'Not authenticated.']);
    exit;
}

// Valida token
$stmt = $pdo->prepare('SELECT utente_id FROM sessioni WHERE token = ? AND scade_il > NOW()');
$stmt->execute([$token]);
$row = $stmt->fetch();
if (!$row) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid or expired token.']);
    exit;
}
$userId = $row['utente_id'];

try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($bodyData['player_color_id'], $bodyData['weapon_color_id'])) {
        // Salva cosmetics (INSERT ... ON DUPLICATE KEY UPDATE)
        $pColor = $bodyData['player_color_id'] ?: null;
        $wColor = $bodyData['weapon_color_id'] ?: null;

        $pdo->prepare('
            INSERT INTO cosmetics_giocatore (utente_id, player_color_id, weapon_color_id)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
                player_color_id = VALUES(player_color_id),
                weapon_color_id = VALUES(weapon_color_id)
        ')->execute([$userId, $pColor, $wColor]);

        echo json_encode(['ok' => true]);
    } else {
        // Leggi cosmetics
        $stmt = $pdo->prepare('SELECT player_color_id, weapon_color_id FROM cosmetics_giocatore WHERE utente_id = ?');
        $stmt->execute([$userId]);
        $c = $stmt->fetch();
        echo json_encode([
            'ok'             => true,
            'player_color_id'=> $c['player_color_id'] ?? null,
            'weapon_color_id'=> $c['weapon_color_id'] ?? null,
        ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}