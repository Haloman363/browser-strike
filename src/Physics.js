import * as THREE from 'three';
import { PHYSICS } from './Constants.js';

// Reusable objects to avoid GC pressure
const _box3_1 = new THREE.Box3();

export function checkCollisionAt(pos, objects) {
    const playerRadius = PHYSICS.PLAYER_RADIUS;
    
    // Set box without creating new Vector3s
    _box3_1.min.set(pos.x - playerRadius, pos.y - PHYSICS.STANDING_HEIGHT, pos.z - playerRadius);
    _box3_1.max.set(pos.x + playerRadius, pos.y, pos.z + playerRadius);

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (obj.userData.isSolid) {
            const box = obj.userData.boundingBox;
            if (box) {
                // Check if player's body height overlaps the object
                if (_box3_1.min.y < (box.max.y - 1) && _box3_1.max.y > box.min.y) {
                    if (_box3_1.intersectsBox(box)) return true;
                }
            }
        }
    }
    return false;
}
