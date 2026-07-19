// Taruh sebagai: ~/example-hello-world/contracts/darkbid.ts
// Meniru contracts/index.ts, tapi untuk kontrak DarkBid.

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'node:path';

export {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
  type ImpureCircuits,
  type PureCircuits,
} from './managed/darkbid/contract/index.js';

import { Contract } from './managed/darkbid/contract/index.js';

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const darkbidZkConfigPath = path.resolve(currentDir, 'managed', 'darkbid');

export const CompiledDarkBidContract = CompiledContract.make(
  'DarkBidContract',
  Contract,
).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(darkbidZkConfigPath),
);
