// rng.js — deterministic seeded randomness and 2D value noise for the terrain.
// Everything the world generator needs comes from here so a given seed always
// builds the same valley, mountains and lake.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Smooth value noise in [-1, 1] at world coordinates (x, z), cell size `cell`.
export function valueNoise(x, z, cell, seed) {
  const gx = x / cell;
  const gz = z / cell;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = smooth(gx - ix);
  const fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed) * 2 - 1;
  const b = hash2(ix + 1, iz, seed) * 2 - 1;
  const c = hash2(ix, iz + 1, seed) * 2 - 1;
  const d = hash2(ix + 1, iz + 1, seed) * 2 - 1;
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fz;
}

// Fractal brownian motion: several octaves of value noise, result in [-1, 1].
export function fbm(x, z, cell, seed, octaves) {
  let sum = 0;
  let amp = 1;
  let total = 0;
  let c = cell;
  for (let o = 0; o < octaves; o += 1) {
    sum += valueNoise(x, z, c, seed + o * 101) * amp;
    total += amp;
    amp *= 0.5;
    c *= 0.5;
  }
  return sum / total;
}
