<?php
declare(strict_types=1);

final class Tasks
{
    public static function create(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $input): array {
            $data = self::validate($db, $user['id'], $input);
            $id = Auth::uuid(isset($input['id']) ? (string) $input['id'] : null);
            $statement = $db->prepare('INSERT INTO tasks (id,user_id,goal_id,title,notes,priority,color,estimated_minutes,energy,schedule_date,schedule_time,recurrence_type,recurrence_weekdays,recurrence_day,proof_required) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
            $statement->execute([$id, $user['id'], $data['goalId'], $data['title'], $data['notes'], $data['priority'], $data['color'], $data['estimatedMinutes'], $data['energy'], $data['scheduleDate'], $data['scheduleTime'], $data['recurrenceType'], $data['weekdays'], $data['dayOfMonth'], $data['proofRequired']]);
            Domain::activity($db, $user['id'], 'task_created', 'Added ' . $data['title'], 'task', $id);
            return self::get($db, $user, $id);
        });
    }

    public static function update(PDO $db, array $user, string $id, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $id, $input): array {
            $current = self::get($db, $user, $id);
            $merged = array_replace($current, $input);
            $data = self::validate($db, $user['id'], $merged);
            $statement = $db->prepare('UPDATE tasks SET goal_id=?,title=?,notes=?,priority=?,color=?,estimated_minutes=?,energy=?,schedule_date=?,schedule_time=?,recurrence_type=?,recurrence_weekdays=?,recurrence_day=?,proof_required=? WHERE id=? AND user_id=?');
            $statement->execute([$data['goalId'], $data['title'], $data['notes'], $data['priority'], $data['color'], $data['estimatedMinutes'], $data['energy'], $data['scheduleDate'], $data['scheduleTime'], $data['recurrenceType'], $data['weekdays'], $data['dayOfMonth'], $data['proofRequired'], $id, $user['id']]);
            Domain::activity($db, $user['id'], 'task_updated', 'Updated ' . $data['title'], 'task', $id);
            return self::get($db, $user, $id);
        });
    }

    public static function delete(PDO $db, array $user, string $id, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $id): array {
            $task = self::get($db, $user, $id);
            $db->prepare('DELETE FROM tasks WHERE id=? AND user_id=?')->execute([$id, $user['id']]);
            Domain::activity($db, $user['id'], 'task_deleted', 'Deleted ' . $task['title'], 'task', $id);
            return ['deleted' => true, 'id' => $id];
        });
    }

    public static function complete(PDO $db, array $user, string $id, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $id, $input): array {
            $taskRow = self::row($db, $user['id'], $id);
            $date = Domain::validDate((string) ($input['date'] ?? ''));
            if (!Domain::taskOccursOn($taskRow, $date)) throw new HttpError(422, 'This task is not scheduled for that date.');
            $existing = $db->prepare('SELECT * FROM task_completions WHERE task_id=? AND occurrence_date=?');
            $existing->execute([$id, $date]);
            if ($row = $existing->fetch()) return self::completion($row);
            $completionId = Auth::uuid();
            $points = ['low' => 5, 'medium' => 10, 'high' => 20][$taskRow['priority']];
            $status = (bool) $taskRow['proof_required'] ? 'pending_proof' : 'complete';
            $statement = $db->prepare('INSERT INTO task_completions (id,user_id,task_id,occurrence_date,note,points,status) VALUES (?,?,?,?,?,?,?)');
            $statement->execute([$completionId, $user['id'], $id, $date, trim((string) ($input['note'] ?? '')), $points, $status]);
            if ($status === 'complete') GlobalSafe::qualify($db, $user['id'], $date);
            Domain::activity($db, $user['id'], $status === 'complete' ? 'task_completed' : 'proof_requested', $status === 'complete' ? 'Completed ' . $taskRow['title'] : 'Proof needed for ' . $taskRow['title'], 'completion', $completionId, ['points' => $points]);
            $row = $db->query('SELECT * FROM task_completions WHERE id=' . $db->quote($completionId))->fetch();
            return self::completion($row);
        });
    }

    public static function reopen(PDO $db, array $user, string $id, string $date, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $id, $date): array {
            self::get($db, $user, $id);
            Domain::validDate($date);
            $statement = $db->prepare('DELETE FROM task_completions WHERE user_id=? AND task_id=? AND occurrence_date=?');
            $statement->execute([$user['id'], $id, $date]);
            if ($statement->rowCount() === 0) throw new HttpError(404, 'Completion not found.');
            GlobalSafe::recalculate($db, $user['id']);
            Domain::activity($db, $user['id'], 'task_reopened', 'Reopened a task', 'task', $id, ['date' => $date]);
            return ['reopened' => true, 'taskId' => $id, 'occurrenceDate' => $date];
        });
    }

    public static function get(PDO $db, array $user, string $id): array
    {
        return self::task(self::row($db, $user['id'], $id));
    }

    public static function all(PDO $db, string $userId): array
    {
        $statement = $db->prepare('SELECT * FROM tasks WHERE user_id=? ORDER BY schedule_date, schedule_time, created_at');
        $statement->execute([$userId]);
        return array_map(self::task(...), $statement->fetchAll());
    }

    private static function row(PDO $db, string $userId, string $id): array
    {
        $statement = $db->prepare('SELECT * FROM tasks WHERE id=? AND user_id=?');
        $statement->execute([$id, $userId]);
        $row = $statement->fetch();
        if (!$row) throw new HttpError(404, 'Task not found.');
        return $row;
    }

    private static function validate(PDO $db, string $userId, array $input): array
    {
        $title = trim((string) ($input['title'] ?? ''));
        if ($title === '' || mb_strlen($title) > 160) throw new HttpError(422, 'Enter a task title up to 160 characters.', ['field' => 'title']);
        $priority = (string) ($input['priority'] ?? 'medium');
        $energy = (string) ($input['energy'] ?? 'medium');
        if (!in_array($priority, ['low','medium','high'], true) || !in_array($energy, ['low','medium','high'], true)) throw new HttpError(422, 'Choose valid task settings.');
        $minutes = (int) ($input['estimatedMinutes'] ?? 15);
        if ($minutes < 1 || $minutes > 1440) throw new HttpError(422, 'Estimate between 1 minute and 24 hours.');
        $color = (string) ($input['color'] ?? '#5B8DEF');
        if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $color)) throw new HttpError(422, 'Choose a valid color.');
        $scheduleDate = Domain::validDate((string) ($input['scheduleDate'] ?? ''));
        $scheduleTime = $input['scheduleTime'] ?? null;
        if ($scheduleTime !== null && !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', (string) $scheduleTime)) throw new HttpError(422, 'Choose a valid time.');
        $recurrence = is_array($input['recurrence'] ?? null) ? $input['recurrence'] : ['type' => 'one_time'];
        $type = (string) ($recurrence['type'] ?? 'one_time');
        if (!in_array($type, ['one_time','daily','weekly','monthly'], true)) throw new HttpError(422, 'Choose a valid recurrence.');
        $weekdays = null;
        $day = null;
        if ($type === 'weekly') {
            $values = array_values(array_unique(array_map('intval', is_array($recurrence['weekdays'] ?? null) ? $recurrence['weekdays'] : [])));
            if (!$values || array_filter($values, fn(int $value) => $value < 0 || $value > 6)) throw new HttpError(422, 'Choose at least one weekday.');
            $weekdays = json_encode($values, JSON_THROW_ON_ERROR);
        }
        if ($type === 'monthly') {
            $day = (int) ($recurrence['dayOfMonth'] ?? substr($scheduleDate, 8, 2));
            if ($day < 1 || $day > 31) throw new HttpError(422, 'Choose a monthly day from 1 to 31.');
        }
        $goalId = $input['goalId'] ?? null;
        if ($goalId) {
            $check = $db->prepare('SELECT 1 FROM goals WHERE id=? AND user_id=?');
            $check->execute([$goalId, $userId]);
            if (!$check->fetchColumn()) throw new HttpError(422, 'Choose one of your goals.');
        }
        return ['title' => $title, 'notes' => trim((string) ($input['notes'] ?? '')), 'priority' => $priority, 'color' => strtoupper($color), 'estimatedMinutes' => $minutes, 'energy' => $energy, 'scheduleDate' => $scheduleDate, 'scheduleTime' => $scheduleTime, 'recurrenceType' => $type, 'weekdays' => $weekdays, 'dayOfMonth' => $day, 'goalId' => $goalId ?: null, 'proofRequired' => !empty($input['proofRequired']) ? 1 : 0];
    }

    private static function task(array $row): array
    {
        $recurrence = ['type' => $row['recurrence_type']];
        if ($row['recurrence_type'] === 'weekly') $recurrence['weekdays'] = json_decode($row['recurrence_weekdays'] ?: '[]', true);
        if ($row['recurrence_type'] === 'monthly') $recurrence['dayOfMonth'] = (int) $row['recurrence_day'];
        return ['id' => $row['id'], 'title' => $row['title'], 'notes' => $row['notes'], 'priority' => $row['priority'], 'color' => $row['color'], 'estimatedMinutes' => (int) $row['estimated_minutes'], 'energy' => $row['energy'], 'scheduleDate' => $row['schedule_date'], 'scheduleTime' => $row['schedule_time'] ? substr($row['schedule_time'], 0, 5) : null, 'recurrence' => $recurrence, 'goalId' => $row['goal_id'], 'proofRequired' => (bool) $row['proof_required'], 'archived' => (bool) $row['archived'], 'createdAt' => $row['created_at'], 'updatedAt' => $row['updated_at']];
    }

    private static function completion(array $row): array
    {
        return ['id' => $row['id'], 'taskId' => $row['task_id'], 'occurrenceDate' => $row['occurrence_date'], 'completedAt' => $row['completed_at'], 'points' => (int) $row['points'], 'status' => $row['status'], 'hasProof' => $row['status'] === 'complete' && (bool) ($row['has_proof'] ?? false)];
    }
}
