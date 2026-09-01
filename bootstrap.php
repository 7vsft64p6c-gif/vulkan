<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/Logger.php';
require_once __DIR__ . '/lib/Database.php';
require_once __DIR__ . '/lib/Money.php';
require_once __DIR__ . '/lib/Products.php';
require_once __DIR__ . '/lib/PaymentProviderInterface.php';
require_once __DIR__ . '/lib/MockPaymentProvider.php';
require_once __DIR__ . '/lib/MercadoPagoProvider.php';
require_once __DIR__ . '/lib/PaymentProviderFactory.php';
require_once __DIR__ . '/lib/OrderService.php';
require_once __DIR__ . '/lib/WebhookService.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

// CORS — por defecto mismo origen (no se necesita nada). Si tu frontend
// vive en otro dominio, define FRONTEND_ORIGIN en tu .env.
if (FRONTEND_ORIGIN) {
    header('Access-Control-Allow-Origin: ' . FRONTEND_ORIGIN);
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $status = 400, array $extra = []): never
{
    json_response(array_merge(['error' => $message], $extra), $status);
}

// Convierte cualquier excepción no capturada en un JSON 500 genérico —
// nunca se filtra el mensaje interno/stack trace al cliente.
set_exception_handler(function (Throwable $e): void {
    Logger::log('UNCAUGHT_EXCEPTION', [
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
    ]);
    $body = ['error' => 'Ocurrió un error interno. Intenta de nuevo en unos minutos.'];
    if (APP_DEBUG) {
        $body['debug'] = $e->getMessage();
    }
    json_response($body, 500);
});

/** Limita solicitudes simples por IP usando un archivo — suficiente para
 *  tiendas pequeñas en hosting compartido sin Redis/Memcached. */
function rate_limit(string $bucket, int $maxRequests, int $perSeconds): void
{
    $dir = __DIR__ . '/storage/ratelimit';
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $file = $dir . '/' . preg_replace('/[^a-z0-9]/i', '_', $bucket . '_' . $ip) . '.json';

    $now = time();
    $hits = [];
    if (is_file($file)) {
        $hits = json_decode(file_get_contents($file), true) ?: [];
    }
    $hits = array_values(array_filter($hits, fn($t) => $t > $now - $perSeconds));
    if (count($hits) >= $maxRequests) {
        json_error('Demasiadas solicitudes. Espera un momento.', 429);
    }
    $hits[] = $now;
    file_put_contents($file, json_encode($hits), LOCK_EX);
}
