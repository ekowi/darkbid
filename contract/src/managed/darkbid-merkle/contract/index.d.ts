import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum Phase { BIDDING = 0, CHALLENGE = 1, FINALIZED = 2 }

export type Witnesses<PS> = {
  findBidPath(context: __compactRuntime.WitnessContext<Ledger, PS>,
              commitment_0: Uint8Array): [PS, { leaf: Uint8Array,
                                                path: { sibling: { field: bigint
                                                                 },
                                                        goes_left: boolean
                                                      }[]
                                              }];
}

export type ImpureCircuits<PS> = {
  sealBid(context: __compactRuntime.CircuitContext<PS>,
          bid_0: bigint,
          salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openSettlement(context: __compactRuntime.CircuitContext<PS>,
                 bid_0: bigint,
                 salt_0: Uint8Array,
                 challengeDeadline_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  challenge(context: __compactRuntime.CircuitContext<PS>,
            bid_0: bigint,
            salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalize(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  sealBid(context: __compactRuntime.CircuitContext<PS>,
          bid_0: bigint,
          salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openSettlement(context: __compactRuntime.CircuitContext<PS>,
                 bid_0: bigint,
                 salt_0: Uint8Array,
                 challengeDeadline_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  challenge(context: __compactRuntime.CircuitContext<PS>,
            bid_0: bigint,
            salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalize(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  commitBid(bid_0: bigint, salt_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  commitBid(context: __compactRuntime.CircuitContext<PS>,
            bid_0: bigint,
            salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  sealBid(context: __compactRuntime.CircuitContext<PS>,
          bid_0: bigint,
          salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openSettlement(context: __compactRuntime.CircuitContext<PS>,
                 bid_0: bigint,
                 salt_0: Uint8Array,
                 challengeDeadline_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  challenge(context: __compactRuntime.CircuitContext<PS>,
            bid_0: bigint,
            salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalize(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  bids: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  readonly phase: Phase;
  readonly topBid: bigint;
  readonly topCommit: Uint8Array;
  readonly deadline: bigint;
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
