import * as THREE from 'three';
import { PHYSICS } from './Constants.js';

export function checkCollisionAt(pos, objects) {
    const playerRadius = PHYSICS.PLAYER_RADIUS;
    const playerBox = new THREE.Box3(
        new THREE.Vector3(pos.x - playerRadius, pos.y - PHYSICS.STANDING_HEIGHT, pos.z - playerRadius),
        new THREE.Vector3(pos.x + playerRadius, pos.y, pos.z + playerRadius)
    );

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (obj.userData.isSolid) {
            const box = obj.userData.boundingBox;
            if (box) {
                // Check if player's body height overlaps the object
                if (playerBox.min.y < (box.max.y - 1) && playerBox.max.y > box.min.y) {
                    if (playerBox.intersectsBox(box)) return true;
                }
            }
        }
    }
    return false;
}
