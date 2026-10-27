<?php
declare(strict_types=1);

test('gym workouts require proof and do not advance progress early', function (): void {
    fresh_database();
    $user = owner();
    $goal = Goals::create(db(), $user, ['title' => 'Stronger', 'area' => 'fitness', 'trackingType' => 'weight', 'targetValue' => 100, 'unit' => 'kg'], 'goal-gym-0001');
    $entry = Goals::addEntry(db(), $user, $goal['id'], [
        'entryType' => 'workout', 'metric' => 'bench', 'value' => 70, 'durationMinutes' => 55,
        'details' => ['exercises' => [['name' => 'Bench press', 'sets' => [['reps' => 8, 'weight' => 70]]]]],
        'occurrenceAt' => '2026-08-09T07:00:00+05:30',
    ], 'entry-gym-0001');
    assert_same('pending_proof', $entry['status']);
    assert_same('0.00', db()->query('SELECT current_value FROM goals LIMIT 1')->fetchColumn());
});

test('learning entry advances a goal and a milestone can be recorded', function (): void {
    fresh_database();
    $user = owner();
    $goal = Goals::create(db(), $user, ['title' => 'Learn Spanish', 'area' => 'learning', 'trackingType' => 'minutes', 'targetValue' => 300, 'unit' => 'minutes'], 'goal-learn-0001');
    Goals::addMilestone(db(), $user, $goal['id'], ['label' => 'First hour', 'targetValue' => 60], 'mile-learn-0001');
    Goals::addEntry(db(), $user, $goal['id'], ['entryType' => 'study', 'metric' => 'study-minutes', 'value' => 45, 'durationMinutes' => 45, 'details' => ['topic' => 'Greetings'], 'occurrenceAt' => '2026-08-09T10:00:00+05:30'], 'entry-learn-0001');
    assert_same('45.00', db()->query('SELECT current_value FROM goals LIMIT 1')->fetchColumn());
    assert_same(1, (int) db()->query('SELECT COUNT(*) FROM milestones')->fetchColumn());
});

test('daily checkin is updated rather than duplicated', function (): void {
    fresh_database();
    $user = owner();
    Goals::checkin(db(), $user, ['date' => '2026-08-09', 'energy' => 'low', 'mood' => 3, 'note' => 'Slow start', 'intention' => 'Ship calmly', 'win' => 'Focused', 'gratitude' => 'A quiet evening'], 'checkin-0001');
    Goals::checkin(db(), $user, ['date' => '2026-08-09', 'energy' => 'high', 'mood' => 5, 'note' => 'Better'], 'checkin-0002');
    assert_same(1, (int) db()->query('SELECT COUNT(*) FROM daily_checkins')->fetchColumn());
    assert_same('high', db()->query('SELECT energy FROM daily_checkins LIMIT 1')->fetchColumn());
    assert_same('Ship calmly', db()->query('SELECT intention FROM daily_checkins LIMIT 1')->fetchColumn());
    assert_same('Focused', db()->query('SELECT win FROM daily_checkins LIMIT 1')->fetchColumn());
});

test('onboarding can be explicitly finished', function (): void {
    fresh_database();
    $user = owner();
    $updated = Goals::updatePreferences(db(), $user, ['onboardingStep' => null], 'preferences-finish-01');
    assert_same(null, $updated['onboardingStep']);
});

test('personalization preferences update partially and reject unsupported choices', function (): void {
    fresh_database();
    $user = owner();
    $updated = Goals::updatePreferences(db(), $user, ['appearance' => 'dark', 'displayName' => ' Dheeraj '], 'preferences-theme-01');
    assert_same('dark', $updated['appearance']);
    assert_same('Dheeraj', $updated['displayName']);
    assert_same('gentle', $updated['voice']);
    expect_http(422, fn() => Goals::updatePreferences(db(), $updated, ['appearance' => 'neon'], 'preferences-theme-02'));
    expect_http(422, fn() => Goals::updatePreferences(db(), $updated, ['displayName' => ['not', 'text']], 'preferences-theme-03'));
});

