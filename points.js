/* ============================================================
   Vladhood Points (VP) — on-chain loyalty scoring.

   Every swap made on this site pays a 1% integrator fee to our fee
   wallet, which makes site swaps identifiable on-chain. Points are
   therefore derived straight from the chain: no backend, no database,
   and anyone can verify the numbers themselves.

   Scoring
     1 VP per $1 of swap volume
     x2 multiplier on buys
     +10 VP for the first swap of each day
     +500 VP for every full 7-day streak of daily swaps

   Mounts into: .vlad-points (personal card) and .vlad-leaderboard.
   ============================================================ */
(function () {
  'use strict';

  var RPC = 'https://rpc.mainnet.chain.robinhood.com';
  var VLAD = '0x92D176ccBeEffeCd8089e841D09ea17b6C22D969';
  var FEE_WALLET = '0xcdbc2623bf8481f88eac55ec8a2faf70054ead54';
  var TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  var PAIR = '0xac870e97FC1FE981F4D887e5f453203745A15EF4';
  var EXPLORER = 'https://robinhoodchain.blockscout.com';
  var FEE_RATE = 100;               /* fee is 1% => volume = fee * 100 */

  var RULES = { perUsd: 1, buyMultiplier: 2, dailyBonus: 10, streakDays: 7, streakBonus: 500 };

  var SLOT0 = '0x3850c7bd';         /* UniswapV3Pool.slot0() */
  var Q96 = BigInt(2) ** BigInt(96);
  var RATE_KEY = 'vlad_rates';      /* block -> VLAD per ETH, immutable once written */

  function readRateCache() { try { return JSON.parse(localStorage.getItem(RATE_KEY) || '{}'); } catch (e) { return {}; } }
  function writeRateCache(o) { try { localStorage.setItem(RATE_KEY, JSON.stringify(o)); } catch (e) {} }

  /* ---------- styles ---------- */
  if (!document.getElementById('vlad-points-css')) {
    var st = document.createElement('style'); st.id = 'vlad-points-css';
    st.textContent = [
      '.vp{font-family:"Patrick Hand",cursive;color:#2b2620;width:100%}',
      '.vp-head{font-family:"Permanent Marker",cursive;font-size:21px;display:flex;align-items:center;gap:9px;margin-bottom:12px}',
      '.vp-me{display:flex;align-items:center;gap:16px;background:#ece3cf;border-radius:16px;padding:14px 16px;flex-wrap:wrap}',
      '.vp-total{font-family:"Permanent Marker",cursive;font-size:34px;color:#2f6b2f;line-height:1}',
      '.vp-total small{font-size:16px;color:#8a5a2b;margin-left:5px}',
      '.vp-meta{display:flex;gap:18px;flex-wrap:wrap;margin-left:auto;text-align:right}',
      '.vp-meta div{font-size:14px;color:#8a5a2b}',
      '.vp-meta b{display:block;font-family:"Permanent Marker",cursive;font-size:19px;color:#2b2620}',
      '.vp-hint{font-size:15px;color:#8a5a2b;text-align:center;padding:16px}',
      '.vp-rules{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}',
      '.vp-rule{font-size:13px;background:#ece3cf;border:1px solid rgba(43,38,32,.14);border-radius:10px;padding:4px 10px;color:#5f5647}',
      '.vp-rule b{color:#2f6b2f}',
      '.vp-list{display:flex;flex-direction:column;gap:6px;max-height:540px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#c3b795 transparent;padding-right:4px}',
      '.vp-list::-webkit-scrollbar{width:7px}',
      '.vp-list::-webkit-scrollbar-track{background:transparent}',
      '.vp-list::-webkit-scrollbar-thumb{background:#c3b795;border-radius:99px}',
      '.vp-list::-webkit-scrollbar-thumb:hover{background:#a8996f}',
      '.vp-row{display:flex;align-items:center;gap:10px;padding:9px 11px;background:#ece3cf;border-radius:12px;font-size:15px;text-decoration:none;color:#2b2620}',
      '.vp-row:hover{background:#e4d9bf}',
      '.vp-row.mine{background:#2f6b2f;color:#f4ecd8}',
      '.vp-row.mine .vp-addr,.vp-row.mine .vp-sub{color:#dfe9d5}',
      '.vp-rank{font-family:"Permanent Marker",cursive;font-size:15px;width:30px;flex:none;color:#8a5a2b}',
      '.vp-row.mine .vp-rank{color:#e0a51e}',
      '.vp-addr{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vp-sub{font-size:12px;color:#8a5a2b}',
      '.vp-score{font-family:"Permanent Marker",cursive;font-size:16px;color:#2f6b2f;flex:none}',
      '.vp-row.mine .vp-score{color:#f4ecd8}',
      '.vp-empty{color:#8a5a2b;font-size:15px;text-align:center;padding:22px}'
    ].join('');
    document.head.appendChild(st);
  }

  /* ---------- helpers ---------- */
  function rpc(method, params) {
    return fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }) })
      .then(function (r) { return r.json(); }).then(function (j) { return j.result; });
  }
  function rpcBatch(calls) {
    if (!calls.length) return Promise.resolve([]);
    return fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(calls) })
      .then(function (r) { return r.json(); })
      .then(function (arr) { return Array.isArray(arr) ? arr : []; });
  }
  function shortAddr(a) { return a.slice(0, 6) + '…' + a.slice(-4); }
  function dayKey(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate(); }
  function fmtVp(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return Math.round(n).toLocaleString('en-US');
    return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  /* ---------- gather every swap made through this site ---------- */
  var cache = { swaps: null, at: 0 };

  async function prices() {
    var vlad = 0, eth = 0;
    try {
      var d = await fetch('https://api.dexscreener.com/latest/dex/pairs/robinhood/' + PAIR).then(function (r) { return r.json(); });
      var p = d.pair || (d.pairs && d.pairs[0]);
      if (p) { vlad = parseFloat(p.priceUsd) || 0; var pn = parseFloat(p.priceNative) || 0; eth = pn > 0 ? vlad / pn : 0; }
    } catch (e) {}
    return { vlad: vlad, eth: eth };
  }

  async function collectSwaps() {
    if (cache.swaps && Date.now() - cache.at < 60000) return cache.swaps;
    var px = await prices();
    var raw = [];                                     /* {tx, side, eth?, vlad?} */

    /* sells — 1% fee arrives as VLAD. Served by Blockscout's log index: the
       public RPC caps eth_getLogs at a couple thousand blocks. */
    try {
      var feeTopic = '0x' + FEE_WALLET.replace(/^0x/, '').padStart(64, '0');
      var lu = EXPLORER + '/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=' + VLAD +
        '&topic0=' + TRANSFER + '&topic2=' + feeTopic + '&topic0_2_opr=and';
      var lj = await fetch(lu).then(function (r) { return r.json(); });
      (Array.isArray(lj.result) ? lj.result : []).forEach(function (l) {
        raw.push({
          tx: l.transactionHash, side: 'sell',
          vlad: (Number(BigInt(l.data)) / 1e18) * FEE_RATE,
          block: l.blockNumber, ts: parseInt(l.timeStamp, 16) * 1000
        });
      });
    } catch (e) {}

    /* buys — 1% fee arrives as native ETH */
    try {
      var bs = await fetch(EXPLORER + '/api/v2/addresses/' + FEE_WALLET + '/internal-transactions').then(function (r) { return r.json(); });
      (bs.items || []).forEach(function (t) {
        if ((t.to && t.to.hash || '').toLowerCase() !== FEE_WALLET) return;
        var v = Number(t.value || 0) / 1e18; if (v <= 0) return;
        raw.push({ tx: t.transaction_hash, side: 'buy', eth: v * FEE_RATE });
      });
    } catch (e) {}

    /* dedupe by tx */
    var byTx = {}; raw.forEach(function (r) { if (r.tx && !byTx[r.tx]) byTx[r.tx] = r; });
    var list = Object.keys(byTx).map(function (k) { return byTx[k]; });
    if (!list.length) { cache = { swaps: [], at: Date.now() }; return []; }

    /* who swapped + when — batched, 60 calls at a time */
    var swaps = [], blockNeed = {};
    for (var i = 0; i < list.length; i += 60) {
      var chunk = list.slice(i, i + 60);
      var res = await rpcBatch(chunk.map(function (c, n) { return { jsonrpc: '2.0', id: n, method: 'eth_getTransactionByHash', params: [c.tx] }; }));
      res.forEach(function (r) {
        if (!r || !r.result) return;
        var item = chunk[r.id]; if (!item) return;
        item.who = (r.result.from || '').toLowerCase();
        item.block = r.result.blockNumber;
        if (item.block) blockNeed[item.block] = 1;
      });
      swaps = swaps.concat(chunk.filter(function (c) { return c.who; }));
    }

    /* block timestamps — batched */
    var blocks = Object.keys(blockNeed), tsOf = {};
    for (var b = 0; b < blocks.length; b += 60) {
      var bc = blocks.slice(b, b + 60);
      var br = await rpcBatch(bc.map(function (h, n) { return { jsonrpc: '2.0', id: n, method: 'eth_getBlockByNumber', params: [h, false] }; }));
      br.forEach(function (r) { if (r && r.result) tsOf[bc[r.id]] = parseInt(r.result.timestamp, 16) * 1000; });
    }
    swaps.forEach(function (s) { s.ts = tsOf[s.block] || s.ts || Date.now(); });   /* sell logs already carry their timestamp */

    /* historical VLAD/ETH rate straight from the pool at the swap's own block,
       so a sell is scored at the price it actually traded at, not today's */
    var needRate = swaps.filter(function (s) { return s.side === 'sell' && s.block; });
    var rateOf = readRateCache();
    var missing = needRate.filter(function (s) { return !rateOf[s.block]; });
    for (var r0 = 0; r0 < missing.length; r0 += 40) {
      var rc = missing.slice(r0, r0 + 40);
      var rr = await rpcBatch(rc.map(function (s, n) { return { jsonrpc: '2.0', id: n, method: 'eth_call', params: [{ to: PAIR, data: SLOT0 }, s.block] }; }));
      rr.forEach(function (res) {
        if (!res || !res.result || res.result.length < 66) return;
        var item = rc[res.id]; if (!item) return;
        var sqrtP = BigInt('0x' + res.result.slice(2, 66));
        if (sqrtP <= 0n) return;
        /* pool: token0 = WETH, token1 = VLAD -> (sqrtP/2^96)^2 = VLAD per ETH */
        var vladPerEth = Number(sqrtP * sqrtP * 1000000n / (Q96 * Q96)) / 1000000;
        if (vladPerEth > 0) rateOf[item.block] = vladPerEth;
      });
    }
    writeRateCache(rateOf);

    swaps.forEach(function (s) {
      if (s.side === 'buy') { s.eth = s.eth || 0; }
      else {
        var rate = rateOf[s.block];
        s.eth = rate ? (s.vlad / rate) : ((s.vlad || 0) * px.vlad) / (px.eth || 1);  /* fallback: today's rate */
        s.priced = !!rate;
      }
      s.usd = (s.eth || 0) * px.eth;      /* ETH volume is fixed on-chain; only the ETH/USD leg is live */
    });

    cache = { swaps: swaps, at: Date.now() };
    return swaps;
  }

  /* ---------- scoring ---------- */
  function score(swaps) {
    var users = {};
    swaps.forEach(function (s) {
      if (!s.who) return;
      var u = users[s.who] || (users[s.who] = { addr: s.who, volume: 0, swaps: 0, buys: 0, days: {}, volumePts: 0 });
      var pts = (s.usd || 0) * RULES.perUsd * (s.side === 'buy' ? RULES.buyMultiplier : 1);
      u.volumePts += pts; u.volume += (s.usd || 0); u.swaps++; if (s.side === 'buy') u.buys++;
      u.days[dayKey(s.ts)] = 1;
    });
    return Object.keys(users).map(function (k) {
      var u = users[k];
      var dayList = Object.keys(u.days).sort(function (a, b) { return new Date(a) - new Date(b); });
      u.activeDays = dayList.length;
      /* longest run of consecutive days */
      var best = 0, run = 0, prev = null;
      dayList.forEach(function (d) {
        var t = new Date(d + ' UTC').getTime();
        run = (prev !== null && Math.round((t - prev) / 86400000) === 1) ? run + 1 : 1;
        if (run > best) best = run;
        prev = t;
      });
      u.streak = best;
      u.dailyPts = u.activeDays * RULES.dailyBonus;
      u.streakPts = Math.floor(best / RULES.streakDays) * RULES.streakBonus;
      u.total = u.volumePts + u.dailyPts + u.streakPts;
      return u;
    }).sort(function (a, b) { return b.total - a.total; });
  }

  /* ---------- rendering ---------- */
  var myAccount = null, boards = [], cards = [];

  function rulesHtml() {
    return '<div class="vp-rules">' +
      '<span class="vp-rule"><b>1 VP</b> per $1 swapped</span>' +
      '<span class="vp-rule"><b>x2</b> on buys</span>' +
      '<span class="vp-rule"><b>+10 VP</b> first swap of the day</span>' +
      '<span class="vp-rule"><b>+500 VP</b> for a 7-day streak</span>' +
      '</div>';
  }

  function renderCard(el, ranked) {
    var me = myAccount ? ranked.filter(function (u) { return u.addr === myAccount; })[0] : null;
    var rank = me ? (ranked.indexOf(me) + 1) : 0;
    var body;
    if (!myAccount) {
      body = '<div class="vp-hint">Connect your wallet to see your Vladhood Points.</div>';
    } else if (!me) {
      body = '<div class="vp-hint">No swaps yet from ' + shortAddr(myAccount) + ' — make your first swap to start earning VP.</div>';
    } else {
      body = '<div class="vp-me"><div><div class="vp-total">' + fmtVp(me.total) + '<small>VP</small></div>' +
        '<div class="vp-sub">' + shortAddr(me.addr) + '</div></div>' +
        '<div class="vp-meta">' +
          '<div>rank<b>#' + rank + '</b></div>' +
          '<div>swaps<b>' + me.swaps + '</b></div>' +
          '<div>streak<b>' + me.streak + 'd</b></div>' +
        '</div></div>';
    }
    el.innerHTML = '<div class="vp"><div class="vp-head">Your Points</div>' + body + rulesHtml() + '</div>';
  }

  function renderBoard(el, ranked) {
    var rows = ranked.slice(0, 25).map(function (u, i) {
      var mine = myAccount && u.addr === myAccount;
      var medal = i === 0 ? '1' : (i === 1 ? '2' : (i === 2 ? '3' : (i + 1)));
      return '<a class="vp-row' + (mine ? ' mine' : '') + '" target="_blank" rel="noopener" href="' + EXPLORER + '/address/' + u.addr + '">' +
        '<span class="vp-rank">#' + medal + '</span>' +
        '<span class="vp-addr">' + shortAddr(u.addr) + (mine ? ' (you)' : '') +
          '<span class="vp-sub"> · ' + u.swaps + ' swaps · ' + u.streak + 'd streak</span></span>' +
        '<span class="vp-score">' + fmtVp(u.total) + '</span></a>';
    }).join('');
    el.innerHTML = '<div class="vp"><div class="vp-head">Leaderboard</div>' +
      '<div class="vp-list">' + (rows || '<div class="vp-empty">no swaps yet — be the first!</div>') + '</div></div>';
  }

  async function refresh() {
    try {
      var ranked = score(await collectSwaps());
      cards.forEach(function (el) { renderCard(el, ranked); });
      boards.forEach(function (el) { renderBoard(el, ranked); });
    } catch (e) {
      if (window.console) console.error('[VP]', e);
      boards.forEach(function (el) { el.innerHTML = '<div class="vp"><div class="vp-head">Leaderboard</div><div class="vp-empty">couldn\'t load points</div></div>'; });
    }
  }

  /* the swap panel announces the connected wallet */
  window.addEventListener('vlad:account', function (e) {
    myAccount = e.detail ? String(e.detail).toLowerCase() : null;
    refresh();
  });

  function init() {
    cards = [].slice.call(document.querySelectorAll('.vlad-points'));
    boards = [].slice.call(document.querySelectorAll('.vlad-leaderboard'));
    if (!cards.length && !boards.length) return;
    cards.forEach(function (el) { el.innerHTML = '<div class="vp"><div class="vp-head">Your Points</div><div class="vp-hint">loading…</div></div>'; });
    boards.forEach(function (el) { el.innerHTML = '<div class="vp"><div class="vp-head">Leaderboard</div><div class="vp-empty">loading…</div></div>'; });
    if (window.VLAD_ACCOUNT) myAccount = String(window.VLAD_ACCOUNT).toLowerCase();
    refresh();
    setInterval(refresh, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
