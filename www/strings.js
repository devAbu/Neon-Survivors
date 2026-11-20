// All player-facing text lives here (one file, easy to translate).
// Use NS.T.s('key') for plain text and NS.T.f('key', a, b) for {0} {1} templates.
(function () {
  'use strict';
  const G = globalThis; const NS = G.NS || (G.NS = {});

  const EN = {
    title1: 'NEON',
    title2: 'SURVIVORS',
    play: 'PLAY',
    upgrades: 'UPGRADES',
    settings: 'SETTINGS',
    back: 'BACK',
    coins: 'Coins',
    best: 'Best: {0}  |  {1} kills',
    no_best: 'No runs yet',
    bonus_ad: 'Free coins (watch ad)',
    bonus_got: '+{0} coins!',

    // settings
    set_music: 'Music',
    set_sfx: 'Effects',
    set_vib: 'Vibration',
    set_fps: 'FPS overlay',
    on: 'ON',
    off: 'OFF',
    set_credit: 'Offline. No data leaves your phone.',

    // upgrades (meta)
    meta_title: 'PERMANENT UPGRADES',
    meta_hp: 'Vitality',
    meta_hp_d: '+8% max HP per level',
    meta_speed: 'Agility',
    meta_speed_d: '+4% move speed per level',
    meta_magnet: 'Magnetism',
    meta_magnet_d: '+20% pickup range per level',
    meta_xp: 'Insight',
    meta_xp_d: '+6% XP per level',
    max_level: 'MAX',
    meta_lv: 'Lv {0}/{1}',

    // HUD
    paused: 'PAUSED',
    resume: 'RESUME',
    quit: 'QUIT TO MENU',
    lvl: 'LV {0}',
    hud_kills: 'KILLS {0}',
    hud_coins: 'COINS {0}',
    boss_warn: 'WARNING',
    boss_name: 'NEON TITAN',

    // level up
    levelup: 'LEVEL UP',
    pick_one: 'Choose an upgrade',
    new_tag: 'NEW',
    lvl_tag: 'Lv {0}',
    reroll_ad: 'Reroll (watch ad)',
    fb_heal: 'Repair Kit',
    fb_heal_d: 'Restore 35% of your HP.',
    fb_coins: 'Coin Cache',
    fb_coins_d: 'Gain 40 coins at the end of the run.',

    // ads
    ad_ready: 'Watch ad',
    ad_wait: 'Ad... {0}',
    ad_cooldown: 'Wait {0}s',

    // end of run
    defeated: 'DEFEATED',
    victory: 'YOU SURVIVED',
    stat_time: 'Time',
    stat_kills: 'Kills',
    stat_level: 'Level',
    revive_ad: 'Revive (watch ad)',
    give_up: 'Continue',
    run_coins: 'Coins earned',
    double_ad: 'Double coins (watch ad)',
    play_again: 'PLAY AGAIN',
    menu: 'MENU',

    // weapons
    w_blaster: 'Pulse Blaster',
    w_blaster_d: 'Fires at the nearest enemy.',
    w_bounce: 'Ricochet Beam',
    w_bounce_d: 'A bolt that bounces between enemies.',
    w_orbit: 'Orbit Drones',
    w_orbit_d: 'Drones circle you and shred anything close.',
    w_mine: 'Mine Field',
    w_mine_d: 'Drops mines that blast nearby enemies.',
    w_chain: 'Arc Chain',
    w_chain_d: 'Lightning jumps from enemy to enemy.',
    w_missile: 'Seeker Missiles',
    w_missile_d: 'Homing rockets with a blast radius.',

    // passives
    p_power: 'Power Core',
    p_power_d: '+12% damage per level.',
    p_clock: 'Overclock',
    p_clock_d: 'Weapons fire 8% faster per level.',
    p_hull: 'Hull Plating',
    p_hull_d: '+20% max HP per level.',
    p_thrust: 'Thrusters',
    p_thrust_d: '+8% move speed per level.',
    p_coil: 'Magnet Coil',
    p_coil_d: '+30% pickup range per level.',
    p_repair: 'Nano Repair',
    p_repair_d: 'Regenerate 0.6 HP per second per level.'
  };

  let cur = EN;
  const T = {
    s: function (k) { const v = cur[k]; return v === undefined ? k : v; },
    f: function (k, a, b, c) {
      let v = T.s(k);
      if (a !== undefined) v = v.replace('{0}', a);
      if (b !== undefined) v = v.replace('{1}', b);
      if (c !== undefined) v = v.replace('{2}', c);
      return v;
    },
    setLanguage: function (table) { cur = Object.assign({}, EN, table); }
  };
  NS.T = T;
  if (typeof module !== 'undefined') module.exports = T;
})();
