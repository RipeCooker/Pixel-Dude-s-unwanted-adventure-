'use strict';
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const W = 960, H = 544, T = 32, ROWS = 17;

// ---------- input ----------
const keys = {}, pr = {};
addEventListener('keydown', e => {
  if (!e.repeat) pr[e.code] = 1;
  keys[e.code] = 1;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => keys[e.code] = 0);
const K = (...c) => c.some(k => keys[k]);
const Pr = (...c) => c.some(k => pr[k]);

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------- state ----------
const G = { coins: 0, relics: [0, 0, 0], cp: {}, taken: {}, deaths: 0 };
let scene = 'title', L, P, ents = [], projs = [], parts = [], boss = null, gate = 0, deadT = 0;
let cam = { x: 0 }, shake = 0, msg = { t: '', time: 0 }, time = 0;

const NAMES = ['', 'Mossy Meadows', 'Crystal Caves', 'Magma Keep'];
const BOSSN = ['', 'Sir Gloop the Squishy', 'The Crystal Golem', 'Lava Wyrm Deborah'];
const PAL = {
  hub:    { s1: '#5db8ff', s2: '#d8f1ff', f1: '#9cc7e8', f2: '#7fb77e', g: '#7a5334', t: '#5ccf4c', p: '#b07a43' },
  meadow: { s1: '#6fc8ff', s2: '#f1fbd5', f1: '#a9d6a0', f2: '#6fbf6a', g: '#6b4a2f', t: '#4fc443', p: '#a8743c' },
  cave:   { s1: '#150c2b', s2: '#35205e', f1: '#2a1d4d', f2: '#3d2a70', g: '#3a3350', t: '#7a6fd0', p: '#8a7fe0', dot: '#b8a8ff' },
  magma:  { s1: '#2a0808', s2: '#8a2a10', f1: '#4a1410', f2: '#6a1e12', g: '#3b2a2a', t: '#e0561c', p: '#c9622f', dot: '#ffb347' }
};

// ---------- level building ----------
function mk(w, theme) {
  const g = [];
  for (let y = 0; y < ROWS; y++) g.push(Array(w).fill(' '));
  return { w, theme, g, e: [] };
}
function R(l, x1, y1, x2, y2, c) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      if (x >= 0 && x < l.w && y >= 0 && y < ROWS) l.g[y][x] = c;
}
function E(l, t, x, y, o) { l.e.push(Object.assign({ t, x: x * T, y: y * T }, o)); }

function buildHub() {
  const l = mk(110, 'hub');
  R(l, 0, 14, 109, 16, '#'); R(l, 0, 0, 0, 13, '#'); R(l, 109, 0, 109, 13, '#');
  [[8, 10, 5], [28, 9, 6], [52, 10, 5], [76, 9, 6], [98, 9, 5]].forEach(([x, y, n]) => {
    R(l, x, y, x + n - 1, y, '=');
    for (let i = 0; i < n; i += 2) E(l, 'c', x + i, y - 1);
  });
  E(l, 'h', 100, 8);
  E(l, 'P', 3, 13);
  E(l, 'portal', 18, 11, { n: 1 });
  E(l, 'portal', 42, 11, { n: 2 });
  E(l, 'portal', 66, 11, { n: 3 });
  E(l, 'portal', 90, 11, { n: 4 });
  [
    [6, 'Welcome to the Hub. Think of it as a lobby, but with more existential dread. Move: A/D or arrows. Jump: Space. Sword: J. Doors: E.'],
    [13, 'Mossy Meadows is that way. Pleasant, green, and full of things that want you dead. Like a family reunion.'],
    [36, 'Crystal Caves ahead. Shiny. Pointy. Judgemental.'],
    [60, 'Magma Keep. Yes, the floor is lava. No, we will not be taking questions.'],
    [84, 'The Big Door needs 3 relics. Bring them, or go home. You are home. It is a hub.'],
    [104, 'Nothing to see here. Fine. There is a heart on the high platform. Do not tell anyone.']
  ].forEach(([x, s]) => E(l, 'S', x, 13, { s }));
  return l;
}

