<?php
declare(strict_types=1);

test('gym plan stores fixed Saturday rest and versions future edits', function (): void {
    fresh_database(); $user = owner();
    $initial = gym_date($user, '-8 days'); $future = gym_date($user, '+6 days');
    $first = Gym::savePlan(db(), $user, ['goalType' => 'workout_consistency', 'goalTitle' => 'Train steadily', 'restMode' => 'fixed', 'fixedRestWeekdays' => [6], 'trainingWeekdays' => [1,2,3,4,5], 'weeklySessionTarget' => 5, 'weightUnit' => 'kg', 'measurementUnit' => 'cm', 'effectiveFrom' => $initial], 'gym-plan-0001');
    Gym::savePlan(db(), $user, ['primaryGoalId' => $first['primaryGoalId'], 'restMode' => 'fixed', 'fixedRestWeekdays' => [0], 'trainingWeekdays' => [1,2,3,4,5,6], 'weeklySessionTarget' => 6, 'weightUnit' => 'kg', 'measurementUnit' => 'cm', 'effectiveFrom' => $future], 'gym-plan-0002');
    assert_same($future, db()->query('SELECT effective_to FROM gym_plans ORDER BY effective_from LIMIT 1')->fetchColumn());
});

test('flexible rest cannot exceed its weekly allowance', function (): void {
    fresh_database(); $user = owner(); gym_plan($user, ['restMode' => 'flexible', 'flexibleRestAllowance' => 1]);
    Gym::setRest(db(), $user, ['date' => '2026-08-10'], 'gym-rest-0001');
    expect_http(422, fn() => Gym::setRest(db(), $user, ['date' => '2026-08-11'], 'gym-rest-0002'));
});

test('gym workout rejects missing working sets', function (): void {
    fresh_database(); $user = owner(); $plan = gym_plan($user);
    expect_http(422, fn() => Gym::addWorkout(db(), $user, ['goalId' => $plan['primaryGoalId'], 'date' => '2026-08-09', 'durationMinutes' => 40, 'sets' => [['exercise' => 'Squat', 'reps' => 5, 'load' => 20, 'warmup' => true, 'rpe' => null]]], 'gym-workout-01'));
});

test('guided goal rejects settings for another goal type', function (): void {
    fresh_database(); $user = owner();
    expect_http(422, fn() => Gym::createGoal(db(), $user, ['title' => 'Bench 100', 'gymType' => 'strength_pr', 'targetValue' => 100, 'unit' => 'kg', 'settings' => ['direction' => 'lose_fat']], 'gym-goal-0001'));
});

test('guided goals reject a repeated active type and gym setup reuses that type', function (): void {
    fresh_database();
    $user = owner();
    $goal = Gym::createGoal(db(), $user, ['title' => 'Shape my physique', 'gymType' => 'physique', 'targetValue' => 1, 'unit' => 'check-ins', 'settings' => []], 'gym-goal-duplicate-first');
    expect_http(409, fn() => Gym::createGoal(db(), $user, ['title' => 'Shape my physique again', 'gymType' => 'physique', 'targetValue' => 1, 'unit' => 'check-ins', 'settings' => []], 'gym-goal-duplicate-second'));

    $plan = gym_plan($user, ['goalType' => 'physique', 'goalTitle' => 'Plan physique']);
    assert_same($goal['id'], $plan['primaryGoalId']);
    assert_same(1, (int) db()->query("SELECT COUNT(*) FROM goals WHERE guided_gym_type='physique' AND status='active'")->fetchColumn());
});

test('gym migration leaves seeded global Anchor state unchanged', function (): void {
    fresh_database(); $user = owner();
    db()->prepare("INSERT INTO streak_safes (user_id,scope,`stored`,qualifying_count,qualifying_entry_ids,earned_entry_ids) VALUES (?,'global',1,5,JSON_ARRAY('global-entry'),JSON_ARRAY())")->execute([$user['id']]);
    db()->exec('ALTER TABLE streak_safes DROP COLUMN earned_entry_ids');
    db()->exec((string) file_get_contents(__DIR__ . '/../../database/migrations/2026-08-09-tidemark-gym.sql'));
    $global = db()->query("SELECT `stored`,qualifying_count,JSON_LENGTH(qualifying_entry_ids) entry_count FROM streak_safes WHERE scope='global'")->fetch();
    assert_same(1, (int) $global['stored']);
    assert_same(5, (int) $global['qualifying_count']);
    assert_same(1, (int) $global['entry_count']);
});

