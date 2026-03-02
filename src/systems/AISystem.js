import * as THREE from 'three';
import { System } from '../core/System.js';

export class AISystem extends System {
    constructor(engine) {
        super(engine);
        this.enemies = [];
        this.objects = [];
        
        this._vec3_1 = new THREE.Vector3();
        this._vec3_2 = new THREE.Vector3();
        this._vec3_3 = new THREE.Vector3();
        this._box3_1 = new THREE.Box3();
    }

    init() {
        console.log("AISystem initialized");
        this.enemies = this.engine.context.enemies || [];
        this.objects = this.engine.context.objects || [];
        
        // Listen for enemy hit events
        this.engine.on('entity:hit', ({ entity, damage, point, isHeadshot }) => {
            this.handleEnemyHit(entity, damage, point, isHeadshot);
        });
    }

    update(delta, time) {
        const camera = this.engine.camera;
        for (let i = 0; i < this.enemies.length; i++) {
            const enemy = this.enemies[i];
            if (enemy.userData.alive) {
                this.updateBotAI(enemy, camera, delta);
            } else {
                this.updateRagdoll(enemy, delta);
            }
        }
    }

    handleEnemyHit(enemy, damage, point, isHeadshot) {
        if (!enemy.userData.alive) return;
        
        enemy.userData.health -= damage;
        
        // Visual feedback (flash white)
        // Note: hitPart is not available here, so we might need to find the specific mesh
        // For simplicity, we flash the entire humanoid
        const humanoid = enemy.children[0];
        if (humanoid && humanoid instanceof THREE.Group) {
            humanoid.children.forEach(part => {
                if (part.material && part.material.color) {
                    const originalColor = part.material.color.clone();
                    part.material.color.set(0xffffff);
                    setTimeout(() => {
                        if (enemy.userData.alive) part.material.color.copy(originalColor);
                    }, 50);
                }
            });
        }

        if (enemy.userData.health <= 0) {
            this.engine.emit('entity:killed', { killer: 'player', victim: enemy });
            // The actual kill logic (ragdoll, removing from alive list) should happen here or via event
        }
    }

    updateBotAI(enemy, camera, delta) {
        if (enemy.userData.isStationary) return;

        const distToPlayer = enemy.position.distanceTo(camera.position);
        
        if (distToPlayer < 100) {
            enemy.lookAt(camera.position.x, 0, camera.position.z);
            
            // Stand still animation
            const humanoid = enemy.children[0];
            humanoid.children.forEach(part => {
                if (part.name === "rightLeg" || part.name === "leftLeg") {
                    part.rotation.x = THREE.MathUtils.lerp(part.rotation.x, 0, 0.1);
                }
            });
        } else if (enemy.userData.isPacer) {
            // PACING
            const target = enemy.userData.targetPos;
            this._vec3_1.subVectors(target, enemy.position);
            this._vec3_1.y = 0;
            
            if (this._vec3_1.length() < 5) {
                const laneX = enemy.userData.laneX || enemy.position.x;
                target.x = target.x < laneX ? laneX + 40 : laneX - 40;
            }
            
            this._vec3_1.normalize();
            const walkSpeed = 0.3;
            this._vec3_3.copy(this._vec3_1).multiplyScalar(walkSpeed);
            enemy.position.add(this._vec3_3);
            
            enemy.userData.walkCycle += 0.05;
            const swing = Math.sin(enemy.userData.walkCycle) * 0.4;
            const humanoid = enemy.children[0];
            humanoid.children.forEach(part => {
                if (part.name === "rightLeg") part.rotation.x = swing;
                if (part.name === "leftLeg") part.rotation.x = -swing;
            });

            this._vec3_3.copy(enemy.position).add(this._vec3_1);
            enemy.lookAt(this._vec3_3.x, 0, this._vec3_3.z);
        } else {
            // ROAMING
            const target = enemy.userData.targetPos;
            this._vec3_1.subVectors(target, enemy.position);
            this._vec3_1.y = 0;
            
            if (this._vec3_1.length() < 5 || enemy.userData.roamTimer <= 0) {
                enemy.userData.targetPos = new THREE.Vector3(
                    Math.random() * 1800 - 900,
                    0,
                    Math.random() * 1800 - 900
                );
                enemy.userData.roamTimer = Math.random() * 10000 + 5000;
            } else {
                this._vec3_1.normalize();
                const walkSpeed = 0.5;
                this._vec3_2.copy(enemy.position); // oldPos
                
                this._vec3_3.copy(this._vec3_1).multiplyScalar(walkSpeed);
                enemy.position.add(this._vec3_3);
                
                enemy.userData.walkCycle += 0.1;
                const swing = Math.sin(enemy.userData.walkCycle) * 0.5;
                
                const humanoid = enemy.children[0];
                humanoid.children.forEach(part => {
                    if (part.name === "rightLeg") part.rotation.x = swing;
                    if (part.name === "leftLeg") part.rotation.x = -swing;
                });

                const enemyRadius = 4.0;
                this._box3_1.min.set(enemy.position.x - enemyRadius, 0, enemy.position.z - enemyRadius);
                this._box3_1.max.set(enemy.position.x + enemyRadius, 18, enemy.position.z + enemyRadius);

                let collided = false;
                for (let i = 0; i < this.objects.length; i++) {
                    const obj = this.objects[i];
                    if (obj.userData.isSolid && !obj.userData.isEnemy) {
                        const box = obj.userData.boundingBox;
                        if (box && this._box3_1.intersectsBox(box)) {
                            collided = true;
                            break;
                        }
                    }
                }

                if (collided) {
                    enemy.position.copy(this._vec3_2);
                    enemy.userData.roamTimer = 0;
                } else {
                    this._vec3_3.copy(enemy.position).add(this._vec3_1);
                    enemy.lookAt(this._vec3_3.x, 0, this._vec3_3.z);
                }
                
                enemy.userData.roamTimer -= delta * 1000;
            }
        }
    }

    updateRagdoll(enemy, delta) {
        if (!enemy.userData.isRagdoll) return;
        
        const humanoid = enemy.children[0];
        if (humanoid && humanoid instanceof THREE.Group) {
            humanoid.children.forEach(part => {
                if (part.userData.velocity) {
                    part.userData.velocity.y -= 0.1;
                    part.position.add(part.userData.velocity);
                    part.rotation.x += part.userData.angularVelocity.x;
                    part.rotation.y += part.userData.angularVelocity.y;
                    part.rotation.z += part.userData.angularVelocity.z;
                    
                    const groundY = 1.0;
                    if (part.position.y < groundY) {
                        part.position.y = groundY;
                        part.userData.velocity.multiplyScalar(0.5);
                        part.userData.velocity.y *= -0.3;
                        part.userData.angularVelocity.multiplyScalar(0.8);
                    }
                }
            });
        }
    }
}
