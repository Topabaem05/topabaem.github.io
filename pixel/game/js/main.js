/* The Lamp of Dawn — browser front end: assets, audio, screens, rendering, input. */
(function () {
'use strict';
const D = window.DATA, T = window.STORY, Lg = window.Logic;
const { Game, ROW } = Lg;
const W = 480, H = 270, WY = 256, CX = W / 2, TPS = 12;   // 480x270: 480x256 world + 14 px HUD strip
const Q = new URLSearchParams(location.search);
const AUTO = Q.get('auto') === '1';
const cv = document.getElementById('screen'); const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
const wrap = document.getElementById('wrap');

/* ------------------------------------------------------------------ assets */
const IM = {};
const STAGES = D.levels.map(l => l.key);
function loadImg(k, src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => { IM[k] = i; res(); }; i.onerror = () => rej(new Error('image ' + src)); i.src = src; });
}
function imageList() {
  const L = [['font', 'assets/font.png']];
  for (const s of STAGES) { L.push(['atlas_' + s, `assets/atlas_${s}.png`], ['hud_' + s, `assets/hud_${s}.png`]); }
  for (const l of D.levels) for (const id in l.rooms) L.push(['room_' + id, `assets/rooms/${id}.png`]);
  for (const k of ['title', 'prologue', 'dawn', 'credits']) L.push(['bg_' + k, `assets/rooms/${k}.png`]);
  return L;
}

/* ------------------------------------------------------------------ audio */
const MUSIC = ['credits', 'title', 'prologue', 'card', 'dungeon', 'palace', 'rooftops', 'caverns', 'ruins', 'temple', 'boss', 'ending'];
const SFX = ['clang', 'hit', 'hurt', 'die', 'pickup', 'rumble', 'boom', 'gate', 'rattle', 'bones', 'slam', 'thud', 'land', 'crumble', 'click', 'spikes', 'chomp', 'gulp', 'ignite', 'swish'];
const AU = { ctx: null, buf: {}, master: null, cur: null, curName: null, want: null, muted: Q.get('mute') === '1' };
function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  AU.ctx = new AC(); AU.master = AU.ctx.createGain(); AU.master.gain.value = AU.muted ? 0 : 1; AU.master.connect(AU.ctx.destination);
  const load = (key, url) => fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); })
    .then(b => new Promise((res, rej) => AU.ctx.decodeAudioData(b, res, rej)))
    .then(buf => { AU.buf[key] = buf; if (key === 'm_' + AU.want && !AU.cur) playMusic(AU.want); })
    .catch(e => console.warn('audio', url, e && e.message));
  if (AU.want) load('m_' + AU.want, `assets/music/${AU.want}.ogg`);
  for (const m of MUSIC) if (m !== AU.want) load('m_' + m, `assets/music/${m}.ogg`);
  for (const s of SFX) load('s_' + s, `assets/sfx/${s}.ogg`);
}
function playMusic(name) {
  AU.want = name; if (!AU.ctx) return;
  if (AU.curName === name && AU.cur) return;
  if (AU.cur) { const o = AU.cur; o.g.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.15); setTimeout(() => { try { o.src.stop(); } catch (e) { /* already stopped */ } }, 900); AU.cur = null; AU.curName = null; }
  const b = AU.buf['m_' + name]; if (!b) return;
  const src = AU.ctx.createBufferSource(); src.buffer = b; src.loop = name !== 'card';
  const g = AU.ctx.createGain(); g.gain.value = 0.5; src.connect(g); g.connect(AU.master); src.start();
  AU.cur = { src, g }; AU.curName = name;
}
function stopMusic() { AU.want = null; if (AU.cur && AU.ctx) { const o = AU.cur; o.g.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.2); setTimeout(() => { try { o.src.stop(); } catch (e) { /* */ } }, 1200); } AU.cur = null; AU.curName = null; }
function sfx(name, quiet) {
  if (!AU.ctx) return; const b = AU.buf['s_' + name]; if (!b) return;
  const src = AU.ctx.createBufferSource(); src.buffer = b; const g = AU.ctx.createGain(); g.gain.value = quiet ? 0.3 : 0.75;
  src.connect(g); g.connect(AU.master); src.start();
}
function toggleMute() { AU.muted = !AU.muted; if (AU.master) AU.master.gain.value = AU.muted ? 0 : 1; toast(AU.muted ? T.ui.mute : T.ui.unmute); }

