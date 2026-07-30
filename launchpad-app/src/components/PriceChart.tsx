import { useEffect, useRef, useState } from 'react';
import { timeLabel, fullTime } from '../lib/format';

export type Point = { t: number; v: number };
export type Marker = { t: number; kind: 'buy' | 'sell' };

const W = 760;
const NARROW_AT = 470;

/**
 * A Catmull-Rom spline written as beziers, with the control points held inside
 * the span of the pair they join. Unclamped, a spline through a spike overshoots
 * past the highest reading, which on a price chart draws a peak that never
 * traded.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return '';
  if (pts.length < 3) return `M ${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`;
  const T = 0.72;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? pts[i + 1];
    const lo = Math.min(p1.y, p2.y) - 1, hi = Math.max(p1.y, p2.y) + 1;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * T;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * T;
    const c1y = Math.max(lo, Math.min(hi, p1.y + ((p2.y - p0.y) / 6) * T));
    const c2y = Math.max(lo, Math.min(hi, p2.y - ((p3.y - p1.y) / 6) * T));
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * The market cap line: a smoothed curve over a dashed scale, with the high and
 * low called out on the curve itself and a crosshair that reads out whatever the
 * pointer is over. One dot marks where it stands now; a dot per reading turns a
 * busy pool into a bead string and says nothing the line does not. The creator's
 * own trades are the exception — those get a flag.
 */
