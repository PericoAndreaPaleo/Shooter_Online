<?php
// ============================================================
// register.php — Registrazione nuovo utente
//
// Riceve via POST: username, email, password
// Risponde con JSON: { ok: true, userId: X } oppure { error: "..." }
//
// Test con il form test.html oppure con curl:
//   curl -X POST http://localhost/php/register.php \
//        -H "Content-Type: application/json" \
//        -d '{"username":"Mario","email":"mario@test.it","password":"123456"}'
// ============================================================

require_once 'db.php';

// Permette chiamate cross-origin dal dominio di Render
header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

// Legge il body JSON
$data     = json_decode(file_get_contents('php://input'), true);
$username = trim($data['username'] ?? '');
$email    = trim($data['email']    ?? '');
$password = $data['password']      ?? '';

// ── Validazione ───────────────────────────────────────────────
if (!$username || !$email || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Campi mancanti.']);
    exit;
}

if (strlen($username) < 3 || strlen($username) > 30) {
    http_response_code(400);
    echo json_encode(['error' => 'Username deve essere tra 3 e 30 caratteri.']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Email non valida.']);
    exit;
}

if (strlen($password) < 6) {
    http_response_code(400);
    echo json_encode(['error' => 'Password troppo corta (minimo 6 caratteri).']);
    exit;
}

try {
    $pdo = getDB();

    // Controlla se username o email esistono già
    $stmt = $pdo->prepare('SELECT id FROM utenti WHERE username = ? OR email = ?');
    $stmt->execute([$username, $email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => 'Username o email già in uso.']);
        exit;
    }

    // Hash della password con bcrypt
    $hash = password_hash($password, PASSWORD_BCRYPT);

    // Inserisce il nuovo utente
    $stmt = $pdo->prepare('INSERT INTO utenti (username, email, password_hash) VALUES (?, ?, ?)');
    $stmt->execute([$username, $email, $hash]);
    $newId = $pdo->lastInsertId();

    // Crea la riga statistiche vuota per il nuovo utente
    $stmt = $pdo->prepare('INSERT INTO statistiche_giocatore (utente_id) VALUES (?)');
    $stmt->execute([$newId]);

    echo json_encode(['ok' => true, 'userId' => $newId]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore server: ' . $e->getMessage()]);
}