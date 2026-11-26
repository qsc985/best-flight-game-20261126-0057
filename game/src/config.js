// config.js — tuning constants and sortie definitions for Kestrel Mail Run.
// One place for every number the flight model, the world and the HUD share.

export const WORLD = {
  gridCells: 160, // terrain mesh is gridCells x gridCells
  cellSize: 60, // metres per cell, so the world spans 9.6 km a side
  waterLevel: 34, // metres; terrain below this is lake water
  runwayHalfWidth: 42,
  runwayHalfLength: 620,
  runwayAltitude: 40, // metres, the flattened strip's height
  seed: 20261126,
};

export const PLANE = {
  maxThrottle: 1,
  throttleRate: 0.55, // per second
  maxThrust: 26, // m/s^2 at full throttle
  drag: 0.0035, // quadratic drag: full throttle balances near 86 m/s
  stallSpeed: 26, // m/s; below this the wing stops flying
  cruiseSpeed: 62,
  maxSpeed: 95,
  maxBank: 1.05, // radians, about 60 degrees
  bankRate: 2.4, // radians per second toward the target bank
  pitchRate: 1.5,
  maxPitch: 0.55,
  climbFactor: 0.9,
  fuelCapacity: 100,
  fuelBurn: 2.1, // units per second at full throttle
  fuelIdleBurn: 0.25,
};

export const RINGS = {
  radius: 26, // metres, the ring's inner radius
  passRadius: 24, // metres from the ring centre counts as flown through
  points: 250,
};

// Sorties: each one is a mail run. Rings first, then land on the strip to
// deliver. Later sorties add wind, more rings and a tighter fuel budget.
export const SORTIES = [
  {
    name: 'Sortie 1 — First Post',
    rings: 5,
    wind: 0,
    fuel: 100,
    briefing: 'Fly the rings over the valley, then land on the strip to deliver the mail.',
  },
  {
    name: 'Sortie 2 — Crosswind Post',
    rings: 6,
    wind: 7,
    fuel: 95,
    briefing: 'A crosswind is blowing across the valley. Mind your drift on final.',
  },
  {
    name: 'Sortie 3 — High Ridge Post',
    rings: 7,
    wind: 11,
    fuel: 90,
    briefing: 'Rings climb over the high ridge. Watch your fuel and your altitude.',
  },
];

export const SCORE = {
  ring: 250,
  landing: 500,
  fuelBonusPerUnit: 6,
  timeBonusPerSecond: 3,
};

export const HUD_COLORS = {
  panel: 'rgba(8, 18, 26, 0.62)',
  panelEdge: 'rgba(140, 220, 255, 0.35)',
  amber: '#ffc857',
  green: '#7dff9a',
  cyan: '#8cdcff',
  red: '#ff5a4e',
  white: '#f2f7fa',
};
