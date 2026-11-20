// Neon Survivors - sound effects + music, all synthesized with Web Audio (no files, works offline).
// Music and effects have separate switches; vibration is a third switch. Settings come from NS.Store.
(function () {
  'use strict';
  const G = globalThis; const NS = G.NS || (G.NS = {});

  let ctx = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;
  let sfxOn = true, musicOn = true, vibOn = true;
  let mode = 'off';                       // 'off' | 'menu' | 'play' | 'boss'
  let timer = null, nextTime = 0, step = 0, voices = 0;
  const last = {};

  const midi = function (n) { return 440 * Math.pow(2, (n - 69) / 12); };

  function init() {
    if (ctx) return true;
    const AC = G.AudioContext || G.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = musicOn ? 0.3 : 0; musBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  // one oscillator voice with a pitch glide and a fast envelope
  function tone(bus, type, f0, f1, dur, vol, when) {
    const t = when || ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  function noise(bus, dur, vol, hp, when) {
    const t = when || ctx.currentTime;
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // name -> [min interval seconds, play function]
  const SFX = {
    shoot:   [0.07, function () { tone(sfxBus, 'square', 880, 330, 0.07, 0.05); }],
    zap:     [0.1,  function () { tone(sfxBus, 'sawtooth', 1400, 200, 0.12, 0.06); noise(sfxBus, 0.08, 0.05, 3000); }],
    missile: [0.1,  function () { noise(sfxBus, 0.18, 0.07, 800); tone(sfxBus, 'triangle', 300, 120, 0.18, 0.06); }],
    hit:     [0.045, function () { tone(sfxBus, 'triangle', 220, 110, 0.05, 0.05); }],
    kill:    [0.05, function () { tone(sfxBus, 'square', 440, 80, 0.09, 0.05); noise(sfxBus, 0.06, 0.05, 2500); }],
    gem:     [0.04, function () { tone(sfxBus, 'sine', 900 + Math.random() * 300, 1500, 0.07, 0.07); }],
    coin:    [0.06, function () { tone(sfxBus, 'square', 1200, 1200, 0.05, 0.05); tone(sfxBus, 'square', 1800, 1800, 0.09, 0.05, ctx.currentTime + 0.05); }],
    heal:    [0.2,  function () { tone(sfxBus, 'sine', 500, 1000, 0.25, 0.1); }],
    boom:    [0.08, function () { noise(sfxBus, 0.35, 0.16, 120); tone(sfxBus, 'sine', 140, 40, 0.3, 0.14); }],
    mine:    [0.1,  function () { tone(sfxBus, 'square', 300, 300, 0.05, 0.05); }],
    hurt:    [0.15, function () { tone(sfxBus, 'sawtooth', 200, 60, 0.22, 0.14); noise(sfxBus, 0.12, 0.1, 400); }],
    level:   [0.5,  function () {
      const t = ctx.currentTime;
      [60, 64, 67, 72].forEach(function (n, i) { tone(sfxBus, 'square', midi(n + 12), midi(n + 12), 0.14, 0.07, t + i * 0.07); });
    }],
    click:   [0.05, function () { tone(sfxBus, 'square', 700, 500, 0.05, 0.06); }],
    warn:    [1.0,  function () {
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) tone(sfxBus, 'sawtooth', 220, 180, 0.28, 0.12, t + i * 0.4);
    }],
    bossdie: [0.5,  function () { noise(sfxBus, 0.9, 0.2, 80); tone(sfxBus, 'sawtooth', 300, 30, 0.9, 0.16); }],
    win:     [1.0,  function () {
      const t = ctx.currentTime;
      [60, 64, 67, 72, 76, 79].forEach(function (n, i) { tone(sfxBus, 'square', midi(n + 12), midi(n + 12), 0.2, 0.08, t + i * 0.11); });
    }],
    lose:    [1.0,  function () {
      const t = ctx.currentTime;
      [67, 63, 60, 55].forEach(function (n, i) { tone(sfxBus, 'sawtooth', midi(n), midi(n) * 0.97, 0.3, 0.09, t + i * 0.18); });
    }]
  };

  // ------------------------------------------------------------ music (simple synthwave loop)
  const BASS = [45, 45, 57, 45, 48, 48, 60, 48, 43, 43, 55, 43, 50, 50, 62, 50];
  const LEAD = [69, 0, 72, 0, 76, 0, 72, 0, 67, 0, 71, 0, 74, 0, 71, 0];
  function scheduleStep(t, i) {
    const m = mode;
    const bpm = m === 'boss' ? 150 : 124;
    const dur = 60 / bpm / 4;
    if (m === 'menu') {
      if (i % 4 === 0) tone(musBus, 'triangle', midi(BASS[i] + 12), midi(BASS[i] + 12), dur * 3.6, 0.1, t);
      if (i % 8 === 0) tone(musBus, 'sine', midi(LEAD[(i + 2) % 16] || 72), midi(LEAD[(i + 2) % 16] || 72), dur * 7, 0.06, t);
      return dur;
    }
    if (i % 4 === 0) tone(musBus, 'sine', 120, 40, 0.14, 0.4, t);                              // kick
    if (i % 4 === 2) noise(musBus, 0.04, 0.12, 6000, t);                                       // hat
    tone(musBus, 'sawtooth', midi(BASS[i]), midi(BASS[i]), dur * 0.9, m === 'boss' ? 0.1 : 0.075, t);
    if (LEAD[i] && (m === 'boss' || (i >> 4) % 2 === 0)) tone(musBus, 'square', midi(LEAD[i]), midi(LEAD[i]), dur * 1.6, 0.035, t);
    return dur;
  }
  function pump() {
    if (!ctx || mode === 'off') return;
    while (nextTime < ctx.currentTime + 0.25) {
      const d = scheduleStep(nextTime, step % 16);
      nextTime += d; step++;
    }
  }
  function startPump() {
    if (timer || !ctx) return;
    nextTime = ctx.currentTime + 0.05; step = 0;
    timer = setInterval(pump, 80);
  }
  function stopPump() { if (timer) { clearInterval(timer); timer = null; } }

  const Audio = {
    // Call from the first user touch (browsers/WebViews need a gesture).
    unlock: function () {
      if (!init()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (mode !== 'off') startPump();
    },
    configure: function (s) {
      sfxOn = !!s.sfx; musicOn = !!s.music; vibOn = !!s.vib;
      if (sfxBus) sfxBus.gain.value = sfxOn ? 1 : 0;
      if (musBus) musBus.gain.value = musicOn ? 0.3 : 0;
    },
    setMode: function (m) {
      if (m === mode) return;
      mode = m; step = 0;
      if (m === 'off') stopPump(); else if (ctx) startPump();
    },
    pause: function (p) {
      if (!ctx) return;
      if (p) { ctx.suspend && ctx.suspend(); } else if (ctx.state === 'suspended') ctx.resume();
    },
    sfx: function (name) {
      if (!sfxOn || !ctx || ctx.state !== 'running') return;
      const e = SFX[name];
      if (!e) return;
      const now = ctx.currentTime;
      if (last[name] !== undefined && now - last[name] < e[0]) return;
      if (voices > 14) return;
      last[name] = now;
      voices++;
      try { e[1](); } catch (err) { /* ignore */ }
      setTimeout(function () { voices--; }, 150);
    },
    vibrate: function (ms) {
      if (!vibOn) return;
      try { if (G.navigator && G.navigator.vibrate) G.navigator.vibrate(ms); } catch (e) { /* ignore */ }
    }
  };
  NS.Audio = Audio;
  if (typeof module !== 'undefined') module.exports = Audio;
})();
