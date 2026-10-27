<?php
declare(strict_types=1);

final class Domain
{
    public static function once(PDO $db, string $userId, string $mutationId, Closure $callback): array
    {
        if (!preg_match('/^[A-Za-z0-9-]{8,36}$/', $mutationId)) throw new HttpError(400, 'A valid mutation ID is required.');
        $existing = self::receipt($db, $userId, $mutationId);
        if ($existing !== null) return $existing;

        $db->beginTransaction();
        try {
            $result = $callback();
            $statement = $db->prepare('INSERT INTO offline_receipts (user_id, mutation_id, response_json) VALUES (?, ?, ?)');
            $statement->execute([$userId, $mutationId, json_encode($result, JSON_THROW_ON_ERROR)]);
            $db->commit();
            return $result;
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            if ($error instanceof PDOException && $error->getCode() === '23000') {
                $existing = self::receipt($db, $userId, $mutationId);
                if ($existing !== null) return $existing;
            }
            throw $error;
        }
    }

    public static function activity(PDO $db, string $userId, string $type, string $message, string $relatedType, string $relatedId, array $data = []): void
    {
        $statement = $db->prepare('INSERT INTO activity_events (user_id,event_type,message,related_type,related_id,data) VALUES (?,?,?,?,?,?)');
        $statement->execute([$userId, $type, $message, $relatedType, $relatedId, json_encode($data, JSON_THROW_ON_ERROR)]);
    }

    public static function validDate(string $date): string
    {
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if (!$parsed || $parsed->format('Y-m-d') !== $date) throw new HttpError(422, 'Choose a valid date.');
        return $date;
    }

    public static function validDateTime(string $value): string
    {
        try { return (new DateTimeImmutable($value))->format('Y-m-d H:i:s.v'); }
        catch (Throwable) { throw new HttpError(422, 'Choose a valid date and time.'); }
    }

    public static function taskOccursOn(array $task, string $date): bool
    {
        if ($date < $task['schedule_date']) return false;
        return match ($task['recurrence_type']) {
            'one_time' => $date === $task['schedule_date'],
            'daily' => true,
            'weekly' => in_array((int) (new DateTimeImmutable($date))->format('w'), json_decode($task['recurrence_weekdays'] ?: '[]', true), true),
            'monthly' => (int) substr($date, 8, 2) === min((int) $task['recurrence_day'], (int) (new DateTimeImmutable($date))->format('t')),
            default => false,
        };
    }

    private static function receipt(PDO $db, string $userId, string $mutationId): ?array
    {
        $statement = $db->prepare('SELECT response_json FROM offline_receipts WHERE user_id = ? AND mutation_id = ?');
        $statement->execute([$userId, $mutationId]);
        $json = $statement->fetchColumn();
        return $json === false ? null : json_decode((string) $json, true, 512, JSON_THROW_ON_ERROR);
    }
}
