// AdService - the ONLY place that knows about ads.
// Right now it SIMULATES a rewarded video (countdown, reward, cooldown).
// To go live, replace the body of `show()` with the real AdMob rewarded call
// and keep the same API: status(placement) / show(placement) -> Promise<boolean>.
(function () {
  'use strict';
  const G = globalThis; const NS = G.NS || (G.NS = {});

  const AD_SECONDS = 3;                 // simulated ad length
  const COOLDOWN = {                    // seconds before the same placement is offered again
    revive: 0,
    double: 0,
    reroll: 15,
    bonus: 120
  };

  const st = {};                        // placement -> { playing, until, cdUntil }
  function get(p) { return st[p] || (st[p] = { playing: false, until: 0, cdUntil: 0 }); }

  const Ad = {
    // { s: 'ready' | 'playing' | 'cooldown', left: seconds (rounded up) }
    status: function (p, now) {
      const t = now === undefined ? Date.now() : now;
      const o = get(p);
      if (o.playing) return { s: 'playing', left: Math.max(1, Math.ceil((o.until - t) / 1000)) };
      if (t < o.cdUntil) return { s: 'cooldown', left: Math.ceil((o.cdUntil - t) / 1000) };
      return { s: 'ready', left: 0 };
    },
    isReady: function (p) { return Ad.status(p).s === 'ready'; },
    // Resolves true when the reward should be granted, false if the ad was not shown / skipped.
    show: function (p) {
      const o = get(p);
      if (Ad.status(p).s !== 'ready') return Promise.resolve(false);
      o.playing = true;
      o.until = Date.now() + AD_SECONDS * 1000;
      return new Promise(function (resolve) {
        setTimeout(function () {
          o.playing = false;
          o.cdUntil = Date.now() + (COOLDOWN[p] || 0) * 1000;
          resolve(true);
        }, AD_SECONDS * 1000);
      });
    }
  };
  NS.Ad = Ad;
  if (typeof module !== 'undefined') module.exports = Ad;
})();
