<?php
declare(strict_types=1);

final class HttpError extends RuntimeException
{
    public function __construct(public readonly int $status, string $message, public readonly array $details = [])
    {
        parent::__construct($message);
    }
}

function json_body(): array
{
    $raw = file_get_contents('php://input');
    $body = json_decode($raw ?: '{}', true);
    if (!is_array($body)) throw new HttpError(400, 'Send a valid JSON request.');
    return $body;
}

function json_response(array $body, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function request_header(string $name): ?string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return isset($_SERVER[$key]) ? trim((string) $_SERVER[$key]) : null;
}