function buildWorld(n) {
  const l = mk(150, ['', 'meadow', 'cave', 'magma'][n]);
  R(l, 0, 14, 149, 16, '#'); R(l, 0, 0, 0, 13, '#'); R(l, 149, 0, 149, 13, '#');
  if (n === 2) R(l, 1, 0, 119, 2, '#');
  E(l, 'P', 3, 13);
  E(l, 'S', 6, 13, { s: ['', 'Mossy Meadows. Birds sing, flowers bloom, and a slime is plotting your demise.',
    'Crystal Caves. Remember: stalactites are just rocks with abandonment issues.',
    'Magma Keep. The floor is lava. The ceiling is also, spiritually, lava.'][n] });
  const order = [['en', 'pit', 'sp', 'pit', 'mix'], ['sp', 'pit', 'en', 'pit', 'mix'], ['pit', 'en', 'sp', 'pit', 'mix']][n - 1];
  order.forEach((k, i) => {
    const x = 12 + i * 20;
    if (k === 'pit') {
      const w = 4 + n;
      R(l, x + 3, 14, x + 2 + w, 16, n === 3 ? '~' : ' ');
      for (let s = x + 4; s < x + 2 + w - 1; s += 3) { R(l, s, 12, s + 1, 12, '='); E(l, 'c', s, 11); }
    } else if (k === 'sp') {
      R(l, x + 4, 13, x + 7, 13, '^');
      R(l, x + 3, 10, x + 8, 10, '='); E(l, 'c', x + 5, 9); E(l, 'c', x + 6, 9);
      if (n > 1) R(l, x + 12, 13, x + 14, 13, '^');
      E(l, 'w', x + 16, 13);
    } else if (k === 'en') {
      E(l, 'w', x + 3, 13); E(l, 'w', x + 9, 13); E(l, 'w', x + 14, 13);
      E(l, 'f', x + 7, 9); if (n > 1) E(l, 'f', x + 12, 8);
      R(l, x + 8, 10, x + 11, 10, '='); E(l, n === 2 ? 'h' : 'c', x + 9, 9);
    } else {
      R(l, x + 3, 13, x + 5, 13, '^'); R(l, x + 2, 10, x + 7, 10, '='); E(l, 'c', x + 4, 9);
      E(l, 'w', x + 9, 13); E(l, 'w', x + 14, 13); E(l, 'f', x + 11, 8); E(l, 'f', x + 16, 9);
    }
  });
  E(l, 'C', 42, 13); E(l, 'C', 82, 13); E(l, 'C', 114, 13);
  E(l, 'S', 117, 13, { s: 'Boss ahead. This is your last chance to reconsider your career as a hero. (Checkpoint is right behind you.)' });
  E(l, 'h', 113, 11);
  E(l, 'boss', 140, 0, { n });
  return l;
}

// ---------- loading ----------
function load(name, from) {
  L = name === 'hub' ? buildHub() : buildWorld(+name);
  L.name = name;
  ents = []; projs = []; parts = []; boss = null; gate = 0; deadT = 0;
  let s = { x: 3 * T, y: 13 * T };
  for (const d of L.e) {
    const id = name + ':' + d.x + ',' + d.y;
    if ((d.t === 'c' || d.t === 'h') && G.taken[id]) continue;
    if (d.t === 'P') s = { x: d.x, y: d.y };
    else if (d.t === 'w') ents.push({ k: 'w', x: d.x, y: d.y, w: 26, h: 26, vx: 0, vy: 0, dir: -1, sp: 55 + 20 * (+name || 0), hp: 2, g: false });
    else if (d.t === 'f') ents.push({ k: 'f', x: d.x, y: d.y, w: 28, h: 20, bx: d.x, by: d.y, hp: 1, ph: Math.random() * 6, f: 1 });
    else if (d.t === 'boss') mkBoss(d.n);
    else {
      const e = { k: d.t, id, x: d.x, y: d.y, w: T, h: T, n: d.n, s: d.s };
      if (d.t === 'portal') { e.w = 64; e.h = 96; }
      if (d.t === 'C' && G.cp[name] && G.cp[name].x === d.x) e.on = 1;
      ents.push(e);
    }
  }
  L.start = s;
  let st = s;
  if (from) { const p = ents.find(e => e.k === 'portal' && e.n === from); if (p) st = { x: p.x + 22, y: p.y + 60 }; }
  else if (G.cp[name]) st = G.cp[name];
  P = { x: st.x + 6, y: st.y, w: 20, h: 30, vx: 0, vy: 0, f: 1, hp: 5, max: 5, inv: 1, atk: 0, cd: 0, coy: 0, buf: 0, swing: 0, g: false };
  cam.x = clamp(P.x - W / 2, 0, L.w * T - W);
  if (name !== 'hub') say('World ' + name + ': ' + NAMES[+name], 2.5);
}

function mkBoss(n) {
  const s = [null, { w: 96, h: 72, hp: 14 }, { w: 80, h: 110, hp: 18 }, { w: 120, h: 70, hp: 22 }][n];
  boss = { k: 'b', n, w: s.w, h: s.h, hp: s.hp, max: s.hp, x: 140 * T, y: n === 3 ? 100 : 14 * T - s.h,
           vx: 0, vy: 0, f: -1, st: n === 3 ? 'hover' : n === 1 ? 'idle' : 'walk', t: 1, on: false, inv: 0, g: false };
  ents.push(boss);
}

function say(t, s = 3) { msg = { t, time: s }; }
function burst(x, y, c, n = 8) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-160, 160), vy: rnd(-260, 40), l: rnd(.3, .7), c }); }

