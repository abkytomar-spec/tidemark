<?php
declare(strict_types=1);

final class Gym
{
    private const GOAL_FIELDS = [
        'physique' => ['direction', 'targetWeight', 'targetBodyFat', 'targetWaist', 'cadence', 'checkinCadence', 'photos', 'photoAngles'],
        'strength_pr' => ['exercise', 'baselineLoad', 'baselineReps', 'targetLoad', 'targetReps', 'weightUnit', 'targetDate'],
        'body_measurements' => ['metrics', 'targets', 'weightUnit', 'measurementUnit', 'cadence', 'checkinCadence'],
        'workout_consistency' => ['weeklySessionTarget', 'minimumDurationMinutes', 'trainingWeekdays', 'scheduleMode'],
    ];

    public static function snapshot(PDO $db, array $user): array
    {
        $plans = $db->prepare('SELECT * FROM gym_plans WHERE user_id=? ORDER BY effective_from');
        $plans->execute([$user['id']]);
        $routines = $db->prepare('SELECT * FROM gym_routines WHERE user_id=? AND active=TRUE ORDER BY position,created_at');
        $routines->execute([$user['id']]);
        $rests = $db->prepare('SELECT * FROM gym_rest_events WHERE user_id=? ORDER BY local_date');
        $rests->execute([$user['id']]);
        $safe = $db->prepare("SELECT `stored`,qualifying_count,last_protected_date FROM streak_safes WHERE user_id=? AND scope='gym'");
        $safe->execute([$user['id']]);
        $safeRow = $safe->fetch();
        return [
            'plans' => array_map(self::planRow(...), $plans->fetchAll()),
            'routines' => array_map(self::routineRow(...), $routines->fetchAll()),
            'restEvents' => array_map(self::restRow(...), $rests->fetchAll()),
            'safe' => ['scope' => 'gym', 'stored' => (int) ($safeRow['stored'] ?? 0), 'qualifyingCount' => (int) ($safeRow['qualifying_count'] ?? 0), 'lastProtectedDate' => $safeRow['last_protected_date'] ?? null],
        ];
    }

