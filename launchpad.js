/* ============================================================
   VLADHOOD LAUNCHPAD — shared demo data + helpers.

   >>> THIS IS A UI PREVIEW. <<<
   There are no smart contracts behind this launchpad. Every meme,
   address, price, chart point and trade below is INVENTED demo data
   generated in the browser. Nothing here reads or writes a chain,
   no sale is open, no funds can be raised, sent or received.
   Pages consuming this module MUST show VladLaunchpad.DISCLAIMER
   (or their own equally unmissable notice) and MUST NOT wire the
   launch / join / trade buttons to anything that moves money —
   they should open a modal saying "this is a UI preview".

   Exposes window.VladLaunchpad:
     .memes            array of meme objects
     .get(id)          one meme, or null
     .byStatus(s)      memes filtered by 'upcoming' | 'live' | 'finished'
     .avatar(meme,size) inline SVG string (hand-drawn face)
     .fmt              { eth, usd, pct, compact, timeLeft, ago, addr }
     .DEMO             always true
     .DISCLAIMER       one-line notice
     .DISCLAIMER_LONG  paragraph notice
     .MODAL_COPY       text for the "you pressed a button" modal

   Note on fmt.eth(n): it returns the number WITH the unit, e.g.
   "12.40 ETH" — do not append " ETH" yourself.

   Vanilla JS, IIFE, zero dependencies.
   ============================================================ */
