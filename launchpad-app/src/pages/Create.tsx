import { useEffect, useState } from 'react';
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseEther, formatEther, keccak256, toHex, isAddress, type Address } from 'viem';
import { DEPLOYMENT, LAUNCH } from '../lib/chain';
import { factoryAbi } from '../lib/abi';
import { compactNum } from '../lib/format';
import WalletButton from '../components/WalletButton';
import Icon from '../components/Icon';

/* Every pool opens at the same tick, so what a launch buy returns is known
   before the pool exists — 1.0001^tick less the pool fee. Checked against real
   testnet buys it lands within 0.11%. Price impact is not modelled. */
function quoteLaunchBuy(eth: number) {
  if (!(eth > 0)) return 0;
  return eth * Math.pow(1.0001, Math.abs(LAUNCH.initialTick)) * (1 - LAUNCH.poolFee / 1e6);
}

const NAME_MAX = 32, TICKER_MAX = 10, DESC_MAX = 256;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;   // must match MAX_BYTES in upload/index.php
const LINK = /(https?:\/\/|www\.|\.[a-z]{2,}\/)/i;

function Field({ label, count, children, hint, error }: {
  label: string; count?: string; children: React.ReactNode; hint?: string; error?: string | null;
}) {
  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.5rem' }}>
        <span className="marker" style={{ fontSize: '.95rem' }}>{label}</span>
        {count && <span className="num" style={{ fontSize: '.75rem', color: 'rgba(43,38,32,.55)' }}>{count}</span>}
      </div>
      <div style={{ marginTop: '.3rem' }}>{children}</div>
      {hint && <p style={{ fontSize: '.78rem', color: 'rgba(43,38,32,.6)', margin: '.3rem 0 0' }}>{hint}</p>}
      {error && <p style={{ fontSize: '.78rem', color: 'var(--crayred)', margin: '.15rem 0 0' }}>{error}</p>}
    </div>
  );
}

function Leader({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '.25rem' }}>
      <span style={{ color: 'rgba(43,38,32,.7)', flex: 'none' }}>{label}</span>
      <span className="leader" aria-hidden />
      <span className="num" style={{ flex: 'none' }}>{children}</span>
    </div>
  );
}

