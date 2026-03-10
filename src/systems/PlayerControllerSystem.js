import * as THREE from 'three';
import { System } from '../core/System.js';
import { PHYSICS, BOMB_SETTINGS } from '../Constants_v2.js';
import { GameState } from '../GameState.js';

export class PlayerControllerSystem extends System {
    static systemName = 'PlayerControllerSystem';
    constructor(engine) {
        super(engine);
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = false;
        this.isCrouching = false;
        this.jumpPressed = false;
        this.isPlayerDead = false;
        this.isPlanting = false;
        this.plantStartTime = 0;
        
        // Ladder state
        this.isOnLadder = false;
        this.ladderThreshold = 10.0; // Distance to snap to ladder

        // High-skill movement state
        this.taggingFactor = 1.0;
        this.prevKeys = {
            KeyW: false,
            KeyS: false,
            KeyA: false,
            KeyD: false
        };
        
        // Input buffering for client-side prediction
        this.inputBuffer = [];
        this.sequenceNumber = 0;
    }

    init() {
        console.log("PlayerControllerSystem initialized");
        this.velocity.set(0, 0, 0);
        this.direction.set(0, 0, 0);
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = false;
        this.isCrouching = false;
        this.isPlanting = false;
        this.isOnLadder = false;
        
        this.input = this.engine.getSystem('InputSystem');
        this.physics = this.engine.getSystem('PhysicsSystem');
        console.log("PlayerControllerSystem: input found?", !!this.input, "physics found?", !!this.physics);
        
        this.engine.on('input:keydown', (code) => this.handleKeyDown(code));
        this.engine.on('input:keyup', (code) => this.handleKeyUp(code));
        this.engine.on('round:reset', () => this.onRoundReset());
        
        GameState.on('change:isPlayerDead', (dead) => {
            this.isPlayerDead = dead;
        });
    }

    onRoundReset() {
        this.velocity.set(0, 0, 0);
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = false;
        this.isCrouching = false;
        this.isPlanting = false;
        this.jumpPressed = false;
        this.isOnLadder = false;
    }

    handleKeyDown(code) {
        if (this.isPlayerDead) return;
        
        const roundState = GameState.get('roundState');
        const isMovementLocked = roundState === 'PREROUND' || roundState === 'POST_ROUND';

        switch (code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'Space': 
                if (!isMovementLocked) {
                    this.jumpPressed = true;
                    // Jump off ladder
                    if (this.isOnLadder) {
                        this.isOnLadder = false;
                        this.velocity.y = PHYSICS.JUMP_FORCE * 0.5;
                    }
                }
                break;
            case 'ControlLeft': this.isCrouching = true; break;
            case 'KeyE': this.startPlanting(); break;
        }
    }

    handleKeyUp(code) {
        switch (code) {
            case 'KeyW': this.moveForward = false; break;
            case 'KeyS': this.moveBackward = false; break;
            case 'KeyA': this.moveLeft = false; break;
            case 'KeyD': this.moveRight = false; break;
            case 'ControlLeft': this.isCrouching = false; break;
            case 'KeyE': this.stopPlanting(); break;
        }
    }

    startPlanting() {
        if (GameState.get('canPlant') && GameState.get('currentWeapon') === 'c4' && !GameState.get('bombPlanted')) {
            this.isPlanting = true;
            this.plantStartTime = performance.now();
            GameState.set({ bombPlanting: true, bombPlantProgress: 0 });
        }
    }

    stopPlanting() {
        this.isPlanting = false;
        GameState.set({ bombPlanting: false, bombPlantProgress: 0 });
    }

    completePlanting() {
        this.isPlanting = false;
        GameState.set({ 
            bombPlanting: false, 
            bombPlantProgress: 0, 
            bombPlanted: true,
            bombTimeLeft: BOMB_SETTINGS.EXPLODE_TIME / 1000 
        });
        this.engine.emit('bomb:planted', { position: this.engine.camera.position.clone() });
    }

    checkLadders() {
        const camera = this.engine.camera;
        if (!camera) return;

        // Find all ladder objects in the scene
        const ladders = [];
        this.engine.scene.traverse(obj => {
            if (obj.userData && obj.userData.type === 'ladder') {
                ladders.push(obj);
            }
        });

        let nearLadder = false;
        for (const ladder of ladders) {
            // Simple proximity check for auto-attach
            // In a real implementation, we might want to check the dot product to ensure we are facing the ladder
            const dist = camera.position.distanceTo(ladder.position);
            
            // For a vertical ladder (thin box), we check XZ distance and Y bounds
            const dx = camera.position.x - ladder.position.x;
            const dz = camera.position.z - ladder.position.z;
            const distXZ = Math.sqrt(dx * dx + dz * dz);
            
            // Get ladder height from geometry or userData
            const height = ladder.userData.height || (ladder.geometry ? ladder.geometry.parameters.height : 200);
            const halfHeight = height / 2;
            const dy = camera.position.y - ladder.position.y;

            if (distXZ < this.ladderThreshold && Math.abs(dy) < halfHeight + 20) {
                nearLadder = true;
                break;
            }
        }

        if (nearLadder && !this.isOnLadder) {
            this.isOnLadder = true;
            this.velocity.y = 0;
            console.log("Attached to ladder");
        } else if (!nearLadder && this.isOnLadder) {
            this.isOnLadder = false;
            console.log("Detached from ladder");
        }
    }

