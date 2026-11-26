// main.js — boots Kestrel Mail Run: builds the valley, wires input, audio
// and the renderer, and runs the frame loop. `?shot=<name>` jumps straight
// into a frozen screenshot scene; otherwise the title screen waits for the
// pilot. No network, no libraries, no build step.

import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { MODE, Game } from './state.js';
import { buildLighting, Renderer } from './render.js';
import { applyShot } from './shots.js';
import { buildTerrain } from './terrain.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');

buildTerrain();
buildLighting();

const game = new Game();
const input = new Input(canvas);
const audio = new AudioEngine();
const renderer = new Renderer(canvas);
renderer.updateCamera(game.plane, 1, true);

// Exposed for automated play-testing only (screenshots, state checks):
// the game itself never reads this handle.
window.__kestrel = { game, renderer, input };

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const shotMode = shotName !== null;
let shotApplied = false;
if (shotMode) {
  shotApplied = applyShot(game, shotName);
  if (shotApplied) {
    renderer.updateCamera(game.plane, 1, true);
  }
}

let last = performance.now();
let sceneTime = 0;
let audioStarted = false;

function startAudio() {
  if (audioStarted) return;
  audioStarted = true;
  audio.ensure();
}

function announce(text) {
  if (status) status.textContent = text;
}

function drainEvents() {
  while (game.events.length > 0) {
    const event = game.events.shift();
    if (event === 'ring') audio.ringChime();
    else if (event === 'crash') audio.crashThud();
    else if (event === 'landed') audio.landChime();
    else if (event === 'stall') audio.stallBeep();
    else if (event === 'lowfuel') announce('Low fuel');
  }
}

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  sceneTime += dt;
  const shotTime = shotMode ? 12.4 : sceneTime;

  // Global keys.
  if (input.wasPressed('KeyM')) {
    audio.setMuted(!audio.muted);
    game.say(audio.muted ? 'Sound off' : 'Sound on', 1.5);
  }
  if (input.wasPressed('KeyR')) {
    startAudio();
    game.restart();
  }
  if (input.wasPressed('KeyP')) {
    if (game.mode === MODE.FLYING) game.mode = MODE.PAUSED;
    else if (game.mode === MODE.PAUSED) game.mode = MODE.FLYING;
  }
  if (input.wasPressed('Enter') || input.wasPressed('PointerDown')) {
    startAudio();
    if (game.mode === MODE.TITLE) game.mode = MODE.FLYING;
    else if (game.mode === MODE.CRASHED) game.retrySortie();
    else if (game.mode === MODE.SORTIE_DONE) game.nextSortie();
  }

  if (game.mode === MODE.FLYING && !shotMode) {
    const ctl = {
      pitch: input.pitchInput(),
      roll: input.rollInput(),
      throttle: input.throttleInput(),
      brake: input.brakeDown(),
    };
    const event = game.plane.step(dt, ctl, game.wind);
    game.update(dt);
    if (event) game.onFlightEvent(event);
    audio.update(game.plane.throttle, game.plane.speed, true);
    announce(
      `${game.objectiveText()}. Altitude ${Math.round(game.plane.y * 3.281)} feet, ` +
        `speed ${Math.round(game.plane.speed * 1.944)} knots, fuel ${Math.round(game.plane.fuel)} percent.`,
    );
  } else if (shotMode && shotApplied) {
    // Frozen scene: the plane holds its pose so the screenshot is stable.
    audio.update(0, 0, false);
  } else {
    audio.update(0, 0, false);
  }

  drainEvents();
  renderer.updateCamera(game.plane, dt, shotMode && shotApplied);
  renderer.draw(game, shotTime);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => renderer.resize());
requestAnimationFrame(frame);
