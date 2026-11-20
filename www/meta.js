// Permanent (meta) upgrades bought with coins + run reward formula.
(function () {
  'use strict';
  const G = globalThis; const NS = G.NS || (G.NS = {});

  const DEFS = [
    { id: 'hp',     max: 8, base: 40, grow: 1.5,  per: 0.08 },
    { id: 'speed',  max: 6, base: 50, grow: 1.5,  per: 0.04 },
    { id: 'magnet', max: 6, base: 40, grow: 1.45, per: 0.20 },
    { id: 'xp',     max: 8, base: 60, grow: 1.55, per: 0.06 }
  ];

  // Planned content (not in the MVP yet): 3 heroes (1 playable) and 3 maps (1 playable).
  const HEROES = [{ id: 'vanguard', cost: 0, ready: true }, { id: 'hero2', cost: 800, ready: false }, { id: 'hero3', cost: 2000, ready: false }];
  const MAPS = [{ id: 'grid', ready: true }, { id: 'map2', ready: false }, { id: 'map3', ready: false }];

  const Meta = {
    DEFS: DEFS, HEROES: HEROES, MAPS: MAPS,
    cost: function (def, lv) { return Math.round(def.base * Math.pow(def.grow, lv)); },
    // Convert saved levels to multipliers used by the core.
    mods: function (levels) {
      const m = { hp: 0, speed: 0, magnet: 0, xp: 0 };
      for (let i = 0; i < DEFS.length; i++) {
        const d = DEFS[i];
        m[d.id] = d.per * Math.min(d.max, (levels && levels[d.id]) | 0);
      }
      return m;
    },
    maxMods: function () {
      const lv = {};
      for (let i = 0; i < DEFS.length; i++) lv[DEFS[i].id] = DEFS[i].max;
      return Meta.mods(lv);
    },
    // Returns true and spends coins if affordable.
    buy: function (store, id) {
      const d = DEFS.find(function (x) { return x.id === id; });
      if (!d) return false;
      const lv = store.data.meta[id] | 0;
      if (lv >= d.max) return false;
      const c = Meta.cost(d, lv);
      if (store.data.coins < c) return false;
      store.data.coins -= c;
      store.data.meta[id] = lv + 1;
      store.save();
      return true;
    },
    // Coins earned for one run.
    runReward: function (r) {
      return Math.floor(r.coinsCollected + r.time / 20 + r.kills / 30 + r.bossKills * 40 + (r.won ? 150 : 0));
    }
  };
  NS.Meta = Meta;
  if (typeof module !== 'undefined') module.exports = Meta;
})();
