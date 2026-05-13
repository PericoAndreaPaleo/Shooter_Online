<?php
// ============================================================
// auth.php — Autenticazione con tecnica PostBack
//
// Questo file gestisce sia la visualizzazione del form HTML
// sia l'elaborazione dei dati tramite $_SERVER['PHP_SELF'].
//
// Tecniche utilizzate:
//   • PostBack:   $_SERVER['PHP_SELF'] per inviare il form a sé stesso
//   • Sessioni:   session_start(), $_SESSION per mantenere lo stato
//   • Cookie:     setcookie() per ricordare l'utente
//   • Prepared statement: PDO prepare()/execute() contro SQL injection
//   • Sanificazione: trim(), filter_var(), htmlspecialchars()
// ============================================================

require_once 'db.php';

// Permette chiamate cross-origin dal dominio di Render
header('Access-Control-Allow-Origin: https://shooter-online.onrender.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Avvio sessione PHP nativa ─────────────────────────────────
session_start();

$action  = $_POST['action']  ?? $_GET['action']  ?? '';
$message = '';
$msgType = ''; // 'success' | 'error'

// ============================================================
// ELABORAZIONE POST (PostBack)
// Il form invia a $_SERVER['PHP_SELF'] — stessa pagina
// ============================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // ── LOGOUT ───────────────────────────────────────────────
    if ($action === 'logout') {
        // Cancella token dal DB se presente in sessione
        if (!empty($_SESSION['token'])) {
            try {
                $pdo  = getDB();
                $stmt = $pdo->prepare('DELETE FROM sessioni WHERE token = ?');
                $stmt->execute([$_SESSION['token']]);
            } catch (Exception $e) { /* ignora */ }
        }

        // Cancella cookie
        setcookie('auth_token', '', time() - 3600, '/', '', true, true);
        setcookie('auth_username', '', time() - 3600, '/', '', true, true);

        // Distruggi sessione PHP
        $_SESSION = [];
        session_destroy();

        $message = 'Logout effettuato.';
        $msgType = 'success';
    }

    // ── LOGIN ────────────────────────────────────────────────
    elseif ($action === 'login') {
        // Sanificazione input
        $username = trim(htmlspecialchars($_POST['username'] ?? '', ENT_QUOTES, 'UTF-8'));
        $password = $_POST['password'] ?? '';
        $remember = isset($_POST['remember']); // checkbox "Ricordami"

        if (!$username || !$password) {
            $message = 'Inserisci username e password.';
            $msgType = 'error';
        } else {
            try {
                $pdo = getDB();

                // Prepared statement — cerca utente
                $stmt = $pdo->prepare('SELECT id, password_hash FROM utenti WHERE username = ?');
                $stmt->execute([$username]);
                $user = $stmt->fetch();

                if (!$user || !password_verify($password, $user['password_hash'])) {
                    $message = 'Credenziali errate.';
                    $msgType = 'error';
                } else {
                    // Genera token sicuro
                    $token   = bin2hex(random_bytes(32));
                    $scadeIl = date('Y-m-d H:i:s', strtotime('+7 days'));

                    // Salva token nel DB
                    $stmt = $pdo->prepare('INSERT INTO sessioni (token, utente_id, scade_il) VALUES (?, ?, ?)');
                    $stmt->execute([$token, $user['id'], $scadeIl]);

                    // Aggiorna ultimo accesso
                    $stmt = $pdo->prepare('UPDATE utenti SET ultimo_accesso = NOW() WHERE id = ?');
                    $stmt->execute([$user['id']]);

                    // ── Sessione PHP ──────────────────────────
                    $_SESSION['token']    = $token;
                    $_SESSION['user_id']  = $user['id'];
                    $_SESSION['username'] = $username;
                    $_SESSION['logged']   = true;

                    // ── Cookie ───────────────────────────────
                    $cookieExpire = $remember ? time() + (7 * 24 * 3600) : 0;
                    setcookie('auth_token',    $token,    $cookieExpire, '/', '', true, true);
                    setcookie('auth_username', $username, $cookieExpire, '/', '', true, true);

                    $message = 'Login effettuato. Bentornato, ' . htmlspecialchars($username) . '!';
                    $msgType = 'success';
                }
            } catch (Exception $e) {
                $message = 'Errore server: ' . $e->getMessage();
                $msgType = 'error';
            }
        }
    }

    // ── REGISTRAZIONE ────────────────────────────────────────
    elseif ($action === 'register') {
        // Sanificazione input
        $username  = trim(htmlspecialchars($_POST['username']  ?? '', ENT_QUOTES, 'UTF-8'));
        $email     = trim(htmlspecialchars($_POST['email']     ?? '', ENT_QUOTES, 'UTF-8'));
        $password  = $_POST['password']  ?? '';
        $password2 = $_POST['password2'] ?? '';

        // Validazione
        if (!$username || !$email || !$password || !$password2) {
            $message = 'Compila tutti i campi.';
            $msgType = 'error';
        } elseif (strlen($username) < 3 || strlen($username) > 30) {
            $message = 'Username deve essere tra 3 e 30 caratteri.';
            $msgType = 'error';
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $message = 'Email non valida.';
            $msgType = 'error';
        } elseif (strlen($password) < 6) {
            $message = 'Password troppo corta (minimo 6 caratteri).';
            $msgType = 'error';
        } elseif ($password !== $password2) {
            $message = 'Le password non coincidono.';
            $msgType = 'error';
        } else {
            try {
                $pdo = getDB();

                // Controlla duplicati
                $stmt = $pdo->prepare('SELECT id FROM utenti WHERE username = ? OR email = ?');
                $stmt->execute([$username, $email]);
                if ($stmt->fetch()) {
                    $message = 'Username o email già in uso.';
                    $msgType = 'error';
                } else {
                    // ── Transazione ───────────────────────────
                    $pdo->beginTransaction();
                    try {
                        $hash = password_hash($password, PASSWORD_BCRYPT);

                        $stmt = $pdo->prepare('INSERT INTO utenti (username, email, password_hash) VALUES (?, ?, ?)');
                        $stmt->execute([$username, $email, $hash]);
                        $newId = $pdo->lastInsertId();

                        $stmt = $pdo->prepare('INSERT INTO statistiche_giocatore (utente_id) VALUES (?)');
                        $stmt->execute([$newId]);

                        $pdo->commit();

                        $message = 'Account creato con successo! Ora puoi accedere.';
                        $msgType = 'success';
                        $action  = 'show_login'; // mostra form login dopo registrazione
                    } catch (Exception $e) {
                        $pdo->rollBack();
                        throw $e;
                    }
                }
            } catch (Exception $e) {
                $message = 'Errore server: ' . $e->getMessage();
                $msgType = 'error';
            }
        }
    }
}

