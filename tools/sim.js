// Headless balance + performance sim. Bots play full runs without any rendering.
// usage: node tools/sim.js [runs]
const Meta = require('../www/meta.js');
const C = require('../www/core.js');
const runs = parseInt(process.argv[2] || '4', 10);

function play(mods, seed) {
  const s = C.create({ mods, seed });
  let k = 0, maxEn = 0, worst = 0, ups = 0;
  const dt = 1 / 30;                       // 30 Hz is plenty for a bot, keeps the sim fast
  while (!s.over) {
    if (s.dead) { C.finish(s); break; }
    if (s.choices) { C.applyChoice(s, C.botPick(s)); ups++; continue; }
    if (k % 3 === 0) C.botInput(s);
    const t0 = process.hrtime.bigint();
    C.update(s, dt);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms > worst) worst = ms;
    if (s.enCount > maxEn) maxEn = s.enCount;
    k++;
    if (s.t > 1000) break;
  }
  return { t: Math.round(s.t), won: s.won, kills: s.kills, level: s.level, maxEn, worst: +worst.toFixed(2), boss: s.bossKills };
}

function bucket(name, mods) {
  const res = [];
  for (let i = 0; i < runs; i++) res.push(play(mods, 1000 + i * 7919));
  res.sort((a, b) => a.t - b.t);
  console.log(name.padEnd(10), res.map(r => (r.won ? 'WIN' : r.t + 's') + '/L' + r.level + '/k' + r.kills + '/b' + r.boss).join('  '),
    '| max enemies', Math.max(...res.map(r => r.maxEn)), '| worst update', Math.max(...res.map(r => r.worst)) + 'ms');
  return res;
}

bucket('no meta', Meta.mods({}));
bucket('half meta', Meta.mods({ hp: 4, speed: 3, magnet: 3, xp: 4 }));
bucket('max meta', Meta.maxMods());

// Sanity: stress state must hold 300 enemies and stay cheap.
const s = C.create({ seed: 5 });
C.setStress(s, true);
let worst = 0;
for (let i = 0; i < 600; i++) {
  C.botInput(s);
  const t0 = process.hrtime.bigint();
  C.update(s, 1 / 60);
  worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6);
  if (s.dead) { s.dead = false; s.hero.hp = s.hero.maxHp; }
  if (s.choices) C.applyChoice(s, 0);
}
console.log('stress: enemies', s.enCount, '| worst update', worst.toFixed(2) + 'ms');
if (s.enCount < 250) { console.error('FAIL: stress mode did not reach 250+ enemies'); process.exit(1); }
