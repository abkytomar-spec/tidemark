<?php
declare(strict_types=1);

test('sync returns the authoritative owner snapshot and safe proof metadata', function (): void {
    fresh_database();
    $user = owner();
    Tasks::create(db(), $user, task_input(), 'sync-task-0001');
    $snapshot = Sync::snapshot(db(), $user);
    assert_same(1, count($snapshot['tasks']));
    assert_true(isset($snapshot['serverTime']));
    assert_same($user['id'], $snapshot['user']['id']);
    assert_true(!str_contains(json_encode($snapshot, JSON_THROW_ON_ERROR), 'storage_path'));
});

test('export includes a schema version and owner data', function (): void {
    fresh_database();
    $user = owner();
    $export = Sync::export(db(), $user);
    assert_same(1, $export['schemaVersion']);
    assert_same($user['email'], $export['snapshot']['user']['email']);
});

test('sync returns garden reflections and personalization', function (): void {
    fresh_database();
    $user = owner();
    Goals::updatePreferences(db(), $user, ['appearance' => 'dark', 'gardenSeason' => 'moon'], 'sync-prefs-0001');
    Goals::checkin(db(), $user, ['date' => '2026-08-09', 'energy' => 'medium', 'mood' => 3, 'intention' => 'Finish well', 'win' => 'Shipped', 'gratitude' => 'Good people'], 'sync-checkin-001');
    $snapshot = Sync::snapshot(db(), $user);
    assert_same('dark', $snapshot['user']['appearance']);
    assert_same('moon', $snapshot['user']['gardenSeason']);
    assert_same('Finish well', $snapshot['checkins'][0]['intention']);
    assert_same('Good people', $snapshot['checkins'][0]['gratitude']);
});

test('sync includes Gym plans guided goals and Anchor state', function (): void {
    fresh_database();
    $user = owner();
    Gym::savePlan(db(), $user, ['goalType' => 'workout_consistency', 'goalTitle' => 'Train steadily', 'restMode' => 'fixed', 'fixedRestWeekdays' => [6], 'flexibleRestAllowance' => 1, 'trainingWeekdays' => [1,2,3,4,5], 'weeklySessionTarget' => 5, 'weightUnit' => 'kg', 'measurementUnit' => 'cm', 'effectiveFrom' => '2026-08-01'], 'sync-gym-plan-1');

    $snapshot = Sync::snapshot(db(), $user);
    assert_same([6], $snapshot['gym']['plans'][0]['fixedRestWeekdays']);
    assert_same('workout_consistency', $snapshot['goals'][0]['gymType']);
    assert_same([], $snapshot['goals'][0]['gymSettings']);
    assert_same(0, $snapshot['gym']['safe']['stored']);
});
