// One-off: close an HL testnet position through the real driver (validates the
// Stage-3 closePosition path). Args: <walletAddress> <agentKey> <coin>
import { makeHyperliquid } from '../src/lib/trading/hyperliquid';

const [, , wallet, agentKey, coin] = process.argv;
const cli = makeHyperliquid({
  walletAddress: wallet,
  mode: 'paper',
  agentPrivateKey: agentKey as `0x${string}`,
});

(async () => {
  const res = await cli.closePosition(coin);
  console.log(JSON.stringify(res, null, 2));
})().catch((e) => { console.error('CLOSE_ERROR:', e?.message || e); process.exit(1); });
