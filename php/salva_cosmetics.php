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
//
// Il blocco POST è racchiuso in una transazione esplicita:
// la validazione del token (SELECT su sessioni) e il salvataggio
// (INSERT/UPDATE su cosmetics_giocatore) formano un'unica unità
// atomica. Se qualsiasi operazione fallisce — errore di rete,
// crash, deadlock — il rollback riporta il DB allo stato iniziale
// e il client riceve un errore pulito invece di un dato a metà.
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

// ── POST: salva cosmetics in transazione ─────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($bodyData['player_color_id'], $bodyData['weapon_color_id'])) {

    try {
        // Avvia la transazione: da qui in poi ogni query
        // fa parte di un'unica operazione atomica.
        $pdo->beginTransaction();

        // 1) Valida il token dentro la transazione.
        //    FOR UPDATE blocca la riga per tutta la durata della
        //    transazione, evitando che un'altra richiesta concorrente
        //    usi lo stesso token mentre stiamo ancora scrivendo.
        $stmt = $pdo->prepare('
            SELECT utente_id FROM sessioni
            WHERE token = ? AND scade_il > NOW()
            LIMIT 1
            FOR UPDATE
        ');
        $stmt->execute([$token]);
        $row = $stmt->fetch();

        if (!$row) {
            // Token non valido: rollback e risposta 401.
            // Nulla è stato modificato nel DB.
            $pdo->rollBack();
            http_response_code(401);
            echo json_encode(['error' => 'Invalid or expired token.']);
            exit;
        }

        $userId = $row['utente_id'];
        $pColor = $bodyData['player_color_id'] ?: null;
        $wColor = $bodyData['weapon_color_id'] ?: null;

        // 2) Salva i cosmetics.
        //    INSERT ... ON DUPLICATE KEY UPDATE è atomico di per sé,
        //    ma racchiuderlo nella transazione insieme alla SELECT
        //    garantisce che le due operazioni non vengano mai separate.
        $pdo->prepare('
            INSERT INTO cosmetics_giocatore (utente_id, player_color_id, weapon_color_id)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
                player_color_id = VALUES(player_color_id),
                weapon_color_id = VALUES(weapon_color_id)
        ')->execute([$userId, $pColor, $wColor]);

        // 3) Tutto ok: rende permanenti entrambe le operazioni.
        $pdo->commit();

        echo json_encode(['ok' => true]);

    } catch (Exception $e) {
        // Qualsiasi eccezione (errore DB, timeout, ecc.) fa rollback:
        // il DB torna allo stato precedente alla beginTransaction().
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }

// ── GET: leggi cosmetics (nessuna transazione necessaria) ─────
} else {

    try {
        // Valida token (senza FOR UPDATE: è una sola lettura, nessun rischio)
        $stmt = $pdo->prepare('SELECT utente_id FROM sessioni WHERE token = ? AND scade_il > NOW()');
        $stmt->execute([$token]);
        $row = $stmt->fetch();

        if (!$row) {
            http_response_code(401);
            echo json_encode(['error' => 'Invalid or expired token.']);
            exit;
        }

        $userId = $row['utente_id'];

        $stmt = $pdo->prepare('SELECT player_color_id, weapon_color_id FROM cosmetics_giocatore WHERE utente_id = ?');
        $stmt->execute([$userId]);
        $c = $stmt->fetch();

        echo json_encode([
            'ok'              => true,
            'player_color_id' => $c['player_color_id'] ?? null,
            'weapon_color_id' => $c['weapon_color_id'] ?? null,
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}