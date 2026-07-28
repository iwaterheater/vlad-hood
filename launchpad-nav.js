/* ============================================================
   VLADHOOD LAUNCHPAD — shared header tools.

   Fills every [data-nav-tools] slot in the launchpad headers with:
     * a token search that jumps straight to a meme page
     * a Connect-wallet button

   The wallet half is the same EIP-6963 discovery the swap panel uses,
   so whichever wallets the browser has installed (Phantom, MetaMask,
   Rabby, Robinhood…) announce themselves and get listed. It is a
   connection only: this page has no contracts and never builds,
   signs or sends a transaction — see launchpad.js.

   Nothing here auto-prompts. A wallet dialog only ever opens from a
   click, unless the user connected before (localStorage vlad_connected),
   in which case the address is restored silently via eth_accounts.

   Vanilla JS, IIFE, zero dependencies.
   ============================================================ */
(function () {
  'use strict';

  var slots = document.querySelectorAll('[data-nav-tools]');
  if (!slots.length) return;

  var LP = window.VladLaunchpad || null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------------------------------------------------------
     styles
  --------------------------------------------------------------- */
  var CSS = [
    '.lpn { display:flex; align-items:center; gap:8px; min-width:0; }',

    /* --- search --- */
    '.lpn-search { position:relative; }',
    '.lpn-input { width:100%; font-family:"Patrick Hand",cursive; font-size:15px; color:#2b2620;',
    '  background:#f4ecd8; border:2px solid #2b2620; border-radius:999px;',
    '  padding:3px 10px 3px 28px; outline:none; }',
    '.lpn-input::placeholder { color:rgba(43,38,32,.45); }',
    '.lpn-input:focus { box-shadow:0 0 0 2px rgba(224,165,30,.55); }',
    '.lpn-mag { position:absolute; left:9px; top:50%; transform:translateY(-50%);',
    '  width:14px; height:14px; color:rgba(43,38,32,.55); pointer-events:none; }',
    '.lpn-pop { position:absolute; top:calc(100% + 6px); left:0; right:0; z-index:60;',
    '  background:#efe6cf; border:2.4px solid #2b2620; border-radius:14px;',
    '  box-shadow:3px 4px 0 rgba(43,38,32,.8); padding:4px; max-height:320px; overflow-y:auto;',
    '  scrollbar-width:thin; scrollbar-color:#c3b795 transparent; }',
    '.lpn-pop::-webkit-scrollbar { width:7px; }',
    '.lpn-pop::-webkit-scrollbar-thumb { background:#c3b795; border-radius:99px; }',
    '.lpn-pop[hidden] { display:none; }',
    '.lpn-hit { display:flex; align-items:center; gap:8px; width:100%; text-align:left;',
    '  padding:5px 7px; border-radius:10px; background:transparent; border:0; cursor:pointer; }',
    '.lpn-hit:hover, .lpn-hit.on { background:rgba(224,165,30,.35); }',
    '.lpn-ava { width:26px; height:26px; border-radius:999px; overflow:hidden;',
    '  border:2px solid #2b2620; flex:none; }',
    '.lpn-ava svg { width:100%; height:100%; display:block; }',
    '.lpn-hit b { font-family:"Permanent Marker",cursive; font-weight:400; font-size:11px;',
    '  color:#2f6b2f; display:block; line-height:1.2; }',
    '.lpn-hit i { font-family:"Patrick Hand",cursive; font-style:normal; font-size:11px;',
    '  color:#8a5a2b; display:block; line-height:1.2; }',
    '.lpn-hit em { margin-left:auto; font-style:normal; font-family:"Patrick Hand",cursive;',
    '  font-size:11px; color:rgba(43,38,32,.6); white-space:nowrap; }',
    '.lpn-tag { font-family:"Patrick Hand",cursive; font-size:9px; letter-spacing:.04em;',
    '  border:1.5px solid #2b2620; border-radius:999px; padding:0 5px; white-space:nowrap; }',
    '.lpn-tag.live { background:#3f8b3d; color:#f4ecd8; }',
    '.lpn-tag.grad { background:#2b2620; color:#f4ecd8; }',
    '.lpn-empty { font-family:"Patrick Hand",cursive; font-size:13px; color:rgba(43,38,32,.65);',
    '  padding:8px 9px; }',

    /* --- connect button --- */
    '.lpn-btn { font-family:"Permanent Marker",cursive; font-size:11px; line-height:1;',
    '  color:#2b2620; background:#e0a51e; border:2px solid #2b2620; border-radius:999px;',
    '  padding:7px 12px; cursor:pointer; white-space:nowrap;',
    '  box-shadow:3px 4px 0 rgba(43,38,32,.8); transition:background-color .15s, color .15s; }',
    '.lpn-btn:hover { background:#2f6b2f; color:#f4ecd8; }',
    '.lpn-btn.on { background:#f4ecd8; font-family:"Patrick Hand",cursive; font-size:14px; }',
    '.lpn-btn .dot { display:inline-block; width:7px; height:7px; border-radius:999px;',
    '  background:#3f8b3d; border:1.5px solid #2b2620; margin-right:6px; vertical-align:1px; }',
    '.lpn-menu { position:absolute; top:calc(100% + 6px); right:0; z-index:60; min-width:190px;',
    '  background:#efe6cf; border:2.4px solid #2b2620; border-radius:14px;',
    '  box-shadow:3px 4px 0 rgba(43,38,32,.8); padding:6px; }',
    '.lpn-menu[hidden] { display:none; }',
    '.lpn-menu button { display:block; width:100%; text-align:left; background:transparent;',
    '  border:0; cursor:pointer; border-radius:9px; padding:5px 8px;',
    '  font-family:"Patrick Hand",cursive; font-size:14px; color:#2b2620; }',
    '.lpn-menu button:hover { background:rgba(224,165,30,.35); }',
    '.lpn-addr { font-family:"Patrick Hand",cursive; font-size:12px; color:rgba(43,38,32,.6);',
    '  padding:3px 8px 5px; word-break:break-all; }',

    /* --- wallet picker overlay --- */
    '.lpn-ov { position:fixed; inset:0; z-index:100; display:flex; align-items:center;',
    '  justify-content:center; background:rgba(43,38,32,.55); padding:20px; }',
    '.lpn-card { width:100%; max-width:330px; background:#f4ecd8; border:2.4px solid #2b2620;',
    '  border-radius:18px; box-shadow:4px 5px 0 rgba(43,38,32,.85); padding:16px; }',
    '.lpn-card h3 { font-family:"Permanent Marker",cursive; font-weight:400; font-size:18px;',
    '  color:#2f6b2f; margin:0 0 2px; }',
    '.lpn-card p { font-family:"Patrick Hand",cursive; font-size:13px; color:rgba(43,38,32,.7);',
    '  margin:0 0 10px; line-height:1.35; }',
    '.lpn-w { display:flex; align-items:center; gap:9px; width:100%; text-align:left;',
    '  background:#efe6cf; border:2px solid #2b2620; border-radius:12px; padding:7px 10px;',
    '  margin-bottom:6px; cursor:pointer; font-family:"Patrick Hand",cursive; font-size:15px;',
    '  color:#2b2620; box-shadow:2px 3px 0 rgba(43,38,32,.6); }',
    '.lpn-w:hover { background:rgba(224,165,30,.4); }',
    '.lpn-w img, .lpn-w .ph { width:24px; height:24px; border-radius:7px; flex:none; }',
    '.lpn-w .ph { background:#c3b795; border:1.5px solid #2b2620; }',
    '.lpn-x { width:100%; background:transparent; border:0; cursor:pointer; padding:6px 0 0;',
    '  font-family:"Patrick Hand",cursive; font-size:14px; color:rgba(43,38,32,.65); }',
    '.lpn-x:hover { color:#c0392b; }',

    '@media (max-width:767px) { .lpn-search { display:none; } }',
    '@media (prefers-reduced-motion: reduce) { .lpn-btn { transition:none; } }'
  ].join('\n');

  var st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  var MAG = '<svg class="lpn-mag" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/>' +
    '<path d="m16 16 4.5 4.5"/></svg>';

  /* ---------------------------------------------------------------
     token search
  --------------------------------------------------------------- */
  function buildSearch(slot) {
    var wrap = document.createElement('div');
    wrap.className = 'lpn-search';
    wrap.style.width = '190px';
    /* aria-label rather than a visually-hidden <label>: this markup is built
       after Tailwind's first pass, so it must not depend on utility classes */
    wrap.innerHTML = MAG +
      '<input id="lpn-q" class="lpn-input" type="search" autocomplete="off" role="combobox" ' +
      'aria-label="Search tokens" aria-expanded="false" aria-controls="lpn-pop" placeholder="Search token..." />' +
      '<div class="lpn-pop" id="lpn-pop" role="listbox" hidden></div>';
    slot.appendChild(wrap);

    var input = wrap.querySelector('input');
    var pop = wrap.querySelector('.lpn-pop');
    var hits = [];
    var cursor = -1;

    function memes() {
      return (LP && Array.isArray(LP.memes)) ? LP.memes : [];
    }

    function search(q) {
      q = q.trim().toLowerCase().replace(/^\$/, '');
      if (!q) return [];
      var out = memes().filter(function (m) {
        return (String(m.symbol || '').toLowerCase().indexOf(q) === 0) ||
               (String(m.name || '').toLowerCase().indexOf(q) > -1) ||
               (String(m.id || '').toLowerCase().indexOf(q) > -1);
      });
      /* a ticker typed in full should win over a name that merely contains it */
      out.sort(function (a, b) {
        var ax = String(a.symbol || '').toLowerCase() === q ? 0 : 1;
        var bx = String(b.symbol || '').toLowerCase() === q ? 0 : 1;
        if (ax !== bx) return ax - bx;
        return (b.marketCap || 0) - (a.marketCap || 0);
      });
      return out.slice(0, 8);
    }

    function rowHtml(m, i) {
      var bg = (m.avatar && m.avatar.bg) ? m.avatar.bg : '#a8d5a2';
      var art = '';
      try { art = (LP && LP.avatar) ? LP.avatar(m, 26) : ''; } catch (e) {}
      var grad = m.status === 'finished';
      var cap = '';
      try { cap = (LP && LP.fmt && LP.fmt.usd) ? LP.fmt.usd(m.marketCap) : ''; } catch (e) {}
      return '<button class="lpn-hit" role="option" aria-selected="false" data-i="' + i + '">' +
        '<span class="lpn-ava" style="background:' + esc(bg) + '">' + art + '</span>' +
        '<span style="min-width:0">' +
          '<b>' + esc(m.name) + '</b><i>$' + esc(m.symbol) + '</i>' +
        '</span>' +
        '<em>' + esc(cap) + '</em>' +
        '<span class="lpn-tag ' + (grad ? 'grad' : 'live') + '">' + (grad ? 'GRAD' : 'LIVE') + '</span>' +
      '</button>';
    }

    function close() {
      pop.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      cursor = -1;
    }

    function mark() {
      var rows = pop.querySelectorAll('.lpn-hit');
      for (var i = 0; i < rows.length; i++) {
        var on = i === cursor;
        rows[i].classList.toggle('on', on);
        rows[i].setAttribute('aria-selected', String(on));
        if (on) rows[i].scrollIntoView({ block: 'nearest' });
      }
    }

    function go(m) {
      if (!m) return;
      window.location.href = '/launchpad/meme.html?id=' + encodeURIComponent(m.id);
    }

    function refresh() {
      hits = search(input.value);
      if (!input.value.trim()) { close(); return; }
      pop.innerHTML = hits.length
        ? hits.map(rowHtml).join('')
        : '<div class="lpn-empty">No token by that name.</div>';
      pop.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      cursor = -1;
    }

    input.addEventListener('input', refresh);
    input.addEventListener('focus', function () { if (input.value.trim()) refresh(); });

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { close(); input.blur(); return; }
      if (!hits.length) return;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); cursor = (cursor + 1) % hits.length; mark(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); cursor = (cursor - 1 + hits.length) % hits.length; mark(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); go(hits[cursor < 0 ? 0 : cursor]); }
    });

    pop.addEventListener('click', function (ev) {
      var b = ev.target.closest('.lpn-hit');
      if (b) go(hits[parseInt(b.getAttribute('data-i'), 10)]);
    });

    document.addEventListener('click', function (ev) {
      if (!wrap.contains(ev.target)) close();
    });
  }

  /* ---------------------------------------------------------------
     wallet — EIP-6963 discovery, same as the swap panel
  --------------------------------------------------------------- */
  var WALLETS = [];
  var chosen = null;
  var account = null;

  function addWallet(d) {
    if (!d || !d.info || !d.provider) return;
    for (var i = 0; i < WALLETS.length; i++) if (WALLETS[i].uuid === d.info.uuid) return;
    WALLETS.push({ uuid: d.info.uuid, rdns: d.info.rdns, name: d.info.name, icon: d.info.icon, provider: d.provider });
  }
  window.addEventListener('eip6963:announceProvider', function (e) { addWallet(e.detail); });
  try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (e) {}

  function wallets() {
    var list = WALLETS.slice();
    if (!list.length && window.ethereum) {
      var n = window.ethereum.isMetaMask ? 'MetaMask'
        : (window.ethereum.isPhantom ? 'Phantom'
        : (window.ethereum.isRabby ? 'Rabby' : 'Browser Wallet'));
      list.push({ uuid: 'legacy', name: n, icon: '', provider: window.ethereum });
    }
    return list;
  }
  function eth() { return chosen || window.ethereum; }
  function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }

  /* the picker only ever opens from a click */
  function pickWallet() {
    try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (e) {}
    return new Promise(function (resolve) {
      var list = wallets();
      if (list.length === 1) { resolve(list[0].provider); return; }

      var ov = document.createElement('div');
      ov.className = 'lpn-ov';
      var body = '<div class="lpn-card" role="dialog" aria-modal="true" aria-label="Connect a wallet">' +
        '<h3>Connect a wallet</h3>' +
        '<p>Signs you in only. The launchpad is a UI preview — it has no contracts and cannot move funds.</p>';
      if (!list.length) {
        body += '<p>No browser wallet found. Install ' +
          '<a href="https://metamask.io/download/" target="_blank" rel="noopener">MetaMask</a>, ' +
          '<a href="https://phantom.com/download" target="_blank" rel="noopener">Phantom</a> or ' +
          '<a href="https://robinhood.com/wallet/" target="_blank" rel="noopener">Robinhood Wallet</a>, then reload.</p>';
      } else {
        body += list.map(function (w, i) {
          var ic = w.icon ? '<img src="' + esc(w.icon) + '" alt="" />' : '<span class="ph"></span>';
          return '<button class="lpn-w" data-i="' + i + '">' + ic + '<span>' + esc(w.name) + '</span></button>';
        }).join('');
      }
      body += '<button class="lpn-x">cancel</button></div>';
      ov.innerHTML = body;
      document.body.appendChild(ov);

      function done(p) {
        document.removeEventListener('keydown', onKey);
        ov.remove();
        resolve(p);
      }
      function onKey(ev) { if (ev.key === 'Escape') done(null); }
      document.addEventListener('keydown', onKey);

      ov.addEventListener('click', function (ev) { if (ev.target === ov) done(null); });
      ov.querySelectorAll('.lpn-w').forEach(function (b) {
        b.addEventListener('click', function () {
          done(list[parseInt(b.getAttribute('data-i'), 10)].provider);
        });
      });
      ov.querySelector('.lpn-x').addEventListener('click', function () { done(null); });

      var first = ov.querySelector('.lpn-w') || ov.querySelector('.lpn-x');
      if (first) first.focus();
    });
  }

  var buttons = [];      /* every header slot on the page keeps its own button */

  function paint() {
    buttons.forEach(function (b) {
      if (account) {
        b.classList.add('on');
        b.innerHTML = '<span class="dot"></span>' + esc(short(account));
        b.setAttribute('aria-label', 'Wallet ' + account + ' — open wallet menu');
      } else {
        b.classList.remove('on');
        b.textContent = 'Connect wallet';
        b.setAttribute('aria-label', 'Connect wallet');
      }
    });
  }

  function setAccount(a) {
    account = a || null;
    paint();
    try {
      if (account) localStorage.setItem('vlad_connected', '1');
      else localStorage.removeItem('vlad_connected');
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('vlad:account', { detail: account }));
  }

  function bind(p) {
    if (!p || !p.on || p._lpnBound) return;
    p._lpnBound = true;
    p.on('accountsChanged', function (accs) { setAccount(accs && accs[0]); });
  }

  async function connect() {
    var prov = await pickWallet();
    if (!prov) return;
    chosen = prov;
    try {
      var accs = await prov.request({ method: 'eth_requestAccounts' });
      setAccount(accs && accs[0]);
      bind(prov);
      var picked = wallets().filter(function (w) { return w.provider === prov; })[0];
      if (picked && picked.rdns) { try { localStorage.setItem('vlad_wallet', picked.rdns); } catch (e) {} }
    } catch (e) {
      /* user rejected the request in their wallet — nothing to report */
    }
  }

  function buildWallet(slot) {
    var wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.style.flex = 'none';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lpn-btn';
    wrap.appendChild(btn);
    buttons.push(btn);

    var menu = document.createElement('div');
    menu.className = 'lpn-menu';
    menu.hidden = true;
    wrap.appendChild(menu);
    slot.appendChild(wrap);

    function closeMenu() { menu.hidden = true; }

    btn.addEventListener('click', function () {
      if (!account) { connect(); return; }
      menu.innerHTML =
        '<div class="lpn-addr">' + esc(account) + '</div>' +
        '<button data-copy>Copy address</button>' +
        '<button data-off>Disconnect</button>';
      menu.hidden = !menu.hidden;
      menu.querySelector('[data-copy]').addEventListener('click', function () {
        try { navigator.clipboard.writeText(account); } catch (e) {}
        closeMenu();
      });
      menu.querySelector('[data-off]').addEventListener('click', function () {
        /* a dapp cannot revoke access itself — this forgets the session and
           the wallet stays connected in the extension until revoked there */
        chosen = null;
        try { localStorage.removeItem('vlad_wallet'); } catch (e) {}
        setAccount(null);
        closeMenu();
      });
    });

    document.addEventListener('click', function (ev) {
      if (!wrap.contains(ev.target)) closeMenu();
    });
  }

  /* Restore a previous session without a popup: eth_accounts never prompts.
     Only runs when the user connected here or on the swap page before. */
  function restore() {
    var was = false;
    try { was = localStorage.getItem('vlad_connected') === '1'; } catch (e) {}
    if (!was) return;

    function tryRestore() {
      var rdns = null;
      try { rdns = localStorage.getItem('vlad_wallet'); } catch (e) {}
      var picked = rdns ? wallets().filter(function (w) { return w.rdns === rdns; })[0] : null;
      var p = picked ? picked.provider : (wallets()[0] || {}).provider || window.ethereum;
      if (!p || !p.request) return;
      chosen = p;
      p.request({ method: 'eth_accounts' }).then(function (accs) {
        if (accs && accs[0]) { account = accs[0]; paint(); bind(p); }
      }).catch(function () {});
    }
    /* wallets announce themselves asynchronously — give them a tick */
    setTimeout(tryRestore, 120);
  }

  /* The wallet this module picked, for anything else on the page that needs to
     sign — launchpad-chain.js reads it rather than reaching for window.ethereum,
     so a user with several wallets installed keeps the one they chose. */
  window.VladWallet = {
    provider: function () { return chosen || window.ethereum || null; },
    account: function () { return account; },
    connect: connect
  };

  /* ---------------------------------------------------------------
     mount
  --------------------------------------------------------------- */
  Array.prototype.forEach.call(slots, function (slot) {
    slot.classList.add('lpn');
    buildSearch(slot);
    buildWallet(slot);
  });
  paint();
  restore();
})();
