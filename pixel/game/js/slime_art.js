/* Physarum polycephalum — "the Golden Net". Original code-drawn pixel art, shared by the game and the landing page.
   Physarum.draw(ctx, P, e, t, opts)   P(key) -> colour from the stage palette; e: {x,y,face,kind,w,ten,state,lt,cuts,burst}
   Physarum.oat(ctx, P, x, y)          Physarum.goo(ctx, P, x, y, t) */
(function (root) {
'use strict';
const R = Math.round;
function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(R(x), R(y), w || 1, h || 1); }
function hsh(n) { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
// muted VGA yellow ramp built from the ruins palette
function ramp(P, hard) {
  return hard ? { o: P('k'), d: P('Q'), m: P('O'), l: P('G'), v: P('Q') }        // sclerotium: hardening orange crust
              : { o: P('k'), d: P('Y'), m: P('G'), l: P('F'), v: P('Y') };
}
function veinLine(c, x0, y0, x1, y1, col, seed, t, dot) {   // wobbly vein with streaming dots (shuttle streaming reverses ~every 7 s)
  const n = Math.max(2, R(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) { const s = i / n, x = x0 + (x1 - x0) * s, y = y0 + (y1 - y0) * s + Math.sin(s * 9 + seed) * 0.8; px(c, x, y, 1, 1, col); }
  if (dot) { const dir = Math.sin(t * 0.075 + seed) > 0 ? 1 : -1, k = ((t * 0.6 * dir + seed * 17) % n + n) % n;
    for (const off of [0, n / 2]) { const s = ((k + off) % n) / n; px(c, x0 + (x1 - x0) * s, y0 + (y1 - y0) * s + Math.sin(s * 9 + seed) * 0.8, 1, 1, dot); } }
}
function body(c, P, x, y, W, H, t, C, squash) {
  const half = W / 2, cols = [];
  for (let i = -half; i <= half; i++) {
    const u = i / half, pulse = 1 + 0.13 * Math.sin(t * 0.22 + i * 0.35) + 0.06 * Math.sin(t * 0.09);
    const lump = 0.82 + 0.18 * hsh(R(i * 0.34) + 5);
    cols.push([i, Math.max(1, R(H * Math.pow(Math.max(0, 1 - u * u), 0.6) * pulse * lump * (squash || 1)))]);
  }
  for (const [i, h] of cols) { px(c, x + i, y - h, 1, h, C.m); px(c, x + i, y - h, 1, 1, C.o); if (h > 3) px(c, x + i, y - h + 1, 1, 1, C.d); px(c, x + i, y - 1, 1, 1, C.d); }
  // reticulate plasmodium: dark lacunae between the living tubes, breathing with the pulse
  const cs = W > 40 ? 7 : 5, br = 0.9 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.22));
  for (const [i, h] of cols) for (let j = 2; j < h - 1; j++) {
    const gx = Math.floor((i + 100) / cs), gy = Math.floor(j / 4), hx = gx * cs - 100 + 1 + hsh(gx * 31 + gy) * (cs - 2), hy = gy * 4 + 1 + hsh(gx + gy * 57) * 2;
    if (Math.hypot(i - hx, (j - hy) * 1.3) < br) px(c, x + i, y - j, 1, 1, C.d);
  }
  for (const [i, h] of cols) if (i < 0 && i > -half * 0.7 && h > 5) px(c, x + i, y - h + 2, 1, 1, C.l);   // highlight
  // inner vein network radiating from the core
  const nV = W > 40 ? 6 : 3, cy = y - H * 0.35;
  for (let k = 0; k < nV; k++) { const a = Math.PI * (0.15 + 0.7 * (k + 0.5) / nV), ex = x + Math.cos(a) * half * 0.8 * (k % 2 ? 1 : -1), ey = y - Math.sin(a) * H * 0.55;
    veinLine(c, x, cy, ex, Math.min(y - 2, ey), C.v, k * 3.1, t, C.l); }
  return cols;
}
function floorVeins(c, P, x, y, W, len, t, C, targets) {
  const half = W / 2;
  for (const dir of [-1, 1]) {
    let cx = x + dir * half, L = len * (0.7 + 0.3 * Math.sin(t * 0.05 + dir));
    for (let s = 0; s < L; s++) { const xx = cx + dir * s; px(c, xx, y - 1, 1, 1, C.d); if (s % 5 === 0 && s < L * 0.6) px(c, xx, y - 2, 1, 1, C.m); }
    const fk = R(L * 0.45);   // fork
    for (let s = 0; s < L * 0.35; s++) px(c, cx + dir * (fk + s), y - 1 - s * 0.35, 1, 1, C.d);
    const dir2 = Math.sin(t * 0.075 + dir) > 0 ? 1 : -1, k = R(((t * 0.5 * dir2) % L + L) % L); px(c, cx + dir * k, y - 1, 1, 1, C.l);
  }
  for (const tx of targets || []) {           // shortest-path tubes to food
    const x0 = x + Math.sign(tx - x) * half * 0.9, n = Math.abs(tx - x0), lead = Math.min(n, 4 + (t % 600) * 0.6);
    for (let s = 0; s < lead; s++) { const xx = x0 + Math.sign(tx - x) * s, w = s < n * 0.8 ? 1 : 0; px(c, xx, y - 1 - w * (Math.sin(s * 0.4) > 0.6 ? 1 : 0), 1, 1, C.d); if (s % 7 === 3) px(c, xx, y - 2, 1, 1, C.m); }
    const dir2 = Math.sin(t * 0.075 + tx) > 0 ? 1 : -1, k = ((t * 0.7 * dir2) % lead + lead) % lead; px(c, x0 + Math.sign(tx - x) * k, y - 1, 1, 1, C.l);
  }
}
function tendril(c, P, x, y, face, len, lift, t, C, thick) {
  if (len < 2) return;
  let lx = x, ly = y;
  for (let s = 0; s <= len; s++) {
    const u = s / len, xx = x + face * s, yy = y - lift * Math.sin(Math.PI * u * 0.9) + Math.sin(s * 0.45 - t * 0.6) * 1.2 * u;
    const w = Math.max(1, R((thick || 3) * (1 - u * 0.7)));
    px(c, xx, yy - (w >> 1), 1, w, C.m); px(c, xx, yy - (w >> 1) - 1, 1, 1, C.o);
    if (s === R(len * 0.4) || s === R(len * 0.7)) for (let f = 1; f < 5 * (1 - u) + 2; f++) px(c, xx + face * f, yy + f * (s % 2 ? 0.8 : -0.8), 1, 1, C.d);   // forks
    lx = xx; ly = yy;
  }
  px(c, lx - 1, ly - 2, 3, 3, C.m); px(c, lx - 1, ly - 2, 1, 1, C.l); px(c, lx + face * 2, ly - 1, 1, 1, C.o);   // bulb tip
}
function net(c, P, x, y0, t, C, sag, span) {          // ceiling plasmodium: a mesh with hanging strands
  span = span || 30;
  for (let i = -span; i <= span; i++) {
    const a = y0 + 1 + R(Math.sin(i * 0.3 + t * 0.1) * 0.8), b = y0 + 4 + R(Math.sin(i * 0.21 - t * 0.08) * 1.2);
    px(c, x + i, a, 1, 1, C.m); px(c, x + i, y0, 1, 1, C.d); if (i % 4 === 0 || hsh(i + 99) < 0.2) px(c, x + i, b, 1, 1, C.d);
    if (i % 6 === 0) for (let k = a; k <= b; k++) px(c, x + i + ((k - a) % 2), k, 1, 1, C.d);
  }
  for (let i = -span + 3; i < span; i += 5) {
    const L = R((3 + hsh(i) * 8) * (sag || 1) + Math.sin(t * 0.15 + i) * 1.5);
    for (let k = 0; k < L; k++) px(c, x + i, y0 + 4 + k, 1, 1, k === L - 1 ? C.m : C.d);
    if (hsh(i + 7) > 0.5) px(c, x + i, y0 + 4 + L, 1, 1, C.l);
  }
}
function draw(c, P, e, t, o) {
  o = o || {};
  const x = R(e.x), y = R(e.y), f = e.face || 1, big = e.kind === 'boss', W = e.w || 28, H = big ? 30 : 14, C = ramp(P);
  // severed segments: drop and shrivel back
  for (const cu of e.cuts || []) { const a = (o.tick || 0) - cu.t; if (a < 0 || a > 18) continue; const yy = Math.min(y - 1, cu.y + a * a * 0.12), n = Math.max(1, R(cu.n * (1 - a / 18)));
    px(c, cu.x - (n >> 1), yy - 1, n, 2, C.m); px(c, cu.x - (n >> 1), yy - 1, 1, 1, C.l); if (a < 6) px(c, cu.x + 2, yy - 3, 1, 1, C.d); }
  if (e.state === 'ceil' || e.state === 'drip') {
    net(c, P, x, e.y, t, C, e.state === 'drip' ? 1.6 + e.lt * 0.2 : 1);
    if (e.state === 'drip') { const L = 6 + e.lt * 2; for (let k = 0; k < L; k++) px(c, x, e.y + 4 + k, 1, 1, C.d); px(c, x - 2, e.y + 4 + L, 5, 3, C.m); px(c, x - 1, e.y + 4 + L, 1, 1, C.l); }
    return;
  }
  if (e.kind === 'net' && o.ceilY !== undefined) net(c, P, x, o.ceilY, t, { o: C.o, d: C.d, m: C.d, l: C.d }, 0.5, 18);
  if (e.state === 'drop') {
    if (o.ceilY !== undefined) for (let k = o.ceilY + 4; k < y - 8; k += 1) if (k % 3) px(c, x, k, 1, 1, C.d);
    body(c, P, x, y, 16, 10, t, C, 1.3); return;
  }
  if (e.state === 'death' || e.state === 'dead') {
    const a = e.state === 'dead' ? 99 : e.lt, Hc = ramp(P, true);
    if (a < 14) { body(c, P, x, y, W * (1 - a / 40), H * (1 - a / 22), t, a > 4 ? Hc : C); for (let k = 0; k < a; k++) px(c, x - W / 3 + hsh(k) * W * 0.66, y - 1 - hsh(k + 3) * H * 0.5, 1, 1, Hc.o); }
    else { // sclerotium crust + fruiting stalks
      const cw = R(W * 0.55); for (let i = -cw / 2; i <= cw / 2; i++) { const h = R(2 + 2 * hsh(R(i) + 11)); px(c, x + i, y - h, 1, h, Hc.d); px(c, x + i, y - h, 1, 1, Hc.o); if (hsh(R(i) + 3) > 0.7) px(c, x + i, y - h + 1, 1, 1, Hc.m); }
      for (let k = 0; k < (big ? 5 : 2); k++) { const sx = x - cw / 3 + k * (cw / (big ? 4 : 1.5)), sh = 4 + R(hsh(k + 40) * (big ? 8 : 4)); px(c, sx, y - 3 - sh, 1, sh, Hc.o); px(c, sx - 1, y - 5 - sh, 3, 2, Hc.d); }
    }
    if (a >= 14 && a < 60) {   // spore burst
      const b = a - 14;
      for (let k = 0; k < (big ? 48 : 22); k++) { const ang = hsh(k) * Math.PI, sp = 1 + hsh(k + 9) * 2.4, xx = x + Math.cos(ang) * sp * b * (hsh(k + 2) > .5 ? 1 : -1), yy = y - H * 0.5 - Math.sin(ang) * sp * b * 0.8 + b * b * 0.02;
        if (b < 30 + hsh(k + 5) * 16) px(c, xx, yy, 1, 1, k % 3 ? P('Y') : P('F')); }
    }
    return;
  }
  const lash = e.state === 'lash', hit = e.state === 'hit';
  floorVeins(c, P, x, y, W, big ? 46 : 12, t, C, o.oats);
  const cols = body(c, P, x + (hit ? -f : 0), y, W, H * (hit ? 0.8 : 1) * (lash ? 1.08 : 1), t, C);
  const tx = x + f * (W / 2 - 3), ty = y - (big ? 10 : 4);
  tendril(c, P, tx, ty, f, R(e.ten || 0), lash ? Math.min(12, (e.ten || 0) * 0.25) : 1, t, C, big ? 5 : 3);
  if (big) { tendril(c, P, x - f * (W / 2 - 4), y - 6, -f, 8 + R(4 * Math.sin(t * 0.1)), 2, t + 9, C, 3);
    for (let k = 0; k < 4; k++) { const s = k / 3 - 0.5, h = 8 + R(4 * Math.sin(t * 0.13 + k * 2)); tendril(c, P, x + s * W * 0.5, y - H * 0.9 + Math.abs(s) * 10, s < 0 ? -1 : 1, h, 5, t + k * 5, C, 2); } }
  return cols;
}
function oat(c, P, x, y) {   // rolled-oat flake: Physarum food
  x = R(x); y = R(y);
  px(c, x - 3, y - 2, 6, 2, P('D')); px(c, x - 2, y - 3, 4, 1, P('D')); px(c, x - 3, y - 1, 6, 1, P('E')); px(c, x - 1, y - 2, 1, 1, P('F')); px(c, x + 2, y - 3, 1, 1, P('E'));
}
function goo(c, P, x, y, t, s) {   // slime threads holding the hero's feet
  x = R(x); y = R(y);
  for (let i = -6; i <= 6; i += 2) { const h = 2 + R((1 + Math.sin(i + t * 0.3)) * 2 * (s || 1)); px(c, x + i, y - h, 1, h, i % 4 ? P('G') : P('Y')); }
  px(c, x - 7, y - 1, 15, 1, P('Y')); px(c, x - 2, y - 2, 1, 1, P('F'));
}
const API = { draw, oat, goo, net };
if (typeof module !== 'undefined') module.exports = API; else root.Physarum = API;
})(typeof window !== 'undefined' ? window : this);