/* ------------------------------------------------------------------ text */
const tintCache = {};
function tinted(col) {
  let c = tintCache[col]; if (c) return c;
  c = document.createElement('canvas'); c.width = IM.font.width; c.height = IM.font.height;
  const x = c.getContext('2d'); x.drawImage(IM.font, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
  return (tintCache[col] = c);
}
function glyph(F, ch) { return F.g[ch] || F.g['?']; }
function tw(s, f) { const F = D.fonts[f]; if (f === 'pix') s = s.toUpperCase(); let w = 0; for (const ch of s) { const g = glyph(F, ch); if (g) w += g[3]; } return w; }
function text(s, x, y, f, col, sh, sc) {
  const F = D.fonts[f]; if (f === 'pix') s = s.toUpperCase(); sc = sc || 1;
  if (sh) text(s, x + sc, y + sc, f, sh, null, sc);
  const img = tinted(col); x = Math.round(x); y = Math.round(y);
  for (const ch of s) { const g = glyph(F, ch); if (!g) continue; if (g[2] > 0) ctx.drawImage(img, g[0], g[1], g[2], F.h, x + g[4] * sc, y, g[2] * sc, F.h * sc); x += g[3] * sc; }
  return x;
}
function center(s, y, f, col, sh, sc) { sc = sc || 1; text(s, Math.round(CX - tw(s, f) * sc / 2), y, f, col, sh, sc); }
function wrapText(s, f, maxw) {
  const out = [];
  for (const para of s.split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) {
      const cand = cur ? cur + ' ' + word : word;
      if (tw(cand, f) <= maxw) { cur = cand; continue; }
      if (cur) out.push(cur);
      if (tw(word, f) <= maxw) { cur = word; continue; }
      cur = ''; for (const ch of word) { if (tw(cur + ch, f) > maxw) { out.push(cur); cur = ''; } cur += ch; }
    }
    out.push(cur);
  }
  return out;
}
let PAL = D.pal[STAGES[0]];
function pal(k) { return PAL[k] || '#ffffff'; }
function slimePal(k) { return D.pal.ruins[k] || pal(k); }   // the Golden Net keeps its muted VGA yellow on every stage
function box(who, msg, pos, shown) {
  const x0 = 8, x1 = W - 9; const lines = wrapText(msg, 'f11', x1 - x0 - 16); const nl = lines.length + (who ? 1 : 0); const h = nl * 14 + 8;
  const y0 = pos === 'top' ? 4 : pos === 'mid' ? (WY >> 1) - (h >> 1) : WY - 4 - h;
  ctx.fillStyle = pal('0'); ctx.fillRect(x0, y0, x1 - x0 + 1, h + 1);
  ctx.fillStyle = pal('w'); frame(x0, y0, x1, y0 + h); ctx.fillStyle = pal('x'); frame(x0 + 2, y0 + 2, x1 - 2, y0 + h - 2);
  let y = y0 + 4; if (who) { text(who, x0 + 8, y, 'f11b', pal('G')); y += 14; }
  let left = shown === undefined ? 1e9 : shown; const col = who ? pal('W') : pal('w');
  for (const ln of lines) { const part = [...ln].slice(0, Math.max(0, left)).join(''); left -= [...ln].length; if (part) text(part, x0 + 8, y, 'f11', col); y += 14; }
  return { y0, h };
}
function frame(xa, ya, xb, yb) { ctx.fillRect(xa, ya, xb - xa + 1, 1); ctx.fillRect(xa, yb, xb - xa + 1, 1); ctx.fillRect(xa, ya, 1, yb - ya + 1); ctx.fillRect(xb, ya, 1, yb - ya + 1); }
function panel(xa, ya, xb, yb) { ctx.fillStyle = pal('0'); ctx.fillRect(xa, ya, xb - xa + 1, yb - ya + 1); ctx.fillStyle = pal('w'); frame(xa, ya, xb, yb); ctx.fillStyle = pal('x'); frame(xa + 2, ya + 2, xb - 2, yb - 2); }
let toastMsg = null, toastT = 0;
function toast(s) { toastMsg = s; toastT = 24; }

/* ------------------------------------------------------------------ sprites */
function spr(st, actor, anim, f, X, Y, mir) {
  const A = D.sprites[st] && D.sprites[st][actor]; if (!A) return false; const fr = A[anim]; if (!fr || !fr.length) return false;
  const q = fr[Math.max(0, Math.min(f | 0, fr.length - 1))]; const [sx, sy, w, h, ox, oy] = q; const img = IM['atlas_' + st];
  X = Math.round(X); Y = Math.round(Y);
  if (!mir) ctx.drawImage(img, sx, sy, w, h, X + ox, Y + oy, w, h);
  else { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(img, sx, sy, w, h, -(X - ox + 1), Y + oy, w, h); ctx.restore(); }
  return true;
}
function prop(st, k, f, x, y) { const fr = D.sprites[st]['prop_' + k] || D.sprites[st]['trap_' + k]; if (!fr) return; spr(st, D.sprites[st]['prop_' + k] ? 'prop_' + k : 'trap_' + k, 'a', f % fr.a.length, x, y, false); }

/* ------------------------------------------------------------------ input */
const KEYMAP = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D',
  ShiftLeft: 'S', ShiftRight: 'S', KeyZ: 'S', Space: 'A', KeyX: 'A', KeyC: 'B' };
const held = {}; let edges = {};
window.addEventListener('keydown', ev => {
  const k = KEYMAP[ev.code];
  if (k || ev.code === 'Enter' || ev.code === 'Space') ev.preventDefault();
  audioInit();
  if (k) { if (!held[k]) edges[k] = true; held[k] = true; }
  if (!ev.repeat) onKey(ev.code);
});
window.addEventListener('keyup', ev => { const k = KEYMAP[ev.code]; if (k) held[k] = false; });
window.addEventListener('blur', () => { for (const k in held) held[k] = false; });
cv.addEventListener('pointerdown', () => { audioInit(); onKey('Click'); });
function gameInput() {
  const i = { L: !!held.L, R: !!held.R, U: !!held.U || !!held.B, D: !!held.D, S: !!held.S, A: !!held.A, B: !!held.B || !!held.U,
    pU: !!edges.U || !!edges.B, pD: !!edges.D, pA: !!edges.A, pB: !!edges.B || !!edges.U };
  i.pSkip = i.pA; edges = {}; return i;
}

