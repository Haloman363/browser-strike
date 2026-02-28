import { checkCollisionAt } from './Physics.js';
import * as THREE from 'three';

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

function testCollision() {
    console.log("Running Physics Tests...");
    
    // Test point inside the box (considering player radius and height)
    const posInside = { x: 0, y: 5, z: 0 };
    const collisionInside = checkCollisionAt(posInside, mockObjects);
    console.log(`Test Inside Box: ${collisionInside === true ? "✅ PASS" : "❌ FAIL"}`);

    // Test point far outside
    const posOutside = { x: 100, y: 100, z: 100 };
    const collisionOutside = checkCollisionAt(posOutside, mockObjects);
    console.log(`Test Outside Box: ${collisionOutside === false ? "✅ PASS" : "❌ FAIL"}`);
}

testCollision();
