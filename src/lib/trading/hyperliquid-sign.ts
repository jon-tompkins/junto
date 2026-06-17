// Hyperliquid L1 action signing. HL doesn't sign the JSON directly: it
// msgpack-encodes the action, appends the nonce (8-byte BE) and a vault-address
// byte, keccak256-hashes that into a "connectionId", then EIP-712-signs a
// {source, connectionId} "Agent" struct on a constant phantom chain (id 1337).
// source is "a" on mainnet, "b" on testnet. Field/key order in the action must
// match HL's Rust encoder, so callers must build action objects in order.

import { encode } from '@msgpack/msgpack';
import { keccak256, hexToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface HlSignature {
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
}

function actionHash(action: unknown, nonce: number, vaultAddress: string | null): `0x${string}` {
  const actionBytes = encode(action);
  const nonceBytes = new Uint8Array(8);
  new DataView(nonceBytes.buffer).setBigUint64(0, BigInt(nonce), false); // big-endian
  const vaultBytes =
    vaultAddress === null
      ? new Uint8Array([0])
      : new Uint8Array([1, ...hexToBytes(vaultAddress as `0x${string}`)]);

  const data = new Uint8Array(actionBytes.length + nonceBytes.length + vaultBytes.length);
  data.set(actionBytes, 0);
  data.set(nonceBytes, actionBytes.length);
  data.set(vaultBytes, actionBytes.length + nonceBytes.length);
  return keccak256(data);
}

export async function signL1Action(opts: {
  privateKey: `0x${string}`;
  action: unknown;
  nonce: number;
  isMainnet: boolean;
  vaultAddress?: string | null;
}): Promise<HlSignature> {
  const account = privateKeyToAccount(opts.privateKey);
  const connectionId = actionHash(opts.action, opts.nonce, opts.vaultAddress ?? null);

  const signature = await account.signTypedData({
    domain: {
      name: 'Exchange',
      version: '1',
      chainId: 1337,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    },
    primaryType: 'Agent',
    message: { source: opts.isMainnet ? 'a' : 'b', connectionId },
  });

  return {
    r: `0x${signature.slice(2, 66)}`,
    s: `0x${signature.slice(66, 130)}`,
    v: parseInt(signature.slice(130, 132), 16),
  };
}

// --- wire formatting (HL rejects mis-formatted px/sz) ---

function trimNum(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`non-finite number: ${n}`);
  const s = n.toString();
  return s.includes('e') || s.includes('E') ? n.toFixed(8).replace(/\.?0+$/, '') : s;
}

// Prices: <=5 significant figures and <= (MAX_DECIMALS - szDecimals) decimals
// (MAX_DECIMALS is 6 for perps, 8 for spot). Integer prices are always allowed.
export function formatPrice(px: number, szDecimals: number, isPerp = true): string {
  if (Number.isInteger(px)) return px.toString();
  const maxDecimals = Math.max((isPerp ? 6 : 8) - szDecimals, 0);
  const sigFig = Number(px.toPrecision(5));
  return trimNum(Number(sigFig.toFixed(maxDecimals)));
}

// Sizes are rounded to the asset's szDecimals.
export function formatSize(sz: number, szDecimals: number): string {
  return trimNum(Number(sz.toFixed(szDecimals)));
}
