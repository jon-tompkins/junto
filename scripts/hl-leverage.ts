// One-off: set cross leverage for a coin on an HL testnet account (validates
// updateLeverage + de-risks existing positions). Args: <agentKey> <coin> <lev>
import { signL1Action } from '../src/lib/trading/hyperliquid-sign';

const TESTNET = 'https://api.hyperliquid-testnet.xyz';
const [, , key, coin, lev] = process.argv;

(async () => {
  const meta: any = await fetch(`${TESTNET}/info`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'meta' }),
  }).then((r) => r.json());
  const asset = meta.universe.findIndex((a: any) => a.name === coin);
  if (asset < 0) throw new Error(`coin not found: ${coin}`);
  const action = { type: 'updateLeverage', asset, isCross: true, leverage: Number(lev) };
  const nonce = Date.now();
  const signature = await signL1Action({ privateKey: key as `0x${string}`, action, nonce, isMainnet: false });
  const res = await fetch(`${TESTNET}/exchange`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature, vaultAddress: null }),
  }).then((r) => r.json());
  console.log(`${coin} -> ${lev}x:`, JSON.stringify(res));
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