export default function PriceChart({ series, markers = [], format }: {
  series: Point[]; markers?: Marker[]; format: (v: number, step: number) => string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setNarrow(el.clientWidth > 0 && el.clientWidth < NARROW_AT);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (series.length < 2) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'rgba(43,38,32,.6)' }}>
        {series.length === 0 ? 'No trades yet.' : 'One trade so far — a chart needs at least two.'}
      </div>
    );
  }

  const H = narrow ? 430 : 320;
  const PL = 14, PR = narrow ? 86 : 96, PT = 18, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const base = H - PB;
  const fontY = narrow ? 16 : 14;
  const fontX = narrow ? 17 : 15;

  const values = series.map((p) => p.v);
  const rawLo = Math.min(...values), rawHi = Math.max(...values);
  /* A quiet stretch barely moves, and scaled to its own span the axis ends up
     counting hundredths of a cent. Hold the band open to half a percent. */
  const spread = Math.max(rawHi - rawLo, Math.abs(rawHi) * 0.005, 1e-12);
  const top = rawLo + spread * 1.18, bot = rawLo - spread * 0.22;

  const n = series.length;
  const X = (i: number) => PL + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const Y = (v: number) => PT + (1 - (v - bot) / (top - bot)) * ih;

  const pts = series.map((p, i) => ({ x: X(i), y: Y(p.v) }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[n - 1].x.toFixed(1)} ${base} L ${pts[0].x.toFixed(1)} ${base} Z`;

  const up = values[n - 1] >= values[0];
  const stroke = up ? 'var(--forest2)' : 'var(--crayred)';
  const gradient = `mc-fill-${up ? 'up' : 'down'}`;

  const TICKS = 4;
  const gridStep = (top - bot) / TICKS;
  const tipStep = gridStep / 20;

  let hiI = 0, loI = 0;
  for (let i = 1; i < n; i++) {
    if (values[i] > values[hiI]) hiI = i;
    if (values[i] < values[loI]) loI = i;
  }

  const spanMs = series[n - 1].t - series[0].t;
  /* Four marks along the bottom, but a short series lands several of them on the
     same sample and the axis reads as a stutter of identical clock times. */
  const timeIdx = [...new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1])];

  /* Flags sit at the moment they happened, not at the nearest sample: on a
     coarse step the samples are hours apart. */
  const tMin = series[0].t, tMax = series[n - 1].t, tSpan = tMax - tMin || 1;
  const at = (t: number) => {
    const f = Math.min(1, Math.max(0, (t - tMin) / tSpan)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    return { x: PL + (f / (n - 1)) * iw, y: Y(series[i].v + (series[i + 1].v - series[i].v) * (f - i)) };
  };

  function track(clientX: number) {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r?.width) return;
    const cx = (clientX - r.left) * (W / r.width);
    setHover(Math.max(0, Math.min(n - 1, Math.round(((cx - PL) / (iw || 1)) * (n - 1)))));
  }

  const hp = hover === null ? null : { ...pts[hover], point: series[hover] };
  const scale = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r?.width ? r.width / W : 1;
  };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" role="img"
           style={{ display: 'block', touchAction: 'pan-y' }}
           aria-label="Market cap history from this pool's swaps, with the creator's own trades flagged">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity=".36" />
            <stop offset="70%" stopColor={stroke} stopOpacity=".08" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {Array.from({ length: TICKS + 1 }, (_, k) => {
          const gy = PT + (k * ih) / TICKS;
          const gv = bot + (1 - k / TICKS) * (top - bot);
          return (
            <g key={k}>
              <line x1={PL} x2={PL + iw} y1={gy} y2={gy} stroke="rgba(43,38,32,.13)" strokeWidth="1" strokeDasharray="2 6" />
              <text x={W - 6} y={gy + 4} textAnchor="end" fontSize={fontY} fill="rgba(43,38,32,.5)"
                    fontFamily="'Patrick Hand', cursive">{format(gv, gridStep)}</text>
            </g>
          );
        })}

        <path d={area} fill={`url(#${gradient})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />

        {([[hiI, true], [loI, false]] as [number, boolean][]).map(([i, isHigh]) => {
          const x = X(i), y = Y(values[i]);
          const anchor = x > PL + iw * 0.8 ? 'end' : x < PL + iw * 0.2 ? 'start' : 'middle';
          return (
            <g key={isHigh ? 'hi' : 'lo'}>
              <circle cx={x} cy={y} r="3.4" fill="var(--paper)" stroke={stroke} strokeWidth="2.2" />
              <text x={x} y={isHigh ? y - 12 : y + 20} textAnchor={anchor} fontSize={narrow ? 17 : 14}
                    fill="rgba(43,38,32,.62)" fontFamily="'Patrick Hand', cursive">
                {isHigh ? 'high ' : 'low '}{format(values[i], tipStep)}
              </text>
            </g>
          );
        })}

        <line x1={PL} x2={PL + iw} y1={base} y2={base} stroke="rgba(43,38,32,.35)" strokeWidth="1.6" />

        <circle cx={pts[n - 1].x} cy={pts[n - 1].y} r="9" fill={stroke} opacity=".18" />
        <circle cx={pts[n - 1].x} cy={pts[n - 1].y} r="4.4" fill={stroke} stroke="var(--ink)" strokeWidth="1.8" />

        {timeIdx.map((i, j) => (
          <text key={i} x={X(i)} y={H - 10} fontSize={fontX} fill="rgba(43,38,32,.5)"
                fontFamily="'Patrick Hand', cursive"
                textAnchor={j === 0 ? 'start' : j === timeIdx.length - 1 ? 'end' : 'middle'}>
            {timeLabel(series[i].t, spanMs)}
          </text>
        ))}

        {markers.map((m, k) => {
          const { x: mx, y: my } = at(m.t);
          const colour = m.kind === 'buy' ? 'var(--forest2)' : 'var(--crayred)';
          const below = my < base - 52;
          const by = below ? my + 34 : my - 34;
          /* the dot stays put; only the badge slides in off the edge */
          const bx = Math.min(Math.max(mx, PL + 16), PL + iw - 16);
          return (
            <g key={`${m.t}-${k}`}>
              <line x1={mx} x2={mx} y1={my} y2={below ? by - 8 : by + 8} stroke={colour} strokeWidth="1.5" />
              <circle cx={mx} cy={my} r="3.5" fill={colour} />
              <rect x={bx - 15} y={by - 9} width="30" height="18" rx="5" fill={colour} />
              <text x={bx} y={by + 4} fontSize="11" textAnchor="middle" fill="var(--paper)"
                    fontFamily="'Patrick Hand', cursive">{m.kind === 'buy' ? 'DB' : 'DS'}</text>
            </g>
          );
        })}

        {hp && (
          <g>
            <line x1={hp.x} x2={hp.x} y1={PT} y2={base} stroke="rgba(43,38,32,.45)" strokeWidth="1.4" strokeDasharray="3 4" />
            <circle cx={hp.x} cy={hp.y} r="5.2" fill="var(--paper)" stroke={stroke} strokeWidth="3" />
          </g>
        )}

        <rect x="0" y="0" width={W} height={H} fill="transparent" style={{ cursor: 'crosshair' }}
              onMouseMove={(e) => track(e.clientX)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={(e) => e.touches[0] && track(e.touches[0].clientX)}
              onTouchMove={(e) => e.touches[0] && track(e.touches[0].clientX)}
              onTouchEnd={() => setHover(null)} />
      </svg>

      {hp && (
        <div className="chart-tip num"
             style={{ left: Math.min(Math.max(hp.x * scale(), 60), (box.current?.clientWidth ?? W) - 60),
                      top: Math.max(26, hp.y * scale() - 10) }}>
          <span className="marker" style={{ fontSize: '.95rem' }}>{format(hp.point.v, tipStep)}</span>
          <br />
          <span style={{ fontSize: '.8rem', color: 'rgba(43,38,32,.7)' }}>{fullTime(hp.point.t)}</span>
        </div>
      )}
    </div>
  );
}
