// doppel / engine / mirror.js
// One vertical seam. Your cursor, and a second one on the other side that copies you
// late — and sometimes early. Canvas2D draws the seam, the ink and both cursors; the page's big
// letters are DOM, pushed by whichever cursor stands on their side of the seam.
// A click hands control to the double for a moment: the stage flips and the cursor you
// see follows it instead of your hand.
// Drag and you draw: the double draws it back on its side, mirrored, a beat late, so the ink
// closes into a Rorschach as you go (hold still and it pools). Leave the page alone and the
// double knocks on the seam; leave it longer and it steps through and stands next to you
// until you move.

export const PINK = '#ff2d87';
export const INK = '#000000';

/** classic pointer, tip at the origin, height 1 */
export const ARROW = [[0, 0], [0, 0.842], [0.21, 0.632], [0.368, 0.974], [0.5, 0.921], [0.347, 0.6], [0.605, 0.6]];

/** dir 1 = your pointer (tip up-left), dir -1 = its mirror (tip up-right) */
export function arrow(ctx, x, y, h, dir = 1, fill = INK, edge = PINK, edgeW = 0, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot * dir);
  ctx.beginPath();
  for (let i = 0; i < ARROW.length; i++) {
    const px = ARROW[i][0] * h * dir;
    const py = ARROW[i][1] * h;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  if (edgeW > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = edgeW * 2;
    ctx.strokeStyle = edge;
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

export function dot(ctx, x, y, r, fill = INK) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, f) => a + (b - a) * f;
const inout = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const outc = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.pow(1 - u, 3));
const rnd = (a, b) => a + Math.random() * (b - a);
const inR = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** per-frame samples (t, x, y) with time lookup */
class Ring {
  constructor(n = 240) { this.n = n; this.a = new Float64Array(n * 3); this.i = 0; this.c = 0; }
  push(t, x, y) {
    const k = (this.i % this.n) * 3;
    this.a[k] = t; this.a[k + 1] = x; this.a[k + 2] = y;
    this.i++;
    if (this.c < this.n) this.c++;
  }
  at(t, out) {
    const { a, n } = this;
    if (!this.c) return false;
    let nk = -1;
    for (let j = 1; j <= this.c; j++) {
      const k = ((((this.i - j) % n) + n) % n) * 3;
      if (a[k] <= t) {
        if (nk < 0) { out[0] = a[k + 1]; out[1] = a[k + 2]; return true; }
        const f = (t - a[k]) / Math.max(1e-6, a[nk] - a[k]);
        out[0] = a[k + 1] + (a[nk + 1] - a[k + 1]) * f;
        out[1] = a[k + 2] + (a[nk + 2] - a[k + 2]) * f;
        return true;
      }
      nk = k;
    }
    out[0] = a[nk + 1]; out[1] = a[nk + 2];
    return true;
  }
}

/**
 * createMirror({ seam, cur, ink, stage, orig, twin, onEvent })
 *  seam, cur  canvases (seam below the page, cursors above it)
 *  ink        optional canvas below the page for the mirrored drawing
 *  stage      element that holds both halves (gets .flip during a takeover)
 *  orig/twin  the two halves; .word > i letters (each half measured on its own), [data-hit] targets
 */
