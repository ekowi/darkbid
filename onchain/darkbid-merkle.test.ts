// Taruh sebagai: ~/example-hello-world/src/test/darkbid-merkle.test.ts
// M2: deploy Merkle v2 + seal bidder DINAMIS + openSettlement (memicu witness findBidPath
// -> membership proof Merkle) — semua dengan PROOF ASLI on-chain.

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
  CompiledDarkBidMerkleContract,
  Contract,
  ledger,
  darkbidMerkleZkConfigPath,
} from '../../contracts/darkbid-merkle.js';

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

const ALICE_LOCAL_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';
const PRIVATE_STATE_ID = 'DarkBidMerkleState';
const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});
const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

// bidder (privat)
const salt0 = new Uint8Array(32).fill(1);
const salt1 = new Uint8Array(32).fill(2);
const salt2 = new Uint8Array(32).fill(3);
const bid0 = 420n;
const bid1 = 690n; // pemenang
const bid2 = 310n;
const bidders: [bigint, Uint8Array][] = [
  [bid0, salt0],
  [bid1, salt1],
  [bid2, salt2],
];

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

describe(`DarkBid Merkle (${network})`, () => {
  let wallet: MidnightWalletProvider;
  let providers: HelloWorldProviders;
  let contractAddress: ContractAddress;
  const config = getConfig();
  const secret: WalletSecret = { kind: 'seed', value: ALICE_LOCAL_SEED };

  async function queryLedger(): Promise<any> {
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
    await syncWallet(logger, wallet.wallet, 10 * 60_000);
    providers = buildProviders(wallet, darkbidMerkleZkConfigPath, config);
    logger.info(`Providers initialized on '${network}'.`);
  }, 15 * 60_000);

  afterAll(async () => {
    if (wallet) await wallet.stop();
  });

  it('deploys the Merkle contract', async () => {
    const deployed: DeployedContract<Contract> = await deployContract<Contract>(providers, {
      compiledContract: CompiledDarkBidMerkleContract,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
    });
    contractAddress = deployed.deployTxData.public.contractAddress;
    logger.info(`DarkBid Merkle deployed at: ${contractAddress}`);
    expect(contractAddress.length).toBeGreaterThan(0);
  }, 5 * 60_000);

  it('seals DYNAMIC bidders one tx each (real ZK proofs)', async () => {
    for (let i = 0; i < bidders.length; i++) {
      await submitCallTx<Contract, 'sealBid'>(providers, {
        compiledContract: CompiledDarkBidMerkleContract,
        contractAddress,
        privateStateId: PRIVATE_STATE_ID,
        circuitId: 'sealBid',
        args: [bidders[i][0], bidders[i][1]],
      });
      logger.info(`Sealed bidder #${i} into the Merkle tree`);
    }
  }, 10 * 60_000);

  it('opens settlement via a Merkle membership proof (witness findBidPath)', async () => {
    const deadline = nowSeconds() + 3600n; // jendela tantangan 1 jam
    await submitCallTx<Contract, 'openSettlement'>(providers, {
      compiledContract: CompiledDarkBidMerkleContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'openSettlement',
      args: [bid1, salt1, deadline], // klaim pemenang 690
    });

    const l = await queryLedger();
    logger.info(`On-chain leader -> topBid: ${l.topBid}`);
    expect(l.topBid).toEqual(690n);
  }, 5 * 60_000);
});
