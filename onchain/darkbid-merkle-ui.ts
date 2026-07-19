import { createServer } from 'http';
import { webcrypto } from 'crypto';
import { WebSocket } from 'ws';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { deployContract, submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import pino from 'pino';
import { getConfig } from '../src/config.js';
import { MidnightWalletProvider, syncWallet } from '../src/wallet.js';
import { buildProviders } from '../src/providers.js';
import {
  CompiledDarkBidMerkleContract,
  ledger,
  darkbidMerkleZkConfigPath,
} from '../contracts/darkbid-merkle.js';
 
(globalThis as any).WebSocket = WebSocket;
 
const PORT = 8998;
const PRIVATE_STATE_ID = 'DarkBidMerkleUIState';
const ALICE_LOCAL_SEED = '0000000000000000000000000000000000000000000000000000000000000001';
const WINDOW = 120n; // detik jendela tantangan
const logger = pino({ level: 'info', transport: { target: 'pino-pretty' } });
 
const randSalt = () => webcrypto.getRandomValues(new Uint8Array(32));
const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));
 
type Bidder = { id: number; bid: bigint; salt: Uint8Array };
 
let providers: any;
let contractAddress: string;
let ready = false;
let busy = false;
const bidders: Bidder[] = [];
let deadline = 0n;
 
async function init() {
  const config = getConfig();
  setNetworkId(config.networkId);
  const envConfig = {
    walletNetworkId: config.networkId,
    networkId: config.networkId,
    indexer: config.indexer,
    indexerWS: config.indexerWS,
    node: config.node,
    nodeWS: config.nodeWS,
    faucet: config.faucet,
    proofServer: config.proofServer,
  };
  const wallet = await MidnightWalletProvider.build(logger, envConfig as any, {
    kind: 'seed',
    value: ALICE_LOCAL_SEED,
  } as any);
  await wallet.start();
  await syncWallet(logger, wallet.wallet, 10 * 60_000);
  providers = buildProviders(wallet, darkbidMerkleZkConfigPath, config);
  const deployed = await deployContract(providers, {
    compiledContract: CompiledDarkBidMerkleContract,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: {},
  });
  contractAddress = deployed.deployTxData.public.contractAddress;
  ready = true;
  logger.info(`DarkBid Merkle UI contract deployed at ${contractAddress}`);
}
 
const call = (circuitId: string, args: any[]) =>
  submitCallTx<any, any>(providers, {
    compiledContract: CompiledDarkBidMerkleContract,
    contractAddress,
    privateStateId: PRIVATE_STATE_ID,
    circuitId,
    args,
  });
 
async function getState() {
  const st = await providers.publicDataProvider.queryContractState(contractAddress);
  const l: any = ledger(st!.data);
  const phaseNum = Number(l.phase);
  return {
    ready,
    contractAddress,
    phase: ['BIDDING', 'CHALLENGE', 'FINALIZED'][phaseNum] ?? String(phaseNum),
    topBid: l.topBid?.toString?.() ?? '0',
    deadline: l.deadline?.toString?.() ?? '0',
    now: nowSeconds().toString(),
    window: WINDOW.toString(),
    bidders: bidders.map((b) => ({ id: b.id })),
  };
}
 
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (busy) throw new Error('A zero-knowledge proof is already being generated — one at a time.');
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}
 
function readBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c: any) => (b += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(b || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}
 
const json = (res: any, code: number, obj: any) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};
 
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DarkBid — a sealed-bid auction house on Midnight</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400&family=Space+Grotesk:wght@400;500;600&family=Space+Mono&display=swap" rel="stylesheet">
<style>
:root{
 --bg:#0b0817; --panel:#171130; --panel2:#1e1740;
 --line:rgba(164,144,194,.16); --line2:rgba(164,144,194,.30);
 --text:#e9e6fb; --muted:#a490c2; --faint:#6f6790;
 --accent:#8b90f0; --accentg:linear-gradient(135deg,#8b90f0,#a490c2);
 --gold:#e6b980; --mint:#9fe8dd; --danger:#ff8f9e;
 --serif:'Fraunces',Georgia,serif; --sans:'Space Grotesk',system-ui,sans-serif; --mono:'Space Mono',ui-monospace,monospace;
}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;font-family:var(--sans);color:var(--text);
 background:radial-gradient(1100px 480px at 50% -12%,rgba(74,78,143,.35),transparent 70%),
            radial-gradient(700px 300px at 100% 0,rgba(164,144,194,.10),transparent 60%),var(--bg);
 padding:40px 20px 80px;-webkit-font-smoothing:antialiased}