// ---------- physics ----------
function cell(x, y) {
  if (x < 0 || x >= L.w) return '#';
  if (y < 0 || y >= ROWS) return ' ';
  return L.g[y][x];
}
function eachCell(e, f) {
  const x1 = Math.floor(e.x / T), x2 = Math.floor((e.x + e.w - .01) / T);
  const y1 = Math.floor(e.y / T), y2 = Math.floor((e.y + e.h - .01) / T);
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) f(cell(x, y), x, y);
}
function move(e, dt) {
  e.x += e.vx * dt; e.wall = 0;
  eachCell(e, (c, x) => {
    if (c === '#' && e.vx !== 0) {
      if (e.vx > 0) e.x = x * T - e.w; else e.x = (x + 1) * T;
      e.wall = Math.sign(e.vx); e.vx = 0;
    }
  });
  const py = e.y;
  e.y += e.vy * dt; e.g = false;
  eachCell(e, (c, x, y) => {
    if (c === '#') {
      if (e.vy > 0) { e.y = y * T - e.h; e.g = true; } else if (e.vy < 0) e.y = (y + 1) * T;
      e.vy = 0;
    } else if (c === '=' && e.vy >= 0 && py + e.h <= y * T + .5) {
      e.y = y * T - e.h; e.vy = 0; e.g = true;
    }
  });
}

// ---------- player ----------
function hurtP(d = 1) {
  if (P.inv > 0 || P.hp <= 0 || L.name === 'hub') return;
  P.hp -= d; P.inv = 1.2; P.vy = -320; P.vx = -P.f * 220; shake = 8;
  burst(P.x + 10, P.y + 15, '#ff5555', 10);
  if (P.hp <= 0) deadT = 1.4;
}
function fall() {
  P.hp--;
  if (P.hp <= 0) { deadT = 1.4; P.y = -200; return; }
  const c = G.cp[L.name] || L.start;
  P.x = c.x + 6; P.y = c.y; P.vx = P.vy = 0; P.inv = 1.5; shake = 8;
  say('You fell. Gravity: 1, You: 0.', 2);
}
function updPlayer(dt) {
  const dir = (K('ArrowRight', 'KeyD') ? 1 : 0) - (K('ArrowLeft', 'KeyA') ? 1 : 0);
  if (dir) { P.vx = clamp(P.vx + dir * (P.g ? 2400 : 1600) * dt, -240, 240); P.f = dir; }
  else { const d = (P.g ? 2200 : 600) * dt; P.vx = Math.abs(P.vx) <= d ? 0 : P.vx - Math.sign(P.vx) * d; }
  P.coy = P.g ? .1 : P.coy - dt;
  P.buf -= dt;
  if (Pr('Space', 'ArrowUp', 'KeyW')) P.buf = .12;
  if (P.buf > 0 && P.coy > 0) { P.vy = -640; P.buf = 0; P.coy = 0; burst(P.x + 10, P.y + 30, '#ffffff', 4); }
  if (!K('Space', 'ArrowUp', 'KeyW') && P.vy < -220) P.vy = -220;
  P.vy = Math.min(P.vy + 1900 * dt, 820);
  move(P, dt);
  P.cd -= dt; P.atk -= dt; P.inv -= dt;
  if (Pr('KeyJ', 'KeyX', 'KeyK') && P.cd <= 0) { P.atk = .16; P.cd = .28; P.swing++; }
  if (P.atk > 0) {
    const sw = { x: P.f > 0 ? P.x + P.w : P.x - 38, y: P.y, w: 38, h: P.h };
    for (const e of ents)
      if ((e.k === 'w' || e.k === 'f' || e.k === 'b') && !e.dead && e.sw !== P.swing && hit(sw, e)) { e.sw = P.swing; hurtE(e); }
  }
  if (L.name !== 'hub') {
    let spike = false, lava = false;
    eachCell(P, (c, x, y) => { if (c === '^' && P.y + P.h > y * T + 14) spike = true; if (c === '~') lava = true; });
    if (spike) hurtP(1);
    if (lava || P.y > ROWS * T + 60) fall();
  } else if (P.y > ROWS * T + 60) { P.x = L.start.x; P.y = L.start.y; P.vy = 0; }
}
function hurtE(e) {
  if (e.k === 'b') {
    if (!e.on || e.inv > 0) return;
    e.hp--; e.inv = .12; shake = 6; burst(e.x + e.w / 2, e.y + e.h / 2, '#ffffff', 8);
    if (e.hp <= 0) killBoss();
    return;
  }
  e.hp--; burst(e.x + e.w / 2, e.y + e.h / 2, '#ffffff', 6);
  if (e.hp <= 0) { e.dead = true; G.coins++; burst(e.x + e.w / 2, e.y, '#ffd23f', 6); }
}
function killBoss() {
  const b = boss; b.dead = true; b.on = false;
  burst(b.x + b.w / 2, b.y + b.h / 2, '#ffd23f', 50); shake = 20;
  projs = [];
  ents.forEach(e => { if (e.k === 'w' || e.k === 'f') e.dead = true; });
  ents.push({ k: 'relic', n: b.n, x: b.x + b.w / 2 - 16, y: b.y, w: 32, h: 32, vx: 0, vy: 0 });
  say(BOSSN[b.n] + ' has been defeated. Take the relic and brag responsibly.', 4);
  boss = null;
}

