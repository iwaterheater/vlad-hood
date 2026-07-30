<?php
/**
 * Recovering an Ethereum address from a personal_sign signature.
 *
 * A vote has to be pinned to a wallet, and a browser can claim any address it
 * likes. The only thing it cannot forge is a signature, so the address is not
 * taken from the request at all — it is derived from the signature here, and a
 * vote is filed under whatever wallet actually signed.
 *
 * Point arithmetic is affine with a modular inverse per addition. That is the
 * slow way to do it, and it does not matter: this runs once per vote.
 */

declare(strict_types=1);

require_once __DIR__ . '/keccak.php';

final class Secp256k1
{
    private \GMP $p;
    private \GMP $n;
    private \GMP $gx;
    private \GMP $gy;

    public function __construct()
    {
        $this->p = gmp_init('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F', 16);
        $this->n = gmp_init('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141', 16);
        $this->gx = gmp_init('79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798', 16);
        $this->gy = gmp_init('483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8', 16);
    }

    /** @param array{0:\GMP,1:\GMP}|null $a */
    private function add(?array $a, ?array $b): ?array
    {
        if ($a === null) return $b;
        if ($b === null) return $a;

        [$x1, $y1] = $a;
        [$x2, $y2] = $b;

        if (gmp_cmp($x1, $x2) === 0) {
            if (gmp_cmp(gmp_mod(gmp_add($y1, $y2), $this->p), 0) === 0) return null;   // P + (-P)
            // doubling: l = 3x² / 2y   (a = 0 for this curve)
            $l = gmp_mod(gmp_mul(gmp_mul(3, gmp_mul($x1, $x1)), gmp_invert(gmp_mul(2, $y1), $this->p)), $this->p);
        } else {
            $l = gmp_mod(gmp_mul(gmp_sub($y2, $y1), gmp_invert(gmp_sub($x2, $x1), $this->p)), $this->p);
        }

        $x3 = gmp_mod(gmp_sub(gmp_sub(gmp_mul($l, $l), $x1), $x2), $this->p);
        $y3 = gmp_mod(gmp_sub(gmp_mul($l, gmp_sub($x1, $x3)), $y1), $this->p);
        return [$x3, $y3];
    }

    private function mul(?array $point, \GMP $k): ?array
    {
        $result = null;
        $addend = $point;
        $k = gmp_mod($k, $this->n);
        while (gmp_cmp($k, 0) > 0) {
            if (gmp_testbit($k, 0)) $result = $this->add($result, $addend);
            $addend = $this->add($addend, $addend);
            $k = gmp_div_q($k, 2);
        }
        return $result;
    }

    /** The point on the curve with this x and the requested parity of y. */
    private function decompress(\GMP $x, int $yParity): ?array
    {
        $alpha = gmp_mod(gmp_add(gmp_powm($x, 3, $this->p), 7), $this->p);
        // p ≡ 3 (mod 4), so the square root is a single exponentiation
        $y = gmp_powm($alpha, gmp_div_q(gmp_add($this->p, 1), 4), $this->p);
        if (gmp_cmp(gmp_powm($y, 2, $this->p), $alpha) !== 0) return null;   // x is not on the curve
        if (gmp_testbit($y, 0) !== (bool) $yParity) $y = gmp_sub($this->p, $y);
        return [$x, $y];
    }

    /**
     * @param string $hash 32 raw bytes
     * @param string $sig  65 raw bytes: r ‖ s ‖ v
     * @return string|null lowercase 0x-prefixed address, or null if it does not recover
     */
    public function recoverAddress(string $hash, string $sig): ?string
    {
        if (strlen($sig) !== 65 || strlen($hash) !== 32) return null;

        $r = gmp_init(bin2hex(substr($sig, 0, 32)), 16);
        $s = gmp_init(bin2hex(substr($sig, 32, 32)), 16);
        $v = ord($sig[64]);
        if ($v >= 27) $v -= 27;                       // wallets send 27/28, the algorithm wants 0/1
        if ($v !== 0 && $v !== 1) return null;

        if (gmp_cmp($r, 1) < 0 || gmp_cmp($r, $this->n) >= 0) return null;
        if (gmp_cmp($s, 1) < 0 || gmp_cmp($s, $this->n) >= 0) return null;

        $R = $this->decompress($r, $v);
        if ($R === null) return null;

        $e = gmp_init(bin2hex($hash), 16);
        $rInv = gmp_invert($r, $this->n);
        if ($rInv === false) return null;

        // Q = r⁻¹ (sR − eG)
        $sR = $this->mul($R, $s);
        $eG = $this->mul([$this->gx, $this->gy], gmp_mod(gmp_neg($e), $this->n));
        $Q = $this->mul($this->add($sR, $eG), $rInv);
        if ($Q === null) return null;

        $pub = str_pad(gmp_strval($Q[0], 16), 64, '0', STR_PAD_LEFT)
             . str_pad(gmp_strval($Q[1], 16), 64, '0', STR_PAD_LEFT);

        return '0x' . substr(keccak256_hex(hex2bin($pub)), 24);
    }
}

/** The EIP-191 digest a wallet signs for personal_sign. */
function personal_sign_hash(string $message): string
{
    return keccak256("\x19Ethereum Signed Message:\n" . strlen($message) . $message);
}