/* ------------------------------------------------------------------ scenes */
const S = { name: 'loading', t: 0 };
let G = null, AP = null, overlay = null;   // overlay: null | 'pause' | 'help'
let stats = { start: 0 };
function go(name, o) { Object.assign(S, { name, t: 0 }, o || {}); edges = {}; enterScene(); }
function enterScene() {
  switch (S.name) {
    case 'boot': break;
    case 'credits': playMusic('credits'); break;
    case 'title': playMusic('title'); PAL = D.pal.rooftops; break;
    case 'prologue': playMusic('prologue'); PAL = D.pal.temple; S.i = -1; S.flash = 0; S.out = false; S.ox = 505; S.ostrike = -1; nextPrologue(); break;
    case 'card': playMusic('card'); PAL = D.pal[STAGES[S.li]]; break;
    case 'play': break;
    case 'ending': playMusic('ending'); PAL = D.pal.rooftops; S.hx = -30; S.nx = -14; S.ei = -1; S.et = 0; break;
    case 'the_end': break;
    case 'roll': PAL = D.pal.temple; break;
  }
}
function newGame() { G = new Game(D, { seed: (Date.now() & 0xffff) | 1 }); stats = { deaths: 0 }; }
function startLevel(li) {
  if (!G) newGame();
  G.loadLevel(li); PAL = D.pal[G.stage]; AP = AUTO ? new window.AutoPilot.Autopilot(G, li) : null; overlay = null; go('play'); drainFx();
}
function nextPrologue() {
  S.i++; S.lt = 0; const st = T.prologue[S.i];
  if (!st) { go('card', { li: 0 }); return; }
  if (st.act === 'flash') { S.flash = 8; S.out = true; sfx('boom'); S.shake = 12; }
  if (st.act === 'strike') { S.ostrike = 0; sfx('swish'); }
}
function onKey(code) {
  if (code === 'KeyM') { toggleMute(); return; }
  if (code === 'KeyF') { toggleFullscreen(); return; }
  if (code === 'KeyG') { scaleMode = scaleMode === 'fill' ? 'pixel' : 'fill'; try { localStorage.setItem('lamp_scale', scaleMode); } catch (e) { /* private mode */ } fit(); toast(scaleMode === 'fill' ? T.ui.fit : T.ui.pixel); return; }
  if (code === 'KeyV') { const on = window.CRT ? window.CRT.toggle() : (wrap.classList.toggle('crt'), wrap.classList.contains('crt')); toast(on ? T.ui.crtOn : T.ui.crtOff); return; }
  if (S.name === 'loading') return;
  if (overlay === 'help') { overlay = S.name === 'play' ? 'pause' : null; if (S.name !== 'play') overlay = null; return; }
  if (code === 'KeyH') { overlay = 'help'; return; }
  const adv = code === 'Enter' || code === 'Space' || code === 'KeyX' || code === 'Click';
  switch (S.name) {
    case 'boot': go('credits'); break;
    case 'credits': if (adv || code === 'Escape') go('title'); break;
    case 'title': if (code === 'Enter' || code === 'Click') { newGame(); go('prologue'); } break;
    case 'prologue': if (code === 'Enter' || code === 'Escape') go('card', { li: 0 }); else if (adv && S.lt > 4) nextPrologue(); break;
    case 'card': if (adv && S.t > 6) startLevel(S.li); break;
    case 'play':
      if (overlay === 'pause') { if (code === 'Enter' || code === 'Escape') overlay = null; else if (code === 'KeyR') { G.restartLevel(); overlay = null; drainFx(); } return; }
      if (code === 'Enter' || code === 'Escape' || code === 'KeyP') { overlay = 'pause'; return; }
      if (G.mode === 'dead' && G.deadT > 10 && (adv || code.startsWith('Arrow'))) { G.restartLevel(); drainFx(); }
      break;
    case 'ending': if (code === 'Enter' && S.t > 24) go('the_end'); else if (adv && S.lt > 6) S.et = 1e9; break;
    case 'the_end': if (adv && S.t > 12) go('roll'); break;
    case 'roll': if (code === 'Enter' && S.t > 12) go('title'); break;
  }
}
function drainFx() {
  if (!G) return;
  for (const f of G.fx) {
    if (f.sfx) sfx(f.sfx, f.quiet);
    if (f.music) playMusic(f.music);
  }
  G.fx.length = 0;
}

/* --- per-tick update */
function tick() {
  S.t++; if (toastT > 0) toastT--;
  if (overlay) return;
  switch (S.name) {
    case 'boot': if (AUTO && S.t > 2) go('credits'); break;
    case 'credits': if (S.t >= 12 * 22 || (AUTO && S.t > 30)) go('title'); break;
    case 'title': S.walk = (S.walk || 0) + 1; if (AUTO && S.t > 24) { newGame(); go('prologue'); } break;
    case 'prologue': {
      S.lt++; const st = T.prologue[S.i]; if (!st) break;
      if (S.flash > 0) S.flash--; if (S.shake > 0) S.shake--;
      const showO = T.prologue.findIndex(p => p.act === 'orvan') <= S.i;
      if (showO && S.ox > 300) S.ox = Math.max(300, S.ox - 4);
      if (S.ostrike >= 0 && S.ostrike < 2) S.ostrike += 0.25;
      if (S.lt >= Math.round(st.dur * TPS) || (AUTO && S.lt > 10)) nextPrologue();
      break; }
    case 'card': if (S.t >= 12 * 4 || (AUTO && S.t > 8)) startLevel(S.li); break;
    case 'play': playTick(); break;
    case 'ending': {
      if (S.hx < 230) { S.hx += 1.5; S.nx += 1.5; }
      S.et++; const lines = T.epilogue;
      if (S.t > 24 && (S.ei < 0 || S.et > 12 * 6 || (AUTO && S.et > 10))) { S.ei++; S.et = 0; S.lt = 0; }
      S.lt = (S.lt || 0) + 1;
      if (S.ei >= lines.length) go('the_end');
      break; }
    case 'the_end': if (S.t > 12 * 4 || (AUTO && S.t > 10)) go('roll'); break;
    case 'roll': if (S.t > 12 * 54 || (AUTO && S.t > 140)) go('title'); break;
  }
}
function playTick() {
  const inp = AP ? AP.input() : gameInput();
  if (!AP) { /* ignore */ } else edges = {};
  G.step(inp); drainFx();
  if (G.mode === 'dead') { if (AP && G.deadT > 12) { G.restartLevel(); AP = new window.AutoPilot.Autopilot(G, G.li); drainFx(); } }
  else if (G.mode === 'done') { S.doneT = (S.doneT || 0) + 1; if (S.doneT > 10) { S.doneT = 0; if (G.li + 1 < D.levels.length) go('card', { li: G.li + 1 }); else endGame(); } }
  else if (G.mode === 'ending') { S.endT = (S.endT || 0) + 1; G.tick++; if (G.flash > 0) G.flash--; if (S.endT > 30) { S.endT = 0; endGame(); } }
}
function endGame() { stats.time = G.ticks / TPS; stats.deaths = G.deaths; go('ending'); }

