// Taruh sebagai: ~/example-hello-world/src/test/darkbid.test.ts
// Deploy DarkBid ke devnet lokal + jalankan sealBid & settle dengan PROOF ASLI.
// Tiap submitCallTx menghasilkan zk-SNARK via proof server (~20 detik) lalu menunggu konfirmasi on-chain.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  deployContract,
  submitCallTx,
  type DeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import pino from 'pino';
import { getConfig } from '../config.js';
import { MidnightWalletProvider, syncWallet, type WalletSecret } from '../wallet.js';
import { buildProviders, type HelloWorldProviders } from '../providers.js';
import {
  CompiledDarkBidContract,
  Contract,
  ledger,
  darkbidZkConfigPath,
} from '../../contracts/darkbid.js';

// Required for GraphQL subscriptions in Node.js
globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

const ALICE_LOCAL_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';
const PRIVATE_STATE_ID = 'DarkBidState';
const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});
const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

// --- Data lelang (bid & salt bersifat PRIVAT; tak pernah masuk ledger) ---
const salt0 = new Uint8Array(32).fill(1);
const salt1 = new Uint8Array(32).fill(2);
const salt2 = new Uint8Array(32).fill(3);
const bid0 = 420n;
const bid1 = 690n; // pemenang -> index 1
const bid2 = 310n;

describe(`DarkBid Contract (${network})`, () => {
  let wallet: MidnightWalletProvider;
  let providers: HelloWorldProviders;
  let contractAddress: ContractAddress;
  const config = getConfig();
  const secret: WalletSecret = { kind: 'seed', value: ALICE_LOCAL_SEED };
  const syncTimeoutMs = 10 * 60_000;

  async function queryLedger() {
    const state = await providers.publicDataProvider.queryContractState(contractAddress);
    expect(state).not.toBeNull();
    return ledger(state!.data);
  }

  beforeAll(async () => {
    setNetworkId(config.networkId);
    const envConfig: EnvironmentConfiguration = {
      walletNetworkId: config.networkId,
      networkId: config.networkId,
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      node: config.node,
      nodeWS: config.nodeWS,
      faucet: config.faucet,
      proofServer: config.proofServer,
    };
    wallet = await MidnightWalletProvider.build(logger, envConfig, secret);
    await wallet.start();
    await syncWallet(logger, wallet.wallet, syncTimeoutMs);
    providers = buildProviders(wallet, darkbidZkConfigPath, config);
    logger.info(`Providers initialized on '${network}'. Ready to test!`);
  });

  afterAll(async () => {
    if (wallet) {
      logger.info('Stopping wallet...');
      await wallet.stop();
    }
  });

  it('deploys the DarkBid contract', async () => {
    const deployed: DeployedContract<Contract> = await deployContract<Contract>(providers, {
      compiledContract: CompiledDarkBidContract,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
    });
    contractAddress = deployed.deployTxData.public.contractAddress;
    logger.info(`DarkBid deployed at: ${contractAddress}`);
    expect(contractAddress.length).toBeGreaterThan(0);

    const state = await queryLedger();
    expect(state.winnerIndex).toEqual(0n);
    expect(state.clearingPrice).toEqual(0n);
  });

  it('seals three private bids (real ZK proofs)', async () => {
    await submitCallTx<Contract, 'sealBid0'>(providers, {
      compiledContract: CompiledDarkBidContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'sealBid0',
      args: [bid0, salt0],
    });
    await submitCallTx<Contract, 'sealBid1'>(providers, {
      compiledContract: CompiledDarkBidContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'sealBid1',
      args: [bid1, salt1],
    });
    await submitCallTx<Contract, 'sealBid2'>(providers, {
      compiledContract: CompiledDarkBidContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'sealBid2',
      args: [bid2, salt2],
    });

    // Ledger hanya menyimpan commitment; pemenang belum ditetapkan
    const state = await queryLedger();
    expect(state.winnerIndex).toEqual(0n);
  });

  it('settles and reveals ONLY winner + price on-chain', async () => {
    await submitCallTx<Contract, 'settle'>(providers, {
      compiledContract: CompiledDarkBidContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'settle',
      // (winner, price, bid0, salt0, bid1, salt1, bid2, salt2)
      args: [1n, bid1, bid0, salt0, bid1, salt1, bid2, salt2],
    });

    const state = await queryLedger();
    expect(state.winnerIndex).toEqual(1n);
    expect(state.clearingPrice).toEqual(690n);
    logger.info(`On-chain result -> winner: ${state.winnerIndex}, price: ${state.clearingPrice}`);
  });
});
