<?php
// ============================================================
// db.php — Connessione al database MySQL (Clever Cloud)
//
// Le credenziali vengono lette dalle variabili d'ambiente del
// server PHP, NON scritte nel codice sorgente.
//
// Sul tuo server PHP imposta queste variabili d'ambiente:
//   MYSQL_HOST      = bfeokmrnutfoddieljtb-mysql.services.clever-cloud.com
//   MYSQL_PORT      = 3306
//   MYSQL_DB        = bfeokmrnutfoddieljtb
//   MYSQL_USER      = ugohnvtx6lb7cun6
//   MYSQL_PASSWORD  = (la tua password — CAMBIALA su Clever Cloud!)
//
// Su Apache/cPanel puoi usare SetEnv nel .htaccess:
//   SetEnv MYSQL_HOST "..."
//   SetEnv MYSQL_PASSWORD "..."
// ============================================================

function getDB(): PDO {
    $host     = getenv('MYSQL_HOST')     ?: 'localhost';
    $port     = getenv('MYSQL_PORT')     ?: 3306;
    $dbname   = getenv('MYSQL_DB')       ?: '';
    $user     = getenv('MYSQL_USER')     ?: '';
    $password = getenv('MYSQL_PASSWORD') ?: '';

    $dsn = "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4";

    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => false,
    ]);

    return $pdo;
}