/* ------------------------------------------------------------------ render */
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  switch (S.name) {
    case 'loading': center(S.err ? 'ERROR: ' + S.err : T.ui.loading + '...', 128, 'pix', '#c2baaa'); break;
    case 'boot': drawBoot(); break;
    case 'credits': drawCredits(); break;
    case 'title': drawTitle(); break;
    case 'prologue': drawPrologue(); break;
    case 'card': drawCard(); break;
    case 'play': drawPlay(); break;
    case 'ending': drawEnding(); break;
    case 'the_end': PAL = D.pal.dungeon; center('THE END', 104, 'f14', pal('G'), pal('x'), 3); center(T.title, 168, 'f11', pal('w')); fadeIn(S.t, 6); break;
    case 'roll': drawRoll(); break;
  }
  if (overlay === 'help') drawHelp();
  if (toastMsg && toastT > 0) { const w = tw(toastMsg, 'f9') + 10; ctx.fillStyle = '#000'; ctx.fillRect(W - w - 4, 4, w, 15); text(toastMsg, W - w + 1, 5, 'f9', '#ebe7db'); }
}
function fadeIn(t, n) { if (t < n) { ctx.fillStyle = '#000'; ctx.globalAlpha = 1 - t / n; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; } }
function fadeOut(t, end, n) { const k = end - t; if (k < n) { ctx.fillStyle = '#000'; ctx.globalAlpha = Math.min(1, 1 - k / n); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; } }
function drawBoot() {
  PAL = D.pal.rooftops; center(T.title, 96, 'f14', pal('G'), pal('x'), 2);
  if ((S.t >> 3) & 1 || S.t < 8) center(T.ui.boot, 150, 'f11', pal('w'));
  center(T.ui.boothint, 236, 'f9', pal('x'));
}
function drawCredits() {
  const per = 12 * 7, k = Math.min(2, Math.floor(S.t / per)), lt = S.t - k * per; PAL = D.pal.dungeon;
  const card = T.credits[k], LH = { big: 44, sub: 20, h: 18, n: 20, s: 18, '': 12 };
  let y = Math.round(WY / 2 + 6 - card.reduce((a, [, kd]) => a + LH[kd], 0) / 2);
  for (const [s, kd] of card) {
    if (kd === 'big') center(s, y, 'f14', pal('G'), pal('x'), 2);
    else if (kd === 'sub') center(s.split('').join(' '), y, 'f9', pal('w'));
    else if (kd === 'h') center(s, y, 'f11', pal('w'));
    else if (kd === 'n') center(s, y, 'f11b', pal('W'));
    else if (kd === 's') center(s, y + 8, 'f9', pal('x'));
    y += LH[kd];
  }
  fadeIn(lt, 6); fadeOut(lt, per, 6);
  text(T.ui.skip, W - tw(T.ui.skip, 'f9') - 8, H - 16, 'f9', '#5a5650');
}
function stars(t, n) {
  let s = 1234567; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = '#ebe7db';
  for (let i = 0; i < n; i++) { const x = rnd() * W | 0, y = rnd() * 72 | 0, ph = rnd() * 40 | 0; if (((t + ph) % 40) < 30) ctx.fillRect(x, y, 1, 1); if (((t + ph) % 40) < 4) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); } }
}
function drawTitle() {
  ctx.drawImage(IM.bg_title, 0, 0); stars(S.t, 40);
  const x = ((S.walk || 0) * 1.2) % 560 - 40; spr('rooftops', 'hero_ns', 'walk', ((S.walk || 0) >> 0) % 12, x, ROW(3), false) || spr('rooftops', 'hero', 'walk', (S.walk || 0) % 12, x, ROW(3), false);
  PAL = D.pal.ruins;
  center(T.title, 14, 'f14', pal('G'), pal('0'), 2);
  center(T.subtitle, 56, 'f11', pal('W'), pal('0'));
  PAL = D.pal.rooftops;
  const py = 78, n = T.controls.length; panel(76, py, W - 77, py + 10 + n * 12);
  T.controls.forEach(([k, v], i) => { text(k, 90, py + 4 + i * 12, 'f9', pal('G')); text(v, 176, py + 4 + i * 12, 'f9', pal('w')); });
  if ((S.t >> 3) & 1 || S.t < 16) center(T.ui.press, py + 18 + n * 12, 'f11b', pal('W'), '#000');
  center(T.ui.copyright, H - 15, 'f9', pal('x'));
  fadeIn(S.t, 6);
}
function drawCard() {
  const lv = D.levels[S.li]; PAL = D.pal[lv.key];
  ctx.drawImage(IM['room_' + lv.start.room], 0, 0); ctx.fillStyle = '#000'; ctx.globalAlpha = 0.62; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  const K = PAL._WK || {}; ctx.fillStyle = pal(K.l || 'w'); frame(6, 6, W - 7, H - 7); ctx.fillStyle = pal(K.s || 'x'); frame(8, 8, W - 9, H - 9);
  center(`${T.ui.chapter} ${lv.n}`, 70, 'f11b', pal('G'), '#000');
  const tl = cardLines(lv.title); tl.forEach((ln, i) => center(ln, tl.length > 1 ? 86 + i * 30 : 92, 'f14', pal('W'), '#000', 2));
  center(lv.night, tl.length > 1 ? 152 : 144, 'f11', pal('w'), '#000');
  fadeIn(S.t, 4); if (S.t > 12 && (S.t >> 3) & 1) center(T.ui.start, 232, 'f9', pal('x'));
}
function drawPrologue() {
  const sh = S.shake > 0 ? (S.shake & 1 ? 2 : -2) : 0; ctx.save(); ctx.translate(0, sh);
  ctx.drawImage(IM.bg_prologue, 0, 0);
  if (!S.out) {
    prop('temple', 'altar', S.t >> 1, 7 * 32 + 17, 3 * 64 + 19);
    spr('temple', 'narin', 'crouch', 3, 214, ROW(3), false);
    if (S.ox < 500) {
      if (S.ostrike >= 0) spr('temple', 'orvan', 'strike', Math.min(2, S.ostrike | 0), S.ox, ROW(3), true);
      else if (S.ox > 300) spr('temple', 'orvan', 'walk', (S.t % 12), S.ox, ROW(3), true);
      else spr('temple', 'orvan', 'stand', 0, S.ox, ROW(3), true) || spr('temple', 'orvan', 'engarde', 0, S.ox, ROW(3), true);
    }
  } else { ctx.fillStyle = '#000'; ctx.globalAlpha = 0.45; ctx.fillRect(0, 0, W, WY); ctx.globalAlpha = 1; }
  ctx.restore();
  if (S.flash > 0) { ctx.fillStyle = '#fff'; ctx.globalAlpha = S.flash / 8; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  const st = T.prologue[S.i];
  if (st && st.msg) box(st.who || null, st.msg, 'top', S.lt * 3);
  text(T.ui.skip, W - tw(T.ui.skip, 'f9') - 8, H - 15, 'f9', pal('x'));
  if (S.i === 0) fadeIn(S.t, 8);
}
function altarXY(R) { const g = R.def.grid; for (let r = 0; r < g.length; r++) { const c = g[r].indexOf('A'); if (c >= 0) return [c * 32 + 17, r * 64 + 19]; } return [0, 0]; }
function drawPlay() {
  const g = G, st = g.stage, R = g.room;
  const sh = g.shake > 0 ? (g.shake & 1 ? 2 : -2) : 0;
  ctx.save(); ctx.translate(0, sh);
  ctx.drawImage(IM['room_' + R.id], 0, 0); drawAmbient(g, R);
  (R.def.torches || []).forEach(([x, y], i) => prop(st, 'torch', (g.tick >> 1) + i * 2, x, y));
  if (R.def.altar && (R.lit || g.flags.lit)) { const [ax, ay] = altarXY(R); prop(st, 'altar', g.tick >> 1, ax, ay); }
  for (const p of R.plates) spr(st, 'trap_plate', 'a', p.f || 0, p.c * 32, p.r * 64 + 48);
  for (const s of R.spikes) spr(st, 'trap_spikes', 'a', s.f, s.c * 32 + 5, s.r * 64 + 42);
  for (const l of R.loose) if (l.state !== 'gone') spr(st, 'trap_loose', 'a', l.f, l.c * 32, l.r * 64 + 46);
  for (const rb of R.rubble) if (rb.f >= 0) spr(st, 'trap_rubble', 'a', rb.f, rb.c * 32 + 8, rb.r * 64);
  const tab = nearTablet(g, R); (R.def.tablets || []).forEach(t => drawTablet(t, t === tab, g.tick));
  for (const it of R.items) if (!it.taken) drawItem(st, it, g.tick);
  for (const n of R.npcs) if (!n.hidden) spr(st, 'narin', n.anim || 'crouch', n.anim === 'crouch' ? 3 : (n.f || 0), n.x, ROW(n.r), (n.face || -1) < 0);
  for (const [ox, or] of R.def.oats || []) if (!R.enemies.some(e => e.slime && e.r === or && e.state !== 'dead' && e.state !== 'death' && Math.abs(e.x - ox) < e.w / 2)) Physarum.oat(ctx, slimePal, ox, or * 64 + 56);
  for (const e of R.enemies) drawEnemy(st, e, g);
  drawHero(g);
  if (g.hero.slow > 0 && !g.hero.hidden) Physarum.goo(ctx, slimePal, g.hero.x, g.hero.y + 1, g.tick, g.hero.slow / 36);
  for (const gt of R.gates) spr(st, 'trap_gate', 'a', gt.f, gt.c * 32 + 11, gt.r * 64 + 3);
  for (const c of R.chompers) spr(st, 'trap_chomper', 'a', c.f, c.c * 32 + 13, c.r * 64 + 2);
  ctx.restore();
  if (g.dim < 0.999) { ctx.fillStyle = '#000'; ctx.globalAlpha = 1 - g.dim; ctx.fillRect(0, 0, W, WY); ctx.globalAlpha = 1; }
  if (g.flash > 0) { ctx.fillStyle = '#fff'; ctx.globalAlpha = Math.min(1, g.flash / 8); ctx.fillRect(0, 0, W, WY); ctx.globalAlpha = 1; }
  drawHud(g);
  let mb = null; if (g.msg && g.msg.text) mb = box(g.msg.who, g.msg.text, g.hero.r >= 2 ? 'top' : 'bot', g.msg.age * 3 + 3);
  if (tab && g.mode === 'play') drawLore(tab, g, mb);
  if (g.mode === 'dead' && g.deadT > 6) { const b = box(null, T.ui.dead, 'mid'); if (g.deadT > 10) center(T.ui.retry, b.y0 + b.h + 4, 'f9', pal('w'), '#000'); }
  if (g.mode === 'done' || (g.mode === 'ending' && S.endT > 18)) fadeOut(S.doneT || S.endT || 0, g.mode === 'done' ? 10 : 30, 10);
  if (overlay === 'pause') {
    panel(90, 84, W - 91, 160); center(T.ui.pause, 94, 'f14', pal('G')); center(T.ui.paused2, 122, 'f9', pal('w'));
    center(`${D.levels[g.li].title}  ·  ${fmtTime(g.ticks / TPS)}  ·  ${T.ui.deaths} ${g.deaths}`, 138, 'f9', pal('x'));
  }
}
function drawItem(st, it, t) {
  const y0 = it.r * 64;
  switch (it.type) {
    case 'potion': prop(st, 'potion', t >> 2, it.x - 4, y0 + 46); break;
    case 'big': prop(st, 'potion_big', t >> 2, it.x - 4, y0 + 44); break;
    case 'sword': prop(st, 'sword', (t % 30) < 26 ? 0 : (t % 30) - 26, it.x - 8, y0 + 50); break;
    case 'ember': prop(st, 'ember', t >> 1, it.x - 4, y0 + 40); break;
  }
}
function drawEnemy(st, e, g) {
  if (e.hidden) return;
  if (e.state === 'gone') {
    e.vt = (e.vt || 0) + 1; if (e.vt > 30) return;
    ctx.fillStyle = '#1a1020';
    for (let i = 0; i < 24; i++) { const a = i * 2.4 + e.vt * 0.3, rr = e.vt * 1.6 + (i % 5) * 3; ctx.fillRect(Math.round(e.vanishX + Math.cos(a) * rr), Math.round(ROW(e.r) - 20 + Math.sin(a) * rr * 0.6), 2, 2); }
    return;
  }
  if (e.slime) { const R = g.room; Physarum.draw(ctx, slimePal, e, g.tick, { tick: g.tick, ceilY: e.kind === 'net' ? e.r * 64 - 4 : undefined,
      oats: e.kind === 'boss' ? (R.def.oats || []).filter(o => o[1] === e.r).map(o => o[0]) : null }); return; }
  if (e.state === 'dead' && !D.sprites[st][e.actor].death) return;
  spr(st, e.actor, e.anim, e.f, e.x, e.y, e.face < 0);
}
function drawHero(g) {
  const h = g.hero; if (h.hidden || h.state === 'void') return;
  if (h.inv > 0 && (g.tick & 1) && h.state !== 'dying') return;
  const st = g.stage; let actor = h.sword ? 'hero' : 'hero_ns'; let anim = h.anim;
  const A = D.sprites[st];
  if (!A[actor] || !A[actor][anim]) actor = 'hero';
  if (!A[actor][anim]) anim = 'stand';
  if (h.hang && (h.state === 'hang' || h.state === 'climbup' || h.state === 'climbdown')) spr(st, actor, anim, h.f, h.hang.lx, h.hang.ly, h.hang.side === 'R');
  else spr(st, actor, anim, h.f, h.x, h.y, h.face < 0);
}
function drawHud(g) {
  const st = g.stage, img = IM['hud_' + st], hd = D.hud[st], y = WY + 3;
  ctx.fillStyle = '#000'; ctx.fillRect(0, WY, W, H - WY);
  for (let k = 0; k < g.maxhp; k++) ctx.drawImage(img, k < g.hero.hp ? 0 : 8, 0, hd.w, 8, 2 + hd.x0 + k * hd.w, y, hd.w, 8);
  const e = g.mode === 'play' ? (g.target() || null) : null;
  if (e) for (let k = 0; k < e.hp; k++) ctx.drawImage(img, 16, 0, 8, 8, W - 10 - k * 8, y, 8, 8);
  center(`${T.ui.level} ${g.li + 1}  ·  ${D.levels[g.li].en}  ·  ${fmtTime(g.ticks / TPS)}`, WY, 'f9', pal('W'));
}
function fmtTime(s) { s = Math.floor(s); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function drawEnding() {
  ctx.drawImage(IM.bg_dawn, 0, 0);
  const walking = S.hx < 230, f = S.t % 12;
  spr('rooftops', 'narin', walking ? 'walk' : 'stand', walking ? f : 0, S.nx + 20, ROW(2), false);
  spr('rooftops', 'hero', walking ? 'walk' : 'stand', walking ? f : 0, S.hx, ROW(2), false);
  const ln = T.epilogue[S.ei]; if (ln) box(null, ln, 'top', S.lt * 3);
  fadeIn(S.t, 12);
}
const ROLL_LH = { h: 16, n: 17, s: 17, '': 10, T: 40 };
function drawRoll() {
  ctx.drawImage(IM.bg_credits, 0, 0); PAL = D.pal.temple;
  ctx.fillStyle = '#000'; ctx.globalAlpha = 0.6; ctx.fillRect(0, 0, W, WY); ctx.globalAlpha = 1;
  let y = Math.round(WY - S.t * 1.5); const total = T.roll.reduce((a, [, k]) => a + ROLL_LH[k], 0);
  if (y + total < 150) y = 150 - total;
  for (const [s, k] of T.roll) {
    if (s && y > -40 && y < WY) {
      if (k === 'h') center(s, y, 'f9', pal('G'));
      else if (k === 'n') center(s, y, 'f11b', pal('W'));
      else if (k === 's') center(s, y, 'f9', pal('x'));
      else if (k === 'T') center(s, y, 'f14', pal('G'), '#000', 2);
    }
    y += ROLL_LH[k];
  }
  const cast = [['hero', 0], ['narin', 22], ['skeleton', 50], ['guard', 74], ['guard_fat', 98], ['birdman', 124], ['orvan', 150]];
  const px = (S.t * 1.2) % 700 - 170;
  for (const [a, dx] of cast) spr('temple', a, 'walk', (S.t + dx) % 12, px - dx, ROW(3), false);
  if (y < 150) {
    panel(80, 92, W - 81, 160);
    center(T.ui.thanks, 102, 'f11b', pal('G'));
    center(`${T.ui.time} ${fmtTime(stats.time || 0)}  ·  ${T.ui.deaths} ${stats.deaths || 0}`, 122, 'f9', pal('w'));
    center(T.ui.rollfoot, 138, 'f9', pal('x'));
  }
  ctx.fillStyle = '#000'; ctx.fillRect(0, WY, W, H - WY);
  fadeIn(S.t, 8);
}
function drawHelp() {
  const n = T.controls.length, y0 = 26; panel(40, y0, W - 41, y0 + 54 + n * 15); center(T.ui.help, y0 + 8, 'f14', pal('G'));
  T.controls.forEach(([k, v], i) => { text(k, 58, y0 + 32 + i * 15, 'f11', pal('G')); text(v, 160, y0 + 32 + i * 15, 'f11', pal('w')); });
  center(T.ui.helpClose, y0 + 36 + n * 15, 'f9', pal('x'));
}


/* ------------------------------------------------------------------ lore tablets + research ambience */
const loreSeen = new Set(); let loreT = 0, loreKey = null;
function cardLines(t) {
  if (tw(t, 'f14') * 2 <= W - 40) return [t];
  const w = t.split(' '); let best = null;
  for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '); const m = Math.max(tw(a, 'f14'), tw(b, 'f14')); if (!best || m < best[0]) best = [m, a, b]; }
  return [best[1], best[2]];
}
function nearTablet(g, R) {
  const h = g.hero; if (!R.def.tablets || h.hidden) return null;
  for (const t of R.def.tablets) if (h.r === t.r && Math.abs(h.x - (t.x + 7)) < 30 && h.state !== 'fall' && h.state !== 'void') return t;
  return null;
}
function drawTablet(t, near, tick) {
  const x = t.x, y = ROW(t.r) + 1;   // stele stands on the floor line
  ctx.fillStyle = pal('4'); ctx.fillRect(x - 2, y - 2, 18, 3); ctx.fillRect(x, y - 24, 14, 22); ctx.fillRect(x + 2, y - 26, 10, 2);
  ctx.fillStyle = pal('3'); ctx.fillRect(x + 1, y - 23, 12, 20); ctx.fillRect(x + 3, y - 25, 8, 2);
  ctx.fillStyle = pal('2'); ctx.fillRect(x + 1, y - 23, 3, 20);
  const lit = near || ((tick >> 2) % 6 === 0); ctx.fillStyle = lit ? pal('G') : pal('Y');
  [[3, 8], [3, 6], [3, 8], [3, 5], [3, 7]].forEach(([dx, w], i) => ctx.fillRect(x + dx + 1, y - 20 + i * 3, w, 1));
  if (near) { ctx.fillStyle = pal('F'); const p = (tick >> 1) % 4; ctx.fillRect(x + 6, y - 31 - p, 2, 2); ctx.fillRect(x + 6 - p, y - 30, 1, 1); ctx.fillRect(x + 8 + p, y - 30, 1, 1); }
}
function drawLore(t, g, mb) {
  if (loreKey !== t) { loreKey = t; loreT = 0; } loreT++;
  if (!loreSeen.has(t.who)) { loreSeen.add(t.who); try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'lamp-lore', id: t.lore, who: t.who, link: t.link }, '*'); } catch (e) { /* */ } }
  const lines = t.msg.split('\n').flatMap(l => wrapText(l, 'f11', W - 40)), x0 = 8;
  const x1 = Math.min(W - 9, x0 + 16 + Math.max(150, tw(t.who, 'f11b') + 40, ...lines.map(l => tw(l, 'f11')), t.link ? tw('↗ ' + t.link, 'f9') : 0)), h = (lines.length + 1) * 14 + (t.link ? 13 : 0) + 8;
  let y0 = g.hero.r >= 2 ? 4 : WY - 4 - h; if (mb && Math.abs(mb.y0 - y0) < mb.h + 4) y0 = mb.y0 < WY / 2 ? mb.y0 + mb.h + 4 : mb.y0 - h - 4;
  ctx.fillStyle = '#0c0a08'; ctx.fillRect(x0, y0, x1 - x0 + 1, h + 1);
  ctx.fillStyle = pal('Y'); frame(x0, y0, x1, y0 + h); ctx.fillStyle = pal('G'); frame(x0 + 2, y0 + 2, x1 - 2, y0 + h - 2);
  text(T.ui.lore, x1 - 8 - tw(T.ui.lore, 'f9'), y0 + 5, 'f9', pal('Y'));
  let y = y0 + 4; text(t.who, x0 + 8, y, 'f11b', pal('G')); y += 14;
  let left = loreT * 4; for (const ln of lines) { const part = [...ln].slice(0, Math.max(0, left)).join(''); left -= [...ln].length; if (part) text(part, x0 + 8, y, 'f11', pal('W')); y += 14; }
  if (t.link) text('↗ ' + t.link, x0 + 8, y + 1, 'f9', pal('v'));
}
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }
function drawAmbient(g, R) {
  const key = g.stage, t = g.tick, grid = R.def.grid;
  if (key === 'dungeon') {           // shrinking weights: motes of light that get smaller as they fall
    for (let i = 0; i < 22; i++) { const x = hash(i * 7 + 1) * W | 0, sp = 0.5 + hash(i * 13) * 0.8, yy = ((t * sp + hash(i) * 300) % 300) - 30, sz = yy < 80 ? 3 : yy < 170 ? 2 : 1;
      ctx.fillStyle = pal(i % 3 ? 'Y' : 'G'); ctx.globalAlpha = 0.45; ctx.fillRect(x, yy | 0, sz, sz); }
    ctx.globalAlpha = 1;
  } else if (key === 'caverns') {    // spinning lodestones: pairs of crystals with alternating spin arrows
    for (let r = 0; r < 3; r++) for (let c = 1; c < 14; c++) {
      if (grid[r][c] !== '.' || grid[r][c + 1] !== '.' || hash(r * 31 + c * 7 + R.id.charCodeAt(1)) > 0.16) continue;
      const cx = c * 32 + 16, cy = r * 64 + 22, ph = Math.floor(t / 3 + c) % 8;
      for (const [dx, up] of [[0, 1], [12, 0]]) {
        const s = (up ? ph : (ph + 4) % 8) < 4;   // alternate: one up, one down, flipping in turn
        ctx.fillStyle = pal('4'); ctx.fillRect(cx + dx - 4, cy + 4, 9, 2);
        ctx.fillStyle = pal(up ? 'V' : 'R'); ctx.fillRect(cx + dx - 2, cy - 6, 5, 10); ctx.fillRect(cx + dx - 1, cy - 8, 3, 14);
        ctx.fillStyle = pal('F'); const ay = s ? cy - 5 : cy + 1;
        ctx.fillRect(cx + dx, cy - 5, 1, 9); if (s) { ctx.fillRect(cx + dx - 1, ay + 1, 3, 1); } else { ctx.fillRect(cx + dx - 1, ay + 2, 3, 1); }
      }
      ctx.globalAlpha = 0.10 + 0.08 * Math.sin(t / 4 + c); ctx.fillStyle = pal('v'); ctx.fillRect(cx - 5, cy - 11, 22, 18); ctx.fillRect(cx - 8, cy - 7, 28, 10); ctx.fillRect(cx - 2, cy - 14, 16, 24); ctx.globalAlpha = 1;
    }
  } else if (key === 'ruins') {      // living spores: lichen on floor edges, mushrooms, glowing drifting spores
    for (let r = 0; r < 4; r++) for (let c = 0; c < 15; c++) {
      const cell = grid[r][c], hv = hash(r * 53 + c * 11 + R.id.charCodeAt(1)), y = ROW(r) + 1;
      if (cell === 'F' && (r === 0 || grid[r - 1][c] === '.')) {
        const lx = c * 32 + (hv * 18 | 0); ctx.fillStyle = pal('B'); ctx.fillRect(lx, y - 2, 10, 2); ctx.fillStyle = pal('A'); ctx.fillRect(lx + 2, y - 3, 6, 1); ctx.fillRect(lx + 1, y - 2, 3, 1);
        if (hv < 0.55) { const x = c * 32 + 6 + ((hv * 97 | 0) % 20); const tall = hv < 0.2 ? 6 : 4;
          ctx.fillStyle = pal('D'); ctx.fillRect(x + 1, y - tall, 2, tall); ctx.fillStyle = pal(hv < 0.3 ? 'R' : 'O'); ctx.fillRect(x - 1, y - tall - 2, 6, 2); ctx.fillRect(x, y - tall - 3, 4, 1); ctx.fillStyle = pal('W'); ctx.fillRect(x + 1, y - tall - 2, 1, 1);
          if (hv < 0.12) { ctx.fillStyle = pal('D'); ctx.fillRect(x + 7, y - 3, 1, 3); ctx.fillStyle = pal('R'); ctx.fillRect(x + 6, y - 4, 3, 1); } }
      }
      if (cell === 'W' && (r === 0 || grid[r - 1][c] !== 'W') && hv < 0.6) {   // moss curtains hanging over wall tops
        const x0 = c * 32 + (hv * 12 | 0); ctx.fillStyle = pal('B'); for (let k = 0; k < 6; k++) { const len = 3 + ((hash(c * 7 + k + r * 3) * 9) | 0); ctx.fillRect(x0 + k * 3, r * 64, 2, len); }
        ctx.fillStyle = pal('A'); ctx.fillRect(x0, r * 64, 18, 2);
      }
    }
    for (let i = 0; i < 34; i++) { const x = (hash(i * 3 + 2) * W + Math.sin(t / 9 + i) * 8) | 0, yy = WY - ((t * (0.35 + hash(i * 5) * 0.6) + hash(i * 17) * 270) % 270), big = i % 4 === 0;
      ctx.globalAlpha = 0.25; ctx.fillStyle = pal('A'); if (big) ctx.fillRect(x - 1, (yy | 0) - 1, 4, 4);
      ctx.globalAlpha = 0.85; ctx.fillStyle = pal(i % 3 ? 'F' : 'A'); ctx.fillRect(x, yy | 0, big ? 2 : 1, big ? 2 : 1); }
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ scaling + loop */
let scaleMode = (() => { try { return localStorage.getItem('lamp_scale') || 'auto'; } catch (e) { return 'auto'; } })();
function fit() {
  const iw = window.innerWidth, ih = window.innerHeight;
  const kf = Math.min(iw / W, ih / H), ki = Math.max(1, Math.floor(kf));
  // integer scale keeps pixels perfectly square; use it unless it would waste a lot of the window (auto) or the user asked to fill
  let k = ki; if (scaleMode === 'fill' || (scaleMode === 'auto' && (ki * ki) / (kf * kf) < 0.85) || kf < 1) k = kf;
  const cw = Math.floor(W * k), ch = Math.floor(H * k);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px';
  window.__scale = { k, mode: scaleMode, integer: k === ki }; if (window.CRT) window.CRT.resize(cw, ch);
}
function toggleFullscreen() {
  const d = document;
  if (!d.fullscreenElement) { const el = d.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => Promise.reject())).call(el).then(() => toast(T.ui.fsOn)).catch(() => {}); }
  else { (d.exitFullscreen || d.webkitExitFullscreen).call(d); toast(T.ui.fsOff); }
}
if (window.CRT) window.CRT.init(cv, wrap, { force: Q.get('crt') === '0' ? false : Q.get('crt') === '1' ? true : undefined });
window.addEventListener('resize', fit); document.addEventListener('fullscreenchange', fit); fit();
const fsb = document.getElementById('fs'); if (fsb) fsb.addEventListener('click', ev => { ev.stopPropagation(); audioInit(); toggleFullscreen(); });
let last = 0, acc = 0, running = true;
function frameLoop(ts) {
  if (!last) last = ts; let dt = (ts - last) / 1000; last = ts; if (dt > 0.25) dt = 0.25;
  acc += dt * (AUTO && Q.get('fast') ? +Q.get('fast') : 1);
  let n = 0; while (acc >= 1 / TPS && n < 60) { tick(); acc -= 1 / TPS; n++; }
  render(); if (window.CRT) window.CRT.frame(dt);
  if (running) requestAnimationFrame(frameLoop);
}
// test hooks
window.__game = { get scene() { return S.name; }, get S() { return S; }, get G() { return G; }, go, startLevel, render, tick, lore: () => [...loreSeen],
  stepN(n) { for (let i = 0; i < n; i++) tick(); render(); if (window.CRT) { window.CRT.power = 1; window.CRT.frame(0); } return S.name; }, pause() { running = false; }, resume() { if (!running) { running = true; last = 0; requestAnimationFrame(frameLoop); } } };

Promise.all(imageList().map(([k, s]) => loadImg(k, s))).then(() => {
  const lv = Q.get('level');
  if (lv) { newGame(); startLevel(Math.max(0, Math.min(D.levels.length - 1, (+lv) - 1))); }
  else if (Q.get('scene')) go(Q.get('scene'), { li: 0 });
  else go('boot');
  requestAnimationFrame(frameLoop);
}).catch(e => { S.err = e.message; console.error(e); requestAnimationFrame(frameLoop); });
})();
