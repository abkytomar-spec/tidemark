<?php
declare(strict_types=1);

test('a renamed non-image is rejected without completing a workout', function (): void {
    fresh_database();
    $user = owner();
    $goal = Goals::create(db(), $user, ['title' => 'Stronger', 'area' => 'fitness', 'trackingType' => 'weight', 'targetValue' => 100, 'unit' => 'kg'], 'photo-goal-0001');
    $workout = Goals::addEntry(db(), $user, $goal['id'], ['entryType' => 'workout', 'metric' => 'bench', 'value' => 70, 'details' => [], 'occurrenceAt' => '2026-08-09T07:00:00+05:30'], 'photo-entry-0001');
    expect_http(422, fn() => Photos::upload(db(), $user, 'progress', $workout['id'], temp_upload('proof.jpg', 'not an image'), 'photo-bad-0001'));
    assert_same('pending_proof', db()->query('SELECT status FROM progress_entries LIMIT 1')->fetchColumn());
    assert_same(0, (int) db()->query('SELECT COUNT(*) FROM proof_photos')->fetchColumn());
});

test('valid workout proof completes progress and is private metadata', function (): void {
    fresh_database();
    $user = owner();
    $goal = Goals::create(db(), $user, ['title' => 'Stronger', 'area' => 'fitness', 'trackingType' => 'weight', 'targetValue' => 100, 'unit' => 'kg'], 'photo-goal-0002');
    $workout = Goals::addEntry(db(), $user, $goal['id'], ['entryType' => 'workout', 'metric' => 'bench', 'value' => 70, 'details' => [], 'occurrenceAt' => '2026-08-09T07:00:00+05:30'], 'photo-entry-0002');
    $proof = Photos::upload(db(), $user, 'progress', $workout['id'], png_upload(), 'photo-good-0001');
    assert_same('gym', $proof['category']);
    assert_same('complete', db()->query('SELECT status FROM progress_entries LIMIT 1')->fetchColumn());
    assert_same('70.00', db()->query('SELECT current_value FROM goals LIMIT 1')->fetchColumn());
    assert_true(!isset($proof['storagePath']));
    assert_true(is_file(Photos::absolutePath(db(), $user, $proof['id'])));
});

test('a Gym workout accepts exactly one proof photo', function (): void {
    fresh_database();
    $user = owner();
    $plan = Gym::savePlan(db(), $user, ['goalType' => 'workout_consistency', 'goalTitle' => 'Train steadily', 'restMode' => 'fixed', 'fixedRestWeekdays' => [6], 'flexibleRestAllowance' => 1, 'trainingWeekdays' => [1,2,3,4,5], 'weeklySessionTarget' => 5, 'weightUnit' => 'kg', 'measurementUnit' => 'cm', 'effectiveFrom' => '2026-08-01'], 'photo-single-plan-1');
    $workout = Gym::addWorkout(db(), $user, ['goalId' => $plan['primaryGoalId'], 'date' => '2026-08-09', 'durationMinutes' => 40, 'sets' => [['exercise' => 'Squat', 'reps' => 5, 'load' => 20, 'warmup' => false, 'rpe' => 7]]], 'photo-single-workout-1');

    Photos::upload(db(), $user, 'progress', $workout['id'], png_upload(), 'photo-single-proof-1');
    $error = expect_http(409, fn() => Photos::upload(db(), $user, 'progress', $workout['id'], png_upload(), 'photo-single-proof-2'));

    assert_same('This workout already has a proof photo.', $error->getMessage());
    assert_same(1, (int) db()->query('SELECT COUNT(*) FROM proof_photos')->fetchColumn());
    assert_same('complete', db()->query('SELECT status FROM progress_entries LIMIT 1')->fetchColumn());
    assert_same('1.00', db()->query('SELECT current_value FROM goals LIMIT 1')->fetchColumn());
    assert_same(1, Gym::snapshot(db(), $user)['safe']['qualifyingCount']);
    assert_same(1, count(glob(Database::config()['storage_root'] . '/' . $user['id'] . '/*/*/*') ?: []));
});

test('non-workout progress can retain multiple proof photos', function (): void {
    fresh_database();
    $user = owner();
    $goal = Goals::create(db(), $user, ['title' => 'Physique', 'area' => 'fitness', 'trackingType' => 'checkin', 'targetValue' => 12, 'unit' => 'checkins'], 'photo-multi-goal-1');
    $entry = Goals::addEntry(db(), $user, $goal['id'], ['entryType' => 'physique_checkin', 'metric' => 'checkin', 'value' => 1, 'details' => [], 'occurrenceAt' => '2026-08-09T07:00:00+05:30'], 'photo-multi-entry-1');

    $proof = Photos::upload(db(), $user, 'progress', $entry['id'], png_upload(), 'photo-multi-proof-1');
    Photos::upload(db(), $user, 'progress', $entry['id'], png_upload(), 'photo-multi-proof-2');

    assert_same('goals', $proof['category']);
    assert_same(2, (int) db()->query('SELECT COUNT(*) FROM proof_photos')->fetchColumn());
});

