<?php
declare(strict_types=1);

final class Photos
{
    private const ALLOWED = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    private const MAX_BYTES = 8 * 1024 * 1024;

    public static function upload(PDO $db, array $user, string $ownerType, string $ownerId, array $upload, string $mutationId, string $caption = ''): array
    {
        self::validateUpload($upload);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($upload['tmp_name']);
        if (!isset(self::ALLOWED[$mime]) || getimagesize($upload['tmp_name']) === false) throw new HttpError(422, 'Choose a JPEG, PNG, or WebP image.');
        $root = self::root();
        $finalAbsolute = null;
        $staged = null;

        try {
            return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $ownerType, $ownerId, $upload, $mime, $caption, $root, &$finalAbsolute, &$staged): array {
                $owner = self::owner($db, $user['id'], $ownerType, $ownerId, in_array($ownerType, ['progress', 'progress_mutation', 'daily_moment'], true));
                $canonicalType = $owner['_owner_type'];
                $canonicalId = $owner['_owner_id'];
                if ($canonicalType === 'progress') {
                    if ($owner['entry_type'] === 'workout') {
                        $proof = $db->prepare('SELECT id FROM proof_photos WHERE progress_entry_id=? LIMIT 1 FOR UPDATE');
                        $proof->execute([$canonicalId]);
                        if ($proof->fetchColumn() !== false) throw new HttpError(409, 'This workout already has a proof photo.');
                    }
                }
                $caption = trim($caption);
                if ($canonicalType === 'daily_moment') {
                    if (!in_array($owner['status'], ['scheduled', 'sent'], true)) throw new HttpError(409, 'This Daily Snapshot is already finished.');
                    if (mb_strlen($caption) > 240) throw new HttpError(422, 'Keep the Daily Snapshot caption under 240 characters.');
                }
                $stageDirectory = $root . '/.staging';
                self::ensureDirectory($stageDirectory);
                $staged = $stageDirectory . '/' . bin2hex(random_bytes(24));
                if (!copy($upload['tmp_name'], $staged)) throw new RuntimeException('Could not stage proof photo.');

                $relative = $user['id'] . '/' . gmdate('Y/m') . '/' . bin2hex(random_bytes(24)) . '.' . self::ALLOWED[$mime];
                $finalAbsolute = $root . '/' . $relative;
                self::ensureDirectory(dirname($finalAbsolute));
                if (!rename($staged, $finalAbsolute)) throw new RuntimeException('Could not store proof photo.');
                $staged = null;

                $id = Auth::uuid();
                $completionId = $canonicalType === 'completion' ? $canonicalId : null;
                $progressId = $canonicalType === 'progress' ? $canonicalId : null;
                $dailyMomentId = $canonicalType === 'daily_moment' ? $canonicalId : null;
                $statement = $db->prepare('INSERT INTO proof_photos (id,user_id,completion_id,progress_entry_id,daily_moment_id,caption,storage_path,media_type,byte_size,original_name) VALUES (?,?,?,?,?,?,?,?,?,?)');
                $statement->execute([$id, $user['id'], $completionId, $progressId, $dailyMomentId, $canonicalType === 'daily_moment' ? $caption : '', $relative, $mime, (int) $upload['size'], mb_substr(basename((string) $upload['name']), 0, 255)]);

                if ($canonicalType === 'completion' && $owner['status'] === 'pending_proof') {
                    $db->prepare("UPDATE task_completions SET status='complete' WHERE id=? AND user_id=?")->execute([$canonicalId, $user['id']]);
                    GlobalSafe::qualify($db, $user['id'], $owner['occurrence_date']);
                }
                if ($canonicalType === 'progress' && $owner['status'] === 'pending_proof') {
                    $db->prepare("UPDATE progress_entries SET status='complete' WHERE id=? AND user_id=?")->execute([$canonicalId, $user['id']]);
                    $db->prepare('UPDATE goals SET current_value=current_value+? WHERE id=? AND user_id=?')->execute([$owner['value'], $owner['goal_id'], $user['id']]);
                    if ($owner['entry_type'] === 'workout') Gym::qualifyWorkout($db, $user['id'], $canonicalId);
                }
                Domain::activity($db, $user['id'], 'proof_added', 'Added proof photo', 'proof', $id, ['ownerType' => $canonicalType, 'ownerId' => $canonicalId]);
                return self::metadata(['id' => $id, 'completion_id' => $completionId, 'progress_entry_id' => $progressId, 'daily_moment_id' => $dailyMomentId, 'caption' => $canonicalType === 'daily_moment' ? $caption : '', 'entry_type' => $owner['entry_type'] ?? null, 'guided_gym_type' => $owner['guided_gym_type'] ?? null, 'selected_for_recap' => 0, 'created_at' => gmdate('Y-m-d H:i:s.v')]);
            });
        } catch (Throwable $error) {
            if ($staged && is_file($staged)) unlink($staged);
            if ($finalAbsolute && is_file($finalAbsolute)) unlink($finalAbsolute);
            throw $error;
        }
    }

    public static function delete(PDO $db, array $user, string $id, string $mutationId): array
    {
        return self::deleteMatching($db, $user, $mutationId, fn(): array => self::row($db, $user['id'], $id));
    }

    public static function deleteDailyMoment(PDO $db, array $user, string $date, string $mutationId): array
    {
        return self::deleteMatching($db, $user, $mutationId, function () use ($db, $user, $date): array {
            $statement = $db->prepare('SELECT p.* FROM proof_photos p JOIN daily_moment_days d ON d.id=p.daily_moment_id WHERE d.user_id=? AND d.local_date=?');
            $statement->execute([$user['id'], $date]);
            $row = $statement->fetch();
            if (!$row) throw new HttpError(404, 'Daily Snapshot photo not found.');
            return $row;
        });
    }

    private static function deleteMatching(PDO $db, array $user, string $mutationId, Closure $find): array
    {
        $original = null;
        $trash = null;
        try {
            $result = Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $find, &$original, &$trash): array {
                $row = $find();
                $id = $row['id'];
                $workoutProof = false;
                $original = self::root() . '/' . $row['storage_path'];
                if (is_file($original)) {
                    $trashDirectory = self::root() . '/.trash';
                    self::ensureDirectory($trashDirectory);
                    $trash = $trashDirectory . '/' . bin2hex(random_bytes(24));
                    if (!rename($original, $trash)) throw new RuntimeException('Could not remove proof photo.');
                }
                if ($row['progress_entry_id']) {
                    $entry = self::owner($db, $user['id'], 'progress', $row['progress_entry_id']);
                    $workoutProof = $entry['entry_type'] === 'workout';
                    if ($entry['entry_type'] === 'workout' && $entry['status'] === 'complete') {
                        $db->prepare("UPDATE progress_entries SET status='pending_proof' WHERE id=?")->execute([$row['progress_entry_id']]);
                        $db->prepare('UPDATE goals SET current_value=GREATEST(0,current_value-?) WHERE id=? AND user_id=?')->execute([$entry['value'], $entry['goal_id'], $user['id']]);
                    }
                }
                if ($row['completion_id']) {
                    $completion = self::owner($db, $user['id'], 'completion', $row['completion_id']);
                    if ((bool) $completion['proof_required']) $db->prepare("UPDATE task_completions SET status='pending_proof' WHERE id=?")->execute([$row['completion_id']]);
                }
                $db->prepare('DELETE FROM proof_photos WHERE id=? AND user_id=?')->execute([$id, $user['id']]);
                if ($row['completion_id']) GlobalSafe::recalculate($db, $user['id']);
                if ($workoutProof) Gym::recalculateSafeProgress($db, $user['id']);
                Domain::activity($db, $user['id'], 'proof_deleted', 'Removed proof photo', 'proof', $id);
                return ['deleted' => true, 'id' => $id];
            });
            if ($trash && is_file($trash)) unlink($trash);
            return $result;
        } catch (Throwable $error) {
            if ($trash && is_file($trash) && $original) rename($trash, $original);
            throw $error;
        }
    }

    public static function absolutePath(PDO $db, array $user, string $id): string
    {
        $row = self::row($db, $user['id'], $id);
        $path = self::root() . '/' . $row['storage_path'];
        if (!is_file($path)) throw new HttpError(404, 'Proof photo not found.');
        return $path;
    }

    public static function stream(PDO $db, array $user, string $id): never
    {
        $row = self::row($db, $user['id'], $id);
        $path = self::root() . '/' . $row['storage_path'];
        if (!is_file($path)) throw new HttpError(404, 'Proof photo not found.');
        header('Content-Type: ' . $row['media_type']);
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: private, max-age=300');
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: inline; filename="proof.' . self::ALLOWED[$row['media_type']] . '"');
        readfile($path);
        exit;
    }

    public static function all(PDO $db, array $user): array
    {
        $statement = $db->prepare('SELECT p.id,p.completion_id,p.progress_entry_id,p.daily_moment_id,p.caption,p.selected_for_recap,p.created_at,e.entry_type,g.guided_gym_type FROM proof_photos p LEFT JOIN progress_entries e ON e.id=p.progress_entry_id LEFT JOIN goals g ON g.id=e.goal_id WHERE p.user_id=? ORDER BY p.created_at DESC');
        $statement->execute([$user['id']]);
        return array_map(self::metadata(...), $statement->fetchAll());
    }

    private static function owner(PDO $db, string $userId, string $type, string $id, bool $forUpdate = false): array
    {
        if ($type === 'completion') {
            $statement = $db->prepare('SELECT c.*,t.proof_required FROM task_completions c JOIN tasks t ON t.id=c.task_id WHERE c.id=? AND c.user_id=?');
        } elseif ($type === 'progress') {
            $statement = $db->prepare('SELECT e.*,g.guided_gym_type FROM progress_entries e JOIN goals g ON g.id=e.goal_id WHERE e.id=? AND e.user_id=?' . ($forUpdate ? ' FOR UPDATE' : ''));
        } elseif ($type === 'daily_moment') {
            $statement = $db->prepare('SELECT * FROM daily_moment_days WHERE id=? AND user_id=?' . ($forUpdate ? ' FOR UPDATE' : ''));
        } elseif ($type === 'task_occurrence') {
            if (!preg_match('/^([a-f0-9-]{36}):(\d{4}-\d{2}-\d{2})$/i', $id, $match)) throw new HttpError(422, 'Choose a valid task occurrence.');
            $statement = $db->prepare('SELECT c.*,t.proof_required FROM task_completions c JOIN tasks t ON t.id=c.task_id WHERE c.task_id=? AND c.occurrence_date=? AND c.user_id=?');
            $statement->execute([$match[1], $match[2], $userId]);
            $row = $statement->fetch();
            if (!$row) throw new HttpError(404, 'Proof destination not found.');
            $row['_owner_type'] = 'completion';
            $row['_owner_id'] = $row['id'];
            return $row;
        } elseif ($type === 'progress_mutation') {
            $receipt = $db->prepare('SELECT response_json FROM offline_receipts WHERE user_id=? AND mutation_id=?');
            $receipt->execute([$userId, $id]);
            $json = $receipt->fetchColumn();
            if ($json === false) throw new HttpError(409, 'Workout progress has not synced yet.');
            $response = json_decode((string) $json, true, 512, JSON_THROW_ON_ERROR);
            return self::owner($db, $userId, 'progress', (string) ($response['id'] ?? ''), $forUpdate);
        } else throw new HttpError(422, 'Choose a valid proof destination.');
        $statement->execute([$id, $userId]);
        $row = $statement->fetch();
        if (!$row) throw new HttpError(404, 'Proof destination not found.');
        $row['_owner_type'] = $type;
        $row['_owner_id'] = $id;
        return $row;
    }

    private static function row(PDO $db, string $userId, string $id): array
    {
        $statement = $db->prepare('SELECT * FROM proof_photos WHERE id=? AND user_id=?');
        $statement->execute([$id, $userId]);
        $row = $statement->fetch();
        if (!$row) throw new HttpError(404, 'Proof photo not found.');
        return $row;
    }

    private static function metadata(array $row): array
    {
        $ownerType = $row['completion_id'] ? 'completion' : ($row['progress_entry_id'] ? 'progress' : 'daily_moment');
        $category = $ownerType === 'completion' ? 'tasks' : ($ownerType === 'daily_moment' ? 'daily' : (($row['entry_type'] ?? null) === 'workout' || ($row['guided_gym_type'] ?? null) !== null ? 'gym' : 'goals'));
        return ['id' => $row['id'], 'ownerType' => $ownerType, 'ownerId' => $row['completion_id'] ?: ($row['progress_entry_id'] ?: $row['daily_moment_id']), 'category' => $category, 'caption' => $row['caption'] ?? '', 'imageUrl' => '/api/proofs/' . $row['id'] . '/image', 'createdAt' => $row['created_at'], 'selectedForRecap' => (bool) $row['selected_for_recap']];
    }

    private static function validateUpload(array $upload): void
    {
        if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_file((string) ($upload['tmp_name'] ?? ''))) throw new HttpError(422, 'Choose a photo to upload.');
        $size = (int) ($upload['size'] ?? 0);
        if ($size < 1 || $size > self::MAX_BYTES) throw new HttpError(422, 'Choose a photo smaller than 8 MB.');
    }

    private static function root(): string
    {
        return rtrim((string) (Database::config()['storage_root'] ?? ''), '/');
    }

    private static function ensureDirectory(string $path): void
    {
        if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) throw new RuntimeException('Could not create proof storage.');
    }
}
