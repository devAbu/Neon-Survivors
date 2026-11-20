# Neon Survivors (working title)

Offline top-down survivor game for Android. Steer with a floating joystick (touch anywhere), the hero auto-fires at the nearest enemy. Survive 15 minutes, level up, pick 1 of 3 upgrades, spend coins on permanent upgrades between runs.

- Stack: HTML5 canvas + vanilla JS in a Capacitor wrapper (same as `merge-defense`). No external services, fully offline.
- Portrait, one hand, touch only. All art is drawn in code; sounds are synthesized with WebAudio.

## Run locally

```
npm install      # only needed for the Android build
npm start        # http://localhost:8080  (arrow keys / WASD also steer on desktop)
npm run sim      # headless balance + performance sim (bots play full runs)
npm run smoke    # runs the real UI code against a stub canvas, clicks through all screens
```

Open `http://localhost:8080/?stress=1` for the FPS overlay. Tap the overlay (bottom-left) to toggle **STRESS**: it keeps 300 enemies on screen to test performance.

## Build the APK

Every push runs `.github/workflows/build-apk.yml`: sim + smoke tests, then a debug APK. Download `neon-survivors-apk` from the run's **Artifacts**, unzip, install `neon-survivors.apk`.

`keystore/debug.keystore` is a fixed DEBUG key so new builds install over old ones. It is not for the Play Store (a release keystore + AAB comes later).

Local build (needs JDK 21 + Android SDK): `npx cap add android && npx cap sync android && cd android && ./gradlew assembleDebug -I ../android-signing.gradle`

## Where things are

| File | What |
|---|---|
| `www/strings.js` | **All UI text** (one table, translate here) |
| `www/store.js` | Save data (localStorage): coins, meta levels, settings, best run, tutorial flag |
| `www/adservice.js` | **Rewarded-ad module.** Simulated now (3 s countdown, reward, cooldown). Replace the body of `show()` with AdMob later; the API stays the same |
| `www/meta.js` | Permanent upgrades, costs, run reward formula |
| `www/core.js` | Game logic: pools, enemies, weapons, passives, boss, spawn director, balance numbers |
| `www/audio.js` | Music + effects (WebAudio), vibration |
| `www/main.js` | Rendering, input, all screens |
| `tools/` | `sim.js`, `smoke.js`, `serve.js` |

### Settings
In-game: **Settings** screen has separate switches for Music, Effects, Vibration and the FPS overlay. Saved locally.

### Rewarded ads (placements)
`revive` (on death, once per run), `double` (result screen), `reroll` (level-up), `bonus` (menu, free coins). Cooldowns are in `adservice.js`.

## MVP scope

Done: 1 hero, 1 map, 6 weapons (Pulse Blaster, Ricochet Beam, Orbit Drones, Mine Field, Arc Chain, Seeker Missiles), 6 passives, 1 boss design (appears at 5:00 and 10:00, stronger the second time), victory at 15:00, permanent upgrades (HP, speed, magnet, XP), save, settings, pooling for everything, FPS overlay.

Not yet (waiting for "uradi"): weapon evolutions, 2 more passives, 2 more heroes, 2 more maps, final boss at 15:00, app icon/splash, release signing.
