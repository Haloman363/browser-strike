import * as THREE from 'three';
import { MOVE } from './movement.js';

// Mouse look plus the small camera motions that sell weight: view bob while
// walking, a dip on landing, and a lean into strafes. All are subtle on
// purpose — CS keeps the camera very still because it has to stay aimable.

const PITCH_LIMIT = Math.PI / 2 - 0.01;

export class PlayerCamera {
  constructor(camera, sensitivity = 0.0022) {
    this.camera = camera;
    this.sensitivity = sensitivity;
    this.yaw = 0;
    this.pitch = 0;

    this.bobPhase = 0;
    this.bobAmount = 0;
    this.landDip = 0;
    this.landDipVel = 0;
    this.roll = 0;

    // Recoil is added on top of aim and decays back — the weapon writes here.
    this.recoilPitch = 0;
    this.recoilYaw = 0;
  }

  onMouseMove(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  }

  update(movement, dt) {
    const vel = movement.velocity;
    const speed = Math.hypot(vel.x, vel.z);
    const speedRatio = Math.min(1, speed / MOVE.maxSpeed);

    // Bob only when actually on the ground and moving.
    const targetBob = movement.grounded ? speedRatio : 0;
    this.bobAmount += (targetBob - this.bobAmount) * Math.min(1, dt * 9);
    if (movement.grounded) this.bobPhase += speed * dt * 2.1;

    // Landing dip as a damped spring so it settles rather than snapping.
    const impact = movement.consumeLandingImpact();
    if (impact > 0) this.landDipVel -= impact * 2.4;
    this.landDipVel += -this.landDip * 90 * dt - this.landDipVel * 13 * dt;
    this.landDip += this.landDipVel * dt;

    // Lean into lateral movement, in camera-local space.
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const lateral = vel.dot(right) / MOVE.maxSpeed;
    this.roll += (-lateral * 0.016 - this.roll) * Math.min(1, dt * 7);

    // Recoil decays back toward the player's true aim.
    const recover = Math.min(1, dt * 7.5);
    this.recoilPitch -= this.recoilPitch * recover;
    this.recoilYaw -= this.recoilYaw * recover;

    const eye = movement.eye;
    const bobY = Math.sin(this.bobPhase) * 0.035 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase * 0.5) * 0.028 * this.bobAmount;

    this.camera.position.set(
      eye.x + right.x * bobX,
      eye.y + bobY + this.landDip,
      eye.z + right.z * bobX,
    );

    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw + this.recoilYaw);
    this.camera.rotateX(this.pitch + this.recoilPitch);
    this.camera.rotateZ(this.roll);
  }

  /** Aim direction, recoil included — hitscan must use this. */
  get aimDirection() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  addRecoil(pitch, yaw) {
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;
  }
}