export function createMirror(opt) {
  const { seam: sCv, cur: cCv, ink: iCv = null, stage, orig, twin, onEvent = () => {} } = opt;
  const sx = sCv.getContext('2d');
  const cx = cCv.getContext('2d');
  const ix = iCv ? iCv.getContext('2d') : null;
  if (!sx || !cx) throw new Error('no 2d context');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root = document.documentElement;

  let W = 0, H = 0, DPR = 1, X0 = 0, AH = 34, small = false;
  const LAG = reduced ? 320 : 240;     // the double runs this far behind you
  const LEADT = 0.34;                  // ...or this far ahead, in seconds
  const ptr = { x: 0, y: 0, seen: false };
  const you = { x: -200, y: -200, vis: true };
  const cl = { x: -200, y: -200, vis: true };
  const hist = new Ring(240), chist = new Ring(240);
  const p = [0, 0], q = [0, 0], o = [0, 0], g2 = [0, 0];

  let t0 = performance.now();
  let lastMove = t0, mode = 'lag', modeEnd = 0, nextLead = t0 + rnd(3500, 6000), nextIdle = t0 + 5200;
  let take = null, script = null, takeN = 0, back = 0;
  let contact = 0, contactY = 0, bulge = 0, bulgeY = 0, bulgeSide = 1, amp = 0, gap = 0, gapY = 0;
  let trails = null, trailCut = 0;
  let raf = 0, last = 0, paused = false, dirtyF = true, seamQuiet = false;
  let hits = [], els = [[], []], L = [[], []], base = [[], []], wsize = 100;
  let restYou = { x: 0, y: 0 }, anchors = { connect: null, tag: null };
  // idle: beats since you last moved (the first knocks, the next steps out); outside = standing on your side
  let beats = 0, outside = false, outSide = 1, wake = false;
  // ink: one flat, time-ordered list of dabs [x, y, r, t]. Yours show at once; the double's mirrored
  // copy shows each dab LAG later. cut/cutT = how many have dried on each side.
  const dabs = [];
  let cut = 0, cutT = 0, rev = 0, pen = null, downAt = null, drew = false;
  let inkAt = 0, dry = null, inkFull = true, drawnO = 0, drawnT = 0;
  const HOLD = 2600, DRY = 760, MAXD = 2200;
  let RI = { min: 2.4, max: 8.5, k: 3.2, pool: 44, grow: 26 };

  if (fine) root.classList.add('own-cursor');

  /* ---------------------------------------------------------------- layout */
  function size() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight; X0 = W / 2;
    small = W <= 640;
    AH = small ? 30 : clamp(W * 0.023, 28, 38);
    RI = small ? { min: 2, max: 6.5, k: 2.6, pool: 30, grow: 20 } : { min: 2.4, max: 8.5, k: 3.2, pool: 44, grow: 26 };
    for (const [cv, c] of [[sCv, sx], [cCv, cx], [iCv, ix]]) {
      if (!cv || !c) continue;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    clearInk();
    seamQuiet = false;
    dirtyF = true;
  }

  function visible(el) {
    if (el.hidden || el.closest('[hidden]')) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function measure() {
    dirtyF = false;
    const flipped = stage.classList.contains('flip');
    const mx = (x) => (flipped ? 2 * X0 - x : x); // back to unflipped geometry
    const lo = [...orig.querySelectorAll('.word > i')];
    const lt = [...twin.querySelectorAll('.word > i')];
    els = [lo, lt];
    // the halves can hold different words (you type, it types back doubled): each keeps its own springs
    if (L[0].length !== lo.length) L[0] = lo.map(mk);
    if (L[1].length !== lt.length) L[1] = lt.map(mk);
    for (const list of els) for (const e of list) e.style.transform = 'none';
    base = els.map((list) => list.map((e) => { const r = e.getBoundingClientRect(); return { x: mx(r.left + r.width / 2), y: r.top + r.height / 2 }; }));
    for (const st of L) for (const l of st) l.w = '';
    const wd = orig.querySelector('.word');
    wsize = wd ? parseFloat(getComputedStyle(wd).fontSize) || 100 : 100;

    hits = [...document.querySelectorAll('[data-hit]')].filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect(), on: el.classList.contains('hov') }));

    // anchors on the original side, unflipped (the double's side is their mirror)
    const ac = (sel) => {
      const el = orig.querySelector(sel);
      if (!el || !visible(el)) return null;
      const r = el.getBoundingClientRect();
      return { l: mx(flipped ? r.right : r.left), t: r.top, w: r.width, h: r.height };
    };
    anchors.connect = ac('.connect');
    anchors.tag = ac('.tag');
    const a = anchors.connect || anchors.tag;
    if (a) restYou = { x: a.l + Math.min(a.w * 0.2, 46), y: a.t + a.h * 0.62 };
    else restYou = { x: X0 - W * 0.2, y: H * 0.7 };
  }
  const mk = () => ({ dx: 0, dy: 0, vx: 0, vy: 0, w: '' });

  /* ---------------------------------------------------------------- input */
  function onMove(e) {
    ptr.x = e.clientX; ptr.y = e.clientY;
    if (!ptr.seen) {
      ptr.seen = true;
      if (script && script.kind === 'intro') script = null;
    }
    lastMove = performance.now();
    beats = 0; wake = true;
    you.vis = true;
    if (downAt && e.pointerId === downAt.id) inkMove(e);
  }
  function onDown(e) {
    onMove(e);
    drew = false;
    if (!ix || paused || take || downAt) return;
    if ((e.button !== 0 && e.pointerType === 'mouse') || !e.isPrimary) return;
    if (e.target && e.target.closest && e.target.closest('a, button, dialog, [data-hit]')) return;
    downAt = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() };
  }
  function onUp(e) {
    if (!downAt || e.pointerId !== downAt.id) return;
    downAt = null;
    if (pen) { pen = null; inkAt = performance.now(); }
  }
  // a mouse that leaves the window leaves the double alone on the page
  const onOut = (e) => { if (e.pointerType === 'mouse' && !e.relatedTarget && !take) you.vis = false; };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', onUp, { passive: true });
  addEventListener('pointerout', onOut, { passive: true });

  /* ---------------------------------------------------------------- ink */
  function dab(x, y, r, t) { dabs.push([x, y, r, t]); }
  function clearInk() {
    dabs.length = 0; cut = cutT = rev = 0; pen = null; dry = null; drawnO = drawnT = 0; inkFull = true;
    if (ix) ix.clearRect(0, 0, W, H);
  }
  function startPen(t) {
    if (cut >= dabs.length && cutT >= dabs.length) clearInk();
    pen = { lx: downAt.x, ly: downAt.y, lt: t, r: RI.max * 0.75, still: t, pool: 0, dabR: 0, drops: 0 };
    drew = true; dry = null; mode = 'lag';
    dab(downAt.x, downAt.y, pen.r, t);
  }
  function inkMove(e) {
    if (!pen) {
      // a press only becomes ink once it travels (or is held): a plain click still hands the double the wheel
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < (e.pointerType === 'touch' ? 9 : 5)) return;
      startPen(e.timeStamp || performance.now());
    }
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    if (evs && evs.length) for (const c of evs) inkTo(c.clientX, c.clientY, c.timeStamp || e.timeStamp);
    else inkTo(e.clientX, e.clientY, e.timeStamp || performance.now());
  }
  function inkTo(x, y, t) {
    const dx = x - pen.lx, dy = y - pen.ly, d = Math.hypot(dx, dy);
    if (d < 0.75) return;
    const v = d / Math.max(4, t - pen.lt);                     // px per ms: fast = thin, slow = fat
    const goal = clamp(RI.max - v * RI.k, RI.min, RI.max);
    const r0 = pen.r, r1 = r0 + (goal - r0) * 0.28;
    const step = Math.max(1.2, Math.min(r0, r1) * 0.55);
    const n = Math.min(400, Math.ceil(d / step));
    for (let i = 1; i <= n; i++) { const f = i / n; dab(pen.lx + dx * f, pen.ly + dy * f, r0 + (r1 - r0) * f, t); }
    pen.lx = x; pen.ly = y; pen.lt = t; pen.r = r1; pen.still = t; pen.pool = 0; pen.dabR = 0; pen.drops = 0;
  }
  /** hold still and the ink pools (a press held in place is a blot), throwing a few drops the double copies too */
  function inkPool(now, dt) {
    if (!pen) { if (downAt && now - downAt.t > 300) startPen(now); return; }
    if (now - pen.still < 140) return;
    if (!pen.pool) pen.pool = pen.dabR = pen.r;
    pen.pool = Math.min(RI.pool, pen.pool + dt * RI.grow);
    if (pen.pool - pen.dabR < 0.7) return;
    const r = (pen.dabR = pen.pool), a0 = rnd(0, TAU), j = r * 0.12; // a lumpy edge, not a coin
    dab(pen.lx + Math.cos(a0) * j, pen.ly + Math.sin(a0) * j, r * 0.95, now);
    if (r > 12 + pen.drops * 8 && pen.drops < 5) {
      pen.drops++;
      const a = rnd(0, TAU), d = r * rnd(1.18, 1.5);
      dab(pen.lx + Math.cos(a) * d, pen.ly + Math.sin(a) * d, r * rnd(0.14, 0.24), now);
    }
  }
  function inkTick(now, dt) {
    if (!ix) return;
    inkPool(now, dt);
    const n = dabs.length;
    if (!n) return;
    const tc = now - (reduced ? 0 : LAG);
    while (rev < n && dabs[rev][3] <= tc) rev++;
    // too much ink: the oldest dries first, on both sides
    if (n - cut > MAXD) { cut = n - MAXD; cutT = Math.max(cutT, cut); rev = Math.max(rev, cutT); inkFull = true; }
    // let go and it stays for a moment, then dries from the first dab: yours, then the double's
    if (!pen && !downAt && !dry && now - inkAt > HOLD) dry = { t: now, a: cut, b: cutT };
    if (dry) {
      const f = reduced ? 1 : outc((now - dry.t) / DRY);
      const fT = reduced ? 1 : outc((now - dry.t - LAG) / DRY);
      const c1 = Math.floor(lerp(dry.a, n, f)), c2 = Math.floor(lerp(dry.b, n, fT));
      if (c1 !== cut || c2 !== cutT) { cut = c1; cutT = c2; inkFull = true; }
      if (cut >= n && cutT >= n) { clearInk(); return; }
    }
    drawInk();
  }
  function drawInk() {
    const n = dabs.length;
    if (inkFull) { ix.clearRect(0, 0, W, H); drawnO = cut; drawnT = cutT; inkFull = false; }
    const tEnd = Math.max(drawnT, rev);
    if (drawnO >= n && drawnT >= tEnd) return;
    ix.beginPath();
    for (let i = drawnO; i < n; i++) { const d = dabs[i]; ix.moveTo(d[0] + d[2], d[1]); ix.arc(d[0], d[1], d[2], 0, TAU); }
    for (let i = drawnT; i < tEnd; i++) { const d = dabs[i], m = 2 * X0 - d[0]; ix.moveTo(m + d[2], d[1]); ix.arc(m, d[1], d[2], 0, TAU); }
    ix.fillStyle = INK;
    ix.fill();
    drawnO = n; drawnT = tEnd;
  }

  /* ---------------------------------------------------------------- scripts */
  const home = () => {
    const hx = ptr.seen ? ptr.x : restYou.x, hy = ptr.seen ? ptr.y : restYou.y;
    o[0] = 2 * X0 - hx; o[1] = hy;
    return o;
  };
  function arc(a, b, v, bend, out) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const k = Math.sin(v * Math.PI) * bend;
    out[0] = lerp(a.x, b.x, v) - (dy / d) * k;
    out[1] = lerp(a.y, b.y, v) + (dx / d) * k;
  }
  // a point on the double's side: mirror of an original-side x when needed
  const side = (x, s) => (s > 0 ? 2 * X0 - x : x);
  /** where the double stands once it is out: beside your cursor (or on your Connect), a mirrored pair */
  function standAt(out) {
    const here = ptr.seen && you.vis;
    const px = here ? you.x : restYou.x, py = here ? you.y : restYou.y;
    out[0] = clamp(px + (outSide > 0 ? 1.3 : -0.2) * AH, 4, W - 4);
    out[1] = clamp(py, 4, H - 4);
    return out;
  }

  function pressAt(x, y) {
    for (const h of hits) {
      if (inR(h.r, x, y)) {
        h.el.classList.add('press');
        setTimeout(() => h.el.classList.remove('press'), 190);
      }
    }
  }

  function sig(v, s, x0, x1, y0, out) {
    out[0] = lerp(x0, x1, v) + s * 18 * Math.sin(v * 21);
    out[1] = y0 + 30 * Math.sin(v * 27 + 0.6) * (1 - 0.35 * v) + 9 * Math.sin(v * 63);
  }

  /** clone target while a takeover runs; returns false when it ends */
  function takePath(now, out) {
    const t = take, u = (now - t.t0) / t.dur;
    if (u >= 1) { endTake(now); return false; }
    const s = t.side;
    const h = home();
    if (t.kind === 'connect' && anchors.connect) {
      const a = anchors.connect;
      const c = { x: side(a.l + Math.min(a.w * 0.2, 46), s), y: a.t + a.h * 0.62 };
      if (u < 0.42) arc(t.p0, c, inout(u / 0.42), 60 * s, out);
      else if (u < 0.8) {
        out[0] = c.x + Math.sin((u - 0.42) * 46) * 1.2; out[1] = c.y;
        if (!t.ev.p && u > 0.56) { t.ev.p = 1; pressAt(c.x, c.y); setTimeout(() => pressAt(2 * X0 - c.x, c.y), reduced ? 0 : 150); }
      } else { const v = inout((u - 0.8) / 0.2); out[0] = lerp(c.x, h[0], v); out[1] = lerp(c.y, h[1], v); }
    } else {
      // 'sign': it writes on its side, the reflection writes on yours
      const x0 = X0 + s * W * (small ? 0.09 : 0.15), x1 = X0 + s * W * (small ? 0.42 : 0.4), y0 = H * (small ? 0.13 : 0.2);
      if (u < 0.22) { arc(t.p0, { x: x0, y: y0 + 30 * Math.sin(0.6) }, inout(u / 0.22), 40 * s, out); t.ink = false; }
      else if (u < 0.78) { sig((u - 0.22) / 0.56, s, x0, x1, y0, out); t.ink = true; }
      else { sig(1, s, x0, x1, y0, q); const v = inout((u - 0.78) / 0.22); out[0] = lerp(q[0], h[0], v); out[1] = lerp(q[1], h[1], v); t.ink = false; }
    }
    return true;
  }

  /** clone-only scripts: intro, knock (idle), out (longer idle), back (you moved), scan (after connect) */
  function scriptPath(now, out) {
    const sc = script, u = (now - sc.t0) / sc.dur;
    if (u >= 1) { if (sc.kind === 'out') outside = true; script = null; return false; }
    const s = sc.side, h = home();
    if (sc.kind === 'intro') {
      const r = { x: 2 * X0 - restYou.x, y: restYou.y };
      const v = outc(u / 0.62);
      out[0] = lerp(r.x + 40, r.x, v); out[1] = lerp(H + 70, r.y, v);
      return true;
    }
    if (sc.kind === 'knock') {
      const ky = sc.ky, K = { x: X0 + s * 16, y: ky };
      if (u < 0.34) arc(sc.p0, K, inout(u / 0.34), 34 * s, out);
      else if (u < 0.76) {
        const v = (u - 0.34) / 0.42;
        const pl = Math.max(0, 1 - Math.abs(v - 0.28) / 0.09) + Math.max(0, 1 - Math.abs(v - 0.62) / 0.09);
        out[0] = X0 + s * (16 - 11 * pl); out[1] = ky;
        const n = v < 0.45 ? 0 : 1;
        if (pl > 0.9 && !sc.ev[n]) { sc.ev[n] = 1; contact = 1; contactY = ky; bulge = 1; bulgeY = ky; bulgeSide = -s; }
      } else { const v = inout((u - 0.76) / 0.24); out[0] = lerp(K.x, h[0], v); out[1] = lerp(K.y, h[1], v); }
      return true;
    }
    if (sc.kind === 'out') {
      // it leans on the seam until the line gives, slips through and walks up beside you
      const ky = sc.ky;
      if (u < 0.3) arc(sc.p0, { x: X0 + s * 16, y: ky }, inout(u / 0.3), 34 * s, out);
      else if (u < 0.58) {
        const v = (u - 0.3) / 0.28, push = outc(Math.min(1, v / 0.78));
        out[0] = X0 + s * (16 - 12 * push); out[1] = ky + Math.sin(v * 40) * 0.8 * (1 - push);
        if (v < 0.78) { bulge = Math.max(bulge, push); bulgeY = ky; bulgeSide = -s; }
        else {
          if (!sc.ev.x) { sc.ev.x = 1; gap = 1; gapY = ky; bulge = 0; }
          out[0] = lerp(X0 + s * 4, X0 - s * 26, outc((v - 0.78) / 0.22));
        }
      } else {
        standAt(g2);
        arc({ x: X0 - s * 26, y: ky }, { x: g2[0], y: g2[1] }, inout((u - 0.58) / 0.42), -16 * s, out);
      }
      return true;
    }
    if (sc.kind === 'back') {
      // you moved: it hurries back through the seam at its own height and takes its place again
      const K = { x: X0, y: sc.ky };
      if (u < 0.42) arc(sc.p0, K, inout(u / 0.42), 22 * s, out);
      else {
        if (!sc.ev.x) { sc.ev.x = 1; gap = 0.85; gapY = sc.ky; bulge = 0.8; bulgeY = sc.ky; bulgeSide = s; }
        const v = inout((u - 0.42) / 0.58); out[0] = lerp(K.x, h[0], v); out[1] = lerp(K.y, h[1], v);
      }
      return true;
    }
    if (sc.kind === 'scan') {
      const a = anchors.tag;
      if (!a) { out[0] = sc.p0.x; out[1] = sc.p0.y; return true; } // tag not laid out yet
      const yy = a.t + a.h * 0.6;
      const xa = side(a.l + a.w - 14, s), xb = side(a.l + 18, s);
      if (u < 0.28) arc(sc.p0, { x: xa, y: yy }, inout(u / 0.28), 30 * s, out);
      else if (u < 0.86) { const v = (u - 0.28) / 0.58; out[0] = lerp(xa, xb, v) + Math.sin(v * 70) * 1.5; out[1] = yy + Math.sin(v * 31) * 2; }
      else { const v = inout((u - 0.86) / 0.14); out[0] = lerp(xb, h[0], v); out[1] = lerp(yy, h[1], v); }
      return true;
    }
    script = null;
    return false;
  }

  function startScript(kind, dur, ky) {
    if (take) return;
    outside = false;
    const s = kind === 'back' ? outSide : cl.x >= X0 ? 1 : -1;
    script = { kind, t0: performance.now(), dur, p0: { x: cl.x, y: cl.y }, side: s, ev: {}, ky: clamp(ky == null ? cl.y : ky, H * 0.14, H * 0.86) };
  }

  function takeover(kind) {
    if (take || paused) return false;
    const now = performance.now();
    const k = kind || ['connect', 'sign'][takeN++ % 2];
    script = null; outside = false;
    take = { kind: k, t0: now, dur: reduced ? 1500 : k === 'sign' ? 2100 : 1700, p0: { x: cl.x, y: cl.y }, side: cl.x >= X0 ? 1 : -1, ev: {}, ink: false };
    trails = { a: [], b: [] }; trailCut = 0;
    if (!reduced) { stage.classList.add('flip'); dirtyF = true; }
    you.vis = true;
    onEvent('take', k);
    return true;
  }
  function endTake(now) {
    if (!reduced) { stage.classList.remove('flip'); dirtyF = true; }
    take = null; back = 1;
    if (trails && (trails.a.length || trails.b.length)) trailCut = now; else trails = null;
    lastMove = now;
    onEvent('give');
  }

  /* ---------------------------------------------------------------- frame */
  function physics(dt) {
    const flipped = stage.classList.contains('flip');
    const R = wsize * (small ? 0.95 : 0.78), P = wsize * (reduced ? 0.07 : 0.2);
    const SK = reduced ? 90 : 190, SD = Math.exp(-(reduced ? 22 : 13) * dt);
    for (let h = 0; h < 2; h++) {
      const showsMirrored = (h === 0) === flipped; // which way this half reads on screen
      const m = showsMirrored ? -1 : 1;
      const list = els[h], st = L[h], bs = base[h];
      const n = Math.min(list.length, st.length, bs.length);
      for (let j = 0; j < n; j++) {
        const b = bs[j];
        const bx = flipped ? 2 * X0 - b.x : b.x, by = b.y;
        let fx = 0, fy = 0;
        for (const c of [you, cl]) {
          if (!c.vis) continue;
          const dx = bx - c.x, dy = by - c.y, d = Math.hypot(dx, dy);
          if (d < R && d > 0.5) { const f = 1 - d / R, k = (f * f * P) / d; fx += dx * k; fy += dy * k; }
        }
        const l = st[j];
        l.vx += (fx - l.dx) * SK * dt; l.vy += (fy - l.dy) * SK * dt;
        l.vx *= SD; l.vy *= SD;
        l.dx += l.vx * dt; l.dy += l.vy * dt;
        const w = `translate3d(${(l.dx * m).toFixed(1)}px,${l.dy.toFixed(1)}px,0) rotate(${(l.dx * m * 0.05).toFixed(2)}deg)`;
        if (w !== l.w) { l.w = w; list[j].style.transform = w; }
      }
    }
  }

  function hover() {
    for (const h of hits) {
      const on = (you.vis && inR(h.r, you.x, you.y)) || (cl.vis && inR(h.r, cl.x, cl.y));
      if (on !== h.on) { h.on = on; h.el.classList.toggle('hov', on); }
    }
  }

  function drawSeam(now, dt) {
    contact = Math.max(0, contact - dt * 2.6);
    bulge = Math.max(0, bulge - dt * 2.2);
    gap = Math.max(0, gap - dt * 1.4);
    const dY = Math.abs(you.x - X0);
    const near = you.vis && !reduced ? Math.max(0, 1 - dY / 160) : 0;
    amp += (near * near * (small ? 6 : 10) - amp) * (1 - Math.exp(-dt * 8));
    if (you.vis && dY < 8 && Math.abs(cl.x - X0) < 14 && Math.abs(cl.y - you.y) < 28 && contact < 0.15) { contact = 1; contactY = you.y; }
    const busy = amp > 0.05 || contact > 0 || bulge > 0 || gap > 0;
    if (!busy && seamQuiet) return;
    sx.clearRect(0, 0, W, H);
    sx.beginPath();
    // where the double went through, the line stays open for a moment
    const G = gap > 0 ? AH * 1.3 * Math.sin(Math.min(1, gap) * Math.PI * 0.5) : 0;
    let down = false;
    for (let y = -4; y <= H + 4; y += 4) {
      if (G > 1.5 && Math.abs(y - gapY) < G) { down = false; continue; }
      let x = X0;
      if (amp > 0.05) x += amp * Math.sin(y * 0.05 - now * 0.011) * Math.exp(-(((y - you.y) / 120) ** 2));
      if (bulge > 0) x += bulgeSide * 14 * bulge * Math.exp(-(((y - bulgeY) / 70) ** 2));
      if (down) sx.lineTo(x, y); else { sx.moveTo(x, y); down = true; }
    }
    sx.lineWidth = (small ? 2 : 3) + contact * 5;
    sx.strokeStyle = INK;
    sx.stroke();
    if (contact > 0) dot(sx, X0, contactY, (small ? 13 : 18) * Math.sin(contact * Math.PI));
    seamQuiet = !busy;
  }

  function drawTrail(pts, from) {
    if (pts.length - from < 2) return;
    cx.beginPath();
    cx.moveTo(pts[from][0], pts[from][1]);
    for (let i = from + 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]);
    cx.lineWidth = small ? 4 : 5.5;
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    cx.strokeStyle = INK;
    cx.stroke();
  }

  function drawCur(now) {
    cx.clearRect(0, 0, W, H);
    if (trails) {
      let from = 0;
      if (trailCut) {
        const f = (now - trailCut) / 520;
        if (f >= 1) { trails = null; trailCut = 0; }
        else from = Math.floor(f * Math.max(trails.a.length, trails.b.length));
      }
      if (trails) { drawTrail(trails.a, Math.min(from, trails.a.length)); drawTrail(trails.b, Math.min(from, trails.b.length)); }
    }
    const swap = !!take && !reduced;            // during a takeover, you are the reflection
    const e = small ? 2 : 2.5;
    if (cl.vis) arrow(cx, cl.x, cl.y, AH, swap ? 1 : -1, INK, PINK, e);
    if (you.vis) arrow(cx, you.x, you.y, AH, swap ? -1 : 1, INK, PINK, e);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    if (dirtyF) measure();
    if (downAt) lastMove = now; // holding the ink down counts as being here

    const px = ptr.seen ? ptr.x : restYou.x, py = ptr.seen ? ptr.y : restYou.y;
    hist.push(now, px, py);

    // you moved while it was out (or on its way out): it goes back in
    if (wake && !take && (outside || (script && script.kind === 'out'))) startScript('back', reduced ? 600 : 900);
    wake = false;

    // where the double wants to be
    let tx, ty, rate = 20;
    if (take && takePath(now, p)) { tx = p[0]; ty = p[1]; rate = 24; }
    else if (script && scriptPath(now, p)) { tx = p[0]; ty = p[1]; rate = 22; }
    else if (outside) {
      standAt(p);
      tx = p[0] + 3 * Math.sin(now * 0.0021); ty = p[1] + 2 * Math.sin(now * 0.0017 + 1); rate = 6;
    } else {
      const moving = now - lastMove < 180;
      if (pen || downAt) mode = 'lag';      // while you draw it copies exactly, a beat late
      else if (!reduced && mode === 'lag' && moving && now > nextLead) { mode = 'lead'; modeEnd = now + rnd(1300, 2200); }
      if (mode === 'lead' && now > modeEnd) { mode = 'lag'; nextLead = now + rnd(6000, 12000); }
      if (mode === 'lead') {
        hist.at(now, p); hist.at(now - 90, q);
        // where you will be: extrapolate your motion, but never wander off past a reach
        let ex = ((p[0] - q[0]) / 0.09) * LEADT, ey = ((p[1] - q[1]) / 0.09) * LEADT;
        const el = Math.hypot(ex, ey), reach = small ? 90 : 150;
        if (el > reach) { ex *= reach / el; ey *= reach / el; }
        tx = 2 * X0 - (p[0] + ex); ty = p[1] + ey; rate = 16;
      } else {
        hist.at(now - LAG, p);
        tx = 2 * X0 - p[0]; ty = p[1];
      }
      const idle = now - lastMove;
      if (idle > 2200) {
        const A = Math.min(1, (idle - 2200) / 3200) * (small ? 22 : 38) * (reduced ? 0.4 : 1);
        tx += A * (0.6 * Math.sin(now * 0.0011) + 0.4 * Math.sin(now * 0.0023 + 1.3));
        ty += A * (0.6 * Math.sin(now * 0.0017 + 0.7) + 0.4 * Math.sin(now * 0.0029 + 2.1));
      }
      if (idle > 5200 && now > nextIdle) {
        // first it knocks; if you are still away, the next time it comes through
        if (beats > 0 && !reduced) {
          nextIdle = now + rnd(9000, 15000);
          outSide = cl.x >= X0 ? 1 : -1;
          standAt(q);
          startScript('out', 2700, q[1]);
        } else {
          nextIdle = now + (reduced ? rnd(9000, 15000) : rnd(6000, 8500));
          startScript('knock', reduced ? 3000 : 2400);
        }
        beats++;
      }
    }
    tx = clamp(tx, 2, W - 2); ty = clamp(ty, 2, H - 2);
    const k = 1 - Math.exp(-dt * rate);
    cl.x += (tx - cl.x) * k; cl.y += (ty - cl.y) * k;
    chist.push(now, cl.x, cl.y);

    // the cursor you see
    if (take && !reduced) {
      chist.at(now - 130, q);
      you.x = 2 * X0 - q[0]; you.y = q[1];
      if (take.ink) { trails.a.push([cl.x, cl.y]); trails.b.push([you.x, you.y]); }
    } else {
      if (take && take.ink) { chist.at(now - 130, q); trails.a.push([cl.x, cl.y]); trails.b.push([2 * X0 - q[0], q[1]]); }
      if (!ptr.seen && script && script.kind === 'intro') {
        const u = (now - script.t0) / script.dur, v = outc((u - 0.22) / 0.62);
        you.x = lerp(restYou.x - 40, restYou.x, v); you.y = lerp(H + 70, restYou.y, v);
      } else if (back > 0) {
        const kb = 1 - Math.exp(-dt * 16);
        you.x += (px - you.x) * kb; you.y += (py - you.y) * kb;
        if (Math.hypot(px - you.x, py - you.y) < 0.8) back = 0;
      } else { you.x = px; you.y = py; }
    }

    physics(dt);
    hover();
    drawSeam(now, dt);
    inkTick(now, dt);
    drawCur(now);
  }

  function start() { if (!raf && !paused && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  addEventListener('resize', () => { size(); });

  size();
  measure();
  // the double walks in first; you follow
  if (!reduced) {
    cl.x = 2 * X0 - restYou.x + 40; cl.y = H + 70;
    you.x = restYou.x - 40; you.y = H + 70;
    startScript('intro', 1500);
  } else {
    cl.x = 2 * X0 - restYou.x; cl.y = restYou.y;
    you.x = restYou.x; you.y = restYou.y;
  }
  start();

  return {
    takeover,
    script: (kind) => startScript(kind, kind === 'scan' ? (reduced ? 2200 : 1800) : 2400),
    dirty: () => { dirtyF = true; seamQuiet = false; },
    /** a key or any other sign of life that is not the pointer */
    poke() { lastMove = performance.now(); beats = 0; wake = true; },
    pause(on) {
      paused = !!on;
      root.classList.toggle('own-cursor', fine && !paused);
      if (paused) { downAt = null; pen = null; stop(); }
      else { lastMove = performance.now(); beats = 0; dirtyF = true; seamQuiet = false; inkFull = true; start(); }
    },
    get busy() { return !!take; },
    /** the last press turned into ink (so it was not a click) */
    get drew() { return drew; },
    get outside() { return outside || !!(script && script.kind === 'out'); },
    get ink() { return dabs.length - cut; },
  };
}
