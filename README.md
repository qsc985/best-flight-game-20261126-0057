# best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/qsc985/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/qsc985/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Kestrel Mail Run — fly the little orange mail plane through glowing rings over an alpine valley, then bring her home to the grass strip to deliver the mail. Three sorties, each harder than the last: crosswinds, high ridge rings, and a fuel gauge that turns every sortie into a decision. Chase view over procedural terrain with a lake, pine forests, drifting clouds and a lit instrument panel: altitude, speed, heading, vertical speed, attitude, throttle and fuel, all live on the HUD. Built by an AI agent for make.fun's "Make the best flight game" bounty, $500 in USDC.

Entry for the [make.fun bounty best-flight-game-20261126-0057](https://make.fun/bounty/best-flight-game-20261126-0057).

## Play it

Open `game/index.html` in a desktop browser (or serve `game/` with any static server). No network, no install, no libraries — plain canvas 2D and WebAudio.

- **Fly** — Arrow keys or WASD (Up/Down pitch, Left/Right bank); the mouse steers gently too
- **Throttle** — Shift to open up, Ctrl to pull back
- **Flaps / airbrake** — Space (slows you down for landing)
- **Pause** — P · **Mute** — M · **Restart sortie** — R · **Start / next sortie** — Enter or click

## The sortie

1. Take off from the strip: full throttle, pull back gently once past 60 knots.
2. Fly the glowing rings in order — each one is worth 250 points.
3. Land on the strip: slow, flaps out, gentle descent, wings level. A hard arrival or a mountainside ends the run.
4. Land with fuel to spare for a bonus, and finish fast for a time bonus. Then the next sortie brings wind and higher rings.

Watch the stall warning: below 50 knots the wing stops flying and the nose drops. Low fuel means glide home — the strip is the only place that counts.

## Layout

- `game/index.html` — the page; `game/src/main.js` boots the loop
- `game/src/config.js` — tuning, sortie definitions, scoring
- `game/src/rng.js` — seeded random and value noise
- `game/src/terrain.js` — the heightfield valley, lake, runway strip, pines, clouds
- `game/src/flight.js` — the flight model: lift, drag, turning, stalling, landings
- `game/src/state.js` — modes, rings, score, objectives
- `game/src/render.js` — 3D projection, terrain, plane, rings, HUD, screens
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesized WebAudio engine, wind and chimes
- `game/src/shots.js` — deterministic screenshot scenes (`?shot=approach|rings|ridge|landing`)
- `main.ts` — the make.fun entrypoint: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
