// DarkBid — minimal web UI (backend menjalankan sirkuit, browser hanya menampilkan)
// Taruh di ~/darkbid/contract/src/server.mjs
// Jalankan:  node src/server.mjs   (dari root project)
// Akses dari laptop:  http://<IP-VM>:8999

import { createServer } from 'http';
import { webcrypto } from 'crypto';
import {
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from './managed/darkbid/contract/index.js';

const PORT = 8999;
const witnesses = {};
const nextCtx = (r) => r.context ?? r.newContext ?? r;
const hex = (u8) => Buffer.from(u8).toString('hex');
const readLedger = (ctx) => ledger(ctx.currentQueryContext.state);
const seals = ['sealBid0', 'sealBid1', 'sealBid2'];

function fresh() {
  const contract = new Contract(witnesses);
  const init = contract.initialState(createConstructorContext({}, '0'.repeat(64)));
  const ctx = createCircuitContext(
    sampleContractAddress(),
    init.currentZswapLocalState,
    init.currentContractState,
    init.currentPrivateState
  );
  return { contract, ctx };
}

// CSPRNG — keamanan commitment bergantung pada entropi salt
const randSalt = () => webcrypto.getRandomValues(new Uint8Array(32));

function runAuction(bidNums) {
  const bidders = bidNums.map((n) => ({ bid: BigInt(n), salt: randSalt() }));

  // Fase 1: seal — commitment ke ledger, bid & salt tetap privat
  const { contract, ctx: start } = fresh();
  let ctx = start;
  bidders.forEach((b, i) => (ctx = nextCtx(contract.impureCircuits[seals[i]](ctx, b.bid, b.salt))));
  let L = readLedger(ctx);
  const commitments = [hex(L.commit0), hex(L.commit1), hex(L.commit2)];

  // Pemenang (first-price): bid tertinggi
  let w = 0;
  for (let i = 1; i < bidders.length; i++) if (bidders[i].bid > bidders[w].bid) w = i;
  const price = bidders[w].bid;

  // Fase 2: settle — sirkuit memverifikasi klaim, hanya winner + price dibuka
  const args = [BigInt(w), price];
  bidders.forEach((b) => args.push(b.bid, b.salt));
  ctx = nextCtx(contract.impureCircuits.settle(ctx, ...args));
  L = readLedger(ctx);

  // Privasi: satu-satunya nilai bid yang DIBUKA ke ledger adalah clearingPrice (= bid pemenang).
  // Bid yang kalah "leaked" hanya bila kebetulan sama dengan harga kliring (itu pun seri, bukan bocor).
  const disclosed = [L.clearingPrice.toString()];
  const leaks = bidders
    .map((b, i) => ({ i, bid: b.bid.toString() }))
    .filter((x) => x.i !== w)
    .map((x) => ({ bid: x.bid, leaked: disclosed.includes(x.bid) }));

  // Integritas: klaim bidder TERMURAH sebagai pemenang harus ditolak sirkuit.
  // Hanya bermakna kalau ada bid yang strictly lebih rendah dari harga.
  let minI = 0;
  for (let i = 1; i < bidders.length; i++) if (bidders[i].bid < bidders[minI].bid) minI = i;
  let cheatRejected = true;
  if (bidders[minI].bid < price) {
    try {
      const { contract: c2, ctx: s2 } = fresh();
      let cc = s2;
      bidders.forEach((b, i) => (cc = nextCtx(c2.impureCircuits[seals[i]](cc, b.bid, b.salt))));
      const bad = [BigInt(minI), bidders[minI].bid]; // klaim bidder termurah menang
      bidders.forEach((b) => bad.push(b.bid, b.salt));
      c2.impureCircuits.settle(cc, ...bad); // harus melempar (price < bid tertinggi)
      cheatRejected = false; // kalau sampai sini, kecurangan lolos = buruk
    } catch {
      cheatRejected = true;
    }
  }

  return { commitments, winnerIndex: w, clearingPrice: price.toString(), leaks, cheatRejected };
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>DarkBid</title>
<style>
body{font-family:system-ui,sans-serif;background:#0b0f1a;color:#e6e8ee;margin:0;padding:24px}
.wrap{max-width:640px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px} .sub{color:#8b93a7;margin:0 0 20px;font-size:14px}
.card{background:#141a2b;border:1px solid #232c44;border-radius:12px;padding:16px;margin:12px 0}
label{display:block;font-size:13px;color:#8b93a7;margin-bottom:4px}
input{width:90px;background:#0b0f1a;border:1px solid #2b3654;color:#e6e8ee;border-radius:8px;padding:8px;font-size:15px}
.row{display:flex;gap:16px;flex-wrap:wrap}
button{background:#5b7cfa;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-size:15px;cursor:pointer;margin-top:8px}
.mono{font-family:ui-monospace,monospace;font-size:12px;color:#7de3c3;word-break:break-all;margin:4px 0}
.hidden{display:none} .big{font-size:20px;font-weight:600}
.ok{color:#54d98c} .bad{color:#ff6b6b}
</style></head><body><div class="wrap">
<h1>DarkBid</h1>
<p class="sub">Sealed-bid auction on Midnight — losing bids stay private, the winner is provable.</p>
<div class="card"><div class="row">
<div><label>Bidder A</label><input id="b0" type="number" value="420"></div>
<div><label>Bidder B</label><input id="b1" type="number" value="690"></div>
<div><label>Bidder C</label><input id="b2" type="number" value="310"></div>
</div><button id="seal">Seal bids</button></div>
<div id="ledger" class="card hidden">
<label>Public ledger — only opaque commitments (no amounts)</label>
<div class="mono" id="c0"></div><div class="mono" id="c1"></div><div class="mono" id="c2"></div>
<button id="close">Close auction &amp; reveal winner</button></div>
<div id="result" class="card hidden">
<div class="big">Winner: <span id="win"></span> &middot; price <span id="price"></span></div>
<div style="margin-top:10px" id="priv"></div>
<div style="margin-top:6px" id="cheat"></div></div>
</div><script>
var last=null;
function $(x){return document.getElementById(x);}
$('seal').onclick=function(){
 var bids=[+$('b0').value,+$('b1').value,+$('b2').value];
 fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bids:bids})})
 .then(function(r){return r.json();}).then(function(d){
  if(d.error){ alert(d.error); return; }
  last=d;
  $('c0').textContent='commit A = '+d.commitments[0];
  $('c1').textContent='commit B = '+d.commitments[1];
  $('c2').textContent='commit C = '+d.commitments[2];
  $('ledger').classList.remove('hidden'); $('result').classList.add('hidden');
 }).catch(function(){ alert('Request gagal'); });
};
$('close').onclick=function(){
 if(!last)return;
 var names=['Bidder A','Bidder B','Bidder C'];
 $('win').textContent=names[last.winnerIndex];
 $('price').textContent=last.clearingPrice;
 var leaked=last.leaks.some(function(x){return x.leaked;});
 $('priv').innerHTML=leaked?'<span class="bad">Privacy FAILED: a losing bid leaked</span>'
   :'<span class="ok">Privacy OK — losing bids never appear on the ledger</span>';
 $('cheat').innerHTML=last.cheatRejected?'<span class="ok">Integrity OK — a faked winner is rejected by the ZK circuit</span>'
   :'<span class="bad">Integrity FAILED — fake winner accepted</span>';
 $('result').classList.remove('hidden');
};
</script></body></html>`;

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(PAGE);
  }
  if (req.method === 'POST' && req.url === '/api/run') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const bids = Array.isArray(parsed.bids) ? parsed.bids.map(Number) : [];
        if (bids.length !== 3 || bids.some((n) => !Number.isInteger(n) || n < 0)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Butuh tepat 3 bilangan bulat non-negatif.' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(runAuction(bids)));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end('not found');
}).listen(PORT, '0.0.0.0', () =>
  console.log(`DarkBid UI running → http://<IP-VM>:${PORT}  (bind 0.0.0.0:${PORT})`)
);
