/* ============================================================
   VLADHOOD custom swap — vanilla JS on the LI.FI Quote API.
   UI mimics the LI.FI widget (Exchange / From→To / Send / Receive),
   but talks to the API directly so routes always resolve.
   Mounts into every element with class "vlad-swap".
   ============================================================ */
(function () {
  'use strict';

  var LIFI = 'https://li.quest/v1';
  var CHAIN = 4663, CHAIN_HEX = '0x1237';           /* Robinhood Chain */
  var NATIVE = '0x0000000000000000000000000000000000000000';
  var VLAD = '0x92D176ccBeEffeCd8089e841D09ea17b6C22D969';
  var INTEGRATOR = 'vladhood', FEE = '0.01', SLIPPAGE = '0.03';
  var FEE_WALLET = '0xcdbc2623Bf8481F88EAc55ec8a2Faf70054eAd54'; /* placeholder for pre-connect estimates */
  var CHART = 'https://dexscreener.com/robinhood/0xac870e97fc1fe981f4d887e5f453203745a15ef4';
  var VLAD_IMG = 'https://vlad-hood.xyz/photo_1_2026-07-21_06-14-24.jpg?v=2';

  var ETH_IC = '<img src="https://vlad-hood.xyz/eth.png" alt="" width="26" height="26" style="border-radius:50%;display:block"/>';
  var VLAD_IC = '<img src="' + VLAD_IMG + '" alt="" width="26" height="26" style="border-radius:50%;display:block;object-fit:cover"/>';
  var BADGE = '<span class="vs-badge"><img src="https://vlad-hood.xyz/robinhood.svg" alt=""/></span>';
  var WALLET_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="#2b2620" stroke-width="1.7"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M16 12h.5" stroke-width="2.4" stroke-linecap="round"/></svg>';
  var DISC_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="#c0392b" stroke-width="1.9" stroke-linecap="round"><path d="M18.4 6.4a9 9 0 1 1-12.8 0"/><path d="M12 2.5v8"/></svg>';

  /* ---------- styles ---------- */
  if (!document.getElementById('vlad-swap-css')) {
    var s = document.createElement('style'); s.id = 'vlad-swap-css';
    s.textContent = [
      '.vs{font-family:"Patrick Hand",cursive;color:#2b2620;max-width:440px;margin:0 auto;position:relative}',
      '.vs *{box-sizing:border-box}',
      '.vs-top{display:flex;justify-content:flex-end;margin-bottom:6px}',
      '.vs-connect{display:inline-flex;align-items:center;gap:7px;background:none;border:0;cursor:pointer;font-family:"Patrick Hand",cursive;font-size:16px;color:#2b2620}',
      '.vs-connect svg{width:22px;height:22px}',
      '.vs-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}',
      '.vs-title{font-family:"Permanent Marker",cursive;font-size:26px;color:#2b2620}',
      '.vs-gear{opacity:.7}',
      '.vs-ft{display:flex;align-items:stretch;gap:6px;margin-bottom:10px;position:relative}',
      '.vs-ftbox{flex:1;min-width:0;background:#ece3cf;border-radius:16px;padding:12px 14px}',
      '.vs-ftlbl{font-size:14px;color:#8a5a2b;margin-bottom:8px}',
      '.vs-tok{display:flex;align-items:center;gap:9px}',
      '.vs-ic{position:relative;flex:none;width:26px;height:26px}',
      '.vs-ic .vs-badge{position:absolute;right:-4px;bottom:-4px;width:15px;height:15px;border-radius:50%;overflow:hidden;border:2px solid #ece3cf;background:#ccff00}',
      '.vs-ic .vs-badge img{width:100%;height:100%;display:block}',
      '.vs-tsym{font-family:"Permanent Marker",cursive;font-size:17px;line-height:1}',
      '.vs-tchain{font-size:12px;color:#8a5a2b;margin-top:2px}',
      '.vs-flip{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:32px;height:32px;border-radius:50%;background:#f4ecd8;border:1.5px solid rgba(43,38,32,.25);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;color:#2f6b2f;z-index:2}',
      '.vs-flip:hover{background:#fff}',
      '.vs-box{background:#ece3cf;border-radius:16px;padding:12px 14px;margin-bottom:10px}',
      '.vs-lbl{font-size:14px;color:#8a5a2b}',
      '.vs-sendhead{display:flex;align-items:center;justify-content:space-between}',
      '.vs-bal{font-size:13px;color:#8a5a2b;cursor:pointer}',
      '.vs-bal:hover{color:#2f6b2f}',
      '.vs-pcts{display:flex;gap:5px;margin-left:auto}',
      '.vs-pct{font-family:"Patrick Hand",cursive;font-size:13px;padding:2px 9px;border-radius:10px;background:#e0d6bd;border:1px solid rgba(43,38,32,.15);cursor:pointer;color:#2b2620;user-select:none}',
      '.vs-pct:hover{background:#2f6b2f;color:#f4ecd8}',
      '.vs-slip{display:flex;align-items:center;justify-content:space-between;margin:0 2px 12px;font-size:14px;color:#8a5a2b}',
      '.vs-slip-opts{display:flex;gap:5px}',
      '.vs-slip-opt{font-family:"Patrick Hand",cursive;font-size:13px;padding:2px 9px;border-radius:10px;background:#ece3cf;border:1px solid rgba(43,38,32,.15);cursor:pointer;color:#2b2620}',
      '.vs-slip-opt.on{background:#2f6b2f;color:#f4ecd8;border-color:#2f6b2f}',
      '.vs-line{display:flex;align-items:center;gap:11px;margin-top:5px}',
      '.vs-amt{flex:1;min-width:0;font-size:28px;font-family:"Patrick Hand",cursive;background:transparent;border:0;outline:none;color:#2b2620}',
      '.vs-out{flex:1;min-width:0;font-size:26px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#2b2620}',
      '.vs-out.muted{color:#a99e86}',
      '.vs-sub{font-size:13px;color:#8a5a2b;margin-top:4px;min-height:16px;display:flex;align-items:center;gap:6px}',
      '.vs-spin{width:16px;height:16px;border:2.5px solid rgba(47,107,47,.25);border-top-color:#2f6b2f;border-radius:50%;animation:vsspin .7s linear infinite;display:none}',
      '.vs-spin.on{display:inline-block}',
      '@keyframes vsspin{to{transform:rotate(360deg)}}',
      '.vs-btn{width:100%;padding:14px 0;font-family:"Permanent Marker",cursive;font-size:20px;color:#f4ecd8;background:#2f6b2f;border:0;border-radius:16px;cursor:pointer;transition:transform .1s,background .15s}',
      '.vs-btn:hover{background:#3f8b3d}',
      '.vs-btn:active{transform:translateY(2px)}',
      '.vs-btn[disabled]{opacity:.5;cursor:not-allowed}',
      '.vs-status{font-size:14px;text-align:center;margin-top:10px;min-height:18px;word-break:break-word}',
      '.vs-status a{color:#2f6b2f;text-decoration:underline}',
      '.vs-err{color:#c0392b}',
      '.vs-foot{text-align:right;font-size:12px;color:#8a5a2b;margin-top:8px}',
      /* success / pending overlay */
      '.vs-ov{position:absolute;inset:-6px;background:rgba(244,236,216,.98);border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;z-index:20;overflow:hidden;animation:vsFade .25s ease}',
      '@keyframes vsFade{from{opacity:0}to{opacity:1}}',
      '.vs-ov-title{font-family:"Permanent Marker",cursive;font-size:26px;color:#2f6b2f;margin-top:14px}',
      '.vs-ov-sub{font-size:18px;color:#2b2620;margin-top:6px}',
      '.vs-ov-sub b{color:#2f6b2f}',
      '.vs-ov-link{font-size:14px;color:#2f6b2f;text-decoration:underline;margin-top:12px;position:relative;z-index:2}',
      '.vs-ov-btn{margin-top:16px;font-family:"Permanent Marker",cursive;font-size:18px;color:#f4ecd8;background:#2f6b2f;border:0;border-radius:14px;padding:10px 24px;cursor:pointer;position:relative;z-index:2}',
      '.vs-ov-btn:hover{background:#3f8b3d}',
      '.vs-bigspin{width:54px;height:54px;border:5px solid rgba(47,107,47,.22);border-top-color:#2f6b2f;border-radius:50%;animation:vsspin .7s linear infinite}',
      '.vs-check{width:92px;height:92px}',
      '.vs-check circle{stroke:#2f6b2f;stroke-width:4;fill:none;stroke-dasharray:170;stroke-dashoffset:170;animation:vsDraw .55s ease forwards}',
      '.vs-check path{stroke:#2f6b2f;stroke-width:5;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;animation:vsDraw .3s .45s ease forwards}',
      '@keyframes vsDraw{to{stroke-dashoffset:0}}',
      '.vs-check svg,.vs-pop{animation:vsPop .5s ease}',
      '@keyframes vsPop{0%{transform:scale(.6)}60%{transform:scale(1.12)}100%{transform:scale(1)}}',
      '.vs-conf{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1}',
      '.vs-conf i{position:absolute;top:-18px;width:9px;height:15px;border-radius:2px;animation:vsFall linear forwards}',
      '@keyframes vsFall{to{transform:translateY(640px) rotate(680deg);opacity:0}}',
      /* live trades feed */
      '.vt{font-family:"Patrick Hand",cursive;color:#2b2620;width:100%}',
      '.vt-head{font-family:"Permanent Marker",cursive;font-size:20px;display:flex;align-items:center;gap:9px;margin-bottom:12px}',
      '.vt-live{width:9px;height:9px;border-radius:50%;background:#3f8b3d;animation:vtpulse 1.4s ease-out infinite;flex:none}',
      '@keyframes vtpulse{0%{box-shadow:0 0 0 0 rgba(63,139,61,.55)}100%{box-shadow:0 0 0 8px rgba(63,139,61,0)}}',
      '.vt-list{display:flex;flex-direction:column;gap:6px;max-height:540px;overflow-y:auto}',
      '.vt-row{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#ece3cf;border-radius:12px;text-decoration:none;color:#2b2620;font-size:15px;animation:vtIn .3s ease}',
      '@keyframes vtIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1}}',
      '.vt-row:hover{background:#e4d9bf}',
      '.vt-side{font-family:"Permanent Marker",cursive;font-size:12px;padding:3px 8px;border-radius:8px;flex:none}',
      '.vt-side.buy{background:#2f6b2f;color:#f4ecd8}',
      '.vt-side.sell{background:#c0392b;color:#f4ecd8}',
      '.vt-amt{flex:none;min-width:0;white-space:nowrap}',
      '.vt-usd{color:#8a5a2b;font-size:13px}',
      '.vt-hash{flex:1;min-width:0;text-align:right;color:#8a5a2b;font-size:13px;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vt-row:hover .vt-hash{text-decoration:underline}',
      '.vt-time{color:#8a5a2b;font-size:13px;flex:none;min-width:26px;text-align:right}',
      '.vt-empty{color:#8a5a2b;font-size:15px;text-align:center;padding:24px}',
      /* stats tiles */
      '.vstat-row{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;width:100%}',
      '.vstat{flex:1;min-width:150px;background:#efe6cf;border:2.4px solid #2b2620;border-radius:16px;box-shadow:3px 4px 0 rgba(43,38,32,.8);padding:14px 16px;text-align:center}',
      '.vstat-lbl{font-family:"Patrick Hand",cursive;font-size:15px;color:#8a5a2b}',
      '.vstat-val{font-family:"Permanent Marker",cursive;font-size:25px;color:#2f6b2f;line-height:1.1;margin-top:3px}',
      '.vstat-sub{font-family:"Patrick Hand",cursive;font-size:14px;margin-top:3px;min-height:16px}',
      '.vstat-sub.up{color:#2f6b2f}',
      '.vstat-sub.down{color:#c0392b}',
      '.vstat-load{font-family:"Patrick Hand",cursive;color:#8a5a2b;text-align:center;width:100%;padding:12px}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ---------- helpers ---------- */
  function toWei(str, dec) {
    var v = String(str == null ? '' : str).trim();
    if (!v || isNaN(Number(v))) return 0n;
    var p = v.split('.'); var i = (p[0] || '0').replace(/[^0-9]/g, '') || '0';
    var f = ((p[1] || '').replace(/[^0-9]/g, '') + '0'.repeat(dec)).slice(0, dec);
    return BigInt(i) * (10n ** BigInt(dec)) + BigInt(f || '0');
  }
  function fromWei(wei, dec) {
    wei = BigInt(wei); var base = 10n ** BigInt(dec);
    var fs = (wei % base).toString().padStart(dec, '0').replace(/0+$/, '');
    return (wei / base).toString() + (fs ? '.' + fs.slice(0, 6) : '');
  }
  function grp(x) { return x.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtVlad(wei) {
    var n = Number(fromWei(wei, 18));
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return grp(Math.round(n).toString());
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function pad(a) { return a.toLowerCase().replace(/^0x/, '').padStart(64, '0'); }
  function eth() { return window.ethereum; }

  /* ---------- LI.FI ---------- */
  function quoteUrl(dir, wei, addr, slip) {
    var from = dir === 'buy' ? NATIVE : VLAD, to = dir === 'buy' ? VLAD : NATIVE;
    return LIFI + '/quote?fromChain=' + CHAIN + '&toChain=' + CHAIN + '&fromToken=' + from +
      '&toToken=' + to + '&fromAmount=' + wei.toString() + '&fromAddress=' + addr +
      '&integrator=' + INTEGRATOR + '&fee=' + FEE + '&slippage=' + (slip || SLIPPAGE);
  }
  async function getQuote(dir, wei, addr, tries, slip) {
    tries = tries || 1; var last;
    for (var i = 0; i < tries; i++) {
      try {
        var r = await fetch(quoteUrl(dir, wei, addr, slip));
        var j = await r.json().catch(function () { return {}; });
        if (r.ok && j.estimate) return j;
        last = new Error(j.message || ('HTTP ' + r.status));
      } catch (e) { last = e; }
      if (i < tries - 1) await new Promise(function (res) { setTimeout(res, 1000); });
    }
    throw last;
  }

  /* ---------- wallet ---------- */
  async function ensureChain() {
    var cur = await eth().request({ method: 'eth_chainId' });
    if (cur === CHAIN_HEX) return;
    try { await eth().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }); }
    catch (e) {
      if (e && e.code === 4902) {
        await eth().request({ method: 'wallet_addEthereumChain', params: [{
          chainId: CHAIN_HEX, chainName: 'Robinhood Chain',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
          blockExplorerUrls: ['https://robinhoodchain.blockscout.com']
        }] });
      } else throw e;
    }
  }
  async function waitReceipt(hash) {
    for (var i = 0; i < 90; i++) {
      var rc = await eth().request({ method: 'eth_getTransactionReceipt', params: [hash] });
      if (rc) return rc;
      await new Promise(function (r) { setTimeout(r, 2500); });
    }
    return null;
  }
  async function ensureApproval(spender, wei, owner, setStatus) {
    var res = await eth().request({ method: 'eth_call', params: [{ to: VLAD, data: '0xdd62ed3e' + pad(owner) + pad(spender) }, 'latest'] });
    if (BigInt(res || '0x0') >= wei) return;
    setStatus('Approve $VLAD in your wallet…');
    var h = await eth().request({ method: 'eth_sendTransaction', params: [{ from: owner, to: VLAD, data: '0x095ea7b3' + pad(spender) + 'f'.repeat(64) }] });
    setStatus('Waiting for approval…'); await waitReceipt(h);
  }

  /* ---------- mount ---------- */
  function mount(root) {
    root.innerHTML =
      '<div class="vs">' +
      '<div class="vs-head"><span class="vs-title">Exchange</span>' +
        '<button class="vs-connect" title="Connect wallet"><span class="vs-conn-txt">Connect wallet</span>' +
        '<span class="vs-conn-ic">' + WALLET_IC + '</span></button></div>' +
      '<div class="vs-ft">' +
        '<div class="vs-ftbox"><div class="vs-ftlbl">From</div><div class="vs-tok"><span class="vs-ic vs-from-ic"></span><div><div class="vs-tsym vs-from-sym"></div><div class="vs-tchain">Robinhood Chain</div></div></div></div>' +
        '<button class="vs-flip" title="flip direction">⇄</button>' +
        '<div class="vs-ftbox"><div class="vs-ftlbl">To</div><div class="vs-tok"><span class="vs-ic vs-to-ic"></span><div><div class="vs-tsym vs-to-sym"></div><div class="vs-tchain">Robinhood Chain</div></div></div></div>' +
      '</div>' +
      '<div class="vs-box"><div class="vs-sendhead"><span class="vs-lbl">Send</span><span class="vs-bal" title="click for Max"></span></div>' +
        '<div class="vs-line"><span class="vs-ic vs-send-ic"></span><input class="vs-amt" inputmode="decimal" placeholder="0.0"/></div>' +
        '<div class="vs-sub"><span class="vs-send-usd"></span>' +
        '<span class="vs-pcts"><span class="vs-pct" data-p="25">25%</span><span class="vs-pct" data-p="50">50%</span><span class="vs-pct" data-p="75">75%</span><span class="vs-pct" data-p="100">Max</span></span></div></div>' +
      '<div class="vs-box"><div class="vs-lbl">Receive</div><div class="vs-line"><span class="vs-ic vs-recv-ic"></span>' +
        '<span class="vs-out muted">—</span><span class="vs-spin"></span></div><div class="vs-sub vs-recv-usd"></div></div>' +
      '<div class="vs-slip"><span>Slippage</span><span class="vs-slip-opts">' +
        '<button class="vs-slip-opt" data-s="0.005">0.5%</button><button class="vs-slip-opt" data-s="0.01">1%</button>' +
        '<button class="vs-slip-opt on" data-s="0.03">3%</button><button class="vs-slip-opt" data-s="0.05">5%</button>' +
      '</span></div>' +
      '<button class="vs-btn">Connect wallet</button>' +
      '<div class="vs-status"></div>' +
      '<div class="vs-foot">powered by <a href="https://li.fi/" target="_blank" rel="noopener" style="color:#2f6b2f;text-decoration:underline">LI.FI</a></div>' +
      '</div>';

    var q = function (s) { return root.querySelector(s); };
    var st = { dir: 'buy', account: null, quote: null, busy: false, amount: '', balEth: null, balVlad: null, slippage: 0.03 };
    var amtEl = q('.vs-amt'), outEl = q('.vs-out'), btn = q('.vs-btn'),
        statusEl = q('.vs-status'), spin = q('.vs-spin'),
        sendUsd = q('.vs-send-usd'), recvUsd = q('.vs-recv-usd'), balEl = q('.vs-bal');

    function renderBal() {
      var kind = st.dir === 'buy' ? 'eth' : 'vlad';
      var bal = kind === 'eth' ? st.balEth : st.balVlad;
      if (st.account && bal != null) {
        balEl.textContent = 'balance: ' + (kind === 'eth' ? (Number(fromWei(bal, 18)).toFixed(4) + ' ETH') : (fmtVlad(bal) + ' VLAD'));
      } else balEl.textContent = '';
    }
    async function fetchBalances() {
      if (!st.account || !eth()) return;
      try {
        st.balEth = BigInt((await eth().request({ method: 'eth_getBalance', params: [st.account, 'latest'] })) || '0x0');
        st.balVlad = BigInt((await eth().request({ method: 'eth_call', params: [{ to: VLAD, data: '0x70a08231' + pad(st.account) }, 'latest'] })) || '0x0');
      } catch (e) {}
      renderBal();
    }
    function applyPct(p) {
      var bal = st.dir === 'buy' ? st.balEth : st.balVlad;
      if (bal == null || bal <= 0n) return;
      var amt = bal * BigInt(p) / 100n;
      if (st.dir === 'buy' && p === 100) { var r = 300000000000000n; amt = amt > r ? amt - r : 0n; } /* keep ~0.0003 ETH for gas */
      amtEl.value = fromWei(amt, 18); onAmount();
    }

    /* ---- swap-status overlay (pending / success animation) ---- */
    var ov = null;
    function hideOverlay() { if (ov) { ov.remove(); ov = null; } }
    function panel() { return root.querySelector('.vs'); }
    function showPending(text, link) {
      hideOverlay();
      ov = document.createElement('div'); ov.className = 'vs-ov';
      ov.innerHTML = '<div class="vs-bigspin"></div><div class="vs-ov-title">' + text + '</div>' +
        (link ? '<a class="vs-ov-link" target="_blank" rel="noopener" href="' + link + '">view transaction</a>' : '');
      panel().appendChild(ov);
    }
    function showSuccess(got, link) {
      hideOverlay();
      var cols = ['#2f6b2f', '#3f8b3d', '#e0a51e', '#c0392b'], conf = '';
      for (var i = 0; i < 28; i++) {
        conf += '<i style="left:' + Math.round(Math.random() * 100) + '%;background:' + cols[i % 4] +
          ';animation-delay:' + (Math.random() * 0.5).toFixed(2) + 's;animation-duration:' + (1.1 + Math.random() * 0.9).toFixed(2) + 's"></i>';
      }
      ov = document.createElement('div'); ov.className = 'vs-ov';
      ov.innerHTML = '<div class="vs-conf">' + conf + '</div>' +
        '<svg class="vs-check vs-pop" viewBox="0 0 60 60"><circle cx="30" cy="30" r="26"/><path d="M17 31 l9 9 l17 -19"/></svg>' +
        '<div class="vs-ov-title">Swap confirmed!</div>' +
        '<div class="vs-ov-sub">you got <b>' + got + '</b></div>' +
        '<a class="vs-ov-link" target="_blank" rel="noopener" href="' + link + '">view transaction</a>' +
        '<button class="vs-ov-btn">Swap again</button>';
      panel().appendChild(ov);
      ov.querySelector('.vs-ov-btn').addEventListener('click', function () {
        hideOverlay(); amtEl.value = ''; st.amount = ''; st.quote = null;
        outEl.textContent = '—'; outEl.className = 'vs-out muted'; sendUsd.textContent = ''; recvUsd.textContent = '';
        setStatus(''); fetchBalances();
      });
    }

    function icHtml(kind) { return (kind === 'eth' ? ETH_IC : VLAD_IC) + BADGE; }
    function setStatus(m, err) { statusEl.innerHTML = m || ''; statusEl.className = 'vs-status' + (err ? ' vs-err' : ''); }

    function paint() {
      var fromKind = st.dir === 'buy' ? 'eth' : 'vlad', toKind = st.dir === 'buy' ? 'vlad' : 'eth';
      q('.vs-from-ic').innerHTML = icHtml(fromKind); q('.vs-send-ic').innerHTML = icHtml(fromKind);
      q('.vs-to-ic').innerHTML = icHtml(toKind); q('.vs-recv-ic').innerHTML = icHtml(toKind);
      q('.vs-from-sym').textContent = fromKind === 'eth' ? 'ETH' : 'VLAD';
      q('.vs-to-sym').textContent = toKind === 'eth' ? 'ETH' : 'VLAD';
      renderBal();
      updateBtn();
    }
    function updateBtn() {
      if (st.busy) { btn.disabled = true; return; }
      if (!st.account) { btn.textContent = 'Connect wallet'; btn.disabled = false; return; }
      var has = toWei(st.amount, 18) > 0n;
      btn.disabled = !has || !st.quote;
      btn.textContent = st.dir === 'buy' ? 'Buy $VLAD' : 'Sell $VLAD';
    }
    function setConnected(addr) {
      st.account = addr;
      q('.vs-conn-txt').textContent = addr ? (addr.slice(0, 6) + '…' + addr.slice(-4)) : 'Connect wallet';
      var pill = q('.vs-connect'); pill.title = addr ? 'Disconnect wallet' : 'Connect wallet';
      q('.vs-conn-ic').innerHTML = addr ? DISC_IC : WALLET_IC;
    }
    async function disconnect() {
      try { localStorage.removeItem('vlad_connected'); } catch (e) {}
      setConnected(null); st.balEth = st.balVlad = null; st.quote = null;
      amtEl.value = ''; st.amount = ''; outEl.textContent = '—'; outEl.className = 'vs-out muted';
      sendUsd.textContent = ''; recvUsd.textContent = ''; hideOverlay(); setStatus('Wallet disconnected'); paint();
      /* revoke so the next connect shows the account picker (pick another wallet) */
      try { if (eth() && eth().request) await eth().request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }); } catch (e) {}
    }

    var timer = null;
    function onAmount() {
      st.amount = amtEl.value; st.quote = null;
      outEl.textContent = '—'; outEl.className = 'vs-out muted'; recvUsd.textContent = ''; sendUsd.textContent = '';
      updateBtn(); if (timer) clearTimeout(timer);
      if (toWei(st.amount, 18) <= 0n) { spin.classList.remove('on'); return; }
      spin.classList.add('on');
      timer = setTimeout(refreshQuote, 450);
    }
    async function refreshQuote() {
      var wei = toWei(st.amount, 18); if (wei <= 0n) return;
      var addr = st.account || FEE_WALLET, mine = wei.toString() + st.dir; st._p = mine;
      try {
        /* small reference trade (~near-spot) to measure real price impact from token rates */
        var refWei = st.dir === 'buy' ? 2000000000000000n /* 0.002 ETH */ : (2000n * (10n ** 18n)) /* 2000 VLAD */;
        var small = wei <= refWei;
        var results = await Promise.all([
          getQuote(st.dir, wei, addr, 4, st.slippage),
          (small ? Promise.resolve(null) : getQuote(st.dir, refWei, addr, 2, st.slippage).catch(function () { return null; }))
        ]);
        var j = results[0], ref = results[1];
        if (st._p !== mine) return; st.quote = j; spin.classList.remove('on');
        var e = j.estimate;
        var outWei = BigInt(e.toAmount);
        outEl.textContent = st.dir === 'buy' ? fmtVlad(outWei) : fromWei(outWei, 18);
        outEl.className = 'vs-out';
        sendUsd.textContent = e.fromAmountUSD ? ('$' + e.fromAmountUSD) : '';
        var minWei = BigInt(e.toAmountMin || e.toAmount);
        var minStr = st.dir === 'buy' ? (fmtVlad(minWei) + ' VLAD') : (Number(fromWei(minWei, 18)).toFixed(5) + ' ETH');
        /* price impact = how much worse this trade's rate is vs a tiny near-spot trade (fee cancels out) */
        var impStr = null, impBad = false;
        if (small) { impStr = '<0.01%'; }
        else if (ref && ref.estimate) {
          var bigRate = Number(fromWei(outWei, 18)) / Number(fromWei(wei, 18));
          var refRate = Number(fromWei(BigInt(ref.estimate.toAmount), 18)) / Number(fromWei(refWei, 18));
          if (refRate > 0) {
            var impact = Math.max(0, (1 - bigRate / refRate) * 100);
            impStr = impact < 0.01 ? '<0.01%' : impact.toFixed(2) + '%';
            impBad = impact > 3;
          }
        }
        recvUsd.innerHTML = (impStr ? ('price impact <b class="' + (impBad ? 'vs-err' : '') + '">' + impStr + '</b> · ') : '') + 'min ' + minStr;
        updateBtn();
      } catch (e) {
        if (st._p !== mine) return; st.quote = null; spin.classList.remove('on');
        outEl.textContent = 'no route'; outEl.className = 'vs-out muted';
        recvUsd.innerHTML = '<span class="vs-err">try another amount or <a target="_blank" rel="noopener" href="' + CHART + '">DexScreener</a></span>';
        updateBtn();
      }
    }

    async function onAction() {
      if (st.busy) return;
      try {
        if (!eth()) { setStatus('No wallet found — install MetaMask.', true); return; }
        if (!st.account) {
          st.busy = true; updateBtn(); setStatus('Connecting…');
          var a = await eth().request({ method: 'eth_requestAccounts' });
          setConnected(a && a[0]); await ensureChain();
          try { localStorage.setItem('vlad_connected', '1'); } catch (e) {}
          st.busy = false; setStatus(''); bindEvents(); paint(); fetchBalances(); refreshQuote(); return;
        }
        var wei = toWei(st.amount, 18);
        if (wei <= 0n) { setStatus('Enter an amount.', true); return; }
        st.busy = true; updateBtn(); setStatus('Preparing swap…'); await ensureChain();
        var j = await getQuote(st.dir, wei, st.account, 4, st.slippage); var tx = j.transactionRequest;
        if (!tx) throw new Error('No transaction from route');
        if (st.dir === 'sell') await ensureApproval(j.estimate.approvalAddress, wei, st.account, setStatus);
        setStatus('Confirm the swap in your wallet…');
        var p = { from: st.account, to: tx.to, data: tx.data, value: tx.value || '0x0' }; if (tx.gasLimit) p.gas = tx.gasLimit;
        var h = await eth().request({ method: 'eth_sendTransaction', params: [p] });
        var txurl = 'https://robinhoodchain.blockscout.com/tx/' + h;
        var got = st.dir === 'buy' ? (fmtVlad(BigInt(j.estimate.toAmount)) + ' VLAD') : (fromWei(BigInt(j.estimate.toAmount), 18) + ' ETH');
        setStatus(''); showPending('Confirming your swap…', txurl);
        var rc = await waitReceipt(h);
        if (rc && (rc.status === '0x1' || rc.status === 1)) { showSuccess(got, txurl); }
        else if (rc) { hideOverlay(); setStatus('Swap failed on-chain. <a target="_blank" rel="noopener" href="' + txurl + '">view tx</a>', true); }
        else { hideOverlay(); setStatus('Sent — check your wallet. <a target="_blank" rel="noopener" href="' + txurl + '">view tx</a>'); }
        st.quote = null; fetchBalances();
      } catch (e) {
        var m = (e && e.code === 4001) ? 'You rejected the request.' : ((e && e.message) || 'something went wrong');
        setStatus(m, true);
      } finally { st.busy = false; updateBtn(); }
    }

    function flip() {
      st.dir = st.dir === 'buy' ? 'sell' : 'buy';
      amtEl.value = ''; st.amount = ''; st.quote = null;
      outEl.textContent = '—'; outEl.className = 'vs-out muted'; sendUsd.textContent = ''; recvUsd.textContent = ''; setStatus('');
      paint();
    }
    function bindEvents() {
      if (!eth() || eth().__vladBound) return; eth().__vladBound = true;
      eth().on && eth().on('accountsChanged', function (a) { setConnected(a && a[0] || null); st.balEth = st.balVlad = null; if (!st.account) { try { localStorage.removeItem('vlad_connected'); } catch (e) {} setStatus(''); } paint(); fetchBalances(); refreshQuote(); });
      eth().on && eth().on('chainChanged', function () { st.quote = null; refreshQuote(); });
    }

    q('.vs-flip').addEventListener('click', flip);
    q('.vs-connect').addEventListener('click', function () { if (st.account) disconnect(); else onAction(); });
    amtEl.addEventListener('input', onAmount);
    btn.addEventListener('click', onAction);
    root.querySelectorAll('.vs-pct').forEach(function (b) { b.addEventListener('click', function () { applyPct(parseInt(b.getAttribute('data-p'), 10)); }); });
    balEl.addEventListener('click', function () { applyPct(100); });
    root.querySelectorAll('.vs-slip-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        st.slippage = parseFloat(b.getAttribute('data-s'));
        root.querySelectorAll('.vs-slip-opt').forEach(function (x) { x.classList.toggle('on', x === b); });
        st.quote = null;
        if (toWei(st.amount, 18) > 0n) { spin.classList.add('on'); refreshQuote(); } else updateBtn();
      });
    });

    paint();   /* render icons immediately — NO wallet call on first visit (avoids auto-connect popups like Phantom) */
    var wasConnected = false;
    try { wasConnected = localStorage.getItem('vlad_connected') === '1'; } catch (e) {}
    if (wasConnected && eth() && eth().request) {
      eth().request({ method: 'eth_accounts' }).then(function (a) {
        if (a && a[0]) { setConnected(a[0]); bindEvents(); paint(); fetchBalances(); }
      }).catch(function () {});
    }
  }

  /* ---------- live trades feed ---------- */
  function timeAgo(ts) {
    var s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return Math.floor(s) + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }
  function mountTrades(root) {
    root.innerHTML = '<div class="vt"><div class="vt-head">Latest swaps <span class="vt-live"></span></div>' +
      '<div class="vt-list"><div class="vt-empty">loading swaps…</div></div></div>';
    var listEl = root.querySelector('.vt-list');
    var FEE = '0xcdbc2623bf8481f88eac55ec8a2faf70054ead54';   /* our integrator fee wallet — marks swaps made on this site */
    var RPC = 'https://rpc.mainnet.chain.robinhood.com';
    var TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    var vladPrice = 0, ethPrice = 0, blockCache = {};
    async function rpc(method, params) {
      var r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }) });
      return (await r.json()).result;
    }
    async function blockTs(hex) {
      if (blockCache[hex]) return blockCache[hex];
      try { var b = await rpc('eth_getBlockByNumber', [hex, false]); var ts = b ? parseInt(b.timestamp, 16) * 1000 : Date.now(); blockCache[hex] = ts; return ts; } catch (e) { return Date.now(); }
    }
    async function loadPrice() {
      try {
        var r = await fetch('https://api.dexscreener.com/latest/dex/pairs/robinhood/0xac870e97FC1FE981F4D887e5f453203745A15EF4');
        var d = await r.json(); var p = d.pair || (d.pairs && d.pairs[0]);
        if (p) { vladPrice = parseFloat(p.priceUsd) || 0; var pn = parseFloat(p.priceNative) || 0; ethPrice = pn > 0 ? vladPrice / pn : 0; }
      } catch (e) {}
    }
    async function load() {
      try {
        var trades = [], seen = {};
        /* BUYS — 1% fee arrives as native ETH (internal tx) to our fee wallet */
        try {
          var r1 = await fetch('https://robinhoodchain.blockscout.com/api/v2/addresses/' + FEE + '/internal-transactions');
          var j1 = await r1.json();
          (j1.items || []).forEach(function (t) {
            var to = (t.to && t.to.hash || '').toLowerCase(); var val = Number(t.value || 0) / 1e18;
            if (to !== FEE || val <= 0) return; var tx = t.transaction_hash; if (!tx || seen[tx]) return; seen[tx] = 1;
            trades.push({ side: 'buy', usd: (val * 100) * ethPrice, ts: new Date(t.timestamp).getTime(), tx: tx });
          });
        } catch (e) {}
        /* SELLS — 1% fee arrives as VLAD; Blockscout's address endpoint misses these, so read Transfer logs via RPC */
        try {
          var cur = parseInt(await rpc('eth_blockNumber', []), 16);
          var fromBlk = '0x' + Math.max(0, cur - 300000).toString(16);
          var feeTopic = '0x' + FEE.replace(/^0x/, '').padStart(64, '0');
          var logs = await rpc('eth_getLogs', [{ address: VLAD, topics: [TRANSFER, null, feeTopic], fromBlock: fromBlk, toBlock: 'latest' }]) || [];
          for (var i = 0; i < logs.length; i++) {
            var l = logs[i]; var tx = l.transactionHash; if (!tx || seen[tx]) continue; seen[tx] = 1;
            var feeV = Number(BigInt(l.data)) / 1e18;
            trades.push({ side: 'sell', usd: (feeV * 100) * vladPrice, ts: await blockTs(l.blockNumber), tx: tx });
          }
        } catch (e) {}
        trades.sort(function (a, b) { return b.ts - a.ts; });
        trades = trades.slice(0, 15);
        if (!trades.length) { listEl.innerHTML = '<div class="vt-empty">no swaps yet — be the first!</div>'; return; }
        listEl.innerHTML = trades.map(function (x) {
          var usd = x.usd > 0 ? '<span class="vt-usd">~$' + x.usd.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '</span>' : '';
          var short = x.tx.slice(0, 8) + '…' + x.tx.slice(-4);
          return '<a class="vt-row" target="_blank" rel="noopener" href="https://robinhoodchain.blockscout.com/tx/' + x.tx + '">' +
            '<span class="vt-side ' + x.side + '">' + (x.side === 'buy' ? 'BUY' : 'SELL') + '</span>' +
            '<span class="vt-amt">' + usd + '</span>' +
            '<span class="vt-hash">' + short + '</span>' +
            '<span class="vt-time">' + timeAgo(x.ts) + '</span></a>';
        }).join('');
      } catch (e) { listEl.innerHTML = '<div class="vt-empty">couldn\'t load swaps</div>'; }
    }
    loadPrice().then(load);
    setInterval(load, 15000); setInterval(loadPrice, 60000);
  }

  /* ---------- stats block (market cap, holders, volume + 24h growth) ---------- */
  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(p) {
    var a = Math.abs(p), s = a >= 1000 ? (a / 1000).toFixed(1) + 'K' : a.toFixed(1);
    return (p >= 0 ? '+' : '−') + s + '%';
  }
  function holderDelta(current) {
    try {
      var key = 'vlad_hold_hist', now = Date.now();
      var hist = JSON.parse(localStorage.getItem(key) || '[]');
      hist.push({ t: now, c: current });
      hist = hist.filter(function (h) { return now - h.t < 50 * 3600 * 1000; });
      localStorage.setItem(key, JSON.stringify(hist));
      var target = now - 24 * 3600 * 1000, best = null, bd = Infinity;
      hist.forEach(function (h) { if (h.t <= now - 20 * 3600 * 1000) { var d = Math.abs(h.t - target); if (d < bd) { bd = d; best = h; } } });
      return best ? (current - best.c) : null;
    } catch (e) { return null; }
  }
  function mountStats(root) {
    root.innerHTML = '<div class="vstat-row"><div class="vstat-load">loading stats…</div></div>';
    function tile(lbl, val, sub, up) {
      var cls = up === null ? '' : (up ? 'up' : 'down');
      return '<div class="vstat"><div class="vstat-lbl">' + lbl + '</div><div class="vstat-val">' + val + '</div>' +
        (sub ? '<div class="vstat-sub ' + cls + '">' + sub + '</div>' : '<div class="vstat-sub"></div>') + '</div>';
    }
    async function load() {
      var mcap = 0, ch24 = null, vol = 0, holders = 0;
      try {
        var r = await fetch('https://api.dexscreener.com/latest/dex/pairs/robinhood/0xac870e97FC1FE981F4D887e5f453203745A15EF4');
        var d = await r.json(); var p = d.pair || (d.pairs && d.pairs[0]);
        if (p) { mcap = p.marketCap || p.fdv || 0; ch24 = (p.priceChange && typeof p.priceChange.h24 === 'number') ? p.priceChange.h24 : null; vol = (p.volume && p.volume.h24) || 0; }
      } catch (e) {}
      try {
        var r2 = await fetch('https://robinhoodchain.blockscout.com/api/v2/tokens/' + VLAD + '/counters');
        var c = await r2.json(); holders = parseInt(c.token_holders_count || '0', 10);
      } catch (e) {}
      var hd = holders > 0 ? holderDelta(holders) : null;
      var t = '';
      t += tile('Market Cap', mcap ? fmtUsd(mcap) : '—', ch24 != null ? (fmtPct(ch24) + ' 24h') : '', ch24 == null ? null : ch24 >= 0);
      t += tile('Holders', holders ? holders.toLocaleString('en-US') : '—', hd != null ? ((hd >= 0 ? '+' : '−') + Math.abs(hd).toLocaleString('en-US') + ' 24h') : '', hd == null ? null : hd >= 0);
      t += tile('24h Volume', vol ? fmtUsd(vol) : '—', '', null);
      root.innerHTML = '<div class="vstat-row">' + t + '</div>';
    }
    load(); setInterval(load, 30000);
  }

  function init() {
    document.querySelectorAll('.vlad-swap').forEach(function (el) { if (!el.__vlad) { el.__vlad = 1; mount(el); } });
    document.querySelectorAll('.vlad-trades').forEach(function (el) { if (!el.__vt) { el.__vt = 1; mountTrades(el); } });
    document.querySelectorAll('.vlad-stats').forEach(function (el) { if (!el.__vst) { el.__vst = 1; mountStats(el); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