// ---------- bosses ----------
function shoot(x, y, tx, ty, sp, kind) {
  const a = Math.atan2(ty - y, tx - x);
  projs.push({ x: x - 8, y: y - 8, w: 16, h: 16, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, kind, life: 5 });
}
function wave(b) {
  for (const d of [-1, 1]) projs.push({ x: b.x + b.w / 2 - 14, y: 14 * T - 22, w: 28, h: 22, vx: d * 280, vy: 0, kind: 'wave', life: 4 });
}
function updBoss(b, dt) {
  if (!b.on || b.dead) return;
  b.inv -= dt; b.t -= dt;
  const px = P.x + P.w / 2, py = P.y + P.h / 2, bx = b.x + b.w / 2, dir = px > bx ? 1 : -1;
  const half = b.hp < b.max / 2;
  if (b.n === 1) { // Sir Gloop
    b.vy = Math.min(b.vy + 1900 * dt, 900);
    if (b.st === 'idle') { b.vx = 0; if (b.t <= 0) { b.st = 'jump'; b.vy = -780; b.vx = dir * (half ? 270 : 200); b.f = dir; b.air = .15; } }
    else b.air -= dt;
    move(b, dt);
    if (b.st === 'jump' && b.air <= 0 && b.g) {
      b.st = 'idle'; b.t = half ? .5 : .9; b.vx = 0; shake = 12;
      if (half && ents.filter(e => e.k === 'w').length < 4)
        ents.push({ k: 'w', x: b.x + b.w / 2, y: b.y, w: 26, h: 26, vx: 0, vy: -300, dir, sp: 90, hp: 1, g: false });
    }
  } else if (b.n === 2) { // Crystal Golem
    b.vy = Math.min(b.vy + 1900 * dt, 900);
    if (b.st === 'walk') {
      b.vx = dir * 80; b.f = dir;
      if (b.t <= 0) { b.st = 'tele'; b.t = .7; b.vx = 0; b.pick = ['shoot', 'charge', 'slam'][Math.random() * 3 | 0]; }
    } else if (b.st === 'tele') {
      b.vx = 0; b.f = dir;
      if (b.t <= 0) {
        b.st = b.pick; b.cd = dir; b.t = b.pick === 'charge' ? 1.3 : .5;
        if (b.pick === 'shoot') for (const o of [-60, 0, 60]) shoot(bx, b.y + 30, px, py + o, 320, 'crystal');
        if (b.pick === 'slam') { b.vy = -700; b.air = .15; }
      }
    } else if (b.st === 'charge') {
      b.vx = b.cd * 440;
      if (b.t <= 0 || b.wall) { if (b.wall) shake = 12; b.st = 'walk'; b.t = rnd(1.5, 2.5); b.vx = 0; }
    } else if (b.st === 'shoot') { b.vx = 0; if (b.t <= 0) { b.st = 'walk'; b.t = rnd(1.2, 2); } }
    else if (b.st === 'slam') b.air -= dt;
    move(b, dt);
    if (b.st === 'slam' && b.air <= 0 && b.g) { shake = 14; wave(b); b.st = 'walk'; b.t = rnd(1.2, 2); }
  } else { // Lava Wyrm Deborah
    b.f = dir;
    if (b.st === 'hover') {
      b.x += clamp(px + Math.sin(time * 1.2) * 180 - bx, -140 * dt, 140 * dt);
      b.y += (110 + Math.sin(time * 2) * 20 - b.y) * Math.min(1, 3 * dt);
      if (b.t <= 0) {
        b.shots = (b.shots || 0) + 1;
        shoot(bx, b.y + b.h * .7, px, py, 300, 'fire');
        b.t = half ? 1 : 1.5;
        if (b.shots % 3 === 0) { b.st = 'tele'; b.t = .8; }
      }
      if (half && (b.rain = (b.rain || 0) - dt) <= 0) {
        b.rain = .7;
        projs.push({ x: rnd(122 * T, 147 * T), y: -20, w: 16, h: 16, vx: 0, vy: 320, kind: 'fire', life: 5 });
      }
    } else if (b.st === 'tele') {
      b.x += (px - bx) * dt * 2; shake = Math.max(shake, 2);
      if (b.t <= 0) b.st = 'dive';
    } else if (b.st === 'dive') {
      b.y += 560 * dt; b.x += clamp(px - bx, -260 * dt, 260 * dt);
      if (b.y + b.h >= 14 * T) { b.y = 14 * T - b.h; b.st = 'rest'; b.t = 2; shake = 14; wave(b); }
    } else if (b.st === 'rest') { if (b.t <= 0) b.st = 'rise'; }
    else if (b.st === 'rise') { b.y -= 260 * dt; if (b.y <= 110) { b.st = 'hover'; b.t = 1; } }
    b.x = clamp(b.x, 122 * T, 148 * T - b.w);
  }
  if (hit(P, b)) hurtP();
}

