<?php
declare(strict_types=1);

final class Auth
{
    public static function setupStatus(PDO $db): bool
    {
        return (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn() === 0;
    }

    public static function setup(PDO $db, array $input): array
    {
        if (!self::setupStatus($db)) throw new HttpError(409, 'Owner setup is already complete.');
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $timezone = (string) ($input['timezone'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new HttpError(422, 'Enter a valid email address.', ['field' => 'email']);
        if (strlen($password) < 12) throw new HttpError(422, 'Use at least 12 characters.', ['field' => 'password']);
        if ($timezone === '' || strlen($timezone) > 64) throw new HttpError(422, 'Choose a valid timezone.', ['field' => 'timezone']);
        try { new DateTimeZone($timezone); }
        catch (Throwable) { throw new HttpError(422, 'Choose a valid timezone.', ['field' => 'timezone']); }

        $id = self::uuid();
        $preferences = json_encode([
            'enabledAreas' => ['fitness', 'learning', 'work', 'wellbeing'], 'onboardingStep' => 'areas',
            'displayName' => '', 'appearance' => 'system', 'gardenSeason' => 'dawn', 'voice' => 'gentle',
            'focusWindow' => 'learn', 'celebration' => 'full', 'contextualAmbience' => false, 'gymPlaces' => [],
        ], JSON_THROW_ON_ERROR);
        try {
            $statement = $db->prepare('INSERT INTO users (id, email, password_hash, timezone, preferences) VALUES (?, ?, ?, ?, ?)');
            $statement->execute([$id, $email, password_hash($password, PASSWORD_DEFAULT), $timezone, $preferences]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') throw new HttpError(409, 'Owner setup is already complete.');
            throw $error;
        }
        return self::findById($db, $id);
    }

    public static function login(PDO $db, string $email, string $password, string $ip): array
    {
        $email = strtolower(trim($email));
        $bucket = hash('sha256', $email . '|' . $ip);
        $db->exec("DELETE FROM login_attempts WHERE attempted_at < (UTC_TIMESTAMP(3) - INTERVAL 15 MINUTE)");
        $count = $db->prepare('SELECT COUNT(*) FROM login_attempts WHERE bucket_hash = ?');
        $count->execute([$bucket]);
        if ((int) $count->fetchColumn() >= 5) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');

        $statement = $db->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
        $statement->execute([$email]);
        $row = $statement->fetch();
        if (!$row || !password_verify($password, $row['password_hash'])) {
            $db->prepare('INSERT INTO login_attempts (bucket_hash) VALUES (?)')->execute([$bucket]);
            throw new HttpError(401, 'Email or password is incorrect.');
        }
        $db->prepare('DELETE FROM login_attempts WHERE bucket_hash = ?')->execute([$bucket]);
        return self::publicUser($row);
    }

    public static function beginSession(array $user): array
    {
        session_regenerate_id(true);
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        return ['user' => $user, 'csrfToken' => $_SESSION['csrf']];
    }

    public static function requireUser(PDO $db): array
    {
        $id = $_SESSION['user_id'] ?? null;
        if (!$id) throw new HttpError(401, 'Sign in to continue.');
        try { return self::findById($db, (string) $id); }
        catch (HttpError) { $_SESSION = []; throw new HttpError(401, 'Sign in to continue.'); }
    }

    public static function requireCsrf(?string $token): void
    {
        if (!$token || !isset($_SESSION['csrf']) || !hash_equals((string) $_SESSION['csrf'], $token)) {
            throw new HttpError(403, 'Refresh the page and try again.');
        }
    }

    public static function findById(PDO $db, string $id): array
    {
        $statement = $db->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row) throw new HttpError(404, 'Owner not found.');
        return self::publicUser($row);
    }

    private static function publicUser(array $row): array
    {
        $preferences = json_decode((string) $row['preferences'], true, 512, JSON_THROW_ON_ERROR);
        return [
            'id' => $row['id'], 'email' => $row['email'], 'timezone' => $row['timezone'],
            'enabledAreas' => $preferences['enabledAreas'] ?? [], 'onboardingStep' => $preferences['onboardingStep'] ?? null,
            'displayName' => $preferences['displayName'] ?? '', 'appearance' => $preferences['appearance'] ?? 'system',
            'gardenSeason' => $preferences['gardenSeason'] ?? 'dawn', 'voice' => $preferences['voice'] ?? 'gentle',
            'focusWindow' => $preferences['focusWindow'] ?? 'learn', 'celebration' => $preferences['celebration'] ?? 'full',
            'contextualAmbience' => $preferences['contextualAmbience'] ?? false, 'gymPlaces' => $preferences['gymPlaces'] ?? [],
        ];
    }

    public static function uuid(?string $candidate = null): string
    {
        if ($candidate !== null) {
            if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $candidate)) throw new HttpError(422, 'Choose a valid ID.');
            return strtolower($candidate);
        }
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
