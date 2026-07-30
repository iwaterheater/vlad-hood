import type { Swap } from '../lib/useSwaps';
import { compactNum, ago } from '../lib/format';

/** The pool's swap log as a table. It sits under the chart rather than behind a
 *  tab: the chart draws these very trades, so hiding one to show the other made
 *  the reader flip back and forth between two halves of the same story. */
export default function TradesTable({ swaps, symbol }: { swaps: Swap[]; symbol: string }) {
  return (
    <section className="sketch shadow-rough" style={{ background: 'var(--paper2)', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
        <h2 className="marker" style={{ color: 'var(--forest)', fontSize: '1.4rem', margin: 0 }}>Recent Trades</h2>
        <p className="num" style={{ color: 'rgba(43,38,32,.7)', margin: 0 }}>
          {swaps.length} trade{swaps.length === 1 ? '' : 's'}
        </p>
      </div>

      {!swaps.length && <p style={{ color: 'rgba(43,38,32,.6)', margin: '.5rem 0 0' }}>No trades yet.</p>}

      {swaps.length > 0 && (
        <div className="scroll-x" style={{ marginTop: '.75rem' }}>
          <table style={{ width: '100%', minWidth: '26rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr className="caveat" style={{ color: 'var(--brown)', fontSize: '1.15rem', textAlign: 'left' }}>
                <th style={{ fontWeight: 400, padding: '.15rem .5rem .15rem 0' }}>side</th>
                <th style={{ fontWeight: 400, padding: '.15rem .5rem .15rem 0' }}>ETH</th>
                <th style={{ fontWeight: 400, padding: '.15rem .5rem .15rem 0' }}>{symbol}</th>
                <th style={{ fontWeight: 400, padding: '.15rem 0', textAlign: 'right' }}>when</th>
              </tr>
            </thead>
            <tbody className="num" style={{ fontSize: '.9rem' }}>
              {[...swaps].reverse().slice(0, 30).map((s, i) => (
                <tr key={s.tx + i} style={{ borderTop: '1px dotted rgba(43,38,32,.25)' }}>
                  <td style={{ padding: '.35rem .5rem .35rem 0', color: s.side === 'buy' ? 'var(--forest2)' : 'var(--crayred)' }}>{s.side}</td>
                  <td style={{ padding: '.35rem .5rem .35rem 0' }}>{s.eth.toFixed(5)}</td>
                  <td style={{ padding: '.35rem .5rem .35rem 0' }}>{compactNum(s.tokens)}</td>
                  <td style={{ padding: '.35rem 0', textAlign: 'right', color: 'rgba(43,38,32,.6)' }}>{ago(s.t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