    public static function savePlan(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $input): array {
            $restMode = (string) ($input['restMode'] ?? '');
            if (!in_array($restMode, ['fixed', 'flexible'], true)) throw new HttpError(422, 'Choose fixed or flexible rest.');
            $fixedRest = self::weekdays($input['fixedRestWeekdays'] ?? []);
            $training = self::weekdays($input['trainingWeekdays'] ?? []);
            $allowance = self::integer($input['flexibleRestAllowance'] ?? 1, 1, 2, 'Choose one or two flexible rest days.');
            $target = self::integer($input['weeklySessionTarget'] ?? 0, 1, 7, 'Choose between one and seven weekly sessions.');
            $weightUnit = (string) ($input['weightUnit'] ?? '');
            $measurementUnit = (string) ($input['measurementUnit'] ?? '');
            if (!in_array($weightUnit, ['kg', 'lb'], true) || !in_array($measurementUnit, ['cm', 'in'], true)) throw new HttpError(422, 'Choose valid gym units.');
            $effectiveFrom = Domain::validDate((string) ($input['effectiveFrom'] ?? ''));
            $owner = $db->prepare('SELECT timezone FROM users WHERE id=? FOR UPDATE');
            $owner->execute([$user['id']]);
            $timezone = $owner->fetchColumn();
            $latest = $db->prepare('SELECT id,effective_from FROM gym_plans WHERE user_id=? ORDER BY effective_from DESC LIMIT 1 FOR UPDATE');
            $latest->execute([$user['id']]);
            $latestPlan = $latest->fetch();
            $today = (new DateTimeImmutable('now', new DateTimeZone((string) $timezone)))->format('Y-m-d');
            if ($latestPlan && ($effectiveFrom <= $latestPlan['effective_from'] || $effectiveFrom <= $today)) throw new HttpError(422, 'Schedule changes must start after today and the latest gym plan.');
            $goalId = isset($input['primaryGoalId']) && $input['primaryGoalId'] !== '' ? (string) $input['primaryGoalId'] : null;
            if ($goalId) {
                Goals::get($db, $user['id'], $goalId);
            } else {
                $goal = self::activeGuidedGoal($db, $user['id'], (string) ($input['goalType'] ?? '')) ?? self::insertGoal($db, $user, [
                    'title' => $input['goalTitle'] ?? '', 'gymType' => $input['goalType'] ?? '',
                    'targetValue' => $input['targetValue'] ?? $target,
                    'unit' => $input['unit'] ?? 'workouts', 'settings' => $input['goalSettings'] ?? [],
                ]);
                $goalId = $goal['id'];
            }
            if ($latestPlan) $db->prepare('UPDATE gym_plans SET effective_to=? WHERE id=? AND user_id=?')->execute([$effectiveFrom, $latestPlan['id'], $user['id']]);
            $id = Auth::uuid(isset($input['id']) ? (string) $input['id'] : null);
            $db->prepare('INSERT INTO gym_plans (id,user_id,primary_goal_id,rest_mode,fixed_rest_weekdays,flexible_rest_allowance,training_weekdays,weekly_session_target,weight_unit,measurement_unit,effective_from) VALUES (?,?,?,?,?,?,?,?,?,?,?)')->execute([
                $id, $user['id'], $goalId, $restMode, json_encode($fixedRest, JSON_THROW_ON_ERROR), $allowance,
                json_encode($training, JSON_THROW_ON_ERROR), $target, $weightUnit, $measurementUnit, $effectiveFrom,
            ]);
            Domain::activity($db, $user['id'], 'gym_plan_saved', 'Saved gym plan', 'gym_plan', $id);
            return self::plan($db, $user['id'], $id);
        });
    }

    public static function saveRoutine(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $input): array {
            $name = trim((string) ($input['name'] ?? ''));
            if ($name === '' || mb_strlen($name) > 120) throw new HttpError(422, 'Keep the routine name between 1 and 120 characters.');
            $template = $input['templateSource'] ?? $input['template'] ?? null;
            if ($template !== null && (!is_string($template) || mb_strlen($template) > 40)) throw new HttpError(422, 'Choose a valid routine template.');
            $position = self::integer($input['position'] ?? 0, 0, 65535, 'Choose a valid routine position.');
            if (!is_array($input['exercises'] ?? null)) throw new HttpError(422, 'Add valid routine exercises.');
            $exercises = [];
            foreach ($input['exercises'] as $exercise) {
                if (!is_array($exercise)) throw new HttpError(422, 'Add valid routine exercises.');
                $exerciseName = self::exerciseName($exercise['name'] ?? '');
                if (!is_array($exercise['sets'] ?? null)) throw new HttpError(422, 'Add valid routine sets.');
                $sets = [];
                foreach ($exercise['sets'] as $set) $sets[] = self::set($set, null);
                $sets = array_map(fn(array $set) => array_diff_key($set, ['exercise' => true]), $sets);
                $exercises[] = ['id' => Auth::uuid(isset($exercise['id']) ? (string) $exercise['id'] : null), 'name' => $exerciseName, 'sets' => $sets];
            }
            $id = Auth::uuid(isset($input['id']) ? (string) $input['id'] : null);
            $existing = $db->prepare('SELECT user_id FROM gym_routines WHERE id=?');
            $existing->execute([$id]);
            $ownerId = $existing->fetchColumn();
            if ($ownerId !== false && $ownerId !== $user['id']) throw new HttpError(404, 'Routine not found.');
            if ($ownerId === false) {
                $db->prepare('INSERT INTO gym_routines (id,user_id,name,template_source,exercises,position) VALUES (?,?,?,?,?,?)')->execute([$id, $user['id'], $name, $template, json_encode($exercises, JSON_THROW_ON_ERROR), $position]);
            } else {
                $db->prepare('UPDATE gym_routines SET name=?,template_source=?,exercises=?,position=?,active=TRUE WHERE id=? AND user_id=?')->execute([$name, $template, json_encode($exercises, JSON_THROW_ON_ERROR), $position, $id, $user['id']]);
            }
            Domain::activity($db, $user['id'], 'gym_routine_saved', 'Saved ' . $name, 'gym_routine', $id);
            return self::routine($db, $user['id'], $id);
        });
    }

    public static function deleteRoutine(PDO $db, array $user, string $id, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $id): array {
            self::routine($db, $user['id'], $id);
            $db->prepare('UPDATE gym_routines SET active=FALSE WHERE id=? AND user_id=?')->execute([$id, $user['id']]);
            Domain::activity($db, $user['id'], 'gym_routine_deleted', 'Removed gym routine', 'gym_routine', $id);
            return ['deleted' => true, 'id' => $id];
        });
    }

    public static function setRest(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $input): array {
            $date = Domain::validDate((string) ($input['date'] ?? ''));
            $plan = self::activePlan($db, $user['id'], $date, true);
            if (!$plan) throw new HttpError(422, 'Create a gym plan before adding rest.');
            $kind = $plan['rest_mode'];
            if ($kind === 'flexible') {
                $start = (new DateTimeImmutable($date))->modify('monday this week')->format('Y-m-d');
                $end = (new DateTimeImmutable($start))->modify('+6 days')->format('Y-m-d');
                $count = $db->prepare("SELECT COUNT(*) FROM gym_rest_events WHERE user_id=? AND kind='flexible' AND local_date BETWEEN ? AND ?");
                $count->execute([$user['id'], $start, $end]);
                if ((int) $count->fetchColumn() >= (int) $plan['flexible_rest_allowance']) throw new HttpError(422, 'This week\'s flexible rest allowance is already used.');
            }
            $id = Auth::uuid(isset($input['id']) ? (string) $input['id'] : null);
            $db->prepare('INSERT INTO gym_rest_events (id,user_id,local_date,kind) VALUES (?,?,?,?)')->execute([$id, $user['id'], $date, $kind]);
            Domain::activity($db, $user['id'], 'gym_rest_set', 'Planned a gym rest day', 'gym_rest', $id, ['date' => $date]);
            return ['id' => $id, 'date' => $date, 'kind' => $kind];
        });
    }

    public static function clearRest(PDO $db, array $user, string $date, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $date): array {
            $date = Domain::validDate($date);
            $db->prepare('DELETE FROM gym_rest_events WHERE user_id=? AND local_date=?')->execute([$user['id'], $date]);
            Domain::activity($db, $user['id'], 'gym_rest_cleared', 'Removed a gym rest day', 'gym_rest', Auth::uuid(), ['date' => $date]);
            return ['deleted' => true, 'date' => $date];
        });
    }

    public static function createGoal(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, fn() => self::insertGoal($db, $user, $input));
    }

    public static function addWorkout(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $input): array {
            $goalId = (string) ($input['goalId'] ?? '');
            Goals::get($db, $user['id'], $goalId);
            $date = Domain::validDate((string) ($input['date'] ?? ''));
            $duration = self::integer($input['durationMinutes'] ?? 0, 1, 1440, 'Workout duration must be between 1 minute and 24 hours.');
            if (!is_array($input['sets'] ?? null) || !$input['sets']) throw new HttpError(422, 'Add at least one working set.');
            $sets = array_map(fn($set) => self::set($set, true), $input['sets']);
            if (!array_filter($sets, fn(array $set) => !$set['warmup'])) throw new HttpError(422, 'Add at least one working set.');
            $routineId = ($input['routineId'] ?? null) ?: null;
            if ($routineId !== null) self::routine($db, $user['id'], (string) $routineId);
            $routineName = trim((string) ($input['routineName'] ?? ''));
            if (mb_strlen($routineName) > 120) throw new HttpError(422, 'Keep the routine name under 120 characters.');
            $plannedState = (string) ($input['plannedState'] ?? 'training');
            if (!in_array($plannedState, ['training', 'rest', 'open'], true)) throw new HttpError(422, 'Choose a valid planned workout state.');
            $startedAt = Domain::validDateTime((string) ($input['startedAt'] ?? $date . 'T00:00:00'));
            return Goals::insertGymEntry($db, $user, $goalId, [
                'id' => $input['id'] ?? null, 'entryType' => 'workout', 'metric' => 'workout', 'value' => 1,
                'durationMinutes' => $duration, 'note' => $input['note'] ?? '', 'occurrenceAt' => $input['occurrenceAt'] ?? $date . 'T12:00:00',
                'details' => ['routineId' => $routineId, 'routineName' => $routineName, 'sets' => $sets, 'startedAt' => $startedAt, 'plannedState' => $plannedState],
            ]);
        });
    }

    public static function deleteWorkout(PDO $db, array $user, string $id, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $id): array {
            $statement = $db->prepare("SELECT * FROM progress_entries WHERE id=? AND user_id=? AND entry_type='workout'");
            $statement->execute([$id, $user['id']]);
            $entry = $statement->fetch();
            if (!$entry) throw new HttpError(404, 'Workout not found.');
            $db->prepare('DELETE FROM progress_entries WHERE id=? AND user_id=?')->execute([$id, $user['id']]);
            if ($entry['status'] === 'complete') $db->prepare('UPDATE goals SET current_value=GREATEST(0,current_value-?) WHERE id=? AND user_id=?')->execute([$entry['value'], $entry['goal_id'], $user['id']]);
            self::recalculateSafeProgress($db, $user['id']);
            Domain::activity($db, $user['id'], 'gym_workout_deleted', 'Removed a gym workout', 'progress', $id);
            return ['deleted' => true, 'id' => $id];
        });
    }

    public static function settleSafe(PDO $db, array $user, array $input, string $mutationId): array
    {
        return Domain::once($db, $user['id'], $mutationId, function () use ($db, $user, $input): array {
            $date = Domain::validDate((string) ($input['missedDate'] ?? $input['date'] ?? ''));
            $plan = self::activePlan($db, $user['id'], $date);
            if (!$plan || !in_array((int) (new DateTimeImmutable($date))->format('w'), json_decode($plan['training_weekdays'], true, 512, JSON_THROW_ON_ERROR), true)) throw new HttpError(422, 'Choose a missed scheduled workout.');
            $rest = $db->prepare('SELECT COUNT(*) FROM gym_rest_events WHERE user_id=? AND local_date=?');
            $rest->execute([$user['id'], $date]);
            $fixed = in_array((int) (new DateTimeImmutable($date))->format('w'), json_decode($plan['fixed_rest_weekdays'], true, 512, JSON_THROW_ON_ERROR), true);
            $workout = $db->prepare("SELECT COUNT(*) FROM progress_entries WHERE user_id=? AND entry_type='workout' AND status='complete' AND DATE(occurrence_at)=?");
            $workout->execute([$user['id'], $date]);
            if ($fixed || (int) $rest->fetchColumn() > 0 || (int) $workout->fetchColumn() > 0) throw new HttpError(422, 'Choose a missed scheduled workout.');
            $db->prepare("INSERT IGNORE INTO streak_safes (user_id,scope) VALUES (?,'gym')")->execute([$user['id']]);
            $update = $db->prepare("UPDATE streak_safes SET `stored`=0,earned_entry_ids=JSON_ARRAY(),last_protected_date=? WHERE user_id=? AND scope='gym' AND `stored`=1");
            $update->execute([$date, $user['id']]);
            if ($update->rowCount() !== 1) throw new HttpError(422, 'No Gym Streak Anchor is available.');
            Domain::activity($db, $user['id'], 'gym_safe_used', 'Gym Streak Anchor protected a missed day', 'gym_safe', $user['id'], ['date' => $date]);
            return self::safe($db, $user['id']);
        });
    }

    public static function qualifyWorkout(PDO $db, string $userId, string $entryId): array
    {
        $entry = $db->prepare("SELECT COUNT(*) FROM progress_entries e JOIN proof_photos p ON p.progress_entry_id=e.id WHERE e.id=? AND e.user_id=? AND e.entry_type='workout' AND e.status='complete'");
        $entry->execute([$entryId, $userId]);
        if ((int) $entry->fetchColumn() === 0) throw new HttpError(404, 'Completed workout not found.');
        $ownsTransaction = !$db->inTransaction();
        if ($ownsTransaction) $db->beginTransaction();
        try {
            $db->prepare("INSERT IGNORE INTO streak_safes (user_id,scope,qualifying_entry_ids) VALUES (?,'gym',JSON_ARRAY())")->execute([$userId]);
            $state = self::safeState($db, $userId, true);
            $ids = json_decode($state['qualifying_entry_ids'], true, 512, JSON_THROW_ON_ERROR);
            if (!in_array($entryId, $ids, true)) {
                $ids[] = $entryId;
                // ponytail: this per-user processed-ID list grows with workouts; move it to a qualification table if row size becomes material.
                if ((bool) $state['stored']) {
                    $db->prepare("UPDATE streak_safes SET qualifying_entry_ids=? WHERE user_id=? AND scope='gym'")->execute([json_encode($ids, JSON_THROW_ON_ERROR), $userId]);
                } else {
                    $count = (int) $state['qualifying_count'] + 1;
                    $earned = $count === 7;
                    $earnedIds = json_decode($state['earned_entry_ids'], true, 512, JSON_THROW_ON_ERROR);
                    $earnedIds = $earned ? array_slice($ids, -7) : ($earnedIds ? [...$earnedIds, $entryId] : []);
                    $db->prepare("UPDATE streak_safes SET `stored`=?,qualifying_count=?,qualifying_entry_ids=?,earned_entry_ids=? WHERE user_id=? AND scope='gym'")->execute([$earned ? 1 : 0, $earned ? 0 : $count, json_encode($ids, JSON_THROW_ON_ERROR), json_encode($earnedIds, JSON_THROW_ON_ERROR), $userId]);
                }
            }
            if ($ownsTransaction) $db->commit();
            return self::safe($db, $userId);
        } catch (Throwable $error) {
            if ($ownsTransaction && $db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }

    public static function recalculateSafeProgress(PDO $db, string $userId): array
    {
        $ownsTransaction = !$db->inTransaction();
        if ($ownsTransaction) $db->beginTransaction();
        try {
            $db->prepare("INSERT IGNORE INTO streak_safes (user_id,scope,qualifying_entry_ids) VALUES (?,'gym',JSON_ARRAY())")->execute([$userId]);
            $state = self::safeState($db, $userId, true);
            $ids = json_decode($state['qualifying_entry_ids'], true, 512, JSON_THROW_ON_ERROR);
            $earnedIds = json_decode($state['earned_entry_ids'], true, 512, JSON_THROW_ON_ERROR);
            $count = (int) $state['qualifying_count'];
            $qualifies = $db->prepare("SELECT COUNT(*) FROM progress_entries e JOIN proof_photos p ON p.progress_entry_id=e.id WHERE e.id=? AND e.user_id=? AND e.entry_type='workout' AND e.status='complete'");
            if ((bool) $state['stored']) {
                $kept = [];
                foreach ($earnedIds as $id) {
                    $qualifies->execute([$id, $userId]);
                    if ((int) $qualifies->fetchColumn() > 0) $kept[] = $id;
                }
                if (count($kept) < count($earnedIds)) {
                    $ids = array_values(array_diff($ids, $earnedIds));
                    $ids = array_merge($ids, $kept);
                    $db->prepare("UPDATE streak_safes SET `stored`=0,qualifying_count=?,qualifying_entry_ids=?,earned_entry_ids=? WHERE user_id=? AND scope='gym'")->execute([count($kept), json_encode($ids, JSON_THROW_ON_ERROR), json_encode($kept, JSON_THROW_ON_ERROR), $userId]);
                }
            } elseif ($count > 0) {
                foreach (array_slice($ids, -$count) as $id) {
                    $qualifies->execute([$id, $userId]);
                    if ((int) $qualifies->fetchColumn() === 0) {
                        unset($ids[array_search($id, $ids, true)]);
                        $count--;
                    }
                }
                $earnedIds = array_values(array_intersect($earnedIds, $ids));
                $db->prepare("UPDATE streak_safes SET qualifying_count=?,qualifying_entry_ids=?,earned_entry_ids=? WHERE user_id=? AND scope='gym'")->execute([$count, json_encode(array_values($ids), JSON_THROW_ON_ERROR), json_encode($earnedIds, JSON_THROW_ON_ERROR), $userId]);
            }
            if ($ownsTransaction) $db->commit();
            return self::safe($db, $userId);
        } catch (Throwable $error) {
            if ($ownsTransaction && $db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }

    private static function insertGoal(PDO $db, array $user, array $input): array
    {
        $owner = $db->prepare('SELECT id FROM users WHERE id=? FOR UPDATE');
        $owner->execute([$user['id']]);
        $title = trim((string) ($input['title'] ?? ''));
        if ($title === '' || mb_strlen($title) > 160) throw new HttpError(422, 'Enter a goal title.');
        $type = (string) ($input['gymType'] ?? '');
        if (!isset(self::GOAL_FIELDS[$type])) throw new HttpError(422, 'Choose a guided gym goal type.');
        if (self::activeGuidedGoal($db, $user['id'], $type)) throw new HttpError(409, 'This guided gym goal is already active.');
        $settings = $input['settings'] ?? [];
        if (!is_array($settings) || array_is_list($settings) && $settings !== []) throw new HttpError(422, 'Enter valid goal settings.');
        $unknown = array_diff(array_keys($settings), self::GOAL_FIELDS[$type]);
        if ($unknown) throw new HttpError(422, 'Remove settings that do not belong to this goal type.');
        $target = $input['targetValue'] ?? 1;
        if (!is_int($target) && !is_float($target) || !is_finite((float) $target) || (float) $target <= 0) throw new HttpError(422, 'Enter a target greater than zero.');
        $unit = trim((string) ($input['unit'] ?? ($type === 'workout_consistency' ? 'workouts' : '')));
        if (mb_strlen($unit) > 32) throw new HttpError(422, 'Choose a valid goal unit.');
        $deadline = ($input['deadline'] ?? null) ? Domain::validDate((string) $input['deadline']) : null;
        $id = Auth::uuid(isset($input['id']) ? (string) $input['id'] : null);
        $tracking = match ($type) { 'strength_pr' => 'weight', 'body_measurements' => 'measurement', 'physique' => 'checkin', default => 'count' };
        $db->prepare('INSERT INTO goals (id,user_id,title,description,life_area,tracking_type,target_value,unit,deadline,color,guided_gym_type,guided_gym_settings) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')->execute([
            $id, $user['id'], $title, trim((string) ($input['description'] ?? '')), 'fitness', $tracking, (float) $target,
            $unit, $deadline, '#69C9A5', $type, json_encode($settings, JSON_THROW_ON_ERROR),
        ]);
        Domain::activity($db, $user['id'], 'goal_created', 'Started ' . $title, 'goal', $id);
        return Goals::get($db, $user['id'], $id);
    }

    private static function activeGuidedGoal(PDO $db, string $userId, string $type): ?array
    {
        $statement = $db->prepare("SELECT id FROM goals WHERE user_id=? AND guided_gym_type=? AND status='active' ORDER BY created_at,id LIMIT 1");
        $statement->execute([$userId, $type]);
        $id = $statement->fetchColumn();
        return $id === false ? null : Goals::get($db, $userId, (string) $id);
    }

    private static function weekdays(mixed $value): array
    {
        if (!is_array($value) || count($value) !== count(array_unique($value, SORT_REGULAR))) throw new HttpError(422, 'Choose unique weekdays.');
        foreach ($value as $day) if (!is_int($day) || $day < 0 || $day > 6) throw new HttpError(422, 'Choose valid weekdays.');
        return array_values($value);
    }

    private static function integer(mixed $value, int $min, int $max, string $message): int
    {
        if (!is_int($value) || $value < $min || $value > $max) throw new HttpError(422, $message);
        return $value;
    }

    private static function exerciseName(mixed $value): string
    {
        $name = is_string($value) ? trim($value) : '';
        if ($name === '' || mb_strlen($name) > 100) throw new HttpError(422, 'Keep exercise names between 1 and 100 characters.');
        return $name;
    }

    private static function set(mixed $value, ?bool $withExercise): array
    {
        if (!is_array($value)) throw new HttpError(422, 'Add valid workout sets.');
        $reps = self::integer($value['reps'] ?? null, 1, 1000, 'Reps must be between 1 and 1000.');
        $load = $value['load'] ?? null;
        if ((!is_int($load) && !is_float($load)) || !is_finite((float) $load) || $load < 0 || $load > 2000) throw new HttpError(422, 'Load must be between 0 and 2000.');
        $rpe = $value['rpe'] ?? null;
        if ($rpe !== null && ((!is_int($rpe) && !is_float($rpe)) || !is_finite((float) $rpe) || $rpe < 1 || $rpe > 10)) throw new HttpError(422, 'RPE must be between 1 and 10.');
        $set = ['reps' => $reps, 'load' => (float) $load, 'warmup' => (bool) ($value['warmup'] ?? false), 'rpe' => $rpe === null ? null : (float) $rpe];
        if ($withExercise) $set = ['exercise' => self::exerciseName($value['exercise'] ?? '')] + $set;
        return $set;
    }

    private static function activePlan(PDO $db, string $userId, string $date, bool $forUpdate = false): ?array
    {
        $statement = $db->prepare('SELECT * FROM gym_plans WHERE user_id=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>?) ORDER BY effective_from DESC LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : ''));
        $statement->execute([$userId, $date, $date]);
        return $statement->fetch() ?: null;
    }

    private static function plan(PDO $db, string $userId, string $id): array
    {
        $statement = $db->prepare('SELECT * FROM gym_plans WHERE id=? AND user_id=?');
        $statement->execute([$id, $userId]);
        $row = $statement->fetch();
        if (!$row) throw new HttpError(404, 'Gym plan not found.');
        return self::planRow($row);
    }

    private static function routine(PDO $db, string $userId, string $id): array
    {
        $statement = $db->prepare('SELECT * FROM gym_routines WHERE id=? AND user_id=?');
        $statement->execute([$id, $userId]);
        $row = $statement->fetch();
        if (!$row) throw new HttpError(404, 'Routine not found.');
        return self::routineRow($row);
    }

    private static function safe(PDO $db, string $userId): array
    {
        $row = self::safeState($db, $userId);
        return ['scope' => 'gym', 'stored' => (int) ($row['stored'] ?? 0), 'qualifyingCount' => (int) ($row['qualifying_count'] ?? 0), 'lastProtectedDate' => $row['last_protected_date'] ?? null];
    }

    private static function safeState(PDO $db, string $userId, bool $forUpdate = false): array
    {
        $statement = $db->prepare("SELECT `stored`,qualifying_count,qualifying_entry_ids,earned_entry_ids,last_protected_date FROM streak_safes WHERE user_id=? AND scope='gym'" . ($forUpdate ? ' FOR UPDATE' : ''));
        $statement->execute([$userId]);
        return $statement->fetch() ?: ['stored' => 0, 'qualifying_count' => 0, 'qualifying_entry_ids' => '[]', 'earned_entry_ids' => '[]', 'last_protected_date' => null];
    }

    private static function planRow(array $row): array
    {
        return ['id' => $row['id'], 'primaryGoalId' => $row['primary_goal_id'], 'restMode' => $row['rest_mode'], 'fixedRestWeekdays' => json_decode($row['fixed_rest_weekdays'], true, 512, JSON_THROW_ON_ERROR), 'flexibleRestAllowance' => (int) $row['flexible_rest_allowance'], 'trainingWeekdays' => json_decode($row['training_weekdays'], true, 512, JSON_THROW_ON_ERROR), 'weeklySessionTarget' => (int) $row['weekly_session_target'], 'weightUnit' => $row['weight_unit'], 'measurementUnit' => $row['measurement_unit'], 'effectiveFrom' => $row['effective_from'], 'effectiveTo' => $row['effective_to']];
    }

    private static function routineRow(array $row): array
    {
        return ['id' => $row['id'], 'name' => $row['name'], 'template' => $row['template_source'], 'exercises' => json_decode($row['exercises'], true, 512, JSON_THROW_ON_ERROR), 'position' => (int) $row['position'], 'active' => (bool) $row['active'], 'createdAt' => $row['created_at'], 'updatedAt' => $row['updated_at']];
    }

    private static function restRow(array $row): array
    {
        return ['id' => $row['id'], 'date' => $row['local_date'], 'kind' => $row['kind']];
    }
}
