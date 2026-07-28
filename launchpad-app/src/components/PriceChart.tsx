import type { Swap } from '../lib/useSwaps';

/** A plain SVG line. Two points is the minimum that can honestly be called a
 *  chart; below that the panel says so instead of drawing through one dot. */
export default function PriceChart({ swaps }: { swaps: Swap[] }) {
  if (swaps.length < 2) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'rgba(43,38,32,.6)' }}>
        {swaps.length === 0 ? 'No trades yet.' : 'One trade so far — a chart needs at least two.'}
      </div>
    );
  }

  const W = 640, H = 220, PAD = 8;
  const prices = swaps.map((s) => s.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const span = hi - lo || hi || 1;
  const x = (i: number) => PAD + (i / (swaps.length - 1)) * (W - PAD * 2);
  const y = (p: number) => H - PAD - ((p - lo) / span) * (H - PAD * 2);

  const line = swaps.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.price).toFixed(1)}`).join(' ');
  const area = `${line} L${x(swaps.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
  const up = prices[prices.length - 1] >= prices[0];
  const stroke = up ? 'var(--forest2)' : 'var(--crayred)';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="220" role="img" aria-label="Price history from this pool's swaps">
      <path d={area} fill={stroke} opacity=".12" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {swaps.map((s, i) => (
        <circle key={s.tx + i} cx={x(i)} cy={y(s.price)} r="3" fill={stroke} />
      ))}
    </svg>
  );
}