test('gym Anchor counts each proof-backed workout once', function (): void {
    fresh_database(); $user = owner(); $plan = gym_plan($user);
    $entry = qualify_gym_workout($user, $plan, '2026-08-09');
    Gym::qualifyWorkout(db(), $user['id'], $entry['id']);
    assert_same(1, Gym::snapshot(db(), $user)['safe']['qualifyingCount']);
});

test('gym Anchor discards paused workouts and removes only a deleted earning-cycle workout', function (): void {
    fresh_database(); $user = owner();
    $plan = gym_plan($user, ['effectiveFrom' => '2026-08-01', 'trainingWeekdays' => [1,2,3,4,5,6]]);
    $earned = [];
    for ($day = 1; $day <= 7; $day++) $earned[] = qualify_gym_workout($user, $plan, sprintf('2026-08-%02d', $day));
    assert_same(1, Gym::snapshot(db(), $user)['safe']['stored']);
    $discarded = qualify_gym_workout($user, $plan, '2026-08-08');
    Gym::settleSafe(db(), $user, ['missedDate' => '2026-08-10'], 'gym-safe-settle-1');
    Gym::qualifyWorkout(db(), $user['id'], $earned[0]['id']);
    assert_same(0, Gym::snapshot(db(), $user)['safe']['qualifyingCount']);
    $earning = qualify_gym_workout($user, $plan, '2026-08-11');
    assert_same(1, Gym::snapshot(db(), $user)['safe']['qualifyingCount']);
    Gym::deleteWorkout(db(), $user, $earning['id'], 'gym-safe-delete-1');
    assert_same(0, Gym::snapshot(db(), $user)['safe']['qualifyingCount']);
    Gym::deleteWorkout(db(), $user, $discarded['id'], 'gym-safe-delete-2');
    assert_same(0, Gym::snapshot(db(), $user)['safe']['qualifyingCount']);
});

test('deleting a workout from an unconsumed Gym Anchor revokes it into six qualifying workouts', function (): void {
    fresh_database(); $user = owner();
    $plan = gym_plan($user, ['effectiveFrom' => '2026-08-01']);
    $earned = [];
    for ($day = 1; $day <= 7; $day++) $earned[] = qualify_gym_workout($user, $plan, sprintf('2026-08-%02d', $day));
    assert_same(1, Gym::snapshot(db(), $user)['safe']['stored']);
    Gym::deleteWorkout(db(), $user, $earned[0]['id'], 'gym-safe-revoke-1');
    $safe = Gym::snapshot(db(), $user)['safe'];
    assert_same(0, $safe['stored']);
    assert_same(6, $safe['qualifyingCount']);
    assert_same(6, (int) db()->query("SELECT JSON_LENGTH(earned_entry_ids) FROM streak_safes WHERE scope='gym'")->fetchColumn());
});

test('gym plan rejects a same-date schedule version', function (): void {
    fresh_database(); $user = owner(); $initial = gym_date($user, '-8 days');
    $first = gym_plan($user, ['effectiveFrom' => $initial]);
    expect_http(422, fn() => gym_plan($user, ['primaryGoalId' => $first['primaryGoalId'], 'effectiveFrom' => $initial]));
    assert_same(1, (int) db()->query('SELECT COUNT(*) FROM gym_plans')->fetchColumn());
});

test('gym plan rejects a schedule version before the latest version', function (): void {
    fresh_database(); $user = owner();
    $first = gym_plan($user, ['effectiveFrom' => gym_date($user, '-8 days')]);
    gym_plan($user, ['primaryGoalId' => $first['primaryGoalId'], 'effectiveFrom' => gym_date($user, '+6 days')]);
    expect_http(422, fn() => gym_plan($user, ['primaryGoalId' => $first['primaryGoalId'], 'effectiveFrom' => gym_date($user, '+5 days')]));
    assert_same(2, (int) db()->query('SELECT COUNT(*) FROM gym_plans')->fetchColumn());
});

