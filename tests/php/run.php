<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$requested = array_slice($argv, 1);
$files = glob(__DIR__ . '/*_test.php') ?: [];
foreach ($files as $file) {
    if ($requested && !array_filter($requested, fn(string $name) => str_contains(basename($file), $name))) continue;
    require $file;
}

$failed = 0;
foreach ($tests as [$name, $callback]) {
    try {
        $callback();
        echo "PASS {$name}\n";
    } catch (Throwable $error) {
        $failed++;
        fwrite(STDERR, "FAIL {$name}: {$error->getMessage()}\n");
    }
}
echo count($tests) . ' tests, ' . $failed . " failures\n";
exit($failed ? 1 : 0);
