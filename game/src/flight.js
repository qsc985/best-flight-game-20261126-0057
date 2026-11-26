// flight.js — the arcade flight model. The plane is a point with a heading,
// a pitch, a bank, a speed and a throttle; lift, drag, turning and stalling
// all come out of those numbers, and the ground decides the rest.

import { PLANE, WORLD } from './config.js';
import { isOnRunway, runwayHeight, sampleHeight } from './terrain.js';

export class FlightModel {
  constructor() {
    this.reset();
  }

  reset() {
    // On the strip, facing north down the runway, engine idling. The plane
    // sits 1 m above the strip, inside the ground-contact band, so the first
    // frame counts as resting on its wheels rather than falling from the sky.
    this.x = 0;
    this.y = WORLD.runwayAltitude + 1;
    this.z = 420;
    this.heading = 0; // radians, 0 = north (-z)
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.fuel = 100;
    this.damage = 0;
    this.verticalSpeed = 0;
    this.grounded = true;
    this.hasFlown = false; // true once the plane has left the ground
    this.stalled = false;
    this.crashed = false;
    this.landed = false;
    this.crashReason = '';
    this.flaps = false;
  }

  forward() {
    return {
      x: Math.sin(this.heading),
      y: 0,
      z: -Math.cos(this.heading),
    };
  }

  // One step of the simulation. `ctl` is { pitch, roll, throttle, brake }
  // in -1..1, `wind` is the crosswind speed in m/s, and `dt` is seconds.
  // Returns an event string ('crash' | 'landed' | '') for the state machine.
  step(dt, ctl, wind) {
    if (this.crashed || this.landed) return '';

    // Throttle and flaps.
    this.throttle = Math.max(
      0,
      Math.min(1, this.throttle + ctl.throttle * PLANE.throttleRate * dt),
    );
    this.flaps = ctl.brake;

    // Bank and pitch ease toward the pilot's input.
    const targetRoll = ctl.roll * PLANE.maxBank;
    const targetPitch = ctl.pitch * PLANE.maxPitch;
    this.roll += (targetRoll - this.roll) * Math.min(1, PLANE.bankRate * dt);
    this.pitch +=
      (targetPitch - this.pitch) * Math.min(1, PLANE.pitchRate * dt);

    // A banked wing turns the plane: coordinated-turn rate from the bank.
    const speedForTurn = Math.max(18, this.speed);
    this.heading -=
      (Math.tan(this.roll) * 9.81) / speedForTurn * dt * 0.9;

    // Speed: thrust minus drag, minus the climb's share of gravity.
    const drag = PLANE.drag * this.speed * this.speed * (this.flaps ? 1.9 : 1);
    const accel =
      this.throttle * PLANE.maxThrust -
      drag -
      9.81 * Math.sin(this.pitch) * 0.55;
    this.speed = Math.max(0, this.speed + accel * dt);
    if (this.speed > PLANE.maxSpeed) this.speed = PLANE.maxSpeed;

    // The flight path follows the pitch: nose up climbs, nose down
    // descends, level at level pitch. Below stall speed the wing stops
    // flying and the plane sinks no matter what the stick says.
    const stallSink =
      this.speed < PLANE.stallSpeed ? (PLANE.stallSpeed - this.speed) * 0.9 : 0;
    let climbRate =
      Math.sin(this.pitch) * this.speed * PLANE.climbFactor - stallSink;
    this.stalled = this.speed < PLANE.stallSpeed && !this.grounded;
    this.verticalSpeed = climbRate;

    // Wheels on the ground hold the plane up: a parked or rolling plane
    // never sinks through the strip, however hard the pilot pulls.
    if (this.grounded && climbRate < 0) climbRate = 0;

    const fwd = this.forward();
    const prevY = this.y;
    this.x += fwd.x * this.speed * dt + wind * dt;
    this.z += fwd.z * this.speed * dt;
    this.y += climbRate * dt;
    this.verticalSpeed = (this.y - prevY) / Math.max(dt, 1e-6);

    // Keep the plane inside the valley.
    const half = WORLD.gridCells * WORLD.cellSize * 0.5 - 200;
    if (Math.abs(this.x) > half || Math.abs(this.z) > half) {
      this.heading += Math.PI;
      this.x = Math.max(-half, Math.min(half, this.x));
      this.z = Math.max(-half, Math.min(half, this.z));
    }

    // Fuel: throttle burns it, idling sips it.
    this.fuel -=
      (PLANE.fuelIdleBurn + this.throttle * PLANE.fuelBurn) * dt;
    if (this.fuel <= 0) {
      this.fuel = 0;
      this.throttle = 0;
    }

    // Ground contact.
    const ground = sampleHeight(this.x, this.z);
    const clearance = this.y - ground;
    if (clearance <= 1.5) {
      const onStrip = isOnRunway(this.x, this.z);
      const gentle =
        Math.abs(this.verticalSpeed) < 4.5 &&
        this.speed < 42 &&
        Math.abs(this.roll) < 0.25 &&
        Math.abs(this.pitch) < 0.2;
      if (this.grounded && onStrip) {
        // Already rolling on the strip: stay on it, never crash for
        // sitting still or holding the stick back at low speed.
        this.y = runwayHeight() + 1.5;
        this.speed = Math.max(0, this.speed - 6 * dt);
        this.pitch = Math.min(this.pitch, 0.12);
        if (this.speed < 3 && this.throttle < 0.1 && this.hasFlown) {
          this.landed = true;
          return 'landed';
        }
        return '';
      }
      if (onStrip && gentle && this.speed > 8) {
        // Touchdown on the strip: roll out and stop.
        this.y = runwayHeight() + 1.5;
        this.grounded = true;
        this.speed = Math.max(0, this.speed - 22 * dt);
        this.pitch = 0;
        this.roll *= 0.8;
        if (this.speed < 3) {
          this.landed = true;
          return 'landed';
        }
        return '';
      }
      if (onStrip && gentle && this.speed <= 8) {
        this.y = runwayHeight() + 1.5;
        this.grounded = true;
        this.landed = true;
        return 'landed';
      }
      // Anything else is a crash: terrain, water, or a hard arrival.
      this.y = ground + 1;
      this.crashed = true;
      this.crashReason = onStrip
        ? 'Hard landing on the strip'
        : ground < WORLD.waterLevel + 1
          ? 'Ditched in the lake'
          : 'Flew into the mountainside';
      return 'crash';
    }
    this.grounded = false;
    if (clearance > 1.5) this.hasFlown = true;
    return '';
  }
}