test('contextual workout places sync through owner preferences', function (): void {
    fresh_database();
    $user = owner();
    $places = [
        ['id' => '11111111-1111-4111-8111-111111111111', 'name' => 'Morning gym', 'latitude' => 12.9716, 'longitude' => 77.5946, 'radiusMeters' => 250],
        ['id' => '22222222-2222-4222-8222-222222222222', 'name' => 'Pool studio', 'latitude' => 12.975, 'longitude' => 77.601, 'radiusMeters' => 500],
    ];

    $updated = Goals::updatePreferences(db(), $user, ['contextualAmbience' => true, 'gymPlaces' => $places], 'preferences-context-01');

    assert_same(true, $updated['contextualAmbience']);
    assert_same($places, $updated['gymPlaces']);
    assert_same($places, Auth::findById(db(), $user['id'])['gymPlaces']);
});

test('unsafe workout-place settings are rejected at the preference boundary', function (): void {
    fresh_database();
    $user = owner();
    $valid = ['id' => '11111111-1111-4111-8111-111111111111', 'name' => 'Gym', 'latitude' => 12.9716, 'longitude' => 77.5946, 'radiusMeters' => 250];
    $invalid = [
        [['gymPlaces' => [['id' => $valid['id'], 'name' => '', 'latitude' => 12.9, 'longitude' => 77.5, 'radiusMeters' => 250]]], 'preferences-context-bad-name'],
        [['gymPlaces' => [['id' => $valid['id'], 'name' => 'Gym', 'latitude' => 91, 'longitude' => 77.5, 'radiusMeters' => 250]]], 'preferences-context-bad-lat'],
        [['gymPlaces' => [['id' => $valid['id'], 'name' => 'Gym', 'latitude' => 12.9, 'longitude' => 181, 'radiusMeters' => 250]]], 'preferences-context-bad-lng'],
        [['gymPlaces' => [['id' => $valid['id'], 'name' => 'Gym', 'latitude' => 12.9, 'longitude' => 77.5, 'radiusMeters' => 99]]], 'preferences-context-bad-radius'],
        [['gymPlaces' => array_fill(0, 9, $valid)], 'preferences-context-too-many'],
        [['contextualAmbience' => 'yes'], 'preferences-context-bad-toggle'],
    ];

    foreach ($invalid as [$input, $mutationId]) expect_http(422, fn() => Goals::updatePreferences(db(), $user, $input, $mutationId));
});

test('checkin reflections are validated at the API boundary', function (): void {
    fresh_database();
    $user = owner();
    expect_http(422, fn() => Goals::checkin(db(), $user, ['date' => '2026-08-09', 'energy' => 'medium', 'mood' => 3, 'intention' => str_repeat('x', 281)], 'checkin-long-001'));
    expect_http(422, fn() => Goals::checkin(db(), $user, ['date' => '2026-08-09', 'energy' => 'medium', 'mood' => 3, 'win' => ['not', 'text']], 'checkin-long-002'));
});

test('focus session linked through a task advances its goal', function (): void {
    fresh_database();
    $user = owner();
    $goal = Goals::create(db(), $user, ['title' => 'Deep work', 'area' => 'work', 'trackingType' => 'minutes', 'targetValue' => 300, 'unit' => 'minutes'], 'focus-goal-0001');
    $task = Tasks::create(db(), $user, task_input(['title' => 'Write proposal', 'goalId' => $goal['id']]), 'focus-task-0001');
    Goals::focus(db(), $user, ['taskId' => $task['id'], 'minutes' => 25], 'focus-entry-001');
    assert_same('25.00', db()->query('SELECT current_value FROM goals LIMIT 1')->fetchColumn());
    assert_same('focus', db()->query('SELECT entry_type FROM progress_entries LIMIT 1')->fetchColumn());
});

