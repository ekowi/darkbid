import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum Phase { BIDDING = 0, SETTLED = 1 }

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  ping(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  sealBid0(context: __compactRuntime.CircuitContext<PS>,
           bid_0: bigint,
           salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  sealBid1(context: __compactRuntime.CircuitContext<PS>,
           bid_0: bigint,
           salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  sealBid2(context: __compactRuntime.CircuitContext<PS>,
           bid_0: bigint,
           salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  settle(context: __compactRuntime.CircuitContext<PS>,
         winner_0: bigint,
         price_0: bigint,
         bid0_0: bigint,
         salt0_0: Uint8Array,
         bid1_0: bigint,
         salt1_0: Uint8Array,
         bid2_0: bigint,
         salt2_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  ping(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  sealBid0(context: __compactRuntime.CircuitContext<PS>,
           bid_0: bigint,
           salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  sealBid1(context: __compactRuntime.CircuitContext<PS>,
           bid_0: bigint,
           salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  sealBid2(context: __compactRuntime.CircuitContext<PS>,
           bid_0: bigint,
           salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  settle(context: __compactRuntime.CircuitContext<PS>,
         winner_0: bigint,
         price_0: bigint,
         bid0_0: bigint,
         salt0_0: Uint8Array,
         bid1_0: bigint,
         salt1_0: Uint8Array,
         bid2_0: bigint,
         salt2_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  commitBid(bid_0: bigint, salt_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  ping(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  commitBid(context: __compactRuntime.CircuitContext<PS>,
            bid_0: bigint,
            salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  sealBid0(context: __compactRuntime.CircuitContext<PS>,
           bid_0: bigint,
           salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  sealBid1(context: __compactRuntime.CircuitContext<PS>,
           bid_0: bigint,
           salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  sealBid2(context: __compactRuntime.CircuitContext<PS>,
           bid_0: bigint,
           salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  settle(context: __compactRuntime.CircuitContext<PS>,
         winner_0: bigint,
         price_0: bigint,
         bid0_0: bigint,
         salt0_0: Uint8Array,
         bid1_0: bigint,
         salt1_0: Uint8Array,
         bid2_0: bigint,
         salt2_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly phase: Phase;
  readonly commit0: Uint8Array;
  readonly commit1: Uint8Array;
  readonly commit2: Uint8Array;
  readonly winnerIndex: bigint;
  readonly clearingPrice: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
