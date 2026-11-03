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
    if (!ADDR.test(v)) { toast('not a Solana address'); return; }
    load(v);
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
  $('#seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; span = b.textContent; segSync(); draw(); });

  $('.key').innerHTML = '<span>programs</span><span>—</span><span>cap / trade</span><span>—</span><span>cap / day</span><span>—</span><span>status</span><span>not granted</span>';
  const revoke = $('#revoke');
  revoke.replaceWith(revoke.cloneNode(true));
  $('#revoke').textContent = 'Grant · soon';
  $('#revoke').addEventListener('click', () => toast('session keys open at release'));

  const SOON = { 'My doubles': 'no doubles yet. they wake at release', Shadow: 'shadow mode opens at release', Cluster: 'wallet clusters open at release', Policy: 'policy view opens at release', 'Session key': 'session keys open at release', Logs: 'logs open at release', Alerts: 'no alerts yet' };
  for (const a of document.querySelectorAll('.side .nav')) {
    const name = a.textContent.trim();
    if (name === 'Spawn') a.addEventListener('click', (e) => { e.preventDefault(); input.focus(); input.select(); toast('paste a wallet, press enter'); });
    else if (name === 'Mirror') a.addEventListener('click', (e) => e.preventDefault());
    else if (name === 'MCP') { a.href = 'https://github.com/ddllppcc/ddllpp'; a.target = '_blank'; a.rel = 'noopener'; }
    else if (SOON[name]) a.addEventListener('click', (e) => { e.preventDefault(); toast(SOON[name]); });
  }
  $('.cmd .k').style.cursor = 'pointer';
  $('.cmd .k').addEventListener('click', () => { input.focus(); input.select(); });

  // ------------------------------------------------------------- start
  fp.innerHTML = '<em style="grid-column:1/-1;text-align:left">open a wallet to read its style</em>';
  $('.rail .card h3 span').textContent = 'real on-chain stats';
  feed.innerHTML = '<div class="empty">its latest transactions show up here.</div>';
  setHead('idle');
  renderTape();
  addEventListener('resize', () => requestAnimationFrame(draw));
  document.fonts.ready.then(draw);
  draw();
  const w0 = new URLSearchParams(location.search).get('w');
  if (w0 && ADDR.test(w0)) load(w0);
  else setTimeout(() => input.focus(), 300);
})();
