<?php
/**
 * Community sentiment: one vote per wallet, per token.
 *
 * The browser never says who is voting. It sends a signature, and the address is
 * recovered from it here — so a vote can only ever be filed under the wallet
 * that actually signed, and posting somebody else's address by hand achieves
 * nothing. Re-signing replaces that wallet's own vote rather than adding one.
 *
 * Votes live in a JSON file per token. A launchpad's board is small and a vote
 * is two integers; a database would be more moving parts than the feature has.
 */

declare(strict_types=1);

require_once __DIR__ . '/secp256k1.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

const DATA_DIR = __DIR__ . '/data';

function fail(string $message, int $status = 400): never
{
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

/** Addresses are compared lowercase throughout — a checksum is display only. */
function normalise_address(mixed $value): ?string
{
    if (!is_string($value) || !preg_match('/^0x[0-9a-fA-F]{40}$/', $value)) return null;
    return strtolower($value);
}

function tally_path(string $token): string
{
    return DATA_DIR . '/' . $token . '.json';
}

/** @return array<string,int> */
function read_tally(string $token): array
{
    $path = tally_path($token);
    if (!is_file($path)) return [];
    $raw = file_get_contents($path);
    $data = json_decode($raw === false ? '' : $raw, true);
    return is_array($data) ? $data : [];
}

function summarise(array $tally, ?string $voter): array
{
    $up = 0;
    $down = 0;
    foreach ($tally as $vote) {
        if ($vote === 1) $up++;
        elseif ($vote === -1) $down++;
    }
    return [
        'ok' => true,
        'up' => $up,
        'down' => $down,
        'mine' => $voter !== null && isset($tally[$voter]) ? $tally[$voter] : 0,
    ];
}

/** The exact text a wallet is asked to sign. Both sides must build it the same. */
function vote_message(string $token, int $vote): string
{
    return "Vladhood launchpad\n"
         . "Vote: " . ($vote === 1 ? 'like' : 'dislike') . "\n"
         . "Token: " . $token;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $token = normalise_address($_GET['token'] ?? null);
    if ($token === null) fail('Pass a token address.');
    $voter = normalise_address($_GET['voter'] ?? null);
    echo json_encode(summarise(read_tally($token), $voter));
    exit;
}

if ($method !== 'POST') {
    fail('Use GET to read a tally or POST to cast a vote.', 405);
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($body)) fail('Send a JSON body.');

$token = normalise_address($body['token'] ?? null);
if ($token === null) fail('Pass a token address.');

$vote = $body['vote'] ?? null;
if ($vote !== 1 && $vote !== -1) fail('A vote is 1 or -1.');

$signature = $body['signature'] ?? null;
if (!is_string($signature) || !preg_match('/^0x[0-9a-fA-F]{130}$/', $signature)) {
    fail('Sign the vote with your wallet.');
}

$claimed = normalise_address($body['voter'] ?? null);
if ($claimed === null) fail('Say which wallet is voting.');

$voter = (new Secp256k1())->recoverAddress(
    personal_sign_hash(vote_message($token, $vote)),
    hex2bin(substr($signature, 2)),
);
/* Recovery always yields some address, so "it recovered" proves nothing on its
   own — 65 random bytes would file a vote under a random wallet. The signature
   has to land on the wallet the request claims to be. */
if ($voter === null || $voter !== $claimed) fail('That signature does not check out.', 403);

if (!is_dir(DATA_DIR) && !mkdir(DATA_DIR, 0775, true) && !is_dir(DATA_DIR)) {
    fail('Vote storage is unavailable.', 500);
}

/* Read, change and write under one lock: two people voting in the same instant
   would otherwise each write a tally that never saw the other. */
$path = tally_path($token);
$handle = fopen($path, 'c+');
if ($handle === false) fail('Vote storage is unavailable.', 500);

try {
    if (!flock($handle, LOCK_EX)) fail('Vote storage is busy.', 503);

    $raw = stream_get_contents($handle);
    $tally = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($tally)) $tally = [];

    $tally[$voter] = $vote;

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($tally));
    fflush($handle);
    flock($handle, LOCK_UN);
} finally {
    fclose($handle);
}

echo json_encode(summarise($tally, $voter));
