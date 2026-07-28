/* ============================================================
   VLADHOOD LAUNCHPAD — the chain half.

   Everything the launchpad pages need to read from and write to the
   deployed contracts. Loads ethers from a CDN on first use, so a page
   that only ever reads demo data pays nothing for it.

   Exposes window.VladChain:
     .CONFIG            the deployment: chain, rpc, addresses, launch fee
     .ready()           resolves once ethers is loaded
     .reader()          read-only provider, no wallet needed
     .signer()          signer from the connected wallet, switching chain first
     .ensureChain()     asks the wallet to switch to (or add) the chain
     .launch(params)    sends launchToken, resolves to {hash, token, pool}
     .listTokens()      every token launched here, newest first
     .tokenInfo(addr)   one token: metadata, supply, pool, price, market cap
     .evmBlockNumber()  block.number AS A CONTRACT SEES IT — see the note below

   >>> Robinhood Chain reports two different block heights. <<<
   eth_blockNumber and the block.number a contract reads are not the same
   value — measured on the testnet, 94,248,962 against 11,367,095. Launch
   tokens block pool buys during their launch block and cap them for a few
   blocks after, so any countdown over that window MUST use evmBlockNumber().
   Comparing against the RPC height is wrong by tens of millions.

   Vanilla JS, IIFE, one lazy dependency.
   ============================================================ */
