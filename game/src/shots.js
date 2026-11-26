// shots.js — deterministic scenes for the entry's screenshots. Each shot
// places the Kestrel somewhere worth looking at (final approach, a ring
// chase, the mountain pass, touchdown) and freezes the scene clock so the
// frame is stable and repeatable.

import { MODE } from './state.js';
import { sampleHeight } from './terrain.js';

// Aim the plane at a ring from `behind` metres back along the path that
// leads into it, so the ring sits centred ahead in the frame. The plane
// sits 45 m to the side of the flight path so the ring itself stays
// visible beside the fuselage instead of hiding behind it.
function chaseRing(game, index, behind, drop) {
  const ring = game.rings[index];
  const prev = game.rings[index - 1] ?? { x: 0, z: 900 };
  const dx = ring.x - prev.x;
  const dz = ring.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const side = 45;
  game.plane.x = ring.x - ux * behind - uz * side;
  game.plane.z = ring.z - uz * behind + ux * side;
  game.plane.y = ring.y - drop;
  // Heading that faces the ring: forward is (sin h, -cos h).
  game.plane.heading = Math.atan2(ux, -uz);
  game.ringIndex = index;
}

export const SHOTS = {
  // Cover: on final approach, the strip ahead with its centreline, the
  // first ring glowing off to the left.
  approach: (game) => {
    game.plane.x = 60;
    game.plane.z = 1050;
    game.plane.y = sampleHeight(60, 1050) + 105;
    game.plane.heading = 0;
    game.plane.pitch = -0.05;
    game.plane.roll = -0.05;
    game.plane.speed = 55;
    game.plane.throttle = 0.5;
    game.plane.fuel = 72;
    game.ringIndex = 0;
  },
  // Low over the valley, chasing the second ring with the lake behind.
  rings: (game) => {
    chaseRing(game, 1, 260, 15);
    game.plane.pitch = 0.02;
    game.plane.roll = 0.28;
    game.plane.speed = 72;
    game.plane.throttle = 0.8;
    game.plane.fuel = 64;
  },
  // High over the ridge at dusk light, chasing the fourth ring between
  // the peaks.
  ridge: (game) => {
    chaseRing(game, 3, 300, 12);
    game.plane.pitch = 0.04;
    game.plane.roll = 0.16;
    game.plane.speed = 66;
    game.plane.throttle = 0.7;
    game.plane.fuel = 48;
    game.sortieIndex = 2;
  },
  // Wheels about to kiss the strip: low, slow, flaps out.
  landing: (game) => {
    game.plane.x = -30;
    game.plane.z = 900;
    game.plane.y = sampleHeight(-30, 900) + 26;
    game.plane.heading = 0;
    game.plane.pitch = -0.1;
    game.plane.roll = 0.02;
    game.plane.speed = 34;
    game.plane.throttle = 0.25;
    game.plane.fuel = 31;
    game.plane.flaps = true;
    game.rings.forEach((ring) => {
      ring.passed = true;
    });
    game.ringIndex = game.rings.length;
  },
};

export function applyShot(game, name) {
  const shot = SHOTS[name];
  if (!shot) return false;
  game.mode = MODE.FLYING;
  game.plane.grounded = false;
  shot(game);
  game.say('', 0);
  return true;
}
