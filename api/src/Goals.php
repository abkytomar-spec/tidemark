<?php
declare(strict_types=1);

final class Goals
{
    public static function create(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $input): array {
            $title = trim((string) ($input['title'] ?? ''));
            $area = (string) ($input['area'] ?? '');
            $target = (float) ($input['targetValue'] ?? 0);
            if ($title === '' || mb_strlen($title) > 160) throw new HttpError(422, 'Enter a goal title.');
            if (!in_array($area, ['fitness','learning','work','money','wellbeing','home'], true)) throw new HttpError(422, 'Choose a life area.');
            if (!is_finite($target) || $target <= 0) throw new HttpError(422, 'Enter a target greater than zero.');
            $id = Auth::uuid(isset($input['id']) ? (string) $input['id'] : null);
            $deadline = ($input['deadline'] ?? null) ? Domain::validDate((string) $input['deadline']) : null;
            $color = (string) ($input['color'] ?? '#69C9A5');
            if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $color)) $color = '#69C9A5';
            $statement = $db->prepare('INSERT INTO goals (id,user_id,title,description,life_area,tracking_type,target_value,unit,deadline,color) VALUES (?,?,?,?,?,?,?,?,?,?)');
            $statement->execute([$id, $user['id'], $title, trim((string) ($input['description'] ?? '')), $area, trim((string) ($input['trackingType'] ?? 'count')), $target, trim((string) ($input['unit'] ?? '')), $deadline, strtoupper($color)]);
            Domain::activity($db, $user['id'], 'goal_created', 'Started ' . $title, 'goal', $id);
            return self::get($db, $user['id'], $id);
        });
    }

    public static function delete(PDO $db, array $user, string $goalId, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $goalId): array {
            $goal = $db->prepare('SELECT id,guided_gym_type FROM goals WHERE id=? AND user_id=? FOR UPDATE');
            $goal->execute([$goalId, $user['id']]);
            $row = $goal->fetch();
            if (!$row) throw new HttpError(404, 'Goal not found.');
            if ($row['guided_gym_type'] === null) throw new HttpError(422, 'Only guided gym goals can be removed here.');

            $plan = $db->prepare('SELECT COUNT(*) FROM gym_plans WHERE user_id=? AND primary_goal_id=?');
            $plan->execute([$user['id'], $goalId]);
            if ((int) $plan->fetchColumn() > 0) throw new HttpError(422, 'Gym plan goals cannot be removed.');
            $entries = $db->prepare('SELECT COUNT(*) FROM progress_entries WHERE user_id=? AND goal_id=?');
            $entries->execute([$user['id'], $goalId]);
            if ((int) $entries->fetchColumn() > 0) throw new HttpError(422, 'Goals with progress cannot be removed.');

            $db->prepare('DELETE FROM goals WHERE id=? AND user_id=?')->execute([$goalId, $user['id']]);
            Domain::activity($db, $user['id'], 'goal_deleted', 'Removed a goal', 'goal', $goalId);
            return ['deleted' => true, 'id' => $goalId];
        });
    }

    public static function addMilestone(PDO $db, array $user, string $goalId, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $goalId, $input): array {
            self::get($db, $user['id'], $goalId);
            $label = trim((string) ($input['label'] ?? ''));
            $target = (float) ($input['targetValue'] ?? 0);
            if ($label === '' || $target <= 0) throw new HttpError(422, 'Enter a milestone and target.');
            $id = Auth::uuid();
            $position = (int) $db->query('SELECT COUNT(*) FROM milestones WHERE goal_id=' . $db->quote($goalId))->fetchColumn();
            $db->prepare('INSERT INTO milestones (id,user_id,goal_id,label,target_value,position) VALUES (?,?,?,?,?,?)')->execute([$id, $user['id'], $goalId, $label, $target, $position]);
            Domain::activity($db, $user['id'], 'milestone_created', 'Added ' . $label, 'goal', $goalId);
            return ['id' => $id, 'goalId' => $goalId, 'label' => $label, 'targetValue' => $target, 'completedAt' => null, 'position' => $position];
        });
    }

    public static function addEntry(PDO $db, array $user, string $goalId, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, fn() => self::insertEntry($db, $user, $goalId, $input));
    }

    public static function insertGymEntry(PDO $db, array $user, string $goalId, array $input): array
    {
        return self::insertEntry($db, $user, $goalId, $input);
    }

    public static function checkin(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $input): array {
            $date = Domain::validDate((string) ($input['date'] ?? ''));
            $energy = (string) ($input['energy'] ?? '');
            $mood = (int) ($input['mood'] ?? 0);
            if (!in_array($energy, ['low','medium','high'], true) || $mood < 1 || $mood > 5) throw new HttpError(422, 'Choose your energy and mood.');
            $reflections = [];
            foreach (['intention', 'win', 'gratitude'] as $field) {
                if (array_key_exists($field, $input) && !is_string($input[$field])) throw new HttpError(422, 'Enter reflection text.', ['field' => $field]);
                $value = array_key_exists($field, $input) ? trim((string) $input[$field]) : null;
                if ($value !== null && mb_strlen($value) > 280) throw new HttpError(422, 'Keep each reflection under 280 characters.', ['field' => $field]);
                $reflections[$field] = $value;
            }
            $id = Auth::uuid();
            $statement = $db->prepare('INSERT INTO daily_checkins (id,user_id,local_date,energy,mood,note,intention,win,gratitude) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE energy=VALUES(energy),mood=VALUES(mood),note=VALUES(note),intention=COALESCE(VALUES(intention),intention),win=COALESCE(VALUES(win),win),gratitude=COALESCE(VALUES(gratitude),gratitude)');
            $statement->execute([$id, $user['id'], $date, $energy, $mood, trim((string) ($input['note'] ?? '')), $reflections['intention'], $reflections['win'], $reflections['gratitude']]);
            Domain::activity($db, $user['id'], 'checkin_saved', 'Saved today\'s check-in', 'checkin', $id);
            $saved = $db->prepare('SELECT id,local_date,energy,mood,note,intention,win,gratitude FROM daily_checkins WHERE user_id=? AND local_date=?');
            $saved->execute([$user['id'], $date]);
            return self::checkinRow($saved->fetch());
        });
    }

    public static function updatePreferences(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $input): array {
            $allowed = ['fitness','learning','work','money','wellbeing','home'];
            $areas = array_values(array_unique(array_filter((array) ($input['enabledAreas'] ?? $user['enabledAreas']), fn($value) => in_array($value, $allowed, true))));
            $step = array_key_exists('onboardingStep', $input) ? $input['onboardingStep'] : $user['onboardingStep'];
            if ($step !== null && !in_array($step, ['areas', 'first-item', 'first-win', 'install'], true)) throw new HttpError(422, 'Choose a valid onboarding step.');
            if (array_key_exists('displayName', $input) && !is_string($input['displayName'])) throw new HttpError(422, 'Enter a valid name.', ['field' => 'displayName']);
            $displayName = array_key_exists('displayName', $input) ? trim($input['displayName']) : $user['displayName'];
            if (mb_strlen($displayName) > 80) throw new HttpError(422, 'Keep your name under 80 characters.', ['field' => 'displayName']);
            $preferences = ['enabledAreas' => $areas, 'onboardingStep' => $step, 'displayName' => $displayName];
            $choices = [
                'appearance' => ['system', 'light', 'dark'], 'gardenSeason' => ['dawn', 'rain', 'moon'],
                'voice' => ['gentle', 'focused', 'cheerful'], 'focusWindow' => ['learn', 'morning', 'afternoon', 'evening'],
                'celebration' => ['quiet', 'full'],
            ];
            foreach ($choices as $field => $allowedValues) {
                if (array_key_exists($field, $input) && !is_string($input[$field])) throw new HttpError(422, 'Choose a valid ' . preg_replace('/([A-Z])/', ' $1', $field) . '.', ['field' => $field]);
                $value = (string) ($input[$field] ?? $user[$field]);
                if (!in_array($value, $allowedValues, true)) throw new HttpError(422, 'Choose a valid ' . preg_replace('/([A-Z])/', ' $1', $field) . '.', ['field' => $field]);
                $preferences[$field] = $value;
            }
            if (array_key_exists('contextualAmbience', $input) && !is_bool($input['contextualAmbience'])) throw new HttpError(422, 'Choose whether to use local ambience.', ['field' => 'contextualAmbience']);
            $preferences['contextualAmbience'] = $input['contextualAmbience'] ?? $user['contextualAmbience'];
            $places = $input['gymPlaces'] ?? $user['gymPlaces'];
            if (!is_array($places) || count($places) > 8) throw new HttpError(422, 'Save up to eight workout places.', ['field' => 'gymPlaces']);
            $seenPlaces = [];
            $preferences['gymPlaces'] = array_map(function (mixed $place) use (&$seenPlaces): array {
                if (!is_array($place) || !isset($place['id']) || !is_string($place['id']) || !isset($place['name']) || !is_string($place['name'])) throw new HttpError(422, 'Enter a valid workout place.', ['field' => 'gymPlaces']);
                $id = Auth::uuid($place['id']);
                $name = trim($place['name']);
                $latitude = $place['latitude'] ?? null;
                $longitude = $place['longitude'] ?? null;
                $radius = $place['radiusMeters'] ?? null;
                if ($name === '' || mb_strlen($name) > 60 || (!is_int($latitude) && !is_float($latitude)) || (!is_int($longitude) && !is_float($longitude)) || !is_int($radius) || $latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180 || $radius < 100 || $radius > 1000 || isset($seenPlaces[$id])) throw new HttpError(422, 'Enter a valid workout place.', ['field' => 'gymPlaces']);
                $seenPlaces[$id] = true;
                return ['id' => $id, 'name' => $name, 'latitude' => $latitude, 'longitude' => $longitude, 'radiusMeters' => $radius];
            }, array_values($places));
            $preferences = json_encode($preferences, JSON_THROW_ON_ERROR);
            $db->prepare('UPDATE users SET preferences=? WHERE id=?')->execute([$preferences, $user['id']]);
            return Auth::findById($db, $user['id']);
        });
    }

    public static function focus(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $input): array {
            $minutes = (int) ($input['minutes'] ?? 0);
            if ($minutes < 1 || $minutes > 1440) throw new HttpError(422, 'Focus time must be between 1 minute and 24 hours.');
            $goalId = $input['goalId'] ?? null;
            $taskId = $input['taskId'] ?? null;
            if ($taskId) $goalId = Tasks::get($db, $user, (string) $taskId)['goalId'] ?: $goalId;
            if ($goalId) return self::insertEntry($db, $user, (string) $goalId, ['entryType' => 'focus', 'metric' => 'focus-minutes', 'value' => $minutes, 'durationMinutes' => $minutes, 'details' => ['taskId' => $taskId], 'occurrenceAt' => gmdate('c')]);
            $id = Auth::uuid();
            Domain::activity($db, $user['id'], 'focus_completed', "Focused for {$minutes} minutes", 'focus', $id, ['taskId' => $taskId, 'minutes' => $minutes]);
            return ['id' => $id, 'taskId' => $taskId, 'minutes' => $minutes];
        });
    }

    public static function get(PDO $db, string $userId, string $id): array
    {
        $statement = $db->prepare('SELECT * FROM goals WHERE id=? AND user_id=?');
        $statement->execute([$id, $userId]);
        $row = $statement->fetch();
        if (!$row) throw new HttpError(404, 'Goal not found.');
        return self::goal($row);
    }

    public static function all(PDO $db, string $userId): array
    {
        $statement = $db->prepare('SELECT * FROM goals WHERE user_id=? ORDER BY status, created_at');
        $statement->execute([$userId]);
        return array_map(self::goal(...), $statement->fetchAll());
    }

    private static function insertEntry(PDO $db, array $user, string $goalId, array $input): array
    {
        $goal = self::get($db, $user['id'], $goalId);
        $type = trim((string) ($input['entryType'] ?? 'progress'));
        $metric = trim((string) ($input['metric'] ?? $goal['unit'] ?: 'progress'));
        $value = (float) ($input['value'] ?? 0);
        $duration = isset($input['durationMinutes']) ? (int) $input['durationMinutes'] : null;
        if ($type === '' || $metric === '' || !is_finite($value) || $value < 0 || ($duration !== null && ($duration < 0 || $duration > 1440))) throw new HttpError(422, 'Enter valid progress.');
        $id = Auth::uuid(isset($input['id']) ? (string) $input['id'] : null);
        $status = $type === 'workout' ? 'pending_proof' : 'complete';
        $occurrence = Domain::validDateTime((string) ($input['occurrenceAt'] ?? 'now'));
        $details = is_array($input['details'] ?? null) ? $input['details'] : [];
        $statement = $db->prepare('INSERT INTO progress_entries (id,user_id,goal_id,entry_type,metric,value,duration_minutes,details,note,occurrence_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $statement->execute([$id, $user['id'], $goalId, $type, $metric, $value, $duration, json_encode($details, JSON_THROW_ON_ERROR), trim((string) ($input['note'] ?? '')), $occurrence, $status]);
        if ($status === 'complete') $db->prepare('UPDATE goals SET current_value=current_value+? WHERE id=? AND user_id=?')->execute([$value, $goalId, $user['id']]);
        Domain::activity($db, $user['id'], $status === 'complete' ? 'progress_added' : 'proof_requested', $status === 'complete' ? 'Added progress to ' . $goal['title'] : 'Proof needed for workout', 'progress', $id, ['value' => $value, 'metric' => $metric]);
        return ['id' => $id, 'goalId' => $goalId, 'area' => $goal['area'], 'entryType' => $type, 'metric' => $metric, 'value' => $value, 'durationMinutes' => $duration, 'details' => $details, 'note' => trim((string) ($input['note'] ?? '')), 'occurrenceAt' => $occurrence, 'status' => $status, 'createdAt' => gmdate('Y-m-d H:i:s.v')];
    }

    private static function goal(array $row): array
    {
        return ['id' => $row['id'], 'title' => $row['title'], 'description' => $row['description'], 'area' => $row['life_area'], 'trackingType' => $row['tracking_type'], 'targetValue' => (float) $row['target_value'], 'currentValue' => (float) $row['current_value'], 'unit' => $row['unit'], 'deadline' => $row['deadline'], 'color' => $row['color'], 'gymType' => $row['guided_gym_type'] ?? null, 'gymSettings' => isset($row['guided_gym_settings']) ? json_decode($row['guided_gym_settings'], true, 512, JSON_THROW_ON_ERROR) : null, 'status' => $row['status'], 'createdAt' => $row['created_at'], 'updatedAt' => $row['updated_at']];
    }

    private static function checkinRow(array $row): array
    {
        return ['id' => $row['id'], 'date' => $row['local_date'], 'energy' => $row['energy'], 'mood' => (int) $row['mood'], 'note' => $row['note'], 'intention' => $row['intention'] ?? '', 'win' => $row['win'] ?? '', 'gratitude' => $row['gratitude'] ?? ''];
    }
}
