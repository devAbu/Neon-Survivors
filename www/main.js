// Neon Survivors - rendering, input, screens. Everything is drawn on one canvas (portrait, one-handed).
// World unit == UI unit: the screen is always 400 units wide; height follows the phone's aspect ratio.
(function () {
  'use strict';
  const NS = globalThis.NS;
  const T = NS.T, Store = NS.Store, Ad = NS.Ad, Meta = NS.Meta, C = NS.Core, A = NS.Audio, EV = C.EV;

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { alpha: false });
  const VW = 400;
  let VH = 860, K = 1, cssW = 400, cssH = 860;
  const FONT = 'system-ui, -apple-system, Roboto, sans-serif';
  const COL = { cyan: '#19f0ff', mag: '#ff2bd6', yel: '#ffe94a', grn: '#5cff8a', org: '#ff8a2b', pur: '#9b5cff', red: '#ff3b5c', bg: '#07070f' };
  const WCOL = { blaster: COL.cyan, bounce: COL.yel, orbit: COL.grn, mine: COL.org, chain: '#b69cff', missile: '#ff6a8a' };
  const PCOL = '#ffd34a';

  // ------------------------------------------------------------------ app state
  let screen = 'menu';                    // menu | upgrades | settings | play | result
  let s = null;                           // core state while playing
  let paused = false;
  let joy = null;                         // { id, ox, oy, cx, cy }
  let lockUntil = 0;                      // ignore taps briefly after an overlay opens
  let toast = null;                       // { text, t }
  let reward = 0, doubled = false;        // result screen
  let tutMove = 0;                        // seconds the player has steered (tutorial hint)
  let warnT = 0, shake = 0, redFlash = 0;
  let lowQ = false, slowFrames = 0;
  let prevChoices = false, prevDead = false;
  const keys = {};
  let btns = [];

  // ------------------------------------------------------------------ canvas sizing + sprites
  const SP = {};
  function resize() {
    cssW = window.innerWidth || 400; cssH = window.innerHeight || 860;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pxW = Math.min(Math.round(cssW * dpr), 810);       // cap resolution: cheaper on weak phones
    canvas.width = pxW;
    canvas.height = Math.round(cssH * pxW / cssW);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    K = canvas.width / VW; VH = canvas.height / K;
    if (s) C.setView(s, VW, VH);
    buildSprites();
  }

  function mk(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * K)); c.height = Math.max(1, Math.ceil(h * K));
    const g = c.getContext('2d');
    g.scale(K, K); g.translate(w / 2, h / 2);
    fn(g);
    return { c: c, w: w, h: h };
  }
  function poly(g, n, r, rot) {
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + i * 6.2832 / n, x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  }
  function dot(color, r, blur) {
    const sz = r * 2 + blur * 2 + 2;
    return mk(sz, sz, function (g) {
      g.shadowColor = color; g.shadowBlur = blur; g.fillStyle = color;
      g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
      g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.8;
      g.beginPath(); g.arc(0, 0, r * 0.45, 0, 6.2832); g.fill();
    });
  }

  const ECOL = [COL.mag, COL.grn, COL.org, COL.pur];
  const EFILL = ['rgba(255,43,214,0.28)', 'rgba(92,255,138,0.28)', 'rgba(255,138,43,0.28)', 'rgba(155,92,255,0.3)'];

  function buildSprites() {
    SP.en = [];
    for (let t = 0; t < 4; t++) {
      const r = C.ETYPES[t].r, sz = r * 2 + 16, pair = [];
      for (let f = 0; f < 2; f++) {
        pair.push(mk(sz, sz, function (g) {
          g.shadowColor = f ? '#fff' : ECOL[t]; g.shadowBlur = 8;
          g.lineWidth = 2; g.strokeStyle = f ? '#fff' : ECOL[t]; g.fillStyle = f ? '#fff' : EFILL[t];
          if (t === 0) poly(g, 6, r, 0);
          else if (t === 1) poly(g, 3, r + 1, -1.5708);
          else if (t === 2) poly(g, 4, r + 2, 0);
          else poly(g, 8, r, 0.3927);
          g.fill(); g.stroke();
          if (t === 3) { g.shadowBlur = 0; poly(g, 4, r * 0.5, 0.78); g.stroke(); }
          if (t === 0) { g.shadowBlur = 0; g.fillStyle = f ? '#fff' : ECOL[t]; g.beginPath(); g.arc(0, 0, 2.5, 0, 6.2832); g.fill(); }
        }));
      }
      SP.en.push(pair);
    }
    SP.boss = [0, 1].map(function (f) {
      return mk(130, 130, function (g) {
        g.shadowColor = f ? '#fff' : COL.red; g.shadowBlur = 16; g.lineWidth = 3;
        g.strokeStyle = f ? '#fff' : COL.red; g.fillStyle = f ? '#fff' : 'rgba(255,59,92,0.25)';
        poly(g, 6, 48, 0); g.fill(); g.stroke();
        g.shadowBlur = 0; g.lineWidth = 2; poly(g, 6, 30, 0.5236); g.stroke();
        g.fillStyle = f ? '#fff' : COL.red; g.beginPath(); g.arc(0, 0, 10, 0, 6.2832); g.fill();
      });
    });
    SP.hero = mk(40, 40, function (g) {
      g.shadowColor = COL.cyan; g.shadowBlur = 10; g.lineWidth = 2; g.strokeStyle = '#d8fbff'; g.fillStyle = 'rgba(25,240,255,0.85)';
      g.beginPath(); g.moveTo(0, -13); g.lineTo(10, 11); g.lineTo(0, 6); g.lineTo(-10, 11); g.closePath(); g.fill(); g.stroke();
    });
    SP.bullet = dot(COL.cyan, 3.5, 6);
    SP.bolt = dot(COL.yel, 4.5, 7);
    SP.missile = dot('#ff6a8a', 4.5, 7);
    SP.ebul = dot(COL.red, 4.5, 6);
    SP.gem = [dot('#4aa8ff', 4, 5), dot(COL.grn, 5, 6), dot(COL.pur, 6.5, 8), dot('#ff7ab8', 5.5, 6), dot(COL.yel, 4.5, 5), dot('#ffffff', 6, 9)];
    SP.drone = mk(26, 26, function (g) {
      g.shadowColor = COL.grn; g.shadowBlur = 8; g.lineWidth = 2; g.strokeStyle = COL.grn; g.fillStyle = 'rgba(92,255,138,0.35)';
      poly(g, 4, 8, 0); g.fill(); g.stroke();
    });
    SP.mine = mk(26, 26, function (g) {
      g.shadowColor = COL.org; g.shadowBlur = 8; g.lineWidth = 2; g.strokeStyle = COL.org; g.fillStyle = 'rgba(255,138,43,0.35)';
      g.beginPath(); g.arc(0, 0, 6, 0, 6.2832); g.fill(); g.stroke();
      for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.785; g.beginPath(); g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); g.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); g.stroke(); }
    });
    SP.spark = [dot(COL.cyan, 2.5, 3), dot(COL.mag, 2.5, 3), dot(COL.yel, 2.5, 3), dot('#ffffff', 2.5, 3)];
    // vignette (drawn once per frame as an image)
    SP.vig = mk(VW, VH, function (g) {
      g.translate(-VW / 2, -VH / 2);
      const gr = g.createRadialGradient(VW / 2, VH / 2, VH * 0.25, VW / 2, VH / 2, VH * 0.75);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
    });
    SP.title = mk(360, 170, function (g) {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = COL.cyan; g.shadowBlur = 22; g.fillStyle = COL.cyan; g.font = 'bold 76px ' + FONT;
      g.fillText(T.s('title1'), 0, -34);
      g.shadowColor = COL.mag; g.fillStyle = COL.mag; g.font = 'bold 46px ' + FONT;
      g.fillText(T.s('title2'), 0, 34);
    });
  }

  // ------------------------------------------------------------------ particles (pooled)
  const NP = 160, NR = 14;
  const P = { x: new Float32Array(NP), y: new Float32Array(NP), vx: new Float32Array(NP), vy: new Float32Array(NP), life: new Float32Array(NP), max: new Float32Array(NP), c: new Uint8Array(NP), hint: 0 };
  const R = { x: new Float32Array(NR), y: new Float32Array(NR), r: new Float32Array(NR), mr: new Float32Array(NR), life: new Float32Array(NR), c: new Uint8Array(NR), hint: 0 };
  function spark(x, y, n, c, sp) {
    if (lowQ) n = (n + 1) >> 1;
    for (let k = 0; k < n; k++) {
      const i = P.hint = (P.hint + 1) % NP;
      const a = Math.random() * 6.2832, v = (0.4 + Math.random()) * sp;
      P.x[i] = x; P.y[i] = y; P.vx[i] = Math.cos(a) * v; P.vy[i] = Math.sin(a) * v;
      P.max[i] = P.life[i] = 0.25 + Math.random() * 0.25; P.c[i] = c;
    }
  }
  function ring(x, y, mr, c) {
    const i = R.hint = (R.hint + 1) % NR;
    R.x[i] = x; R.y[i] = y; R.r[i] = 4; R.mr[i] = mr; R.life[i] = 0.35; R.c[i] = c;
  }
  function fxUpdate(dt) {
    for (let i = 0; i < NP; i++) {
      if (P.life[i] <= 0) continue;
      P.life[i] -= dt; P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
    }
    for (let i = 0; i < NR; i++) {
      if (R.life[i] <= 0) continue;
      R.life[i] -= dt; R.r[i] += (R.mr[i] - R.r[i]) * Math.min(1, dt * 14);
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 30);
    if (redFlash > 0) redFlash = Math.max(0, redFlash - dt * 2.5);
    if (warnT > 0) warnT -= dt;
    if (toast && (toast.t -= dt) <= 0) toast = null;
  }
  function fxClear() { P.life.fill(0); R.life.fill(0); shake = 0; redFlash = 0; warnT = 0; }

  function onEv(c, x, y, a) {
    switch (c) {
      case EV.SHOOT: A.sfx(a === 2 ? 'missile' : 'shoot'); break;
      case EV.ZAP: A.sfx('zap'); break;
      case EV.HIT: spark(x, y, 1, 3, 70); A.sfx('hit'); break;
      case EV.KILL: spark(x, y, 4, a === 1 ? 0 : (a === 0 ? 1 : 2), 110); A.sfx('kill'); break;
      case EV.GEM: A.sfx('gem'); break;
      case EV.COIN: A.sfx('coin'); break;
      case EV.HEAL: A.sfx('heal'); break;
      case EV.BOOM: ring(x, y, a, 2); A.sfx('boom'); break;
      case EV.MINE: A.sfx('mine'); break;
      case EV.HURT: shake = 8; redFlash = 0.45; A.sfx('hurt'); A.vibrate(40); break;
      case EV.LEVEL: A.sfx('level'); break;
      case EV.BOSS_WARN: warnT = 3; A.sfx('warn'); A.vibrate(120); break;
      case EV.BOSS_SPAWN: shake = 10; break;
      case EV.BOSS_SHOT: A.sfx('boom'); break;
      case EV.BOSS_DIE: ring(x, y, 160, 1); shake = 14; A.sfx('bossdie'); A.vibrate(250); spark(x, y, 24, 1, 220); break;
      case EV.WIN: A.sfx('win'); A.vibrate(200); break;
      case EV.DEAD: A.sfx('lose'); A.vibrate(250); break;
      case EV.REVIVE: ring(x, y, 280, 0); A.sfx('level'); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ flow
  function startGame() {
    s = C.create({ mods: Meta.mods(Store.data.meta) });
    C.setView(s, VW, VH);
    s.onEvent = onEv;
    screen = 'play'; paused = false; joy = null; tutMove = 0;
    prevChoices = false; prevDead = false; fxClear();
    A.setMode('play');
  }
  function toResult() {
    const r = C.result(s);
    reward = Meta.runReward(r); doubled = false;
    Store.addCoins(reward);
    Store.recordRun(r.time, r.kills, r.level);
    screen = 'result'; joy = null; paused = false;
    lockUntil = performance.now() + 500;
    A.setMode('menu');
  }
  function goMenu() { screen = 'menu'; s = null; joy = null; paused = false; A.setMode('menu'); }
  function say(text) { toast = { text: text, t: 1.8 }; }
  function fmt(t) { t = Math.floor(t); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }

  function runAd(placement, onReward) {
    Ad.show(placement).then(function (ok) { if (ok) onReward(); });
  }

  function click(id) {
    A.sfx('click');
    if (id === 'play' || id === 'again') startGame();
    else if (id === 'upgrades') screen = 'upgrades';
    else if (id === 'settings') screen = 'settings';
    else if (id === 'back') screen = 'menu';
    else if (id === 'menu' || id === 'quit') goMenu();
    else if (id === 'pause') { paused = true; joy = null; if (s) C.setInput(s, 0, 0); A.pause(true); }
    else if (id === 'resume') { paused = false; A.pause(false); }
    else if (id.indexOf('buy:') === 0) {
      if (!Meta.buy(Store, id.slice(4))) say(T.s('coins'));
    } else if (id.indexOf('set:') === 0) {
      const k = id.slice(4);
      Store.data.settings[k] = !Store.data.settings[k]; Store.save();
      A.configure(Store.data.settings);
    } else if (id.indexOf('pick:') === 0) {
      C.applyChoice(s, +id.slice(5));
      lockUntil = performance.now() + 250;
    } else if (id === 'reroll') runAd('reroll', function () { if (s && s.choices) { C.reroll(s); lockUntil = performance.now() + 300; } });
    else if (id === 'revive') runAd('revive', function () { if (s && s.dead && C.revive(s)) { lockUntil = performance.now() + 300; } });
    else if (id === 'giveup') C.finish(s);
    else if (id === 'double') runAd('double', function () { if (screen === 'result' && !doubled) { doubled = true; Store.addCoins(reward); say(T.f('bonus_got', reward)); } });
    else if (id === 'bonus') runAd('bonus', function () { Store.addCoins(50); say(T.f('bonus_got', 50)); });
    else if (id === 'fps') { if (s) C.setStress(s, !s.stress); }
  }

  // ------------------------------------------------------------------ input
  function toUI(e) {
    const r = canvas.getBoundingClientRect();
    const w = r.width || cssW, h = r.height || cssH;
    return { x: (e.clientX - (r.left || 0)) / w * VW, y: (e.clientY - (r.top || 0)) / h * VH };
  }
  function overlayOpen() { return !!s && (paused || s.choices || s.dead); }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.preventDefault) e.preventDefault();
    A.unlock();
    const p = toUI(e), now = performance.now();
    if (now >= lockUntil) {
      for (let i = btns.length - 1; i >= 0; i--) {
        const b = btns[i];
        if (!b.off && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { click(b.id); return; }
      }
    }
    if (screen === 'play' && !overlayOpen() && !joy) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      joy = { id: e.pointerId, ox: p.x, oy: p.y, cx: p.x, cy: p.y };
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!joy || e.pointerId !== joy.id) return;
    const p = toUI(e);
    joy.cx = p.x; joy.cy = p.y;
    const dx = p.x - joy.ox, dy = p.y - joy.oy, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 55) { const k = (d - 55) / d; joy.ox += dx * k; joy.oy += dy * k; }   // floating stick follows the finger
  });
  function release(e) {
    if (joy && e.pointerId === joy.id) { joy = null; if (s) C.setInput(s, 0, 0); }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  window.addEventListener('keydown', function (e) { keys[e.key] = true; });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (screen === 'play' && !paused && s && !s.over) click('pause'); else A.pause(true); }
    else if (!paused) A.pause(false);
  });
  window.addEventListener('resize', resize);

  function steer() {
    if (!s || overlayOpen()) return;
    let x = 0, y = 0;
    if (joy) {
      x = (joy.cx - joy.ox) / 45; y = (joy.cy - joy.oy) / 45;
    } else {
      if (keys.ArrowLeft || keys.a) x -= 1;
      if (keys.ArrowRight || keys.d) x += 1;
      if (keys.ArrowUp || keys.w) y -= 1;
      if (keys.ArrowDown || keys.s) y += 1;
    }
    C.setInput(s, x, y);
    const m = Math.sqrt(s.inx * s.inx + s.iny * s.iny);
    if (m > 0.3 && !Store.data.tutorialDone) {
      tutMove += 1 / 60;
      if (tutMove > 1.5) { Store.data.tutorialDone = true; Store.save(); }
    }
  }

  // ------------------------------------------------------------------ drawing helpers
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function txt(str, x, y, size, color, align, bold) {
    ctx.font = (bold === false ? '' : 'bold ') + size + 'px ' + FONT;
    ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }
  const wrapCache = {};
  function wrap(str, maxW, size) {
    const key = str + '|' + maxW + '|' + size;
    if (wrapCache[key]) return wrapCache[key];
    ctx.font = size + 'px ' + FONT;
    const words = str.split(' '), lines = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const t = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = t;
    }
    if (cur) lines.push(cur);
    return (wrapCache[key] = lines);
  }
  function button(id, x, y, w, h, label, color, opt) {
    opt = opt || {};
    const off = !!opt.off;
    btns.push({ id: id, x: x, y: y, w: w, h: h, off: off });
    const c = off ? '#4a4a60' : color;
    rr(x, y, w, h, 12); ctx.fillStyle = 'rgba(12,12,28,0.88)'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = off ? 'rgba(80,80,100,0.12)' : hexA(c, 0.22); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.stroke();
    txt(label, x + w / 2, y + h / 2 + (opt.sub ? -8 : 1), opt.size || 22, off ? '#7a7a92' : '#fff');
    if (opt.sub) txt(opt.sub, x + w / 2, y + h / 2 + 15, 13, off ? '#666680' : c, 'center', false);
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function adButton(id, placement, x, y, w, h, labelKey, color) {
    const st = Ad.status(placement);
    let label = T.s(labelKey), off = false;
    if (st.s === 'playing') { label = T.f('ad_wait', st.left); off = true; }
    else if (st.s === 'cooldown') { label = T.f('ad_cooldown', st.left); off = true; }
    button(id, x, y, w, h, label, color, { off: off, size: 18 });
  }

  function drawGrid(cx, cy, step, alpha) {
    const ox = -(((cx % step) + step) % step), oy = -(((cy % step) + step) % step);
    ctx.beginPath();
    for (let x = ox; x <= VW; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, VH); }
    for (let y = oy; y <= VH; y += step) { ctx.moveTo(0, y); ctx.lineTo(VW, y); }
    ctx.strokeStyle = 'rgba(70,100,255,' + alpha + ')'; ctx.lineWidth = 1; ctx.stroke();
  }
  function bgPlain() { ctx.setTransform(K, 0, 0, K, 0, 0); ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, VW, VH); }

  // ------------------------------------------------------------------ icons for level-up cards
  function icon(id, x, y, r, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (id) {
      case 'blaster': ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(-r * 0.6, -r * 0.5); ctx.lineTo(r * 0.8, -r * 0.5); ctx.moveTo(-r * 0.6, r * 0.5); ctx.lineTo(r * 0.8, r * 0.5); ctx.stroke(); break;
      case 'bounce': ctx.moveTo(-r, r * 0.7); ctx.lineTo(-r * 0.3, -r * 0.7); ctx.lineTo(r * 0.3, r * 0.7); ctx.lineTo(r, -r * 0.7); ctx.stroke(); break;
      case 'orbit': ctx.arc(0, 0, r * 0.35, 0, 6.2832); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 0.8, 0, 4, 0, 6.2832); ctx.arc(-r * 0.4, r * 0.7, 4, 0, 6.2832); ctx.arc(-r * 0.4, -r * 0.7, 4, 0, 6.2832); ctx.fill(); break;
      case 'mine': ctx.arc(0, 0, r * 0.45, 0, 6.2832); for (let i = 0; i < 8; i++) { const a = i * 0.785; ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); } ctx.stroke(); break;
      case 'chain': ctx.moveTo(r * 0.3, -r); ctx.lineTo(-r * 0.4, 0.1 * r); ctx.lineTo(r * 0.2, 0.1 * r); ctx.lineTo(-r * 0.3, r); ctx.stroke(); break;
      case 'missile': ctx.moveTo(r, 0); ctx.lineTo(-r * 0.5, -r * 0.5); ctx.lineTo(-r * 0.2, 0); ctx.lineTo(-r * 0.5, r * 0.5); ctx.closePath(); ctx.stroke(); break;
      case 'power': for (let i = 0; i < 10; i++) { const a = -1.5708 + i * 0.6283, q = i % 2 ? r * 0.45 : r; if (i) ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); else ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q); } ctx.closePath(); ctx.stroke(); break;
      case 'clock': ctx.arc(0, 0, r * 0.85, 0, 6.2832); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.55); ctx.moveTo(0, 0); ctx.lineTo(r * 0.4, r * 0.2); ctx.stroke(); break;
      case 'hull': ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, -r * 0.5); ctx.lineTo(r * 0.7, r * 0.3); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, r * 0.3); ctx.lineTo(-r * 0.8, -r * 0.5); ctx.closePath(); ctx.stroke(); break;
      case 'thrust': ctx.moveTo(-r * 0.7, r * 0.7); ctx.lineTo(0, 0); ctx.lineTo(-r * 0.7, -r * 0.7); ctx.moveTo(0, r * 0.7); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, -r * 0.7); ctx.stroke(); break;
      case 'coil': ctx.moveTo(-r * 0.7, -r); ctx.lineTo(-r * 0.7, r * 0.1); ctx.arc(0, r * 0.1, r * 0.7, Math.PI, 0, true); ctx.lineTo(r * 0.7, -r); ctx.stroke(); break;
      case 'repair': ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, r * 0.9); ctx.moveTo(-r * 0.9, 0); ctx.lineTo(r * 0.9, 0); ctx.stroke(); break;
      default: ctx.arc(0, 0, r * 0.6, 0, 6.2832); ctx.stroke(); break;
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ world rendering
  const stat = { fps: 60, upd: 0, drw: 0, nE: 0, nP: 0 };

  function drawWorld(t) {
    const h = s.hero;
    let cx = h.x - VW / 2, cy = h.y - VH / 2;
    if (shake > 0) { cx += (Math.random() - 0.5) * shake; cy += (Math.random() - 0.5) * shake; }
    bgPlain();
    drawGrid(cx, cy, 64, 0.13);
    if (!lowQ) drawGrid(cx * 0.5 + 32, cy * 0.5 + 32, 32, 0.045);
    ctx.setTransform(K, 0, 0, K, -cx * K, -cy * K);
    const L = cx - 50, Rr = cx + VW + 50, Tt = cy - 50, B = cy + VH + 50;

    // gems
    const gems = s.gems;
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i];
      if (!g.a || g.x < L || g.x > Rr || g.y < Tt || g.y > B) continue;
      const sp = SP.gem[g.k];
      ctx.drawImage(sp.c, g.x - sp.w / 2, g.y - sp.h / 2, sp.w, sp.h);
    }
    // mines
    const mines = s.mines;
    for (let i = 0; i < mines.length; i++) {
      const m = mines[i];
      if (!m.a) continue;
      ctx.drawImage(SP.mine.c, m.x - 13, m.y - 13, 26, 26);
      if (m.arm <= 0) {
        ctx.beginPath(); ctx.arc(m.x, m.y, m.rad * (0.55 + 0.05 * Math.sin(t * 6 + i)), 0, 6.2832);
        ctx.strokeStyle = 'rgba(255,138,43,0.2)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    // enemies
    const E = s.en;
    let nE = 0;
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      if (!e.a) continue;
      nE++;
      if (e.x < L || e.x > Rr || e.y < Tt || e.y > B) continue;
      if (e.type === C.T_BOSS) continue;
      const fl = (e.flash > 0 || (e.type === C.T_DASH && e.st === 1 && ((t * 16) & 1))) ? 1 : 0;
      const sp = SP.en[e.type][fl];
      ctx.drawImage(sp.c, e.x - sp.w / 2, e.y - sp.h / 2, sp.w, sp.h);
    }
    stat.nE = nE;
    const bo = s.boss;
    if (bo && bo.a) {
      if (bo.st === 1) {                                         // charge telegraph
        ctx.beginPath(); ctx.moveTo(bo.x, bo.y); ctx.lineTo(bo.x + bo.dx * 420, bo.y + bo.dy * 420);
        ctx.strokeStyle = 'rgba(255,59,92,' + (0.25 + 0.25 * Math.sin(t * 30)) + ')'; ctx.lineWidth = 10; ctx.stroke();
      }
      const sp = SP.boss[bo.flash > 0 ? 1 : 0];
      ctx.drawImage(sp.c, bo.x - sp.w / 2, bo.y - sp.h / 2, sp.w, sp.h);
      ctx.save(); ctx.translate(bo.x, bo.y); ctx.rotate(t * 1.2);
      ctx.beginPath(); ctx.arc(0, 0, 58, 0, 1.2); ctx.arc(0, 0, 58, 3.14, 4.34);
      ctx.strokeStyle = 'rgba(255,59,92,0.7)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    }
    // enemy bullets
    for (let i = 0; i < s.eb.length; i++) {
      const b = s.eb[i];
      if (b.a) ctx.drawImage(SP.ebul.c, b.x - SP.ebul.w / 2, b.y - SP.ebul.h / 2, SP.ebul.w, SP.ebul.h);
    }
    // player projectiles
    let nP = 0;
    for (let i = 0; i < s.pr.length; i++) {
      const p = s.pr[i];
      if (!p.a) continue;
      nP++;
      const sp = p.k === 0 ? SP.bullet : (p.k === 1 ? SP.bolt : SP.missile);
      ctx.drawImage(sp.c, p.x - sp.w / 2, p.y - sp.h / 2, sp.w, sp.h);
    }
    stat.nP = nP;
    // chain lightning
    for (let i = 0; i < s.bolts.length; i++) {
      const b = s.bolts[i];
      if (!b.a) continue;
      ctx.beginPath(); ctx.moveTo(b.px[0], b.py[0]);
      for (let k = 1; k < b.n; k++) {
        const mx = (b.px[k - 1] + b.px[k]) / 2 + (Math.random() - 0.5) * 14, my = (b.py[k - 1] + b.py[k]) / 2 + (Math.random() - 0.5) * 14;
        ctx.lineTo(mx, my); ctx.lineTo(b.px[k], b.py[k]);
      }
      ctx.strokeStyle = 'rgba(182,156,255,0.9)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }
    // drones
    for (let i = 0; i < s.droneN; i++) {
      const d = s.drones[i];
      ctx.drawImage(SP.drone.c, d.x - 13, d.y - 13, 26, 26);
    }
    // hero
    if (!(s.dead && !s.over)) {
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(Math.atan2(h.fy, h.fx) + 1.5708);
      if (h.iframes > 0 && ((t * 24) & 1)) ctx.globalAlpha = 0.45;
      ctx.drawImage(SP.hero.c, -20, -20, 40, 40);
      ctx.restore();
    }
    // particles + rings
    for (let i = 0; i < NP; i++) {
      if (P.life[i] <= 0) continue;
      const sp = SP.spark[P.c[i]];
      ctx.globalAlpha = P.life[i] / P.max[i];
      ctx.drawImage(sp.c, P.x[i] - sp.w / 2, P.y[i] - sp.h / 2, sp.w, sp.h);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < NR; i++) {
      if (R.life[i] <= 0) continue;
      ctx.beginPath(); ctx.arc(R.x[i], R.y[i], R.r[i], 0, 6.2832);
      ctx.strokeStyle = R.c[i] === 1 ? 'rgba(255,59,92,' + R.life[i] * 2.5 + ')' : (R.c[i] === 0 ? 'rgba(25,240,255,' + R.life[i] * 2.5 + ')' : 'rgba(255,170,60,' + R.life[i] * 2.5 + ')');
      ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.setTransform(K, 0, 0, K, 0, 0);
    if (!lowQ) ctx.drawImage(SP.vig.c, 0, 0, VW, VH);
    if (redFlash > 0) { ctx.fillStyle = 'rgba(255,0,60,' + redFlash * 0.35 + ')'; ctx.fillRect(0, 0, VW, VH); }
  }

  // ------------------------------------------------------------------ HUD + overlays
  function drawHud(t) {
    const h = s.hero;
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(0, 0, VW, 8);
    ctx.fillStyle = COL.cyan; ctx.fillRect(0, 0, VW * Math.min(1, s.xp / s.xpNeed), 8);
    txt(T.f('lvl', s.level), 10, 24, 14, COL.cyan, 'left');
    const hp = Math.max(0, h.hp / h.maxHp);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(10, 36, 150, 14, 7); ctx.fill();
    ctx.fillStyle = hp > 0.5 ? COL.grn : (hp > 0.25 ? COL.yel : COL.red); rr(10, 36, Math.max(6, 150 * hp), 14, 7); ctx.fill();
    txt(Math.ceil(h.hp) + '/' + h.maxHp, 85, 43.5, 11, '#001018');
    txt(T.f('hud_kills', s.kills), 12, 62, 12, '#b8c0ff', 'left');
    txt(T.f('hud_coins', s.coinsCollected), 12, 78, 12, COL.yel, 'left');
    txt(fmt(s.t), VW / 2, 26, 24, '#fff');
    // pause button
    btns.push({ id: 'pause', x: VW - 56, y: 14, w: 44, h: 44, off: false });
    rr(VW - 56, 14, 44, 44, 10); ctx.fillStyle = 'rgba(12,12,28,0.7)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(VW - 43, 27, 6, 18); ctx.fillRect(VW - 31, 27, 6, 18);
    const bo = s.boss;
    if (bo && bo.a) {
      const w = 280, x = (VW - w) / 2;
      txt(T.s('boss_name'), VW / 2, 98, 13, COL.red);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, 108, w, 10);
      ctx.fillStyle = COL.red; ctx.fillRect(x, 108, w * Math.max(0, bo.hp / bo.maxHp), 10);
    }
    if (warnT > 0) {
      const a = 0.35 + 0.35 * Math.sin(t * 14);
      ctx.strokeStyle = 'rgba(255,59,92,' + a + ')'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, VW - 10, VH - 10);
      txt(T.s('boss_warn'), VW / 2, VH * 0.3, 40, 'rgba(255,59,92,' + (0.6 + a) + ')');
    }
  }

  function drawJoystick(t) {
    if (joy) {
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 45, 0, 6.2832); ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2; ctx.stroke();
      let dx = joy.cx - joy.ox, dy = joy.cy - joy.oy; const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 45) { dx = dx / d * 45; dy = dy / d * 45; }
      ctx.beginPath(); ctx.arc(joy.ox + dx, joy.oy + dy, 20, 0, 6.2832); ctx.fillStyle = 'rgba(25,240,255,0.4)'; ctx.fill();
      return;
    }
    if (!Store.data.tutorialDone && !overlayOpen()) {          // animated hint, no text
      const bx = VW / 2, by = VH * 0.72, a = t * 2.4;
      ctx.beginPath(); ctx.arc(bx, by, 45, 0, 6.2832); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.stroke();
      const kx = bx + Math.cos(a) * 30, ky = by + Math.sin(a) * 30;
      ctx.beginPath(); ctx.arc(kx, ky, 20, 0, 6.2832); ctx.fillStyle = 'rgba(25,240,255,0.3)'; ctx.fill();
      ctx.beginPath(); ctx.arc(kx + 4, ky + 6, 15 + 2 * Math.sin(t * 6), 0, 6.2832); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
      ctx.beginPath(); ctx.arc(kx + 4, ky + 6, 22 + 3 * Math.sin(t * 6), 0, 6.2832); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  function dim(a) { ctx.fillStyle = 'rgba(3,3,12,' + a + ')'; ctx.fillRect(0, 0, VW, VH); }

  function drawLevelUp(t) {
    dim(0.78);
    const cw = 352, ch = 124, gap = 14, x0 = (VW - cw) / 2, y0 = Math.max(130, VH * 0.5 - 235);
    txt(T.s('levelup'), VW / 2, y0 - 70, 38, COL.cyan);
    txt(T.s('pick_one'), VW / 2, y0 - 38, 15, '#9aa4d8', 'center', false);
    for (let i = 0; i < s.choices.length; i++) {
      const c = s.choices[i], y = y0 + i * (ch + gap);
      const col = c.k === 'w' ? WCOL[c.id] : (c.k === 'p' ? PCOL : COL.grn);
      const key = (c.k === 'w' ? 'w_' : c.k === 'p' ? 'p_' : 'fb_') + c.id;
      btns.push({ id: 'pick:' + i, x: x0, y: y, w: cw, h: ch, off: false });
      rr(x0, y, cw, ch, 14); ctx.fillStyle = 'rgba(14,14,34,0.95)'; ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = hexA(col, 0.2); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
      icon(c.k === 'f' ? '' : c.id, x0 + 48, y + ch / 2, 24, col);
      txt(T.s(key), x0 + 92, y + 28, 20, '#fff', 'left');
      if (c.k !== 'f') txt(c.lv === 1 && c.k === 'w' ? T.s('new_tag') : T.f('lvl_tag', c.lv), x0 + cw - 14, y + 28, 15, col, 'right');
      const lines = wrap(T.s(key + '_d'), cw - 112, 14);
      for (let k = 0; k < lines.length && k < 3; k++) txt(lines[k], x0 + 92, y + 56 + k * 19, 14, '#b8c0e8', 'left', false);
      if (c.k !== 'f') {                                       // level pips
        for (let p = 0; p < 5; p++) { ctx.fillStyle = p < c.lv ? col : 'rgba(255,255,255,0.15)'; ctx.fillRect(x0 + 92 + p * 16, y + ch - 20, 12, 5); }
      }
    }
    adButton('reroll', 'reroll', (VW - 260) / 2, y0 + 3 * (ch + gap) + 6, 260, 48, 'reroll_ad', COL.yel);
  }

  function statRow(label, value, y) {
    txt(label, VW / 2 - 110, y, 18, '#9aa4d8', 'left', false);
    txt(value, VW / 2 + 110, y, 20, '#fff', 'right');
  }

  function drawDeath() {
    dim(0.8);
    txt(T.s('defeated'), VW / 2, VH * 0.5 - 170, 44, COL.red);
    statRow(T.s('stat_time'), fmt(s.t), VH * 0.5 - 100);
    statRow(T.s('stat_kills'), String(s.kills), VH * 0.5 - 70);
    statRow(T.s('stat_level'), String(s.level), VH * 0.5 - 40);
    let y = VH * 0.5 + 10;
    if (!s.revived) { adButton('revive', 'revive', (VW - 280) / 2, y, 280, 56, 'revive_ad', COL.grn); y += 70; }
    button('giveup', (VW - 280) / 2, y, 280, 52, T.s('give_up'), COL.cyan);
  }

  function drawPause() {
    dim(0.75);
    txt(T.s('paused'), VW / 2, VH * 0.5 - 90, 40, '#fff');
    button('resume', (VW - 280) / 2, VH * 0.5 - 30, 280, 56, T.s('resume'), COL.cyan);
    button('quit', (VW - 280) / 2, VH * 0.5 + 44, 280, 52, T.s('quit'), COL.mag, { size: 18 });
  }

  function drawFps() {
    if (!Store.data.settings.fps) return;
    btns.push({ id: 'fps', x: 0, y: VH - 44, w: 220, h: 44, off: false });
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(4, VH - 40, 212, 36);
    txt(Math.round(stat.fps) + ' fps   upd ' + stat.upd.toFixed(1) + 'ms  drw ' + stat.drw.toFixed(1) + 'ms', 10, VH - 29, 11, stat.fps < 50 ? COL.red : COL.grn, 'left');
    txt('E' + stat.nE + '  P' + stat.nP + (lowQ ? '  LQ' : '') + (s && s.stress ? '  STRESS' : ''), 10, VH - 14, 11, '#b8c0ff', 'left');
  }

  // ------------------------------------------------------------------ menu screens
  const dots = [];
  for (let i = 0; i < 26; i++) dots.push({ x: Math.random() * VW, y: Math.random(), v: 8 + Math.random() * 22, c: i % 4 });

  function drawMenuBg(t) {
    bgPlain();
    drawGrid(t * 14, t * 22, 64, 0.16);
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i], sp = SP.spark[d.c], y = (((d.y * VH - t * d.v) % VH) + VH) % VH;
      ctx.globalAlpha = 0.6; ctx.drawImage(sp.c, d.x - sp.w, y - sp.h, sp.w * 2, sp.h * 2);
    }
    ctx.globalAlpha = 1;
  }
  function coinsBar() { txt(T.s('coins') + ': ' + Store.data.coins, VW / 2, 34, 22, COL.yel); }

  function drawMenu(t) {
    drawMenuBg(t);
    coinsBar();
    ctx.drawImage(SP.title.c, (VW - 360) / 2, VH * 0.1, 360, 170);
    const bw = 280, x = (VW - bw) / 2, y = VH * 0.46;
    button('play', x, y, bw, 70, T.s('play'), COL.cyan, { size: 32 });
    button('upgrades', x, y + 92, bw, 56, T.s('upgrades'), COL.yel);
    button('settings', x, y + 164, bw, 56, T.s('settings'), COL.pur);
    adButton('bonus', 'bonus', x, y + 244, bw, 48, 'bonus_ad', COL.grn);
    const b = Store.data.best;
    txt(b.time > 0 ? T.f('best', fmt(b.time), b.kills) : T.s('no_best'), VW / 2, VH - 40, 14, '#7f89c4', 'center', false);
  }

  function drawUpgrades(t) {
    drawMenuBg(t);
    coinsBar();
    txt(T.s('meta_title'), VW / 2, 76, 22, '#fff');
    const names = ['meta_hp', 'meta_speed', 'meta_magnet', 'meta_xp'];
    for (let i = 0; i < Meta.DEFS.length; i++) {
      const d = Meta.DEFS[i], lv = Store.data.meta[d.id] | 0, y = 104 + i * 112, x = 24, w = VW - 48, h = 98;
      rr(x, y, w, h, 14); ctx.fillStyle = 'rgba(14,14,34,0.92)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(25,240,255,0.5)'; ctx.stroke();
      txt(T.s(names[i]), x + 16, y + 26, 20, '#fff', 'left');
      txt(T.s(names[i] + '_d'), x + 16, y + 50, 13, '#9aa4d8', 'left', false);
      for (let p = 0; p < d.max; p++) { ctx.fillStyle = p < lv ? COL.cyan : 'rgba(255,255,255,0.15)'; ctx.fillRect(x + 16 + p * 18, y + 68, 14, 8); }
      if (lv >= d.max) txt(T.s('max_level'), x + w - 16, y + h / 2, 20, COL.grn, 'right');
      else {
        const cost = Meta.cost(d, lv), can = Store.data.coins >= cost;
        button('buy:' + d.id, x + w - 118, y + 24, 104, 50, String(cost), COL.yel, { off: !can, size: 20 });
      }
    }
    button('back', (VW - 200) / 2, 104 + 4 * 112 + 4, 200, 50, T.s('back'), COL.mag);
  }

  function drawSettings(t) {
    drawMenuBg(t);
    txt(T.s('settings'), VW / 2, 70, 28, '#fff');
    const rows = [['music', 'set_music'], ['sfx', 'set_sfx'], ['vib', 'set_vib'], ['fps', 'set_fps']];
    for (let i = 0; i < rows.length; i++) {
      const on = Store.data.settings[rows[i][0]], y = 120 + i * 78;
      button('set:' + rows[i][0], 40, y, VW - 80, 60, T.s(rows[i][1]) + ':  ' + T.s(on ? 'on' : 'off'), on ? COL.grn : '#6a6a88', { size: 22 });
    }
    txt(T.s('set_credit'), VW / 2, 120 + 4 * 78 + 10, 13, '#7f89c4', 'center', false);
    button('back', (VW - 200) / 2, 120 + 4 * 78 + 44, 200, 50, T.s('back'), COL.mag);
  }

  function drawResult(t) {
    drawMenuBg(t);
    const r = C.result(s);
    txt(T.s(r.won ? 'victory' : 'defeated'), VW / 2, VH * 0.16, 38, r.won ? COL.grn : COL.red);
    statRow(T.s('stat_time'), fmt(r.time), VH * 0.16 + 70);
    statRow(T.s('stat_kills'), String(r.kills), VH * 0.16 + 102);
    statRow(T.s('stat_level'), String(r.level), VH * 0.16 + 134);
    txt(T.s('run_coins'), VW / 2, VH * 0.16 + 196, 16, '#9aa4d8', 'center', false);
    txt('+' + (doubled ? reward * 2 : reward), VW / 2, VH * 0.16 + 232, 44, COL.yel);
    const x = (VW - 300) / 2;
    if (!doubled) adButton('double', 'double', x, VH * 0.16 + 280, 300, 54, 'double_ad', COL.yel);
    button('again', x, VH * 0.16 + 350, 300, 62, T.s('play_again'), COL.cyan, { size: 26 });
    button('menu', x, VH * 0.16 + 424, 300, 50, T.s('menu'), COL.mag);
  }

  // ------------------------------------------------------------------ main loop
  let lastTs = 0, acc = 0, frames = 0;
  const ft = new Float32Array(30);
  let ftI = 0, ftSum = 0;

  function frame(ts) {
    window.requestAnimationFrame(frame);
    let dms = ts - lastTs; lastTs = ts;
    if (dms <= 0 || dms > 250) dms = 16.7;
    ftSum += dms - ft[ftI]; ft[ftI] = dms; ftI = (ftI + 1) % 30;
    stat.fps = ftSum > 0 ? 30000 / ftSum : 60;
    frames++;
    btns = [];
    const t = ts / 1000;

    let t0 = performance.now();
    if (screen === 'play' && s) {
      if (!paused) {
        steer();
        acc += dms / 1000;
        let n = 0;
        while (acc >= 1 / 60 && n < 3) { C.update(s, 1 / 60); fxUpdate(1 / 60); acc -= 1 / 60; n++; }
        if (acc > 1 / 60) acc = 0;
        if (s.choices && !prevChoices) { joy = null; C.setInput(s, 0, 0); lockUntil = performance.now() + 500; }
        if (s.dead && !prevDead) { joy = null; C.setInput(s, 0, 0); lockUntil = performance.now() + 700; }
        prevChoices = !!s.choices; prevDead = s.dead;
        A.setMode(s.boss ? 'boss' : 'play');
        if (s.over) toResult();
      }
    }
    stat.upd = stat.upd * 0.9 + (performance.now() - t0) * 0.1;

    t0 = performance.now();
    if (screen === 'play' && s) {
      drawWorld(t);
      drawHud(t);
      drawJoystick(t);
      if (paused) drawPause();
      else if (s.choices) drawLevelUp(t);
      else if (s.dead && !s.over) drawDeath();
      drawFps();
      // adaptive quality: after ~3 s of slow frames, trim effects for good
      if (!lowQ && !paused) { slowFrames = stat.fps < 40 ? slowFrames + 1 : Math.max(0, slowFrames - 2); if (slowFrames > 180) lowQ = true; }
    } else if (screen === 'menu') drawMenu(t);
    else if (screen === 'upgrades') drawUpgrades(t);
    else if (screen === 'settings') drawSettings(t);
    else if (screen === 'result' && s) drawResult(t);
    if (toast) txt(toast.text, VW / 2, VH * 0.4, 26, COL.yel);
    stat.drw = stat.drw * 0.9 + (performance.now() - t0) * 0.1;
  }

  // ------------------------------------------------------------------ boot
  Store.load();
  A.configure(Store.data.settings);
  A.setMode('menu');
  resize();
  if (/[?&]stress=1/.test(window.location.search || '')) Store.data.settings.fps = true;
  window.requestAnimationFrame(frame);

  // test hooks (used by tools/smoke.js)
  NS.Main = {
    btns: function () { return btns; },
    screen: function () { return screen; },
    state: function () { return s; },
    click: click,
    stat: stat
  };
})();
