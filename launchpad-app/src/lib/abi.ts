export const factoryAbi = [
  {
    type: 'function', name: 'launchToken', stateMutability: 'payable',
    inputs: [
      { name: 'params', type: 'tuple', components: [
        { name: 'name', type: 'string' },
        { name: 'symbol', type: 'string' },
        { name: 'logo', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'socials', type: 'tuple', components: [
          { name: 'twitter', type: 'string' },
          { name: 'telegram', type: 'string' },
          { name: 'discord', type: 'string' },
          { name: 'website', type: 'string' },
          { name: 'farcaster', type: 'string' },
        ] },
        { name: 'feeWallet', type: 'address' },
      ] },
      { name: 'launchConfigId', type: 'uint256' },
      { name: 'dexId', type: 'uint256' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ type: 'address' }],
  },
  { type: 'function', name: 'launchFee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'launchEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  {
    type: 'event', name: 'TokenLaunched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'dexFactory', type: 'address', indexed: true },
      { name: 'pairToken', type: 'address' },
      { name: 'pool', type: 'address' },
      { name: 'dexId', type: 'uint256' },
      { name: 'launchConfigId', type: 'uint256' },
      { name: 'positionId', type: 'uint256' },
      { name: 'restrictionsEndBlock', type: 'uint256' },
      { name: 'initialBuyAmount', type: 'uint256' },
    ],
  },
] as const;

export const tokenAbi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'restrictionEndBlock', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'maxWalletLimit', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'maxTxLimit', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  /* A fresh launch holds buyers to a share of supply for a window of blocks.
     Named here so the refusal arrives as words instead of four bytes. */
  { type: 'error', name: 'LaunchBlockBuyBlocked', inputs: [{ type: 'address' }] },
  { type: 'error', name: 'MaxWalletExceeded', inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }] },
  { type: 'error', name: 'MaxTxExceeded', inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }] },
  {
    type: 'event', name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'getTokenInfo', stateMutability: 'view', inputs: [],
    outputs: [
      { name: 'tokenDeployer', type: 'address' },
      { name: 'tokenLogo', type: 'string' },
      { name: 'tokenDescription', type: 'string' },
      { name: 'tokenSocials', type: 'tuple', components: [
        { name: 'twitter', type: 'string' },
        { name: 'telegram', type: 'string' },
        { name: 'discord', type: 'string' },
        { name: 'website', type: 'string' },
        { name: 'farcaster', type: 'string' },
      ] },
    ],
  },
] as const;

export const poolAbi = [
  {
    type: 'function', name: 'slot0', stateMutability: 'view', inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' }, { name: 'tick', type: 'int24' },
      { type: 'uint16' }, { type: 'uint16' }, { type: 'uint16' }, { type: 'uint8' }, { type: 'bool' },
    ],
  },
  { type: 'function', name: 'token0', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'event', name: 'Swap',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount0', type: 'int256' },
      { name: 'amount1', type: 'int256' },
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'tick', type: 'int24' },
    ],
  },
] as const;

export const v3FactoryAbi = [
  { type: 'function', name: 'getPool', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }], outputs: [{ type: 'address' }] },
] as const;

export const routerAbi = [
  {
    type: 'function', name: 'exactInputSingle', stateMutability: 'payable',
    inputs: [{ name: 'params', type: 'tuple', components: [
      { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' }, { name: 'recipient', type: 'address' },
      { name: 'amountIn', type: 'uint256' }, { name: 'amountOutMinimum', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ] }],
    outputs: [{ type: 'uint256' }],
  },
  /* Selling is two calls in one transaction: swap into the router, then unwrap
     what it received. Without the second the seller is left holding WETH.
     Checked against this deployment: only `recipient` = Constants.ADDRESS_THIS
     leaves the proceeds where unwrapWETH9 can find them — address(0) reverts
     with "Insufficient WETH9". */
  {
    type: 'function', name: 'multicall', stateMutability: 'payable',
    inputs: [{ name: 'data', type: 'bytes[]' }], outputs: [{ type: 'bytes[]' }],
  },
  {
    type: 'function', name: 'unwrapWETH9', stateMutability: 'payable',
    inputs: [{ name: 'amountMinimum', type: 'uint256' }, { name: 'recipient', type: 'address' }],
    outputs: [],
  },
] as const;

/* QuoterV2 — its quote functions are not `view`: they run the swap and revert
   to return the answer, so every call goes through a simulation. */
export const quoterAbi = [
  {
    type: 'function', name: 'quoteExactInputSingle', stateMutability: 'nonpayable',
    inputs: [{ name: 'params', type: 'tuple', components: [
      { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' }, { name: 'fee', type: 'uint24' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ] }],
    outputs: [
      { name: 'amountOut', type: 'uint256' }, { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' }, { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const;

export const lockerAbi = [
  { type: 'function', name: 'feeRecipientOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'takenOver', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'tokenProtocolFeeShares', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'collectFees', stateMutability: 'nonpayable', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
  { type: 'function', name: 'setFeeRedirect', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [] },
  /* Carried so a revert arrives as the locker's own word rather than raw data. */
  { type: 'error', name: 'NoFeesToCollect', inputs: [] },
  { type: 'error', name: 'NotAuthorized', inputs: [] },
  { type: 'error', name: 'NotDeployer', inputs: [] },
  { type: 'error', name: 'TokenNotFound', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
] as const;
