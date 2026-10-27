<?php
declare(strict_types=1);

final class Sync
{
    public static function snapshot(PDO $db, array $user): array
    {
        return [
            'serverTime' => gmdate('c'),
            'user' => Auth::findById($db, $user['id']),
            'tasks' => Tasks::all($db, $user['id']),
            'completions' => self::rows($db, 'SELECT c.*, EXISTS(SELECT 1 FROM proof_photos p WHERE p.completion_id=c.id) has_proof FROM task_completions c WHERE c.user_id=? ORDER BY c.occurrence_date,c.completed_at', [$user['id']], fn($row) => ['id' => $row['id'], 'taskId' => $row['task_id'], 'occurrenceDate' => $row['occurrence_date'], 'completedAt' => $row['completed_at'], 'points' => (int) $row['points'], 'status' => $row['status'], 'hasProof' => (bool) $row['has_proof']]),
            'goals' => Goals::all($db, $user['id']),
            'milestones' => self::rows($db, 'SELECT * FROM milestones WHERE user_id=? ORDER BY goal_id,position', [$user['id']], fn($row) => ['id' => $row['id'], 'goalId' => $row['goal_id'], 'label' => $row['label'], 'targetValue' => (float) $row['target_value'], 'completedAt' => $row['completed_at'], 'position' => (int) $row['position']]),
            'progressEntries' => self::rows($db, 'SELECT e.*,g.life_area FROM progress_entries e JOIN goals g ON g.id=e.goal_id WHERE e.user_id=? ORDER BY occurrence_at', [$user['id']], fn($row) => ['id' => $row['id'], 'goalId' => $row['goal_id'], 'area' => $row['life_area'], 'entryType' => $row['entry_type'], 'metric' => $row['metric'], 'value' => (float) $row['value'], 'durationMinutes' => $row['duration_minutes'] === null ? null : (int) $row['duration_minutes'], 'details' => json_decode($row['details'], true, 512, JSON_THROW_ON_ERROR), 'note' => $row['note'], 'occurrenceAt' => $row['occurrence_at'], 'status' => $row['status'], 'createdAt' => $row['created_at']]),
            'checkins' => self::rows($db, 'SELECT * FROM daily_checkins WHERE user_id=? ORDER BY local_date', [$user['id']], fn($row) => ['id' => $row['id'], 'date' => $row['local_date'], 'energy' => $row['energy'], 'mood' => (int) $row['mood'], 'note' => $row['note'], 'intention' => $row['intention'] ?? '', 'win' => $row['win'] ?? '', 'gratitude' => $row['gratitude'] ?? '']),
            'activities' => self::rows($db, 'SELECT * FROM activity_events WHERE user_id=? ORDER BY created_at DESC LIMIT 500', [$user['id']], fn($row) => ['id' => (string) $row['id'], 'type' => $row['event_type'], 'message' => $row['message'], 'relatedType' => $row['related_type'], 'relatedId' => $row['related_id'], 'data' => json_decode($row['data'], true, 512, JSON_THROW_ON_ERROR), 'createdAt' => $row['created_at']]),
            'proofs' => Photos::all($db, $user),
            'globalSafe' => GlobalSafe::snapshot($db, $user),
            'gym' => Gym::snapshot($db, $user),
            'dailyMoment' => DailyMoments::snapshot($db, $user),
        ];
    }

    public static function export(PDO $db, array $user): array
    {
        return ['schemaVersion' => 1, 'exportedAt' => gmdate('c'), 'snapshot' => self::snapshot($db, $user)];
    }

    private static function rows(PDO $db, string $sql, array $params, Closure $map): array
    {
        $statement = $db->prepare($sql);
        $statement->execute($params);
        return array_map($map, $statement->fetchAll());
    }
}
