// render.js — everything on screen: sky, sun and clouds, the heightfield
// terrain projected in 3D, the runway, the glowing rings, the pines, the
// Kestrel in chase view, and the lit instruments. All drawing is plain
// canvas 2D; the 3D is a small perspective projection done by hand.

import { HUD_COLORS, WORLD } from './config.js';
import { MODE } from './state.js';
import {
  clouds,
  heights,
  isOnRunway,
  sampleHeight,
  trees,
  worldHalf,
} from './terrain.js';

const N = WORLD.gridCells;
const CELL = WORLD.cellSize;
const HALF = (N * CELL) / 2;

// --- terrain palette: height band x shade band, mixed once at load --------
function shadeRgb(r, g, b, f) {
  const cr = Math.max(0, Math.min(255, Math.round(r * f)));
  const cg = Math.max(0, Math.min(255, Math.round(g * f)));
  const cb = Math.max(0, Math.min(255, Math.round(b * f)));
  return `rgb(${cr},${cg},${cb})`;
}

const BANDS = [
  [52, 96, 46], // low meadow
  [74, 122, 54], // grass
  [96, 138, 66], // high pasture
  [122, 116, 96], // rock
  [150, 142, 128], // high rock
  [232, 238, 244], // snow
];
const SHADES = [0.62, 0.78, 0.92, 1.05, 1.16];
const PALETTE = [];
for (const band of BANDS) {
  for (const s of SHADES) PALETTE.push(shadeRgb(band[0], band[1], band[2], s));
}
const WATER = [0.55, 0.72, 0.88, 1.0, 1.1].map((s) =>
  shadeRgb(38, 106, 138, s),
);
const RUNWAY_COL = [0.6, 0.78, 0.95, 1.08, 1.18].map((s) =>
  shadeRgb(74, 76, 80, s),
);

function heightBand(h) {
  if (h < 48) return 0;
  if (h < 85) return 1;
  if (h < 140) return 2;
  if (h < 210) return 3;
  if (h < 300) return 4;
  return 5;
}

// Per-vertex light: the sun sits in the south-west, so slopes facing it
// read brighter. Computed once from the heightfield.
const vertexLight = new Uint8Array((N + 1) * (N + 1));
export function buildLighting() {
  const w = N + 1;
  for (let j = 0; j <= N; j += 1) {
    for (let i = 0; i <= N; i += 1) {
      const hL = heights[j * w + Math.max(0, i - 1)];
      const hR = heights[j * w + Math.min(N, i + 1)];
      const hU = heights[Math.max(0, j - 1) * w + i];
      const hD = heights[Math.min(N, j + 1) * w + i];
      const slopeX = (hR - hL) / (2 * CELL);
      const slopeZ = (hD - hU) / (2 * CELL);
      // Sun from the south-west and high: light = 1 - slope toward sun.
      let light = 1 - slopeX * 0.9 - slopeZ * 0.55;
      light = Math.max(0, Math.min(4, Math.round(light * 2)));
      vertexLight[j * w + i] = light;
    }
  }
}

