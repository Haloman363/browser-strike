import * as THREE from 'three';

export function updateBotAI(enemy, camera, objects, delta) {
    if (!enemy.userData.alive) return;

    // Face the player if close, otherwise face movement direction
    const distToPlayer = enemy.position.distanceTo(camera.position);
    
    if (distToPlayer < 100) {
        enemy.lookAt(camera.position.x, 0, camera.position.z);
        
        // Stand still
        const humanoid = enemy.children[0];
        humanoid.children.forEach(part => {
            if (part.name === "rightLeg" || part.name === "leftLeg") {
                part.rotation.x = THREE.MathUtils.lerp(part.rotation.x, 0, 0.1);
            }
        });
    } else {
        // ROAMING
        const target = enemy.userData.targetPos;
        const moveDir = new THREE.Vector3().subVectors(target, enemy.position);
        moveDir.y = 0;
        
        if (moveDir.length() < 5 || enemy.userData.roamTimer <= 0) {
            // New target
            enemy.userData.targetPos = new THREE.Vector3(
                Math.random() * 1800 - 900,
                0,
                Math.random() * 1800 - 900
            );
            enemy.userData.roamTimer = Math.random() * 10000 + 5000;
        } else {
            // Move towards target
            moveDir.normalize();
            const walkSpeed = 0.5;
            const oldPos = enemy.position.clone();
            enemy.position.add(moveDir.clone().multiplyScalar(walkSpeed));
            
            // Walking Animation
            enemy.userData.walkCycle += 0.1;
            const swing = Math.sin(enemy.userData.walkCycle) * 0.5;
            
            const humanoid = enemy.children[0];
            humanoid.children.forEach(part => {
                if (part.name === "rightLeg") part.rotation.x = swing;
                if (part.name === "leftLeg") part.rotation.x = -swing;
            });

            // Collision check for bot
            const enemyRadius = 4.0;
            const enemyBox = new THREE.Box3(
                new THREE.Vector3(enemy.position.x - enemyRadius, 0, enemy.position.z - enemyRadius),
                new THREE.Vector3(enemy.position.x + enemyRadius, 18, enemy.position.z + enemyRadius)
            );

            let collided = false;
            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];
                if (obj.userData.isSolid && !obj.userData.isEnemy) {
                    const box = obj.userData.boundingBox;
                    if (box && enemyBox.intersectsBox(box)) {
                        collided = true;
                        break;
                    }
                }
            }

            if (collided) {
                enemy.position.copy(oldPos);
                enemy.userData.roamTimer = 0; // Force new target on next frame
            } else {
                // Look where moving
                const lookPos = enemy.position.clone().add(moveDir);
                enemy.lookAt(lookPos.x, 0, lookPos.z);
                
                // IMPORTANT: Update body part bounding boxes
                enemy.children.forEach(child => {
                    if (child instanceof THREE.Group) { // The humanoid group
                        child.children.forEach(part => {
                            if (part.userData.isSolid) {
                                part.updateMatrixWorld(true);
                                part.userData.boundingBox.setFromObject(part);
                            }
                        });
                    }
                });
            }
            
            enemy.userData.roamTimer -= 16;
        }
    }
}

export function updateRagdoll(enemy) {
    if (!enemy.userData.isRagdoll) return;
    
    const humanoid = enemy.children[0];
    if (humanoid && humanoid instanceof THREE.Group) {
        humanoid.children.forEach(part => {
            if (part.userData.velocity) {
                part.userData.velocity.y -= 0.1; // Apply gravity
                part.position.add(part.userData.velocity);
                part.rotation.x += part.userData.angularVelocity.x;
                part.rotation.y += part.userData.angularVelocity.y;
                part.rotation.z += part.userData.angularVelocity.z;
                
                const groundY = 1.0;
                if (part.position.y < groundY) {
                    part.position.y = groundY;
                    part.userData.velocity.multiplyScalar(0.5); // Friction
                    part.userData.velocity.y *= -0.3; // Bounce
                    part.userData.angularVelocity.multiplyScalar(0.8);
                }
            }
        });
    }
}