.wrap{max-width:680px;margin:0 auto}
header{display:flex;align-items:center;gap:14px;margin-bottom:6px}
.moon{width:34px;height:34px;flex:none;filter:drop-shadow(0 0 10px rgba(139,144,240,.45))}
h1{font-family:var(--serif);font-weight:600;font-size:40px;letter-spacing:-.02em;margin:0;line-height:1}
h1 em{font-style:italic;font-weight:400;color:var(--muted)}
.tag{color:var(--muted);font-size:15px;margin:10px 0 26px;max-width:52ch;line-height:1.5}
/* stepper */
.steps{display:flex;align-items:center;gap:10px;margin-bottom:22px;font-size:12.5px;letter-spacing:.08em;text-transform:uppercase}
.step{display:flex;align-items:center;gap:8px;color:var(--faint)}
.dot{width:9px;height:9px;border-radius:50%;background:#2a2350;border:1px solid var(--line2)}
.step.active{color:var(--text)} .step.active .dot{background:var(--accent);box-shadow:0 0 12px rgba(139,144,240,.7)}
.step.done{color:var(--muted)} .step.done .dot{background:var(--muted)}
.bar{flex:1;height:1px;background:var(--line)}
/* cards */
.card{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);
 border-radius:18px;padding:22px 22px;margin:14px 0;box-shadow:0 20px 50px -30px #000}
.eyebrow{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 4px}
.h2{font-family:var(--serif);font-size:22px;font-weight:600;margin:0 0 4px;letter-spacing:-.01em}
.note{color:var(--muted);font-size:13.5px;line-height:1.5;margin:2px 0 16px}
label{display:block;font-size:12px;color:var(--muted);margin-bottom:6px;letter-spacing:.02em}
input{background:#0c0920;border:1px solid var(--line2);color:var(--text);border-radius:10px;
 padding:11px 12px;font-family:var(--mono);font-size:15px;width:120px;outline:none;transition:.15s}
input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(139,144,240,.18)}
.field{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
button{font-family:var(--sans);font-weight:500;font-size:14px;border:0;border-radius:10px;
 padding:11px 18px;cursor:pointer;color:#0b0817;background:var(--accentg);transition:.15s;letter-spacing:.01em}
button:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 20px -8px rgba(139,144,240,.6)}
button.ghost{background:transparent;color:var(--text);border:1px solid var(--line2)}
button.ghost:hover:not(:disabled){border-color:var(--accent);box-shadow:none}
button:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none}
/* state strip */
.strip{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:2px}
.stat{flex:1;min-width:150px;background:#0c0920;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.stat .k{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.stat .v{font-family:var(--serif);font-size:24px;font-weight:600;margin-top:2px}
.stat .v small{font-family:var(--sans);font-size:12px;color:var(--muted);font-weight:400}
.addr{font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:12px;word-break:break-all}
/* lots */
.lots{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:14px}
.lot{display:flex;align-items:center;gap:9px;background:#0c0920;border:1px solid var(--line);border-radius:12px;padding:11px 12px}
.lot svg{color:var(--mint);flex:none}
.lot .id{font-family:var(--mono);font-size:13px}
.lot .sl{margin-left:auto;font-size:11px;color:var(--faint);letter-spacing:.06em;text-transform:uppercase}
.empty{color:var(--faint);font-size:13.5px;font-style:italic;margin-top:12px}
/* countdown */
.cd{margin:14px 0 0}
.cd .track{height:5px;background:#0c0920;border-radius:99px;overflow:hidden;border:1px solid var(--line)}
.cd .fill{height:100%;width:0;background:linear-gradient(90deg,var(--gold),#f0d3a6);transition:width 1s linear}
.cd .lab{font-size:12px;color:var(--gold);margin-top:7px;letter-spacing:.03em}
.cd.closed .fill{background:var(--mint)} .cd.closed .lab{color:var(--mint)}
.divider{height:1px;background:var(--line);margin:18px 0}
.subrow{margin:12px 0}
/* status toast */
#status{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:90vw;
 background:rgba(23,17,48,.92);backdrop-filter:blur(8px);border:1px solid var(--line2);border-radius:12px;
 padding:11px 16px;font-size:13.5px;color:var(--muted);opacity:0;transition:.2s;pointer-events:none}
#status.show{opacity:1}
.spin{display:inline-block;width:12px;height:12px;border:2px solid var(--line2);border-top-color:var(--accent);
 border-radius:50%;margin-right:8px;vertical-align:-1px;animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.ok{color:var(--mint)} .bad{color:var(--danger)}
.win{font-family:var(--serif);font-size:15px;color:var(--mint);margin-top:14px;display:none}
.win.show{display:block}
</style></head><body><div class="wrap">
 
<header>
 <svg class="moon" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" fill="#8b90f0"/></svg>
 <h1>DarkBid <em>·  after dark</em></h1>
</header>
<p class="tag">A sealed-bid auction house on Midnight. Bids are committed in the dark; the winner is settled by cryptographic proof — and losing bids are never opened.</p>
 
<div class="steps">
 <div class="step" id="s-bid"><span class="dot"></span>Bidding</div><div class="bar"></div>
 <div class="step" id="s-ch"><span class="dot"></span>Challenge</div><div class="bar"></div>
 <div class="step" id="s-fin"><span class="dot"></span>Settled</div>
</div>
 
<div class="card">
 <div class="strip">
  <div class="stat"><div class="k">Phase</div><div class="v" id="phase" style="font-size:19px">…</div></div>
  <div class="stat"><div class="k">Standing bid</div><div class="v"><span id="topBid">—</span></div></div>
  <div class="stat"><div class="k">Sealed lots</div><div class="v" id="count">0</div></div>
 </div>
 <div class="addr" id="addr">summoning the auction house…</div>
</div>
 
<div class="card">
 <p class="eyebrow">Step one</p>
 <div class="h2">Seal a bid onto the floor</div>
 <p class="note">Each bid is committed and dropped into a Merkle tree — one real ZK proof per lot. Add as many as you like; the ledger only ever sees a sealed commitment, never the amount.</p>
 <div class="field">
  <div><label>Your bid</label><input id="bidVal" type="number" value="420"></div>
  <button id="seal">Seal it</button>
 </div>
 <div class="lots" id="lots"></div>
 <div class="empty" id="empty">The floor is open. No lots sealed yet.</div>
</div>
 
<div class="card">
 <p class="eyebrow">Step two · optimistic challenge</p>
 <div class="h2">Settle the room</div>
 <p class="note">Name a provisional leader — proven to be a real sealed lot, though not yet the highest. Anyone holding a higher sealed bid may contest it before the window closes. When the window ends, the gavel falls.</p>
 
 <div class="subrow field">
  <div><label>Name a leader — lot #</label><input id="openId" type="number" value="0" style="width:84px"></div>
  <button id="open">Open the floor</button>
 </div>
 <div class="subrow field">
  <div><label>Contest with — lot #</label><input id="chId" type="number" value="1" style="width:84px"></div>
  <button id="challenge" class="ghost">Contest</button>
 </div>
 
 <div class="cd" id="cd" style="display:none"><div class="track"><div class="fill" id="cdfill"></div></div><div class="lab" id="cdlab"></div></div>
 
 <div class="divider"></div>
 <button id="finalize" class="ghost">Close the gavel</button>
 <div class="win" id="win"></div>
</div>
 
<div id="status"></div>
</div><script>
var W=120, running=false, hideTimer=null;
function $(x){return document.getElementById(x)}
function toast(html,sticky){var s=$('status');s.innerHTML=html;s.classList.add('show');
 if(hideTimer)clearTimeout(hideTimer); if(!sticky)hideTimer=setTimeout(function(){s.classList.remove('show')},3500)}
function stepper(p){['s-bid','s-ch','s-fin'].forEach(function(i){$(i).classList.remove('active','done')});
 if(p==='BIDDING'){$('s-bid').classList.add('active')}
 else if(p==='CHALLENGE'){$('s-bid').classList.add('done');$('s-ch').classList.add('active')}
 else if(p==='FINALIZED'){$('s-bid').classList.add('done');$('s-ch').classList.add('done');$('s-fin').classList.add('active')}}
var LOCK='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
async function refresh(){
 try{var s=await (await fetch('/api/state')).json();
  stepper(s.phase);
  $('phase').textContent=s.phase||'…';
  $('topBid').innerHTML = (s.topBid&&s.topBid!=='0') ? s.topBid : '<small>none yet</small>';
  $('count').textContent=(s.bidders||[]).length;
  $('addr').textContent = s.contractAddress ? ('contract  '+s.contractAddress) : 'summoning the auction house…';
  var lots=(s.bidders||[]).map(function(b){return '<div class="lot">'+LOCK+'<span class="id">Lot #'+b.id+'</span><span class="sl">sealed</span></div>'}).join('');
  $('lots').innerHTML=lots; $('empty').style.display=(s.bidders&&s.bidders.length)?'none':'block';
  var dl=BigInt(s.deadline||'0'), now=BigInt(s.now||'0'), cd=$('cd');
  if(s.phase==='CHALLENGE'){cd.style.display='block';
    if(dl>now){var left=Number(dl-now);cd.classList.remove('closed');
      $('cdfill').style.width=Math.min(100,left/W*100)+'%';$('cdlab').textContent='Challenge window — '+left+'s remaining';}
    else{cd.classList.add('closed');$('cdfill').style.width='100%';$('cdlab').textContent='Window closed — ready for the gavel';}
  } else {cd.style.display='none';}
  var win=$('win');
  if(s.phase==='FINALIZED'){win.classList.add('show');win.innerHTML='Gavel down. Winning bid settled at '+s.topBid+' — losing bids never left the dark.';}
  else win.classList.remove('show');
  var dis=running||!s.ready;['seal','open','challenge','finalize'].forEach(function(i){$(i).disabled=dis});
 }catch(e){}
}
async function act(url,body,label){
 if(running)return; running=true; ['seal','open','challenge','finalize'].forEach(function(i){$(i).disabled=true});
 toast('<span class="spin"></span>'+label+' — generating zero-knowledge proof (~25s)',true);
 try{var d=await (await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})})).json();
  toast(d.error?('<span class="bad">'+d.error+'</span>'):('<span class="ok">✓ '+label+'</span>'));
 }catch(e){toast('<span class="bad">request failed</span>')}
 running=false; await refresh();
}
$('seal').onclick=function(){act('/api/seal',{bid:+$('bidVal').value},'Sealing bid')};
$('open').onclick=function(){act('/api/open',{id:+$('openId').value},'Opening the floor')};
$('challenge').onclick=function(){act('/api/challenge',{id:+$('chId').value},'Contesting')};
$('finalize').onclick=function(){act('/api/finalize',{},'Dropping the gavel')};
refresh(); setInterval(refresh,2000);
</script></body></html>`;
 
createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(PAGE);
    }
    if (!ready && req.url?.startsWith('/api/') && req.url !== '/api/state') {
      return json(res, 503, { error: 'The auction house is still opening (deploying contract)…' });
    }
    if (req.method === 'GET' && req.url === '/api/state') {
      if (!ready) return json(res, 200, { ready: false, bidders: [], phase: '…', topBid: '0', deadline: '0', now: nowSeconds().toString(), window: WINDOW.toString() });
      return json(res, 200, await getState());
    }
    if (req.method === 'POST' && req.url === '/api/seal') {
      const { bid } = await readBody(req);
      if (!Number.isInteger(bid) || bid < 0) return json(res, 400, { error: 'bid must be a non-negative integer' });
      await withLock(async () => {
        const salt = randSalt();
        await call('sealBid', [BigInt(bid), salt]);
        bidders.push({ id: bidders.length, bid: BigInt(bid), salt });
      });
      return json(res, 200, await getState());
    }
    if (req.method === 'POST' && req.url === '/api/open') {
      const { id } = await readBody(req);
      const b = bidders[id];
      if (!b) return json(res, 400, { error: 'no sealed lot with that number' });
      await withLock(async () => {
        deadline = nowSeconds() + WINDOW;
        await call('openSettlement', [b.bid, b.salt, deadline]);
      });
      return json(res, 200, await getState());
    }
    if (req.method === 'POST' && req.url === '/api/challenge') {
      const { id } = await readBody(req);
      const b = bidders[id];
      if (!b) return json(res, 400, { error: 'no sealed lot with that number' });
      await withLock(() => call('challenge', [b.bid, b.salt]));
      return json(res, 200, await getState());
    }
    if (req.method === 'POST' && req.url === '/api/finalize') {
      await withLock(() => call('finalize', []));
      return json(res, 200, await getState());
    }
    res.writeHead(404);
    res.end('not found');
  } catch (e: any) {
    json(res, 500, { error: String(e?.message ?? e) });
  }
}).listen(PORT, '0.0.0.0', () => logger.info(`DarkBid Merkle UI → http://<IP-VM>:${PORT}  (opening the house, wait ~1 min)`));
 
init().catch((e) => logger.error(e));
