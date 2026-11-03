// ddllpp api: POST /api/ask — the double answers questions about one wallet, through Kimi.
// No dependencies. The key is read from a file and never logged or sent to the browser.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = +(process.env.PORT || 5871);
const KEY_FILE = process.env.KIMI_KEY_FILE || '/srv/ddllpp/shared/kimi.key';
const BASE = process.env.KIMI_BASE || 'https://api.moonshot.ai/v1';
const RPC = 'https://solana-rpc.publicnode.com';
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// spend caps: per visitor per rolling hour, and for the whole service per day
const PER_IP_HOUR = 20;
const ALL_DAY = 1500;
const hits = new Map();
let day = { start: Date.now(), n: 0 };

const key = () => { try { return readFileSync(KEY_FILE, 'utf8').trim(); } catch { return ''; } };
let model = process.env.KIMI_MODEL || '';

async function pickModel() {
  if (model) return model;
  const r = await fetch(BASE + '/models', { headers: { authorization: 'Bearer ' + key() } });
  const j = await r.json();
  const ids = (j.data || []).map((m) => m.id);
  model = ['kimi-k2-turbo-preview', 'kimi-k2-0905-preview', 'kimi-latest'].find((m) => ids.includes(m)) || ids.find((m) => /kimi/.test(m)) || ids[0] || '';
  return model;
}

function allowed(ip) {
  const now = Date.now();
  if (now - day.start > 864e5) day = { start: now, n: 0 };
  if (day.n >= ALL_DAY) return false;
  const list = (hits.get(ip) || []).filter((t) => now - t < 36e5);
  if (list.length >= PER_IP_HOUR) return false;
  list.push(now);
  hits.set(ip, list);
  day.n++;
  return true;
}

async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

// what the double knows: real numbers from the ledger, computed here, not taken from the browser
async function facts(wallet) {
  const [sigs, bal] = await Promise.all([
    rpc('getSignaturesForAddress', [wallet, { limit: 1000 }]),
    rpc('getBalance', [wallet]).catch(() => null),
  ]);
  const s = sigs.filter((x) => x.blockTime).sort((a, b) => a.blockTime - b.blockTime);
  if (!s.length) return { wallet, txSeen: 0 };
  const first = s[0].blockTime, last = s[s.length - 1].blockTime;
  let burst = 0;
  for (let i = 1; i < s.length; i++) if (s[i].blockTime - s[i - 1].blockTime <= 10) burst++;
  const hours = new Array(24).fill(0);
  for (const x of s) hours[new Date(x.blockTime * 1000).getUTCHours()]++;
  return {
    wallet,
    balanceSol: bal ? +(bal.value / 1e9).toFixed(3) : null,
    txSeen: s.length,
    firstSeenUtc: new Date(first * 1000).toISOString(),
    lastSeenUtc: new Date(last * 1000).toISOString(),
    spanHours: +((last - first) / 3600).toFixed(1),
    failedShare: +(s.filter((x) => x.err).length / s.length).toFixed(2),
    burstShare: +(burst / Math.max(1, s.length - 1)).toFixed(2),
    busiestHourUtc: hours.indexOf(Math.max(...hours)),
    nightShareUtc: +(hours.slice(0, 6).reduce((a, b) => a + b, 0) / s.length).toFixed(2),
  };
}

const SYSTEM = `You are the double of one Solana wallet inside the ddllpp terminal. ddllpp is an AI agent that clones a wallet's trading style.
You only know the on-chain facts given to you (JSON). Speak as the wallet's double, first person, short: 1-4 sentences, lowercase allowed, cold and calm, no emoji, no hashtags, no exclamation marks.
Read the facts like a trader would: how active, how fast, when it trades, how often it fails, whether it looks like a bot or a human.
Never invent numbers, tokens or trades that are not in the facts; say you cannot see that yet.
You cannot trade yet: if asked to buy, sell, copy or act, say you wake at release.
No financial advice and no promises of profit.`;

async function ask(wallet, question) {
  const f = await facts(wallet);
  const r = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key() },
    body: JSON.stringify({
      model: await pickModel(),
      max_tokens: 320,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `facts: ${JSON.stringify(f)}\n\nquestion: ${question}` },
      ],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('model ' + r.status + ' ' + (j.error?.message || ''));
  return (j.choices?.[0]?.message?.content || '').trim();
}

function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') return send(res, 200, { ok: true, key: !!key(), model: model || null });
  if (req.method !== 'POST' || req.url !== '/api/ask') return send(res, 404, { error: 'not found' });
  let body = '';
  for await (const c of req) { body += c; if (body.length > 4000) return send(res, 413, { error: 'too long' }); }
  let wallet, question;
  try { ({ wallet, question } = JSON.parse(body)); } catch { return send(res, 400, { error: 'bad json' }); }
  question = String(question || '').trim().slice(0, 400);
  if (!ADDR.test(String(wallet || ''))) return send(res, 400, { error: 'open a wallet first' });
  if (!question) return send(res, 400, { error: 'ask something' });
  if (!key()) return send(res, 503, { error: 'the double is not wired yet' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!allowed(ip)) return send(res, 429, { error: 'the double is resting. try later' });
  try {
    send(res, 200, { answer: await ask(wallet, question) });
  } catch (e) {
    console.error('ask failed:', e.message);
    send(res, 502, { error: 'the double did not answer. try again' });
  }
}).listen(PORT, '127.0.0.1', () => console.log('ddllpp api on', PORT));
