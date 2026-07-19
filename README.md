# DarkBid

**Sealed-bid auctions on Midnight — losing bids stay private, the winner is provable, and settlement runs on real zero-knowledge proofs.**

Built for the Midnight Hackathon (July 2026).

📺 **Demo video:** [link](https://youtu.be/a0jbk-Dufvw) · 🎯 **Track:** DeFi

---

## The problem

On a public blockchain every bid is visible, which causes:

- **Front-running** — bots see your bid and outbid you before it lands
- **Sniping** — transparent auctions get gamed at the close
- **Strategy leakage** — competitors learn exactly how you value an asset

The usual fix is a centralized auctioneer who keeps bids secret — but then you must trust them not to lie about who won. **DarkBid removes that trade-off:** bids stay sealed, and the outcome is cryptographically verifiable.

---

## What it does

1. **Commit** — each bidder submits `persistentCommit(bid, salt)`. The public ledger shows only opaque commitments.
2. **Close** — bidding ends.
3. **Settle** — a zero-knowledge proof establishes the winner and clearing price. **Losing bids are never opened.**

Two implementations are included:

- **Core** — a fixed 3-bidder auction that proves the winner directly (unconditionally correct).
- **Merkle v2** — dynamic, **unbounded** bidders via a `HistoricMerkleTree` + an optimistic-challenge settlement.

---

## ✅ Proven on-chain (local devnet)

Both contracts deploy and run with **real ZK proofs** — the proof server generates a zk-SNARK per call (~20–25s), the node verifies and applies it.

| Contract | Deploy address | Result |
|---|---|---|
| Core (3-bidder) | `b4184c425e9727e7764615c005e6f7956041952a6b1bceddadd0e3d1d3cc4788` | `sealBid ×3` + `settle` → **winner #1, price 690**; losing bids (420, 310) never on ledger |
| Merkle v2 — seal + membership | `8a6892083bb513afcb8e970aef858ce5903e66917dcfa3417e57866726f32a02` | dynamic `sealBid ×3` + `openSettlement` (Merkle membership proof) → **topBid 690** |
| Merkle v2 — full challenge flow | `0e7b11c513039ba9df398ac1780632bf8885d5b680c51edc27790ed471182516` | `openSettlement`(420) → `challenge`(690 overturns) → `finalize` after block-time window → **690** |

Unit tests (5/5, in-process) also cover the core logic, including "reject a faked winner" and "losing bids never leak."

---

## How it works (core circuit)

The Compact `settle` circuit proves three things at once, without opening any losing bid:

| # | Constraint | Guarantees |
|---|---|---|
| 1 | `commit_i == commitBid(bid_i, salt_i)` | Every commitment opens to a real bid — no invented bids |
| 2 | `price >= bid_i` for all `i` | The winner really was the highest bidder |
| 3 | `price == bid_winner` | The announced price is genuinely the winner's bid |

**Private (witness):** all bid values and salts. **Public (ledger):** commitments, winner index, clearing price. Commitments use `persistentCommit` (hiding + binding) — the idiomatic Midnight primitive for brute-forceable values like bids.

---

## Scaling to unbounded bidders — Merkle v2

Fixed-N circuits can't scale, so v2 stores commitments in a `HistoricMerkleTree` and settles by **optimistic challenge**:

- **`sealBid`** inserts each commitment as a Merkle leaf — one tx per bidder, unbounded.
- **`openSettlement`** claims a provisional leader and proves its commitment is a tree member (`merkleTreePathRoot` + `checkRoot`), opening a challenge window (`blockTime`). *This does not yet prove it's the highest — hence "optimistic."*
- **`challenge`** lets anyone with a higher committed bid overturn the leader before the deadline.
- **`finalize`** locks the result once the window closes.

Secure as long as at least one honest party challenges within the window (like fraud proofs in optimistic rollups). In production the claim/challenge steps are automated by off-chain keepers; on-chain, the mechanism is claim → contest → finalize.

An interactive web UI (`scripts/darkbid-merkle-ui.ts`) drives this full flow against the live devnet — seal bidders dynamically, then open / challenge / finalize.

---

## Trust model — what is and isn't guaranteed

**✅ Guarantees**
- The public and losing bidders learn **nothing** about losing bid amounts
- The operator **cannot lie** about the winner or price — the proof binds the result to the published commitments
- No bidder can grief the auction by withholding a reveal

**⚠️ Not yet guaranteed**
- **Privacy from the operator** — the operator sees bids to compute the max. Removing this needs MPC / threshold decryption (roadmap).
- **Bid funding** — escrow-backed bids (range proof `bid ≤ escrow`) are roadmap.
- First-price reveals the *winner's* bid (= the price); only losing bids stay hidden.

---

## Prior art & differentiation

Sealed-bid on-chain auctions exist — ENS used commit-reveal (with a public reveal phase, prone to griefing); Penumbra does private batch swaps; CoW Protocol does batch auctions. **DarkBid** is Midnight-native, proves the *outcome* in zero knowledge with **no reveal phase**, and ships the sealed-bid engine as a **reusable primitive**.

---

## Repository layout

```
contracts/
  darkbid.compact          Core 3-bidder sealed-bid contract
  darkbid-merkle.compact   Merkle v2 (dynamic bidders, optimistic challenge)
  src/                     Unit tests + witnesses (in-process)
onchain/                   On-chain harness (runs on the Midnight example scaffold)
  darkbid.ts               Compiled-contract wrapper (core)
  darkbid-merkle.ts        Compiled-contract wrapper + findBidPath witness (Merkle)
  darkbid.test.ts          3-bidder deploy + settle on-chain
  darkbid-merkle.test.ts   dynamic seal + membership proof on-chain
  darkbid-merkle-m3.test.ts full challenge flow on-chain
  darkbid-merkle-ui.ts     interactive web UI (dynamic bidders)
```

---

## Run it

**Unit tests (fast, no blockchain):**
```bash
cd contracts
compact compile src/darkbid.compact src/managed/darkbid
npm test          # 5/5
```

**On-chain (real proofs) & the UI** run on Midnight's official example scaffold
(`midnightntwrk/example-hello-world`, Apache-2.0), which provides the wallet,
proof server, node and indexer:
```bash
git clone https://github.com/midnightntwrk/example-hello-world
cd example-hello-world
# copy the files from onchain/ into this project (contracts/ + src/test/ + scripts/)
compact compile contracts/darkbid-merkle.compact contracts/managed/darkbid-merkle
yarn env:up                                                     # proof server + node + indexer
MIDNIGHT_NETWORK=local yarn test src/test/darkbid.test.ts       # core, on-chain
MIDNIGHT_NETWORK=local yarn test src/test/darkbid-merkle-m3.test.ts  # full challenge flow
yarn vite-node scripts/darkbid-merkle-ui.ts                     # UI → http://<host>:8998
```

**Requirements:** Linux/WSL, Node 24+, Docker, Midnight Compact toolchain (CPU with AVX2).

---

## Verification

The contracts were cross-checked against Midnight's official documentation via the Midnight docs assistant (Kapa MCP): `disclose` usage, `persistentCommit` vs `persistentHash`, Compact casts/asserts, and the Merkle primitives (`HistoricMerkleTree`, `merkleTreePathRoot`, `checkRoot`, `findPathForLeaf`, `blockTime`).

---

## Roadmap

1. Escrow-backed bids (range proof, uniform deposits to avoid leaking a bid's upper bound)
2. Remove the operator via MPC / threshold decryption
3. Vickrey (second-price) once all bids are registered + escrowed (prevents undetectable shill bids)
4. A batch-auction "dark pool" DEX built on the same sealed-input primitive

---

## Built with & attribution

- **Midnight** · **Compact** (`persistentCommit`, `HistoricMerkleTree`, `merkleTreePathRoot`, `blockTime`) · **Midnight.js** · **TypeScript**
- The on-chain harness is built on Midnight's [`example-hello-world`](https://github.com/midnightntwrk/example-hello-world) scaffold (Apache-2.0). All DarkBid contracts, settlement logic, and UI are original work.

---

*Built solo for the Midnight Hackathon. Two contracts, three on-chain deployments, all proven with real ZK proofs.*