// ── Controlla sessione o cookie esistente ─────────────────────
$loggedUser = null;
if (!empty($_SESSION['logged']) && !empty($_SESSION['username'])) {
    $loggedUser = $_SESSION['username'];
} elseif (!empty($_COOKIE['auth_token'])) {
    // Ripristina sessione dal cookie
    try {
        $pdo  = getDB();
        $stmt = $pdo->prepare('
            SELECT u.username, u.id
            FROM sessioni s
            JOIN utenti u ON u.id = s.utente_id
            WHERE s.token = ? AND s.scade_il > NOW()
        ');
        $stmt->execute([$_COOKIE['auth_token']]);
        $row = $stmt->fetch();
        if ($row) {
            $_SESSION['logged']   = true;
            $_SESSION['username'] = $row['username'];
            $_SESSION['user_id']  = $row['id'];
            $_SESSION['token']    = $_COOKIE['auth_token'];
            $loggedUser = $row['username'];
        }
    } catch (Exception $e) { /* ignora */ }
}

// Risposta JSON se chiamata da fetch() (gioco)
$isAjax = !empty($_SERVER['HTTP_X_REQUESTED_WITH']) ||
          (isset($_SERVER['CONTENT_TYPE']) && str_contains($_SERVER['CONTENT_TYPE'], 'application/json'));
if ($isAjax) {
    header('Content-Type: application/json');
    if ($loggedUser) {
        echo json_encode(['ok' => true, 'username' => $loggedUser, 'token' => $_SESSION['token'] ?? '']);
    } else {
        echo json_encode(['ok' => false, 'error' => $message ?: 'Non autenticato.']);
    }
    exit;
}

// ── Determina quale form mostrare ────────────────────────────
$showRegister = ($action === 'register' && $msgType === 'error') || $action === 'show_register';
?>
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shooter Online — Autenticazione</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: monospace;
            background: rgb(5, 10, 5);
            color: white;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        h1 {
            color: rgb(0, 255, 100);
            font-size: clamp(24px, 5vw, 42px);
            letter-spacing: 3px;
            margin-bottom: 8px;
            text-align: center;
        }

        .subtitle {
            color: rgba(255,255,255,0.5);
            font-size: clamp(12px, 2vw, 14px);
            margin-bottom: 28px;
            letter-spacing: 1px;
        }

        .card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 10px;
            padding: clamp(20px, 4vw, 32px);
            width: 100%;
            max-width: 360px;
        }

        .tab-row {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
        }

        .tab {
            flex: 1;
            height: 36px;
            background: transparent;
            color: rgba(255,255,255,0.45);
            font-size: 13px;
            font-family: monospace;
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 5px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .tab.active {
            background: rgba(0,255,100,0.15);
            color: rgb(0,255,100);
            border-color: rgb(0,255,100);
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 12px;
        }

        input[type="text"],
        input[type="email"],
        input[type="password"] {
            width: 100%;
            height: 42px;
            background: rgba(255,255,255,0.07);
            border: 1px solid rgba(255,255,255,0.18);
            border-radius: 5px;
            color: white;
            font-size: 14px;
            font-family: monospace;
            padding: 0 12px;
            outline: none;
        }

        input:focus {
            border-color: rgb(0, 255, 100);
        }

        .remember-row {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: rgba(255,255,255,0.6);
            margin-bottom: 4px;
        }

        .message {
            font-size: 13px;
            min-height: 18px;
            text-align: center;
            margin-bottom: 8px;
            padding: 6px;
            border-radius: 4px;
        }
        .message.error   { color: rgb(220, 80, 80);  background: rgba(220,80,80,0.1); }
        .message.success { color: rgb(0, 220, 100);  background: rgba(0,220,100,0.1); }

        .btn-main {
            width: 100%;
            height: 46px;
            background: rgb(0, 180, 70);
            color: white;
            font-size: 16px;
            font-weight: bold;
            font-family: monospace;
            letter-spacing: 2px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            margin-bottom: 10px;
        }

        .btn-main:hover { background: rgb(0, 210, 80); }

        .btn-guest {
            width: 100%;
            height: 36px;
            background: transparent;
            color: rgba(255,255,255,0.45);
            font-size: 12px;
            font-family: monospace;
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 5px;
            cursor: pointer;
        }

        .btn-guest:hover { border-color: rgba(255,255,255,0.3); color: rgba(255,255,255,0.7); }

        .logged-box {
            text-align: center;
        }

        .logged-box .username {
            font-size: 24px;
            color: rgb(0, 200, 255);
            margin: 12px 0;
        }

        .logged-box .info {
            color: rgba(255,255,255,0.5);
            font-size: 13px;
            margin-bottom: 20px;
        }

        .btn-logout {
            width: 100%;
            height: 40px;
            background: rgba(220, 80, 80, 0.2);
            color: rgb(220, 80, 80);
            font-family: monospace;
            font-size: 14px;
            border: 1px solid rgb(220, 80, 80);
            border-radius: 6px;
            cursor: pointer;
            margin-bottom: 10px;
        }

        .btn-play {
            width: 100%;
            height: 46px;
            background: rgb(0, 180, 70);
            color: white;
            font-size: 18px;
            font-weight: bold;
            font-family: monospace;
            letter-spacing: 2px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            text-decoration: none;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 10px;
        }

        /* Responsive */
        @media (max-width: 400px) {
            .card { padding: 16px; }
            h1 { font-size: 28px; }
        }
    </style>
</head>
<body>

<h1>SHOOTER ONLINE</h1>
<p class="subtitle">
    <?php echo $loggedUser ? 'Bentornato!' : 'Accedi per giocare'; ?>
</p>

<div class="card">

<?php if ($loggedUser): ?>
    <!-- ── Utente già loggato ─────────────────────────────── -->
    <div class="logged-box">
        <div style="color:rgba(255,255,255,0.5); font-size:13px;">Sei connesso come</div>
        <div class="username"><?= htmlspecialchars($loggedUser) ?></div>
        <div class="info">Sessione attiva · Cookie impostato</div>

        <?php if ($message): ?>
            <div class="message <?= $msgType ?>"><?= htmlspecialchars($message) ?></div>
        <?php endif; ?>

        <a href="/" class="btn-play">▶ GIOCA</a>

        <form method="POST" action="<?= htmlspecialchars($_SERVER['PHP_SELF']) ?>">
            <input type="hidden" name="action" value="logout">
            <button type="submit" class="btn-logout">Logout</button>
        </form>
    </div>

<?php else: ?>
    <!-- ── Tab login / registrazione ─────────────────────── -->
    <div class="tab-row">
        <button class="tab <?= !$showRegister ? 'active' : '' ?>"
                onclick="showTab('login')" type="button">Accedi</button>
        <button class="tab <?= $showRegister ? 'active' : '' ?>"
                onclick="showTab('register')" type="button">Registrati</button>
    </div>

    <?php if ($message): ?>
        <div class="message <?= $msgType ?>"><?= htmlspecialchars($message) ?></div>
    <?php endif; ?>

    <!-- ── Form LOGIN ────────────────────────────────────── -->
    <div id="form-login" style="display: <?= $showRegister ? 'none' : 'block' ?>">
        <form method="POST" action="<?= htmlspecialchars($_SERVER['PHP_SELF']) ?>">
            <input type="hidden" name="action" value="login">
            <div class="form-group">
                <input type="text" name="username" placeholder="Username"
                       minlength="3" maxlength="30" required
                       value="<?= htmlspecialchars($_POST['username'] ?? '') ?>">
                <input type="password" name="password" placeholder="Password"
                       minlength="6" required autocomplete="current-password">
            </div>
            <div class="remember-row">
                <input type="checkbox" name="remember" id="remember">
                <label for="remember">Ricordami (cookie persistente)</label>
            </div>
            <button type="submit" class="btn-main">ACCEDI</button>
        </form>
        <button class="btn-guest" onclick="window.location='/'">Gioca come ospite</button>
    </div>

    <!-- ── Form REGISTRAZIONE ────────────────────────────── -->
    <div id="form-register" style="display: <?= $showRegister ? 'block' : 'none' ?>">
        <form method="POST" action="<?= htmlspecialchars($_SERVER['PHP_SELF']) ?>">
            <input type="hidden" name="action" value="register">
            <div class="form-group">
                <input type="text" name="username" placeholder="Username"
                       minlength="3" maxlength="30" required
                       value="<?= htmlspecialchars($_POST['username'] ?? '') ?>">
                <input type="email" name="email" placeholder="Email"
                       required
                       value="<?= htmlspecialchars($_POST['email'] ?? '') ?>">
                <input type="password" name="password" placeholder="Password"
                       minlength="6" required autocomplete="new-password">
                <input type="password" name="password2" placeholder="Ripeti password"
                       minlength="6" required autocomplete="new-password">
            </div>
            <button type="submit" class="btn-main">REGISTRATI</button>
        </form>
        <button class="btn-guest" onclick="window.location='/'">Gioca come ospite</button>
    </div>

<?php endif; ?>

</div><!-- .card -->

<script>
function showTab(tab) {
    document.getElementById('form-login').style.display    = tab === 'login'    ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
    document.querySelectorAll('.tab').forEach((t, i) => {
        t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1));
    });
}
</script>

</body>
</html>