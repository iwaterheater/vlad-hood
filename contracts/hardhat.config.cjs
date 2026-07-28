/** Vladhood Launchpad contracts.
 *  Compiler settings match the Uniswap V3 deployment these launch against. */
require('@nomicfoundation/hardhat-toolbox');

module.exports = {
  solidity: {
    version: '0.8.30',
    settings: {
      optimizer: { enabled: true, runs: 300 },
      viaIR: true,
      evmVersion: 'cancun',
    },
  },
  networks: {
    // the local fork started with: npx hardhat node --fork <rpc>
    localhost: { url: 'http://127.0.0.1:8545', chainId: 4663 },
    hardhat: {
      // FORK=1 runs the integration test against a local fork of Robinhood
      // Chain, where the real Uniswap V3 deployment lives
      chainId: process.env.FORK === '1' ? 4663 : 31337,
      forking: {
        url: process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
        enabled: process.env.FORK === '1',
      },
    },
  },
  paths: { sources: './src', tests: './test', cache: './cache', artifacts: './artifacts' },
};
