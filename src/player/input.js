// Pointer-lock input. Mouse deltas accumulate between frames so a 1000Hz
// mouse is not throttled to the frame rate.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouse1 = false;
    this.locked = false;

    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.mouse1 = false; }
    });

    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.mouse1 = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse1 = false; });

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      // Space scrolls the page otherwise, which fights the jump key.
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  /** Movement state for this frame; also drains the mouse delta. */
  sample() {
    const k = this.keys;
    const state = {
      forward: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      right: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      jump: k.has('Space'),
      crouch: k.has('ControlLeft') || k.has('KeyC'),
      reload: k.has('KeyR'),
      walk: k.has('ShiftLeft'),
      fire: this.mouse1,
      dx: this.mouseDX,
      dy: this.mouseDY,
    };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return state;
  }
}
