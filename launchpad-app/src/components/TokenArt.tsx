import { faceFor } from '../lib/tokens';

/** A pinned logo when the launch had one, otherwise the face drawn from the
 *  address — including when the image is there but fails to load. */
export default function TokenArt({ address, logo, name }: { address: string; logo?: string; name?: string }) {
  const face = faceFor(address);
  const initials = (name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();

  const fallback = (
    <div style={{ width: '100%', height: '100%', background: face.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span className="marker" style={{ fontSize: '2rem', color: 'var(--ink)', opacity: .75 }}>{initials}</span>
    </div>
  );

  return (
    <div className="card-cover" style={{ background: face.bg }}>
      {logo ? (
        <>
          <div className="card-blur" aria-hidden><img src={logo} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>
          <div className="card-disc">
            <img src={logo} alt={name || ''} onError={(e) => { const el = e.target as HTMLImageElement; el.replaceWith(Object.assign(document.createElement('div'), { className: 'marker', textContent: initials, style: 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:2rem' })); }} />
          </div>
        </>
      ) : (
        <>
          <div className="card-blur" aria-hidden>{fallback}</div>
          <div className="card-disc">{fallback}</div>
        </>
      )}
    </div>
  );
}
