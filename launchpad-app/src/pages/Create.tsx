import { useState } from 'react';
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseEther, formatEther, keccak256, toHex, isAddress, type Address } from 'viem';
import { DEPLOYMENT, LAUNCH } from '../lib/chain';
import { factoryAbi } from '../lib/abi';

/* Every pool opens at the same tick, so what a launch buy returns is known
   before the pool exists — 1.0001^tick less the pool fee. Checked against real
   testnet buys it lands within 0.11%. Price impact is not modelled. */
function quoteLaunchBuy(eth: number) {
  if (!(eth > 0)) return 0;
  return eth * Math.pow(1.0001, Math.abs(LAUNCH.initialTick)) * (1 - LAUNCH.poolFee / 1e6);
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
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<Address | null>(null);

  const { writeContractAsync } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isMining } = useWaitForTransactionReceipt({ hash });

  const feeBad = feeWallet.length > 0 && !isAddress(feeWallet);
  const missing = !name.trim() ? 'Add a name' : !symbol.trim() ? 'Add a ticker' : feeBad ? 'Fix the fee recipient' : null;
  const busy = Boolean(step) || isMining;

  async function launch() {
    setError(null);
    setLaunched(null);
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
      setLaunched((log?.topics?.[1] ? (`0x${log.topics[1].slice(26)}` as Address) : null));
      setStep(null);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? 'The launch failed.');
      setStep(null);
    }
  }

  const field = { width: '100%', border: 0, background: 'transparent', font: 'inherit', fontSize: '1.05rem', outline: 'none' } as const;
  const box = { background: 'var(--paper)', padding: '.5rem .7rem', marginTop: '.25rem' } as const;

  return (
    <div style={{ maxWidth: '46rem', margin: '0 auto' }}>
      <a href="/launchpad/" className="marker" style={{ display: 'inline-block', marginTop: '1.25rem', textDecoration: 'none' }}>← Back to the board</a>
      <h1 className="marker" style={{ color: 'var(--forest)', fontSize: '2rem', margin: '.75rem 0 0' }}>Launch a token</h1>
      <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.2rem', margin: '.2rem 0 0' }}>
        this really deploys — on the testnet
      </p>

      <div className="sketch shadow-rough" style={{ background: 'var(--paper2)', padding: '1.25rem', marginTop: '1.25rem', display: 'grid', gap: '1rem' }}>
        <label>Name
          <div className="sketch-2" style={box}><input style={field} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Sherwood Shiba" /></div>
        </label>

        <label>Ticker
          <div className="sketch-2" style={box}>
            <input style={field} value={symbol} maxLength={10}
                   onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} placeholder="SHIBA" />
          </div>
        </label>

        <label>Description
          <div className="sketch-2" style={box}>
            <textarea style={{ ...field, resize: 'vertical', minHeight: '3.5rem' }} value={description} maxLength={280}
                      onChange={(e) => setDescription(e.target.value)} placeholder="What is it?" />
          </div>
        </label>

        <label>Artwork
          <div className="sketch-2" style={box}>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp"
                   onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ font: 'inherit' }} />
          </div>
          <small style={{ color: 'rgba(43,38,32,.6)' }}>Pinned to IPFS, address stored on the token. Up to 2 MB.</small>
        </label>

        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
          <label>Website
            <div className="sketch-2" style={{ ...box, display: 'flex', gap: '.3rem' }}>
              <span style={{ color: 'rgba(43,38,32,.5)' }}>https://</span>
              <input style={field} value={website} onChange={(e) => setWebsite(e.target.value.replace(/^https?:\/\//, ''))} placeholder="yourmeme.xyz" />
            </div>
          </label>
          <label>Telegram
            <div className="sketch-2" style={{ ...box, display: 'flex', gap: '.3rem' }}>
              <span style={{ color: 'rgba(43,38,32,.5)' }}>t.me/</span>
              <input style={field} value={telegram} onChange={(e) => setTelegram(e.target.value.replace(/^@+/, ''))} placeholder="community" />
            </div>
          </label>
          <label>X
            <div className="sketch-2" style={{ ...box, display: 'flex', gap: '.3rem' }}>
              <span style={{ color: 'rgba(43,38,32,.5)' }}>x.com/</span>
              <input style={field} value={twitter} onChange={(e) => setTwitter(e.target.value.replace(/^@+/, ''))} placeholder="handle" />
            </div>
          </label>
        </div>

        <label>Developer buy (optional)
          <div className="sketch-2" style={{ ...box, display: 'flex', gap: '.5rem' }}>
            <input className="num" style={field} inputMode="decimal" value={devBuy}
                   onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.0" />
            <span style={{ color: 'rgba(43,38,32,.5)' }}>ETH</span>
          </div>
          <small className="num" style={{ color: 'rgba(43,38,32,.6)' }}>
            {devBuy && Number(devBuy) > 0
              ? `≈ ${Math.round(quoteLaunchBuy(Number(devBuy))).toLocaleString('en-US')} ${symbol || 'tokens'}`
              : 'Bought inside the launch, before anyone else can trade.'}
            {balance ? ` · balance ${Number(formatEther(balance.value)).toFixed(5)} ETH` : ''}
          </small>
        </label>

        <label>Fee recipient
          <div className="sketch-2" style={{ ...box, display: 'flex', gap: '.5rem', borderColor: feeBad ? 'var(--crayred)' : undefined }}>
            <input className="num" style={field} value={feeWallet} maxLength={42}
                   onChange={(e) => setFeeWallet(e.target.value.trim())} placeholder="0x… (defaults to your wallet)" />
            <button className="num" onClick={() => address && setFeeWallet(address)}
                    style={{ border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--paper2)', cursor: 'pointer', padding: '0 .6rem' }}>me</button>
          </div>
          <small style={{ color: feeBad ? 'var(--crayred)' : 'rgba(43,38,32,.6)' }}>
            {feeBad ? 'That is not a valid address.' : "Collects this token's 70% of every trade. Only settable at launch."}
          </small>
        </label>

        <div style={{ borderTop: '2px solid rgba(43,38,32,.15)', paddingTop: '1rem' }}>
          <p className="num" style={{ margin: 0, color: 'rgba(43,38,32,.7)' }}>
            Launch fee {formatEther(LAUNCH.fee)} ETH · plus gas
          </p>
          {isConnected ? (
            <button className="marker sketch-2 shadow-rough-sm" onClick={launch} disabled={busy || Boolean(missing)}
                    style={{ width: '100%', marginTop: '.6rem', padding: '.8rem', fontSize: '1.2rem',
                             background: (busy || missing) ? 'var(--paper)' : 'var(--mustard)',
                             cursor: (busy || missing) ? 'default' : 'pointer', opacity: (busy || missing) ? .6 : 1 }}>
              {step ?? missing ?? 'Launch token'}
            </button>
          ) : (
            <div style={{ marginTop: '.6rem' }}><ConnectButton label="Connect wallet to launch" /></div>
          )}
        </div>

        {error && <p style={{ color: 'var(--crayred)', margin: 0 }}>{error}</p>}
        {launched && (
          <p style={{ margin: 0, color: 'var(--forest)' }}>
            Launched. <a href={`/launchpad-next/token?id=${launched}`}>Open the token page →</a>
          </p>
        )}
      </div>
    </div>
  );
}
