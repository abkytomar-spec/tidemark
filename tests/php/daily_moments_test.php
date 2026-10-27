<?php
declare(strict_types=1);

test('daily snapshot time stays inside the window and is immutable', function (): void {
    fresh_database(); $user = owner();
    DailyMoments::saveSettings(db(), $user, ['enabled' => true, 'windowStart' => '12:00', 'windowEnd' => '17:00', 'notifications' => false], Auth::uuid());
    $first = DailyMoments::today(db(), $user, new DateTimeImmutable('2026-08-11 13:00:00', new DateTimeZone($user['timezone'])));
    $second = DailyMoments::today(db(), $user, new DateTimeImmutable('2026-08-11 16:00:00', new DateTimeZone($user['timezone'])));
    assert_true($first['scheduledTime'] >= '12:00' && $first['scheduledTime'] <= '17:00');
    assert_same($first['scheduledTime'], $second['scheduledTime']);
});

test('skip is date scoped and never changes future days', function (): void {
    fresh_database(); $user = owner();
    DailyMoments::saveSettings(db(), $user, ['enabled' => true, 'windowStart' => '08:00', 'windowEnd' => '12:00', 'notifications' => false], Auth::uuid());
    $today = DailyMoments::today(db(), $user, new DateTimeImmutable('2026-08-11 13:00:00', new DateTimeZone($user['timezone'])));
    assert_same('skipped', DailyMoments::skip(db(), $user, $today['date'], Auth::uuid())['status']);
    assert_same('scheduled', DailyMoments::today(db(), $user, new DateTimeImmutable('2026-08-12 13:00:00', new DateTimeZone($user['timezone'])))['status']);
});

test('capture preparation leaves the day retryable until its photo is accepted', function (): void {
    fresh_database(); $user = owner();
    DailyMoments::saveSettings(db(), $user, ['enabled' => true, 'windowStart' => '12:00', 'windowEnd' => '17:00', 'notifications' => false], Auth::uuid());
    $day = DailyMoments::capture(db(), $user, '2026-08-11', 'A small day', 'moment-capture-prep-1');

    assert_same('scheduled', $day['status']);
    assert_same('', $day['caption']);
    assert_same(null, $day['capturedAt']);
});

test('daily snapshot snapshot and due prompt wait until the stored schedule', function (): void {
    fresh_database(); $user = owner(); $timezone = new DateTimeZone($user['timezone']);
    DailyMoments::saveSettings(db(), $user, ['enabled' => true, 'windowStart' => '12:00', 'windowEnd' => '17:00', 'notifications' => false], Auth::uuid());
    $day = DailyMoments::today(db(), $user, new DateTimeImmutable('2026-08-11 12:00:00', $timezone));
    $scheduled = new DateTimeImmutable($day['date'] . ' ' . $day['scheduledTime'], $timezone);
    $before = $scheduled->modify('-1 minute'); $after = $scheduled->modify('+1 minute');
    assert_same(null, DailyMoments::duePrompt(db(), $user, $before));
    assert_same(false, DailyMoments::snapshot(db(), $user, $before)['eligiblePrompt']);
    assert_same($day['id'], DailyMoments::duePrompt(db(), $user, $after)['id']);
    assert_same(true, DailyMoments::snapshot(db(), $user, $after)['eligiblePrompt']);
});

test('daily snapshot race keeps the committed owner schedule', function (): void {
    fresh_database(); $user = owner();
    DailyMoments::saveSettings(db(), $user, ['enabled' => true, 'windowStart' => '12:00', 'windowEnd' => '17:00', 'notifications' => false], Auth::uuid());
    $date = '2026-08-11'; $locker = db(); $locker->beginTransaction();
    $locker->prepare('INSERT INTO daily_moment_days (id,user_id,local_date,scheduled_time) VALUES (?,?,?,?)')->execute([Auth::uuid(), $user['id'], $date, '14:15:00']);
    $ready = tempnam(sys_get_temp_dir(), 'tidemark-moment-race-'); unlink($ready);
    $child = <<<'PHP'
require '/app/tests/php/bootstrap.php';
touch(%s);
try { echo DailyMoments::skip(db(), ['id' => %s], %s, 'moment-race-02')['status']; }
catch (Throwable $error) { echo 'error:' . $error->getMessage(); }
PHP;
    $child = sprintf($child, var_export($ready, true), var_export($user['id'], true), var_export($date, true));
    $process = proc_open([PHP_BINARY, '-r', $child], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    assert_true(is_resource($process), 'Expected concurrent Daily Snapshot request');
    for ($attempt = 0; $attempt < 100 && !is_file($ready); $attempt++) usleep(10_000);
    assert_true(is_file($ready), 'Expected concurrent Daily Snapshot request to start');
    usleep(100_000); $locker->commit();
    $output = stream_get_contents($pipes[1]); $errors = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]); assert_same(0, proc_close($process));
    if (is_file($ready)) unlink($ready);
    assert_same('', $errors); assert_same('skipped', $output);
    $row = db()->query("SELECT scheduled_time,status FROM daily_moment_days WHERE user_id='" . $user['id'] . "' AND local_date='2026-08-11'")->fetch();
    assert_same('14:15:00', $row['scheduled_time']); assert_same('skipped', $row['status']);
});
