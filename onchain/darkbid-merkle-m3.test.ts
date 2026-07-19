// Taruh sebagai: ~/example-hello-world/src/test/darkbid-merkle-m3.test.ts
// M3: alur optimistic-challenge PENUH on-chain —
// seal dinamis -> openSettlement (klaim leader rendah) -> challenge (bid lebih tinggi merebut)
// -> tunggu jendela blockTime tutup -> finalize. Semua dengan proof asli.

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
const PRIVATE_STATE_ID = 'DarkBidMerkleM3State';
const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});
const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

const salt0 = new Uint8Array(32).fill(1);
const salt1 = new Uint8Array(32).fill(2);
const salt2 = new Uint8Array(32).fill(3);
const bid0 = 420n; // diklaim pertama sebagai leader (rendah)
const bid1 = 690n; // penantang -> menang
const bid2 = 310n;
const bidders: [bigint, Uint8Array][] = [
  [bid0, salt0],
  [bid1, salt1],
  [bid2, salt2],
];

// jendela tantangan (detik). Cukup panjang untuk openSettlement + challenge (~50s).
const WINDOW = 100n;
const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe(`DarkBid Merkle M3 — challenge flow (${network})`, () => {
  let wallet: MidnightWalletProvider;
  let providers: HelloWorldProviders;
  let contractAddress: ContractAddress;
  let deadline: bigint;
  const config = getConfig();
  const secret: WalletSecret = { kind: 'seed', value: ALICE_LOCAL_SEED };

  async function queryLedger(): Promise<any> {
    const state = await providers.publicDataProvider.queryContractState(contractAddress);
    expect(state).not.toBeNull();
    return ledger(state!.data);
  }

  const call = (circuitId: any, args: any[]) =>
    submitCallTx<Contract, any>(providers, {
      compiledContract: CompiledDarkBidMerkleContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId,
      args,
    });

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
  }, 15 * 60_000);

  afterAll(async () => {
    if (wallet) await wallet.stop();
  });

  it('deploys + seals dynamic bidders', async () => {
    const deployed: DeployedContract<Contract> = await deployContract<Contract>(providers, {
      compiledContract: CompiledDarkBidMerkleContract,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
    });
    contractAddress = deployed.deployTxData.public.contractAddress;
    logger.info(`M3 deployed at: ${contractAddress}`);
    for (let i = 0; i < bidders.length; i++) {
      await call('sealBid', [bidders[i][0], bidders[i][1]]);
      logger.info(`Sealed bidder #${i}`);
    }
  }, 10 * 60_000);

  it('openSettlement claims a LOW leader (420)', async () => {
    deadline = nowSeconds() + WINDOW;
    await call('openSettlement', [bid0, salt0, deadline]);
    const l = await queryLedger();
    expect(l.topBid).toEqual(420n);
    logger.info(`Initial leader on-chain: ${l.topBid}`);
  }, 5 * 60_000);

  it('challenge overturns with a HIGHER bid (690)', async () => {
    await call('challenge', [bid1, salt1]);
    const l = await queryLedger();
    expect(l.topBid).toEqual(690n);
    logger.info(`After challenge, leader: ${l.topBid}`);
  }, 5 * 60_000);

  it('finalize after the challenge window closes', async () => {
    const waitSec = Number(deadline - nowSeconds()) + 30; // +30s margin (device+node)
    if (waitSec > 0) {
      logger.info(`Waiting ${waitSec}s for challenge window to close...`);
      await sleep(waitSec * 1000);
    }
    await call('finalize', []);
    const l = await queryLedger();
    logger.info(`Finalized -> winner topBid: ${l.topBid}, phase: ${l.phase}`);
    expect(l.topBid).toEqual(690n);
  }, 8 * 60_000);
});