    update(delta) {
        if (this.isPlayerDead || !this.physics || typeof this.physics.checkCollision !== 'function') return;

        const camera = this.engine.camera;
        if (!camera) return;

        // --- LADDER CHECK ---
        this.checkLadders();

        // --- BOMB SITE CHECK ---
        const bombsites = this.engine.context.bombsites || [];
        let nearSite = null;
        for (const site of bombsites) {
            const dist = camera.position.distanceTo(site.position);
            if (dist < BOMB_SETTINGS.PLANT_RADIUS) {
                nearSite = site.name.split('_')[1]; // 'A' or 'B'
                break;
            }
        }
        GameState.set({ atBombSite: nearSite, canPlant: !!nearSite });

        // --- PLANTING PROGRESS ---
        if (this.isPlanting) {
            if (!GameState.get('canPlant') || GameState.get('currentWeapon') !== 'c4') {
                this.stopPlanting();
            } else {
                const elapsed = performance.now() - this.plantStartTime;
                const progress = Math.min(elapsed / BOMB_SETTINGS.PLANT_TIME, 1);
                GameState.set({ bombPlantProgress: progress });

                if (progress >= 1) {
                    this.completePlanting();
                }
                // Don't move while planting
                return; 
            }
        }

        // --- LOCAL PREDICTION & INPUT BUFFERING ---
        this.sequenceNumber++;
        const inputState = {
            seq: this.sequenceNumber,
            dt: delta,
            keys: {
                KeyW: this.moveForward,
                KeyS: this.moveBackward,
                KeyA: this.moveLeft,
                KeyD: this.moveRight,
                Space: this.jumpPressed, // Capture jump state
                ControlLeft: this.isCrouching
            }
        };

        // Reset jumpPressed after capturing it for the input buffer
        this.jumpPressed = false;

        // Buffer the input
        this.inputBuffer.push(inputState);
        
        // Predict locally
        this.applyInput(inputState, delta);

        // Send to host
        const network = this.engine.getSystem('NetworkSystem');
        if (network) {
            network.send('INPUT', inputState, false);
        }
    }

    reconcile(state) {
        // Filter inputBuffer: remove all inputs with seq <= state.lastSeq
        this.inputBuffer = this.inputBuffer.filter(i => i.seq > state.lastSeq);

        const camera = this.engine.camera;
        if (!camera) return;

        // Check distance between local position and authoritative state
        const authoritativePos = new THREE.Vector3(state.x, state.y, state.z);
        const distance = camera.position.distanceTo(authoritativePos);

        // If distance > 0.1: SNAP local position to state.pos and REPLAY
        if (distance > 0.1) {
            // console.log(`Reconciling: desync of ${distance.toFixed(4)} units. Snapping and replaying.`);
            camera.position.copy(authoritativePos);
            
            // REPLAY all remaining inputs in inputBuffer
            for (const input of this.inputBuffer) {
                this.applyInput(input, input.dt);
            }
        }
    }

    applyTagging(intensity) {
        // intensity 0.0 to 1.0 (1.0 is max slow)
        this.taggingFactor = Math.max(0.2, 1.0 - intensity);
        console.log(`Tagged! Speed reduced to ${Math.round(this.taggingFactor * 100)}%`);
    }