test('client ids keep offline goal progress and proof references stable', function (): void {
    fresh_database();
    $user = owner();
    $goalId = '11111111-1111-4111-8111-111111111111';
    $entryId = '22222222-2222-4222-8222-222222222222';
    $goal = Goals::create(db(), $user, ['id' => $goalId, 'title' => 'Stronger', 'area' => 'fitness', 'targetValue' => 12, 'unit' => 'workouts'], 'goal-offline-001');
    $entry = Goals::addEntry(db(), $user, $goal['id'], ['id' => $entryId, 'entryType' => 'workout', 'metric' => 'workout', 'value' => 1], 'entry-offline-01');
    assert_same($goalId, $goal['id']);
    assert_same($entryId, $entry['id']);
    expect_http(422, fn() => Goals::create(db(), $user, ['id' => 'not-a-uuid', 'title' => 'Nope', 'area' => 'work', 'targetValue' => 1], 'goal-offline-002'));
});

test('an owner can delete an empty unreferenced guided goal exactly once through its receipt', function (): void {
    fresh_database();
    $user = owner();
    $goal = Gym::createGoal(db(), $user, ['title' => 'Shape my physique', 'gymType' => 'physique', 'targetValue' => 1, 'unit' => 'check-ins', 'settings' => []], 'guided-delete-create-01');

    $first = Goals::delete(db(), $user, $goal['id'], 'guided-delete-receipt-01');
    $second = Goals::delete(db(), $user, $goal['id'], 'guided-delete-receipt-01');

    assert_same(true, $first['deleted']);
    assert_same($goal['id'], $first['id']);
    assert_same($first['id'], $second['id']);
    assert_same($first['deleted'], $second['deleted']);
    assert_same(0, (int) db()->query('SELECT COUNT(*) FROM goals')->fetchColumn());
});

test('ordinary goals cannot be deleted through the guided goal removal endpoint', function (): void {
    fresh_database();
    $user = owner();
    $goal = Goals::create(db(), $user, ['title' => 'Read books', 'area' => 'learning', 'trackingType' => 'count', 'targetValue' => 12, 'unit' => 'books'], 'ordinary-delete-create');

    expect_http(422, fn() => Goals::delete(db(), $user, $goal['id'], 'ordinary-delete-attempt'));
    assert_same(1, (int) db()->query('SELECT COUNT(*) FROM goals WHERE id=' . db()->quote($goal['id']))->fetchColumn());
});

test('a plan primary goal and a goal with progress cannot be deleted', function (): void {
    fresh_database();
    $user = owner();
    $plan = gym_plan($user);
    expect_http(422, fn() => Goals::delete(db(), $user, $plan['primaryGoalId'], 'guided-delete-plan-001'));

    $goal = Gym::createGoal(db(), $user, ['title' => 'Shape my physique', 'gymType' => 'physique', 'targetValue' => 1, 'unit' => 'check-ins', 'settings' => []], 'guided-delete-progress-create');
    Goals::addEntry(db(), $user, $goal['id'], ['entryType' => 'physique_checkin', 'metric' => 'physique', 'value' => 1], 'guided-delete-progress-entry');
    expect_http(422, fn() => Goals::delete(db(), $user, $goal['id'], 'guided-delete-progress-001'));
});

test('a different owner cannot delete a guided goal', function (): void {
    fresh_database();
    $owner = owner();
    $goal = Gym::createGoal(db(), $owner, ['title' => 'Shape my physique', 'gymType' => 'physique', 'targetValue' => 1, 'unit' => 'check-ins', 'settings' => []], 'guided-delete-owner-create');
    $otherId = Auth::uuid();
    db()->prepare('INSERT INTO users (id,singleton,email,password_hash,timezone,preferences) VALUES (?,2,?,?,?,?)')->execute([$otherId, 'other@example.com', password_hash('correct horse battery staple', PASSWORD_DEFAULT), 'Asia/Kolkata', '{}']);
    $other = Auth::findById(db(), $otherId);

    expect_http(404, fn() => Goals::delete(db(), $other, $goal['id'], 'guided-delete-other-owner'));
});
