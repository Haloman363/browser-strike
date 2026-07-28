import * as THREE from 'three';

// Source-engine movement, units converted to metres (1 unit = 0.019 m).
// The accelerate/friction pair below is the actual CS formulation: capping the
// added speed by (wishSpeed - currentSpeed) projected onto wishDir is what
// makes air-strafing and bunny-hopping fall out for free.

export const MOVE = {
  maxSpeed: 4.6,        // ~250 u/s run
  crouchSpeed: 1.7,
  accelerate: 10,
  airAccelerate: 12,
  airWishCap: 0.57,     // ~30 u/s — the air-strafe knob
  friction: 5.2,
  stopSpeed: 1.9,
  gravity: 15.2,        // ~800 u/s²
  jumpImpulse: 5.6,     // 268 u/s — clears 54u (~1.03m) under this gravity
  standHeight: 1.37,
  crouchHeight: 0.97,
  radius: 0.42,
  stepHeight: 0.34,
};

export class PlayerMovement {
  constructor(world, spawn = new THREE.Vector3(0, 2, 0)) {
    this.world = world;
    this.position = spawn.clone();
    this.velocity = new THREE.Vector3();
    this.grounded = false;
    this.crouching = false;
    this.height = MOVE.standHeight;
    this.wasGrounded = false;
    this.landingImpact = 0; // consumed by the camera for landing dip
  }

  get halfExtents() {
    return new THREE.Vector3(MOVE.radius, this.height / 2, MOVE.radius);
  }

  /** Eye position: near the top of the capsule, as in CS. */
  get eye() {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + this.height / 2 - 0.09,
      this.position.z,
    );
  }

  applyFriction(dt) {
    const speed = this.velocity.length();
    if (speed < 1e-3) { this.velocity.set(0, 0, 0); return; }
    // Below stopSpeed friction acts at a constant rate, which is what gives
    // CS its crisp stop instead of an exponential crawl.
    const control = Math.max(speed, MOVE.stopSpeed);
    const drop = control * MOVE.friction * dt;
    const scale = Math.max(0, speed - drop) / speed;
    this.velocity.x *= scale;
    this.velocity.z *= scale;
  }

  accelerate(wishDir, wishSpeed, accel, dt) {
    const current = this.velocity.dot(wishDir);
    const addSpeed = wishSpeed - current;
    if (addSpeed <= 0) return;
    const accelSpeed = Math.min(accel * wishSpeed * dt, addSpeed);
    this.velocity.addScaledVector(wishDir, accelSpeed);
  }

  /**
   * @param {{forward:number, right:number, jump:boolean, crouch:boolean}} input
   * @param {number} yaw  camera yaw in radians
   */
  update(input, yaw, dt) {
    // Build the wish direction in world space from local stick input.
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const wishDir = new THREE.Vector3(
      input.forward * -sin + input.right * cos,
      0,
      input.forward * -cos - input.right * sin,
    );
    const wishLen = wishDir.length();
    if (wishLen > 1e-4) wishDir.multiplyScalar(1 / wishLen);

    this.updateStance(input.crouch);

    const wishSpeed = Math.min(wishLen, 1) *
      (this.crouching ? MOVE.crouchSpeed : MOVE.maxSpeed);

    if (this.grounded) {
      this.applyFriction(dt);
      this.accelerate(wishDir, wishSpeed, MOVE.accelerate, dt);
      this.velocity.y = 0;

      if (input.jump) {
        this.velocity.y = MOVE.jumpImpulse;
        this.grounded = false;
      }
    } else {
      // Air control: the wish speed is clamped hard, so turning the mouse
      // while holding a strafe key adds velocity perpendicular to motion.
      this.accelerate(wishDir, Math.min(wishSpeed, MOVE.airWishCap), MOVE.airAccelerate, dt);
      this.velocity.y -= MOVE.gravity * dt;
    }

    this.wasGrounded = this.grounded;
    this.moveWithSteps(dt);

    if (this.grounded && !this.wasGrounded) {
      // Landing: record impact so the camera can dip proportionally.
      this.landingImpact = Math.min(1, this.fallSpeed / 12);
    }
  }

  /**
   * Move, retrying blocked ground moves as a step-up so stairs and kerbs
   * don't stop the player dead.
   */
  moveWithSteps(dt) {
    this.fallSpeed = Math.max(0, -this.velocity.y);
    const half = this.halfExtents;

    const before = this.position.clone();
    const velCopy = this.velocity.clone();
    const out = {};
    this.world.moveSlide(this.position, half, this.velocity, dt, out);

    const movedSq = this.position.distanceToSquared(before);
    const wantedSq = velCopy.clone().multiplyScalar(dt).lengthSq();

    // Blocked on the ground? Retry the move lifted by step height, then drop
    // back down — this is how stairs and kerbs get climbed without a ramp.
    if (this.grounded && movedSq < wantedSq * 0.7) {
      const lifted = before.clone();
      lifted.y += MOVE.stepHeight;
      const stepVel = velCopy.clone();
      stepVel.y = 0;

      // Only viable if there is room to stand at the raised position.
      if (!this.world.overlaps(lifted, half)) {
        this.world.moveSlide(lifted, half, stepVel, dt, {});

        if (lifted.distanceToSquared(before) > movedSq + 1e-6) {
          // Drop straight down looking for the surface we stepped onto.
          const drop = this.world.sweep(
            lifted, half, new THREE.Vector3(0, -MOVE.stepHeight * 1.5, 0));
          if (drop && drop.normal.y > 0.7) {
            lifted.y -= MOVE.stepHeight * 1.5 * drop.t;
            this.position.copy(lifted);
            this.velocity.x = stepVel.x;
            this.velocity.z = stepVel.z;
            this.velocity.y = 0;
            out.grounded = true;
          }
        }
      }
    }

    this.world.depenetrate(this.position, half);

    // A resting player sits flush on the floor, so the movement sweep starts
    // in contact and reports nothing. Probe explicitly from just above.
    this.grounded = out.grounded || (this.velocity.y <= 1e-3 && this.probeGround());
  }

  /** True when there is floor within a small tolerance below the feet. */
  probeGround(tolerance = 0.06) {
    const half = this.halfExtents;
    const probe = this.position.clone();
    probe.y += tolerance;
    const hit = this.world.sweep(probe, half, new THREE.Vector3(0, -tolerance * 2, 0));
    if (!hit || hit.normal.y <= 0.7) return false;
    // Snap to the surface so we do not drift down a fraction each tick.
    this.position.y = probe.y - tolerance * 2 * hit.t;
    if (this.velocity.y < 0) this.velocity.y = 0;
    return true;
  }

  updateStance(wantCrouch) {
    const target = wantCrouch ? MOVE.crouchHeight : MOVE.standHeight;
    if (target === this.height) { this.crouching = wantCrouch; return; }

    if (target > this.height) {
      // Standing up: refuse if the taller box would overlap anything.
      const feet = this.position.y - this.height / 2;
      const probe = new THREE.Vector3(this.position.x, feet + target / 2, this.position.z);
      const probeHalf = new THREE.Vector3(MOVE.radius, target / 2, MOVE.radius);
      if (this.world.overlaps(probe, probeHalf)) { this.crouching = true; return; }
    }

    // Crouching keeps the feet planted; standing grows upward from the feet.
    const feet = this.position.y - this.height / 2;
    this.height = target;
    this.position.y = feet + this.height / 2;
    this.crouching = wantCrouch;
  }

  consumeLandingImpact() {
    const v = this.landingImpact;
    this.landingImpact = 0;
    return v;
  }
}
