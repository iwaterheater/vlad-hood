/** Shared formatting. Dollar figures need a rate; without one the ETH value is
 *  still true, so that is the fallback rather than a blank or a guess. */
export function usd(ethAmount: number | null, rate: number | null): string {
  if (ethAmount === null || !isFinite(ethAmount) || ethAmount <= 0) return '—';
  if (!rate) {
    if (ethAmount >= 1) return `${ethAmount.toFixed(2)} ETH`;
    if (ethAmount >= 0.001) return `${ethAmount.toFixed(4)} ETH`;
    return `${ethAmount.toExponential(1)} ETH`;
  }
  const v = ethAmount * rate;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  if (v >= 1) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

export function shortAddress(a?: string | null): string {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ago(ms: number | null): string {
  if (!ms) return '';
  const d = Date.now() - ms;
  const s = Math.floor(d / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), day = Math.floor(h / 24);
  if (s < 20) return 'just now';
  if (m < 1) return `${s}s ago`;
  if (h < 1) return `${m}m ago`;
  if (day < 1) return `${h}h ago`;
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
}