test('gym plan rejects a non-future edit even when it follows an older latest version', function (): void {
    fresh_database(); $user = owner();
    $first = gym_plan($user, ['effectiveFrom' => gym_date($user, '-8 days')]);
    expect_http(422, fn() => gym_plan($user, ['primaryGoalId' => $first['primaryGoalId'], 'effectiveFrom' => gym_date($user, '-7 days')]));
    gym_plan($user, ['primaryGoalId' => $first['primaryGoalId'], 'effectiveFrom' => gym_date($user, '+6 days')]);
    assert_same(2, (int) db()->query('SELECT COUNT(*) FROM gym_plans')->fetchColumn());
});

test('flexible rest allowance check serializes on the active plan', function (): void {
    fresh_database(); $user = owner(); gym_plan($user, ['restMode' => 'flexible', 'flexibleRestAllowance' => 1]);
    $locker = db();
    $locker->beginTransaction();
    $lock = $locker->prepare('SELECT id FROM gym_plans WHERE user_id=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>?) FOR UPDATE');
    $lock->execute([$user['id'], '2026-08-10', '2026-08-10']);

    $ready = tempnam(sys_get_temp_dir(), 'tidemark-rest-race-');
    unlink($ready);
    $child = <<<'PHP'
require '/app/tests/php/bootstrap.php';
touch(%s);
try {
    Gym::setRest(db(), ['id' => %s], ['date' => '2026-08-11'], 'gym-rest-race-2');
    echo 'saved';
} catch (HttpError $error) {
    echo (string) $error->status;
}
PHP;
    $child = sprintf($child, var_export($ready, true), var_export($user['id'], true));
    $process = proc_open([PHP_BINARY, '-r', $child], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    assert_true(is_resource($process), 'Expected child PHP process');
    for ($attempt = 0; $attempt < 100 && !is_file($ready); $attempt++) usleep(10_000);
    assert_true(is_file($ready), 'Expected concurrent rest request to start');
    usleep(100_000);
    $locker->prepare("INSERT IGNORE INTO gym_rest_events (id,user_id,local_date,kind) VALUES (?,?,?,'flexible')")->execute([Auth::uuid(), $user['id'], '2026-08-10']);
    $locker->commit();
    $output = stream_get_contents($pipes[1]);
    $errors = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    assert_same(0, proc_close($process));
    if (is_file($ready)) unlink($ready);
    assert_same('', $errors);
    assert_same('422', $output);
    assert_same(1, (int) db()->query('SELECT COUNT(*) FROM gym_rest_events')->fetchColumn());
});

function gym_plan(array $user, array $overrides = []): array
{
    return Gym::savePlan(db(), $user, array_replace(['goalType' => 'workout_consistency', 'goalTitle' => 'Train steadily', 'restMode' => 'fixed', 'fixedRestWeekdays' => [6], 'flexibleRestAllowance' => 1, 'trainingWeekdays' => [1,3,5], 'weeklySessionTarget' => 3, 'weightUnit' => 'kg', 'measurementUnit' => 'cm', 'effectiveFrom' => '2026-08-09'], $overrides), Auth::uuid());
}

function qualify_gym_workout(array $user, array $plan, string $date): array
{
    $entry = Gym::addWorkout(db(), $user, ['goalId' => $plan['primaryGoalId'], 'date' => $date, 'durationMinutes' => 40, 'sets' => [['exercise' => 'Squat', 'reps' => 5, 'load' => 20, 'warmup' => false, 'rpe' => 7]]], Auth::uuid());
    $proof = temp_upload('proof.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true));
    Photos::upload(db(), $user, 'progress', $entry['id'], $proof, Auth::uuid());
    return $entry;
}

function gym_date(array $user, string $modifier): string
{
    return (new DateTimeImmutable('now', new DateTimeZone($user['timezone'])))->modify($modifier)->format('Y-m-d');
}
