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

/** A launch price is a handful of billionths, so plain fixed notation is a row
 *  of zeroes; only the larger end of the range is readable that way. */
export function price(v: number | null): string {
  if (v === null || !isFinite(v) || v <= 0) return '—';
  if (v >= 0.001) return v.toFixed(6);
  return v.toExponential(3);
}

/** 1,000,000,000 reads worse than 1B in a stat row. */
export function compactNum(v: number): string {
  if (!isFinite(v)) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(v >= 1e10 ? 0 : 2).replace(/\.00$/, '')}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 2).replace(/\.00$/, '')}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function pct(v: number | null): string {
  if (v === null || !isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

/**
 * An axis label, carrying exactly enough decimals to tell one gridline from the
 * next. Precision has to come from the gap between the lines rather than from
 * the size of the number: a launch sits near $2.6K and moves by single dollars,
 * so any fixed number of digits prints the same label three times.
 */
export function usdAxis(ethAmount: number, rate: number | null, stepEth: number): string {
  const scale = rate ?? 1;
  const v = ethAmount * scale;
  const step = Math.abs(stepEth * scale) || 1;
  const [unit, suffix] = v >= 1e9 ? [1e9, 'B'] : v >= 1e6 ? [1e6, 'M'] : v >= 1e3 ? [1e3, 'K'] : [1, ''];
  const decimals = Math.min(6, Math.max(0, Math.ceil(-Math.log10(step / unit))));
  const body = (v / unit).toFixed(decimals) + suffix;
  return rate ? `$${body}` : `${body} ETH`;
}

/* The site is written in English throughout, so the dates are too — and a fixed
   locale keeps them the same whatever the reader's browser is set to. */
const LOC = 'en-GB';

/** Axis label: clock time while the chart covers days, calendar past that. */
export function timeLabel(ts: number, spanMs: number): string {
  const d = new Date(ts);
  if (spanMs > 48 * 3600e3) return d.toLocaleDateString(LOC, { month: 'short', day: 'numeric' });
  return d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
}

/** Tooltip label: the day and the minute, since a hover asks exactly when. */
export function fullTime(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString(LOC, { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' })}`;
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