// ---------- update ----------
function update(dt) {
  if (msg.time > 0) msg.time -= dt;
  shake = Math.max(0, shake - 40 * dt);
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.l -= dt; }
  parts = parts.filter(p => p.l > 0);
  if (deadT > 0) { deadT -= dt; if (deadT <= 0) { G.deaths++; load(L.name); } return; }

  updPlayer(dt);
  if (deadT > 0) return;

  if (L.name !== 'hub' && !gate && boss && P.x > 123 * T) {
    gate = 1; R(L, 120, 0, 120, 13, '#'); boss.on = true; shake = 10;
    say(BOSSN[+L.name] + ' wants a word. Several, actually, mostly sharp.', 3);
  }

  L.near = null; L.port = null;
  let next = 0;
  const pc = P.x + P.w / 2;
  for (const e of ents) {
    switch (e.k) {
      case 'w': {
        e.vy = Math.min(e.vy + 1900 * dt, 800);
        if (e.g) {
          const c = cell(Math.floor((e.x + (e.dir > 0 ? e.w + 2 : -2)) / T), Math.floor((e.y + e.h + 4) / T));
          if (c === ' ' || c === '~' || c === '^') e.dir *= -1;
        }
        e.vx = e.dir * e.sp; move(e, dt);
        if (e.wall) e.dir = -e.wall;
        if (hit(P, e)) hurtP();
        break;
      }
      case 'f':
        e.ph += dt; e.x = e.bx + Math.sin(e.ph * .8) * 90; e.y = e.by + Math.sin(e.ph * 2) * 24;
        e.f = Math.cos(e.ph * .8) > 0 ? 1 : -1;
        if (hit(P, e)) hurtP();
        break;
      case 'b': updBoss(e, dt); break;
      case 'c':
        if (hit(P, { x: e.x + 8, y: e.y + 8, w: 16, h: 16 })) { e.dead = 1; G.coins++; if (e.id) G.taken[e.id] = 1; burst(e.x + 16, e.y + 16, '#ffd23f', 5); }
        break;
      case 'h':
        if (P.hp < P.max && hit(P, e)) { e.dead = 1; P.hp++; G.taken[e.id] = 1; burst(e.x + 16, e.y + 16, '#ff5a7a', 8); }
        break;
      case 'C':
        if (!e.on && hit(P, e)) {
          ents.forEach(o => { if (o.k === 'C') o.on = 0; });
          e.on = 1; G.cp[L.name] = { x: e.x, y: e.y };
          say('Checkpoint! Death now comes with a discount.', 2);
        }
        break;
      case 'S': if (Math.abs(pc - (e.x + 16)) < 44) L.near = e; break;
      case 'portal':
        if (Math.abs(pc - (e.x + 32)) < 44 && P.g) {
          L.port = e;
          if (Pr('KeyE')) {
            if (e.n === 4) {
              if (G.relics.every(Boolean)) scene = 'end';
              else say('The Big Door wants 3 relics. You have ' + G.relics.filter(Boolean).length + '. It is unimpressed.', 3);
            } else next = e.n;
          }
        }
        break;
      case 'relic':
        e.vy = Math.min(e.vy + 1900 * dt, 800); e.vx = 0; move(e, dt);
        if (hit(P, e)) { G.relics[e.n - 1] = 1; next = -e.n; }
        break;
    }
  }
  for (const p of projs) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (cell(Math.floor((p.x + p.w / 2) / T), Math.floor((p.y + p.h / 2) / T)) === '#' || p.life <= 0) { p.dead = 1; burst(p.x, p.y, '#ffa040', 4); }
    else if (hit(p, P)) { hurtP(); if (p.kind !== 'wave') p.dead = 1; }
  }
  projs = projs.filter(p => !p.dead);
  ents = ents.filter(e => !e.dead);

  if (next > 0) load('' + next);
  else if (next < 0) { load('hub', -next); say('Relic acquired! The hub pretends it was never worried. Relics: ' + G.relics.filter(Boolean).length + '/3', 4); }

  cam.x += (clamp(P.x + P.w / 2 - W / 2, 0, L.w * T - W) - cam.x) * Math.min(1, 8 * dt);
}

