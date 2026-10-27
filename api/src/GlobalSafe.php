<?php
declare(strict_types=1);

final class GlobalSafe
{
    public static function qualify(PDO $db, string $userId, string $date): array
    {
        $ownsTransaction = !$db->inTransaction();
        if ($ownsTransaction) $db->beginTransaction();
        try {
            $db->prepare("INSERT IGNORE INTO streak_safes (user_id,scope) VALUES (?,'global')")->execute([$userId]);
            $state = self::row($db, $userId, true);
            $ids = json_decode($state['qualifying_entry_ids'], true, 512, JSON_THROW_ON_ERROR);
            if (!in_array($date, $ids, true)) {
                $ids[] = $date;
                $count = (bool) $state['stored'] ? (int) $state['qualifying_count'] : (int) $state['qualifying_count'] + 1;
                $earned = !(bool) $state['stored'] && $count >= 7;
                $db->prepare("UPDATE streak_safes SET `stored`=?,qualifying_count=?,qualifying_entry_ids=?,earned_entry_ids=? WHERE user_id=? AND scope='global'")->execute([$earned || (bool) $state['stored'] ? 1 : 0, $earned ? 0 : $count, json_encode($ids, JSON_THROW_ON_ERROR), json_encode($earned ? array_slice($ids, -7) : json_decode($state['earned_entry_ids'], true, 512, JSON_THROW_ON_ERROR), JSON_THROW_ON_ERROR), $userId]);
            }
            $result = self::mapped(self::row($db, $userId));
            if ($ownsTransaction) $db->commit();
            return $result;
        } catch (Throwable $error) {
            if ($ownsTransaction && $db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }

    public static function snapshot(PDO $db, array $user, ?DateTimeImmutable $now = null): array
    {
        $ownsTransaction = !$db->inTransaction();
        if ($ownsTransaction) $db->beginTransaction();
        try {
            self::recalculate($db, $user['id']);
            $state = self::row($db, $user['id'], true);
            if ((bool) $state['stored']) {
                $local = ($now ?? new DateTimeImmutable('now'))->setTimezone(new DateTimeZone($user['timezone']));
                $yesterday = $local->modify('-1 day')->format('Y-m-d');
                $dayBefore = $local->modify('-2 days')->format('Y-m-d');
                $count = $db->prepare("SELECT occurrence_date,COUNT(*) total FROM task_completions WHERE user_id=? AND status='complete' AND occurrence_date IN (?,?) GROUP BY occurrence_date");
                $count->execute([$user['id'], $yesterday, $dayBefore]);
                $days = array_column($count->fetchAll(), 'total', 'occurrence_date');
                if (empty($days[$yesterday]) && !empty($days[$dayBefore])) {
                    $db->prepare("UPDATE streak_safes SET `stored`=0,qualifying_count=0,earned_entry_ids=JSON_ARRAY(),last_protected_date=? WHERE user_id=? AND scope='global' AND `stored`=1")->execute([$yesterday, $user['id']]);
                    Domain::activity($db, $user['id'], 'global_safe_used', 'Streak Anchor protected a quiet day', 'global_safe', $user['id'], ['date' => $yesterday]);
                    $state = self::row($db, $user['id']);
                }
            }
            $result = self::mapped($state);
            if ($ownsTransaction) $db->commit();
            return $result;
        } catch (Throwable $error) {
            if ($ownsTransaction && $db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }

    public static function recalculate(PDO $db, string $userId): void
    {
        $ownsTransaction = !$db->inTransaction();
        if ($ownsTransaction) $db->beginTransaction();
        try {
            $db->prepare("INSERT IGNORE INTO streak_safes (user_id,scope) VALUES (?,'global')")->execute([$userId]);
            $state = self::row($db, $userId, true);
            $dates = $db->prepare("SELECT DISTINCT occurrence_date FROM task_completions WHERE user_id=? AND status='complete' ORDER BY occurrence_date");
            $dates->execute([$userId]);
            $complete = array_map('strval', $dates->fetchAll(PDO::FETCH_COLUMN));
            $ids = json_decode($state['qualifying_entry_ids'], true, 512, JSON_THROW_ON_ERROR);
            $keptIds = array_values(array_intersect($ids, $complete));
            $earned = json_decode($state['earned_entry_ids'], true, 512, JSON_THROW_ON_ERROR);
            if ((bool) $state['stored']) {
                $keptEarned = array_values(array_intersect($earned, $complete));
                $stored = count($keptEarned) === count($earned);
                $count = $stored ? (int) $state['qualifying_count'] : count($keptEarned);
                $earned = $keptEarned;
            } else {
                $currentCount = (int) $state['qualifying_count'];
                $candidates = $currentCount ? array_slice($ids, -$currentCount) : [];
                $count = count(array_intersect($candidates, $complete));
                $stored = false;
            }
            $db->prepare("UPDATE streak_safes SET `stored`=?,qualifying_count=?,qualifying_entry_ids=?,earned_entry_ids=? WHERE user_id=? AND scope='global'")->execute([$stored ? 1 : 0, $count, json_encode($keptIds, JSON_THROW_ON_ERROR), json_encode($earned, JSON_THROW_ON_ERROR), $userId]);
            if ($ownsTransaction) $db->commit();
        } catch (Throwable $error) {
            if ($ownsTransaction && $db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }

    private static function row(PDO $db, string $userId, bool $lock = false): array
    {
        $statement = $db->prepare("SELECT * FROM streak_safes WHERE user_id=? AND scope='global'" . ($lock ? ' FOR UPDATE' : ''));
        $statement->execute([$userId]);
        return $statement->fetch() ?: throw new RuntimeException('Global Streak Anchor was not saved.');
    }

    private static function mapped(array $row): array
    {
        return ['scope' => 'global', 'stored' => (int) $row['stored'], 'qualifyingCount' => (int) $row['qualifying_count'], 'lastProtectedDate' => $row['last_protected_date']];
    }
}