    applyInput(inputState, delta) {
        const camera = this.engine.camera;
        if (!camera || !this.physics) return;

        const roundState = GameState.get('roundState');
        const isMovementLocked = roundState === 'PREROUND' || roundState === 'POST_ROUND';

        const keys = inputState.keys || {};
        
        // --- 1. COUNTER-STRAFING ---
        // If moving right and press A, stop. If moving left and press D, stop.
        if (!isMovementLocked && !this.isOnLadder) {
            // Horizontal (A/D)
            if (keys.KeyA && !this.prevKeys.KeyA && this.velocity.x < -10) {
                this.velocity.x = 0; // Instant stop
            } else if (keys.KeyD && !this.prevKeys.KeyD && this.velocity.x > 10) {
                this.velocity.x = 0;
            }
            
            // Forward/Back (W/S)
            if (keys.KeyW && !this.prevKeys.KeyW && this.velocity.z < -10) {
                this.velocity.z = 0;
            } else if (keys.KeyS && !this.prevKeys.KeyS && this.velocity.z > 10) {
                this.velocity.z = 0;
            }
        }
        
        // Update prevKeys for next frame
        this.prevKeys.KeyW = !!keys.KeyW;
        this.prevKeys.KeyS = !!keys.KeyS;
        this.prevKeys.KeyA = !!keys.KeyA;
        this.prevKeys.KeyD = !!keys.KeyD;

        // --- 2. TAGGING RECOVERY ---
        if (this.taggingFactor < 1.0) {
            this.taggingFactor += delta * 2.0; // Recover in 0.5s
            if (this.taggingFactor > 1.0) this.taggingFactor = 1.0;
        }

        const baseSpeed = keys.ControlLeft ? PHYSICS.CROUCH_SPEED : PHYSICS.MOVE_SPEED;
        const speed = baseSpeed * this.taggingFactor;

        // Apply Friction
        this.velocity.x -= this.velocity.x * 10.0 * delta;
        this.velocity.z -= this.velocity.z * 10.0 * delta;
        
        // Apply Gravity (Skip if on ladder)
        if (!this.isOnLadder) {
            this.velocity.y -= PHYSICS.GRAVITY * delta;
        } else {
            this.velocity.y -= this.velocity.y * 10.0 * delta; // Extra friction on ladder
        }

        // Calculate local direction (only if not movement locked)
        let dirZ = 0;
        let dirX = 0;
        
        if (!isMovementLocked) {
            dirZ = Number(!!keys.KeyW) - Number(!!keys.KeyS);
            dirX = Number(!!keys.KeyD) - Number(!!keys.KeyA);
        }
        
        const direction = new THREE.Vector3(dirX, 0, dirZ);
        if (direction.lengthSq() > 0) {
            direction.normalize();
        }

        // Apply movement to velocity
        if (!isMovementLocked) {
            if (this.isOnLadder) {
                // Look-Based Climbing
                // W moves you in the direction you are looking
                const pitch = camera.rotation.x; // Positive is looking down, negative is looking up
                const moveDir = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
                
                // If looking up (pitch < 0), W moves you UP (velocity.y > 0)
                this.velocity.y = moveDir * PHYSICS.LADDER_CLIMB_SPEED * -Math.sin(pitch);
                
                // Horizontal movement on ladder (reduced)
                if (keys.KeyA || keys.KeyD) this.velocity.x -= direction.x * speed * 0.5 * delta;
            } else {
                if (keys.KeyW || keys.KeyS) this.velocity.z -= direction.z * speed * delta;
                if (keys.KeyA || keys.KeyD) this.velocity.x -= direction.x * speed * delta;

                // --- 3. CROUCH-JUMPING ---
                // Apply Jump
                if (keys.Space && this.canJump) {
                    // Give a slight boost if crouching while jumping (classic CS feel)
                    const jumpForce = keys.ControlLeft ? PHYSICS.JUMP_FORCE * 1.1 : PHYSICS.JUMP_FORCE;
                    this.velocity.y = jumpForce;
                    this.canJump = false;
                }
            }
        }

        // --- CAMERA-RELATIVE MOVEMENT MATH ---
        // Get the horizontal forward and right vectors from the camera
        // Right vector (local X)
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        right.y = 0;
        right.normalize();
        
        // Forward vector (perpendicular to Right and Up)
        const forward = new THREE.Vector3().crossVectors(camera.up, right);
        forward.normalize();

        // Calculate world-space move vector
        const moveVec = new THREE.Vector3();
        moveVec.addScaledVector(right, -this.velocity.x * delta);
        
        if (!this.isOnLadder) {
            moveVec.addScaledVector(forward, -this.velocity.z * delta);
        }

        // --- COLLISION & SLIDING ---
        // Check X movement
        const nextX = camera.position.clone();
        nextX.x += moveVec.x;
        if (!this.physics.checkCollision(nextX)) {
            camera.position.x = nextX.x;
        }

        // Check Z movement
        const nextZ = camera.position.clone();
        nextZ.z += moveVec.z;
        if (!this.physics.checkCollision(nextZ)) {
            camera.position.z = nextZ.z;
        }

        // Y movement (Gravity, Jump, or Climbing)
        const nextY = camera.position.clone();
        nextY.y += this.velocity.y * delta;
        
        const currentHeight = keys.ControlLeft ? PHYSICS.CROUCHING_HEIGHT : PHYSICS.STANDING_HEIGHT;
        
        if (this.isOnLadder) {
            // While on ladder, we don't use regular ground collision for Y
            // but we should check if we hit a ceiling
            if (this.velocity.y > 0 && this.physics.checkCollision(nextY)) {
                this.velocity.y = 0;
            } else {
                camera.position.y = nextY.y;
            }
        } else {
            if (this.physics.checkCollision(nextY)) {
                if (this.velocity.y <= 0) {
                    this.velocity.y = 0;
                    this.canJump = true;
                } else {
                    this.velocity.y = 0;
                }
            } else {
                camera.position.y = nextY.y;
                this.canJump = false;
            }

            // Emergency ground safety
            if (camera.position.y < currentHeight) {
                camera.position.y = currentHeight;
                this.velocity.y = 0;
                this.canJump = true;
            }
        }
    }
}
