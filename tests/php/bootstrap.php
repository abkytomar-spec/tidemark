<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/src/Database.php';
require_once __DIR__ . '/../../api/src/Http.php';
require_once __DIR__ . '/../../api/src/Auth.php';
require_once __DIR__ . '/../../api/src/Domain.php';
require_once __DIR__ . '/../../api/src/GlobalSafe.php';
require_once __DIR__ . '/../../api/src/DailyMoments.php';
require_once __DIR__ . '/../../api/src/Tasks.php';
require_once __DIR__ . '/../../api/src/Goals.php';
require_once __DIR__ . '/../../api/src/Gym.php';
require_once __DIR__ . '/../../api/src/Sync.php';
require_once __DIR__ . '/../../api/src/Photos.php';

$tests = [];

function test(string $name, Closure $callback): void
{
    global $tests;
    $tests[] = [$name, $callback];
}

function assert_same(mixed $expected, mixed $actual): void
{
    if ($expected !== $actual) {
        throw new RuntimeException('Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

function assert_true(bool $value, string $message = 'Expected true'): void
{
    if (!$value) throw new RuntimeException($message);
}

function db(): PDO
{
    return Database::connect();
}

function fresh_database(): void
{
    $pdo = db();
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
        $pdo->exec('DROP TABLE `' . str_replace('`', '``', (string) $table) . '`');
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    $pdo->exec((string) file_get_contents(__DIR__ . '/../../database/schema.sql'));
}

function expect_http(int $status, Closure $callback): HttpError
{
    try {
        $callback();
    } catch (HttpError $error) {
        assert_same($status, $error->status);
        return $error;
    }
    throw new RuntimeException("Expected HTTP {$status}");
}

function owner(): array
{
    return Auth::setup(db(), ['email' => 'owner@example.com', 'password' => 'correct horse battery staple', 'timezone' => 'Asia/Kolkata']);
}

function task_input(array $overrides = []): array
{
    return array_replace([
        'title' => 'Study', 'notes' => '', 'priority' => 'medium', 'color' => '#5B8DEF',
        'estimatedMinutes' => 25, 'energy' => 'medium', 'scheduleDate' => '2026-08-09',
        'scheduleTime' => null, 'recurrence' => ['type' => 'daily'], 'goalId' => null, 'proofRequired' => false,
    ], $overrides);
}

function temp_upload(string $name, string $bytes): array
{
    $path = tempnam(sys_get_temp_dir(), 'tidemark-upload-');
    file_put_contents($path, $bytes);
    return ['name' => $name, 'tmp_name' => $path, 'size' => filesize($path), 'error' => UPLOAD_ERR_OK];
}
