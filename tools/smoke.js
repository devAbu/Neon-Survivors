// Smoke test: runs the real UI/render code (main.js) against a stub canvas in Node.
// Drives menu -> play -> level-up -> boss -> death/revive -> victory -> result, through the pointer-event path.
// It cannot measure real GPU/phone speed; it proves the screens run without exceptions.
const assert = require('assert');
const path = require('path');

let fakeNow = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => fakeNow }, configurable: true });

const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
globalThis.window = globalThis;
globalThis.innerWidth = 390; globalThis.innerHeight = 844; globalThis.devicePixelRatio = 3;
globalThis.location = { search: '' };
const winHandlers = {};
globalThis.addEventListener = (t, f) => { (winHandlers[t] = winHandlers[t] || []).push(f); };
let rafCb = null;
globalThis.requestAnimationFrame = cb => { rafCb = cb; };

function makeCtx() {
  const target = {
    measureText: s => ({ width: String(s).length * 7 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} })
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : function () {}),
    set: (t, k, v) => { t[k] = v; return true; }
  });
}
function makeCanvas() {
  const handlers = {};
  return {
    width: 0, height: 0, style: {},
    getContext: () => makeCtx(),
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: globalThis.innerWidth, height: globalThis.innerHeight }),
    setPointerCapture() {},
    fire: (t, e) => (handlers[t] || []).forEach(f => f(Object.assign({ preventDefault() {} }, e)))
  };
}
const mainCanvas = makeCanvas();
const docHandlers = {};
globalThis.document = {
  getElementById: () => mainCanvas,
  createElement: () => makeCanvas(),
  addEventListener: (t, f) => { (docHandlers[t] = docHandlers[t] || []).push(f); },
  hidden: false
};

const www = p => path.join(__dirname, '..', 'www', p);
['strings.js', 'store.js', 'adservice.js', 'meta.js', 'core.js', 'audio.js', 'main.js'].forEach(f => require(www(f)));
const NS = globalThis.NS, C = NS.Core, M = NS.Main;
const W = globalThis.innerWidth, H = globalThis.innerHeight;

let ts = 0, pid = 1;
function frames(n) { for (let i = 0; i < n; i++) { ts += 16.7; fakeNow += 16.7; rafCb(ts); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function tapButton(id) {
  const b = M.btns().find(x => x.id === id);
  assert(b, 'button not on screen: ' + id + ' (have ' + M.btns().map(x => x.id).join(',') + ')');
  const ux = b.x + b.w / 2, uy = b.y + b.h / 2;
  mainCanvas.fire('pointerdown', { pointerId: pid++, clientX: ux / 400 * W, clientY: uy / (H * 400 / W) * H });
}

(async function main() {
  frames(10);
  assert.strictEqual(M.screen(), 'menu');
  tapButton('upgrades'); frames(3); assert.strictEqual(M.screen(), 'upgrades');
  tapButton('back'); frames(3);
  tapButton('settings'); frames(3); tapButton('set:fps'); tapButton('set:fps'); tapButton('back'); frames(3);
  assert.strictEqual(M.screen(), 'menu');

  tapButton('play'); frames(5);
  assert.strictEqual(M.screen(), 'play');
  const s = M.state();
  assert(s, 'no game state');

  // steer with the floating joystick (pointer path), bot decides the direction
  const id = pid++;
  mainCanvas.fire('pointerdown', { pointerId: id, clientX: W / 2, clientY: H * 0.7 });
  let picks = 0;
  for (let i = 0; i < 4000; i++) {
    if (s.dead) break;
    if (s.choices) { frames(40); tapButton('pick:' + (picks++ % 3)); frames(2); continue; }
    C.botInput(s);
    mainCanvas.fire('pointermove', { pointerId: id, clientX: W / 2 + s.inx * 45 * W / 400, clientY: H * 0.7 + s.iny * 45 * W / 400 });
    frames(1);
    if (s.hero.hp < 20) s.hero.hp = s.hero.maxHp;       // keep the bot alive for this part
  }
  assert(s.kills > 20, 'bot killed almost nothing: ' + s.kills);
  assert(Number.isFinite(s.hero.x) && Number.isFinite(s.hero.y), 'hero position is NaN');
  assert(picks > 0, 'never reached a level-up');

  // stress mode (tap on FPS overlay) + boss fight
  tapButton('fps'); frames(5);
  assert(s.stress, 'stress toggle did nothing');
  tapButton('fps');
  s.t = 297;
  for (let i = 0; i < 1200; i++) {
    if (s.choices) { M.click('pick:0'); }
    C.botInput(s); frames(1);
    if (s.hero.hp < 30) s.hero.hp = s.hero.maxHp;
  }
  assert(s.bossIdx >= 1, 'boss never spawned');

  // death -> revive through the (simulated) rewarded ad
  s.hero.hp = 1; s.hero.iframes = 0;
  for (let i = 0; i < 3000 && !s.dead; i++) { if (s.choices) M.click('pick:0'); frames(1); s.hero.hp = Math.min(s.hero.hp, 1); }
  assert(s.dead, 'hero did not die');
  frames(60);
  tapButton('revive'); frames(30);
  await sleep(3300); frames(5);
  assert(!s.dead, 'revive ad did not revive');

  // victory -> result -> double coins -> menu
  s.hero.hp = s.hero.maxHp; s.t = 899.5;
  frames(60);
  assert(s.won && M.screen() === 'result', 'did not reach the result screen on victory');
  const before = JSON.parse(store.ns_save_v1).coins;
  frames(40);
  tapButton('double'); frames(5);
  await sleep(3300); frames(5);
  const after = JSON.parse(store.ns_save_v1).coins;
  assert(after > before, 'double-coins ad did not pay out');
  tapButton('menu'); frames(5);
  assert.strictEqual(M.screen(), 'menu');

  // save data survived
  const saved = JSON.parse(store.ns_save_v1);
  assert(saved.best.time > 800 && saved.runs === 1 && saved.tutorialDone === true, 'save data incomplete: ' + JSON.stringify(saved));
  console.log('smoke OK  | kills', s.kills, '| coins saved', saved.coins, '| best', Math.round(saved.best.time) + 's');
  process.exit(0);
})().catch(e => { console.error('SMOKE FAIL:', e); process.exit(1); });
