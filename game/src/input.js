// input.js — keyboard and mouse. Arrow keys / WASD fly the plane, W and S
// work the throttle, Space is the airbrake (flaps), and the mouse steers
// gently when it moves: bank follows the pointer's horizontal offset from
// the centre of the screen, pitch follows the vertical offset.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseX = 0; // -1..1 across the canvas
    this.mouseY = 0; // -1..1 down the canvas
    this.mouseActive = false;
    this.mouseMovedAt = 0;
    this.pressed = new Set(); // keys pressed since the last consume
    this.canvas = canvas;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressed.add(event.code);
      if (
        event.code === 'ArrowUp' ||
        event.code === 'ArrowDown' ||
        event.code === 'ArrowLeft' ||
        event.code === 'ArrowRight' ||
        event.code === 'Space'
      ) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      this.mouseActive = true;
      this.mouseMovedAt = performance.now();
    });
    canvas.addEventListener('pointerdown', () => {
      this.pressed.add('PointerDown');
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once after the key (or pointer) was pressed; consumed on read.
  wasPressed(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  // -1..1 pitch input: ArrowUp / W is nose down in a flight stick sense,
  // so pulling back (ArrowDown / S) climbs. Mouse pull also climbs.
  pitchInput() {
    let v = 0;
    if (this.down('ArrowDown') || this.down('KeyS')) v += 1;
    if (this.down('ArrowUp') || this.down('KeyW')) v -= 1;
    if (this.mouseActive && performance.now() - this.mouseMovedAt < 2500) {
      v += -this.mouseY * 0.9;
    }
    return Math.max(-1, Math.min(1, v));
  }

  rollInput() {
    let v = 0;
    if (this.down('ArrowLeft') || this.down('KeyA')) v -= 1;
    if (this.down('ArrowRight') || this.down('KeyD')) v += 1;
    if (this.mouseActive && performance.now() - this.mouseMovedAt < 2500) {
      v += this.mouseX * 0.9;
    }
    return Math.max(-1, Math.min(1, v));
  }

  throttleInput() {
    // W/S double as throttle when held with Shift held? No: keep it simple,
    // throttle lives on its own keys so pitch and throttle never fight.
    let v = 0;
    if (this.down('ShiftLeft') || this.down('ShiftRight')) v += 1;
    if (this.down('ControlLeft') || this.down('ControlRight')) v -= 1;
    return v;
  }

  brakeDown() {
    return this.down('Space');
  }
}
