/* Pulls the creation bytecode of the Uniswap V3 deployment on Robinhood Chain
 * mainnet straight out of the transactions that created it, so the same code
 * can be redeployed on a chain that has no Uniswap on it.
 *
 *   node scripts/fetch-uniswap-initcode.cjs
 *
 * Writes scripts/uniswap-initcode.json. Read-only; touches no key.
 */
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const EXPLORER = 'https://robinhoodchain.blockscout.com/api/v2/addresses';

const TARGETS = {
  weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
  v3Factory: '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA',
  descriptorLib: '0x2Bb4E3aF3f07353A3e3c91126BD30654Abf03369',
  descriptor: '0x6F84dAE9c064ff453E5C8af51EfB819f8f610225',
  positionManager: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
  swapRouter: '0xCaf681a66D020601342297493863E78C959E5cb2',
  quoter: '0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7',
};

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const out = {};

  for (const [name, address] of Object.entries(TARGETS)) {
    const meta = await (await fetch(`${EXPLORER}/${address}`)).json();
    const txHash = meta.creation_transaction_hash;
    if (!txHash) { console.log(`${name.padEnd(16)} no creation tx on the explorer`); continue; }

    const tx = await provider.getTransaction(txHash);
    const deployed = await provider.getCode(address);

    out[name] = {
      address,
      creationTx: txHash,
      creationCode: tx.data,
      creationCodeBytes: (tx.data.length - 2) / 2,
      deployedBytes: (deployed.length - 2) / 2,
    };
    console.log(`${name.padEnd(16)} init ${String(out[name].creationCodeBytes).padStart(6)}B  runtime ${String(out[name].deployedBytes).padStart(6)}B`);
  }

  const file = path.join(__dirname, 'uniswap-initcode.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nwrote ${path.relative(process.cwd(), file)}`);
})().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
