/* Haverbex landing page: game hero, lore hand-off from the game, pixel dividers, subtle CRT. No build step. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const body = document.body, frame = $('#game'), cab = $('#cab');

  /* ------------------------------------------------ page CRT */
  const crtBtn = $('#crtBtn');
  let crtOn = true; try { crtOn = localStorage.getItem('hvx_page_crt') !== '0'; } catch (e) { /* */ }
  const q = new URLSearchParams(location.search); if (q.get('crt') === '0') crtOn = false; if (q.get('crt') === '1') crtOn = true;
  function setCRT(on, save) {
    crtOn = on; body.classList.toggle('crt-page', on); crtBtn.textContent = 'CRT: ' + (on ? 'ON' : 'OFF'); crtBtn.setAttribute('aria-pressed', on);
    if (save) try { localStorage.setItem('hvx_page_crt', on ? '1' : '0'); } catch (e) { /* */ }
  }
  setCRT(crtOn, false);
  if (crtOn && !RM.matches) { body.classList.add('boot'); setTimeout(() => body.classList.remove('boot'), 900); }
  crtBtn.addEventListener('click', () => setCRT(!crtOn, true));
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyV' && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) setCRT(!crtOn, true);
  });

  /* ------------------------------------------------ hero: start overlay, mobile demo */
  const start = $('#start');
  function focusGame() { cab.classList.add('started'); try { frame.focus(); frame.contentWindow.focus(); } catch (e) { /* */ } }
  start.addEventListener('click', focusGame);
  addEventListener('blur', () => { setTimeout(() => { if (document.activeElement === frame) cab.classList.add('started'); }, 0); });
  $('#demoBtn').addEventListener('click', () => { cab.classList.add('demo', 'started'); frame.src = 'game/index.html?auto=1&mute=1'; });

  /* ------------------------------------------------ lore tablets read in the game light up cards here */
  const NAMES = { 'mix-stq': 'mix-stq', littlebit: 'Qwen3.8-27B-LittleBit', 'bitnet-embed': 'bitnet-embed', omegahee: 'Omegahee',
    'bitsandbytes-tpu': 'bitsandbytes-TPU', ultrafast: 'Qwen-Image-2.1-UltraFast', 'crab-cookbook': 'ShoreCrab-128M · Crab-cookbook', zcr: 'ZCR',
    altermagnet: 'Altermagnet RAM', blastid: 'blastid', bio: 'Bio research', haverbex: 'Haverbex' };
  const seen = new Set(), foundN = $('#foundN'), toastEl = $('#toast'); let toastTimer = 0;
  function toast(html) { toastEl.innerHTML = html; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 6000); }
  addEventListener('message', (ev) => {
    if (ev.source !== frame.contentWindow || ev.origin !== location.origin && location.origin !== 'null') return;
    const d = ev.data; if (!d || d.type !== 'lamp-lore' || typeof d.id !== 'string') return;
    const key = String(d.who || d.id); if (seen.has(key)) return; seen.add(key);
    foundN.textContent = String(seen.size); const f = foundN.parentNode; f.classList.remove('pop'); void f.offsetWidth; f.classList.add('pop');
    const els = $$(`[data-lore="${CSS.escape(d.id)}"]`);
    els.forEach((el) => { el.classList.remove('found'); void el.offsetWidth; el.classList.add('found'); });
    const name = NAMES[d.id] || d.id, tgt = els[0];
    if (tgt && !tgt.id) tgt.id = 'lore-' + d.id;
    toast(`<b>TABLET READ</b> · ${name}` + (tgt ? ` <a href="#${tgt.id}">see it below ↓</a>` : ''));
  });

  /* ------------------------------------------------ project filters */
  $$('.filters .chip').forEach((b) => b.addEventListener('click', () => {
    $$('.filters .chip').forEach((x) => x.classList.toggle('on', x === b));
    $$('#grid .proj').forEach((p) => p.classList.toggle('hide', b.dataset.f !== 'all' && p.dataset.p !== b.dataset.f));
  }));
  $$('[data-filter]').forEach((a) => a.addEventListener('click', () => { const b = $(`.filters .chip[data-f="${a.dataset.filter}"]`); if (b) b.click(); }));

  /* ------------------------------------------------ pixel dividers: stage floor strips with the hero running across */
  const D = window.DATA; if (!D || !D.sprites) return;
  const ROW = (r) => r * 64 + 55, SH = 62, FOOT = 48, imgs = {};
  const img = (src) => imgs[src] || (imgs[src] = Object.assign(new Image(), { src }));
  const strips = $$('canvas.strip').map((cv, i) => ({ cv, g: cv.getContext('2d'), room: img(`game/assets/rooms/${cv.dataset.room}.png`),
    atlas: img(`game/assets/atlas_${cv.dataset.stage}.png`), st: cv.dataset.stage, r: +cv.dataset.row || 2, dir: i % 2 ? -1 : 1, x: 40 + i * 90, f: 0, vis: false, chase: false, slime: cv.dataset.slime ? { x: 60, y: FOOT, face: 1, kind: 'blob', w: 28, ten: 0, state: 'idle', lt: 0, cuts: [], oat: 200 } : null }));
  const SP = (k) => (D.pal.ruins && D.pal.ruins[k]) || '#e7c671', PH = window.Physarum;
  function spr(s, actor, anim, f, X, Y, mir) {
    const A = D.sprites[s.st] && D.sprites[s.st][actor]; const fr = A && A[anim]; if (!fr || !fr.length) return;
    const [sx, sy, w, h, ox, oy] = fr[(f | 0) % fr.length]; const g = s.g; X = Math.round(X); Y = Math.round(Y);
    if (!mir) g.drawImage(s.atlas, sx, sy, w, h, X + ox, Y + oy, w, h);
    else { g.save(); g.scale(-1, 1); g.drawImage(s.atlas, sx, sy, w, h, -(X - ox + 1), Y + oy, w, h); g.restore(); }
  }
  function size(s) {
    const r = s.cv.getBoundingClientRect(); const W = Math.max(120, Math.round(SH * r.width / Math.max(1, r.height)));
    if (s.cv.width !== W) { s.cv.width = W; s.cv.height = SH; }
  }
  function draw(s) {
    const g = s.g, W = s.cv.width; g.imageSmoothingEnabled = false; g.fillStyle = '#040404'; g.fillRect(0, 0, W, SH);
    if (s.room.complete && s.room.naturalWidth) for (let x = -((W - 480) / 2 % 480 + 480) % 480; x < W; x += 480) g.drawImage(s.room, 0, ROW(s.r) - FOOT, 480, SH, Math.round(x), 0, 480, SH);
    if (!(s.atlas.complete && s.atlas.naturalWidth)) return;
    const moving = !RM.matches, mir = s.dir < 0;
    if (moving) {
      spr(s, 'hero', 'run', s.f, s.x, FOOT, mir);
      if (s.chase) spr(s, 'skeleton', 'walk', s.f * 0.75, s.x - s.dir * 70, FOOT, mir);
    } else spr(s, 'hero', 'stand', 0, W * 0.3, FOOT, false);
    if (s.slime && PH) { const e = s.slime; PH.oat(g, SP, e.oat, FOOT + 1); PH.draw(g, SP, e, s.f, { tick: s.f }); }
    g.fillStyle = 'rgba(4,4,4,.35)'; g.fillRect(0, 0, W, 2); g.fillRect(0, SH - 2, W, 2);
  }
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { const s = strips.find((t) => t.cv === e.target); if (s) s.vis = e.isIntersecting; })) : null;
  strips.forEach((s) => { size(s); if (io) io.observe(s.cv); else s.vis = true; s.room.addEventListener('load', () => draw(s)); s.atlas.addEventListener('load', () => draw(s)); });
  addEventListener('resize', () => strips.forEach((s) => { size(s); draw(s); }));
  const bio = $('#slimeBio'), bg = bio && bio.getContext('2d'), be = { x: 46, y: 33, face: 1, kind: 'blob', w: 28, ten: 0, state: 'idle', lt: 0, cuts: [] };
  let bt = 0, bvis = !!bio;
  if (bio && io) new IntersectionObserver((es) => es.forEach((e) => { bvis = e.isIntersecting; })).observe(bio);
  function drawBio() {
    if (!bg || !PH) return; bt++; bg.clearRect(0, 0, bio.width, bio.height);
    const ph = bt % 60; be.state = ph < 34 ? 'idle' : ph < 44 ? 'lash' : 'retract';
    be.ten = be.state === 'idle' ? 8 + 4 * Math.sin(bt * 0.15) : be.state === 'lash' ? Math.min(46, (ph - 33) * 7) : Math.max(0, 46 - (ph - 43) * 4);
    PH.oat(bg, SP, 104, 34); PH.draw(bg, SP, be, bt, { tick: bt });
  }
  drawBio();
  let last = 0, acc = 0;
  function loop(t) {
    const dt = Math.min(0.1, (t - last) / 1000 || 0); last = t; acc += dt;
    if (acc >= 1 / 12) {      // 12 fps, like the game's animation rate
      acc = 0;
      if (bvis) drawBio();
      for (const s of strips) {
        if (!s.vis) continue; const W = s.cv.width;
        s.f++; s.x += s.dir * 7; const span = W + (s.chase ? 160 : 60);
        if (s.dir > 0 && s.x > W + 40) s.x = -40 - (s.chase ? 80 : 0); if (s.dir < 0 && s.x < -40) s.x = W + 40 + (s.chase ? 80 : 0);
        void span;
        if (s.slime) {              // the Golden Net creeps toward the next oat flake, then reaches for it
          const e = s.slime, d = e.oat - e.x; e.lt++;
          if (d > 26) { e.x += 0.9; e.ten += (Math.min(22, d - 14) - e.ten) * 0.2; e.state = 'idle'; }
          else { e.state = 'lash'; e.ten = Math.max(0, d - 10); if (e.lt > 20) { e.oat = e.x + 120 + Math.random() * 120; e.lt = 0; if (e.oat > W + 20) { e.x = -30; e.oat = 140; } } }
        }
        draw(s);
      }
    }
    requestAnimationFrame(loop);
  }
  if (!RM.matches) requestAnimationFrame(loop);
  RM.addEventListener && RM.addEventListener('change', () => strips.forEach(draw));
})();
