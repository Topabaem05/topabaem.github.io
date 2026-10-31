/* Debug autopilot: scripted route through every room (used by ?auto=1 and test/run_node.js). */
(function (root) {
'use strict';
const L = typeof module !== 'undefined' ? require('./logic.js') : root.Logic;
const { cellOf } = L;
// ---- predicates
const gate = (g, r, c) => g.room.gates.find(x => x.r === r && x.c === c);
const chomp = (g, r, c) => g.room.chompers.find(x => x.r === r && x.c === c).f;
const spike = (g, r, c) => g.room.spikes.find(x => x.r === r && x.c === c).f;
// ---- commands
const C = {
  go: (x, tol) => ({ name: 'go ' + x, x, tol: tol || 8 }),
  steps: (x) => ({ name: 'steps ' + x, x }),
  runjump: (at) => ({ name: 'runjump ' + at, at }),
  standjump: () => ({ name: 'standjump' }),
  climb: () => ({ name: 'climb' }),
  hangdown: () => ({ name: 'hangdown' }),
  drop: () => ({ name: 'drop' }),
  pick: () => ({ name: 'pick' }),
  fight: () => ({ name: 'fight' }),
  exitR: () => ({ name: 'exitR' }),
  wait: (n) => ({ name: 'wait ' + n, n }),
  until: (fn, label) => ({ name: 'until ' + (label || ''), fn }),
  room: (id) => ({ name: 'room ' + id, id }),
  settle: () => ({ name: 'settle' }),
  face: (d) => ({ name: 'face ' + d, d }),
};
const ROUTES = [            // v2: rooms are 15x4 cells (480x256); x in room pixels, rows 0..3
  [ // L1 dungeon
    C.until(g => gate(g, 2, 5).f >= 8, 'gate'), C.go(356), C.steps(422), C.exitR(),
    C.room('1b'), C.runjump(176), C.exitR(),
    C.room('1c'), C.go(182), C.face(1), C.climb(), C.go(364), C.pick(), C.exitR(),
    C.room('1d'), C.go(130), C.until(g => g.hero.r === 2 && ['stand', 'en', 'en_draw'].includes(g.hero.state), 'landed'), C.go(180), C.fight(), C.go(444), C.pick(), C.exitR()],
  [ // L2 palace
    C.go(128), C.until(g => chomp(g, 2, 4) === 2, 'chomp1'), C.go(318), C.until(g => chomp(g, 2, 10) === 2, 'chomp2'), C.exitR(),
    C.room('2b'), C.go(250), C.fight(), C.exitR(),
    C.room('2c'), C.go(144), C.exitR(),
    C.room('2d'), C.go(80), C.until(g => chomp(g, 2, 3) === 2, 'chomp3'), C.go(200), C.fight(), C.go(444), C.pick(), C.exitR()],
  [ // L3 rooftops
    C.runjump(176), C.exitR(),
    C.room('3b'), C.runjump(272), C.exitR(),
    C.room('3c'), C.go(200), C.fight(), C.go(372), C.face(1), C.climb(), C.exitR(),
    C.room('3d'), C.go(130), C.until(g => g.hero.r === 2 && ['stand', 'en', 'en_draw'].includes(g.hero.state), 'landed'), C.fight(), C.go(150), C.face(1), C.runjump(296), C.exitR()],
  [ // L4 caverns
    C.go(130), C.wait(16), C.go(200), C.fight(), C.go(242), C.face(1), C.climb(), C.go(370), C.face(1), C.climb(), C.exitR(),
    C.room('4b'), C.go(164), C.steps(236), C.go(300), C.go(366), C.settle(), C.wait(16), C.exitR(),
    C.room('4c'), C.go(140), C.until(g => g.hero.r === 3 && g.hero.state === 'stand', 'pit'), C.face(1), C.climb(), C.go(360), C.steps(422), C.exitR(),
    C.room('4d'), C.go(200), C.fight(), C.go(444), C.pick(), C.exitR()],
  [ // L5 ruins
    C.go(180), C.wait(16), C.go(306), C.face(1), C.climb(), C.fight(), C.go(462), C.pick(), C.exitR(),
    C.room('5b'), C.go(240), C.fight(), C.go(276), C.hangdown(), C.drop(),
    C.room('5c'), C.settle(), C.fight(), C.exitR(),
    C.room('5d'), C.runjump(176), C.exitR()],
  [ // L6 temple
    C.go(88), C.until(g => spike(g, 3, 3) === 7, 'spike1'), C.go(144), C.fight(), C.go(334), C.until(g => spike(g, 3, 11) === 7, 'spike2'), C.exitR(),
    C.room('6b'), C.go(82), C.face(1), C.climb(), C.go(176), C.go(214), C.hangdown(), C.drop(), C.exitR(),
    C.room('6c'), C.go(220), C.fight(), C.until(g => g.room.items.some(i => i.type === 'ember'), 'ember'),
    { name: 'go ember', dyn: g => g.room.items.find(i => i.type === 'ember').x + 4 }, C.pick(),
    C.go(250), C.pick(), C.go(400), C.go(306), C.face(1), C.climb(), C.go(404), C.until(g => g.mode === 'ending', 'ending')],
];

class Autopilot {
  constructor(game, li) { this.g = game; this.li = li; this.cmds = ROUTES[li].map(c => Object.assign({}, c)); this.i = 0; this.t = 0; this.prev = {}; this.log = []; this.stuck = false; this.k = {}; }
  done() { return this.i >= this.cmds.length; }
  input() {
    const g = this.g, h = g.hero; const k = {};
    if (g.mode !== 'play' || this.done()) return this.edges(k);
    if (g.blocking()) return this.edges(k);
    let c = this.cmds[this.i];
    if (c.dyn) { c.x = c.dyn(g); c.tol = 6; delete c.dyn; c.name = 'go ' + c.x; }
    this.t++;
    if (this.t > 900) { this.stuck = true; this.log.push(`STUCK at ${c.name} room=${g.room.id} x=${h.x.toFixed(1)} r=${h.r} st=${h.state}`); this.i = this.cmds.length; return this.edges(k); }
    const ok = this.run(c, k, g, h);
    if (ok) { this.i++; this.t = 0; this.sub = 0; }
    return this.edges(k);
  }
  edges(k) {
    const out = Object.assign({}, k);
    out.pU = k.U && !this.prev.U; out.pD = k.D && !this.prev.D; out.pA = k.A && !this.prev.A; out.pB = k.B && !this.prev.B;
    this.prev = k; return out;
  }
  idle(h) { return h.state === 'stand' || h.state === 'en'; }
  run(c, k, g, h) {
    const n = c.name.split(' ')[0];
    const dirTo = x => (x > h.x ? 1 : -1);
    switch (n) {
      case 'room': return g.room.id === c.id;
      case 'wait': return this.t >= c.n;
      case 'until': return c.fn(g);
      case 'face': if (h.face === c.d && h.state === 'stand') return true; if (h.state === 'stand') k[c.d > 0 ? 'R' : 'L'] = true; return false;
      case 'settle': return this.idle(h) && this.t > 2;
      case 'go': {
        const dx = c.x - h.x;
        if (h.state === 'run' || h.state === 'startrun') { const stopD = h.state === 'run' ? 15 : 6; if (Math.abs(dx) > stopD && Math.sign(dx) === h.face) { k[h.face > 0 ? 'R' : 'L'] = true; } return false; }
        if (!this.idle(h)) return false;
        if (h.state === 'en' && g.target()) return true;
        if (Math.abs(dx) <= c.tol) return true;
        const d = dirTo(c.x); k[d > 0 ? 'R' : 'L'] = true;
        if (Math.abs(dx) < 30 && d === h.face) k.S = true;
        return false; }
      case 'steps': {
        if (c.dir === undefined) c.dir = c.x >= h.x ? 1 : -1;
        if ((h.x - c.x) * c.dir >= 0) return this.idle(h);
        if (h.state === 'stand') { k[c.dir > 0 ? 'R' : 'L'] = true; k.S = true; }
        return false; }
      case 'runjump': {
        if (h.state === 'runjump') { this.sub = 1; k[h.face > 0 ? 'R' : 'L'] = true; return false; }
        if (this.sub === 1) { return h.state === 'run' || h.state === 'stand' || h.state === 'hang' || h.state === 'land' || h.state === 'fall'; }
        k[h.face > 0 ? 'R' : 'L'] = true;
        if (h.state === 'run' && h.x * h.face >= c.at * h.face) k.U = true;
        return false; }
      case 'standjump': {
        if (h.state === 'standjump') { this.sub = 1; return false; }
        if (this.sub === 1) return h.state === 'stand' || h.state === 'land' && h.done;
        if (h.state === 'stand') { k.U = true; k[h.face > 0 ? 'R' : 'L'] = true; }
        return false; }
      case 'climb': {
        if (h.state === 'climbup') this.sub = 1;
        if (this.sub === 1 && h.state === 'stand') return true;
        if (h.state === 'stand' || h.state === 'jumpgrab' || h.state === 'hang' || h.state === 'climbup') k.U = true;
        return false; }
      case 'hangdown': { if (h.state === 'hang') return true; if (h.state === 'stand' || h.state === 'climbdown') k.D = true; return false; }
      case 'drop': { if (h.state === 'hang') { if (this.t % 2 === 1) k.D = true; return false; } return h.state === 'stand'; }
      case 'pick': {
        if (['pickup', 'drink', 'land'].includes(h.state)) { this.sub = 1; return false; }
        if (this.sub === 1 && h.state === 'stand') return true;
        if (h.state === 'stand') k.D = true; return false; }
      case 'fight': {
        const e = g.target();
        if (!e) {
          const far = g.enemiesAlive().find(x => x.r === h.r && !['rise', 'rising'].includes(x.state));
          if (!far) return h.state === 'stand' && this.t > 2;
          if (h.state === 'stand') { k[far.x > h.x ? 'R' : 'L'] = true; k.S = true; }
          return false; }
        if (!g.EN || true) {
          const d = Math.abs(e.x - h.x);
          if (e.slime && h.state === 'en') {         // slime mould: block the pseudopod lash, then cut
            if (e.state === 'lash' && e.lt < (e.kind === 'boss' ? 8 : 5) && e.lt >= (e.kind === 'boss' ? 4 : 0)) { k.B = true; break; }
            if (e.state === 'lash' && e.kind === 'boss' && e.lt < 4) break;
            if (d > (e.kind === 'boss' ? 46 : 40)) { k[h.face > 0 ? 'R' : 'L'] = true; break; }
            if (e.state !== 'death' && this.t % 3 === 0) k.A = true;
          } else if (e.slime) { if (h.state === 'en_parry' && e.state !== 'lash' && this.t % 2 === 0) k.A = true; }
          else if (h.state === 'en') {
            if (e.state === 'strike' && e.si <= 4) { k.B = true; break; }
            if (d > 40) { k[h.face > 0 ? 'R' : 'L'] = true; break; }
            if (['ready', 'advance', 'retreat', 'hit', 'parry'].includes(e.state) && (this.t % 3 === 0)) k.A = true;
          } else if (h.state === 'en_parry' && e.state !== 'strike' && this.t % 2 === 0) k.A = true;
        }
        return false; }
      case 'exitR': { if (!c.from) c.from = g.room.id; if (g.room.id !== c.from) return true; if (this.idle(h) || h.state === 'run' || h.state === 'startrun' || h.state === 'land' || h.state === 'stop') k.R = true; return false; }
    }
    return false;
  }
}
const API = { Autopilot, ROUTES };
if (typeof module !== 'undefined') module.exports = API; else root.AutoPilot = API;
})(typeof window !== 'undefined' ? window : this);
