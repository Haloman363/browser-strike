import * as THREE from 'three';

// Swept-AABB collision against static axis-aligned brushes.
// ponytail: AABB brushes only, no arbitrary mesh collision. The map is built
// from boxes, so this is exact. Swap for a BVH over triangles if the map ever
// grows ramps or curved geometry.

const EPS = 1e-4;

export class CollisionWorld {
  constructor() {
    /** @type {THREE.Box3[]} */
    this.brushes = [];
  }

  addBox(center, size) {
    const half = new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2);
    this.brushes.push(new THREE.Box3(
      new THREE.Vector3().copy(center).sub(half),
      new THREE.Vector3().copy(center).add(half),
    ));
    return this;
  }

  /**
   * Sweep an AABB (described by half-extents) from `pos` along `delta`.
   * Returns the earliest time of impact in [0,1] and the surface normal,
   * or null when the path is clear.
   */
  sweep(pos, half, delta) {
    let bestT = 1;
    let bestNormal = null;

    for (const brush of this.brushes) {
      // Minkowski expansion: inflate the brush by our half-extents, then the
      // sweep reduces to a ray-vs-box test from the box centre.
      const minX = brush.min.x - half.x, maxX = brush.max.x + half.x;
      const minY = brush.min.y - half.y, maxY = brush.max.y + half.y;
      const minZ = brush.min.z - half.z, maxZ = brush.max.z + half.z;

      // Already penetrating: skip, depenetration handles it separately.
      if (pos.x > minX && pos.x < maxX &&
          pos.y > minY && pos.y < maxY &&
          pos.z > minZ && pos.z < maxZ) continue;

      let tMin = 0, tMax = 1, normalAxis = -1, normalSign = 0;

      const lo = [minX, minY, minZ];
      const hi = [maxX, maxY, maxZ];
      const p = [pos.x, pos.y, pos.z];
      const d = [delta.x, delta.y, delta.z];

      let hit = true;
      for (let axis = 0; axis < 3; axis++) {
        if (Math.abs(d[axis]) < EPS) {
          // Parallel to this slab: must already be inside it.
          if (p[axis] < lo[axis] || p[axis] > hi[axis]) { hit = false; break; }
          continue;
        }
        const inv = 1 / d[axis];
        let t1 = (lo[axis] - p[axis]) * inv;
        let t2 = (hi[axis] - p[axis]) * inv;
        let sign = -1;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
        if (t1 > tMin) { tMin = t1; normalAxis = axis; normalSign = sign; }
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) { hit = false; break; }
      }

      if (hit && normalAxis >= 0 && tMin < bestT) {
        bestT = tMin;
        bestNormal = new THREE.Vector3();
        bestNormal.setComponent(normalAxis, normalSign);
      }
    }

    return bestNormal ? { t: bestT, normal: bestNormal } : null;
  }

  /**
   * Move an AABB through the world, sliding along contacts.
   * Mutates and returns `pos`. `out.grounded` reports floor contact.
   */
  moveSlide(pos, half, velocity, dt, out = {}) {
    const delta = velocity.clone().multiplyScalar(dt);
    out.grounded = false;

    // Three iterations resolves corners; a fourth never measurably helped.
    for (let i = 0; i < 3; i++) {
      if (delta.lengthSq() < EPS * EPS) break;
      const hit = this.sweep(pos, half, delta);
      if (!hit) { pos.add(delta); break; }

      // Advance to just before contact.
      const safe = Math.max(0, hit.t - EPS);
      pos.addScaledVector(delta, safe);

      if (hit.normal.y > 0.7) out.grounded = true;

      // Remove the into-surface component from both the remaining motion and
      // the velocity, so we slide instead of sticking.
      const remaining = delta.clone().multiplyScalar(1 - safe);
      remaining.addScaledVector(hit.normal, -remaining.dot(hit.normal));
      velocity.addScaledVector(hit.normal, -velocity.dot(hit.normal));
      delta.copy(remaining);
    }

    return pos;
  }

  /** True if the AABB at `pos` intersects any brush. */
  overlaps(pos, half) {
    for (const brush of this.brushes) {
      if (pos.x - half.x < brush.max.x && pos.x + half.x > brush.min.x &&
          pos.y - half.y < brush.max.y && pos.y + half.y > brush.min.y &&
          pos.z - half.z < brush.max.z && pos.z + half.z > brush.min.z) return true;
    }
    return false;
  }

  /** Push `pos` out of any brush it is currently inside. */
  depenetrate(pos, half) {
    for (const brush of this.brushes) {
      const minX = brush.min.x - half.x, maxX = brush.max.x + half.x;
      const minY = brush.min.y - half.y, maxY = brush.max.y + half.y;
      const minZ = brush.min.z - half.z, maxZ = brush.max.z + half.z;

      if (pos.x <= minX || pos.x >= maxX ||
          pos.y <= minY || pos.y >= maxY ||
          pos.z <= minZ || pos.z >= maxZ) continue;

      // Escape along the axis needing the least movement.
      const push = [
        [minX - pos.x, 0], [maxX - pos.x, 0],
        [minY - pos.y, 1], [maxY - pos.y, 1],
        [minZ - pos.z, 2], [maxZ - pos.z, 2],
      ].reduce((a, b) => (Math.abs(b[0]) < Math.abs(a[0]) ? b : a));

      pos.setComponent(push[1], pos.getComponent(push[1]) + push[0]);
    }
    return pos;
  }

  /** Hitscan ray against static geometry. Returns {distance, point} or null. */
  raycast(origin, dir, maxDist = 1000) {
    let best = maxDist;
    let bestPoint = null;

    for (const brush of this.brushes) {
      let tMin = 0, tMax = best;
      let ok = true;
      for (let axis = 0; axis < 3; axis++) {
        const o = origin.getComponent(axis);
        const d = dir.getComponent(axis);
        const lo = brush.min.getComponent(axis);
        const hi = brush.max.getComponent(axis);
        if (Math.abs(d) < EPS) {
          if (o < lo || o > hi) { ok = false; break; }
          continue;
        }
        const inv = 1 / d;
        let t1 = (lo - o) * inv;
        let t2 = (hi - o) * inv;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tMin) tMin = t1;
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) { ok = false; break; }
      }
      if (ok && tMin < best) {
        best = tMin;
        bestPoint = origin.clone().addScaledVector(dir, tMin);
      }
    }

    return bestPoint ? { distance: best, point: bestPoint } : null;
  }
}
