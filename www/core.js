// Neon Survivors - game logic (no DOM, runs in Node for tests/balance sims).
// Performance rules: every pool is preallocated, nothing is allocated per frame in update().
(function () {
  'use strict';
  const G = globalThis; const NS = G.NS || (G.NS = {});

  const WIN_TIME = 900;                 // survive 15 minutes
  const BOSS_TIMES = [300, 600];        // MVP: boss at 5:00 and 10:00 (same design, stronger)
  const MAX_ALIVE = 300;                // target enemies on screen late in the run
  const MAX_EN = 330, MAX_PR = 260, MAX_GEM = 520, MAX_EB = 140, MAX_MINE = 24, MAX_BOLT = 16;
  const GRID_N = 2048, CELL = 48;
  const MAX_WEAPONS = 4;

  const EV = {
    SHOOT: 1, HIT: 2, KILL: 3, GEM: 4, LEVEL: 5, HURT: 6, BOOM: 7, BOSS_WARN: 8,
    BOSS_DIE: 9, ZAP: 10, HEAL: 11, COIN: 12, WIN: 13, DEAD: 14, BOSS_SHOT: 15, BOSS_SPAWN: 16, MINE: 17, REVIVE: 18
  };

  const T_GRUNT = 0, T_SWARM = 1, T_DASH = 2, T_BRUTE = 3, T_BOSS = 4;
  const ETYPES = [
    { hp: 12,   spd: 52, r: 9,  dmg: 8,  xp: 1 },   // grunt
    { hp: 5,    spd: 92, r: 6,  dmg: 5,  xp: 1 },   // swarm
    { hp: 16,   spd: 46, r: 8,  dmg: 10, xp: 2 },   // dasher
    { hp: 75,   spd: 34, r: 15, dmg: 16, xp: 6 },   // brute
    { hp: 3000, spd: 40, r: 34, dmg: 22, xp: 0 }    // boss
  ];

  const WEAPONS = ['blaster', 'bounce', 'orbit', 'mine', 'chain', 'missile'];
  const PASSIVES = ['power', 'clock', 'hull', 'thrust', 'coil', 'repair'];
  // per-level stats (index = level - 1)
  const WSTAT = {
    blaster: { dmg: [9, 11, 12, 15, 17], cd: [0.55, 0.5, 0.5, 0.46, 0.4], n: [1, 1, 2, 2, 3], pierce: [0, 0, 0, 1, 1] },
    bounce:  { dmg: [14, 16, 18, 22, 26], cd: [1.5, 1.4, 1.3, 1.2, 1.0], bounces: [3, 4, 5, 6, 8], n: [1, 1, 1, 1, 2] },
    orbit:   { dmg: [7, 8, 10, 11, 14], n: [2, 3, 3, 4, 5], R: [52, 56, 60, 64, 70], spd: [2.4, 2.6, 2.8, 3.1, 3.4] },
    mine:    { dmg: [28, 34, 40, 48, 60], cd: [2.4, 2.1, 1.9, 1.6, 1.3], rad: [46, 50, 54, 58, 66], max: [3, 4, 5, 6, 8] },
    chain:   { dmg: [16, 19, 22, 26, 32], cd: [1.6, 1.45, 1.3, 1.1, 0.9], jumps: [2, 3, 4, 5, 7] },
    missile: { dmg: [22, 26, 30, 36, 44], cd: [2.3, 2.1, 1.9, 1.7, 1.4], n: [1, 1, 2, 2, 3], rad: [34, 36, 38, 40, 46] }
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const heads = new Int32Array(GRID_N);
  function cellKey(cx, cy) { return ((cx * 73856093) ^ (cy * 19349663)) & (GRID_N - 1); }
  function xpFor(l) { return Math.floor(5 + 4 * l + 0.6 * l * l); }
  function ev(s, c, x, y, a) { if (s.onEvent) s.onEvent(c, x, y, a); }

  // ---------------------------------------------------------------- state
  function create(opts) {
    opts = opts || {};
    const s = {
      t: 0, over: false, won: false, dead: false, revived: false, stress: false,
      rng: mulberry32(opts.seed || ((Math.random() * 1e9) | 0)),
      mods: opts.mods || { hp: 0, speed: 0, magnet: 0, xp: 0 },
      viewW: 400, viewH: 860,
      hero: { x: 0, y: 0, hp: 100, maxHp: 0, speed: 120, r: 10, iframes: 0, magnet: 55, regen: 0, fx: 0, fy: -1 },
      inx: 0, iny: 0,
      weapons: [], pl: { power: 0, clock: 0, hull: 0, thrust: 0, coil: 0, repair: 0 },
      dmgMul: 1, cdMul: 1, xpMul: 1,
      xp: 0, level: 1, xpNeed: xpFor(1), lvlPending: 0, choices: null,
      kills: 0, coinsCollected: 0, bossKills: 0, bossIdx: 0, bossWarned: false, boss: null,
      en: [], pr: [], gems: [], eb: [], mines: [], bolts: [], drones: [],
      enCount: 0, enHint: 0, prHint: 0, gemHint: 0, droneN: 0, mineCount: 0,
      hpMul: 1, spdMul: 1, dmgMulE: 1, gemMul: 1,
      spawnAcc: 0, nextRing: 35, nextLine: 20, nextId: 1,
      chainIds: new Int32Array(12),
      onEvent: null
    };
    for (let i = 0; i < MAX_EN; i++) s.en.push({ a: false, type: 0, x: 0, y: 0, hp: 0, maxHp: 1, spd: 0, r: 8, dmg: 0, kx: 0, ky: 0, flash: 0, id: 0, t: 0, st: 0, c2: 0, dx: 0, dy: 0, oh: -9, nx: -1 });
    for (let i = 0; i < MAX_PR; i++) s.pr.push({ a: false, k: 0, x: 0, y: 0, vx: 0, vy: 0, dmg: 0, r: 4, life: 0, pierce: 0, bn: 0, h1: 0, h2: 0, ti: -1, tid: 0, rad: 0 });
    for (let i = 0; i < MAX_GEM; i++) s.gems.push({ a: false, k: 0, x: 0, y: 0, v: 1, m: false, sp: 0 });
    for (let i = 0; i < MAX_EB; i++) s.eb.push({ a: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, dmg: 0 });
    for (let i = 0; i < MAX_MINE; i++) s.mines.push({ a: false, x: 0, y: 0, arm: 0, life: 0, rad: 0, dmg: 0 });
    for (let i = 0; i < MAX_BOLT; i++) s.bolts.push({ a: false, t: 0, n: 0, px: new Float32Array(12), py: new Float32Array(12) });
    for (let i = 0; i < 6; i++) s.drones.push({ x: 0, y: 0 });
    recalc(s);
    s.hero.hp = s.hero.maxHp;
    s.weapons.push({ id: 'blaster', lv: 1, cd: 0.2 });
    return s;
  }

  function setView(s, w, h) { s.viewW = w; s.viewH = h; }
  function setInput(s, x, y) {
    const m = Math.sqrt(x * x + y * y);
    if (m > 1) { x /= m; y /= m; }
    s.inx = x; s.iny = y;
  }

  function recalc(s) {
    const h = s.hero, m = s.mods, pl = s.pl;
    const old = h.maxHp;
    h.maxHp = Math.round(100 * (1 + m.hp) * (1 + 0.2 * pl.hull));
    if (old && h.maxHp > old) h.hp += h.maxHp - old;
    h.speed = 120 * (1 + m.speed) * (1 + 0.08 * pl.thrust);
    h.magnet = 55 * (1 + m.magnet) * (1 + 0.3 * pl.coil);
    h.regen = 0.6 * pl.repair;
    s.dmgMul = 1 + 0.12 * pl.power;
    s.cdMul = Math.max(0.45, 1 - 0.08 * pl.clock);
    s.xpMul = 1 + m.xp;
  }

  function getWeapon(s, id) {
    for (let i = 0; i < s.weapons.length; i++) if (s.weapons[i].id === id) return s.weapons[i];
    return null;
  }

  // ---------------------------------------------------------------- level up
  function genChoices(s) {
    const pool = [];
    for (let i = 0; i < WEAPONS.length; i++) {
      const id = WEAPONS[i], w = getWeapon(s, id);
      if (w) { if (w.lv < 5) pool.push({ k: 'w', id: id, lv: w.lv + 1 }); }
      else if (s.weapons.length < MAX_WEAPONS) pool.push({ k: 'w', id: id, lv: 1 });
    }
    for (let i = 0; i < PASSIVES.length; i++) {
      const id = PASSIVES[i];
      if (s.pl[id] < 5) pool.push({ k: 'p', id: id, lv: s.pl[id] + 1 });
    }
    const out = [];
    while (out.length < 3 && pool.length) {
      const j = Math.floor(s.rng() * pool.length);
      out.push(pool[j]); pool.splice(j, 1);
    }
    const fb = [{ k: 'f', id: 'heal', lv: 0 }, { k: 'f', id: 'coins', lv: 0 }];
    for (let i = 0; out.length < 3; i++) out.push(fb[i % 2]);
    s.choices = out;
  }

  function applyChoice(s, i) {
    const c = s.choices && s.choices[i];
    if (!c) return;
    if (c.k === 'w') {
      const w = getWeapon(s, c.id);
      if (w) w.lv = Math.min(5, w.lv + 1); else s.weapons.push({ id: c.id, lv: 1, cd: 0.2 });
    } else if (c.k === 'p') {
      s.pl[c.id] = Math.min(5, s.pl[c.id] + 1);
      recalc(s);
    } else if (c.id === 'heal') {
      s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + s.hero.maxHp * 0.35);
    } else {
      s.coinsCollected += 40;
    }
    s.choices = null;
    s.lvlPending--;
    if (s.lvlPending > 0) genChoices(s);
  }
  function reroll(s) { if (s.choices) genChoices(s); }

  function addXp(s, v) {
    s.xp += v;
    while (s.xp >= s.xpNeed) {
      s.xp -= s.xpNeed; s.level++; s.xpNeed = xpFor(s.level); s.lvlPending++;
      ev(s, EV.LEVEL, s.hero.x, s.hero.y, s.level);
    }
  }

  // ---------------------------------------------------------------- enemies
  function ringRadius(s) { return Math.sqrt(s.viewW * s.viewW / 4 + s.viewH * s.viewH / 4) + 30; }

  function spawnEnemy(s, type, x, y) {
    const E = s.en;
    let e = null;
    for (let k = 0; k < MAX_EN; k++) {
      const i = (s.enHint + k) % MAX_EN;
      if (!E[i].a) { e = E[i]; s.enHint = i + 1; break; }
    }
    if (!e) return null;
    const d = ETYPES[type];
    e.a = true; e.type = type; e.x = x; e.y = y;
    e.hp = e.maxHp = d.hp * s.hpMul;
    e.spd = d.spd * (0.9 + 0.2 * s.rng());
    e.r = d.r; e.dmg = d.dmg * s.dmgMulE;
    e.kx = 0; e.ky = 0; e.flash = 0; e.id = s.nextId++;
    e.t = s.rng() * 2; e.st = 0; e.c2 = 0; e.oh = -9;
    s.enCount++;
    return e;
  }

  function spawnRing1(s, type) {
    const a = s.rng() * 6.2832, R = ringRadius(s) + s.rng() * 30;
    return spawnEnemy(s, type, s.hero.x + Math.cos(a) * R, s.hero.y + Math.sin(a) * R);
  }

  function pickType(s) {
    const t = s.t;
    if (t < 45) return T_GRUNT;
    const wg = 70, ws = 30, wd = t >= 120 ? 16 : 0, wb = t >= 180 ? 8 + Math.min(14, (t - 180) / 40) : 0;
    let x = s.rng() * (wg + ws + wd + wb);
    if ((x -= wg) < 0) return T_GRUNT;
    if ((x -= ws) < 0) return T_SWARM;
    if ((x -= wd) < 0) return T_DASH;
    return T_BRUTE;
  }

  function spawnBoss(s) {
    const idx = s.bossIdx;
    const e = spawnRing1(s, T_BOSS);
    if (!e) return;
    e.hp = e.maxHp = 3000 * (1 + idx * 1.6);
    e.dmg = 22 + idx * 6;
    e.t = 2.0; e.c2 = 5; e.st = 0;
    s.boss = e;
    ev(s, EV.BOSS_SPAWN, e.x, e.y, idx);
  }

  function director(s, dt) {
    const t = s.t, m = t / 60;
    if (s.bossIdx < BOSS_TIMES.length) {
      const bt = BOSS_TIMES[s.bossIdx];
      if (!s.bossWarned && t >= bt - 3) { s.bossWarned = true; ev(s, EV.BOSS_WARN, 0, 0, s.bossIdx); }
      if (t >= bt) { spawnBoss(s); s.bossIdx++; s.bossWarned = false; }
    }
    let desired = s.stress ? MAX_ALIVE : Math.min(MAX_ALIVE, 14 + 18 * m + 1.1 * m * m);
    if (s.boss && !s.stress) desired *= 0.6;
    const rate = s.stress ? 60 : 3 + 1.4 * m;
    s.spawnAcc = Math.min(s.spawnAcc + rate * dt, 8);
    while (s.spawnAcc >= 1 && s.enCount < desired) { spawnRing1(s, pickType(s)); s.spawnAcc -= 1; }
    if (s.enCount >= desired) s.spawnAcc = Math.min(s.spawnAcc, 1);

    if (t >= s.nextRing) {                       // closing circle of swarmers
      s.nextRing += 40;
      const n = Math.min(44, Math.floor(16 + m * 2.5)), R = ringRadius(s) + 10;
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.2832;
        spawnEnemy(s, T_SWARM, s.hero.x + Math.cos(a) * R, s.hero.y + Math.sin(a) * R);
      }
    }
    if (t >= s.nextLine) {                       // wall of enemies from one side
      s.nextLine += 28;
      const n = Math.floor(10 + m), a = s.rng() * 6.2832, R = ringRadius(s) + 10;
      const cx = s.hero.x + Math.cos(a) * R, cy = s.hero.y + Math.sin(a) * R, px = -Math.sin(a), py = Math.cos(a);
      const type = t > 300 && s.rng() < 0.4 ? T_BRUTE : T_GRUNT;
      for (let i = 0; i < n; i++) {
        const o = (i - n / 2) * 20;
        spawnEnemy(s, type, cx + px * o, cy + py * o);
      }
    }
  }

  function damageEnemy(s, e, dmg, dx, dy, knock) {
    e.hp -= dmg; e.flash = 0.07;
    if (e.type !== T_BOSS) { e.kx += dx * knock; e.ky += dy * knock; }
    ev(s, EV.HIT, e.x, e.y, dmg);
    if (e.hp <= 0) killEnemy(s, e);
  }

  function dropGem(s, x, y, v, k) {
    const gems = s.gems;
    for (let n = 0; n < MAX_GEM; n++) {
      const i = (s.gemHint + n) % MAX_GEM, g = gems[i];
      if (!g.a) {
        s.gemHint = i + 1;
        g.a = true; g.k = k; g.x = x + (s.rng() - 0.5) * 10; g.y = y + (s.rng() - 0.5) * 10; g.v = v; g.m = false; g.sp = 40;
        return;
      }
    }
    if (k <= 2) addXp(s, v * s.xpMul);           // pool full: award directly
  }

  function killEnemy(s, e) {
    e.a = false; s.enCount--; s.kills++;
    const d = ETYPES[e.type];
    if (e.type === T_BOSS) {
      s.boss = null; s.bossKills++;
      for (let i = 0; i < 8; i++) dropGem(s, e.x, e.y, 40, 2);
      s.coinsCollected += 25;
      s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + s.hero.maxHp * 0.25);
      for (let i = 0; i < MAX_EB; i++) s.eb[i].a = false;
      ev(s, EV.BOSS_DIE, e.x, e.y, 0);
      return;
    }
    const v = Math.max(1, Math.round(d.xp * s.gemMul));
    dropGem(s, e.x, e.y, v, v <= 2 ? 0 : (v <= 9 ? 1 : 2));
    const r = s.rng();
    if (r < 0.035) dropGem(s, e.x, e.y, 1, 4);              // coin
    else if (r < 0.043) dropGem(s, e.x, e.y, 0, 3);         // repair
    else if (r < 0.046) dropGem(s, e.x, e.y, 0, 5);         // vacuum
    ev(s, EV.KILL, e.x, e.y, e.type);
  }

  function hurtHero(s, dmg) {
    const h = s.hero;
    if (h.iframes > 0 || s.dead || s.over) return;
    h.hp -= dmg; h.iframes = 0.5;
    ev(s, EV.HURT, h.x, h.y, dmg);
    if (h.hp <= 0) { h.hp = 0; s.dead = true; ev(s, EV.DEAD, h.x, h.y, 0); }
  }

  function fireBossRing(s, e) {
    const n = 12 + 4 * s.bossIdx, off = s.t * 0.7, sp = 110 + 10 * s.bossIdx;
    const dmg = 10 * (1 + s.bossIdx * 0.5);
    ev(s, EV.BOSS_SHOT, e.x, e.y, 0);
    let k = 0;
    for (let i = 0; i < MAX_EB && k < n; i++) {
      const b = s.eb[i];
      if (b.a) continue;
      const a = off + k / n * 6.2832;
      b.a = true; b.x = e.x; b.y = e.y; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.life = 6; b.dmg = dmg;
      k++;
    }
  }

  function updateBoss(s, e, dt) {
    const h = s.hero;
    let dx = h.x - e.x, dy = h.y - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (e.st === 0) {
      const sp = e.spd * s.spdMul * 0.8;
      e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;
      e.c2 -= dt;
      if (e.c2 <= 0) { e.st = 1; e.c2 = 0.7; e.dx = dx / d; e.dy = dy / d; }
    } else if (e.st === 1) {
      e.c2 -= dt;
      if (e.c2 <= 0) { e.st = 2; e.c2 = 0.8; }
    } else {
      e.x += e.dx * 300 * dt; e.y += e.dy * 300 * dt;
      e.c2 -= dt;
      if (e.c2 <= 0) { e.st = 0; e.c2 = 6.5; }
    }
    e.t -= dt;
    if (e.t <= 0 && e.st !== 1) { e.t = 3.2; fireBossRing(s, e); }
    if (e.flash > 0) e.flash -= dt;
    dx = h.x - e.x; dy = h.y - e.y;
    const rr = e.r + h.r;
    if (dx * dx + dy * dy < rr * rr) hurtHero(s, e.dmg);
  }

  function updateEnemies(s, dt) {
    const h = s.hero, E = s.en;
    heads.fill(-1);
    for (let i = 0; i < MAX_EN; i++) {
      const e = E[i];
      if (!e.a) continue;
      const k = cellKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
      e.nx = heads[k]; heads[k] = i;
    }
    const kd = Math.exp(-8 * dt), R2 = (ringRadius(s) + 260) * (ringRadius(s) + 260);
    for (let i = 0; i < MAX_EN; i++) {
      const e = E[i];
      if (!e.a) continue;
      if (e.type === T_BOSS) { updateBoss(s, e, dt); continue; }
      let dx = h.x - e.x, dy = h.y - e.y;
      let d2 = dx * dx + dy * dy;
      if (d2 > R2) {                              // wandered too far: bring it back from a random side
        const a = s.rng() * 6.2832, R = ringRadius(s) + 10;
        e.x = h.x + Math.cos(a) * R; e.y = h.y + Math.sin(a) * R;
        continue;
      }
      const d = Math.sqrt(d2) || 1;
      let sp = e.spd * s.spdMul, vx, vy;
      if (e.type === T_DASH) {
        e.t -= dt;
        if (e.st === 0) { if (e.t <= 0) { e.st = 1; e.t = 0.45; e.dx = dx / d; e.dy = dy / d; } }
        else if (e.st === 1) { sp = 0; if (e.t <= 0) { e.st = 2; e.t = 0.5; } }
        else { sp *= 5; dx = e.dx * d; dy = e.dy * d; if (e.t <= 0) { e.st = 0; e.t = 2 + s.rng() * 1.5; } }
      }
      vx = dx / d * sp; vy = dy / d * sp;
      if (e.type === T_DASH && e.st === 2) { vx = e.dx * sp; vy = e.dy * sp; }
      // separation (bounded work per enemy)
      let px = 0, py = 0, scanned = 0;
      const cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
      for (let gy = cy - 1; gy <= cy + 1 && scanned < 24; gy++) {
        for (let gx = cx - 1; gx <= cx + 1 && scanned < 24; gx++) {
          let j = heads[cellKey(gx, gy)];
          while (j >= 0 && scanned < 24) {
            const o = E[j]; scanned++;
            if (j !== i) {
              const ox = e.x - o.x, oy = e.y - o.y, rr = e.r + o.r, q = ox * ox + oy * oy;
              if (q < rr * rr && q > 0.01) { const dd = Math.sqrt(q), f = (rr - dd) / rr; px += ox / dd * f; py += oy / dd * f; }
            }
            j = o.nx;
          }
        }
      }
      e.x += (vx + e.kx + px * 70) * dt;
      e.y += (vy + e.ky + py * 70) * dt;
      e.kx *= kd; e.ky *= kd;
      if (e.flash > 0) e.flash -= dt;
      const rr = e.r + h.r;
      dx = h.x - e.x; dy = h.y - e.y;
      if (dx * dx + dy * dy < rr * rr) hurtHero(s, e.dmg);
    }
  }

  // ---------------------------------------------------------------- targeting helpers
  function nearest(s, x, y, maxR, exId) {
    let best = null, bd = maxR * maxR;
    const E = s.en;
    for (let i = 0; i < MAX_EN; i++) {
      const e = E[i];
      if (!e.a || e.id === exId) continue;
      const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }
  function nearestNotIn(s, x, y, maxR, ids, n) {
    let best = null, bd = maxR * maxR;
    const E = s.en;
    for (let i = 0; i < MAX_EN; i++) {
      const e = E[i];
      if (!e.a) continue;
      let skip = false;
      for (let k = 0; k < n; k++) if (ids[k] === e.id) { skip = true; break; }
      if (skip) continue;
      const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }
  function randomNear(s, x, y, maxR) {
    let pick = null, c = 0;
    const E = s.en, R2 = maxR * maxR;
    for (let i = 0; i < MAX_EN; i++) {
      const e = E[i];
      if (!e.a) continue;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy < R2 && s.rng() * ++c < 1) pick = e;
    }
    return pick;
  }

  function spawnProj(s, k, x, y, vx, vy, dmg, r, life, pierce) {
    const P = s.pr;
    for (let n = 0; n < MAX_PR; n++) {
      const i = (s.prHint + n) % MAX_PR, p = P[i];
      if (!p.a) {
        s.prHint = i + 1;
        p.a = true; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.dmg = dmg; p.r = r; p.life = life; p.pierce = pierce;
        p.bn = 0; p.h1 = 0; p.h2 = 0; p.ti = -1; p.tid = 0; p.rad = 0;
        return p;
      }
    }
    return null;
  }

  function boom(s, x, y, r, dmg) {
    ev(s, EV.BOOM, x, y, r);
    const E = s.en;
    for (let i = 0; i < MAX_EN; i++) {
      const e = E[i];
      if (!e.a) continue;
      const dx = e.x - x, dy = e.y - y, rr = r + e.r, q = dx * dx + dy * dy;
      if (q < rr * rr) { const d = Math.sqrt(q) || 1; damageEnemy(s, e, dmg, dx / d, dy / d, 160); }
    }
  }

  // ---------------------------------------------------------------- weapons
  function fireBlaster(s, w) {
    const h = s.hero, st = WSTAT.blaster, i = w.lv - 1;
    const e = nearest(s, h.x, h.y, 380, 0);
    if (!e) return false;
    const n = st.n[i], base = Math.atan2(e.y - h.y, e.x - h.x);
    for (let k = 0; k < n; k++) {
      const a = base + (k - (n - 1) / 2) * 0.16;
      spawnProj(s, 0, h.x, h.y, Math.cos(a) * 340, Math.sin(a) * 340, st.dmg[i] * s.dmgMul, 4, 1.3, st.pierce[i]);
    }
    ev(s, EV.SHOOT, h.x, h.y, 0);
    return true;
  }
  function fireBounce(s, w) {
    const h = s.hero, st = WSTAT.bounce, i = w.lv - 1;
    const e = nearest(s, h.x, h.y, 380, 0);
    if (!e) return false;
    for (let k = 0; k < st.n[i]; k++) {
      const t = k === 0 ? e : (nearest(s, h.x, h.y, 380, e.id) || e);
      const a = Math.atan2(t.y - h.y, t.x - h.x);
      const p = spawnProj(s, 1, h.x, h.y, Math.cos(a) * 420, Math.sin(a) * 420, st.dmg[i] * s.dmgMul, 5, 2.5, 0);
      if (p) p.bn = st.bounces[i];
    }
    ev(s, EV.SHOOT, h.x, h.y, 1);
    return true;
  }
  function fireMine(s, w) {
    const h = s.hero, st = WSTAT.mine, i = w.lv - 1;
    let free = null, cnt = 0;
    for (let k = 0; k < MAX_MINE; k++) { const m = s.mines[k]; if (m.a) cnt++; else if (!free) free = m; }
    if (!free || cnt >= st.max[i]) return false;
    free.a = true; free.x = h.x; free.y = h.y; free.arm = 0.4; free.life = 14; free.rad = st.rad[i]; free.dmg = st.dmg[i] * s.dmgMul;
    ev(s, EV.MINE, h.x, h.y, 0);
    return true;
  }
  function fireChain(s, w) {
    const h = s.hero, st = WSTAT.chain, i = w.lv - 1;
    let e = nearest(s, h.x, h.y, 260, 0);
    if (!e) return false;
    let b = null;
    for (let k = 0; k < MAX_BOLT; k++) if (!s.bolts[k].a) { b = s.bolts[k]; break; }
    if (b) { b.a = true; b.t = 0.14; b.n = 0; b.px[0] = h.x; b.py[0] = h.y; b.n = 1; }
    let dmg = st.dmg[i] * s.dmgMul, n = 0;
    const ids = s.chainIds;
    for (let j = 0; j <= st.jumps[i] && e; j++) {
      const x = e.x, y = e.y;
      if (b && b.n < 12) { b.px[b.n] = x; b.py[b.n] = y; b.n++; }
      ids[n++] = e.id;
      damageEnemy(s, e, dmg, 0, 0, 0);
      dmg *= 0.88;
      e = nearestNotIn(s, x, y, 120, ids, n);
    }
    ev(s, EV.ZAP, h.x, h.y, 0);
    return true;
  }
  function fireMissile(s, w) {
    const h = s.hero, st = WSTAT.missile, i = w.lv - 1;
    let any = false;
    for (let k = 0; k < st.n[i]; k++) {
      const e = randomNear(s, h.x, h.y, 420);
      if (!e) break;
      const a = Math.atan2(e.y - h.y, e.x - h.x) + (s.rng() - 0.5) * 1.6;
      const p = spawnProj(s, 2, h.x, h.y, Math.cos(a) * 130, Math.sin(a) * 130, st.dmg[i] * s.dmgMul, 5, 3.2, 0);
      if (p) { p.ti = -1; p.rad = st.rad[i]; any = true; }
    }
    if (any) ev(s, EV.SHOOT, h.x, h.y, 2);
    return any;
  }
  const FIRE = { blaster: fireBlaster, bounce: fireBounce, mine: fireMine, chain: fireChain, missile: fireMissile };

  function updateOrbit(s, w, dt) {
    const h = s.hero, st = WSTAT.orbit, i = w.lv - 1, n = st.n[i];
    s.droneN = n;
    const E = s.en, dmg = st.dmg[i] * s.dmgMul;
    for (let k = 0; k < n; k++) {
      const a = s.t * st.spd[i] + k * 6.2832 / n, d = s.drones[k];
      d.x = h.x + Math.cos(a) * st.R[i]; d.y = h.y + Math.sin(a) * st.R[i];
      for (let j = 0; j < MAX_EN; j++) {
        const e = E[j];
        if (!e.a || s.t - e.oh < 0.35) continue;
        const dx = e.x - d.x, dy = e.y - d.y, rr = e.r + 9;
        if (dx * dx + dy * dy < rr * rr) {
          e.oh = s.t;
          const m = Math.sqrt(dx * dx + dy * dy) || 1;
          damageEnemy(s, e, dmg, dx / m, dy / m, 220);
        }
      }
    }
  }

  function updateWeapons(s, dt) {
    s.droneN = 0;
    for (let i = 0; i < s.weapons.length; i++) {
      const w = s.weapons[i];
      if (w.id === 'orbit') { updateOrbit(s, w, dt); continue; }
      w.cd -= dt;
      if (w.cd > 0) continue;
      const ok = FIRE[w.id](s, w);
      w.cd = ok ? WSTAT[w.id].cd[w.lv - 1] * s.cdMul : 0.12;
    }
  }

  function updateProjectiles(s, dt) {
    const P = s.pr, E = s.en, h = s.hero;
    for (let i = 0; i < MAX_PR; i++) {
      const p = P[i];
      if (!p.a) continue;
      p.life -= dt;
      if (p.life <= 0) { p.a = false; if (p.k === 2) boom(s, p.x, p.y, p.rad, p.dmg); continue; }
      if (p.k === 2) {                              // homing missile
        let t = p.ti >= 0 ? E[p.ti] : null;
        if (!t || !t.a || t.id !== p.tid) {
          t = nearest(s, p.x, p.y, 500, 0);
          if (t) { p.ti = E.indexOf(t); p.tid = t.id; } else p.ti = -1;
        }
        let ang = Math.atan2(p.vy, p.vx);
        if (t) {
          let diff = Math.atan2(t.y - p.y, t.x - p.x) - ang;
          while (diff > Math.PI) diff -= 6.2832;
          while (diff < -Math.PI) diff += 6.2832;
          const lim = 4.2 * dt;
          ang += diff > lim ? lim : (diff < -lim ? -lim : diff);
        }
        const sp = Math.min(250, Math.sqrt(p.vx * p.vx + p.vy * p.vy) + 260 * dt);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const fx = p.x - h.x, fy = p.y - h.y;
      if (fx * fx + fy * fy > 640000) { p.a = false; continue; }
      for (let j = 0; j < MAX_EN; j++) {
        const e = E[j];
        if (!e.a || e.id === p.h1 || e.id === p.h2) continue;
        const dx = e.x - p.x, dy = e.y - p.y, rr = e.r + p.r;
        if (dx * dx + dy * dy >= rr * rr) continue;
        const m = Math.sqrt(dx * dx + dy * dy) || 1;
        if (p.k === 0) {
          damageEnemy(s, e, p.dmg, p.vx / 340, p.vy / 340, 120);
          p.h2 = p.h1; p.h1 = e.id;
          if (--p.pierce < 0) p.a = false;
        } else if (p.k === 1) {
          const eid = e.id;
          damageEnemy(s, e, p.dmg, dx / m, dy / m, 120);
          p.h2 = p.h1; p.h1 = eid;
          const nx = nearest(s, e.x, e.y, 260, eid);
          if (--p.bn < 0 || !nx) p.a = false;
          else {
            const a = Math.atan2(nx.y - p.y, nx.x - p.x);
            p.vx = Math.cos(a) * 420; p.vy = Math.sin(a) * 420; p.life = Math.max(p.life, 1.2);
          }
        } else {
          p.a = false; boom(s, p.x, p.y, p.rad, p.dmg);
        }
        break;
      }
    }
  }

  function updateMines(s, dt) {
    const E = s.en;
    let cnt = 0;
    for (let i = 0; i < MAX_MINE; i++) {
      const m = s.mines[i];
      if (!m.a) continue;
      m.life -= dt; m.arm -= dt;
      let trig = m.life <= 0;
      if (!trig && m.arm <= 0) {
        for (let j = 0; j < MAX_EN; j++) {
          const e = E[j];
          if (!e.a) continue;
          const dx = e.x - m.x, dy = e.y - m.y, rr = e.r + 20;
          if (dx * dx + dy * dy < rr * rr) { trig = true; break; }
        }
      }
      if (trig) { m.a = false; boom(s, m.x, m.y, m.rad, m.dmg); } else cnt++;
    }
    s.mineCount = cnt;
    for (let i = 0; i < MAX_BOLT; i++) { const b = s.bolts[i]; if (b.a && (b.t -= dt) <= 0) b.a = false; }
  }

  function updateEnemyBullets(s, dt) {
    const h = s.hero;
    for (let i = 0; i < MAX_EB; i++) {
      const b = s.eb[i];
      if (!b.a) continue;
      b.life -= dt;
      if (b.life <= 0) { b.a = false; continue; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      const dx = h.x - b.x, dy = h.y - b.y, rr = h.r + 5;
      if (dx * dx + dy * dy < rr * rr) { b.a = false; hurtHero(s, b.dmg); }
    }
  }

  function updateGems(s, dt) {
    const h = s.hero, G2 = s.gems, mr2 = h.magnet * h.magnet;
    for (let i = 0; i < MAX_GEM; i++) {
      const g = G2[i];
      if (!g.a) continue;
      const dx = h.x - g.x, dy = h.y - g.y, d2 = dx * dx + dy * dy;
      if (!g.m && d2 < mr2) g.m = true;
      if (g.m) {
        g.sp = Math.min(g.sp + 1100 * dt, 560);
        const d = Math.sqrt(d2) || 1, step = g.sp * dt;
        if (d <= step + 8) { collect(s, g); continue; }
        g.x += dx / d * step; g.y += dy / d * step;
      } else if (d2 < 196) { collect(s, g); }
    }
  }
  function collect(s, g) {
    g.a = false;
    if (g.k <= 2) { addXp(s, g.v * s.xpMul); ev(s, EV.GEM, g.x, g.y, g.k); }
    else if (g.k === 3) { s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + s.hero.maxHp * 0.15); ev(s, EV.HEAL, g.x, g.y, 0); }
    else if (g.k === 4) { s.coinsCollected += g.v; ev(s, EV.COIN, g.x, g.y, 0); }
    else { for (let i = 0; i < MAX_GEM; i++) if (s.gems[i].a) s.gems[i].m = true; ev(s, EV.GEM, g.x, g.y, 5); }
  }

  // ---------------------------------------------------------------- main step
  function update(s, dt) {
    if (s.over || s.dead || s.choices) return;
    s.t += dt;
    const m = s.t / 60, h = s.hero;
    s.hpMul = 1 + 0.40 * m + 0.04 * m * m;
    s.spdMul = Math.min(1.6, 1 + 0.035 * m);
    s.dmgMulE = 1 + 0.12 * m;
    s.gemMul = 1 + 0.1 * m;

    const mag = Math.sqrt(s.inx * s.inx + s.iny * s.iny);
    if (mag > 0.05) { h.x += s.inx * h.speed * dt; h.y += s.iny * h.speed * dt; h.fx = s.inx / mag; h.fy = s.iny / mag; }
    if (h.iframes > 0) h.iframes -= dt;
    if (h.regen > 0 && h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + h.regen * dt);

    director(s, dt);
    updateEnemies(s, dt);
    updateWeapons(s, dt);
    updateProjectiles(s, dt);
    updateMines(s, dt);
    updateEnemyBullets(s, dt);
    updateGems(s, dt);

    if (!s.dead && s.t >= WIN_TIME) {
      s.won = true; s.over = true; ev(s, EV.WIN, h.x, h.y, 0);
    }
    if (s.lvlPending > 0 && !s.choices && !s.dead && !s.over) genChoices(s);
  }

  function revive(s) {
    if (!s.dead || s.revived || s.over) return false;
    const h = s.hero;
    s.revived = true; s.dead = false;
    h.hp = h.maxHp * 0.6; h.iframes = 2.5;
    for (let i = 0; i < MAX_EN; i++) {
      const e = s.en[i];
      if (!e.a || e.type === T_BOSS) continue;
      const dx = e.x - h.x, dy = e.y - h.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 280) { e.kx += dx / d * 600; e.ky += dy / d * 600; }
    }
    for (let i = 0; i < MAX_EB; i++) s.eb[i].a = false;
    ev(s, EV.REVIVE, h.x, h.y, 0);
    return true;
  }

  function finish(s) { s.over = true; }
  function result(s) {
    return { time: s.t, kills: s.kills, level: s.level, coinsCollected: s.coinsCollected, bossKills: s.bossKills, won: s.won };
  }

  // Debug: fill the screen with enemies (used by the stress toggle in the FPS overlay).
  function setStress(s, on) {
    s.stress = !!on;
    if (!on) return;
    for (let i = 0; i < MAX_ALIVE && s.enCount < MAX_ALIVE; i++) spawnRing1(s, i % 4 === 3 ? T_BRUTE : (i % 3));
  }

  // ---------------------------------------------------------------- bots (balance sims + smoke test)
  function botInput(s) {
    const h = s.hero, E = s.en;
    let fx = 0, fy = 0, close = 0;
    for (let i = 0; i < MAX_EN; i++) {
      const e = E[i];
      if (!e.a) continue;
      const dx = h.x - e.x, dy = h.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 < 22500) {
        const d = Math.sqrt(d2) || 1, w = 1 / (d + 8);
        fx += dx / d * w; fy += dy / d * w; close++;
      }
    }
    for (let i = 0; i < MAX_EB; i++) {
      const b = s.eb[i];
      if (!b.a) continue;
      const dx = h.x - b.x, dy = h.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 < 6400) { const d = Math.sqrt(d2) || 1; fx += dx / d * 2 / (d + 8); fy += dy / d * 2 / (d + 8); }
    }
    let gx = 0, gy = 0, gd = 40000;
    for (let i = 0; i < MAX_GEM; i++) {
      const g = s.gems[i];
      if (!g.a || g.k === 5) continue;
      const dx = g.x - h.x, dy = g.y - h.y, d2 = dx * dx + dy * dy;
      if (d2 < gd) { gd = d2; gx = dx; gy = dy; }
    }
    let x = 0, y = 0;
    const fm = Math.sqrt(fx * fx + fy * fy);
    if (fm > 0.004 && close > 0) {
      x = fx / fm; y = fy / fm;
      const c = 0.45, sn = 0.89;                    // rotate so the bot circles instead of running in a line
      const rx = x * sn - y * c, ry = x * c + y * sn;
      x = rx; y = ry;
      if (gd < 3600) { const gm = Math.sqrt(gd) || 1; x += gx / gm * 0.5; y += gy / gm * 0.5; }
    } else if (gd < 40000) {
      const gm = Math.sqrt(gd) || 1; x = gx / gm; y = gy / gm;
    } else { x = Math.cos(s.t * 0.5); y = Math.sin(s.t * 0.5); }
    setInput(s, x, y);
  }
  function botPick(s) {
    let best = 0, bs = -1;
    for (let i = 0; i < s.choices.length; i++) {
      const c = s.choices[i];
      const sc = (c.k === 'w' ? 3 : c.k === 'p' ? 2 : 1) + s.rng();
      if (sc > bs) { bs = sc; best = i; }
    }
    return best;
  }

  const Core = {
    create: create, update: update, setView: setView, setInput: setInput,
    applyChoice: applyChoice, reroll: reroll, revive: revive, finish: finish, result: result, setStress: setStress,
    botInput: botInput, botPick: botPick, xpFor: xpFor, getWeapon: getWeapon,
    EV: EV, ETYPES: ETYPES, WSTAT: WSTAT, WEAPONS: WEAPONS, PASSIVES: PASSIVES,
    WIN_TIME: WIN_TIME, BOSS_TIMES: BOSS_TIMES, MAX_ALIVE: MAX_ALIVE,
    MAX_EN: MAX_EN, MAX_PR: MAX_PR, MAX_GEM: MAX_GEM, MAX_EB: MAX_EB, MAX_MINE: MAX_MINE, MAX_BOLT: MAX_BOLT,
    T_GRUNT: T_GRUNT, T_SWARM: T_SWARM, T_DASH: T_DASH, T_BRUTE: T_BRUTE, T_BOSS: T_BOSS
  };
  NS.Core = Core;
  if (typeof module !== 'undefined') module.exports = Core;
})();