// ---------- drawing ----------
function box(text, y) {
  ctx.font = '16px monospace'; ctx.textAlign = 'left';
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { if (ctx.measureText(cur + w).width > W - 120) { lines.push(cur); cur = ''; } cur += w + ' '; }
  lines.push(cur);
  ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect(40, y, W - 80, lines.length * 22 + 20);
  ctx.fillStyle = '#fff'; lines.forEach((l, i) => ctx.fillText(l, 60, y + 30 + i * 22));
}
function drawDude() {
  ctx.save();
  if (P.inv > 0 && ((time * 20) | 0) % 2) ctx.globalAlpha = .4;
  ctx.translate(Math.round(P.x + P.w / 2), Math.round(P.y)); ctx.scale(P.f, 1);
  const run = P.g && Math.abs(P.vx) > 20 ? Math.sin(time * 18) * 4 : 0;
  ctx.fillStyle = '#2b3a8c'; ctx.fillRect(-7 + run, 22, 6, 8); ctx.fillRect(1 - run, 22, 6, 8);
  ctx.fillStyle = '#e9483f'; ctx.fillRect(-8, 11, 16, 12);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-9, 9, 18, 4); ctx.fillRect(-16, 10 + Math.sin(time * 10) * 2, 8, 3);
  ctx.fillStyle = '#ffd6a5'; ctx.fillRect(-8, 0, 16, 11);
  ctx.fillStyle = '#4a2c1a'; ctx.fillRect(-9, -2, 18, 4); ctx.fillRect(-9, 0, 4, 6);
  ctx.fillStyle = '#fff'; ctx.fillRect(2, 4, 5, 4); ctx.fillStyle = '#000'; ctx.fillRect(5, 5, 2, 3);
  ctx.fillStyle = '#cfd8e3'; ctx.fillRect(8, 14, 10, 3);
  if (P.atk > 0) {
    ctx.fillStyle = '#e8f0ff'; ctx.fillRect(10, 12, 28, 5);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(6, 15, 30, -1.1, 1.1); ctx.stroke();
  }
  ctx.restore();
}
function drawBoss(b) {
  const f = b.inv > 0 && ((time * 30) | 0) % 2, cx = b.x + b.w / 2;
  ctx.save();
  if (b.n === 1) {
    const sq = b.st === 'jump' ? 1.12 : 1 - Math.sin(time * 10) * .05;
    ctx.fillStyle = f ? '#fff' : '#55d65a';
    ctx.beginPath(); ctx.ellipse(cx, b.y + b.h, b.w / 2, b.h * sq, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 28, b.y + 22, 16, 16); ctx.fillRect(cx + 12, b.y + 22, 16, 16);
    ctx.fillStyle = b.on ? '#c00' : '#000'; ctx.fillRect(cx - 22 + b.f * 3, b.y + 28, 6, 8); ctx.fillRect(cx + 18 + b.f * 3, b.y + 28, 6, 8);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(cx - 16, b.y - 8, 32, 10); ctx.fillRect(cx - 16, b.y - 16, 6, 8); ctx.fillRect(cx - 3, b.y - 16, 6, 8); ctx.fillRect(cx + 10, b.y - 16, 6, 8);
  } else if (b.n === 2) {
    ctx.fillStyle = f ? '#fff' : '#7a5cc7'; ctx.fillRect(b.x, b.y + 30, b.w, b.h - 30);
    ctx.fillStyle = f ? '#fff' : '#a98bff';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(b.x + i * 20, b.y + 30); ctx.lineTo(b.x + i * 20 + 10, b.y + 4 - (i % 2) * 8); ctx.lineTo(b.x + i * 20 + 20, b.y + 30); ctx.fill(); }
    ctx.fillStyle = '#4a3590'; ctx.fillRect(b.x + 14, b.y + 34, b.w - 28, 22);
    ctx.fillStyle = b.st === 'tele' ? '#ff3030' : '#ffe14a'; ctx.fillRect(cx - 18 + b.f * 4, b.y + 40, 10, 8); ctx.fillRect(cx + 8 + b.f * 4, b.y + 40, 10, 8);
    ctx.fillStyle = '#5b44a8'; ctx.fillRect(b.x - 10, b.y + 50, 12, 40); ctx.fillRect(b.x + b.w - 2, b.y + 50, 12, 40);
  } else {
    const fl = Math.sin(time * 12) * 22;
    ctx.fillStyle = f ? '#fff' : '#a3200f';
    ctx.beginPath(); ctx.moveTo(cx - 20, b.y + 20); ctx.lineTo(cx - 70, b.y - 20 + fl); ctx.lineTo(cx - 10, b.y + 40); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 20, b.y + 20); ctx.lineTo(cx + 70, b.y - 20 + fl); ctx.lineTo(cx + 10, b.y + 40); ctx.fill();
    ctx.fillStyle = f ? '#fff' : '#d8381c'; ctx.beginPath(); ctx.ellipse(cx, b.y + 38, 50, 30, 0, 0, 7); ctx.fill();
    ctx.fillRect(cx + b.f * 40 - 16, b.y + 14, 32, 26);
    ctx.fillStyle = '#ffe14a'; ctx.fillRect(cx + b.f * 46 - 4, b.y + 20, 8, 7);
    ctx.fillStyle = '#ff9a2e'; ctx.fillRect(cx - b.f * 50 - 6, b.y + 34, 12, 8);
  }
  ctx.restore();
}
function drawEnt(e) {
  const x = e.x | 0, y = e.y | 0;
  switch (e.k) {
    case 'c': { const w = Math.abs(Math.cos(time * 4 + e.x)) * 12 + 2; ctx.fillStyle = '#ffd23f'; ctx.fillRect(x + 16 - w / 2, y + 8 + Math.sin(time * 3 + e.x) * 2, w, 16); break; }
    case 'h': ctx.fillStyle = '#ff4466'; ctx.fillRect(x + 6, y + 8, 8, 8); ctx.fillRect(x + 18, y + 8, 8, 8); ctx.fillRect(x + 6, y + 14, 20, 8); ctx.fillRect(x + 10, y + 22, 12, 4); break;
    case 'C': ctx.fillStyle = '#ccc'; ctx.fillRect(x + 14, y - 32, 4, 64); ctx.fillStyle = e.on ? '#4cff6a' : '#888'; ctx.fillRect(x + 18, y - 32, 20, 14); break;
    case 'S': ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x + 14, y + 8, 4, 24); ctx.fillRect(x + 2, y, 28, 14); ctx.fillStyle = '#e8c88a'; ctx.fillRect(x + 5, y + 3, 22, 3); ctx.fillRect(x + 5, y + 8, 14, 3); break;
    case 'w': ctx.fillStyle = '#c44fd6'; ctx.fillRect(x, y + 8, 26, 18); ctx.fillRect(x + 4, y + 2, 18, 8); ctx.fillStyle = '#fff'; ctx.fillRect(x + 5, y + 10, 6, 6); ctx.fillRect(x + 15, y + 10, 6, 6); ctx.fillStyle = '#000'; ctx.fillRect(x + 7 + e.dir * 2, y + 12, 3, 4); ctx.fillRect(x + 17 + e.dir * 2, y + 12, 3, 4); break;
    case 'f': { const fl = Math.sin(time * 20) * 6; ctx.fillStyle = '#3a2a55'; ctx.fillRect(x + 6, y + 4, 16, 14); ctx.beginPath(); ctx.moveTo(x + 6, y + 8); ctx.lineTo(x - 8, y + fl); ctx.lineTo(x + 8, y + 16); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 22, y + 8); ctx.lineTo(x + 36, y + fl); ctx.lineTo(x + 20, y + 16); ctx.fill(); ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x + 9, y + 8, 4, 4); ctx.fillRect(x + 16, y + 8, 4, 4); break; }
    case 'b': drawBoss(e); break;
    case 'relic': ctx.fillStyle = '#7ff0ff'; ctx.beginPath(); ctx.moveTo(x + 16, y - 4 + Math.sin(time * 5) * 4); ctx.lineTo(x + 32, y + 16); ctx.lineTo(x + 16, y + 36); ctx.lineTo(x, y + 16); ctx.fill(); break;
    case 'portal': {
      const cx = x + 32, cy = y + 48, col = e.n === 4 ? '#ffd23f' : ['', '#5ccf4c', '#8f7bff', '#ff6a2b'][e.n];
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(cx, cy, 34, 50, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 5;
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = .9 - i * .25; ctx.beginPath(); ctx.ellipse(cx, cy, 30 - i * 8, 46 - i * 10, time * (i % 2 ? 1 : -1) * .5, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
      ctx.fillText(e.n === 4 ? 'THE BIG DOOR' : NAMES[e.n], cx, y - 22);
      if (e.n < 4 && G.relics[e.n - 1]) { ctx.fillStyle = '#7ff0ff'; ctx.beginPath(); ctx.moveTo(cx, y - 14); ctx.lineTo(cx + 8, y - 4); ctx.lineTo(cx, y + 6); ctx.lineTo(cx - 8, y - 4); ctx.fill(); }
      ctx.textAlign = 'left'; break;
    }
  }
}
function draw() {
  const pal = PAL[L.theme];
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, pal.s1); g.addColorStop(1, pal.s2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const [f, a, c] of [[.2, 70, pal.f1], [.45, 40, pal.f2]]) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 16; x += 16) { const wx = x + cam.x * f; ctx.lineTo(x, H - 170 + (f > .3 ? 40 : 0) - Math.sin(wx * .008) * a - Math.sin(wx * .021) * a / 3); }
    ctx.lineTo(W + 16, H); ctx.fill();
  }
  if (pal.dot) {
    ctx.fillStyle = pal.dot;
    for (let i = 0; i < 30; i++) ctx.fillRect(((i * 173.3 - cam.x * .15) % W + W) % W, ((i * 61.7 - (L.theme === 'magma' ? time * 30 : 0)) % H + H) % H, 3, 3);
  }
  ctx.save();
  ctx.translate(-(cam.x | 0) + (Math.random() - .5) * shake, (Math.random() - .5) * shake);
  const x0 = Math.max(0, cam.x / T | 0), x1 = Math.min(L.w - 1, (cam.x + W) / T | 0);
  for (let y = 0; y < ROWS; y++) for (let x = x0; x <= x1; x++) {
    const c = L.g[y][x]; if (c === ' ') continue;
    const px = x * T, py = y * T;
    if (c === '#') {
      ctx.fillStyle = pal.g; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(px + ((x * 7 + y * 3) % 4) * 6, py + 8 + ((x + y * 5) % 3) * 8, 8, 4);
      if (y === 0 || L.g[y - 1][x] !== '#') { ctx.fillStyle = pal.t; ctx.fillRect(px, py, T, 8); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(px, py, T, 2); }
    } else if (c === '=') {
      ctx.fillStyle = pal.p; ctx.fillRect(px, py, T, 8); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px, py + 8, T, 3);
    } else if (c === '^') {
      ctx.fillStyle = '#cfd8e3';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(px + i * 11, py + T); ctx.lineTo(px + i * 11 + 5.5, py + 10); ctx.lineTo(px + i * 11 + 11, py + T); ctx.fill(); }
    } else if (c === '~') {
      const o = y === 14 ? 4 + Math.sin(time * 4 + x) * 3 : 0;
      ctx.fillStyle = y === 14 ? '#ff8a1f' : '#d63a0a'; ctx.fillRect(px, py + o, T, T - o);
    }
  }
  for (const e of ents) if (e.x + 150 > cam.x && e.x - 150 < cam.x + W) drawEnt(e);
  for (const p of projs) {
    ctx.fillStyle = p.kind === 'crystal' ? '#b9a0ff' : p.kind === 'wave' ? '#ffd23f' : '#ff7a1a';
    ctx.fillRect(p.x | 0, p.y | 0, p.w, p.h);
  }
  if (deadT <= 0 || deadT > 1.1) drawDude();
  for (const p of parts) { ctx.fillStyle = p.c; ctx.fillRect(p.x | 0, p.y | 0, 4, 4); }
  if (L.port) { ctx.fillStyle = '#fff'; ctx.font = '16px monospace'; ctx.textAlign = 'center'; ctx.fillText('[E] Enter', L.port.x + 32, L.port.y - 40); ctx.textAlign = 'left'; }
  ctx.restore();

  // HUD
  ctx.font = '24px monospace'; ctx.textAlign = 'left';
  for (let i = 0; i < P.max; i++) { ctx.fillStyle = i < P.hp ? '#ff4466' : '#552233'; ctx.fillText('♥', 16 + i * 28, 36); }
  ctx.fillStyle = '#ffd23f'; ctx.font = '18px monospace'; ctx.fillText('● ' + G.coins, 16, 62);
  for (let i = 0; i < 3; i++) { ctx.fillStyle = G.relics[i] ? '#7ff0ff' : '#333a4a'; ctx.beginPath(); ctx.moveTo(30 + i * 26, 72); ctx.lineTo(40 + i * 26, 84); ctx.lineTo(30 + i * 26, 98); ctx.lineTo(20 + i * 26, 84); ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.font = '16px monospace'; ctx.textAlign = 'right';
  ctx.fillText(L.name === 'hub' ? 'THE HUB' : 'World ' + L.name + ': ' + NAMES[+L.name], W - 16, 28);
  ctx.fillText('Deaths: ' + G.deaths, W - 16, 50); ctx.textAlign = 'left';
  if (boss && boss.on) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(W / 2 - 200, H - 44, 400, 24);
    ctx.fillStyle = '#e02a3a'; ctx.fillRect(W / 2 - 196, H - 40, 392 * boss.hp / boss.max, 16);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(BOSSN[boss.n], W / 2, H - 52); ctx.textAlign = 'left';
  }
  if (L.near) box(L.near.s, H - 130);
  else if (msg.time > 0) box(msg.t, 16 + 40);
  if (deadT > 0) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff5566'; ctx.font = '48px monospace'; ctx.textAlign = 'center'; ctx.fillText('YOU DIED', W / 2, H / 2);
    ctx.fillStyle = '#fff'; ctx.font = '18px monospace'; ctx.fillText('Bold strategy. Let us see if it works a second time.', W / 2, H / 2 + 36); ctx.textAlign = 'left';
  }
}
function drawTitle() {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1b5e'); g.addColorStop(1, '#ff8a5c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 54px monospace'; ctx.fillText('PIXEL DUDE', W / 2, 150);
  ctx.font = '28px monospace'; ctx.fillText('vs. Basically Everything', W / 2, 192);
  ctx.font = '16px monospace'; ctx.fillStyle = '#ffe9b0';
  ctx.fillText('A heroic tale of questionable decisions and one very small sword.', W / 2, 240);
  ctx.fillStyle = '#fff';
  ['A / D or Arrows: move', 'Space / W / Up: jump (hold = higher)', 'J / X / K: swing sword', 'E: enter doors', '', 'Goal: beat 3 bosses, grab 3 relics, open the Big Door.']
    .forEach((t, i) => ctx.fillText(t, W / 2, 300 + i * 26));
  if (((time * 2) | 0) % 2) { ctx.fillStyle = '#ffd23f'; ctx.font = '24px monospace'; ctx.fillText('Press ENTER to begin your doom', W / 2, 500); }
  ctx.textAlign = 'left';
}
function drawEnd() {
  ctx.fillStyle = '#10091f'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 44px monospace'; ctx.fillText('THE BIG DOOR OPENS', W / 2, 150);
  ctx.fillStyle = '#fff'; ctx.font = '18px monospace';
  ['Behind it: a very small room and a note.', '"Thanks for playing. The real treasure was the slimes you killed along the way."', '',
   'Coins: ' + G.coins + '   Deaths: ' + G.deaths, G.deaths > 10 ? 'Persistence: impressive. Skill: debatable.' : 'Suspiciously competent. Are you sure you are not a bot?', '', 'Press ENTER to return to the hub and stare at your achievements.']
    .forEach((t, i) => ctx.fillText(t, W / 2, 220 + i * 32));
  ctx.textAlign = 'left';
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(.033, (now - last) / 1000); last = now; time += dt;
  if (scene === 'title') {
    drawTitle();
    if (Pr('Enter', 'Space')) { scene = 'play'; load('hub'); say('You are the Pixel Dude. Try to look heroic. Read the signs. They are funnier than the guy who wrote them.', 5); }
  } else if (scene === 'end') {
    drawEnd();
    if (Pr('Enter')) { scene = 'play'; load('hub', 4); }
  } else { update(dt); if (scene === 'play') draw(); }
  for (const k in pr) delete pr[k];
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);