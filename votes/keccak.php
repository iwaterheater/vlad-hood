<?php
/**
 * Keccak-256, the hash Ethereum uses.
 *
 * PHP ships SHA3-256, which is the same permutation with a different padding
 * byte — 0x06 where Keccak writes 0x01 — so hash('sha3-256') gives a different
 * digest and cannot stand in. The sponge is short enough to write out.
 */

declare(strict_types=1);

const KECCAK_ROUNDS = 24;

/** Rotation offsets, indexed [x][y] over the 5x5 state. */
const KECCAK_ROT = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
];

/* Half of these sit above PHP_INT_MAX, where hexdec() hands back a float and
   the low bits are gone. Read as big-endian 64-bit instead: the value wraps into
   a negative int with the same bit pattern, which is all the permutation wants. */
const KECCAK_RC = [
    '0000000000000001', '0000000000008082', '800000000000808a', '8000000080008000',
    '000000000000808b', '0000000080000001', '8000000080008081', '8000000000008009',
    '000000000000008a', '0000000000000088', '0000000080008009', '000000008000000a',
    '000000008000808b', '800000000000008b', '8000000000008089', '8000000000008003',
    '8000000000008002', '8000000000000080', '000000000000800a', '800000008000000a',
    '8000000080008081', '8000000000008080', '0000000080000001', '8000000080008008',
];

/** 64-bit left rotate on PHP's signed ints — the shift must not sign-extend. */
function keccak_rotl(int $v, int $n): int
{
    $n &= 63;
    if ($n === 0) {
        return $v;
    }
    return ($v << $n) | (($v >> (64 - $n)) & ((1 << $n) - 1));
}

function keccak_f(array &$a): void
{
    static $rc = null;
    $rc ??= array_map(static fn(string $h): int => unpack('J', hex2bin($h))[1], KECCAK_RC);

    for ($round = 0; $round < KECCAK_ROUNDS; $round++) {
        // theta
        $c = [];
        for ($x = 0; $x < 5; $x++) {
            $c[$x] = $a[$x][0] ^ $a[$x][1] ^ $a[$x][2] ^ $a[$x][3] ^ $a[$x][4];
        }
        for ($x = 0; $x < 5; $x++) {
            $d = $c[($x + 4) % 5] ^ keccak_rotl($c[($x + 1) % 5], 1);
            for ($y = 0; $y < 5; $y++) {
                $a[$x][$y] ^= $d;
            }
        }

        // rho + pi
        $b = [];
        for ($x = 0; $x < 5; $x++) {
            for ($y = 0; $y < 5; $y++) {
                $b[$y][(2 * $x + 3 * $y) % 5] = keccak_rotl($a[$x][$y], KECCAK_ROT[$x][$y]);
            }
        }

        // chi
        for ($x = 0; $x < 5; $x++) {
            for ($y = 0; $y < 5; $y++) {
                $a[$x][$y] = $b[$x][$y] ^ ((~$b[($x + 1) % 5][$y]) & $b[($x + 2) % 5][$y]);
            }
        }

        // iota
        $a[0][0] ^= $rc[$round];
    }
}

/** @return string 32 raw bytes */
function keccak256(string $input): string
{
    $rate = 136;                                  // 1088 bits, the rate for a 256-bit digest

    $len = strlen($input);
    $padLen = $rate - ($len % $rate);
    $pad = str_repeat("\0", $padLen);
    $pad[0] = chr(0x01);                          // Keccak's domain byte, not SHA3's 0x06
    $pad[$padLen - 1] = chr(ord($pad[$padLen - 1]) | 0x80);
    $message = $input . $pad;

    $a = array_fill(0, 5, array_fill(0, 5, 0));

    for ($offset = 0; $offset < strlen($message); $offset += $rate) {
        $block = substr($message, $offset, $rate);
        for ($i = 0; $i < $rate / 8; $i++) {
            $lane = unpack('P', substr($block, $i * 8, 8))[1];   // little-endian, as Keccak reads it
            $a[$i % 5][intdiv($i, 5)] ^= $lane;
        }
        keccak_f($a);
    }

    $out = '';
    for ($i = 0; $i < 4; $i++) {                  // 4 lanes = 32 bytes
        $out .= pack('P', $a[$i % 5][intdiv($i, 5)]);
    }
    return $out;
}

function keccak256_hex(string $input): string
{
    return bin2hex(keccak256($input));
}
