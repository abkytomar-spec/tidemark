<?php
declare(strict_types=1);

require __DIR__ . '/src/bootstrap.php';

$db = Database::connect();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/api#', '', $path) ?: '/';

if ($method === 'GET' && $path === '/setup/status') {
    json_response(['setupRequired' => Auth::setupStatus($db)]);
}
if ($method === 'POST' && $path === '/setup') {
    json_response(Auth::beginSession(Auth::setup($db, json_body())), 201);
}
if ($method === 'POST' && $path === '/login') {
    $body = json_body();
    $user = Auth::login($db, (string) ($body['email'] ?? ''), (string) ($body['password'] ?? ''), (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    json_response(Auth::beginSession($user));
}
if ($method === 'POST' && $path === '/logout') {
    Auth::requireCsrf(request_header('X-CSRF-Token'));
    $_SESSION = [];
    if (session_id() !== '') session_destroy();
    json_response(['ok' => true]);
}
if ($method === 'GET' && $path === '/session') {
    $user = Auth::requireUser($db);
    json_response(['user' => $user, 'csrfToken' => $_SESSION['csrf']]);
}

$user = Auth::requireUser($db);
if ($method !== 'GET') Auth::requireCsrf(request_header('X-CSRF-Token'));
$mutationId = request_header('X-Mutation-ID') ?? '';

if ($method === 'GET' && $path === '/sync') json_response(Sync::snapshot($db, $user));
if ($method === 'GET' && $path === '/export') {
    header('Content-Disposition: attachment; filename="tidemark-export.json"');
    json_response(Sync::export($db, $user));
}
if ($method === 'POST' && $path === '/tasks') json_response(Tasks::create($db, $user, json_body(), $mutationId), 201);
if ($method === 'POST' && $path === '/goals') json_response(Goals::create($db, $user, json_body(), $mutationId), 201);
if ($method === 'POST' && $path === '/daily-moment/settings') json_response(DailyMoments::saveSettings($db, $user, json_body(), $mutationId));
if ($method === 'POST' && preg_match('#^/daily-moment/(\d{4}-\d{2}-\d{2})/skip$#', $path, $match)) json_response(DailyMoments::skip($db, $user, $match[1], $mutationId));
if ($method === 'POST' && preg_match('#^/daily-moment/(\d{4}-\d{2}-\d{2})/capture$#', $path, $match)) {
    $body = json_body();
    json_response(DailyMoments::capture($db, $user, $match[1], (string) ($body['caption'] ?? ''), $mutationId), 201);
}
if ($method === 'DELETE' && preg_match('#^/daily-moment/(\d{4}-\d{2}-\d{2})$#', $path, $match)) json_response(DailyMoments::delete($db, $user, $match[1], $mutationId));
if ($method === 'DELETE' && preg_match('#^/goals/([A-Za-z0-9-]+)$#', $path, $match)) json_response(Goals::delete($db, $user, $match[1], $mutationId));
if ($method === 'POST' && $path === '/checkins') json_response(Goals::checkin($db, $user, json_body(), $mutationId));
if ($method === 'POST' && $path === '/focus') json_response(Goals::focus($db, $user, json_body(), $mutationId), 201);
if ($method === 'PATCH' && $path === '/preferences') json_response(Goals::updatePreferences($db, $user, json_body(), $mutationId));
if ($method === 'POST' && $path === '/gym/plans') json_response(Gym::savePlan($db, $user, json_body(), $mutationId), 201);
if ($method === 'POST' && $path === '/gym/routines') json_response(Gym::saveRoutine($db, $user, json_body(), $mutationId), 201);
if ($method === 'DELETE' && preg_match('#^/gym/routines/([A-Za-z0-9-]+)$#', $path, $match)) json_response(Gym::deleteRoutine($db, $user, $match[1], $mutationId));
if ($method === 'POST' && $path === '/gym/rest') json_response(Gym::setRest($db, $user, json_body(), $mutationId), 201);
if ($method === 'DELETE' && preg_match('#^/gym/rest/(\d{4}-\d{2}-\d{2})$#', $path, $match)) json_response(Gym::clearRest($db, $user, $match[1], $mutationId));
if ($method === 'POST' && $path === '/gym/goals') json_response(Gym::createGoal($db, $user, json_body(), $mutationId), 201);
if ($method === 'POST' && $path === '/gym/workouts') json_response(Gym::addWorkout($db, $user, json_body(), $mutationId), 201);
if ($method === 'DELETE' && preg_match('#^/gym/workouts/([A-Za-z0-9-]+)$#', $path, $match)) json_response(Gym::deleteWorkout($db, $user, $match[1], $mutationId));
if ($method === 'POST' && $path === '/gym/streak/settle') json_response(Gym::settleSafe($db, $user, json_body(), $mutationId));
if ($method === 'GET' && $path === '/proofs') json_response(['proofs' => Photos::all($db, $user)]);
if ($method === 'POST' && $path === '/proofs') {
    json_response(Photos::upload($db, $user, (string) ($_POST['ownerType'] ?? ''), (string) ($_POST['ownerId'] ?? ''), $_FILES['photo'] ?? [], $mutationId, (string) ($_POST['caption'] ?? '')), 201);
}
if ($method === 'GET' && preg_match('#^/proofs/([A-Za-z0-9-]+)/image$#', $path, $match)) Photos::stream($db, $user, $match[1]);
if ($method === 'DELETE' && preg_match('#^/proofs/([A-Za-z0-9-]+)$#', $path, $match)) json_response(Photos::delete($db, $user, $match[1], $mutationId));

if (preg_match('#^/tasks/([A-Za-z0-9-]+)$#', $path, $match)) {
    if ($method === 'GET') json_response(Tasks::get($db, $user, $match[1]));
    if ($method === 'PATCH') json_response(Tasks::update($db, $user, $match[1], json_body(), $mutationId));
    if ($method === 'DELETE') json_response(Tasks::delete($db, $user, $match[1], $mutationId));
}
if ($method === 'POST' && preg_match('#^/tasks/([A-Za-z0-9-]+)/complete$#', $path, $match)) json_response(Tasks::complete($db, $user, $match[1], json_body(), $mutationId), 201);
if ($method === 'DELETE' && preg_match('#^/tasks/([A-Za-z0-9-]+)/completions/(\d{4}-\d{2}-\d{2})$#', $path, $match)) json_response(Tasks::reopen($db, $user, $match[1], $match[2], $mutationId));
if ($method === 'POST' && preg_match('#^/goals/([A-Za-z0-9-]+)/milestones$#', $path, $match)) json_response(Goals::addMilestone($db, $user, $match[1], json_body(), $mutationId), 201);
if ($method === 'POST' && preg_match('#^/goals/([A-Za-z0-9-]+)/entries$#', $path, $match)) json_response(Goals::addEntry($db, $user, $match[1], json_body(), $mutationId), 201);

throw new HttpError(404, 'Not found.');
