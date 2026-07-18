import { describe, it, expect } from 'vitest';
import {
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/darkbid/contract/index.js';
import { witnesses } from '../witnesses.js';

const salt0 = new Uint8Array(32).fill(1);
const salt1 = new Uint8Array(32).fill(2);
const salt2 = new Uint8Array(32).fill(3);
const bid0 = 420n;
const bid1 = 690n; // pemenang
const bid2 = 310n;

// serap perbedaan penamaan field antar-versi
const nextCtx = (r: any): any => r.context ?? r.newContext ?? r;

function fresh(): { contract: any; ctx: any } {
  const contract: any = new Contract(witnesses);
  const init = contract.initialState(createConstructorContext({}, '0'.repeat(64)));
  const ctx = createCircuitContext(
    sampleContractAddress(),      // 1. contractAddress
    init.currentZswapLocalState,  // 2. zswap state
    init.currentContractState,    // 3. contractState
    init.currentPrivateState      // 4. privateState
  );
  return { contract, ctx };
}

function sealAll(contract: any, ctx: any): any {
  ctx = nextCtx(contract.impureCircuits.sealBid0(ctx, bid0, salt0));
  ctx = nextCtx(contract.impureCircuits.sealBid1(ctx, bid1, salt1));
  ctx = nextCtx(contract.impureCircuits.sealBid2(ctx, bid2, salt2));
  return ctx;
}

const readLedger = (ctx: any): any => ledger(ctx.currentQueryContext.state);

describe('DarkBid', () => {
  it('T1 menetapkan pemenang yang benar', () => {
    const { contract, ctx } = fresh();
    let c = sealAll(contract, ctx);
    c = nextCtx(contract.impureCircuits.settle(c, 1n, bid1, bid0, salt0, bid1, salt1, bid2, salt2));
    const l = readLedger(c);
    expect(l.winnerIndex).toBe(1n);
    expect(l.clearingPrice).toBe(690n);
  });

  it('T2 menolak pemenang palsu', () => {
    const { contract, ctx } = fresh();
    const c = sealAll(contract, ctx);
    expect(() =>
      contract.impureCircuits.settle(c, 0n, bid0, bid0, salt0, bid1, salt1, bid2, salt2)
    ).toThrow();
  });

  it('T3 menolak harga karangan', () => {
    const { contract, ctx } = fresh();
    const c = sealAll(contract, ctx);
    expect(() =>
      contract.impureCircuits.settle(c, 1n, 999n, bid0, salt0, bid1, salt1, bid2, salt2)
    ).toThrow();
  });

  it('T4 menolak bid yang tak sesuai commitment', () => {
    const { contract, ctx } = fresh();
    const c = sealAll(contract, ctx);
    const wrongSalt = new Uint8Array(32).fill(9);
    expect(() =>
      contract.impureCircuits.settle(c, 1n, bid1, bid0, wrongSalt, bid1, salt1, bid2, salt2)
    ).toThrow();
  });

  it('T5 tidak membocorkan bid yang kalah', () => {
    const { contract, ctx } = fresh();
    let c = sealAll(contract, ctx);
    c = nextCtx(contract.impureCircuits.settle(c, 1n, bid1, bid0, salt0, bid1, salt1, bid2, salt2));
    const l = readLedger(c);
    const dump = JSON.stringify(l, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(dump).not.toContain('420');
    expect(dump).not.toContain('310');
    expect(l.clearingPrice).toBe(690n);
  });
});
