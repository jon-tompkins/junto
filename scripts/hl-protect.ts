// One-off: attach reduce-only OCO (stop + take-profit) to an open HL testnet
// position via the real driver (validates Stage-3 submitOcoExit).
// Args: <wallet> <agentKey> <coin> <exitSide buy|sell> <qty> <stopPx> <targetPx>
import { makeHyperliquid } from '../src/lib/trading/hyperliquid';

const [, , wallet, agentKey, coin, side, qty, stop, target] = process.argv;
const cli = makeHyperliquid({ walletAddress: wallet, mode: 'paper', agentPrivateKey: agentKey as `0x${string}` });

(async () => {
  const res = await cli.submitOcoExit({
    symbol: coin,
    qty: Number(qty),
    side: side as 'buy' | 'sell',
    stopPrice: Number(stop),
    limitPrice: Number(target),
  });
  console.log(JSON.stringify(res, null, 2));
})().catch((e) => { console.error('OCO_ERROR:', e?.message || e); process.exit(1); });
