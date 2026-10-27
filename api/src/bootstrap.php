<?php
declare(strict_types=1);

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Http.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/Domain.php';
require_once __DIR__ . '/GlobalSafe.php';
require_once __DIR__ . '/DailyMoments.php';
require_once __DIR__ . '/Tasks.php';
require_once __DIR__ . '/Goals.php';
require_once __DIR__ . '/Gym.php';
require_once __DIR__ . '/Sync.php';
require_once __DIR__ . '/Photos.php';

error_reporting(E_ALL);
ini_set('display_errors', '0');
$config = Database::config();
session_name('tidemark');
session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 30,
    'path' => '/',
    'secure' => (bool) ($config['secure_cookies'] ?? true),
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

set_exception_handler(function (Throwable $error): never {
    if ($error instanceof HttpError) json_response(['error' => $error->getMessage(), 'details' => $error->details], $error->status);
    error_log((string) $error);
    json_response(['error' => 'Tidemark could not complete that request.'], 500);
});
