// Local save (localStorage). Level progress, coins, settings, best result.
(function () {
  'use strict';
  const G = globalThis; const NS = G.NS || (G.NS = {});
  const KEY = 'ns_save_v1';

  function defaults() {
    return {
      v: 1,
      coins: 0,
      meta: { hp: 0, speed: 0, magnet: 0, xp: 0 },
      settings: { music: true, sfx: true, vib: true, fps: true },
      best: { time: 0, kills: 0, level: 0 },
      tutorialDone: false,
      runs: 0
    };
  }

  const Store = {
    data: defaults(),
    load: function () {
      let raw = null;
      try { raw = G.localStorage && G.localStorage.getItem(KEY); } catch (e) { raw = null; }
      const d = defaults();
      if (raw) {
        try {
          const o = JSON.parse(raw);
          d.coins = o.coins | 0;
          Object.assign(d.meta, o.meta || {});
          Object.assign(d.settings, o.settings || {});
          Object.assign(d.best, o.best || {});
          d.tutorialDone = !!o.tutorialDone;
          d.runs = o.runs | 0;
        } catch (e) { /* corrupted save: start fresh */ }
      }
      Store.data = d;
      return d;
    },
    save: function () {
      try { G.localStorage && G.localStorage.setItem(KEY, JSON.stringify(Store.data)); } catch (e) { /* ignore */ }
    },
    addCoins: function (n) { Store.data.coins = Math.max(0, Store.data.coins + (n | 0)); Store.save(); },
    recordRun: function (time, kills, level) {
      const b = Store.data.best;
      if (time > b.time) b.time = time;
      if (kills > b.kills) b.kills = kills;
      if (level > b.level) b.level = level;
      Store.data.runs++;
      Store.save();
    }
  };
  NS.Store = Store;
  if (typeof module !== 'undefined') module.exports = Store;
})();
