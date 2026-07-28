/** Vladhood Launchpad — fork of the pons launchpad contracts.
 *  Sources were taken from the verified deployment on Robinhood Chain and
 *  keep their original SPDX headers (MIT, and GPL-2.0-or-later for TickMath). */
require('@nomicfoundation/hardhat-toolbox');

module.exports = {
  solidity: {
    version: '0.8.30',
    settings: {
      optimizer: { enabled: true, runs: 300 },   // matches the verified deployment
      viaIR: true,
      evmVersion: 'cancun',
                },
  },
  paths: { sources: './src', tests: './test', cache: './cache', artifacts: './artifacts' },
};