test('qualification failure rolls back workout proof progress and private storage', function (): void {
    fresh_database();
    $user = owner();
    $plan = Gym::savePlan(db(), $user, ['goalType' => 'workout_consistency', 'goalTitle' => 'Train steadily', 'restMode' => 'fixed', 'fixedRestWeekdays' => [6], 'flexibleRestAllowance' => 1, 'trainingWeekdays' => [1,2,3,4,5], 'weeklySessionTarget' => 5, 'weightUnit' => 'kg', 'measurementUnit' => 'cm', 'effectiveFrom' => '2026-08-01'], 'photo-failure-plan-1');
    $workout = Gym::addWorkout(db(), $user, ['goalId' => $plan['primaryGoalId'], 'date' => '2026-08-09', 'durationMinutes' => 40, 'sets' => [['exercise' => 'Squat', 'reps' => 5, 'load' => 20, 'warmup' => false, 'rpe' => 7]]], 'photo-failure-workout-1');
    $admin = new PDO('mysql:host=db;dbname=tidemark_test;charset=utf8mb4', 'root', 'root-test', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $admin->exec("CREATE TRIGGER fail_gym_safe_qualification BEFORE UPDATE ON streak_safes FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected gym safe qualification failure'");

    try {
        Photos::upload(db(), $user, 'progress', $workout['id'], png_upload(), 'photo-failure-proof-1');
        throw new RuntimeException('Expected injected Gym Anchor qualification failure.');
    } catch (PDOException $error) {
        assert_true(str_contains($error->getMessage(), 'injected gym safe qualification failure'));
    } finally {
        $admin->exec('DROP TRIGGER IF EXISTS fail_gym_safe_qualification');
    }

    assert_same('pending_proof', db()->query('SELECT status FROM progress_entries LIMIT 1')->fetchColumn());
    assert_same('0.00', db()->query('SELECT current_value FROM goals LIMIT 1')->fetchColumn());
    $safe = Gym::snapshot(db(), $user)['safe'];
    assert_same(0, $safe['stored']);
    assert_same(0, $safe['qualifyingCount']);
    assert_same(0, (int) db()->query('SELECT COUNT(*) FROM proof_photos')->fetchColumn());
    $stored = glob(Database::config()['storage_root'] . '/' . $user['id'] . '/*/*/*') ?: [];
    assert_same([], $stored);
});

test('proof bytes cannot be resolved by another owner', function (): void {
    fresh_database();
    $user = owner();
    $task = Tasks::create(db(), $user, task_input(['proofRequired' => true]), 'photo-task-0001');
    $completion = Tasks::complete(db(), $user, $task['id'], ['date' => '2026-08-09'], 'photo-complete-0001');
    $proof = Photos::upload(db(), $user, 'completion', $completion['id'], png_upload(), 'photo-good-0002');
    assert_same('tasks', $proof['category']);
    expect_http(404, fn() => Photos::absolutePath(db(), ['id' => Auth::uuid()], $proof['id']));
});

test('Daily Snapshots keep multiple captioned photos without cancelling the reminder', function (): void {
    fresh_database(); $user = owner();
    DailyMoments::saveSettings(db(), $user, ['enabled' => true, 'windowStart' => '12:00', 'windowEnd' => '17:00', 'notifications' => false], 'moment-settings-001');
    $day = DailyMoments::capture(db(), $user, '2026-08-11', 'A small day', 'moment-capture-001');

    $proof = Photos::upload(db(), $user, 'daily_moment', $day['id'], png_upload(), 'moment-proof-0001', 'A small day');
    $second = Photos::upload(db(), $user, 'daily_moment', $day['id'], png_upload(), 'moment-proof-0002', 'Second');

    assert_same('daily_moment', $proof['ownerType']);
    assert_same('daily', $proof['category']);
    assert_same('A small day', $proof['caption']);
    assert_same('Second', $second['caption']);
    assert_same($day['id'], $proof['ownerId']);
    assert_same('scheduled', DailyMoments::today(db(), $user, new DateTimeImmutable('2026-08-11 18:00:00', new DateTimeZone($user['timezone'])))['status']);
    assert_same($day['id'], DailyMoments::duePrompt(db(), $user, new DateTimeImmutable('2026-08-11 18:00:00', new DateTimeZone($user['timezone'])))['id']);
    assert_same(2, (int) db()->query('SELECT COUNT(*) FROM proof_photos')->fetchColumn());
    assert_same(2, count(glob(Database::config()['storage_root'] . '/' . $user['id'] . '/*/*/*') ?: []));
    expect_http(404, fn() => Photos::absolutePath(db(), ['id' => Auth::uuid()], $proof['id']));
    expect_http(404, fn() => Photos::upload(db(), ['id' => Auth::uuid()], 'daily_moment', $day['id'], png_upload(), 'moment-proof-other', 'Other'));
    assert_same('daily_moment', Sync::snapshot(db(), $user)['proofs'][0]['ownerType']);
});

test('failed Daily Snapshot proof remains retryable without a final file', function (): void {
    fresh_database(); $user = owner();
    DailyMoments::saveSettings(db(), $user, ['enabled' => true, 'windowStart' => '12:00', 'windowEnd' => '17:00', 'notifications' => false], 'moment-settings-002');
    $day = DailyMoments::capture(db(), $user, '2026-08-11', 'Retry me', 'moment-capture-002');
    $admin = new PDO('mysql:host=db;dbname=tidemark_test;charset=utf8mb4', 'root', 'root-test', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $admin->exec("CREATE TRIGGER fail_daily_moment_capture BEFORE INSERT ON proof_photos FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected Daily Snapshot failure'");

    try {
        Photos::upload(db(), $user, 'daily_moment', $day['id'], png_upload(), 'moment-proof-retry', 'Retry me');
        throw new RuntimeException('Expected injected Daily Snapshot failure.');
    } catch (PDOException $error) {
        assert_true(str_contains($error->getMessage(), 'injected Daily Snapshot failure'));
    } finally {
        $admin->exec('DROP TRIGGER IF EXISTS fail_daily_moment_capture');
    }

    assert_same('scheduled', db()->query('SELECT status FROM daily_moment_days LIMIT 1')->fetchColumn());
    assert_same(0, (int) db()->query('SELECT COUNT(*) FROM proof_photos')->fetchColumn());
    assert_same([], glob(Database::config()['storage_root'] . '/' . $user['id'] . '/*/*/*') ?: []);
    assert_same('daily_moment', Photos::upload(db(), $user, 'daily_moment', $day['id'], png_upload(), 'moment-proof-retry', 'Retry me')['ownerType']);
});

test('deleting one Daily Snapshot photo preserves its siblings and reminder', function (): void {
    fresh_database(); $user = owner();
    DailyMoments::saveSettings(db(), $user, ['enabled' => true, 'windowStart' => '12:00', 'windowEnd' => '17:00', 'notifications' => false], 'moment-settings-003');
    $day = DailyMoments::capture(db(), $user, '2026-08-11', 'Remove me', 'moment-capture-003');
    $first = Photos::upload(db(), $user, 'daily_moment', $day['id'], png_upload(), 'moment-proof-0003', 'Remove me');
    Photos::upload(db(), $user, 'daily_moment', $day['id'], png_upload(), 'moment-proof-0004', 'Keep me');

    Photos::delete(db(), $user, $first['id'], 'moment-delete-0001');

    assert_same('scheduled', DailyMoments::today(db(), $user, new DateTimeImmutable('2026-08-11 18:00:00', new DateTimeZone($user['timezone'])))['status']);
    assert_same($day['id'], DailyMoments::duePrompt(db(), $user, new DateTimeImmutable('2026-08-11 18:00:00', new DateTimeZone($user['timezone'])))['id']);
    assert_same(1, (int) db()->query('SELECT COUNT(*) FROM proof_photos')->fetchColumn());
    assert_same('Keep me', db()->query('SELECT caption FROM proof_photos LIMIT 1')->fetchColumn());
});

test('deleting required proof returns workout to pending and removes progress', function (): void {
    fresh_database();
    $user = owner();
    $goal = Goals::create(db(), $user, ['title' => 'Stronger', 'area' => 'fitness', 'trackingType' => 'weight', 'targetValue' => 100, 'unit' => 'kg'], 'photo-goal-0003');
    $workout = Goals::addEntry(db(), $user, $goal['id'], ['entryType' => 'workout', 'metric' => 'bench', 'value' => 50, 'details' => [], 'occurrenceAt' => '2026-08-09T07:00:00+05:30'], 'photo-entry-0003');
    $proof = Photos::upload(db(), $user, 'progress', $workout['id'], png_upload(), 'photo-good-0003');
    Photos::delete(db(), $user, $proof['id'], 'photo-delete-0001');
    assert_same('pending_proof', db()->query('SELECT status FROM progress_entries LIMIT 1')->fetchColumn());
    assert_same('0.00', db()->query('SELECT current_value FROM goals LIMIT 1')->fetchColumn());
});

test('queued proof resolves a task occurrence after its completion replay', function (): void {
    fresh_database();
    $user = owner();
    $task = Tasks::create(db(), $user, task_input(['proofRequired' => true]), 'photo-task-queue-1');
    Tasks::complete(db(), $user, $task['id'], ['date' => '2026-08-09'], 'photo-done-queue-1');
    $proof = Photos::upload(db(), $user, 'task_occurrence', $task['id'] . ':2026-08-09', png_upload(), 'photo-queued-0001');
    assert_same('completion', $proof['ownerType']);
    assert_same('complete', db()->query('SELECT status FROM task_completions LIMIT 1')->fetchColumn());
});

test('queued workout proof resolves the prior progress mutation receipt', function (): void {
    fresh_database();
    $user = owner();
    $goal = Goals::create(db(), $user, ['title' => 'Stronger', 'area' => 'fitness', 'trackingType' => 'weight', 'targetValue' => 100, 'unit' => 'kg'], 'photo-goal-queue1');
    Goals::addEntry(db(), $user, $goal['id'], ['entryType' => 'workout', 'metric' => 'bench', 'value' => 40, 'details' => [], 'occurrenceAt' => '2026-08-09T07:00:00+05:30'], 'entry-queued-0001');
    $proof = Photos::upload(db(), $user, 'progress_mutation', 'entry-queued-0001', png_upload(), 'proof-queued-0001');
    assert_same('progress', $proof['ownerType']);
    assert_same('40.00', db()->query('SELECT current_value FROM goals LIMIT 1')->fetchColumn());
});

test('photo-backed Gym workouts earn one Anchor while paused proofs do not advance it', function (): void {
    fresh_database();
    $user = owner();
    $plan = Gym::savePlan(db(), $user, ['goalType' => 'workout_consistency', 'goalTitle' => 'Train steadily', 'restMode' => 'fixed', 'fixedRestWeekdays' => [6], 'flexibleRestAllowance' => 1, 'trainingWeekdays' => [1,2,3,4,5], 'weeklySessionTarget' => 5, 'weightUnit' => 'kg', 'measurementUnit' => 'cm', 'effectiveFrom' => '2026-08-01'], 'photo-gym-plan-1');
    $proofs = [];

    for ($day = 1; $day <= 7; $day++) {
        $workout = Gym::addWorkout(db(), $user, ['goalId' => $plan['primaryGoalId'], 'date' => sprintf('2026-08-%02d', $day), 'durationMinutes' => 40, 'sets' => [['exercise' => 'Squat', 'reps' => 5, 'load' => 20, 'warmup' => false, 'rpe' => 7]]], "photo-gym-workout-{$day}");
        if ($day === 1) {
            assert_same('pending_proof', $workout['status']);
            assert_same('0.00', db()->query('SELECT current_value FROM goals LIMIT 1')->fetchColumn());
            assert_same(0, Gym::snapshot(db(), $user)['safe']['qualifyingCount']);
        }
        $proofs[] = Photos::upload(db(), $user, 'progress', $workout['id'], png_upload(), "photo-gym-proof-{$day}");
    }

    $safe = db()->query("SELECT `stored`,qualifying_count FROM streak_safes WHERE scope='gym'")->fetch();
    assert_same(1, (int) $safe['stored']);
    assert_same(0, (int) $safe['qualifying_count']);

    $workout = Gym::addWorkout(db(), $user, ['goalId' => $plan['primaryGoalId'], 'date' => '2026-08-08', 'durationMinutes' => 40, 'sets' => [['exercise' => 'Squat', 'reps' => 5, 'load' => 20, 'warmup' => false, 'rpe' => 7]]], 'photo-gym-workout-8');
    Photos::upload(db(), $user, 'progress', $workout['id'], png_upload(), 'photo-gym-proof-8');
    assert_same(0, (int) db()->query("SELECT qualifying_count FROM streak_safes WHERE scope='gym'")->fetchColumn());

    Photos::delete(db(), $user, $proofs[0]['id'], 'photo-gym-delete-1');
    $safe = db()->query("SELECT `stored`,qualifying_count FROM streak_safes WHERE scope='gym'")->fetch();
    assert_same(0, (int) $safe['stored']);
    assert_same(6, (int) $safe['qualifying_count']);
});

function png_upload(): array
{
    return temp_upload('proof.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true));
}