(function () {
  'use strict';

  var ETHERS_CDN = 'https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js';

  var CONFIG = {
    chainId: 46630,
    chainIdHex: '0xb626',
    chainName: 'Robinhood Chain Testnet',
    rpc: 'https://rpc.testnet.chain.robinhood.com',
    currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorer: '',
    contracts: {
      factory: '0x1a12745727fdc70046ac2a242A449b37403aeAb3',
      locker: '0x0C4AF79921aE71911e28ED2247DfE899c7AA9b6b'
    },
    uniswap: {
      factory: '0x2237B2e256B957c478773C7213BEA489867F7C47',
      positionManager: '0x2C03bee99EA556333B06D9f7208D0C488EC183C8',
      swapRouter: '0x6e3d348166b9dDE078B6Ae4714A2669Cb209C825',
      quoter: '0x0530404DcE91A97f68e21211EC53437492f45AB1',
      weth: '0xa94f9cC9617bc6aa03ad7A835D168BcD15125a40'
    },
    launchFee: '500000000000000',      /* 0.0005 ETH */
    dexId: 0,
    launchConfigId: 0,
    poolFee: 10000,
    /* every pool opens at this tick, so the starting price is known before the
       pool exists — which is what lets the form quote a launch buy */
    initialTick: -204200,
    tickSpacing: 200,
    supply: '1000000000000000000000000000',
    graduationThreshold: '4200000000000000000',
    protocolFeeShare: 30
  };

  var FACTORY_ABI = [
    'function launchToken((string name,string symbol,string logo,string description,(string twitter,string telegram,string discord,string website,string farcaster) socials,address feeWallet) params, uint256 launchConfigId, uint256 dexId, bytes32 salt) payable returns (address)',
    'function getLaunchedToken(address token) view returns ((address token,address deployer,address pairedToken,address positionManager,uint256 positionId,uint256 dexId,uint256 launchConfigId,uint256 restrictionsEndBlock,uint256 supply,bool isToken0,uint24 poolFee,bool exists,uint256 initialBuyAmount))',
    'function launchFee() view returns (uint256)',
    'function launchEnabled() view returns (bool)',
    'event TokenDeployed(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, uint256 dexId, uint256 launchConfigId)',
    'event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)'
  ];

  var TOKEN_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, (string twitter,string telegram,string discord,string website,string farcaster) tokenSocials)',
    'function restrictionEndBlock() view returns (uint256)',
    'function launchBlock() view returns (uint256)',
    'function liquidityPool() view returns (address)'
  ];

  var POOL_ABI = [
    'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)',
    'function token0() view returns (address)',
    'function token1() view returns (address)'
  ];

  var LOCKER_ABI = [
    'function feeRecipientOf(address token) view returns (address)',
    'function takenOver(address token) view returns (bool)',
    'function collectFees(address token) returns (uint256,uint256)'
  ];

  /* ---------------------------------------------------------------
     lazy dependency
  --------------------------------------------------------------- */
  var readyPromise = null;

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise(function (resolve, reject) {
      if (window.ethers) { resolve(window.ethers); return; }
      var s = document.createElement('script');
      s.src = ETHERS_CDN;
      s.async = true;
      s.onload = function () {
        if (window.ethers) resolve(window.ethers);
        else reject(new Error('ethers loaded but did not register'));
      };
      s.onerror = function () { reject(new Error('could not load ethers from the CDN')); };
      document.head.appendChild(s);
    });
    return readyPromise;
  }

  var _reader = null;

  async function reader() {
    var ethers = await ready();
    if (!_reader) _reader = new ethers.JsonRpcProvider(CONFIG.rpc, CONFIG.chainId, { staticNetwork: true });
    return _reader;
  }

  /* The height a contract sees, which is not the height eth_blockNumber
     reports on this chain. Bytecode: NUMBER PUSH0 MSTORE PUSH1 32 PUSH0 RETURN. */
  async function evmBlockNumber() {
    var p = await reader();
    var raw = await p.call({ data: '0x435f5260205ff3' });
    return BigInt(raw);
  }

  /* ---------------------------------------------------------------
     wallet
  --------------------------------------------------------------- */
  function walletProvider() {
    /* launchpad-nav.js owns wallet selection; fall back to the injected one */
    if (window.VladWallet && window.VladWallet.provider()) return window.VladWallet.provider();
    return window.ethereum || null;
  }

  async function ensureChain() {
    var eth = walletProvider();
    if (!eth) throw new Error('No wallet found. Install one, then reload this page.');
    var current = await eth.request({ method: 'eth_chainId' });
    if (String(current).toLowerCase() === CONFIG.chainIdHex) return;

    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CONFIG.chainIdHex }]
      });
    } catch (e) {
      /* 4902: the wallet does not know this chain yet */
      if (e && (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902))) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: CONFIG.chainIdHex,
            chainName: CONFIG.chainName,
            rpcUrls: [CONFIG.rpc],
            nativeCurrency: CONFIG.currency,
            blockExplorerUrls: CONFIG.explorer ? [CONFIG.explorer] : undefined
          }]
        });
        return;
      }
      throw e;
    }
  }

  async function signer() {
    var ethers = await ready();
    var eth = walletProvider();
    if (!eth) throw new Error('No wallet found. Install one, then reload this page.');
    await eth.request({ method: 'eth_requestAccounts' });
    await ensureChain();

    var provider = new ethers.BrowserProvider(eth, 'any');

    /* A wallet can report the switch as done before it has actually switched,
       or the user can dismiss the prompt and leave it where it was. Signing on
       the wrong chain calls an address with no contract at it, and the node
       answers with a revert carrying no data — which surfaces as "missing revert
       data" and names nothing. Check it here, where the message can be useful. */
    var net = await provider.getNetwork();
    if (Number(net.chainId) !== CONFIG.chainId) {
      throw new Error(
        'Your wallet is on chain ' + net.chainId + ', not ' + CONFIG.chainName +
        ' (' + CONFIG.chainId + '). Switch it and try again.'
      );
    }
    return provider.getSigner();
  }

  /* ---------------------------------------------------------------
     writing
  --------------------------------------------------------------- */
  /**
   * Launches a token. `params` takes { name, symbol, logo, description,
   * twitter, telegram, discord, website, farcaster, feeWallet, devBuyEth } —
   * the five socials are the five the token contract stores.
   * The dev buy is any value sent above the launch fee.
   */
  async function launch(params) {
    var ethers = await ready();
    var s = await signer();

    /* the deployment can be missing on a chain that otherwise looks right —
       a reset testnet, or a config pointed at the wrong network */
    var code = await s.provider.getCode(CONFIG.contracts.factory);
    if (!code || code === '0x') {
      throw new Error('No launchpad contract at ' + CONFIG.contracts.factory +
        ' on this chain. The deployment may have been reset.');
    }

    var factory = new ethers.Contract(CONFIG.contracts.factory, FACTORY_ABI, s);

    var fee = BigInt(CONFIG.launchFee);
    var devBuy = params.devBuyEth ? ethers.parseEther(String(params.devBuyEth)) : 0n;
    var me = await s.getAddress();

    /* the salt only has to be unique per token; the address is derived from it */
    var salt = ethers.id(
      [me, params.symbol || '', params.name || '', String(Date.now())].join('|')
    );

    var args = [
      {
        name: String(params.name || ''),
        symbol: String(params.symbol || ''),
        logo: String(params.logo || ''),
        description: String(params.description || ''),
        socials: {
          twitter: String(params.twitter || ''),
          telegram: String(params.telegram || ''),
          discord: String(params.discord || ''),
          website: String(params.website || ''),
          farcaster: String(params.farcaster || '')
        },
        feeWallet: params.feeWallet || me
      },
      CONFIG.launchConfigId,
      CONFIG.dexId,
      salt
    ];
    var overrides = { value: fee + devBuy };

    /* Balance first, and in plain terms. A wallet that cannot cover the value
       plus gas fails somewhere inside estimateGas, and the error that comes back
       says "missing revert data" — which names neither the wallet nor the
       shortfall, and sends you looking at the contract instead of the faucet. */
    var readProvider = await reader();
    var balance = await readProvider.getBalance(me);
    var gasCost = 8000000n * ((await readProvider.getFeeData()).gasPrice || 1000000n);
    var needed = fee + devBuy + gasCost;
    if (balance < needed) {
      throw new Error(
        'Not enough ETH on ' + me.slice(0, 6) + '…' + me.slice(-4) + '. It holds ' +
        ethers.formatEther(balance) + ' and this launch needs about ' +
        ethers.formatEther(needed) + ' — the ' + ethers.formatEther(fee) + ' fee' +
        (devBuy > 0n ? (', the ' + ethers.formatEther(devBuy) + ' developer buy') : '') +
        ' and gas.'
      );
    }

    /* Simulate against our own node rather than the wallet's. The wallet points
       at whichever RPC its network entry was added with, and a node that answers
       a reverted call without data turns every failure into the same unhelpful
       "missing revert data". Simulating here keeps the contract's own error. */
    try {
      var sim = new ethers.Contract(CONFIG.contracts.factory, FACTORY_ABI, readProvider);
      await sim.launchToken.staticCall.apply(null, args.concat([{ value: overrides.value, from: me }]));
    } catch (e) {
      var named = null;
      try { named = factory.interface.parseError(e.data || (e.info && e.info.error && e.info.error.data)); } catch (x) {}
      throw new Error(named ? ('The launchpad refused this launch: ' + named.name)
                            : ('The launch would fail: ' + (e.shortMessage || e.reason || e.message)));
    }

    /* The wallet may still estimate gas against its own node and refuse. Give it
       a limit taken from our node, so a wallet-side estimate cannot be the thing
       that stops a launch we have already proven works. */
    try {
      var gas = await sim.launchToken.estimateGas.apply(null, args.concat([{ value: overrides.value, from: me }]));
      overrides.gasLimit = (gas * 125n) / 100n;
    } catch (e) { /* fall back to the wallet's own estimate */ }

    var tx = await factory.launchToken.apply(null, args.concat([overrides]));
    var receipt = await tx.wait();
    var launched = null;
    for (var i = 0; i < receipt.logs.length; i++) {
      try {
        var parsed = factory.interface.parseLog(receipt.logs[i]);
        if (parsed && parsed.name === 'TokenLaunched') { launched = parsed.args; break; }
        if (parsed && parsed.name === 'TokenDeployed' && !launched) launched = parsed.args;
      } catch (e) { /* not one of ours */ }
    }

    return {
      hash: receipt.hash,
      token: launched ? launched.token : null,
      pool: launched && launched.pool ? launched.pool : null
    };
  }

  /* ---------------------------------------------------------------
     reading
  --------------------------------------------------------------- */
  async function listTokens(limit) {
    var ethers = await ready();
    var p = await reader();
    var factory = new ethers.Contract(CONFIG.contracts.factory, FACTORY_ABI, p);
    var events = await factory.queryFilter(factory.filters.TokenLaunched(), 0, 'latest');
    events.reverse();
    if (limit) events = events.slice(0, limit);
    return events.map(function (e) {
      return {
        token: e.args.token,
        deployer: e.args.deployer,
        pool: e.args.pool,
        pairToken: e.args.pairToken,
        positionId: e.args.positionId,
        blockNumber: e.blockNumber,
        txHash: e.transactionHash
      };
    });
  }

  /* price of one token in the paired asset, from the pool's current tick */
  function priceFromSqrt(sqrtPriceX96, tokenIsToken0) {
    var q96 = 2n ** 96n;
    var num = sqrtPriceX96 * sqrtPriceX96;
    /* token1 per token0, scaled by 1e18 to keep precision in integers */
    var priceX = (num * 10n ** 18n) / (q96 * q96);
    var asFloat = Number(priceX) / 1e18;
    if (!tokenIsToken0) return asFloat === 0 ? 0 : 1 / asFloat;
    return asFloat;
  }

  async function tokenInfo(address) {
    var ethers = await ready();
    var p = await reader();

    var token = new ethers.Contract(address, TOKEN_ABI, p);
    var factory = new ethers.Contract(CONFIG.contracts.factory, FACTORY_ABI, p);
    var locker = new ethers.Contract(CONFIG.contracts.locker, LOCKER_ABI, p);

    var results = await Promise.all([
      token.name(), token.symbol(), token.totalSupply(), token.getTokenInfo(),
      token.restrictionEndBlock(), factory.getLaunchedToken(address),
      locker.feeRecipientOf(address).catch(function () { return null; }),
      locker.takenOver(address).catch(function () { return false; })
    ]);

    var record = results[5];
    var info = {
      address: address,
      name: results[0],
      symbol: results[1],
      totalSupply: results[2],
      deployer: results[3][0],
      logo: results[3][1],
      description: results[3][2],
      socials: {
        twitter: results[3][3][0], telegram: results[3][3][1],
        discord: results[3][3][2], website: results[3][3][3], farcaster: results[3][3][4]
      },
      restrictionEndBlock: results[4],
      feeRecipient: results[6],
      takenOver: results[7],
      isToken0: record ? record.isToken0 : null,
      positionId: record ? record.positionId : null,
      pool: null,
      priceInPair: null,
      marketCapInPair: null,
      launchedAt: null
    };

    /* the launch time is not on the token, only in the event that created it */
    try {
      var fEvt = new ethers.Contract(CONFIG.contracts.factory, FACTORY_ABI, p);
      var hits = await fEvt.queryFilter(fEvt.filters.TokenLaunched(address), 0, 'latest');
      if (hits.length) {
        var blk = await p.getBlock(hits[0].blockNumber);
        if (blk) info.launchedAt = blk.timestamp * 1000;
      }
    } catch (e) { /* the page copes with a missing launch time */ }

    /* when it launched, from the factory's own event — the token itself only
       records a block number, and this chain's block numbers are not the ones
       eth_getBlock answers to */
    try {
      var f = new ethers.Contract(CONFIG.contracts.factory, FACTORY_ABI, p);
      var launches = await f.queryFilter(f.filters.TokenLaunched(address), 0, 'latest');
      if (launches.length) {
        var blk = await p.getBlock(launches[0].blockNumber);
        if (blk) info.launchedAt = blk.timestamp * 1000;
      }
    } catch (e) { /* the page copes with a missing launch time */ }

    try {
      var v3 = new ethers.Contract(CONFIG.uniswap.factory, [
        'function getPool(address,address,uint24) view returns (address)'
      ], p);
      info.pool = await v3.getPool(address, CONFIG.uniswap.weth, CONFIG.poolFee);
      if (info.pool && info.pool !== ethers.ZeroAddress) {
        var pool = new ethers.Contract(info.pool, POOL_ABI, p);
        var slot0 = await pool.slot0();
        var token0 = await pool.token0();
        var isToken0 = token0.toLowerCase() === address.toLowerCase();
        info.priceInPair = priceFromSqrt(slot0.sqrtPriceX96, isToken0);
        info.marketCapInPair = info.priceInPair * (Number(info.totalSupply) / 1e18);
      }
    } catch (e) { /* pool not readable yet */ }

    return info;
  }

  /* ---------------------------------------------------------------
     board data
  --------------------------------------------------------------- */
  /* A launched token has no picture and no invented history, so the board needs
     a look derived from something stable: the address. Same address, same face
     and same colour, on every visit and every machine. */
  var FACE_KINDS = ['doge', 'shiba', 'pepe', 'coin', 'raccoon', 'cat', 'monk', 'ape', 'fox', 'owl'];
  var FACE_BGS = ['#f2d98a', '#cde8d8', '#e6dcc2', '#f2c4d8', '#cfe0cd', '#dcd2ea', '#efdfc4', '#d9dce6', '#f0cdb4', '#d8e8c0'];

  function faceFor(address) {
    var h = 0, a = String(address).toLowerCase();
    for (var i = 2; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
    return { kind: FACE_KINDS[h % FACE_KINDS.length], bg: FACE_BGS[(h >>> 8) % FACE_BGS.length] };
  }

  /**
   * Every token launched here, ready to render: metadata from the token, price
   * from its pool, and how far it is from graduating measured by the WETH the
   * pool actually holds.
   */
  async function boardTokens() {
    var ethers = await ready();
    var p = await reader();
    var launched = await listTokens();
    var weth = new ethers.Contract(CONFIG.uniswap.weth, ['function balanceOf(address) view returns (uint256)'], p);
    var graduation = Number(CONFIG.graduationThreshold) / 1e18;

    var out = await Promise.all(launched.map(async function (l) {
      try {
        var info = await tokenInfo(l.token);
        var pooled = 0;
        try { pooled = Number(await weth.balanceOf(l.pool)) / 1e18; } catch (e) {}
        var block = await p.getBlock(l.blockNumber);
        return {
          id: l.token,
          address: l.token,
          name: info.name,
          symbol: info.symbol,
          logo: info.logo,
          description: info.description,
          socials: info.socials,
          deployer: l.deployer,
          feeRecipient: info.feeRecipient,
          pool: l.pool,
          avatar: faceFor(l.token),
          priceEth: info.priceInPair,
          marketCapEth: info.marketCapInPair,
          pooledEth: pooled,
          graduationEth: graduation,
          progressPct: graduation > 0 ? Math.max(0, Math.min(100, (pooled / graduation) * 100)) : 0,
          launchedAt: block ? block.timestamp * 1000 : null,
          txHash: l.txHash
        };
      } catch (e) {
        return null;
      }
    }));
    return out.filter(Boolean);
  }

  /* Market caps are computed in the paired asset, but a launchpad reads in
     dollars. The rate is fetched once and kept for the session — a board of
     twenty tokens must not become twenty price lookups, and a stale-by-minutes
     rate is not what makes a testnet market cap notional. */
  var usdRate = null;

  async function ethUsd() {
    if (usdRate !== null) return usdRate;
    try {
      var cached = sessionStorage.getItem('vlad_eth_usd');
      if (cached) { usdRate = parseFloat(cached) || null; if (usdRate) return usdRate; }
    } catch (e) {}
    try {
      var r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      var j = await r.json();
      usdRate = (j && j.ethereum && j.ethereum.usd) || null;
      if (usdRate) { try { sessionStorage.setItem('vlad_eth_usd', String(usdRate)); } catch (e) {} }
    } catch (e) {
      usdRate = null;   /* callers fall back to showing ETH */
    }
    return usdRate;
  }

  /* ---------------------------------------------------------------
     price history
  --------------------------------------------------------------- */
  /* Every Uniswap V3 swap records the price it left the pool at, so the trade
     log is the price history — no indexer required, just the pool's own events.
     Block timestamps are fetched once per block rather than once per swap,
     because a busy pool puts many swaps in one block. */
  var SWAP_ABI = [
    'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
  ];

  async function priceHistory(pool, tokenAddress) {
    var ethers = await ready();
    var p = await reader();
    if (!pool || pool === ethers.ZeroAddress) return [];

    var poolC = new ethers.Contract(pool, SWAP_ABI.concat(['function token0() view returns (address)']), p);
    var token0 = await poolC.token0();
    var isToken0 = token0.toLowerCase() === String(tokenAddress).toLowerCase();

    var events = await poolC.queryFilter(poolC.filters.Swap(), 0, 'latest');
    if (!events.length) return [];

    var blocks = {};
    var unique = [];
    events.forEach(function (e) { if (!(e.blockNumber in blocks)) { blocks[e.blockNumber] = null; unique.push(e.blockNumber); } });
    var fetched = await Promise.all(unique.map(function (n) { return p.getBlock(n).catch(function () { return null; }); }));
    unique.forEach(function (n, i) { blocks[n] = fetched[i] ? fetched[i].timestamp * 1000 : null; });

    return events.map(function (e) {
      return {
        t: blocks[e.blockNumber],
        p: priceFromSqrt(e.args.sqrtPriceX96, isToken0),
        amount0: e.args.amount0,
        amount1: e.args.amount1,
        isToken0: isToken0,
        sender: e.args.sender,
        tx: e.transactionHash,
        block: e.blockNumber
      };
    }).filter(function (d) { return d.t && isFinite(d.p) && d.p > 0; })
      .sort(function (a, b) { return a.t - b.t; });
  }

  /* ---------------------------------------------------------------
     trading
  --------------------------------------------------------------- */
  var ROUTER_ABI = [
    'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)'
  ];
  var ERC20_ABI = [
    'function approve(address,uint256) returns (bool)',
    'function allowance(address,address) view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function deposit() payable'
  ];

  /**
   * Buys or sells a launched token against its WETH pool.
   * side 'buy' spends native ETH, 'sell' spends the token.
   * `onStep` is called with a short label so a caller can narrate the wait.
   */
  async function swap(token, side, amount, slippagePct, onStep) {
    var ethers = await ready();
    var s = await signer();
    var me = await s.getAddress();
    var step = onStep || function () {};
    var value = ethers.parseEther(String(amount));
    if (value <= 0n) throw new Error('Enter an amount first.');

    var router = new ethers.Contract(CONFIG.uniswap.swapRouter, ROUTER_ABI, s);
    var params = {
      tokenIn: side === 'buy' ? CONFIG.uniswap.weth : token,
      tokenOut: side === 'buy' ? token : CONFIG.uniswap.weth,
      fee: CONFIG.poolFee,
      recipient: me,
      amountIn: value,
      amountOutMinimum: 0n,     /* the pool is thin; a floor here reverts more often than it protects */
      sqrtPriceLimitX96: 0
    };

    if (side === 'buy') {
      /* SwapRouter02 wraps the native ETH it is sent when tokenIn is WETH, so
         there is no separate deposit and no allowance to grant. */
      step('Confirm the swap…');
      var buyTx = await router.exactInputSingle(params, { value: value });
      return (await buyTx.wait()).hash;
    }

    /* selling spends an ERC20, which the router has to be allowed to move */
    var erc20 = new ethers.Contract(token, ERC20_ABI, s);
    var held = await erc20.balanceOf(me);
    if (held < value) {
      throw new Error('You hold ' + ethers.formatEther(held) + ' of this token, less than the amount entered.');
    }
    var allowed = await erc20.allowance(me, CONFIG.uniswap.swapRouter);
    if (allowed < value) {
      step('Approve the token…');
      await (await erc20.approve(CONFIG.uniswap.swapRouter, ethers.MaxUint256)).wait();
    }
    step('Confirm the swap…');
    var sellTx = await router.exactInputSingle(params);
    return (await sellTx.wait()).hash;
  }

  window.VladChain = {
    swap: swap,
    priceHistory: priceHistory,
    ethUsd: ethUsd,
    boardTokens: boardTokens,
    faceFor: faceFor,
    CONFIG: CONFIG,
    ready: ready,
    reader: reader,
    signer: signer,
    ensureChain: ensureChain,
    evmBlockNumber: evmBlockNumber,
    launch: launch,
    listTokens: listTokens,
    tokenInfo: tokenInfo
  };
})();