function fmt(n, digits = 0) {
  return n.toFixed(digits);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.camX = 0;
    this.camY = 120;
    this.camZ = 480;
    this.camHeading = 0;
    this.camPitch = 0;
    this.camRoll = 0;
    this.time = 0;
    this.rowOrder = new Int32Array(N + 1);
    this.resize();
  }

  resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
  }

  // --- camera ------------------------------------------------------------
  updateCamera(plane, dt, snap) {
    const fwd = plane.forward();
    const tx = plane.x - fwd.x * 30;
    const ty = plane.y + 11 - plane.pitch * 8;
    const tz = plane.z - fwd.z * 30;
    const k = snap ? 1 : Math.min(1, dt * 4.5);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.camZ += (tz - this.camZ) * k;
    // Ease the camera heading around the short way.
    let dh = plane.heading - this.camHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.camHeading += dh * Math.min(1, dt * 5);
    this.camPitch = plane.pitch * 0.55;
    this.camRoll = plane.roll * 0.4;
  }

  basis() {
    const ch = this.camHeading;
    const cp = this.camPitch;
    // Camera forward, from heading and pitch.
    let fx = Math.sin(ch) * Math.cos(cp);
    let fy = Math.sin(cp);
    let fz = -Math.cos(ch) * Math.cos(cp);
    const fl = Math.hypot(fx, fy, fz);
    fx /= fl;
    fy /= fl;
    fz /= fl;
    // Right = forward x world-up, then rolled by the camera bank.
    let rx = -fz;
    let ry = 0;
    let rz = fx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl;
    ry /= rl;
    rz /= rl;
    // Up = right x forward.
    let ux = ry * fz - rz * fy;
    let uy = rz * fx - rx * fz;
    let uz = rx * fy - ry * fx;
    // Roll the camera: rotate right/up around forward.
    const cr = Math.cos(this.camRoll);
    const sr = Math.sin(this.camRoll);
    const nrx = rx * cr - ux * sr;
    const nry = ry * cr - uy * sr;
    const nrz = rz * cr - uz * sr;
    const nux = rx * sr + ux * cr;
    const nuy = ry * sr + uy * cr;
    const nuz = rz * sr + uz * cr;
    return { fx, fy, fz, rx: nrx, ry: nry, rz: nrz, ux: nux, uy: nuy, uz: nuz };
  }

  project(x, y, z, b, focal) {
    const dx = x - this.camX;
    const dy = y - this.camY;
    const dz = z - this.camZ;
    const cz = dx * b.fx + dy * b.fy + dz * b.fz;
    if (cz < 2) return null;
    const cx = dx * b.rx + dy * b.ry + dz * b.rz;
    const cy = dx * b.ux + dy * b.uy + dz * b.uz;
    return {
      x: this.w / 2 + (cx * focal) / cz,
      y: this.h * 0.55 - (cy * focal) / cz,
      d: cz,
    };
  }

  // --- frame ---------------------------------------------------------------
  draw(game, time) {
    this.time = time;
    const ctx = this.ctx;
    const plane = game.plane;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const b = this.basis();
    const focal = (this.h * 0.5) / Math.tan((72 * Math.PI) / 360);

    this.drawSky(game, b, focal);
    this.drawClouds(b, focal);
    this.drawTerrain(b, focal);
    this.drawRunway(b, focal);
    this.drawRings(game, b, focal);
    this.drawTrees(b, focal);
    this.drawPlaneShadow(game, b, focal);
    if (game.mode !== MODE.TITLE) this.drawPlane(game);
    this.drawHud(game);
    this.drawScreens(game);
  }

  drawSky(game, b, focal) {
    const ctx = this.ctx;
    const dusk = game.sortieIndex >= 2;
    const top = dusk ? '#2c3e63' : '#2f6fb8';
    const mid = dusk ? '#7d8fb5' : '#7db4e2';
    const low = dusk ? '#e8b07a' : '#cfe8f5';
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, top);
    g.addColorStop(0.45, mid);
    g.addColorStop(0.62, low);
    g.addColorStop(1, '#dfe9ee');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    // Sun: fixed in the south-west sky.
    const sun = this.project(-2600, 900, 2600, b, focal);
    if (sun) {
      const rg = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 90);
      rg.addColorStop(0, 'rgba(255, 246, 214, 0.95)');
      rg.addColorStop(0.25, 'rgba(255, 224, 150, 0.75)');
      rg.addColorStop(1, 'rgba(255, 224, 150, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 90, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawClouds(b, focal) {
    const ctx = this.ctx;
    const list = [];
    for (const c of clouds) {
      const driftX = c.x + this.time * c.drift;
      const p = this.project(driftX, c.y, c.z, b, focal);
      if (p && p.x > -300 && p.x < this.w + 300 && p.y > -100 && p.y < this.h * 0.75) {
        list.push({ p, s: (c.s * focal) / p.d });
      }
    }
    list.sort((a, c2) => c2.p.d - a.p.d);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    for (const item of list) {
      const { p, s } = item;
      if (s < 6) continue;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - s * 0.55, p.y + s * 0.08, s * 0.6, s * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + s * 0.55, p.y + s * 0.08, s * 0.6, s * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTerrain(b, focal) {
    const ctx = this.ctx;
    const w = N + 1;
    // Rows far-to-near by their centre depth, computed once per frame.
    // A row behind the camera gets a negative depth and is drawn last,
    // but its quads all fail the projection test and are skipped cheaply.
    const rowDepth = new Float32Array(N + 1);
    for (let j = 0; j <= N; j += 1) {
      const wz = j * CELL - HALF;
      rowDepth[j] = (0 - this.camX) * b.fx + (wz - this.camZ) * b.fz;
    }
    for (let j = 0; j <= N; j += 1) this.rowOrder[j] = j;
    const order = this.rowOrder;
    // Insertion sort is fine for 161 rows and keeps the frame cheap.
    for (let a = 1; a <= N; a += 1) {
      const v = order[a];
      const dv = rowDepth[v];
      let c = a - 1;
      while (c >= 0 && rowDepth[order[c]] < dv) {
        order[c + 1] = order[c];
        c -= 1;
      }
      order[c + 1] = v;
    }
    const horizonY = this.h * 0.55;
    for (let ri = 0; ri <= N; ri += 1) {
      const j = order[ri];
      if (j >= N) continue;
      const wz0 = j * CELL - HALF;
      const wz1 = wz0 + CELL;
      const depth = Math.abs(rowDepth[j]);
      const step = depth < 900 ? 1 : depth < 2200 ? 2 : 4;
      for (let i = 0; i < N; i += step) {
        const i2 = Math.min(N, i + step);
        const wx0 = i * CELL - HALF;
        const wx1 = i2 * CELL - HALF;
        const h00 = heights[j * w + i];
        const h10 = heights[j * w + i2];
        const h01 = heights[(j + 1) * w + i];
        const h11 = heights[(j + 1) * w + i2];
        const p00 = this.project(wx0, h00, wz0, b, focal);
        const p10 = this.project(wx1, h10, wz0, b, focal);
        const p11 = this.project(wx1, h11, wz1, b, focal);
        const p01 = this.project(wx0, h01, wz1, b, focal);
        if (!p00 || !p10 || !p11 || !p01) continue;
        const minX = Math.min(p00.x, p10.x, p11.x, p01.x);
        const maxX = Math.max(p00.x, p10.x, p11.x, p01.x);
        if (maxX < -40 || minX > this.w + 40) continue;
        const minY = Math.min(p00.y, p10.y, p11.y, p01.y);
        const maxY = Math.max(p00.y, p10.y, p11.y, p01.y);
        if (maxY < -40 || minY > this.h + 40) continue;
        const avgH = (h00 + h10 + h01 + h11) / 4;
        const light =
          (vertexLight[j * w + i] +
            vertexLight[j * w + i2] +
            vertexLight[(j + 1) * w + i] +
            vertexLight[(j + 1) * w + i2]) >>
          2;
        let color;
        if (avgH < WORLD.waterLevel) {
          color = WATER[light];
        } else if (isOnRunway((wx0 + wx1) / 2, (wz0 + wz1) / 2)) {
          color = RUNWAY_COL[light];
        } else {
          color = PALETTE[heightBand(avgH) * 5 + light];
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fill();
        // Stroke with the same colour: without it, anti-aliasing leaves a
        // hairline grid over the whole valley.
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // Aerial haze toward the horizon.
    const haze = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
    haze.addColorStop(0, 'rgba(207, 232, 245, 0.55)');
    haze.addColorStop(1, 'rgba(207, 232, 245, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, this.w, horizonY + 40);
  }

  drawRunway(b, focal) {
    const ctx = this.ctx;
    const rw = WORLD.runwayHalfWidth;
    const rl = WORLD.runwayHalfLength;
    const y = WORLD.runwayAltitude + 0.6;
    // Edge lines and centreline dashes, projected as 3D polylines.
    const line = (pts, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      for (const [x, z] of pts) {
        const p = this.project(x, y, z, b, focal);
        if (!p) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
    };
    line([[-rw, -rl], [-rw, rl]], 'rgba(255,255,255,0.85)', 2);
    line([[rw, -rl], [rw, rl]], 'rgba(255,255,255,0.85)', 2);
    for (let z = -rl + 40; z < rl - 40; z += 90) {
      line([[0, z], [0, z + 45]], 'rgba(255,255,255,0.9)', 3);
    }
    // Threshold bars at both ends.
    for (const zEnd of [-rl + 12, rl - 12]) {
      for (let k = -2; k <= 2; k += 1) {
        line(
          [[k * 12 - 5, zEnd], [k * 12 + 5, zEnd]],
          'rgba(255,255,255,0.9)',
          4,
        );
      }
    }
    // A windsock near the strip's south end.
    const sock = this.project(rw + 26, y + 14, rl - 60, b, focal);
    if (sock) {
      const s = Math.max(2, (26 * focal) / sock.d / 26);
      ctx.fillStyle = '#ff7a2f';
      ctx.beginPath();
      ctx.moveTo(sock.x, sock.y - s * 0.5);
      ctx.lineTo(sock.x + s * 1.6, sock.y - s * 0.2);
      ctx.lineTo(sock.x + s * 1.6, sock.y + s * 0.2);
      ctx.lineTo(sock.x, sock.y + s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sock.x, sock.y + s * 0.5);
      ctx.lineTo(sock.x, sock.y + s * 1.6);
      ctx.stroke();
    }
  }

  drawRings(game, b, focal) {
    const ctx = this.ctx;
    game.rings.forEach((ring, idx) => {
      if (ring.passed) return;
      const p = this.project(ring.x, ring.y, ring.z, b, focal);
      if (!p) return;
      const radiusPx = (26 * focal) / p.d;
      if (radiusPx < 3 || radiusPx > 900) return;
      const active = idx === game.ringIndex;
      // The ring faces the flight path: squash the ellipse by the angle
      // between the view direction and the ring's normal (approx. the
      // direction to the next ring or the strip).
      const next = game.rings[idx + 1] ?? { x: 0, z: 0 };
      const nx = next.x - ring.x;
      const nz = next.z - ring.z;
      const nl = Math.hypot(nx, nz) || 1;
      const facing = Math.abs((nx / nl) * b.fx + (nz / nl) * b.fz);
      const squash = Math.max(0.22, Math.min(1, facing + 0.25));
      const pulse = active ? 1 + Math.sin(this.time * 4) * 0.06 : 1;
      const rx = radiusPx * pulse;
      const ry = radiusPx * squash * pulse;
      const col = active ? '#ffd23e' : '#8cdcff';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = Math.max(3, radiusPx * 0.16);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(2, radiusPx * 0.05);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (active) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(11, Math.min(18, radiusPx * 0.24))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`RING ${idx + 1}`, 0, -ry - 10);
      }
      ctx.restore();
    });
  }

  drawTrees(b, focal) {
    const ctx = this.ctx;
    const list = [];
    for (const t of trees) {
      const dx = t.x - this.camX;
      const dz = t.z - this.camZ;
      const dist = Math.hypot(dx, dz);
      if (dist > 1600) continue;
      const p = this.project(t.x, t.y, t.z, b, focal);
      if (!p || p.x < -20 || p.x > this.w + 20 || p.y < -20 || p.y > this.h + 20) {
        continue;
      }
      list.push({ p, t, dist });
    }
    list.sort((a, c) => c.dist - a.dist);
    for (const { p, t } of list) {
      const s = (t.s * focal) / p.d;
      if (s < 1.5) continue;
      ctx.fillStyle = '#2c5a2e';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x - s * 0.45, p.y);
      ctx.lineTo(p.x + s * 0.45, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3c7a38';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s * 1.35);
      ctx.lineTo(p.x - s * 0.32, p.y - s * 0.4);
      ctx.lineTo(p.x + s * 0.32, p.y - s * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawPlaneShadow(game, b, focal) {
    const plane = game.plane;
    const ground = sampleHeight(plane.x, plane.z);
    if (plane.y - ground > 260) return;
    const p = this.project(plane.x, ground + 1, plane.z, b, focal);
    if (!p) return;
    const r = Math.max(4, (16 * focal) / p.d);
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10, 20, 25, 0.28)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // The Kestrel mail plane in chase view: cream fuselage, orange stripe,
  // high wings, tail, canopy and a spinning prop at the nose.
  drawPlane(game) {
    const ctx = this.ctx;
    const plane = game.plane;
    const cx = this.w / 2;
    const cy = this.h * 0.62;
    const s = Math.min(this.w, this.h) / 620;
    const blink = Math.sin(this.time * 5) > 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(plane.roll * 0.85);
    ctx.scale(s, s);
    // Wings (high wing, swept slightly back).
    ctx.fillStyle = '#e8590c';
    ctx.beginPath();
    ctx.moveTo(-118, -6);
    ctx.lineTo(118, -6);
    ctx.lineTo(104, 16);
    ctx.lineTo(-104, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f8f1de';
    ctx.beginPath();
    ctx.moveTo(-118, -6);
    ctx.lineTo(118, -6);
    ctx.lineTo(112, 2);
    ctx.lineTo(-112, 2);
    ctx.closePath();
    ctx.fill();
    // Tailplane and fin.
    ctx.fillStyle = '#e8590c';
    ctx.beginPath();
    ctx.moveTo(-46, -58);
    ctx.lineTo(46, -58);
    ctx.lineTo(36, -44);
    ctx.lineTo(-36, -44);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, -58);
    ctx.lineTo(10, -92);
    ctx.lineTo(16, -58);
    ctx.closePath();
    ctx.fill();
    // Fuselage.
    const fg = ctx.createLinearGradient(-14, 0, 14, 0);
    fg.addColorStop(0, '#d9cba6');
    fg.addColorStop(0.5, '#f8f1de');
    fg.addColorStop(1, '#d9cba6');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(0, -96);
    ctx.quadraticCurveTo(15, -70, 14, -30);
    ctx.lineTo(12, 34);
    ctx.quadraticCurveTo(10, 52, 0, 54);
    ctx.quadraticCurveTo(-10, 52, -12, 34);
    ctx.lineTo(-14, -30);
    ctx.quadraticCurveTo(-15, -70, 0, -96);
    ctx.fill();
    // Orange cheatline.
    ctx.fillStyle = '#e8590c';
    ctx.fillRect(-13, -18, 26, 7);
    // Canopy.
    ctx.fillStyle = '#1d3a4d';
    ctx.beginPath();
    ctx.ellipse(0, -58, 8, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(180, 230, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-2, -62, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Propeller blur at the nose.
    const propA = this.time * 28;
    ctx.save();
    ctx.translate(0, -96);
    ctx.rotate(propA % Math.PI);
    ctx.fillStyle = 'rgba(40, 40, 40, 0.35)';
    ctx.fillRect(-34, -2.5, 68, 5);
    ctx.restore();
    ctx.strokeStyle = 'rgba(60, 60, 60, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -96, 34, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Navigation lights.
    if (blink) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(-118, 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#35e05a';
      ctx.beginPath();
      ctx.arc(118, 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Speed lines when fast.
    if (plane.speed > 55) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i += 1) {
        const ly = cy - 120 + i * 60 + ((this.time * 400 + i * 137) % 60);
        ctx.beginPath();
        ctx.moveTo(cx - 170, ly);
        ctx.lineTo(cx - 150, ly);
        ctx.moveTo(cx + 150, ly);
        ctx.lineTo(cx + 170, ly);
        ctx.stroke();
      }
    }
  }

  // --- HUD -----------------------------------------------------------------
  panel(x, y, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = HUD_COLORS.panel;
    ctx.strokeStyle = HUD_COLORS.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
  }

  drawHud(game) {
    const ctx = this.ctx;
    const plane = game.plane;
    const knots = plane.speed * 1.944;
    const altFt = Math.max(0, plane.y * 3.281);
    const hdg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
    const vsFpm = plane.verticalSpeed * 196.85;
    ctx.textBaseline = 'alphabetic';

    // Top-left: primary instruments.
    this.panel(14, 14, 218, 108);
    ctx.textAlign = 'left';
    ctx.fillStyle = HUD_COLORS.cyan;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('ALT', 26, 38);
    ctx.fillText('SPD', 26, 66);
    ctx.fillText('HDG', 26, 94);
    ctx.fillStyle = HUD_COLORS.amber;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(altFt)} ft`, 220, 40);
    ctx.fillText(`${Math.round(knots)} kt`, 220, 68);
    ctx.fillText(`${String(Math.round(hdg)).padStart(3, '0')}°`, 220, 96);
    ctx.textAlign = 'left';
    ctx.fillStyle = plane.verticalSpeed >= 0 ? HUD_COLORS.green : HUD_COLORS.amber;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(
      `V/S ${vsFpm >= 0 ? '+' : ''}${Math.round(vsFpm)} fpm`,
      26,
      114,
    );

    // Top-centre: compass tape.
    const tapeW = 320;
    const tapeX = this.w / 2 - tapeW / 2;
    this.panel(tapeX, 14, tapeW, 40);
    ctx.save();
    ctx.beginPath();
    ctx.rect(tapeX, 14, tapeW, 40);
    ctx.clip();
    const degPerPx = 0.45;
    for (let d = 0; d < 360; d += 5) {
      let rel = ((d - hdg + 540) % 360) - 180;
      const x = this.w / 2 + rel / degPerPx;
      if (x < tapeX - 10 || x > tapeX + tapeW + 10) continue;
      const major = d % 30 === 0;
      ctx.strokeStyle = major ? HUD_COLORS.white : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 44);
      ctx.lineTo(x, major ? 28 : 36);
      ctx.stroke();
      if (major) {
        const label =
          d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d);
        ctx.fillStyle = HUD_COLORS.white;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, 26);
      }
    }
    ctx.restore();
    ctx.fillStyle = HUD_COLORS.amber;
    ctx.beginPath();
    ctx.moveTo(this.w / 2, 54);
    ctx.lineTo(this.w / 2 - 5, 46);
    ctx.lineTo(this.w / 2 + 5, 46);
    ctx.closePath();
    ctx.fill();

    // Top-right: fuel, score, rings, time.
    this.panel(this.w - 232, 14, 218, 108);
    ctx.textAlign = 'left';
    ctx.fillStyle = HUD_COLORS.cyan;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('FUEL', this.w - 220, 38);
    ctx.fillText('SCORE', this.w - 220, 66);
    ctx.fillText('RINGS', this.w - 220, 94);
    ctx.fillStyle = plane.fuel < 20 ? HUD_COLORS.red : HUD_COLORS.amber;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(plane.fuel)}%`, this.w - 26, 40);
    ctx.fillStyle = HUD_COLORS.amber;
    ctx.fillText(`${game.score}`, this.w - 26, 68);
    ctx.fillText(`${game.ringIndex}/${game.rings.length}`, this.w - 26, 96);
    // Fuel bar.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(this.w - 220, 100, 194, 6);
    ctx.fillStyle = plane.fuel < 20 ? HUD_COLORS.red : HUD_COLORS.green;
    ctx.fillRect(this.w - 220, 100, 194 * (plane.fuel / 100), 6);

    // Objective line under the compass.
    ctx.textAlign = 'center';
    ctx.fillStyle = HUD_COLORS.white;
    ctx.font = 'bold 15px monospace';
    ctx.fillText(game.objectiveText(), this.w / 2, 76);
    ctx.fillStyle = HUD_COLORS.amber;
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${game.sortie().name}   ·   ${fmt(game.sortieTime, 0)}s`, this.w / 2, 96);

    // Bottom-left: artificial horizon.
    const ax = 78;
    const ay = this.h - 78;
    const ar = 54;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(ax, ay);
    ctx.rotate(-plane.roll);
    ctx.translate(0, plane.pitch * 90);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-ar - 10, -ar - 90, ar * 2 + 20, ar + 90);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-ar - 10, 0, ar * 2 + 20, ar + 90);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-ar, 0);
    ctx.lineTo(ar, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = HUD_COLORS.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings on the horizon.
    ctx.strokeStyle = HUD_COLORS.amber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax - 34, ay);
    ctx.lineTo(ax - 10, ay);
    ctx.moveTo(ax + 10, ay);
    ctx.lineTo(ax + 34, ay);
    ctx.stroke();
    ctx.fillStyle = HUD_COLORS.cyan;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', ax, ay + ar + 16);

    // Bottom-right: throttle.
    const tx = this.w - 46;
    const ty0 = this.h - 150;
    const th = 110;
    this.panel(tx - 16, ty0 - 14, 60, th + 44);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(tx, ty0, 14, th);
    const thrH = th * plane.throttle;
    ctx.fillStyle = plane.throttle > 0.85 ? HUD_COLORS.red : HUD_COLORS.green;
    ctx.fillRect(tx, ty0 + th - thrH, 14, thrH);
    ctx.fillStyle = HUD_COLORS.cyan;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('THR', tx + 7, ty0 - 20);
    ctx.fillStyle = HUD_COLORS.amber;
    ctx.fillText(`${Math.round(plane.throttle * 100)}%`, tx + 7, ty0 + th + 16);
    if (plane.flaps) {
      ctx.fillStyle = HUD_COLORS.amber;
      ctx.fillText('FLAPS', tx + 7, ty0 + th + 32);
    }

    // Centre crosshair.
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.5;
    const chx = this.w / 2;
    const chy = this.h * 0.42;
    ctx.beginPath();
    ctx.moveTo(chx - 12, chy);
    ctx.lineTo(chx + 12, chy);
    ctx.moveTo(chx, chy - 12);
    ctx.lineTo(chx, chy + 12);
    ctx.stroke();

    // Warnings.
    const warnY = this.h * 0.3;
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px monospace';
    if (plane.stalled && game.mode === MODE.FLYING) {
      if (Math.sin(this.time * 10) > 0) {
        ctx.fillStyle = HUD_COLORS.red;
        ctx.fillText('⚠ STALL — NOSE DOWN, THROTTLE UP', this.w / 2, warnY);
      }
    } else if (plane.fuel < 20 && plane.fuel > 0 && game.mode === MODE.FLYING) {
      ctx.fillStyle = HUD_COLORS.red;
      ctx.fillText('LOW FUEL — HEAD FOR THE STRIP', this.w / 2, warnY);
    } else if (plane.fuel <= 0 && game.mode === MODE.FLYING) {
      ctx.fillStyle = HUD_COLORS.red;
      ctx.fillText('OUT OF FUEL — GLIDING', this.w / 2, warnY);
    }
    const ground = sampleHeight(plane.x, plane.z);
    if (
      game.mode === MODE.FLYING &&
      plane.y - ground < 45 &&
      plane.y - ground > 2 &&
      plane.verticalSpeed < -3
    ) {
      ctx.fillStyle = HUD_COLORS.red;
      ctx.fillText('⚠ PULL UP', this.w / 2, warnY + 30);
    }

    // Transient message.
    if (game.message && this.time < game.messageUntil) {
      ctx.fillStyle = HUD_COLORS.white;
      ctx.font = 'bold 16px monospace';
      ctx.fillText(game.message, this.w / 2, this.h - 170);
    }

    // Controls hint, bottom centre.
    if (game.mode === MODE.FLYING) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '12px monospace';
      ctx.fillText('Arrows / WASD fly · Shift/Ctrl throttle · Space flaps · P pause · M mute', this.w / 2, this.h - 12);
    }
  }

  // --- full-screen states --------------------------------------------------
  overlay(title, lines, accent) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(6, 14, 20, 0.55)';
    ctx.fillRect(0, 0, this.w, this.h);
    const bw = Math.min(640, this.w - 60);
    const bh = 150 + lines.length * 26;
    const bx = this.w / 2 - bw / 2;
    const by = this.h / 2 - bh / 2;
    this.panel(bx, by, bw, bh);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 30px monospace';
    ctx.fillText(title, this.w / 2, by + 52);
    ctx.fillStyle = HUD_COLORS.white;
    ctx.font = '15px monospace';
    lines.forEach((line, i) => {
      ctx.fillText(line, this.w / 2, by + 92 + i * 26);
    });
  }

  drawScreens(game) {
    const ctx = this.ctx;
    const plane = game.plane;
    if (game.mode === MODE.TITLE) {
      this.overlay('KESTREL MAIL RUN', [
        game.sortie().name,
        game.sortie().briefing,
        '',
        'Arrows / WASD — pitch and bank   ·   Shift / Ctrl — throttle',
        'Space — flaps (airbrake)   ·   Mouse — steer gently',
        'Fly the rings, then land on the strip to deliver the mail.',
        '',
        'Press Enter or click to fly',
      ], HUD_COLORS.amber);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('An original game built for make.fun — no network, no libraries', this.w / 2, this.h - 24);
    } else if (game.mode === MODE.PAUSED) {
      this.overlay('PAUSED', ['Press P or Enter to keep flying', 'R — restart the sortie'], HUD_COLORS.cyan);
    } else if (game.mode === MODE.CRASHED) {
      this.overlay('CRASHED', [
        plane.crashReason,
        `Score ${game.score}   ·   Best ${game.bestScore}`,
        '',
        'R — fly again    ·    Enter — retry this sortie',
      ], HUD_COLORS.red);
    } else if (game.mode === MODE.SORTIE_DONE) {
      const fuelBonus = Math.round(plane.fuel * 6);
      this.overlay('MAIL DELIVERED!', [
        `${game.sortie().name} complete`,
        `Sortie score ${game.sortieScore}   ·   Fuel bonus ${fuelBonus}`,
        `Total score ${game.score}   ·   Best ${game.bestScore}`,
        '',
        'Enter — next sortie    ·    R — fly it all again',
      ], HUD_COLORS.green);
    }
  }
}
