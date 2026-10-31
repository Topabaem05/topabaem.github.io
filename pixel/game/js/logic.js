/* 새벽의 등불 — game logic (deterministic, 12 ticks/s, no DOM). */
(function (root) {
'use strict';
const CW = 32, RH = 64, NC = 15, NR = 4, RW = NC * CW, RHT = NR * RH;   // rooms: 15x4 cells = 480x256
const ROW = r => r * RH + 55;
const FLOORS = 'FPXSGTKBA';
const cellOf = x => Math.floor(x / CW);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const STATS = {
  skeleton: { aggr: .09, parry: .30, wind: 2 }, guard: { aggr: .11, parry: .38, wind: 2 },
  guard_fat: { aggr: .10, parry: .45, wind: 2 }, birdman: { aggr: .14, parry: .42, wind: 2 },
  orvan: { aggr: .16, parry: .50, wind: 2 } };
const GROUND = new Set(['stand', 'turn', 'startrun', 'run', 'stop', 'step', 'crouch', 'pickup', 'drink', 'land', 'hurt',
  'en_draw', 'en', 'en_strike', 'en_parry', 'en_adv', 'en_ret', 'en_hit', 'en_sheathe', 'freeze']);
const EN_STATES = new Set(['en_draw', 'en', 'en_strike', 'en_parry', 'en_adv', 'en_ret', 'en_hit']);
const SPIKE_CYCLE = [14, 1, 1, 1, 1, 6, 1, 1];   // ticks per frame (frames 2..6 cut)
const CHOMP = [7, 1, 1, 1, 2, 1, 1, 2];
const RUBBLE = [6, 1, 1, 1, 1, 1, 2, 7];

function frameFromCycle(durs, t) { let s = durs.reduce((a, b) => a + b, 0); t = ((t % s) + s) % s; for (let i = 0; i < durs.length; i++) { if (t < durs[i]) return i; t -= durs[i]; } return 0; }

class Game {
  constructor(D, opt) {
    opt = opt || {}; this.D = D; this.opt = opt; this.rand = mulberry32(opt.seed || 20261031);
    this.fx = []; this.deaths = 0; this.ticks = 0; this.maxhp = 3; this.seen = new Set(); this.levelStats = [];
    this.tick = 0; this.mode = 'idle';
  }
  /* ------------------------------------------------------------ setup */
  loadLevel(i, restart) {
    const L = this.D.levels[i]; this.li = i; this.L = L; this.stage = L.key;
    if (!restart) { this.levelMaxhp = this.maxhp; this.levelTicks = 0; this.levelDeaths = 0; } else this.maxhp = this.levelMaxhp;
    this.rooms = {};
    for (const id of Object.keys(L.rooms)) this.rooms[id] = this.makeRoom(id, L.rooms[id]);
    this.flags = {}; this.msgs = []; this.msg = null; this.msgId = 0; this.scripts = [];
    this.dim = L.dim || 1; this.dimTarget = this.dim; this.shake = 0; this.flash = 0; this.frozen = false;
    const s = L.start;
    this.hero = { actor: 'hero', x: s.x, y: ROW(s.r), r: s.r, face: s.face, hp: this.maxhp, inv: 0, vx: 0, vy: 0, t: 0,
      sword: L.sword !== false, state: 'stand', hang: null, fall0: s.r, idleT: 0 };
    this.play(this.hero, 'stand');
    this.room = null; this.enter(s.room); this.mode = 'play'; this.deadT = 0;
    this.fx.push({ music: L.music });
  }
  makeRoom(id, def) {
    const R = { id, def, g: def.grid.map(s => s.split('')), gates: [], plates: [], spikes: [], loose: [], chompers: [], rubble: [],
      items: [], enemies: [], npcs: [], evDone: {}, visited: false, lit: false };
    R.g.forEach((row, r) => row.forEach((ch, c) => {
      if (ch === 'G' || ch === 'K') R.gates.push({ r, c, f: 0, state: 'closed', t: 0, hold: 0, k: ch });
      if (ch === 'S') R.spikes.push({ r, c, f: 0, t: 0, cycle: false, ph: 0, wait: 0 });
      if (ch === 'X') R.loose.push({ r, c, state: 'idle', t: 0, f: 0 });
    }));
    (def.gates || []).forEach(([r, c]) => R.gates.push({ r, c, f: 0, state: 'closed', t: 0, hold: 0, k: 'G' }));
    (def.spikes_cycle || []).forEach(([r, c, ph]) => { const s = R.spikes.find(s => s.r === r && s.c === c); if (s) { s.cycle = true; s.ph = ph; } });
    (def.plates || []).forEach(p => R.plates.push({ r: p.r, c: p.c, gates: p.gates, time: p.time, f: 0, down: false }));
    (def.chompers || []).forEach(([r, c, ph]) => R.chompers.push({ r, c, ph, f: 0 }));
    (def.rubble || []).forEach(rb => R.rubble.push({ r: rb.r, c: rb.c, min: rb.min, max: rb.max, f: -1, si: 0, st: 0 }));
    (def.items || []).forEach(it => R.items.push({ type: it.type, x: it.x, r: it.r, taken: false }));
    (def.enemies || []).forEach(e => R.enemies.push(this.makeEnemy(e)));
    (def.npcs || []).forEach(n => R.npcs.push(Object.assign({ anim: 'crouch', f: 3 }, n)));
    return R;
  }
  makeEnemy(d) {
    const e = { actor: d.type, id: d.id, x: d.x, y: ROW(d.r), r: d.r, face: d.face, hp: d.hp, maxhp: d.hp, state: 'idle',
      hidden: !!d.hidden, cd: 8, st0: STATS[d.type] || STATS.guard, engaged: false, decided: false, vy: 0 };
    if (d.type === 'physarum') {      // Physarum polycephalum, "the Golden Net": a slime mould enemy (blob / ceiling net / giant plasmodium)
      const k = d.kind || 'blob', big = k === 'boss';
      Object.assign(e, { slime: true, kind: k, w: big ? 64 : 28, reach: big ? 80 : 54, spd: big ? 0.45 : 0.8, ten: 0, lt: 0, cuts: [], hits: 0, engaged: false });
      if (k === 'net') { e.state = 'ceil'; e.y = d.r * RH - 4; } else e.state = 'idle';
      e.anim = 'stand'; e.f = 0; return e;
    }
    if (d.rise) { e.state = 'rise'; this.play(e, 'death'); e.si = e.seq.length - 1; e.f = e.seq[e.si][0]; e.done = true; }
    else this.play(e, 'engarde', { frames: [0] });
    return e;
  }
  enter(id) {
    this.room = this.rooms[id]; const first = !this.room.visited; this.room.visited = true; this.room.enterTick = this.tick;
    this.fx.push({ room: id, first });
  }
  /* ------------------------------------------------------------ anim */
  durs(e, anim) { const a = this.D.dur[e.actor] || this.D.dur.hero; return a[anim] || this.D.dur.hero[anim]; }
  play(e, anim, o) {
    o = o || {}; const d = this.durs(e, anim); const fr = o.frames || d.map((_, i) => i);
    e.anim = anim; e.seq = fr.map(f => [f, o.each || d[f] || 1]); e.si = 0; e.st = 0; e.f = e.seq[0][0]; e.done = false; e.loop = !!o.loop; e.fresh = true;
  }
  adv(e) {
    if (e.fresh) { e.fresh = false; return; }
    if (e.done) return;
    if (++e.st >= e.seq[e.si][1]) { e.st = 0; if (++e.si >= e.seq.length) { if (e.loop) e.si = 0; else { e.si = e.seq.length - 1; e.done = true; } } e.f = e.seq[e.si][0]; }
  }
  /* ------------------------------------------------------------ world queries */
  roomAt(R, r, c) {           // -> [room, r, c] or null (missing)
    while (c < 0) { if (!R.def.L) return [null, 'W']; R = this.rooms[R.def.L]; c += NC; }
    while (c > NC - 1) { if (!R.def.R) return [null, R.def.exit ? 'F' : 'W']; R = this.rooms[R.def.R]; c -= NC; }
    while (r < 0) { if (!R.def.U) return [null, 'W']; R = this.rooms[R.def.U]; r += NR; }
    while (r > NR - 1) { if (!R.def.D) return [null, '.']; R = this.rooms[R.def.D]; r -= NR; }
    return [R, r, c];
  }
  cellAt(R, r, c) { const q = this.roomAt(R, r, c); if (!q[0]) return q[1]; return q[0].g[q[1]][q[2]]; }
  floorAt(R, r, c) {
    const ch = this.cellAt(R, r, c);
    if (FLOORS.includes(ch)) return true;
    if (ch === '.') return this.cellAt(R, r + 1, c) === 'W';
    return false;
  }
  gatePass(g) { return g.f >= 6 && g.f <= 8; }
  moveX(e, dx) {
    if (e === this.hero && e.slow > 0) dx *= 0.5;      // held by slime threads
    const R = this.room; let nx = e.x + dx; const r = e.rowFor !== undefined ? e.rowFor : e.r;
    if (dx > 0) { const c = cellOf(nx + 7); if (this.cellAt(R, r, c) === 'W') nx = Math.min(nx, c * CW - 7); }
    else if (dx < 0) { const c = cellOf(nx - 7); if (this.cellAt(R, r, c) === 'W') nx = Math.max(nx, (c + 1) * CW + 7); }
    for (const g of R.gates) {
      if (g.r !== r || this.gatePass(g)) continue; const gx = g.c * CW + 23;
      if (e.x <= gx && nx > gx - 8) nx = gx - 8; if (e.x >= gx && nx < gx + 8) nx = gx + 8;
    }
    const blocked = Math.abs(nx - (e.x + dx)) > 0.01; e.x = nx; return blocked;
  }
  supported(e) { return this.floorAt(this.room, e.r, cellOf(e.x)); }
  enemiesAlive(R) { return (R || this.room).enemies.filter(e => !e.hidden && e.state !== 'dead' && e.state !== 'gone' && e.state !== 'death' && e.state !== 'fall'); }
  target() {
    const h = this.hero; if (!h.sword || h.hp <= 0) return null; let best = null, bd = 1e9;
    for (const e of this.enemiesAlive()) {
      if (e.state === 'rise' || e.state === 'rising' || e.state === 'ceil' || e.state === 'drip' || e.state === 'drop') continue;
      const d = Math.abs(e.x - h.x); if (e.r === h.r && d < 120 && d < bd) { best = e; bd = d; }
    }
    return best;
  }
  /* ------------------------------------------------------------ messages / scripts */
  say(m) {
    const id = ++this.msgId;
    this.msgs.push({ id, text: m.msg, who: m.who || null, t: Math.round((m.dur || 4) * 12), block: !!m.block, age: 0 });
    return id;
  }
  msgTick() {
    if (!this.msg && this.msgs.length) { this.msg = this.msgs.shift(); this.msg.age = 0; this.seen.add(this.msg.text); }
    if (this.msg && ++this.msg.age >= this.msg.t) this.msg = null;
  }
  skipMsg() { if (this.msg && this.msg.age > 4) this.msg.age = this.msg.t; }
  blocking() { return !!(this.msg && this.msg.block) || (!this.msg && this.msgs.length && this.msgs[0].block); }
  cond(ev, R) {
    const h = this.hero, gr = GROUND.has(h.state);
    if (ev.flag && !this.flags[ev.flag]) return false;
    switch (ev.when) {
      case 'enter': return true;
      case 'x': return gr && h.r === ev.r && h.x >= ev.min && (ev.max === undefined || h.x <= ev.max);
      case 'row': return gr && h.r === ev.r;
      case 'flag': return true;
      case 'engage': return R.enemies.some(e => e.id === ev.id && e.engaged);
      case 'clear': return R.enemies.length > 0 && R.enemies.every(e => !e.hidden && (e.state === 'dead' || e.state === 'gone' || e.state === 'fall' || e.state === 'death'));
    }
    return false;
  }
  runScripts() {
    const R = this.room;
    (R.def.events || []).forEach((ev, i) => {
      if (R.evDone[i] || !this.cond(ev, R)) return;
      R.evDone[i] = true; this.scripts.push({ steps: ev.steps, i: 0, wait: 0, waitMsg: 0, room: R });
    });
    for (const s of this.scripts) {
      let guard = 0;
      while (s.i < s.steps.length && guard++ < 20) {
        if (s.wait > 0) { s.wait--; break; }
        if (s.waitMsg && ((this.msg && this.msg.id === s.waitMsg) || this.msgs.some(m => m.id === s.waitMsg))) break;
        s.waitMsg = 0; this.doStep(s.steps[s.i++], s);
      }
    }
    this.scripts = this.scripts.filter(s => s.i < s.steps.length || s.wait > 0 || s.waitMsg);
  }
  doStep(st, s) {
    const R = s.room;
    if (st.msg !== undefined) { if (this.seen.has(st.msg) && !st.block) return; if (this.seen.has(st.msg) && this.opt.fastRepeat) return; s.waitMsg = this.say(st); return; }
    if (st.wait !== undefined) { s.wait = Math.round(st.wait * 12); return; }
    switch (st.do) {
      case 'open': { const g = R.gates.find(g => g.r === st.r && g.c === st.c); if (g) { g.state = 'opening'; g.hold = 0; this.fx.push({ sfx: 'gate' }); } break; }
      case 'shake': this.shake = st.n || 10; break;
      case 'sfx': this.fx.push({ sfx: st.name }); break;
      case 'flash': this.flash = 6; break;
      case 'music': this.fx.push({ music: st.cue }); break;
      case 'dim': this.dimTarget = st.to; break;
      case 'spawn': { const e = R.enemies.find(e => e.id === st.id); if (e) { e.hidden = false; e.state = 'idle'; e.cd = 14; } break; }
      case 'vanish': { const e = R.enemies.find(e => e.id === st.id); if (e) { e.vanishX = e.x; e.state = 'gone'; } break; }
      case 'item': { let x = st.x, r = st.r; if (st.at) { const e = R.enemies.find(e => e.id === st.at); x = Math.round((e.vanishX || e.x) - 4); r = e.r; }
        x = Math.max(150, Math.min(300, x)); R.items.push({ type: st.type, x, r, taken: false }); break; }
      case 'freeze': this.frozen = true; { const h = this.hero; if (GROUND.has(h.state)) { h.state = 'freeze'; this.play(h, h.sword && h.actor ? 'stand' : 'stand'); } } break;
      case 'ending': this.mode = 'ending'; this.fx.push({ ending: true }); break;
    }
  }
  /* ------------------------------------------------------------ main tick */
  step(inp) {
    inp = inp || {};
    if (this.mode !== 'play') { if (this.mode === 'dead') { this.deadT++; } return; }
    this.tick++; this.levelTicks++; this.ticks++;
    if (this.shake > 0) this.shake--; if (this.flash > 0) this.flash--;
    if (Math.abs(this.dim - this.dimTarget) > .001) this.dim += Math.sign(this.dimTarget - this.dim) * Math.min(.02, Math.abs(this.dimTarget - this.dim));
    if (inp.pSkip) this.skipMsg();
    this.msgTick();
    if (!this.blocking()) {
      this.heroTick(this.frozen ? {} : inp);
      this.trapsTick();
      for (const e of this.room.enemies) this.enemyTick(e);
      for (const n of this.room.npcs) this.npcTick(n);
      this.roomCheck();
    }
    if (this.mode === 'play') this.runScripts();
  }
  /* ------------------------------------------------------------ hero */
  setState(s, anim, o) { const h = this.hero; h.state = s; h.t = 0; if (anim) this.play(h, anim, o); }
  heroTick(inp) {
    const h = this.hero; const R = this.room;
    const dir = (inp.R && !inp.L) ? 1 : (inp.L && !inp.R) ? -1 : 0;
    const fwd = dir === h.face, back = dir === -h.face;
    if (h.inv > 0) h.inv--;
    if (h.slow > 0) h.slow--;
    h.t++;
    const groundCheck = (vx) => { if (!this.supported(h)) { this.startFall(vx || 0, inp.S); return true; } return false; };
    switch (h.state) {
      case 'freeze': break;
      case 'stand': {
        if (groundCheck()) break;
        if (this.target()) { this.setState('en_draw', 'engarde', { frames: [0, 1, 2, 3, 4], each: 1 }); break; }
        if (inp.D) {
          const it = this.itemNear(); if (it) { this.setState('pickup', 'crouch', { frames: [0, 1, 2, 3, 3, 3] }); h.item = it; break; }
          if (this.altarNear()) { this.lightAltar(); break; }
          const ed = this.edgeForDown(); if (ed) { this.startClimbDown(ed); break; }
          this.setState('crouch', 'crouch', { frames: [0, 1, 2, 3] }); break;
        }
        if (inp.U) {
          if (fwd) { this.setState('standjump', 'standjump'); h.jx = h.x; break; }
          if (dir === 0) { let L = this.ledgeAbove(h.face); if (!L && this.ledgeAbove(-h.face)) { h.face = -h.face; L = this.ledgeAbove(h.face); }
            if (L) { this.setState('jumpgrab', 'standjump', { frames: [0, 1, 2, 3, 4, 5, 6, 7] }); h.hang = L; h.jx = h.x; break; } }
        }
        if (dir && back) { h.face = dir; this.setState('turn', 'stand'); break; }
        if (fwd) { if (inp.S) this.startStep(); else this.setState('startrun', 'startrun'); break; }
        if (++h.idleT > 60 && h.anim === 'stand') { h.idleT = 0; this.play(h, 'idle'); }
        if (h.anim === 'idle' && h.done) this.play(h, 'stand');
        break; }
      case 'turn': if (h.t >= 2) this.setState('stand', 'stand'); break;
      case 'startrun':
        this.moveX(h, 2 * h.face); if (groundCheck(2 * h.face)) break;
        if (inp.U && h.si >= 1) { this.startRunJump(); break; }
        if (!fwd) { this.setState('stop', 'startrun', { frames: [5, 4, 3, 1, 0], each: 1 }); break; }
        if (h.done) this.setState('run', 'run', { loop: true });
        break;
      case 'run':
        if (this.moveX(h, 6.5 * h.face)) { this.setState('stop', 'startrun', { frames: [3, 1, 0], each: 1 }); break; }
        if (groundCheck(4 * h.face)) break;
        if (inp.U) { this.startRunJump(); break; }
        if (!fwd) this.setState('stop', 'startrun', { frames: [5, 4, 3, 1, 0], each: 1 });
        break;
      case 'stop':
        this.moveX(h, 1.6 * h.face); if (groundCheck(1.5 * h.face)) break;
        if (h.done) this.setState('stand', 'stand');
        break;
      case 'step':
        this.moveX(h, h.stepDx / 12); if (groundCheck(0.5 * h.face)) break;
        if (h.done) this.setState('stand', 'stand');
        break;
      case 'runjump': {
        const k = h.si; h.y = ROW(h.r) - Math.round(12 * Math.sin(Math.PI * Math.min(1, k / 10)));
        if (this.moveX(h, 7.6 * h.face)) { h.y = ROW(h.r); this.startFall(-h.face, false); break; }
        if (h.done) { h.y = ROW(h.r); this.landJump(inp, fwd, true); }
        break; }
      case 'standjump': {
        const k = h.si;
        if (k >= 7 && k <= 14) { h.y = ROW(h.r) - Math.round(9 * Math.sin(Math.PI * (k - 7) / 8)); if (this.moveX(h, 4.5 * h.face)) { h.y = ROW(h.r); this.startFall(0, false); break; } }
        else if (k > 14) { h.y = ROW(h.r); this.moveX(h, 4.6 * h.face); }
        if (h.done) { h.y = ROW(h.r); this.landJump(inp, fwd, false); }
        break; }
      case 'jumpgrab': {
        const L = h.hang; const tx = L.side === 'L' ? L.lx - 10 : L.lx + 10;
        h.x += (tx - h.x) / Math.max(1, 8 - h.si);
        if (h.done) { this.setState('hang', 'hang', { loop: true, each: 3 }); h.x = tx; this.fx.push({ sfx: 'land' }); }
        break; }
      case 'hang': {
        if (inp.U) { this.setState('climbup', 'climbup'); break; }
        if (inp.pD) { this.dropFromHang(); break; }
        break; }
      case 'climbup':
        if (h.done) { const L = h.hang; h.r = L.r; h.y = ROW(L.r); h.x = L.side === 'L' ? L.lx + 10 : L.lx - 10; h.face = L.side === 'L' ? 1 : -1; h.hang = null; this.setState('stand', 'stand'); }
        break;
      case 'climbdown':
        if (h.done) this.setState('hang', 'hang', { loop: true, each: 3 });
        break;
      case 'fall': this.fallTick(inp); break;
      case 'land':
        if (groundCheck()) break;
        if (h.done) { this.setState('stand', 'stand'); }
        break;
      case 'crouch':
        if (groundCheck()) break;
        if (h.done && !inp.D) this.setState('stand', 'crouch', { frames: [4, 5, 6, 8, 10, 12], each: 1 }), h.state = 'land';
        break;
      case 'pickup':
        if (h.done) this.takeItem(h.item);
        break;
      case 'drink':
        if (h.si === 12 && h.st === 0 && !h.drank) { h.drank = true; this.applyPotion(h.potion); }
        if (h.done) this.setState('stand', 'stand');
        break;
      case 'hurt':
        if (h.si < 3) { this.moveX(h, h.push / 3); }
        if (h.si >= 2 && groundCheck()) break;
        if (h.done) this.setState('stand', 'stand');
        break;
      case 'dying':
        if (h.done && ++h.t > 18) this.heroDead();
        break;
      case 'void': if (h.t > 14) this.heroDead(); break;
      /* ---- sword fighting ---- */
      case 'en_draw': if (h.done) this.setState('en', 'engarde', { frames: [4] }); break;
      case 'en': {
        if (groundCheck()) break;
        const e = this.target();
        if (!e) { this.setState('en_sheathe', 'engarde', { frames: [4, 3, 2, 1, 0], each: 1 }); break; }
        h.face = e.x >= h.x ? 1 : -1;
        if (inp.pA || (inp.A && h.t > 3)) { this.setState('en_strike', 'strike'); this.fx.push({ sfx: 'swish' }); h.hitDone = false; break; }
        if (inp.pB || inp.B || inp.U) { this.setState('en_parry', 'parry'); break; }
        if (fwd && Math.abs(e.x - h.x) > 26) { this.setState('en_adv', 'advance'); break; }
        if (back) { this.setState('en_ret', 'advance', { frames: [5, 4, 3, 2, 1, 0] }); break; }
        break; }
      case 'en_strike':
        if (h.si === 4 && !h.hitDone) { h.hitDone = true; const e = this.target(); if (e) this.resolve(h, e); }
        if (h.done) this.setState('en', 'engarde', { frames: [4] });
        break;
      case 'en_parry':
        if (h.si >= 2 && inp.pA) { this.setState('en_strike', 'strike'); this.fx.push({ sfx: 'swish' }); h.hitDone = false; break; }
        if (h.done) this.setState('en', 'engarde', { frames: [4] });
        break;
      case 'en_adv': case 'en_ret': {
        const d = h.state === 'en_adv' ? 1 : -1; this.moveX(h, d * h.face * 8 / 6);
        if (groundCheck(d * h.face)) break;
        if (h.done) this.setState('en', 'engarde', { frames: [4] });
        break; }
      case 'en_hit':
        if (h.si < 3) this.moveX(h, h.push / 3);
        if (groundCheck(h.push / 4)) break;
        if (h.done) this.setState('en', 'engarde', { frames: [4] });
        break;
      case 'en_sheathe': if (h.done) this.setState('stand', 'stand'); break;
    }
    this.adv(h);
  }
  startStep() {
    const h = this.hero, c = cellOf(h.x); let dist = 14;
    if (!this.floorAt(this.room, h.r, c + h.face)) { const ex = h.face > 0 ? (c + 1) * CW : c * CW; dist = Math.min(dist, Math.max(0, Math.abs(ex - h.x) - 3)); }
    h.stepDx = dist * h.face; this.setState('step', 'step');
  }
  startRunJump() { const h = this.hero; h.jx = h.x; this.setState('runjump', 'runjump'); }
  landJump(inp, fwd, running) {
    const h = this.hero;
    if (this.supported(h)) {
      this.fx.push({ sfx: 'land' }); this.landingTraps();
      if (h.state === 'dying') return;
      if (running && fwd) this.setState('run', 'run', { loop: true });
      else this.setState('land', 'crouch', running ? { frames: [8, 10, 12], each: 1 } : { frames: [9, 10, 11, 12], each: 1 });
      return;
    }
    // try to catch the far ledge
    const c = cellOf(h.x), f = h.face, reach = inp.S ? 30 : 20;
    if (this.floorAt(this.room, h.r, c + f) && this.cellAt(this.room, h.r, c + f) !== 'W') {
      const ex = f > 0 ? (c + 1) * CW : c * CW;
      if (Math.abs(ex - h.x) <= reach) { h.hang = { lx: f > 0 ? ex : ex - 1, ly: h.r * RH + 61, r: h.r, side: f > 0 ? 'L' : 'R' }; h.x = f > 0 ? ex - 10 : ex + 10; this.setState('hang', 'hang', { loop: true, each: 3 }); this.fx.push({ sfx: 'land' }); return; }
    }
    this.startFall(f * 1.5, false);
  }
  startFall(vx, grab) {
    const h = this.hero;
    if (grab) {                                  // catch the edge we just walked off
      const c = cellOf(h.x), f = vx >= 0 ? (h.face) : h.face, pc = c - f;
      if (this.floorAt(this.room, h.r, pc)) {
        const side = f > 0 ? 'R' : 'L'; const lx = f > 0 ? pc * CW + 31 : pc * CW;
        h.hang = { lx, ly: h.r * RH + 61, r: h.r, side }; h.face = side === 'R' ? -1 : 1; h.x = side === 'R' ? lx + 9 : lx - 9;
        this.setState('hang', 'hang', { loop: true, each: 3 }); return;
      }
    }
    h.vx = vx; h.vy = 1; h.fall0 = h.r; this.setState('fall', 'standjump', { frames: [10] });
  }
  dropFromHang() {
    const h = this.hero, L = h.hang; h.x = L.side === 'L' ? L.lx - 9 : L.lx + 9; h.y = L.ly + 44; h.r = L.r; h.hang = null;
    h.vx = 0; h.vy = 2; this.setState('fall', 'standjump', { frames: [10] }); h.fall0 = L.r + 1;
  }
  fallTick(inp) {
    const h = this.hero, R = this.room;
    h.vy = Math.min(h.vy + 2, 15); h.y += h.vy;
    h.rowFor = Math.max(0, Math.min(NR - 1, Math.floor((h.y - 30) / RH))); this.moveX(h, h.vx); h.vx *= .85; delete h.rowFor;
    const nr = h.r + 1;
    if (h.y >= ROW(nr)) {
      if (this.floorAt(R, nr, cellOf(h.x))) { h.y = ROW(nr); h.r = nr; this.land(nr - h.fall0); return; }
      h.r = nr;
    }
    if (h.y >= RHT && h.r >= NR - 1) {
      if (R.def.D) { this.enter(R.def.D); h.y -= RHT; h.r -= NR; h.fall0 -= NR; }
      else if (h.y > RHT + 22) { h.hp = 0; this.setState('void', null); h.hidden = true; this.fx.push({ sfx: 'die' }); }
    }
  }
  land(rows) {
    const h = this.hero; h.vx = 0;
    if (rows >= 3) { h.hp = 0; this.fx.push({ sfx: 'thud' }); this.heroDie(); return; }
    if (rows === 2) { this.fx.push({ sfx: 'thud' }); this.fx.push({ sfx: 'hurt' }); this.hurtHero(1, 0, true); if (h.hp <= 0) return; this.setState('land', 'crouch', { frames: [1, 2, 3, 3, 3, 3, 3, 4, 6, 8, 10, 12], each: 2 }); }
    else { this.fx.push({ sfx: 'land' }); this.setState('land', 'crouch', { frames: [1, 2, 3, 4, 6, 8, 10, 12], each: 1 }); }
    this.landingTraps();
  }
  landingTraps() {         // landing on raised/rising spikes is lethal
    const h = this.hero, c = cellOf(h.x);
    for (const s of this.room.spikes) if (s.r === h.r && s.c === c) { if (s.f >= 2 && s.f <= 6 || !s.cycle) { this.spikeKill(s); return; } }
  }
  ledgeAbove(f) {
    const h = this.hero, R = this.room, r = h.r, c = cellOf(h.x);
    if (r - 1 < 0 && !R.def.U) return null;
    if (this.floorAt(R, r - 1, c) || this.cellAt(R, r - 1, c) === 'W') return null;
    if (!this.floorAt(R, r - 1, c + f)) return null;
    const ex = f > 0 ? (c + 1) * CW : c * CW; if (Math.abs(ex - h.x) > 30) return null;
    for (const g of R.gates) if (g.r === r - 1 && g.c === c + f && !this.gatePass(g) && f < 0) return null;
    return { lx: f > 0 ? ex : ex - 1, ly: (r - 1) * RH + 61, r: r - 1, side: f > 0 ? 'L' : 'R' };
  }
  edgeForDown() {
    const h = this.hero, R = this.room, c = cellOf(h.x), r = h.r;
    for (const f of [h.face, -h.face]) {
      if (!this.floorAt(R, r, c + f) && this.cellAt(R, r, c + f) !== 'W') {
        const ex = f > 0 ? (c + 1) * CW : c * CW;
        if (Math.abs(ex - h.x) <= 22) return { lx: f > 0 ? ex - 1 : ex, ly: r * RH + 61, r, side: f > 0 ? 'R' : 'L' };
      }
    }
    return null;
  }
  startClimbDown(L) {
    const h = this.hero; h.hang = L; h.face = L.side === 'R' ? -1 : 1; h.x = L.side === 'R' ? L.lx + 9 : L.lx - 9;
    const d = this.durs(h, 'climbup'); this.setState('climbdown', 'climbup', { frames: d.map((_, i) => d.length - 1 - i), each: 1 });
  }
  itemNear() {
    const h = this.hero;
    for (const it of this.room.items) if (!it.taken && it.r === h.r && Math.abs(h.x - (it.x + 4)) < (it.type === 'sword' ? 22 : 18)) return it;
    return null;
  }
  altarNear() { const a = this.room.def.altar, h = this.hero; return a && this.flags.ember && !this.flags.lit && h.r === a.r && h.x >= a.x0 && h.x <= a.x1; }
  lightAltar() {
    this.flags.lit = true; this.room.lit = true; this.flash = 8; this.dimTarget = 1; this.fx.push({ sfx: 'ignite' });
    this.setState('pickup', 'crouch', { frames: [0, 1, 2, 3, 3, 3] }); this.hero.item = null;
    const n = this.room.npcs.find(n => n.id === 'narin'); if (n) n.stand = true;
  }
  takeItem(it) {
    const h = this.hero; if (!it) { this.setState('land', 'crouch', { frames: [4, 6, 8, 10, 12], each: 1 }); return; }
    it.taken = true; this.fx.push({ sfx: 'pickup' });
    if (it.type === 'potion' || it.type === 'big') { h.potion = it.type; h.drank = false; this.setState('drink', 'drink'); return; }
    if (it.type === 'sword') { h.sword = true; this.flags.sword = true; }
    if (it.type === 'ember') this.flags.ember = true;
    this.setState('land', 'crouch', { frames: [4, 6, 8, 10, 12], each: 1 });
  }
  applyPotion(t) {
    const h = this.hero; this.fx.push({ sfx: 'gulp' });
    if (t === 'big') { this.maxhp = Math.min(8, this.maxhp + 1); h.hp = this.maxhp; this.flags.big = true; this.flash = 3; }
    else h.hp = Math.min(this.maxhp, h.hp + 1);
  }
  hurtHero(n, push, silent) {
    const h = this.hero; if (h.hp <= 0) return; h.hp -= n; h.inv = 14;
    if (!silent) this.fx.push({ sfx: 'hurt' });
    if (h.hp <= 0) { this.heroDie(); return; }
    h.push = push || 0;
    if (EN_STATES.has(h.state)) this.setState('en_hit', 'hit'); else if (!silent) this.setState('hurt', 'hit');
  }
  heroDie() { const h = this.hero; h.hp = 0; h.hang = null; h.y = ROW(h.r); this.setState('dying', 'death'); this.fx.push({ sfx: 'die' }); }
  heroDead() { if (this.mode !== 'play') return; this.mode = 'dead'; this.deaths++; this.levelDeaths++; this.deadT = 0; }
  restartLevel() { const t = this.levelTicks, d = this.levelDeaths; this.loadLevel(this.li, true); this.levelTicks = t; this.levelDeaths = d; }
  spikeKill(s) { const h = this.hero; if (h.state === 'dying') return; h.x = s.c * CW + 16; this.fx.push({ sfx: 'spikes' }); this.heroDie(); h.impaled = true; }
  /* ------------------------------------------------------------ traps */
  trapsTick() {
    const R = this.room, h = this.hero, hc = cellOf(h.x), gr = GROUND.has(h.state), air = !gr;
    for (const s of R.spikes) {
      if (s.cycle) { s.f = frameFromCycle(SPIKE_CYCLE, this.tick + s.ph); if (s.f === 2 && h.r === s.r && Math.abs(hc - s.c) <= 2) this.fx.push({ sfx: 'spikes', quiet: true }); }
      else {
        const near = h.r === s.r && Math.abs(hc - s.c) <= 1 && h.state !== 'hang' && h.state !== 'climbup';
        if (near) { if (s.f === 0) this.fx.push({ sfx: 'spikes' }); if (s.f < 5) s.f++; s.wait = 8; }
        else if (s.f > 0) { if (s.f === 5) { if (--s.wait <= 0) s.f = 6; } else { s.f = s.f >= 7 ? 0 : s.f + 1; } }
      }
      if (h.r === s.r && hc === s.c && s.f >= 2 && s.f <= 6 && gr && h.state !== 'dying') {
        const fast = ['run', 'startrun', 'stop', 'land'].includes(h.state);
        if (s.cycle || fast) this.spikeKill(s);
      }
    }
    for (const ch of R.chompers) {
      ch.f = frameFromCycle(CHOMP, this.tick + ch.ph);
      if (ch.f === 3 && frameFromCycle(CHOMP, this.tick + ch.ph - 1) === 2 && h.r === ch.r) this.fx.push({ sfx: 'chomp', quiet: true });
      if (h.r === ch.r && ch.f >= 2 && ch.f <= 4 && gr && h.inv <= 0 && h.hp > 0 && h.state !== 'dying') {
        const x0 = ch.c * CW + 16, x1 = ch.c * CW + 34;
        if (h.x >= x0 && h.x <= x1) { const push = (h.x < ch.c * CW + 25 ? -1 : 1) * 16; this.hurtHero(1, push); if (h.state === 'hurt' || h.state === 'en_hit') { h.push = push; } }
      }
    }
    for (const l of R.loose) {
      if (l.state === 'idle') {
        if (h.r === l.r && hc === l.c && gr) { l.state = 'rattle'; l.t = 0; this.fx.push({ sfx: 'rattle' }); }
      } else if (l.state === 'rattle') {
        l.t++; l.f = [1, 2, 3, 4][l.t % 4];
        if (l.t >= 9) { l.state = 'fall'; l.t = 0; l.f = 5; R.g[l.r][l.c] = '.'; this.fx.push({ sfx: 'crumble' }); for (const e of R.enemies) if (e.r === l.r && cellOf(e.x) === l.c && e.state !== 'dead') this.enemyFall(e); }
      } else if (l.state === 'fall') {
        l.t++; l.f = l.t < 2 ? 5 : l.t < 3 ? 6 : 7;
        if (l.t === 3) {
          const below = this.floorAt(R, l.r + 1, l.c);
          if (h.r === l.r + 1 && hc === l.c && gr) this.hurtHero(1, 0);
          if (below) { this.fx.push({ sfx: 'thud', quiet: true }); }
          l.landed = below;
        }
        if (l.t > 4) { l.state = l.landed ? 'rest' : 'gone'; l.f = 8; }
      }
    }
    for (const p of R.plates) {
      const on = h.r === p.r && hc === p.c && gr;
      if (on && !p.down) {
        p.down = true; this.fx.push({ sfx: 'click' });
        for (const [gr_, gc] of p.gates) { const g = R.gates.find(g => g.r === gr_ && g.c === gc); if (!g) continue; g.hold = p.time; g.t = p.time; if (g.state !== 'open') { g.state = 'opening'; this.fx.push({ sfx: 'gate' }); } }
      }
      if (!on) p.down = false; p.f = p.down ? 2 : 0;
    }
    for (const rb of R.rubble) {
      if (rb.f < 0) { if (h.r === rb.r && h.x >= rb.min && h.x <= rb.max) { rb.f = 0; rb.si = 0; rb.st = 0; this.shake = 8; this.fx.push({ sfx: 'rumble' }); } continue; }
      if (rb.si >= 7) continue;
      if (++rb.st >= RUBBLE[rb.si]) { rb.st = 0; rb.si++; rb.f = rb.si;
        if (rb.si === 6) { this.fx.push({ sfx: 'crumble' }); if (h.r === rb.r && Math.abs(h.x - (rb.c * CW + 20)) < 16 && gr && h.inv <= 0) this.hurtHero(1, -h.face * 10); } }
    }
    for (const id in this.rooms) for (const g of this.rooms[id].gates) this.gateTick(g, id === R.id);
  }
  gateTick(g, here) {
    if (g.state === 'opening') { g.t2 = (g.t2 || 0) + 1; if (g.t2 >= 2) { g.t2 = 0; g.f = Math.min(8, g.f + 1); } if (g.f >= 8) { g.state = 'open'; g.t = g.hold; } }
    else if (g.state === 'open') { if (g.hold > 0 && --g.t <= 0) { g.state = 'closing'; g.f = 9; } }
    else if (g.state === 'closing') { g.f++; if (g.f > 11) { g.f = 0; g.state = 'closed'; if (here) this.fx.push({ sfx: 'slam' }); } }
  }
  /* ------------------------------------------------------------ enemies */
  enemyTick(e) {
    const h = this.hero;
    if (e.hidden || e.state === 'gone') return;
    if (e.slime && e.state !== 'fall') return this.slimeTick(e);
    if (e.state === 'dead') return;
    if (e.state === 'death') { this.adv(e); if (e.done) e.state = 'dead'; return; }
    if (e.state === 'fall') { e.vy = Math.min(15, e.vy + 2); e.y += e.vy; if (e.y > RHT + 38) e.state = 'gone';
      else if (e.y >= ROW(e.r + 1)) { if (this.floorAt(this.room, e.r + 1, cellOf(e.x))) { e.r++; e.y = ROW(e.r); e.state = 'death'; e.hp = 0; this.play(e, 'death'); this.fx.push({ sfx: 'bones' }); } else e.r++; }
      return; }
    const d = Math.abs(h.x - e.x), same = h.r === e.r && h.hp > 0 && GROUND.has(h.state);
    if (e.state === 'rise') { if (same && d < 150) { e.state = 'rising'; const n = this.durs(e, 'death').length; this.play(e, 'death', { frames: [...Array(n).keys()].reverse(), each: 2 }); this.fx.push({ sfx: 'bones' }); } return; }
    if (e.state === 'rising') { this.adv(e); if (e.done) { e.state = 'ready'; e.engaged = true; this.play(e, 'engarde', { frames: [3] }); e.cd = 10; } return; }
    if (e.state === 'idle') {
      if (same && d < 110) { e.engaged = true; e.state = 'draw'; this.play(e, 'engarde'); }
      this.adv(e); return;
    }
    e.face = h.x >= e.x ? 1 : -1;
    switch (e.state) {
      case 'draw': if (e.done) { e.state = 'ready'; this.play(e, 'engarde', { frames: [3] }); } break;
      case 'ready': {
        if (h.state === 'en_strike' && h.si <= 1 && !e.decided && d < 52) { e.decided = true; if (this.rand() < e.st0.parry) { e.state = 'parry'; this.play(e, 'parry'); break; } }
        if (h.state !== 'en_strike') e.decided = false;
        if (!same || h.state === 'dying') break;
        if (e.cd > 0) { e.cd--; break; }
        if (d > 44) { if (this.canStep(e, e.face)) { e.state = 'advance'; this.play(e, 'advance'); } break; }
        if (d < 22) { if (this.canStep(e, -e.face)) { e.state = 'retreat'; this.play(e, 'advance', { frames: [5, 4, 3, 2, 1, 0] }); break; } }
        const p = this.rand();
        if (p < e.st0.aggr) { e.state = 'strike'; const n = this.durs(e, 'strike').length; this.play(e, 'strike', { frames: [...Array(n).keys()], each: 1 }); e.seq.forEach((s, i) => { if (i < 4) s[1] = 2; }); e.hitDone = false; }
        else if (p < e.st0.aggr + .02 && this.canStep(e, -e.face)) { e.state = 'retreat'; this.play(e, 'advance', { frames: [5, 4, 3, 2, 1, 0] }); }
        break; }
      case 'advance': case 'retreat': {
        const s = e.state === 'advance' ? 1 : -1; this.moveX(e, s * e.face * 8 / 6);
        if (e.done) { e.state = 'ready'; this.play(e, 'engarde', { frames: [3] }); e.cd = 2; }
        break; }
      case 'strike':
        if (e.si === 4 && !e.hitDone) { e.hitDone = true; this.resolve(e, h); }
        if (e.done) { e.state = 'ready'; this.play(e, 'engarde', { frames: [3] }); e.cd = 8 + Math.floor(this.rand() * 10); }
        break;
      case 'parry': if (e.done) { e.state = 'ready'; this.play(e, 'engarde', { frames: [3] }); e.cd = 2; if (this.rand() < .5) e.cd = 0; } break;
      case 'hit':
        if (e.si < 3) this.moveX(e, e.push / 3);
        if (!this.floorAt(this.room, e.r, cellOf(e.x))) { this.enemyFall(e); return; }
        if (e.done) { e.state = 'ready'; this.play(e, 'engarde', { frames: [3] }); e.cd = 4 + Math.floor(this.rand() * 6); }
        break;
    }
    this.adv(e);
  }
  /* ------------------------------------------------------------ Physarum (slime mould) */
  slimeCan(e, dx) {             // can creep this way? floor ahead, no wall, and not into torch light
    const nx = e.x + dx + Math.sign(dx) * e.w / 2, c = cellOf(nx);
    if (!this.floorAt(this.room, e.r, c) || this.cellAt(this.room, e.r, c) === 'W') return false;
    return !this.slimeLit(e.x + dx, e.r);
  }
  slimeLit(x, r) { return (this.room.def.torches || []).some(([tx, ty]) => Math.round((ty - 17) / RH) === r && Math.abs(tx + 4 - x) < 30); }
  slimeTick(e) {
    const h = this.hero, R = this.room; e.lt++;
    if (e.state === 'dead') return;
    if (e.state === 'death') {              // sclerotium: hardens, then bursts into spores
      if (e.lt === 14) { e.burst = this.tick; this.fx.push({ sfx: 'crumble', quiet: true }); }
      if (e.lt >= 30) e.state = 'dead';
      return;
    }
    const same = h.r === e.r && h.hp > 0 && GROUND.has(h.state), d = Math.abs(h.x - e.x);
    if (e.state === 'ceil') { if (h.r === e.r && h.hp > 0 && d < 46) { e.state = 'drip'; e.lt = 0; this.fx.push({ sfx: 'rattle', quiet: true }); } return; }
    if (e.state === 'drip') { if (e.lt >= 7) { e.state = 'drop'; e.vy = 0; e.y += 14; } return; }
    if (e.state === 'drop') {
      e.vy = Math.min(12, e.vy + 2); e.y += e.vy;
      if (e.y >= ROW(e.r)) { e.y = ROW(e.r); e.state = 'ready'; e.engaged = true; e.cd = 12; this.fx.push({ sfx: 'thud' });
        if (h.r === e.r && d < 20) h.slow = Math.max(h.slow || 0, 30); }
      return;
    }
    // goal: the hero if near on this floor, otherwise the nearest oat flake (food) on this floor
    let goal = null;
    if (same && d < 150) goal = h.x;
    else { let bd = 1e9; for (const [ox, or] of R.def.oats || []) if (or === e.r && Math.abs(ox - e.x) < bd) { bd = Math.abs(ox - e.x); goal = ox; } }
    if (goal !== null && Math.abs(goal - e.x) > 2) e.face = goal > e.x ? 1 : -1;
    const lit = this.slimeLit(e.x, e.r);
    if (lit) { const dir = this.slimeCan(e, 1.2) ? 1 : -1; e.x += dir * 1.2; e.face = dir; }   // shrinks away from light
    if (e.state === 'idle') {
      if (same && d < 120) { e.state = 'ready'; e.engaged = true; e.cd = 8; return; }
      if (goal !== null && Math.abs(goal - e.x) > e.w / 2 + 4 && this.slimeCan(e, e.face * e.spd * 0.6)) e.x += e.face * e.spd * 0.6;
      e.ten += ((goal !== null ? Math.min(28, Math.max(0, Math.abs(goal - e.x) - e.w / 2)) : 6) - e.ten) * 0.1;   // pseudopod probes for food
      return;
    }
    switch (e.state) {
      case 'ready': {
        if (goal !== null && Math.abs(goal - e.x) > (e.kind === 'boss' ? 50 : 30) && this.slimeCan(e, e.face * e.spd)) e.x += e.face * e.spd;
        e.ten += (Math.min(18, Math.max(0, d - e.w / 2 - 6)) - e.ten) * 0.15;
        if (!same || h.state === 'dying') { if (!same && d > 160) e.state = 'idle'; break; }
        if (e.cd > 0) { e.cd--; break; }
        if (d < e.reach + e.w / 2 - 10) { e.state = 'lash'; e.lt = 0; e.tx = h.x; this.fx.push({ sfx: 'swish', quiet: true }); }
        break; }
      case 'lash': {             // pseudopod shoots toward the hero and grabs
        const wind = e.kind === 'boss' ? 9 : 6, full = Math.max(8, Math.min(e.reach, d - e.w / 2 + 4)); e.ten = full * Math.min(1, e.lt / wind);   // the big one rears up first: a readable tell
        if (e.lt === 1) e.blocked = false;
        if (h.state === 'en_parry' && e.lt >= wind - 5) e.blocked = true;      // a block raised in the last moments catches the pseudopod
        if (e.lt === wind) {
          if (e.blocked) { this.fx.push({ sfx: 'clang' }); e.state = 'retract'; e.lt = 0; e.cd = 4; break; }
          if (same && d <= e.reach + e.w / 2 && h.inv <= 0) {
            h.slow = Math.max(h.slow || 0, 36); e.hits++; this.fx.push({ sfx: 'hit' });
            if (e.kind === 'boss' || e.hits % 2 === 0) this.hurtHero(1, e.face * 4); else this.moveX(h, -e.face * 6);   // grab: pulls you in
          }
        }
        if (e.lt >= wind + 3) { e.state = 'retract'; e.lt = 0; }
        break; }
      case 'retract':
        e.ten = Math.max(0, e.ten - 9);
        if (e.ten <= 0) { e.state = 'ready'; e.cd = (e.kind === 'boss' ? 12 : 18) + Math.floor(this.rand() * 12); }
        break;
      case 'hit':
        if (e.lt <= 4 && this.slimeCan(e, e.push / 4)) e.x += e.push / 4;
        if (e.lt >= (e.kind === 'boss' ? 4 : 7)) { e.state = 'ready'; e.cd = e.kind === 'boss' ? 2 + Math.floor(this.rand() * 4) : 8 + Math.floor(this.rand() * 6); }
        break;
    }
  }
  canStep(e, s) { const nx = e.x + s * 10; return this.floorAt(this.room, e.r, cellOf(nx)) && this.cellAt(this.room, e.r, cellOf(nx + s * 8)) !== 'W'; }
  enemyFall(e) { e.state = 'fall'; e.vy = 1; e.hp = 0; this.fx.push({ sfx: 'die' }); }
  resolve(att, def) {
    const d = (def.x - att.x) * att.face;
    if (def.slime ? (att.r !== def.r || d < -6 || d > 40 + def.w / 2) : (att.r !== def.r || d < 8 || d > 50)) return;
    if (def.slime) {             // a cut severs a segment; the slime recoils and regrows its pseudopod
      if (['ceil', 'drip', 'drop', 'death', 'dead'].includes(def.state)) return;
      def.hp--; def.cuts.push({ x: def.x + def.face * (def.w / 2 + Math.max(6, def.ten * 0.6)), y: def.y - 6, t: this.tick, n: 4 + (def.ten >> 3) });
      def.ten = 0; this.fx.push({ sfx: 'hit' });
      if (def.hp <= 0) { def.state = 'death'; def.lt = 0; this.fx.push({ sfx: 'crumble' }); return; }
      def.state = 'hit'; def.lt = 0; def.push = 7 * att.face; return;
    }
    const isHero = def === this.hero;
    const parrying = isHero ? (def.state === 'en_parry') : (def.state === 'parry');
    if (parrying) { this.fx.push({ sfx: 'clang' }); if (!isHero) def.cd = 0; else { att.cd = Math.max(att.cd || 0, 6); } return; }
    if (isHero) { if (def.inv > 0 || def.hp <= 0) return; this.hurtHero(1, 8 * att.face); this.fx.push({ sfx: 'hit' }); return; }
    def.hp--; this.fx.push({ sfx: 'hit' });
    if (def.hp <= 0) { def.state = 'death'; this.play(def, 'death'); this.fx.push({ sfx: def.actor === 'skeleton' ? 'bones' : 'die' }); return; }
    def.state = 'hit'; def.push = 10 * att.face; this.play(def, 'hit');
  }
  npcTick(n) { if (n.stand && n.anim === 'crouch') { n.anim = 'stand'; n.f = 0; } }
  /* ------------------------------------------------------------ rooms */
  roomCheck() {
    const h = this.hero, R = this.room;
    if (h.state === 'dying' || h.state === 'void') return;
    if (h.x >= RW) {
      if (R.def.R) { this.enter(R.def.R); h.x -= RW; if (h.hang) h.hang.lx -= RW; if (h.jx !== undefined) h.jx -= RW; }
      else if (R.def.exit) { this.levelDone(); }
      else h.x = RW - 1;
    } else if (h.x < 0) {
      if (R.def.L) { this.enter(R.def.L); h.x += RW; if (h.hang) h.hang.lx += RW; }
      else h.x = 0;
    }
  }
  levelDone() { this.mode = 'done'; this.levelStats[this.li] = { ticks: this.levelTicks, deaths: this.levelDeaths }; this.maxhp = Math.max(this.maxhp, this.hero.hp > 0 ? this.maxhp : this.maxhp); this.fx.push({ sfx: 'pickup' }); }
}
const API = { Game, ROW, CW, RH, NC, NR, RW, RHT, cellOf, GROUND, EN_STATES };
if (typeof module !== 'undefined') module.exports = API; else root.Logic = API;
})(typeof window !== 'undefined' ? window : this);
