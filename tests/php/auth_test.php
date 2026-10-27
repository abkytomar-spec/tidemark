<?php
declare(strict_types=1);

test('first setup creates one owner and closes registration', function (): void {
    fresh_database();
    $first = Auth::setup(db(), [
        'email' => 'owner@example.com',
        'password' => 'correct horse battery staple',
        'timezone' => 'Asia/Kolkata',
    ]);
    assert_same('owner@example.com', $first['email']);
    assert_same('system', $first['appearance']);
    assert_same('gentle', $first['voice']);
    assert_same('dawn', $first['gardenSeason']);
    expect_http(409, fn() => Auth::setup(db(), [
        'email' => 'other@example.com',
        'password' => 'another long password',
        'timezone' => 'UTC',
    ]));
});

test('setup accepts a browser supplied timezone alias', function (): void {
    fresh_database();
    $owner = Auth::setup(db(), ['email' => 'owner@example.com', 'password' => 'correct horse battery staple', 'timezone' => 'Asia/Calcutta']);
    assert_same('Asia/Calcutta', $owner['timezone']);
});

test('login rejects a wrong password and returns the owner for the right one', function (): void {
    fresh_database();
    Auth::setup(db(), ['email' => 'owner@example.com', 'password' => 'correct horse battery staple', 'timezone' => 'Asia/Kolkata']);
    expect_http(401, fn() => Auth::login(db(), 'owner@example.com', 'wrong password', '127.0.0.1'));
    assert_same('owner@example.com', Auth::login(db(), 'owner@example.com', 'correct horse battery staple', '127.0.0.1')['email']);
});

test('state changes reject a missing csrf token', function (): void {
    $_SESSION = ['csrf' => 'known-token', 'user_id' => 'user-id'];
    expect_http(403, fn() => Auth::requireCsrf(null));
    Auth::requireCsrf('known-token');
});

test('five failed logins rate limit the sixth attempt', function (): void {
    fresh_database();
    Auth::setup(db(), ['email' => 'owner@example.com', 'password' => 'correct horse battery staple', 'timezone' => 'Asia/Kolkata']);
    for ($i = 0; $i < 5; $i++) expect_http(401, fn() => Auth::login(db(), 'owner@example.com', 'bad password', '127.0.0.1'));
    expect_http(429, fn() => Auth::login(db(), 'owner@example.com', 'bad password', '127.0.0.1'));
});
