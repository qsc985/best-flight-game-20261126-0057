// terrain.js — the alpine valley: a heightfield, a lake, a runway strip,
// scattered pines and drifting clouds. Built once from a seed; the flight
// model and the renderer both sample from the same grid.

import { WORLD } from './config.js';
import { fbm, mulberry32, valueNoise } from './rng.js';

const N = WORLD.gridCells;
const CELL = WORLD.cellSize;
const HALF = (N * CELL) / 2;

export const heights = new Float32Array((N + 1) * (N + 1));
export const trees = [];
export const clouds = [];

function gridX(wx) {
  return (wx + HALF) / CELL;
}

function gridZ(wz) {
  return (wz + HALF) / CELL;
}

function rawHeight(wx, wz) {
  // A valley along the z axis (the runway's valley) with mountains rising
  // to the east and west, plus rolling foothills everywhere.
  const ax = Math.abs(wx);
  const ridge = fbm(wx, wz, 900, WORLD.seed, 4);
  const hills = valueNoise(wx, wz, 420, WORLD.seed + 7);
  const mountainMask = Math.min(1, Math.max(0, (ax - 700) / 2200));
  const edge = Math.min(1, Math.max(0, (Math.abs(wz) - 3400) / 1400));
  let h = 52 + hills * 16 + ridge * ridge * 420 * (0.25 + 0.75 * mountainMask);
  h += edge * 220 * (0.5 + 0.5 * ridge);
  // A lake basin south-west of the strip.
  const dx = wx + 1500;
  const dz = wz - 1900;
  const lakeD = Math.sqrt(dx * dx + dz * dz);
  if (lakeD < 900) h -= (1 - lakeD / 900) * 26;
  return h;
}

function runwayMask(wx, wz) {
  const inStrip =
    Math.abs(wx) < WORLD.runwayHalfWidth + 90 &&
    Math.abs(wz) < WORLD.runwayHalfLength + 90;
  if (!inStrip) return 0;
  const ex = Math.max(0, (Math.abs(wx) - WORLD.runwayHalfWidth) / 90);
  const ez = Math.max(0, (Math.abs(wz) - WORLD.runwayHalfLength) / 90);
  const edge = Math.max(ex, ez);
  return Math.max(0, 1 - edge);
}

export function buildTerrain() {
  for (let j = 0; j <= N; j += 1) {
    for (let i = 0; i <= N; i += 1) {
      const wx = i * CELL - HALF;
      const wz = j * CELL - HALF;
      let h = rawHeight(wx, wz);
      const m = runwayMask(wx, wz);
      if (m > 0) h = h * (1 - m) + WORLD.runwayAltitude * m;
      heights[j * (N + 1) + i] = h;
    }
  }
  // Pines on gentle, dry ground away from the strip.
  const rand = mulberry32(WORLD.seed + 31);
  let placed = 0;
  let guard = 0;
  while (placed < 260 && guard < 4000) {
    guard += 1;
    const wx = (rand() * 2 - 1) * (HALF - 300);
    const wz = (rand() * 2 - 1) * (HALF - 300);
    if (Math.abs(wx) < 160 && Math.abs(wz) < 800) continue;
    const h = sampleHeight(wx, wz);
    if (h < WORLD.waterLevel + 4 || h > 150) continue;
    trees.push({ x: wx, z: wz, y: h, s: 9 + rand() * 14 });
    placed += 1;
  }
  // Clouds drift high over the valley.
  for (let c = 0; c < 26; c += 1) {
    clouds.push({
      x: (rand() * 2 - 1) * 4200,
      z: (rand() * 2 - 1) * 4200,
      y: 330 + rand() * 220,
      s: 90 + rand() * 110,
      drift: 2 + rand() * 3,
    });
  }
}

// Bilinear sample of the heightfield at world (x, z).
export function sampleHeight(wx, wz) {
  const gx = Math.min(N - 0.001, Math.max(0, gridX(wx)));
  const gz = Math.min(N - 0.001, Math.max(0, gridZ(wz)));
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const w = N + 1;
  const h00 = heights[j * w + i];
  const h10 = heights[j * w + i + 1];
  const h01 = heights[(j + 1) * w + i];
  const h11 = heights[(j + 1) * w + i + 1];
  const top = h00 + (h10 - h00) * fx;
  const bot = h01 + (h11 - h01) * fx;
  return top + (bot - top) * fz;
}

export function isOnRunway(wx, wz) {
  return (
    Math.abs(wx) < WORLD.runwayHalfWidth &&
    Math.abs(wz) < WORLD.runwayHalfLength
  );
}

export function runwayHeight() {
  return WORLD.runwayAltitude;
}

export function worldHalf() {
  return HALF;
}
