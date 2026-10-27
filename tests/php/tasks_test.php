<?php
declare(strict_types=1);

test('replaying a completion mutation is idempotent', function (): void {
    fresh_database();
    $user = owner();
    $task = Tasks::create(db(), $user, task_input(), 'device-a-task-0001');
    $first = Tasks::complete(db(), $user, $task['id'], ['date' => '2026-08-09', 'note' => 'Done'], 'device-a-done-0001');
    $second = Tasks::complete(db(), $user, $task['id'], ['date' => '2026-08-09', 'note' => 'Done'], 'device-a-done-0001');
    assert_same($first['id'], $second['id']);
    assert_same($first['status'], $second['status']);
    assert_same(1, (int) db()->query('SELECT COUNT(*) FROM task_completions')->fetchColumn());
});

test('proof-required task stays pending until a photo arrives', function (): void {
    fresh_database();
    $user = owner();
    $task = Tasks::create(db(), $user, task_input(['title' => 'Gym', 'proofRequired' => true]), 'task-proof-0001');
    $completion = Tasks::complete(db(), $user, $task['id'], ['date' => '2026-08-09'], 'done-proof-0001');
    assert_same('pending_proof', $completion['status']);
});

test('reopening removes the occurrence and its points', function (): void {
    fresh_database();
    $user = owner();
    $task = Tasks::create(db(), $user, task_input(['priority' => 'high']), 'task-reopen-0001');
    Tasks::complete(db(), $user, $task['id'], ['date' => '2026-08-09'], 'done-reopen-0001');
    Tasks::reopen(db(), $user, $task['id'], '2026-08-09', 'undo-reopen-0001');
    assert_same(0, (int) db()->query('SELECT COUNT(*) FROM task_completions')->fetchColumn());
});

test('an owner cannot read another user task through a guessed id', function (): void {
    fresh_database();
    $user = owner();
    $foreignId = Auth::uuid();
    $statement = db()->prepare("INSERT INTO users (id, singleton, email, password_hash, timezone, preferences) VALUES (?, 2, 'foreign@example.com', 'x', 'UTC', '{}')");
    $statement->execute([$foreignId]);
    $taskId = Auth::uuid();
    db()->prepare("INSERT INTO tasks (id,user_id,title,notes,color,schedule_date,recurrence_type) VALUES (?,?, 'Private','', '#5B8DEF','2026-08-09','one_time')")->execute([$taskId, $foreignId]);
    expect_http(404, fn() => Tasks::get(db(), $user, $taskId));
});

test('weekly recurrence rejects an empty weekday list', function (): void {
    fresh_database();
    $user = owner();
    expect_http(422, fn() => Tasks::create(db(), $user, task_input(['recurrence' => ['type' => 'weekly', 'weekdays' => []]]), 'bad-weekly-0001'));
});

test('client id keeps an offline task addressable', function (): void {
    fresh_database();
    $user = owner();
    $id = '33333333-3333-4333-8333-333333333333';
    $task = Tasks::create(db(), $user, task_input(['id' => $id]), 'task-offline-001');
    assert_same($id, $task['id']);
    expect_http(422, fn() => Tasks::create(db(), $user, task_input(['id' => 'bad']), 'task-offline-002'));
});

test('seven productive days grow one global Anchor and one missed day consumes it', function (): void {
    fresh_database();
    $user = owner();
    $task = Tasks::create(db(), $user, task_input(['recurrence' => ['type' => 'daily'], 'scheduleDate' => '2026-08-01']), 'safe-task-0001');
    for ($day = 1; $day <= 7; $day++) Tasks::complete(db(), $user, $task['id'], ['date' => sprintf('2026-08-%02d', $day)], "safe-done-{$day}");

    $grown = GlobalSafe::snapshot(db(), $user, new DateTimeImmutable('2026-08-07 12:00:00', new DateTimeZone($user['timezone'])));
    $protected = GlobalSafe::snapshot(db(), $user, new DateTimeImmutable('2026-08-09 12:00:00', new DateTimeZone($user['timezone'])));

    assert_same(1, $grown['stored']);
    assert_same(0, $protected['stored']);
    assert_same('2026-08-08', $protected['lastProtectedDate']);
});

test('multiple tasks on one day grow the global Anchor only once', function (): void {
    fresh_database();
    $user = owner();
    $first = Tasks::create(db(), $user, task_input(['title' => 'First']), 'safe-first-task');
    $second = Tasks::create(db(), $user, task_input(['title' => 'Second']), 'safe-second-task');
    Tasks::complete(db(), $user, $first['id'], ['date' => '2026-08-09'], 'safe-first-done');
    Tasks::complete(db(), $user, $second['id'], ['date' => '2026-08-09'], 'safe-second-done');

    assert_same(1, GlobalSafe::snapshot(db(), $user, new DateTimeImmutable('2026-08-09 12:00:00', new DateTimeZone($user['timezone'])))['qualifyingCount']);
});