export default function Create() {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();
  const { data: balance } = useBalance({ address });

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [telegram, setTelegram] = useState('');
  const [twitter, setTwitter] = useState('');
  const [feeWallet, setFeeWallet] = useState('');
  const [devBuy, setDevBuy] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isMining } = useWaitForTransactionReceipt({ hash });

  /* the object URL is the browser's handle on the file, and it leaks until revoked */
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const nameBad = name.length > 0 && !/^[A-Za-z0-9 ]+$/.test(name);
  const tickerBad = symbol.length > 0 && !/^[A-Za-z0-9]+$/.test(symbol);
  const descBad = LINK.test(description);
  const feeBad = feeWallet.length > 0 && !isAddress(feeWallet);

  /* Fee plus dev buy, before gas. Checked here so a short wallet is told so in
     plain words — left to the chain it comes back as "insufficient funds for
     gas * price + value" against a gas limit the wallet invented. */
  const cost = LAUNCH.fee + (() => { try { return parseEther(devBuy || '0'); } catch { return 0n; } })();
  const short = Boolean(balance) && cost > balance!.value;

  const missing = !name.trim() ? 'Add a name'
    : nameBad ? 'Fix the name'
    : !symbol.trim() ? 'Add a ticker'
    : tickerBad ? 'Fix the ticker'
    : descBad ? 'Remove the link'
    /* Artwork is what a board of memes is read by, and a token launched without
       it can never be given one — the logo is written into the contract at
       launch and there is no setter. */
    : !file ? 'Add an image'
    : feeBad ? 'Fix the fee recipient'
    : short ? `Needs ${formatEther(cost)} ETH plus gas` : null;
  const busy = Boolean(step) || isMining;

  function pick(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('That file is not an image.'); return; }
    /* The upload endpoint refuses anything larger. Caught here it costs nothing;
       caught there it fails partway through a launch the wallet is waiting on. */
    if (f.size > MAX_IMAGE_BYTES) {
      setError(`That image is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 4 MB.`);
      return;
    }
    setError(null);
    setFile(f);
  }

  async function launch() {
    setError(null);
    try {
      /* Pin the artwork before the transaction is built. Token metadata is
         written once and cannot be corrected, so a launch that succeeded around
         a half-finished upload would point at nothing forever. */
      let logo = '';
      if (file) {
        setStep('Uploading image…');
        const form = new FormData();
        form.append('image', file);
        const res = await fetch('/upload/', { method: 'POST', body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) throw new Error(body?.error ?? `The image upload failed (HTTP ${res.status}).`);
        logo = body.url;
      }

      setStep('Confirm in your wallet…');
      const value = LAUNCH.fee + (devBuy ? parseEther(devBuy) : 0n);
      const salt = keccak256(toHex(`${address}|${symbol}|${Date.now()}`));

      const args = [
        {
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          logo,
          description: description.trim(),
          socials: {
            twitter: twitter ? `https://x.com/${twitter}` : '',
            telegram: telegram ? `https://t.me/${telegram}` : '',
            discord: '',
            website: website ? `https://${website}` : '',
            farcaster: '',
          },
          feeWallet: (feeWallet || address) as Address,
        },
        LAUNCH.configId,
        LAUNCH.dexId,
        salt,
      ] as const;

      /* Simulate first: a revert here still carries the contract's own error,
         instead of a wallet's paraphrase of a failed gas estimate. */
      await client!.simulateContract({
        address: DEPLOYMENT.factory, abi: factoryAbi, functionName: 'launchToken',
        args, value, account: address,
      });

      const h = await writeContractAsync({
        address: DEPLOYMENT.factory, abi: factoryAbi, functionName: 'launchToken', args, value,
      });
      setHash(h);
      setStep('Waiting for the chain…');
      const receipt = await client!.waitForTransactionReceipt({ hash: h });
      const log = receipt.logs.find((l) => l.address.toLowerCase() === DEPLOYMENT.factory.toLowerCase());
      const token = log?.topics?.[1] ? (`0x${log.topics[1].slice(26)}` as Address) : null;

      /* Straight to the thing that was just made — a launcher's next move is
         always to look at it, and the board would only make them find it. */
      if (token) {
        setStep('Opening the token page…');
        window.location.href = `/launchpad-next/token?id=${token}`;
        return;
      }
      throw new Error('Launched, but the token address was not in the receipt. Find it on the board.');
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? 'The launch failed.');
      setStep(null);
    }
  }

  const boxStyle = (bad?: boolean) => ({ padding: '.3rem .6rem', borderColor: bad ? 'var(--crayred)' : undefined });
  const prefix = { color: 'rgba(43,38,32,.5)', flex: 'none' } as const;
  const row = { display: 'flex', alignItems: 'center', gap: '.35rem', minWidth: 0 } as const;

  const devBuyNum = Number(devBuy) || 0;
  const socialsShown = Boolean(website || telegram || twitter);

  return (
    <div className="create-page">
      <a href="/launchpad-next/" className="chip sketch-2 shadow-rough-sm marker"
         style={{ marginTop: '1.25rem', textDecoration: 'none', fontSize: '1rem' }}>
        ← Back to Launchpad
      </a>

      <h1 className="marker" style={{ color: 'var(--forest)', fontSize: 'clamp(2.25rem, 6vw, 3.5rem)', lineHeight: 1.25,
                                      margin: '1.5rem 0 0', transform: 'rotate(-1deg)', wordBreak: 'break-word' }}>
        <span className="scribble-underline">Launch token</span>
      </h1>
      <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.7rem', margin: '1.5rem 0 0' }}>
        Draw up your meme — watch it take shape on the right.
      </p>
      <p style={{ color: 'rgba(43,38,32,.75)', fontSize: '1.05rem', margin: '.25rem 0 0' }}>
        A real fair launch on the Robinhood Chain testnet. Every field below goes into the token contract.
      </p>

      <div className="create-grid">
        <form className="sketch shadow-rough" onSubmit={(e) => e.preventDefault()}
              style={{ position: 'relative', background: 'var(--paper2)', padding: '1.15rem', minWidth: 0 }}>
          <span className="pin" />
          <span className="tape caveat">testnet</span>

          <h2 className="marker" style={{ color: 'var(--forest)', fontSize: '1.35rem', margin: '.25rem 0 0' }}>Launch token</h2>
          <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.2rem', margin: '.15rem 0 0' }}>
            fill it in — this one really launches
          </p>

          <Field label="Name" count={`${name.length} / ${NAME_MAX}`}
                 hint={`Letters, numbers, and spaces. ${NAME_MAX} characters max.`}
                 error={nameBad ? 'Only letters, numbers and spaces are allowed.' : null}>
            <div className={`box sketch-2 shadow-rough-sm${nameBad ? ' bad' : ''}`} style={boxStyle(nameBad)}>
              <input className="bare" style={{ fontSize: '1.05rem' }} value={name} maxLength={NAME_MAX}
                     onChange={(e) => setName(e.target.value)} placeholder="Token name" spellCheck={false} />
            </div>
          </Field>

          <Field label="Ticker" count={`${symbol.length} / ${TICKER_MAX}`}
                 hint={`Letters and numbers. ${TICKER_MAX} characters max.`}
                 error={tickerBad ? 'Only letters and numbers are allowed.' : null}>
            <div className={`box sketch-2 shadow-rough-sm${tickerBad ? ' bad' : ''}`} style={{ ...boxStyle(tickerBad), ...row }}>
              <span className="marker" style={{ color: 'var(--brown)', fontSize: '1.05rem', flex: 'none' }}>$</span>
              <input className="bare" style={{ fontSize: '1.05rem' }} value={symbol} maxLength={TICKER_MAX}
                     onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="symbol" spellCheck={false} />
            </div>
          </Field>

          <Field label="Description" count={`${description.length} / ${DESC_MAX}`}
                 hint={`No links. ${DESC_MAX} characters max.`}
                 error={descBad ? 'Links are not allowed in the description.' : null}>
            <div className={`box sketch-2 shadow-rough-sm${descBad ? ' bad' : ''}`} style={boxStyle(descBad)}>
              <textarea className="bare" rows={3} style={{ fontSize: '.95rem', resize: 'vertical' }}
                        value={description} maxLength={DESC_MAX} onChange={(e) => setDescription(e.target.value)}
                        placeholder="A short description of the token" />
            </div>
          </Field>

          <div style={{ marginTop: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.5rem' }}>
              <span className="marker" style={{ fontSize: '.95rem' }}>Token image</span>
              <span className="caveat" style={{ color: 'var(--crayred)', fontSize: '1.05rem' }}>required</span>
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.6rem', marginTop: '.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                     style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
              <span className="check-box" aria-hidden><Icon name="check" strokeWidth={3.4} /></span>
              <span style={{ fontSize: '1rem', lineHeight: 1.35, color: 'rgba(43,38,32,.85)' }}>
                I understand that selected artwork will be moderated and uploaded to public IPFS.
              </span>
            </label>

            <label className={`drop${dragOver ? ' is-over' : ''}`} data-locked={consent ? 'false' : 'true'}
                   style={{ marginTop: '.6rem', padding: '1rem', textAlign: 'center' }}
                   onDragOver={(e) => { if (consent) { e.preventDefault(); setDragOver(true); } }}
                   onDragLeave={() => setDragOver(false)}
                   onDrop={(e) => { if (!consent) return; e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0] ?? null); }}>
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={!consent}
                     onChange={(e) => pick(e.target.files?.[0] ?? null)}
                     style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
              {!file ? (
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48,
                                 border: '2px solid var(--ink)', borderRadius: '50%', background: 'var(--paper2)', fontSize: '1.5rem' }}>
                    <Icon name="upload" />
                  </span>
                  <span className="marker" style={{ fontSize: '1.05rem' }}>
                    {consent ? 'Choose an image' : 'Confirm public upload first'}
                  </span>
                  <span style={{ fontSize: '.85rem', color: 'rgba(43,38,32,.6)' }}>
                    {consent ? 'PNG, JPG, GIF or WebP. Up to 4 MB.' : 'Tick the box above to pick artwork.'}
                  </span>
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '.75rem', textAlign: 'left' }}>
                  {preview && <img src={preview} alt="Selected artwork preview"
                                   style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 14, flex: 'none',
                                            border: '2.4px solid var(--ink)', background: 'var(--paper)' }} />}
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                    <span className="num" style={{ display: 'block', fontSize: '.85rem', color: 'rgba(43,38,32,.55)' }}>
                      {compactNum(file.size / 1024)} KB
                    </span>
                    <span className="caveat" style={{ display: 'block', color: 'var(--brown)', fontSize: '1.05rem', lineHeight: 1.2 }}>
                      pinned to IPFS when you launch
                    </span>
                  </span>
                </span>
              )}
            </label>

            {file && (
              <button type="button" className="sketch-2" onClick={() => setFile(null)}
                      style={{ marginTop: '.5rem', padding: '.15rem .6rem', fontSize: '.85rem', cursor: 'pointer',
                               background: 'var(--paper)', border: '2px solid var(--ink)' }}>
                Remove image
              </button>
            )}

            <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem', margin: '.5rem 0 0', lineHeight: 1.2 }}>
              the file stays in this browser until you launch — only then is it pinned, with its address written onto the token
            </p>
          </div>

          <div style={{ marginTop: '1.15rem', minWidth: 0 }}>
            <span className="marker" style={{ fontSize: '.95rem', display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
              <Icon name="web" /> Website
            </span>
            <div className="box sketch-2 shadow-rough-sm" style={{ ...boxStyle(), ...row, marginTop: '.35rem' }}>
              <span style={prefix}>https://</span>
              <input className="bare" style={{ fontSize: '.95rem' }} value={website} maxLength={80}
                     onChange={(e) => setWebsite(e.target.value.replace(/^https?:\/\//, ''))} placeholder="yourmeme.xyz" spellCheck={false} />
            </div>
            <p style={{ fontSize: '.82rem', color: 'rgba(43,38,32,.6)', margin: '.35rem 0 0' }}>Optional.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div style={{ minWidth: 0 }}>
              <span className="marker" style={{ fontSize: '.95rem', display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
                <Icon name="x" /> X profile
              </span>
              <div className="box sketch-2 shadow-rough-sm" style={{ ...boxStyle(), ...row, marginTop: '.35rem' }}>
                <span style={prefix}>x.com/</span>
                <input className="bare" style={{ fontSize: '.95rem' }} value={twitter} maxLength={30}
                       onChange={(e) => setTwitter(e.target.value.replace(/^@+/, ''))} placeholder="handle" spellCheck={false} />
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <span className="marker" style={{ fontSize: '.95rem', display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
                <Icon name="telegram" /> Telegram
              </span>
              <div className="box sketch-2 shadow-rough-sm" style={{ ...boxStyle(), ...row, marginTop: '.35rem' }}>
                <span style={prefix}>t.me/</span>
                <input className="bare" style={{ fontSize: '.95rem' }} value={telegram} maxLength={32}
                       onChange={(e) => setTelegram(e.target.value.replace(/^@+/, ''))} placeholder="community" spellCheck={false} />
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.5rem' }}>
              <span className="marker" style={{ fontSize: '.95rem' }}>Developer buy</span>
              <span className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem' }}>optional</span>
            </div>
            <div className="box sketch-2 shadow-rough-sm" style={{ ...row, padding: '.6rem .7rem', marginTop: '.35rem' }}>
              <input className="bare num marker" inputMode="decimal" style={{ fontSize: '1.4rem' }} value={devBuy}
                     onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" spellCheck={false} />
              <span className="marker sketch-2" style={{ background: 'var(--paper2)', padding: '.15rem .6rem', fontSize: '.8rem', flex: 'none' }}>ETH</span>
            </div>
            <p className="num" style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap',
                                        fontSize: '.85rem', margin: '.35rem 0 0' }}>
              <span>{devBuyNum > 0 ? `≈ ${Math.round(quoteLaunchBuy(devBuyNum)).toLocaleString('en-US')} ${symbol || 'tokens'}` : ' '}</span>
              <span style={{ color: 'rgba(43,38,32,.55)' }}>
                {balance ? `balance ${Number(formatEther(balance.value)).toFixed(5)} ETH` : ''}
              </span>
            </p>
            <p style={{ fontSize: '.82rem', color: 'rgba(43,38,32,.6)', margin: '.35rem 0 0', lineHeight: 1.35 }}>
              Bought in the same transaction as the launch, before anyone else can trade. Costs this much on top of the
              launch fee.
            </p>
          </div>

          <details className="knobs sketch-2 shadow-rough-sm" style={{ marginTop: '1.15rem', background: 'var(--paper)' }}>
            <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', padding: '.6rem .9rem' }}>
              <span className="marker" style={{ fontSize: '.95rem' }}>Advanced</span>
              <span style={{ fontSize: '.85rem', color: 'rgba(43,38,32,.55)', display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
                fee wallet <span className="knobs-chev" style={{ display: 'inline-flex', fontSize: '1.2rem' }}><Icon name="chevron" /></span>
              </span>
            </summary>
            <div style={{ padding: '.25rem .9rem 1rem', borderTop: '2px solid rgba(43,38,32,.15)' }}>
              <p style={{ fontSize: '1rem', color: 'rgba(43,38,32,.8)', margin: '.75rem 0 .25rem' }}>Fee recipient</p>
              <div className={`box sketch-2${feeBad ? ' bad' : ''}`} style={{ ...row, padding: '.4rem .7rem', boxShadow: 'none' }}>
                <input className="bare num" style={{ fontSize: '.95rem' }} value={feeWallet} maxLength={42}
                       onChange={(e) => setFeeWallet(e.target.value.trim())} placeholder="0x… (defaults to your wallet)" spellCheck={false} />
                <button type="button" className="marker sketch-2" onClick={() => address && setFeeWallet(address)}
                        style={{ background: 'var(--paper2)', border: '2px solid var(--ink)', padding: '.1rem .5rem',
                                 fontSize: '.75rem', cursor: 'pointer', flex: 'none' }}>Me</button>
              </div>
              {feeBad && <p style={{ fontSize: '.82rem', color: 'var(--crayred)', margin: '.15rem 0 0' }}>That is not a valid address.</p>}
              <p style={{ fontSize: '.82rem', color: 'rgba(43,38,32,.6)', margin: '.35rem 0 0', lineHeight: 1.35 }}>
                Who collects this token's share of every trade, and who receives the developer buy. Set it once here —
                afterwards only this wallet can move it.
              </p>

              <p style={{ fontSize: '1rem', color: 'rgba(43,38,32,.8)', margin: '1rem 0 .25rem' }}>Creator fee share</p>
              <div className="sketch-2" style={{ background: 'var(--paper2)', padding: '.5rem .7rem', display: 'grid', gap: '.25rem' }}>
                <Leader label="creator">{100 - LAUNCH.protocolFeeShare}%</Leader>
                <Leader label="protocol">{LAUNCH.protocolFeeShare}%</Leader>
              </div>
              <p style={{ fontSize: '.82rem', color: 'rgba(43,38,32,.6)', margin: '.35rem 0 0', lineHeight: 1.35 }}>
                Split by the locker contract on every claim. Fixed per token when it launches, so a later change to the
                platform's share never re-prices a token that already exists.
              </p>

              <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem', margin: '1rem 0 0', lineHeight: 1.2 }}>
                liquidity is locked at launch — nobody, including the platform, can pull it
              </p>
            </div>
          </details>

          <div style={{ marginTop: '1.15rem', paddingTop: '.9rem', borderTop: '2px solid rgba(43,38,32,.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1rem', color: 'rgba(43,38,32,.7)', display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
                <span style={{ color: 'var(--brown)', fontSize: '1.2rem', display: 'inline-flex' }}><Icon name="gas" /></span>
                Uniswap · ETH {formatEther(LAUNCH.fee)} due
              </span>
              <span className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem' }}>plus gas</span>
            </div>

            {isConnected ? (
              <button type="button" className="cta marker sketch-2 shadow-rough-sm" onClick={launch}
                      disabled={busy || Boolean(missing)}
                      style={{ width: '100%', marginTop: '.7rem', padding: '.65rem 1rem', fontSize: '1.15rem',
                               background: 'var(--mustard)', display: 'inline-flex', alignItems: 'center',
                               justifyContent: 'center', gap: '.5rem',
                               cursor: busy || missing ? 'default' : 'pointer' }}>
                {step ?? missing ?? 'Launch token'}
                {!step && !missing && <Icon name="arrow" strokeWidth={2.2} />}
              </button>
            ) : (
              <div style={{ marginTop: '.75rem' }}>
                <WalletButton label="Connect wallet to launch" full />
                {missing && (
                  <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.1rem', margin: '.4rem 0 0' }}>{missing}</p>
                )}
              </div>
            )}

            <p style={{ fontSize: '.75rem', color: 'rgba(43,38,32,.55)', textAlign: 'center', margin: '.75rem 0 0', lineHeight: 1.35 }}>
              This deploys a real token on the testnet. Your wallet will ask you to sign, and the launch fee is charged
              in testnet ETH.
            </p>

            {error && <p style={{ color: 'var(--crayred)', margin: '.75rem 0 0' }}>{error}</p>}
          </div>
        </form>

        <aside className="create-preview" style={{ minWidth: 0 }}>
          <div className="sketch-2 shadow-rough" style={{ position: 'relative', background: 'var(--paper2)', padding: '1.25rem', minWidth: 0 }}>
            <span className="pin" />
            <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.15rem', margin: '.25rem 0 0', lineHeight: 1 }}>live preview</p>

            <div className="sketch shadow-rough-sm" style={{ background: 'var(--paper)', marginTop: '.75rem', overflow: 'hidden' }}>
              <div style={{ position: 'relative', width: '100%', paddingTop: '100%' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {preview ? (
                    <img src={preview} alt="Token artwork preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem', color: 'rgba(43,38,32,.4)' }}>
                      <span style={{ fontSize: '3rem', display: 'inline-flex' }}><Icon name="image" /></span>
                      <span style={{ fontSize: '.85rem' }}>no artwork yet</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <h2 className="marker" style={{ color: 'var(--forest)', fontSize: '1.4rem', margin: '1rem 0 0', lineHeight: 1.15, wordBreak: 'break-word' }}>
              {name.trim() || 'Your token'}
            </h2>
            <p style={{ color: 'var(--brown)', fontSize: '1.05rem', margin: '.25rem 0 0', lineHeight: 1, wordBreak: 'break-word' }}>
              {symbol ? `$${symbol}` : 'ticker'}
            </p>

            <div style={{ display: 'grid', gap: '.35rem', marginTop: '1rem', fontSize: '.85rem' }}>
              <Leader label="Launch fee">{formatEther(LAUNCH.fee)} ETH</Leader>
              <div>
                <span style={{ color: 'rgba(43,38,32,.7)' }}>Trading fees</span>
                <span className="num" style={{ display: 'block' }}>
                  {100 - LAUNCH.protocolFeeShare}% creator / {LAUNCH.protocolFeeShare}% platform
                </span>
              </div>
              <Leader label="Graduation">{formatEther(LAUNCH.graduationThreshold)} ETH</Leader>
              <Leader label="Liquidity">
                <span style={{ color: 'var(--forest)', display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                  <Icon name="lock" /> Locked
                </span>
              </Leader>
            </div>

            <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem', margin: '.5rem 0 0', lineHeight: 1.2 }}>
              testnet coins — real contract, no real money
            </p>

            {devBuyNum > 0 && (
              <div className="sketch-2" style={{ background: 'var(--paper)', padding: '.4rem .7rem', marginTop: '1rem', fontSize: '.85rem' }}>
                <Leader label="Developer buy"><span className="marker">{devBuy} ETH</span></Leader>
              </div>
            )}

            {description.trim() && (
              <div style={{ marginTop: '1rem' }}>
                <p className="marker" style={{ color: 'var(--forest)', fontSize: '1.05rem', margin: 0 }}>About</p>
                <p style={{ fontSize: '1rem', lineHeight: 1.35, color: 'rgba(43,38,32,.85)', margin: '.25rem 0 0',
                            whiteSpace: 'pre-line', wordBreak: 'break-word' }}>{description.trim()}</p>
              </div>
            )}

            {socialsShown && (
              <div style={{ marginTop: '1rem' }}>
                <p className="marker" style={{ color: 'var(--forest)', fontSize: '1.05rem', margin: 0 }}>Socials</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '.5rem' }}>
                  {twitter && <span className="chip sketch-2" style={{ background: 'var(--paper)', fontSize: '.8rem' }}><Icon name="x" /> x.com/{twitter}</span>}
                  {telegram && <span className="chip sketch-2" style={{ background: 'var(--paper)', fontSize: '.8rem' }}><Icon name="telegram" /> t.me/{telegram}</span>}
                  {website && <span className="chip sketch-2" style={{ background: 'var(--paper)', fontSize: '.8rem' }}><Icon name="web" /> {website}</span>}
                </div>
                <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem', margin: '.5rem 0 0', lineHeight: 1.2 }}>
                  stored on the token itself, for anyone to read
                </p>
              </div>
            )}

            <p style={{ fontSize: '.75rem', color: 'rgba(43,38,32,.55)', margin: '1rem 0 0', lineHeight: 1.35 }}>
              A preview of the listing. The name, ticker, description, links and artwork all go public when you launch —
              the first four into the token contract, the image onto IPFS with its address stored alongside them.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
