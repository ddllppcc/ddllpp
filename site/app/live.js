// ddllpp terminal, live: any Solana wallet's real activity above the seam, its sleeping double below.
// Reads public RPC only. The double itself (spawn, intent, session key) answers "soon" until release.
(() => {
  if (new URLSearchParams(location.search).has('full')) return;

  const RPCS = ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'];
  const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const WIN = { '1H': 3600, '4H': 14400, '1D': 86400, '7D': 604800, All: 0 };
  const $ = (s) => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const MONO = 'Martian Mono, monospace';
  const short = (a) => a.slice(0, 4) + '…' + a.slice(-4);
  const hhmm = (t) => new Date(t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day = (t) => new Date(t * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

  const svg = $('#svg'), chart = $('#chart'), tip = $('#tip'), soon = $('#soon');
  const tape = $('#tape'), fp = $('#fp'), feed = $('#feed'), toastEl = $('#toast');
  let wallet = '', sigs = [], span = '4H', busy = false, buckets = [], geo = null, hair = null;

  // ------------------------------------------------------------- toast
  let tt = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(tt);
    tt = setTimeout(() => toastEl.classList.remove('on'), 1900);
  }

  // ------------------------------------------------------------- prompt
  const cmd = $('.cmd');
  $('#cmd').remove();
  const input = document.createElement('input');
  input.id = 'q';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.placeholder = 'paste a Solana wallet and press enter';
  input.setAttribute('aria-label', 'Solana wallet');
  cmd.insertBefore(input, $('.cmd .cur'));
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = input.value.trim().replace(/^spawn( the double of)?\s+/i, '');
    if (!v) return;
    if (ADDR.test(v)) { load(v); return; }
    if (!wallet) { toast('not a Solana address'); return; }
    input.value = '';
    askDouble(v);
  });
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); input.select(); }
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  });

  // ------------------------------------------------------------- rpc
  async function rpc(method, params) {
    let last;
    for (const url of RPCS) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        return j.result;
      } catch (e) { last = e; }
    }
    throw last;
  }

  async function load(w) {
    if (busy) return;
    busy = true;
    wallet = w;
    input.value = 'spawn the double of ' + w;
    input.blur();
    history.replaceState(null, '', '?w=' + w);
    remember(w);
    setHead('reading the ledger');
    feed.innerHTML = '<div class="empty">reading signatures…</div>';
    try {
      const out = [];
      let before;
      for (let page = 0; page < 3; page++) {
        const r = await rpc('getSignaturesForAddress', [w, { limit: 1000, ...(before ? { before } : {}) }]);
        out.push(...r);
        if (r.length < 1000) break;
        before = r[r.length - 1].signature;
      }
      sigs = out.filter((s) => s.blockTime).sort((a, b) => a.blockTime - b.blockTime);
      if (!sigs.length) { setHead('no history'); feed.innerHTML = '<div class="empty">this wallet has no transactions yet.</div>'; draw(); fingerprint(); return; }
      span = 'All';
      segSync();
      setHead('asleep');
      if (typeof show === 'function') { current = 'Mirror'; for (const a of document.querySelectorAll('.side .nav')) a.classList.toggle('on', a.dataset.v === 'Mirror'); view.classList.remove('on'); $('.legend').style.visibility = ''; }
      log && log('opened ' + short(w));
      input.placeholder = 'ask your double anything';
      draw();
      fingerprint();
      list();
    } catch (e) {
      setHead('rpc busy');
      feed.innerHTML = '<div class="empty">public RPC is busy. press enter to try again.</div>';
      toast('public RPC is busy, try again');
    } finally {
      busy = false;
    }
  }

  // ------------------------------------------------------------- head, tape
  function setHead(state) {
    $('.pair').innerHTML = wallet
      ? `<span>${short(wallet)}</span><span class="sw">⇄</span><span class="me">your double</span>`
      : '<span style="color:var(--tx3)">no wallet</span>';
    $('.chip').innerHTML = `<i></i>${state}`;
    $('.legend').innerHTML = wallet
      ? `<div>original &nbsp;<b>${short(wallet)}</b> &nbsp;· real transactions above the seam</div><div class="p">double &nbsp;&nbsp;&nbsp;<b>yours</b> &nbsp;· asleep below, wakes at release</div>`
      : '<div>paste any Solana wallet below.</div><div class="p">its double appears under the seam.</div>';
  }

  const KEY = 'ddllpp.wallets';
  function recent() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
  function remember(w) {
    const list = [w, ...recent().filter((x) => x !== w)].slice(0, 5);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
    renderTape();
  }
  function renderTape() {
    const list = recent();
    tape.innerHTML = list.length
      ? list.map((w) => `<span class="w" data-w="${w}"><i class="${w === wallet ? '' : 'off'}"></i><em>${short(w)}</em>${w === wallet ? 'asleep' : 'open'}</span>`).join('')
      : '<span class="hint">wallets you open show up here</span>';
  }
  tape.addEventListener('click', (e) => { const w = e.target.closest('[data-w]'); if (w) load(w.dataset.w); });

  // ------------------------------------------------------------- chart
  const el = (n, a, par = svg) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); par.appendChild(e); return e; };
  const txt = (s, a) => { const t = el('text', { 'font-family': MONO, 'font-size': 10, fill: '#555', ...a }); t.textContent = s; return t; };

  function draw() {
    const W = chart.clientWidth, H = chart.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.textContent = '';
    const L = 22, R = 66, top = 92, mid = Math.round(H * 0.56), bot = H - 34, gap = 22;
    el('line', { x1: 0, x2: W, y1: mid, y2: mid, stroke: '#ff2d87', 'stroke-width': 1.5 });
    txt('seam', { x: W - R + 12, y: mid + 4, fill: '#ff2d87' });
    soon.classList.toggle('on', !wallet);
    buckets = [];
    if (!wallet || !sigs.length) { geo = null; return; }

    // windows end at the wallet's latest transaction, so a quiet wallet still shows its last session
    const t1 = sigs[sigs.length - 1].blockTime + 1;
    const t0 = span === 'All' ? sigs[0].blockTime : Math.max(sigs[0].blockTime, t1 - WIN[span]);
    const inWin = sigs.filter((s) => s.blockTime >= t0 && s.blockTime <= t1);
    const n = Math.max(24, Math.min(96, Math.floor((W - L - R) / 9)));
    const dt = Math.max(1, (t1 - t0) / n);
    for (let k = 0; k < n; k++) buckets.push({ a: t0 + k * dt, b: t0 + (k + 1) * dt, ok: 0, bad: 0, first: null });
    for (const s of inWin) {
      const b = buckets[Math.min(n - 1, Math.floor((s.blockTime - t0) / dt))];
      s.err ? b.bad++ : b.ok++;
      if (!b.first) b.first = s.signature;
    }
    const max = Math.max(1, ...buckets.map((b) => b.ok + b.bad));
    const bw = (W - L - R) / n;
    const x = (k) => L + k * bw;
    geo = { W, H, L, R, bw, mid, top, n };

    for (let k = 0; k <= 4; k++) {
      const y = mid - gap - ((mid - gap - top) * k) / 4;
      el('line', { x1: L, x2: W - R, y1: y, y2: y, stroke: '#121212' });
      if (k) txt(String(Math.round((max * k) / 4)), { x: W - R + 12, y: y + 4 });
    }
    txt('tx', { x: W - R + 12, y: top - 14 });
    buckets.forEach((b, k) => {
      const tot = b.ok + b.bad;
      if (!tot) return;
      const h = ((mid - gap - top) * tot) / max, hb = ((mid - gap - top) * b.bad) / max;
      el('rect', { x: x(k) + 1, y: mid - gap - h, width: Math.max(1, bw - 2), height: h - hb, fill: '#f3f3f3' });
      if (hb) el('rect', { x: x(k) + 1, y: mid - gap - hb, width: Math.max(1, bw - 2), height: hb, fill: '#444' });
      // the double: the same shape, asleep (outline only)
      const hd = ((bot - mid - gap - 20) * tot) / max;
      el('rect', { x: x(k) + 1.5, y: mid + gap, width: Math.max(1, bw - 3), height: hd, fill: 'none', stroke: '#ff2d87', 'stroke-width': 1, 'stroke-dasharray': '2 2', opacity: 0.7 });
    });
    txt('double asleep · wakes at release', { x: L, y: bot - 2, fill: '#ff2d87' });
    const long = t1 - t0 > 86400;
    const fmt = long ? (t) => day(t) : hhmm;
    for (let k = 0; k <= 4; k++) {
      const t = t0 + ((t1 - t0) * k) / 4;
      txt(fmt(t), { x: L + ((W - L - R) * k) / 4, y: H - 12, 'text-anchor': k === 0 ? 'start' : k === 4 ? 'end' : 'middle' });
    }
    if (!inWin.length) txt('no transactions in this window', { x: (W - R + L) / 2, y: (top + mid) / 2, fill: '#8b8b8b', 'text-anchor': 'middle', 'font-size': 12 });
    hair = el('line', { x1: -9, x2: -9, y1: 0, y2: H, stroke: '#f3f3f3', 'stroke-dasharray': '3 4', opacity: 0.45 });
  }

  function showTip(px) {
    if (!geo || !buckets.length) return;
    const k = Math.floor((px - geo.L) / geo.bw);
    const b = buckets[k];
    if (!b) { tip.classList.remove('on'); return; }
    const X = geo.L + (k + 0.5) * geo.bw;
    hair.setAttribute('x1', X); hair.setAttribute('x2', X);
    const fmt = (t) => day(t) + ' ' + hhmm(t);
    tip.innerHTML = `<div class="t">${b.ok + b.bad} tx</div>
      <div class="r"><span>from</span><span>${fmt(b.a)}</span></div>
      <div class="r"><span>to</span><span>${fmt(b.b)}</span></div>
      <div class="r"><span>failed</span><span>${b.bad}</span></div>
      <hr><div class="r d"><span>double</span><span>asleep</span></div>`;
    tip.classList.add('on');
    tip.style.left = Math.min(geo.W - 256, X + 16) + 'px';
    tip.style.top = geo.top + 'px';
  }
  // take over the pointer from the mock chart
  chart.addEventListener('pointermove', (e) => { e.stopImmediatePropagation(); showTip(e.clientX - chart.getBoundingClientRect().left); }, true);
  chart.addEventListener('pointerleave', () => { tip.classList.remove('on'); if (hair) { hair.setAttribute('x1', -9); hair.setAttribute('x2', -9); } }, true);
  chart.addEventListener('click', (e) => {
    if (!geo) return;
    const b = buckets[Math.floor((e.clientX - chart.getBoundingClientRect().left - geo.L) / geo.bw)];
    if (b && b.first) open('https://solscan.io/tx/' + b.first, '_blank', 'noopener');
  });

  // ------------------------------------------------------------- fingerprint, activity list
  function fingerprint() {
    if (!sigs.length) { fp.innerHTML = '<em style="grid-column:1/-1;text-align:left">no history to read</em>'; return; }
    const first = sigs[0].blockTime, last = sigs[sigs.length - 1].blockTime;
    const secs = Math.max(60, last - first), days = secs / 86400;
    const failed = sigs.filter((s) => s.err).length / sigs.length;
    const night = sigs.filter((s) => new Date(s.blockTime * 1000).getUTCHours() < 6).length / sigs.length;
    let burst = 0;
    for (let i = 1; i < sigs.length; i++) if (sigs[i].blockTime - sigs[i - 1].blockTime <= 10) burst++;
    burst /= Math.max(1, sigs.length - 1);
    const perDay = sigs.length / Math.max(days, 1);
    const age = secs < 3600 ? Math.round(secs / 60) + 'm' : secs < 172800 ? Math.round(secs / 3600) + 'h' : Math.round(days) + 'd';
    const rows = [
      [days < 1 ? 'tx seen' : 'tx / day', Math.min(1, Math.log10(1 + perDay) / 3), days < 1 ? sigs.length : perDay < 10 ? perDay.toFixed(1) : Math.round(perDay)],
      ['failed', failed, Math.round(failed * 100) + '%'],
      ['bursts', burst, Math.round(burst * 100) + '%'],
      ['night utc', night, Math.round(night * 100) + '%'],
      ['seen', Math.min(1, days / 30), age],
    ];
    fp.style.gridTemplateColumns = '74px 1fr 48px';
    fp.style.columnGap = '12px';
    fp.innerHTML = rows.map(([n, v, s]) => `<em style="text-align:left">${n}</em><span class="r"><i style="width:${Math.max(2, v * 100)}%"></i></span><em style="text-align:right;color:var(--tx)">${s}</em>`).join('');
    $('.rail .card h3 span').textContent = `last ${sigs.length} tx`;
  }

  function list() {
    $('.rail .card:nth-child(2) h3').innerHTML = 'Activity <span>latest first · opens solscan</span>';
    feed.innerHTML = sigs.slice(-40).reverse().map((s) => `<div class="ev"><time>${hhmm(s.blockTime)}</time><span><a href="https://solscan.io/tx/${s.signature}" target="_blank" rel="noopener">${s.signature.slice(0, 6)}…${s.signature.slice(-4)}</a></span><span class="s ${s.err ? '' : 'm'}">${s.err ? 'failed' : 'ok'}</span></div>`).join('');
    feed.style.overflowY = 'auto';
  }

  // ------------------------------------------------------------- controls
  function segSync() { for (const b of document.querySelectorAll('#seg button')) b.classList.toggle('on', b.textContent === span); }
  $('#seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; span = b.textContent; segSync(); if (current !== 'Mirror') show('Mirror'); else draw(); });

  // ------------------------------------------------------------- views
  // every nav item opens a working view over the chart; Mirror is the chart itself
  const view = document.createElement('div');
  view.className = 'view';
  chart.appendChild(view);
  let current = 'Mirror', alertT = 0, alertOn = false, logs = [], policy = null;
  const log = (s) => { logs.unshift([new Date().toLocaleTimeString('en-GB'), s]); if (current === 'Logs') views.Logs(); };
  const need = () => (wallet ? '' : '<p class="vh">open a wallet first: paste it below and press enter.</p>');
  const head = (t, sub) => `<div class="vt"><h2>${t}</h2><span>${sub}</span></div>`;

  function show(name) {
    current = name;
    for (const a of document.querySelectorAll('.side .nav')) a.classList.toggle('on', a.dataset.v === name);
    const mirror = name === 'Mirror' || name === 'Shadow';
    view.classList.toggle('on', !mirror);
    $('.legend').style.visibility = mirror ? '' : 'hidden';
    if (mirror) { (name === 'Shadow' ? drawShadow : draw)(); return; }
    views[name]();
    log('opened ' + name.toLowerCase());
  }

  const views = {
    'My doubles'() {
      const list = recent();
      view.innerHTML = head('My doubles', 'wallets you opened on this device') + (list.length
        ? '<div class="grid">' + list.map((w) => `<button class="tile" data-open="${w}"><b>${short(w)}</b><span>${w === wallet ? 'open now · asleep' : 'asleep'}</span><i>open</i></button>`).join('') + '</div>'
        : '<p class="vh">no doubles yet. spawn one: paste a wallet below.</p>');
    },
    Cluster() {
      view.innerHTML = head('Cluster', 'wallets that touch this one, from its latest transactions') + (need() || '<svg class="graph" id="graph"></svg><p class="vh" id="gst">reading the last 25 transactions…</p>');
      if (wallet) cluster();
    },
    Policy() {
      view.innerHTML = head('Policy', 'what the double would keep from this wallet') + (need() || `<div class="rules">${rules().map(([k, v, on], i) => `<label class="rule"><input type="checkbox" ${on ? 'checked' : ''} data-r="${i}"><span><b>${k}</b>${v}</span></label>`).join('')}</div><button class="btn" id="pexp">Copy policy</button>`);
      const b = $('#pexp');
      if (b) b.onclick = () => { const kept = [...view.querySelectorAll('[data-r]')].filter((c) => c.checked).map((c) => rules()[+c.dataset.r][0]); copy(JSON.stringify({ wallet, keep: kept }, null, 2)); toast('policy copied'); log('copied policy'); };
    },
    MCP() {
      const c = 'claude mcp add ddllpp -- npx -y github:ddllppcc/ddllpp';
      view.innerHTML = head('MCP', 'run your double inside your own AI tools') + `<pre class="snip">${c}</pre><div class="row"><button class="btn" id="mcpc">Copy</button><a class="btn ghost" href="https://github.com/ddllppcc/ddllpp" target="_blank" rel="noopener">GitHub</a></div><p class="vh">then ask your agent: spawn the double of ${wallet ? short(wallet) : '&lt;wallet&gt;'}</p>`;
      $('#mcpc').onclick = () => { copy(c); toast('copied'); log('copied mcp command'); };
    },
    'Session key'() {
      view.innerHTML = head('Session key', 'what the double may do from your wallet') + `<div class="form">
        <label>programs<span class="chips"><button class="ch on">swap</button><button class="ch on">pump</button><button class="ch">transfer</button></span></label>
        <label>cap / trade <output id="o1">2 SOL</output><input type="range" min="0.1" max="10" step="0.1" value="2" id="r1"></label>
        <label>cap / day <output id="o2">10 SOL</output><input type="range" min="1" max="50" step="1" value="10" id="r2"></label>
        <label>expires <output id="o3">7 days</output><input type="range" min="1" max="30" step="1" value="7" id="r3"></label>
      </div><div class="row"><button class="btn" id="kd">Copy draft</button><span class="vh" style="margin:0">nothing is signed. the double signs nothing until release.</span></div>`;
      const sync = () => { $('#o1').textContent = $('#r1').value + ' SOL'; $('#o2').textContent = $('#r2').value + ' SOL'; $('#o3').textContent = $('#r3').value + ' days'; keyCard(); };
      view.querySelectorAll('input[type=range]').forEach((r) => (r.oninput = sync));
      view.querySelectorAll('.ch').forEach((c) => (c.onclick = () => { c.classList.toggle('on'); keyCard(); }));
      $('#kd').onclick = () => { copy(JSON.stringify(draftKey(), null, 2)); toast('draft copied'); log('copied session key draft'); };
      keyCard();
    },
    Logs() {
      view.innerHTML = head('Logs', 'this session') + (logs.length ? '<div class="logs">' + logs.map(([t, s]) => `<div><time>${t}</time>${s}</div>`).join('') + '</div>' : '<p class="vh">nothing yet.</p>');
    },
    Alerts() {
      view.innerHTML = head('Alerts', 'ping when the original moves, while this tab is open') + (need() || `<div class="row"><button class="btn ${alertOn ? 'ghost' : ''}" id="al">${alertOn ? 'Stop watching' : 'Watch ' + short(wallet)}</button><span class="vh" style="margin:0">${alertOn ? 'watching. checks every 20 s.' : 'off'}</span></div>`);
      const b = $('#al');
      if (b) b.onclick = () => { alertOn ? stopAlerts() : startAlerts(); views.Alerts(); };
    },
  };

  function draftKey() {
    const r = (id) => +($('#' + id)?.value || 0);
    return { wallet: wallet || null, programs: [...view.querySelectorAll('.ch.on')].map((c) => c.textContent), capPerTradeSol: r('r1') || 2, capPerDaySol: r('r2') || 10, expiresDays: r('r3') || 7, status: 'draft' };
  }
  function keyCard() {
    const d = view.querySelector('#r1') ? draftKey() : { programs: [], capPerTradeSol: '—', capPerDaySol: '—', expiresDays: '—' };
    $('.key').innerHTML = `<span>programs</span><span>${d.programs.join(' · ') || '—'}</span><span>cap / trade</span><span>${d.capPerTradeSol}${d.programs.length ? ' SOL' : ''}</span><span>cap / day</span><span>${d.capPerDaySol}${d.programs.length ? ' SOL' : ''}</span><span>status</span><span>${d.programs.length ? 'draft' : 'not granted'}</span>`;
  }
  function copy(t) { navigator.clipboard?.writeText(t).catch(() => {}); }

  // rules the double reads from real stats
  function stats() {
    if (!sigs.length) return null;
    const first = sigs[0].blockTime, last = sigs[sigs.length - 1].blockTime;
    let burst = 0;
    for (let i = 1; i < sigs.length; i++) if (sigs[i].blockTime - sigs[i - 1].blockTime <= 10) burst++;
    const hours = new Array(24).fill(0);
    for (const x of sigs) hours[new Date(x.blockTime * 1000).getUTCHours()]++;
    return { n: sigs.length, hours, span: last - first, failed: sigs.filter((x) => x.err).length / sigs.length, burst: burst / Math.max(1, sigs.length - 1), peak: hours.indexOf(Math.max(...hours)) };
  }
  function rules() {
    const s = stats();
    if (!s) return [];
    const perH = s.n / Math.max(1, s.span / 3600);
    return [
      ['pace', perH > 60 ? `machine pace, about ${Math.round(perH)} tx an hour` : perH > 4 ? `active, about ${perH.toFixed(1)} tx an hour` : 'slow and picky', true],
      ['bursts', s.burst > 0.5 ? 'fires in bursts, many tx inside 10 s' : 'spaces its moves out', s.burst > 0.2],
      ['retries', s.failed > 0.3 ? `pushes through failures: ${Math.round(s.failed * 100)}% of tx fail` : 'rarely fails, waits for clean fills', s.failed > 0.3],
      ['clock', `busiest at ${String(s.peak).padStart(2, '0')}:00 utc`, true],
      ['size', 'entry sizes need the trade decoder', false],
    ];
  }

  // shadow: when the original trades, by hour, with the double's mirror below
  function drawShadow() {
    draw();
    const s = stats();
    if (!geo || !s) return;
    svg.textContent = '';
    const { W, H, L, R, mid } = geo, top = 92, bot = H - 34, gap = 22;
    el('line', { x1: 0, x2: W, y1: mid, y2: mid, stroke: '#ff2d87', 'stroke-width': 1.5 });
    const max = Math.max(...s.hours), bw = (W - L - R) / 24;
    s.hours.forEach((v, h) => {
      const hu = ((mid - gap - top) * v) / max, hd = ((bot - mid - gap - 20) * v) / max;
      el('rect', { x: L + h * bw + 3, y: mid - gap - hu, width: bw - 6, height: hu, fill: h === s.peak ? '#f3f3f3' : '#3a3a3a' });
      el('rect', { x: L + h * bw + 3.5, y: mid + gap, width: bw - 7, height: hd, fill: 'none', stroke: '#ff2d87', 'stroke-dasharray': '2 2' });
      if (h % 3 === 0) txt(String(h).padStart(2, '0') + ':00', { x: L + h * bw + bw / 2, y: H - 12, 'text-anchor': 'middle' });
    });
    txt('tx by hour, utc', { x: L, y: top - 14, fill: '#8b8b8b' });
    txt('the double keeps the same clock', { x: L, y: bot - 2, fill: '#ff2d87' });
    buckets = [];
  }

  // cluster: real counterparties from the latest transactions
  async function cluster() {
    const st = () => $('#gst');
    try {
      const last = sigs.slice(-25).reverse();
      const counts = new Map();
      const txs = await Promise.all(last.map((x) => rpc('getTransaction', [x.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]).catch(() => null)));
      for (const t of txs) {
        if (!t) continue;
        for (const k of t.transaction.message.accountKeys) {
          const a = k.pubkey || k;
          if (a === wallet || !k.writable) continue;
          counts.set(a, (counts.get(a) || 0) + 1);
        }
      }
      const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14);
      if (current !== 'Cluster') return;
      if (!top.length) { st().textContent = 'no counterparties in the latest transactions.'; return; }
      const g = $('#graph'), W = g.clientWidth, H = g.clientHeight, cx = W / 2, cy = H / 2, R0 = Math.min(W, H) / 2 - 44;
      g.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const max = top[0][1];
      top.forEach(([a, n], i) => {
        const ang = (i / top.length) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(ang) * R0, y = cy + Math.sin(ang) * R0;
        el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: '#ff2d87', 'stroke-width': 0.6 + (2.4 * n) / max, opacity: 0.7 }, g);
        const c = el('circle', { cx: x, cy: y, r: 4 + (8 * n) / max, fill: '#000', stroke: '#f3f3f3', 'stroke-width': 1.5, style: 'cursor:pointer' }, g);
        c.addEventListener('click', () => open('https://solscan.io/account/' + a, '_blank', 'noopener'));
        const t = el('text', { x, y: y + (y > cy ? 24 : -16), fill: '#8b8b8b', 'font-family': MONO, 'font-size': 10, 'text-anchor': 'middle' }, g);
        t.textContent = `${short(a)} ×${n}`;
      });
      el('circle', { cx, cy, r: 14, fill: '#ff2d87' }, g);
      const t = el('text', { x: cx, y: cy + 34, fill: '#f3f3f3', 'font-family': MONO, 'font-size': 11, 'text-anchor': 'middle' }, g);
      t.textContent = short(wallet);
      st().textContent = 'writable accounts shared with the latest 25 tx. click a node to open it.';
      log('read cluster of ' + short(wallet));
    } catch { if (st()) st().textContent = 'public RPC is busy. open Cluster again.'; }
  }

  // alerts: poll for new signatures while the tab is open
  function startAlerts() {
    alertOn = true;
    let seen = sigs.length ? sigs[sigs.length - 1].signature : '';
    const tick = async () => {
      try {
        const r = await rpc('getSignaturesForAddress', [wallet, { limit: 10 }]);
        const fresh = seen ? r.slice(0, r.findIndex((x) => x.signature === seen) >>> 0) : [];
        if (r[0]) seen = r[0].signature;
        if (fresh.length) { toast(`${short(wallet)} moved: ${fresh.length} new tx`); log(`${short(wallet)}: ${fresh.length} new tx`); }
      } catch {}
    };
    alertT = setInterval(tick, 20000);
    log('watching ' + short(wallet));
    toast('watching ' + short(wallet));
  }
  function stopAlerts() { alertOn = false; clearInterval(alertT); log('stopped watching'); }

  // ------------------------------------------------------------- ask the double
  let wired = null;
  async function askDouble(question) {
    if (!wallet) { toast('open a wallet first'); return; }
    say('…', true);
    log('asked: ' + question);
    try {
      if (wired === null) wired = await fetch('/api/health').then((r) => r.json()).then((j) => !!j.key).catch(() => false);
      if (!wired) return say(localAnswer(question));
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet, question }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.answer) return say(j.answer);
      if (r.status === 429) return say(j.error);
    } catch {}
    say(localAnswer(question));
  }
  function localAnswer(q) {
    const s = stats();
    if (!s) return 'i see no history yet. nothing to copy.';
    if (/\b(buy|sell|ape|send|copy (it|this|that|him|them))\b/i.test(q)) return 'i do not act yet. i wake at release.';
    const r = rules().filter((x) => x[2]).map((x) => x[1]);
    return `i read ${s.n} transactions. ${r.slice(0, 3).join('. ')}.`;
  }
  const bubble = document.createElement('div');
  bubble.className = 'say';
  $('.main').appendChild(bubble);
  function say(t, wait) {
    bubble.innerHTML = `<b>double</b><p>${t.replace(/</g, '&lt;')}</p>`;
    bubble.classList.add('on');
    bubble.classList.toggle('wait', !!wait);
    if (!wait) log('double: ' + t.slice(0, 80));
  }
  bubble.addEventListener('click', () => bubble.classList.remove('on'));

  // ------------------------------------------------------------- wire the buttons
  for (const a of document.querySelectorAll('.side .nav')) {
    const name = a.textContent.replace(/\d+$/, '').trim();
    a.dataset.v = name;
    if (name === 'ddllpp.cc') continue;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (name === 'Spawn') { show('Mirror'); input.value = ''; input.focus(); toast('paste a wallet, press enter'); return; }
      show(name);
    });
  }
  view.addEventListener('click', (e) => { const t = e.target.closest('[data-open]'); if (t) { show('Mirror'); load(t.dataset.open); } });
  const grant = $('#revoke');
  grant.replaceWith(grant.cloneNode(true));
  $('#revoke').textContent = 'Set up';
  $('#revoke').addEventListener('click', () => show('Session key'));
  keyCard();
  $('.cmd .k').style.cursor = 'pointer';
  $('.cmd .k').addEventListener('click', () => { input.value = ''; input.placeholder = wallet ? 'ask your double anything' : 'paste a Solana wallet and press enter'; input.focus(); });
  addEventListener('resize', () => { if (current === 'Shadow') requestAnimationFrame(drawShadow); });

  // ------------------------------------------------------------- start
  fp.innerHTML = '<em style="grid-column:1/-1;text-align:left">open a wallet to read its style</em>';
  $('.rail .card h3 span').textContent = 'real on-chain stats';
  feed.innerHTML = '<div class="empty">its latest transactions show up here.</div>';
  setHead('idle');
  renderTape();
  addEventListener('resize', () => { if (current === 'Mirror') requestAnimationFrame(draw); });
  document.fonts.ready.then(draw);
  draw();
  const w0 = new URLSearchParams(location.search).get('w');
  if (w0 && ADDR.test(w0)) load(w0);
  else setTimeout(() => input.focus(), 300);
})();
