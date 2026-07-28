<?php
/**
 * Image upload for the launchpad, pinned to IPFS through Filebase.
 *
 * The browser cannot do this itself: the Filebase token would have to ship in
 * the page, and anyone reading the source could then write to the bucket. So the
 * token stays here, on the server, and the browser only ever posts an image.
 *
 * The token is read from config.php next to this file, which returns it rather
 * than printing it — a .php file fetched over HTTP executes and yields nothing,
 * so the secret is not served even if someone guesses the name.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

const MAX_BYTES = 2 * 1024 * 1024;   // 2 MB
const ALLOWED = [
    IMAGETYPE_PNG  => 'png',
    IMAGETYPE_JPEG => 'jpg',
    IMAGETYPE_GIF  => 'gif',
    IMAGETYPE_WEBP => 'webp',
];

function fail(string $message, int $status = 400): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Post an image to this endpoint.', 405);
}

if (!isset($_FILES['image']) || !is_array($_FILES['image'])) {
    fail('No image was attached.');
}
$file = $_FILES['image'];

if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $reason = match ($file['error']) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'That image is too large.',
        UPLOAD_ERR_PARTIAL                        => 'The upload was cut short.',
        UPLOAD_ERR_NO_FILE                        => 'No image was attached.',
        default                                   => 'The upload failed.',
    };
    fail($reason);
}

if (($file['size'] ?? 0) > MAX_BYTES) {
    fail('Images must be 2 MB or smaller.');
}
if (!is_uploaded_file($file['tmp_name'])) {
    fail('That upload did not arrive through a form.');
}

/* Trust the bytes, not the name or the client's content type: both are the
   caller's to invent, and a mislabelled file would be pinned regardless. */
$info = @getimagesize($file['tmp_name']);
if ($info === false || !isset(ALLOWED[$info[2]])) {
    fail('That file is not a PNG, JPEG, GIF or WebP image.');
}

/* getimagesize reads the header and stops, so a few magic bytes with anything
   at all behind them satisfy it — "GIF89a" followed by PHP passes. Decoding the
   whole thing is what actually settles whether it is an image. */
$decoded = @imagecreatefromstring((string)file_get_contents($file['tmp_name']));
if ($decoded === false) {
    fail('That file starts like an image but does not decode as one.');
}
imagedestroy($decoded);

if ($info[0] < 1 || $info[1] < 1 || $info[0] > 4096 || $info[1] > 4096) {
    fail('Images must be between 1 and 4096 pixels on each side.');
}

$extension = ALLOWED[$info[2]];
$mime = image_type_to_mime_type($info[2]);

/* Checked here rather than first: a caller who sent the wrong file deserves to
   hear that, not a message about server configuration they cannot act on. */
$configPath = __DIR__ . '/config.php';
$config = is_file($configPath) ? require $configPath : [];
$token = trim((string)($config['filebase_token'] ?? ''));
if ($token === '') {
    fail('Uploads are not configured on this server yet.', 503);
}

$curl = curl_init('https://rpc.filebase.io/api/v0/add?cid-version=1');
curl_setopt_array($curl, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token],
    CURLOPT_POSTFIELDS     => [
        'file' => new CURLFile($file['tmp_name'], $mime, 'logo.' . $extension),
    ],
]);
$body = curl_exec($curl);
$status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$curlError = curl_error($curl);
curl_close($curl);

if ($body === false) {
    fail('Could not reach the pinning service: ' . $curlError, 502);
}
if ($status < 200 || $status >= 300) {
    /* never echo the upstream body: it can carry account details */
    fail('The pinning service refused the upload (HTTP ' . $status . ').', 502);
}

$parsed = json_decode((string)$body, true);
$cid = is_array($parsed) ? ($parsed['Hash'] ?? $parsed['cid'] ?? '') : '';
if (!is_string($cid) || $cid === '') {
    fail('The pinning service returned no CID.', 502);
}

echo json_encode([
    'ok'   => true,
    'cid'  => $cid,
    'url'  => 'https://ipfs.filebase.io/ipfs/' . $cid,
    'size' => (int)$file['size'],
    'type' => $mime,
]);