(function () {
  'use strict';

  var INK = '#2b2620';
  var HOUR = 3600e3, DAY = 24 * HOUR, MIN = 60e3;
  var NOW = Date.now();                 /* frozen at load: every timestamp is relative to this */
  var VLAD_USD = 10;                    /* fabricated reference price used only to derive demo market caps */

  /* ============================================================
     Deterministic randomness — seeded from the meme id so charts,
     trades and holder tables never jump between reloads.
     ============================================================ */
  function hash(str) {
    var h = 2166136261, i;
    for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function round(n, d) { var f = Math.pow(10, d); return Math.round(n * f) / f; }
  function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
  function hex(rnd, n) {
    var s = '', i, d = '0123456789abcdef';
    for (i = 0; i < n; i++) s += d.charAt(Math.floor(rnd() * 16));
    return s;
  }
  function fakeAddr(rnd) { return '0x' + hex(rnd, 4) + '...' + hex(rnd, 4); }

  /* ============================================================
     Formatting helpers
     ============================================================ */
  function stripZeros(s) {
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }
  function oneDp(x) { return stripZeros(x.toFixed(1)); }

  /* tiny numbers without scientific notation: 0.0000242 stays 0.0000242 */
  function tiny(a) {
    var e = Math.floor(Math.log10(a));
    var dec = Math.min(18, Math.max(2, -e + 2));
    return stripZeros(a.toFixed(dec));
  }

  function compact(n) {
    if (n == null || isNaN(n)) return '0';
    var a = Math.abs(n), sign = n < 0 ? '-' : '';
    if (a >= 1e12) return sign + oneDp(a / 1e12) + 'T';
    if (a >= 1e9) return sign + oneDp(a / 1e9) + 'B';
    if (a >= 1e6) return sign + oneDp(a / 1e6) + 'M';
    if (a >= 1e3) return sign + oneDp(a / 1e3) + 'K';
    if (a >= 1) return sign + stripZeros(a.toFixed(a < 100 ? 2 : 0));
    if (a === 0) return '0';
    return sign + tiny(a);
  }

  function usd(n) {
    if (n == null || isNaN(n)) return '$0';
    var a = Math.abs(n), sign = n < 0 ? '-' : '';
    if (a >= 1e3) return sign + '$' + compact(a);
    if (a >= 1) return sign + '$' + a.toFixed(2);
    if (a === 0) return '$0';
    return sign + '$' + tiny(a);
  }

  function eth(n) {
    if (n == null || isNaN(n)) return '0 ETH';
    var a = Math.abs(n), sign = n < 0 ? '-' : '', s;
    if (a >= 1000) s = compact(a);
    else if (a >= 1) s = a.toFixed(2);
    else if (a >= 0.001) s = stripZeros(a.toFixed(3));
    else s = tiny(a);
    return sign + s + ' ETH';
  }

  function pct(n) {
    if (n == null || isNaN(n)) return '0.00%';
    return (n > 0 ? '+' : n < 0 ? '-' : '') + Math.abs(n).toFixed(2) + '%';
  }

  function timeLeft(ts) {
    var d = ts - Date.now();
    if (d <= 0) return 'now';
    var s = Math.floor(d / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), day = Math.floor(h / 24);
    if (day > 0) return day + 'd ' + (h % 24) + 'h ' + (m % 60) + 'm';
    if (h > 0) return h + 'h ' + (m % 60) + 'm';
    if (m > 0) return m + 'm ' + (s % 60) + 's';
    return s + 's';
  }

  function ago(ts) {
    var d = Date.now() - ts;
    if (d < 0) return 'in ' + timeLeft(ts);
    var s = Math.floor(d / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), day = Math.floor(h / 24);
    if (s < 20) return 'just now';
    if (m < 1) return s + 's ago';
    if (h < 1) return m + 'm ago';
    if (day < 1) return h + 'h ago';
    if (day < 30) return day + 'd ago';
    return Math.floor(day / 30) + 'mo ago';
  }

  function addr(a) {
    if (!a) return '';
    if (a.indexOf('...') > -1) return a;               /* already shortened */
    if (a.length <= 13) return a;
    return a.slice(0, 6) + '...' + a.slice(-4);
  }

  var fmt = { eth: eth, usd: usd, pct: pct, compact: compact, timeLeft: timeLeft, ago: ago, addr: addr };

  /* ============================================================
     Avatars — small hand-drawn faces, one per 'kind'.
     Ink outline #2b2620 at 2.5px on a circle of meme.avatar.bg.
     ============================================================ */
  function dot(x, y, r, fill) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + (fill || INK) + '" stroke="none"/>';
  }

  var FACES = {
    doge: [
      '<path d="M19 26 14 10 30 19Z" fill="#e0b978"/>',
      '<path d="M45 26 50 10 34 19Z" fill="#e0b978"/>',
      '<ellipse cx="32" cy="34" rx="18" ry="16" fill="#f2d9a5"/>',
      '<ellipse cx="32" cy="41.5" rx="9.5" ry="7" fill="#fff7e8"/>',
      '<path d="M21 25c2-1.7 5-1.7 7 .2M43 25c-2-1.7-5-1.7-7 .2" stroke-width="2"/>',
      dot(25.5, 31, 2.8), dot(38.5, 31, 2.8),
      '<path d="M28.6 38.8h6.8L32 42.3z" fill="' + INK + '" stroke="none"/>',
      '<path d="M32 42.3v1.6M32 43.9c-.5 2.2-3 2.8-4.6 1.4M32 43.9c.5 2.2 3 2.8 4.6 1.4" stroke-width="2"/>'
    ],
    shiba: [
      '<path d="M18 25 17 11 29 18Z" fill="#d9a05b"/>',
      '<path d="M46 25 47 11 35 18Z" fill="#d9a05b"/>',
      '<path d="M13 33c0-10 8.5-17 19-17s19 7 19 17-8.5 18-19 18-19-8-19-18z" fill="#f7e6c6"/>',
      '<ellipse cx="32" cy="40" rx="11.5" ry="8" fill="#fffdf6"/>',
      dot(20.5, 38, 3.2, '#f0a3a3'), dot(43.5, 38, 3.2, '#f0a3a3'),
      dot(25, 31.5, 2.7), dot(39, 31.5, 2.7),
      '<ellipse cx="32" cy="37.5" rx="3" ry="2.2" fill="' + INK + '" stroke="none"/>',
      '<path d="M29.6 43.4h4.8v3.4a2.4 2.4 0 0 1-4.8 0z" fill="#e8737d"/>',
      '<path d="M32 39.7v1.5M32 41.2c-.5 2-3 2.6-4.6 1.2M32 41.2c.5 2 3 2.6 4.6 1.2" stroke-width="2"/>'
    ],
    pepe: [
      '<path d="M11 35c0-9 9.5-16 21-16s21 7 21 16-9.5 17-21 17S11 44 11 35z" fill="#7fbf5a"/>',
      '<circle cx="22.5" cy="30" r="7.5" fill="#fffdf3"/>',
      '<circle cx="41.5" cy="30" r="7.5" fill="#fffdf3"/>',
      dot(24, 31, 3), dot(43, 31, 3),
      dot(29.5, 37, 1.2), dot(34.5, 37, 1.2),
      '<path d="M19 41q13 8 26 0" stroke-width="2.5"/>',
      '<path d="M32 2 44 20H20z" fill="#5b4a8a"/>',
      '<path d="M16 20h32" stroke-width="3"/>',
      '<path d="M32 8.5l1.5 3.2 3.4.4-2.5 2.3.7 3.3-3.1-1.7-3.1 1.7.7-3.3-2.5-2.3 3.4-.4z" fill="#e0a51e" stroke="none"/>'
    ],
    coin: [
      '<path d="M17 8l5 7 10-10 10 10 5-7v11H17z" fill="#e0a51e"/>',
      dot(17, 6.5, 2, '#c0392b'), dot(47, 6.5, 2, '#c0392b'),
      '<circle cx="32" cy="37" r="18" fill="#f2c14e"/>',
      '<circle cx="32" cy="37" r="13.5" stroke-width="2"/>',
      '<text x="32" y="45.5" text-anchor="middle" font-family="\'Permanent Marker\',cursive" font-size="22" fill="' + INK + '" stroke="none">$</text>',
      '<path d="M10 26l1.4 3.1 3.1 1.4-3.1 1.4L10 35l-1.4-3.1L5.5 30.5l3.1-1.4z" fill="#fff3c4" stroke="none"/>',
      '<path d="M54 42l1.1 2.4 2.4 1.1-2.4 1.1L54 49l-1.1-2.4-2.4-1.1 2.4-1.1z" fill="#fff3c4" stroke="none"/>'
    ],
    raccoon: [
      '<circle cx="17" cy="20" r="6.5" fill="#b9b3a6"/>',
      '<circle cx="47" cy="20" r="6.5" fill="#b9b3a6"/>',
      '<path d="M14 33c0-9 8-15 18-15s18 6 18 15-8 18-18 18-18-9-18-18z" fill="#cfc9bb"/>',
      '<path d="M16 29q16-6 32 0 2 6-4 8.5-12 3-24 0Q14 35 16 29z" fill="' + INK + '" stroke="none"/>',
      dot(24.5, 32, 3.4, '#fffdf3'), dot(39.5, 32, 3.4, '#fffdf3'),
      dot(24.5, 32, 1.6), dot(39.5, 32, 1.6),
      '<ellipse cx="32" cy="42.5" rx="8" ry="5.5" fill="#fffaf0"/>',
      '<path d="M29.5 39.5h5L32 42.5z" fill="' + INK + '" stroke="none"/>',
      '<path d="M32 42.5v1.6M32 44.1c-.5 1.9-2.5 2.4-3.9 1.2M32 44.1c.5 1.9 2.5 2.4 3.9 1.2" stroke-width="2"/>'
    ],
    cat: [
      '<path d="M17 24 14 6 29 16Z" fill="#c68b5e"/>',
      '<path d="M47 24 50 6 35 16Z" fill="#c68b5e"/>',
      '<circle cx="32" cy="34" r="17" fill="#e2a878"/>',
      '<path d="M15 27c3-9 10-14 17-14s14 5 17 14c-6-5-11-7-17-7s-11 2-17 7z" fill="#4f7f3a"/>',
      '<path d="M45 17.5c3-6.5 8.5-8 11.5-7.5-1.5 4.5-5.5 7.5-9.5 8.5z" fill="#c0392b"/>',
      '<path d="M22 33q4-4 8 0M34 33q4-4 8 0" stroke-width="2.2"/>',
      '<path d="M29.5 38h5L32 41z" fill="#c0392b" stroke="none"/>',
      '<path d="M32 41v1.5M32 42.5c-.5 2-2.7 2.6-4.1 1.4M32 42.5c.5 2 2.7 2.6 4.1 1.4" stroke-width="2"/>',
      '<path d="M13 36h7M13 41h7M51 36h-7M51 41h-7" stroke-width="1.8"/>'
    ],
    monk: [
      '<circle cx="32" cy="29.5" r="15.5" fill="#f0c9a0"/>',
      '<path d="M16.8 35.5c-2.2-8.5.6-16 6.4-19.5-2.8 5.5-3.8 12.5-2.2 19.5z" fill="#8a6b4a"/>',
      '<path d="M47.2 35.5c2.2-8.5-.6-16-6.4-19.5 2.8 5.5 3.8 12.5 2.2 19.5z" fill="#8a6b4a"/>',
      '<path d="M23.5 27.5q3.6-3.6 7.2 0M33.3 27.5q3.6-3.6 7.2 0" stroke-width="2.2"/>',
      dot(22.8, 33.5, 3, '#e8898f'), dot(41.2, 33.5, 3, '#e8898f'),
      '<circle cx="32" cy="32" r="2.5" fill="#d98b6b"/>',
      '<path d="M26 35.8q6 7.5 12 0" stroke-width="2.4"/>',
      '<path d="M16 52c3-6.5 8.5-9 16-9s13 2.5 16 9z" fill="#8a5a2b"/>',
      '<path d="M32 45.5v6M29.6 47.6h4.8" stroke="#e0a51e" stroke-width="2.2"/>'
    ],
    ape: [
      '<circle cx="14" cy="33" r="6.5" fill="#a08a72"/>',
      '<circle cx="50" cy="33" r="6.5" fill="#a08a72"/>',
      '<path d="M14 31c0-9 8-16 18-16s18 7 18 16-8 19-18 19-18-10-18-19z" fill="#8d7460"/>',
      '<path d="M20 35c0-6 5.5-10 12-10s12 4 12 10-5.5 14-12 14-12-8-12-14z" fill="#e3c39c"/>',
      '<path d="M22 29q10-5.5 20 0" stroke-width="2.4"/>',
      dot(26, 34, 2.6), dot(38, 34, 2.6),
      dot(29.5, 39, 1.3), dot(34.5, 39, 1.3),
      '<path d="M25.5 42.5q6.5 5.5 13 0" stroke-width="2.2"/>'
    ],
    fox: [
      '<path d="M16 24 13 8 28 16Z" fill="#e0813c"/>',
      '<path d="M48 24 51 8 36 16Z" fill="#e0813c"/>',
      '<path d="M13 8l1 4.9 3.6-2.6z" fill="' + INK + '" stroke="none"/>',
      '<path d="M51 8l-1 4.9-3.6-2.6z" fill="' + INK + '" stroke="none"/>',
      '<path d="M14 31c0-8 8-14 18-14s18 6 18 14c0 10-9 21-18 21s-18-11-18-21z" fill="#ef9a4d"/>',
      '<ellipse cx="32" cy="43" rx="7.5" ry="5.5" fill="#fff6e6"/>',
      dot(25, 31, 2.7), dot(39, 31, 2.7),
      '<path d="M18 36q2.5 1.5 5.5 1M46 36q-2.5 1.5-5.5 1" stroke-width="1.8"/>',
      '<path d="M29.6 40.6h4.8L32 43.6z" fill="' + INK + '" stroke="none"/>',
      '<path d="M32 43.6v1.4M32 45c-.5 1.8-2.4 2.3-3.7 1.1M32 45c.5 1.8 2.4 2.3 3.7 1.1" stroke-width="2"/>',
      '<circle cx="47" cy="22" r="3.4" fill="#c0392b"/>',
      dot(47, 22, 1.1, '#f2c14e')
    ],
    owl: [
      '<path d="M16 19 14 6 26 14Z" fill="#a0785a"/>',
      '<path d="M48 19 50 6 38 14Z" fill="#a0785a"/>',
      '<path d="M13 32c0-10 8.5-17 19-17s19 7 19 17-8.5 20-19 20-19-10-19-20z" fill="#b98d63"/>',
      '<circle cx="23.5" cy="30" r="8.5" fill="#fff8e8"/>',
      '<circle cx="40.5" cy="30" r="8.5" fill="#fff8e8"/>',
      dot(23.5, 30, 4), dot(40.5, 30, 4),
      dot(25.2, 28.4, 1.4, '#fffdf6'), dot(42.2, 28.4, 1.4, '#fffdf6'),
      '<path d="M32 33l4 6-4 3.2-4-3.2z" fill="#e0a51e"/>',
      '<path d="M17 38q3 9.5 8 12M47 38q-3 9.5-8 12" stroke-width="2"/>',
      '<path d="M26 47q3 3 6 0 3 3 6 0" stroke-width="1.8"/>'
    ]
  };

  function avatar(meme, size) {
    size = size || 64;
    var av = (meme && meme.avatar) || {};
    var kind = FACES[av.kind] ? av.kind : 'coin';
    var bg = av.bg || '#e8d9a8';
    var label = ((meme && meme.name) || 'meme') + ' avatar';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="' + size + '" height="' + size +
      '" role="img" aria-label="' + label + '" style="display:block;overflow:visible">' +
      '<circle cx="32" cy="32" r="30" fill="' + bg + '" stroke="' + INK + '" stroke-width="2.5"/>' +
      '<g fill="none" stroke="' + INK + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      FACES[kind].join('') + '</g></svg>';
  }

  /* ============================================================
     Generated detail — chart, trades, holders (all seeded by id)
     ============================================================ */
  function easeS(k) { return k * k * (3 - 2 * k); }

  function makeChart(m, seed, n) {
    var rnd = rng(seed ^ 0x9e3779b9);
    n = n || 40;
    var end = m.status === 'finished' ? m.endsAt : NOW;
    var span = DAY;
    var p1 = m.priceVlad;
    var p0 = p1 / (1 + (m.change24h || 0) / 100);
    var pts = [], drift = 0, i, k, base, wobble, hump;
    for (i = 0; i < n; i++) {
      k = n === 1 ? 1 : i / (n - 1);
      /* S-curve between open and close, plus a mid-run hump so it is not a ruler */
      hump = Math.sin(k * Math.PI) * (rnd() * 0.06 + 0.02) * (m.change24h >= 0 ? 1 : -1);
      base = p0 + (p1 - p0) * easeS(k);
      drift = drift * 0.7 + (rnd() - 0.5) * 0.06;
      wobble = 1 + (drift + hump) * (1 - k * 0.9);
      pts.push({ t: Math.round(end - span + span * k), p: Math.max(base * wobble, p1 * 0.12) });
    }
    pts[n - 1] = { t: end, p: p1 };
    return pts;
  }

  function makeTrades(m, seed, n) {
    var rnd = rng(seed ^ 0x51ed2701);
    var end = m.status === 'finished' ? m.endsAt : NOW;
    var t = end - Math.round(rnd() * 6 * MIN);
    var buyBias = m.status === 'upcoming' ? 1 : (m.change24h >= 0 ? 0.68 : 0.4);
    var out = [], i, side, e, amount;
    for (i = 0; i < n; i++) {
      side = rnd() < buyBias ? 'buy' : 'sell';
      e = round(0.015 + rnd() * rnd() * 2.6, 3);
      amount = Math.round(e / m.priceVlad * (0.95 + rnd() * 0.1));
      out.push({ side: side, eth: e, amount: amount, ts: t });
      t -= Math.round((2 + rnd() * 52) * MIN);
    }
    return out;
  }

  var HOLDER_LABELS = [
    'LP (locked)', 'Merry Men treasury', 'Early bandit', 'Sherwood whale',
    'Tavern fund', 'Arrow smith', 'Friar’s pie fund', 'Nottingham anon'
  ];

  function makeHolders(m, seed) {
    var rnd = rng(seed ^ 0x2545f491);
    var out = [{ addr: m.creator, pct: round(7 + rnd() * 7, 2), label: 'Creator' }];
    var p = out[0].pct, labels = HOLDER_LABELS.slice(), i, li;
    for (i = 1; i < 5; i++) {
      p = p * (0.52 + rnd() * 0.34);
      li = Math.floor(rnd() * labels.length) % labels.length;
      out.push({ addr: fakeAddr(rnd), pct: round(p, 2), label: labels.splice(li, 1)[0] });
    }
    return out;
  }

  /* ============================================================
     The 10 demo memes.
     startIn = hours from load (negative = already started)
     durH    = sale length in hours
     ============================================================ */
  var SPEC = [
    /* ---------------- LIVE ---------------- */
    {
      id: 'bandit-raccoon', name: 'BANDIT RACCOON', symbol: 'BANDIT',
      tagline: 'Came for the loot. Stayed for the snacks.',
      about: 'Wears the mask full-time, which the Sheriff considers suspicious and the raccoon considers a fashion statement. ' +
        'Robs the tax cart at midnight, robs the tavern bins at one, and is asleep in a hollow log by two. Has never returned ' +
        'a single borrowed item, but leaves a shiny bottle cap every time, which he insists is an exchange rate.',
      kind: 'raccoon', bg: '#d9d3e8', status: 'live',
      softCap: 15, hardCap: 40, raised: 22.4, startIn: -6.5, durH: 48,
      supply: 1.5e9, decimals: 18, price: 0.0000317, change24h: 38.2,
      taxBuy: 2, taxSell: 3, lpLocked: false, lockMonths: 0, verified: false,
      holdersCount: 612, participants: 388, up: 58, votes: 1204, poolEth: 15.7
    },
    {
      id: 'meow-hood', name: 'MEOW HOOD', symbol: 'MEOW',
      tagline: 'Steals from the rich. Naps on the poor.',
      about: 'Sherwood’s smallest outlaw and its loudest one. Claims to have single-pawed-ly liberated forty carts of gold; ' +
        'witnesses report one dropped sausage and a lot of confidence. Wears a tiny green hood with a tiny red feather and will ' +
        'bite you if you mention the tiny bit where the feather is bent.',
      kind: 'cat', bg: '#f7c9c9', status: 'live',
      softCap: 12, hardCap: 25, raised: 24.1, startIn: -19, durH: 24,
      supply: 888e6, decimals: 18, price: 0.0000701, change24h: -6.4,
      taxBuy: 0, taxSell: 1, lpLocked: true, lockMonths: 9, verified: true,
      holdersCount: 1244, participants: 903, up: 84, votes: 741, poolEth: 18.8
    },
    {
      id: 'arrow-ape', name: 'ARROW APE', symbol: 'ARROW',
      tagline: 'Bullseye. Every time. Eventually.',
      about: 'Undefeated champion of the Nottingham archery fair, mostly because nobody wants to tell him he lost. Draws a bow ' +
        'the size of a fence post and fires it roughly in the direction of the target, the county, and the general concept of hope. ' +
        'Holds the record for the longest shot and also for the most windows.',
      kind: 'ape', bg: '#e8c9a0', status: 'live',
      softCap: 30, hardCap: 75, raised: 41.6, startIn: -2.2, durH: 12,
      supply: 6.9e9, decimals: 18, price: 0.0000129, change24h: 21.7,
      taxBuy: 1, taxSell: 1, lpLocked: true, lockMonths: 18, verified: true,
      holdersCount: 806, participants: 522, up: 91, votes: 466, poolEth: 29.2
    },
    /* ---------------- UPCOMING ---------------- */
    {
      id: 'hood-doge', name: 'HOOD DOGE', symbol: 'DOGE',
      tagline: 'The goodest boy in Sherwood.',
      about: 'Robs from the rich and buries it in the poor’s back garden, which everyone agrees is technically redistribution. ' +
        'Eleven seasons on watch at the Great Oak and not one tax collector has walked past without receiving a very stern boop. ' +
        'Fetches arrows. Fetches liquidity. Mostly fetches arrows.',
      kind: 'doge', bg: '#a8d5a2', status: 'live',
      softCap: 10, hardCap: 20, raised: 7.8, startIn: -9, durH: 48,
      supply: 1e9, decimals: 18, price: 0.0000242, change24h: 12.45,
      taxBuy: 0, taxSell: 0, lpLocked: true, lockMonths: 11, verified: true,
      holdersCount: 940, participants: 260, up: 92, votes: 124, poolEth: 12.4
    },
    {
      id: 'mage-pepe', name: 'MAGE PEPE', symbol: 'PEPE',
      tagline: 'Rare frog. Rarer robes.',
      about: 'Third-year dropout of the Nottingham College of Damp Magic, expelled for turning the Sheriff’s ledger into ' +
        'a pond. Now lives under the footbridge casting exactly two spells: one that summons fog for a getaway, and one that ' +
        'makes flies land closer. Insists the hat is load-bearing.',
      kind: 'pepe', bg: '#cfe3f7', status: 'live',
      softCap: 25, hardCap: 60, raised: 21.6, startIn: -16, durH: 42,
      supply: 4.2e9, decimals: 18, price: 0.00000915, change24h: 4.8,
      taxBuy: 1, taxSell: 1, lpLocked: true, lockMonths: 12, verified: true,
      holdersCount: 1620, participants: 530, up: 76, votes: 318, poolEth: 27.9
    },
    {
      id: 'sir-hoots-a-lot', name: 'SIR HOOTS-A-LOT', symbol: 'HOOTS',
      tagline: 'Night watch of the north woods.',
      about: 'Sees everything, says most of it. Perched on the tallest oak from dusk until the tavern closes, hooting a running ' +
        'commentary on every cart, patrol and questionable haircut that passes below. Has strong opinions on governance, an ' +
        'unblinking stare, and absolutely no volume control.',
      kind: 'owl', bg: '#f6d9a8', status: 'live',
      softCap: 8, hardCap: 16, raised: 9.4, startIn: -27, durH: 40,
      supply: 420e6, decimals: 18, price: 0.0000488, change24h: -2.1,
      taxBuy: 0, taxSell: 2, lpLocked: true, lockMonths: 3, verified: false,
      holdersCount: 780, participants: 240, up: 63, votes: 97, poolEth: 14.1
    },
    /* ---------------- FINISHED ---------------- */
    {
      id: 'lord-vlad', name: 'LORD $VLAD', symbol: 'LORDV',
      tagline: 'The one who started the whole racket.',
      about: 'Rode into the forest with nothing but a bow, a hood and an unbeatable grin, and rode out owning the road toll. ' +
        'Every outlaw in this list learned the trade at his campfire, and every one of them still owes him for dinner. ' +
        'Chapter one of the Sherwood ledger, and the only page anyone has ever read twice.',
      kind: 'coin', bg: '#f2d98a', status: 'finished',
      softCap: 40, hardCap: 80, raised: 80, startIn: -24 * 41, durH: 72,
      supply: 1e9, decimals: 18, price: 0.000242, change24h: 7.3,
      taxBuy: 0, taxSell: 0, lpLocked: true, lockMonths: 24, verified: true,
      holdersCount: 4820, participants: 1560, up: 96, votes: 2418, poolEth: 96.4
    },
    {
      id: 'friar-tuck-inu', name: 'FRIAR TUCK INU', symbol: 'TUCK',
      tagline: 'Blesses your bags. Eats your snacks.',
      about: 'The forest’s chaplain, cellarman and heavyweight champion, in ascending order of seriousness. Will pray over ' +
        'your venture, feed you until you cannot run from the Sheriff, and then flatten the Sheriff himself. The five percent ' +
        'sell tithe goes entirely to the pie fund, and the pie fund has never once been audited.',
      kind: 'monk', bg: '#e6dcc2', status: 'finished',
      softCap: 20, hardCap: 45, raised: 45, startIn: -24 * 12, durH: 48,
      supply: 750e6, decimals: 18, price: 0.0000556, change24h: -11.8,
      taxBuy: 0, taxSell: 5, lpLocked: true, lockMonths: 14, verified: true,
      holdersCount: 2130, participants: 940, up: 71, votes: 862, poolEth: 52.5
    },
    {
      id: 'sherwood-shiba', name: 'SHERWOOD SHIBA', symbol: 'SHIBA',
      tagline: 'Much forest. Very outlaw.',
      about: 'Arrived in Sherwood by accident, stayed because the sticks are excellent. Runs point on every ambush and then ' +
        'ruins it by wagging. What he lacks in stealth he makes up for in morale, which is why the Merry Men vote him ' +
        'quartermaster every single year despite the incident with the ham.',
      kind: 'shiba', bg: '#cde8d8', status: 'finished',
      softCap: 12, hardCap: 30, raised: 30, startIn: -(24 * 5 + 6), durH: 36,
      supply: 2.4e9, decimals: 18, price: 0.0000188, change24h: 64.9,
      taxBuy: 0, taxSell: 0, lpLocked: true, lockMonths: 10, verified: true,
      holdersCount: 3105, participants: 1180, up: 89, votes: 1533, poolEth: 36.8
    },
    {
      id: 'maid-marian-fox', name: 'MAID MARIAN FOX', symbol: 'MARIAN',
      tagline: 'Outsmarts the Sheriff before breakfast.',
      about: 'Does the part of the job that involves thinking. Walks into the castle through the front door, leaves with the ' +
        'guard rota, the pantry key and a compliment from the guard who handed both over. Has never fired an arrow in anger ' +
        'and has never needed to, which the archery-obsessed half of the camp finds deeply annoying.',
      kind: 'fox', bg: '#f2c4d8', status: 'finished',
      softCap: 18, hardCap: 36, raised: 27.3, startIn: -(24 * 2 + 3), durH: 24,
      supply: 1.1e9, decimals: 18, price: 0.0000401, change24h: -3.4,
      taxBuy: 0, taxSell: 1, lpLocked: true, lockMonths: 8, verified: true,
      holdersCount: 1490, participants: 615, up: 80, votes: 604, poolEth: 31.2
    },
    {
      id: 'tax-man-toad', name: 'TAX MAN TOAD', symbol: 'TOAD',
      tagline: 'Collects nothing. Returns everything.',
      about: 'Spent nine years as the Sheriff’s ledger clerk before working out that the numbers only ever moved one way. ' +
        'Now runs the same books backwards from a lily pad outside Nottingham, and the peasants have started calling the ' +
        'refunds "tax season". Still writes everything in triplicate, because old habits croak hard.',
      kind: 'pepe', bg: '#cfe8c9', status: 'live',
      softCap: 12, hardCap: 24, raised: 6.2, startIn: -5, durH: 36,
      supply: 1e9, decimals: 18, price: 0.0000188, change24h: 6.2,
      taxBuy: 0, taxSell: 0, lpLocked: true, lockMonths: 12, verified: true,
      holdersCount: 510, participants: 180, up: 88, votes: 97, poolEth: 9.6
    },
    {
      id: 'merry-mouse', name: 'MERRY MOUSE', symbol: 'MOUSE',
      tagline: 'Smallest outlaw. Loudest opinions.',
      about: 'Fits through the castle grate that defeated everyone else, which is the entire reason the last three heists ' +
        'worked and the entire reason nobody is allowed to mention the word "cheese" at camp meetings. Insists on being ' +
        'counted as a full share. Gets a full share.',
      kind: 'cat', bg: '#e8d4f2', status: 'live',
      softCap: 6, hardCap: 14, raised: 4.1, startIn: -21, durH: 48,
      supply: 8e8, decimals: 18, price: 0.0000094, change24h: 3.7,
      taxBuy: 0, taxSell: 0, lpLocked: true, lockMonths: 9, verified: true,
      holdersCount: 430, participants: 150, up: 84, votes: 58, poolEth: 6.8
    },
    {
      id: 'little-john-bear', name: 'LITTLE JOHN BEAR', symbol: 'JOHN',
      tagline: 'Holds the bridge. Holds the bags.',
      about: 'Named Little by a man he had just thrown into a river, which tells you most of what you need to know about how ' +
        'nicknames work in this forest. Has never sold. Has never been asked twice. Guards the bridge, the barrel and the ' +
        'liquidity with roughly equal enthusiasm.',
      kind: 'ape', bg: '#d8c3a5', status: 'live',
      softCap: 20, hardCap: 45, raised: 28.4, startIn: -14, durH: 40,
      supply: 1.2e9, decimals: 18, price: 0.0000355, change24h: 18.9,
      taxBuy: 0, taxSell: 0, lpLocked: true, lockMonths: 14, verified: true,
      holdersCount: 2130, participants: 812, up: 91, votes: 733, poolEth: 44.8
    },
    {
      id: 'friar-owl', name: 'FRIAR OWL', symbol: 'OWL',
      tagline: 'Sermons at dusk. Alpha at dawn.',
      about: 'Preaches patience to a congregation that has never once demonstrated any. Keeps the only accurate map of the ' +
        'forest inside his head and shares it strictly on a need-to-fly basis. Rumoured to have called the top of the last ' +
        'three acorn cycles, though he refuses to confirm anything before evensong.',
      kind: 'owl', bg: '#c9dcf0', status: 'live',
      softCap: 9, hardCap: 22, raised: 15.7, startIn: -6, durH: 30,
      supply: 9e8, decimals: 18, price: 0.0000211, change24h: -5.6,
      taxBuy: 0, taxSell: 0, lpLocked: true, lockMonths: 10, verified: true,
      holdersCount: 1180, participants: 470, up: 76, votes: 388, poolEth: 24.1
    },
    {
      id: 'golden-arrow', name: 'GOLDEN ARROW', symbol: 'GOLD',
      tagline: 'The prize everyone shot for.',
      about: 'The Sheriff commissioned it as bait for a tournament nobody was supposed to win, then watched a stranger in a ' +
        'hood put it through the centre of the target from ninety paces. It has changed hands eleven times since and spent ' +
        'exactly none of those nights in the castle.',
      kind: 'coin', bg: '#f4dfa0', status: 'finished',
      softCap: 25, hardCap: 50, raised: 50, startIn: -(24 * 4), durH: 24,
      supply: 5e8, decimals: 18, price: 0.0000912, change24h: 24.6,
      taxBuy: 0, taxSell: 0, lpLocked: true, lockMonths: 18, verified: true,
      holdersCount: 3240, participants: 1105, up: 95, votes: 1420, poolEth: 58.6
    }
  ];

  function build(spec) {
    var seed = hash(spec.id);
    var rnd = rng(seed);
    var startsAt = NOW + spec.startIn * HOUR;
    var m = {
      id: spec.id,
      name: spec.name,
      symbol: spec.symbol || String(spec.name || 'MEME').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/)[0].toUpperCase().slice(0, 8),
      tagline: spec.tagline,
      about: spec.about,
      status: spec.status,
      avatar: { bg: spec.bg, kind: spec.kind },
      softCap: spec.softCap,
      hardCap: spec.hardCap,
      raised: spec.raised,
      startsAt: Math.round(startsAt),
      endsAt: Math.round(startsAt + spec.durH * HOUR),
      creator: fakeAddr(rnd),
      contract: fakeAddr(rnd),
      supply: spec.supply,
      decimals: spec.decimals,
      priceVlad: spec.price,
      marketCap: Math.round(spec.price * spec.supply * VLAD_USD / 25) * 25,
      change24h: spec.change24h,
      taxBuy: spec.taxBuy,
      taxSell: spec.taxSell,
      lpLocked: spec.lpLocked,
      lockMonths: spec.lockMonths,
      verified: spec.verified,
      holdersCount: spec.holdersCount,
      participants: spec.participants,
      socials: { x: '#', tg: '#', web: '#' },
      sentiment: { up: spec.up, votes: spec.votes },
      topHolders: [],
      trades: [],
      chart: [],
      poolEth: spec.poolEth,
      poolToken: Math.round(spec.poolEth > 0 ? spec.supply * (0.18 + rnd() * 0.14) : 0)
    };
    m.topHolders = makeHolders(m, seed);
    m.trades = makeTrades(m, seed, 8);
    m.chart = makeChart(m, seed, 40);
    return m;
  }

  var memes = SPEC.map(build);

  function get(id) {
    for (var i = 0; i < memes.length; i++) if (memes[i].id === id) return memes[i];
    return null;
  }
  function byStatus(s) {
    return memes.filter(function (m) { return m.status === s; });
  }

  window.VladLaunchpad = {
    DEMO: true,
    DISCLAIMER: 'DEMO / UI PREVIEW — no smart contracts, no real sale, no funds involved. Every number on this page is invented.',
    DISCLAIMER_LONG: 'The Vladhood Launchpad is a design preview, not a product. There is no contract deployed behind ' +
      'it, nothing here touches a blockchain, and no token sale is open. All memes, addresses, prices, charts, trades ' +
      'and holder lists are fictional data generated in your browser for layout purposes. Do not send anyone money ' +
      'because of anything you read here.',
    MODAL_COPY: 'This is a UI preview. There is no contract, no sale and no wallet call behind this button — ' +
      'nothing was submitted and no funds moved. The launchpad is a mock-up of how a Sherwood-flavoured launch page ' +
      'could look, with entirely made-up data.',
    memes: memes,
    get: get,
    byStatus: byStatus,
    avatar: avatar,
    fmt: fmt
  };
})();
