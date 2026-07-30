import { useState } from 'react';
import { faceFor } from '../lib/tokens';

/** A pinned logo when the launch had one, otherwise the face drawn from the
 *  address — including when the image is there but fails to load.
 *
 *  `cover` is the board card treatment: a blurred blow-up of the artwork behind
 *  a sharp disc, so tall and wide images both fill a square tile. `plain` is the
 *  artwork alone, for places that already have a frame of their own. */
export default function TokenArt({ address, logo, name, variant = 'cover' }: {
  address: string; logo?: string; name?: string; variant?: 'cover' | 'plain';
}) {
  const [broken, setBroken] = useState(false);
  const face = faceFor(address);
  const initials = (name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();
  const showLogo = Boolean(logo) && !broken;

  const fallback = (
    <div style={{ width: '100%', height: '100%', background: face.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span className="marker" style={{ fontSize: '2rem', color: 'var(--ink)', opacity: .75 }}>{initials}</span>
    </div>
  );

  if (variant === 'plain') {
    return showLogo
      ? <img src={logo} alt={name || ''} onError={() => setBroken(true)}
             style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      : fallback;
  }

  return (
    <div className="card-cover" style={{ background: face.bg }}>
      {showLogo ? (
        <>
          <div className="card-blur" aria-hidden><img src={logo} alt="" /></div>
          <div className="card-disc"><img src={logo} alt={name || ''} onError={() => setBroken(true)} /></div>
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
