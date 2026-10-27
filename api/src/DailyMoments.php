<?php
declare(strict_types=1);

final class DailyMoments
{
    private const DEFAULT_SETTINGS = ['enabled' => false, 'windowStart' => '12:00', 'windowEnd' => '17:00', 'notifications' => false];

    public static function snapshot(PDO $db, array $user, ?DateTimeImmutable $now = null): array
    {
        $settings = self::settings($db, $user['id']);
        $now = self::localNow($db, $user['id'], $now);
        $today = $settings['enabled'] ? self::day($db, $user['id'], $settings, $now->format('Y-m-d')) : null;
        $mappedToday = $today === null ? null : self::dayRow($today);
        $days = $db->prepare('SELECT * FROM daily_moment_days WHERE user_id=? ORDER BY local_date DESC');
        $days->execute([$user['id']]);
        return [
            'settings' => $settings,
            'today' => $mappedToday,
            'days' => array_map(self::dayRow(...), $days->fetchAll()),
            'eligiblePrompt' => $mappedToday !== null && self::isDue($mappedToday, $now),
        ];
    }

    public static function today(PDO $db, array $user, ?DateTimeImmutable $now = null): ?array
    {
        $settings = self::settings($db, $user['id']);
        if (!$settings['enabled']) return null;
        $local = self::localNow($db, $user['id'], $now);
        return self::dayRow(self::day($db, $user['id'], $settings, $local->format('Y-m-d')));
    }

    public static function saveSettings(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $input): array {
            $enabled = self::boolean($input['enabled'] ?? null, 'Choose whether Daily Snapshot is enabled.');
            $notifications = self::boolean($input['notifications'] ?? null, 'Choose whether Daily Snapshot notifications are enabled.');
            $start = self::time($input['windowStart'] ?? null);
            $end = self::time($input['windowEnd'] ?? null);
            if (self::minutes($end) <= self::minutes($start)) throw new HttpError(422, 'Choose an end time after the start time.');
            $db->prepare('INSERT INTO daily_moment_settings (user_id,enabled,window_start,window_end,notifications) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),window_start=VALUES(window_start),window_end=VALUES(window_end),notifications=VALUES(notifications)')->execute([$user['id'], $enabled ? 1 : 0, $start, $end, $notifications ? 1 : 0]);
            return self::settings($db, $user['id']);
        });
    }

    public static function skip(PDO $db, array $user, string $date, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $date): array {
            $date = Domain::validDate($date);
            $day = self::scheduledDay($db, $user['id'], $date);
            if ($day['status'] === 'captured') throw new HttpError(409, 'This Daily Snapshot is already captured.');
            if ($day['status'] !== 'skipped') {
                $db->prepare("UPDATE daily_moment_days SET status='skipped' WHERE id=? AND user_id=? AND status IN ('scheduled','sent')")->execute([$day['id'], $user['id']]);
            }
            return self::dayRow(self::findDay($db, $user['id'], $date));
        });
    }

    public static function capture(PDO $db, array $user, string $date, string $caption, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $date, $caption): array {
            $date = Domain::validDate($date);
            $caption = trim($caption);
            if (mb_strlen($caption) > 240) throw new HttpError(422, 'Keep the Daily Snapshot caption under 240 characters.');
            $day = self::scheduledDay($db, $user['id'], $date);
            if (!in_array($day['status'], ['scheduled', 'sent'], true)) throw new HttpError(409, 'This Daily Snapshot is already finished.');
            return self::dayRow($day);
        });
    }

    public static function delete(PDO $db, array $user, string $date, string $mutationId): array
    {
        $date = Domain::validDate($date);
        Photos::deleteDailyMoment($db, $user, $date, $mutationId);
        return self::dayRow(self::findDay($db, $user['id'], $date));
    }

    public static function duePrompt(PDO $db, array $user, ?DateTimeImmutable $now = null): ?array
    {
        $local = self::localNow($db, $user['id'], $now);
        $day = self::today($db, $user, $local);
        return $day !== null && self::isDue($day, $local) ? $day : null;
    }

    private static function scheduledDay(PDO $db, string $userId, string $date): array
    {
        $settings = self::settings($db, $userId);
        if (!$settings['enabled']) throw new HttpError(422, 'Enable Daily Snapshot before updating a day.');
        return self::day($db, $userId, $settings, $date);
    }

    private static function day(PDO $db, string $userId, array $settings, string $date): array
    {
        $minute = random_int(self::minutes($settings['windowStart']), self::minutes($settings['windowEnd']));
        $time = sprintf('%02d:%02d:00', intdiv($minute, 60), $minute % 60);
        $db->prepare('INSERT INTO daily_moment_days (id,user_id,local_date,scheduled_time) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE id=id')->execute([Auth::uuid(), $userId, $date, $time]);
        return self::findDay($db, $userId, $date, true, true);
    }

    private static function findDay(PDO $db, string $userId, string $date, bool $required = true, bool $forUpdate = false): ?array
    {
        $statement = $db->prepare('SELECT * FROM daily_moment_days WHERE user_id=? AND local_date=?' . ($forUpdate ? ' FOR UPDATE' : ''));
        $statement->execute([$userId, $date]);
        $row = $statement->fetch();
        if ($row || !$required) return $row ?: null;
        throw new RuntimeException('Daily Snapshot day was not saved.');
    }

    private static function settings(PDO $db, string $userId): array
    {
        $statement = $db->prepare('SELECT enabled,window_start,window_end,notifications FROM daily_moment_settings WHERE user_id=?');
        $statement->execute([$userId]);
        $row = $statement->fetch();
        if (!$row) return self::DEFAULT_SETTINGS;
        return [
            'enabled' => (bool) $row['enabled'],
            'windowStart' => substr((string) $row['window_start'], 0, 5),
            'windowEnd' => substr((string) $row['window_end'], 0, 5),
            'notifications' => (bool) $row['notifications'],
        ];
    }

    private static function dayRow(array $row): array
    {
        return [
            'id' => $row['id'],
            'localDate' => $row['local_date'],
            'date' => $row['local_date'],
            'scheduledTime' => substr((string) $row['scheduled_time'], 0, 5),
            'status' => $row['status'],
            'capturedAt' => $row['captured_at'],
            'caption' => $row['caption'],
        ];
    }

    private static function localNow(PDO $db, string $userId, ?DateTimeImmutable $now): DateTimeImmutable
    {
        return ($now ?? new DateTimeImmutable('now'))->setTimezone(new DateTimeZone(self::timezone($db, $userId)));
    }

    private static function timezone(PDO $db, string $userId): string
    {
        $statement = $db->prepare('SELECT timezone FROM users WHERE id=?');
        $statement->execute([$userId]);
        $timezone = $statement->fetchColumn();
        if ($timezone === false) throw new HttpError(404, 'User not found.');
        return (string) $timezone;
    }

    private static function boolean(mixed $value, string $message): bool
    {
        if (!is_bool($value)) throw new HttpError(422, $message);
        return $value;
    }

    private static function time(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/', $value)) throw new HttpError(422, 'Choose a valid time.');
        return $value;
    }

    private static function minutes(string $time): int
    {
        return ((int) substr($time, 0, 2)) * 60 + (int) substr($time, 3, 2);
    }

    private static function isDue(array $day, DateTimeImmutable $now): bool
    {
        return in_array($day['status'], ['scheduled', 'sent'], true) && $now->format('H:i') >= $day['scheduledTime'];
    }
}
