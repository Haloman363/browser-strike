import { describe, it, expect } from 'vitest';
import { checkCollisionAt } from './Physics.js';
import * as THREE from 'three';

describe('Physics Collision', () => {
    // Mocking objects for testing
    const mockObjects = [
        {
            userData: {
                isSolid: true,
                boundingBox: new THREE.Box3(
                    new THREE.Vector3(-10, -10, -10),
                    new THREE.Vector3(10, 10, 10)
                )
            }
        }
    ];

    it('should detect collision when point is inside solid object', () => {
        // Test point inside the box (considering player radius and height)
        const posInside = { x: 0, y: 5, z: 0 };
        const collisionInside = checkCollisionAt(posInside, mockObjects);
        expect(collisionInside).toBe(true);
    });

    it('should NOT detect collision when point is outside solid object', () => {
        // Test point far outside
        const posOutside = { x: 100, y: 100, z: 100 };
        const collisionOutside = checkCollisionAt(posOutside, mockObjects);
        expect(collisionOutside).toBe(false);
    });
});
