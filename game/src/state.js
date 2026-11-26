// state.js — the sortie: modes, rings, score, messages and the objective
// list. The flight model flies; this file decides what counts.

import { RINGS, SCORE, SORTIES } from './config.js';
import { FlightModel } from './flight.js';
import { mulberry32 } from './rng.js';
import { runwayHeight, sampleHeight } from './terrain.js';

export const MODE = {
  TITLE: 'title',
  FLYING: 'flying',
  PAUSED: 'paused',
  CRASHED: 'crashed',
  SORTIE_DONE: 'done',
};

export class Game {
  constructor() {
    this.plane = new FlightModel();
    this.mode = MODE.TITLE;
    this.sortieIndex = 0;
    this.rings = [];
    this.ringIndex = 0;
    this.score = 0;
    this.sortieScore = 0;
    this.sortieTime = 0;
    this.bestScore = 0;
    this.message = '';
    this.messageUntil = 0;
    this.now = 0;
    this.wind = 0;
    this.events = []; // 'ring' | 'crash' | 'landed' | 'lowfuel' | 'stall', drained by main
    this.stallBeepAt = 0;
    this.startSortie(0);
  }

  sortie() {
    return SORTIES[this.sortieIndex % SORTIES.length];
  }

  startSortie(index) {
    this.sortieIndex = index;
    const def = this.sortie();
    this.plane.reset();
    this.plane.fuel = def.fuel;
    this.wind = def.wind;
    this.rings = this.buildRings(def.rings);
    this.ringIndex = 0;
    this.sortieScore = 0;
    this.sortieTime = 0;
    this.mode = MODE.TITLE;
    this.say(`${def.name} — ${def.briefing}`, 6);
  }

  // Rings snake up the valley: out over the lake, back over the foothills,
  // then climbing toward the high ridge, so every sortie flies new ground.
  buildRings(count) {
    const rand = mulberry32(9000 + this.sortieIndex * 77);
    const rings = [];
    const path = [
      { x: -260, z: -700 },
      { x: 420, z: -1600 },
      { x: -900, z: -2100 },
      { x: 300, z: -2600 },
      { x: -500, z: -3100 },
      { x: 900, z: -3600 },
      { x: -200, z: -4100 },
    ];
    for (let i = 0; i < count; i += 1) {
      const p = path[i % path.length];
      const jitterX = (rand() - 0.5) * 260;
      const jitterZ = (rand() - 0.5) * 200;
      const x = p.x + jitterX;
      const z = p.z + jitterZ;
      const ground = sampleHeight(x, z);
      const y = ground + 55 + rand() * 70 + i * 8;
      rings.push({ x, y, z, passed: false });
    }
    return rings;
  }

  say(text, seconds) {
    this.message = text;
    this.messageUntil = this.now + seconds;
  }

  nextRing() {
    return this.rings[this.ringIndex] ?? null;
  }

  objectiveText() {
    if (this.ringIndex < this.rings.length) {
      return `Ring ${this.ringIndex + 1} of ${this.rings.length} — fly through the glowing ring`;
    }
    return 'All rings flown — land on the strip to deliver the mail';
  }

  update(dt) {
    this.now += dt;
    if (this.mode !== MODE.FLYING) return;
    this.sortieTime += dt;
    const ring = this.nextRing();
    if (ring) {
      const dx = this.plane.x - ring.x;
      const dy = this.plane.y - ring.y;
      const dz = this.plane.z - ring.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < RINGS.passRadius) {
        ring.passed = true;
        this.ringIndex += 1;
        this.sortieScore += RINGS.points;
        this.score += RINGS.points;
        this.events.push('ring');
        if (this.ringIndex < this.rings.length) {
          this.say(`Ring ${this.ringIndex} flown! +${RINGS.points}`, 2.5);
        } else {
          this.say('All rings flown — bring her home to the strip!', 4);
        }
      }
    }
    if (this.plane.fuel < 20 && this.plane.fuel > 0) {
      if (!this.events.includes('lowfuel')) this.events.push('lowfuel');
    }
    if (this.plane.stalled && this.now - this.stallBeepAt > 0.7) {
      this.stallBeepAt = this.now;
      this.events.push('stall');
    }
  }

  // Called by main.js when the flight model reports an event.
  onFlightEvent(event) {
    if (event === 'crash') {
      this.mode = MODE.CRASHED;
      this.events.push('crash');
      this.bestScore = Math.max(this.bestScore, this.score);
    } else if (event === 'landed') {
      const fuelBonus = Math.round(this.plane.fuel * SCORE.fuelBonusPerUnit);
      const timeBonus = Math.max(
        0,
        Math.round((240 - this.sortieTime) * SCORE.timeBonusPerSecond),
      );
      this.sortieScore += SCORE.landing + fuelBonus + timeBonus;
      this.score += SCORE.landing + fuelBonus + timeBonus;
      this.mode = MODE.SORTIE_DONE;
      this.events.push('landed');
      this.bestScore = Math.max(this.bestScore, this.score);
    }
  }

  restart() {
    this.score = 0;
    this.startSortie(0);
    this.mode = MODE.FLYING;
  }

  nextSortie() {
    this.startSortie(this.sortieIndex + 1);
    this.mode = MODE.FLYING;
  }

  retrySortie() {
    this.score -= this.sortieScore;
    this.startSortie(this.sortieIndex);
    this.mode = MODE.FLYING;
  }

  stripAltitude() {
    return runwayHeight();
  }
}
