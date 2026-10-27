<?php
declare(strict_types=1);

final class Database
{
    private static ?PDO $connection = null;

    public static function config(): array
    {
        $path = getenv('TIDEMARK_CONFIG') ?: dirname((string) ($_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__, 2))) . '/tidemark-private/config.php';
        if (!is_file($path)) throw new RuntimeException('Tidemark configuration is missing.');
        $config = require $path;
        if (!is_array($config)) throw new RuntimeException('Tidemark configuration is invalid.');
        return $config;
    }

    public static function connect(): PDO
    {
        if (self::$connection) return self::$connection;
        $config = self::config();
        return self::$connection = new PDO($config['dsn'], $config['db_user'], $config['db_password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
}
