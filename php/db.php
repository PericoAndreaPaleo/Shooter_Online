<?php
// ============================================================
// db.php — Connessione al database MySQL
//
// Questo file viene incluso da tutti gli altri script PHP
// tramite require_once. Restituisce una connessione PDO
// al database MySQL di Clever Cloud.
//
// Le credenziali sono quelle del tuo addon Shooter_Online
// su Clever Cloud. Cambiale se le rigeneri.
// ============================================================

function getDB(): PDO {
    $host     = "bfeokmrnutfoddieljtb-mysql.services.clever-cloud.com";
    $port     = 3306;
    $dbname   = "bfeokmrnutfoddieljtb";
    $user     = "ugohnvtx6lb7cun6";
    $password = "IJv0Vr9pDt2LcfK3aW9K";

    $dsn = "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4";

    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        // SSL richiesto da Clever Cloud
        PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => false,
    ]);

    return $pdo;
}