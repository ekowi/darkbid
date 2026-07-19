// Taruh sebagai: ~/example-hello-world/contracts/darkbid-merkle.ts
// Wrapper untuk DarkBid Merkle v2 — DENGAN witness (beda dari 3-bidder yang vacant).

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'node:path';

export {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
} from './managed/darkbid-merkle/contract/index.js';

import { Contract } from './managed/darkbid-merkle/contract/index.js';

export type DarkBidMerklePrivateState = Record<string, never>;

// Witness: cari Merkle path untuk sebuah commitment dari pohon on-chain.
// findPathForLeaf hanya callable dari TypeScript (lihat ledger-adt docs).
// ctx diketik `any` agar bebas dari friksi tipe generik; vitest/esbuild tak type-check-block.
export const witnesses = {
  findBidPath: (ctx: any, commitment: Uint8Array): [DarkBidMerklePrivateState, any] => [
    (ctx.privateState ?? {}) as DarkBidMerklePrivateState,
    ctx.ledger.bids.findPathForLeaf(commitment)!,
  ],
};

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const darkbidMerkleZkConfigPath = path.resolve(currentDir, 'managed', 'darkbid-merkle');

export const CompiledDarkBidMerkleContract = CompiledContract.make(
  'DarkBidMerkleContract',
  Contract,
).pipe(
  CompiledContract.withWitnesses(witnesses),        // <-- bukan withVacantWitnesses
  CompiledContract.withCompiledFileAssets(darkbidMerkleZkConfigPath),
);
