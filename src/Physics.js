import * as THREE from 'three';
import { PHYSICS } from './Constants_v2.js';

// Reusable objects to avoid GC pressure
const _box3_1 = new THREE.Box3();

export function checkCollisionAt(pos, objects) {
    const playerRadius = PHYSICS.PLAYER_RADIUS;
    const stepHeight = 10.0; // Allow stepping over objects this high
    
    // Check collision for the player's body, but ignore the very bottom 'stepHeight' 
    // to allow walking over small obstacles or onto the floor.
    _box3_1.min.set(pos.x - playerRadius, pos.y - PHYSICS.STANDING_HEIGHT + stepHeight, pos.z - playerRadius);
    _box3_1.max.set(pos.x + playerRadius, pos.y, pos.z + playerRadius);

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (obj.userData.isSolid) {
            const box = obj.userData.boundingBox;
            if (box) {
                if (_box3_1.intersectsBox(box)) {
                    return true;
                }
            }
        }
    }
    return false;
}
