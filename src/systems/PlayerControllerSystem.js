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
        this.isPlayerDead = false;
        this.isPlanting = false;
        this.plantStartTime = 0;
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
        
        this.input = this.engine.getSystem('InputSystem');
        this.physics = this.engine.getSystem('PhysicsSystem');
        console.log("PlayerControllerSystem: input found?", !!this.input, "physics found?", !!this.physics);
        
        this.engine.on('input:keydown', (code) => this.handleKeyDown(code));
        this.engine.on('input:keyup', (code) => this.handleKeyUp(code));
        
        GameState.on('change:isPlayerDead', (dead) => {
            this.isPlayerDead = dead;
        });
    }

    handleKeyDown(code) {
        if (this.isPlayerDead) return;
        switch (code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'Space': if (this.canJump) this.velocity.y += PHYSICS.JUMP_FORCE; this.canJump = false; break;
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

    update(delta) {
        if (this.isPlayerDead || !this.physics || typeof this.physics.checkCollision !== 'function') return;

        const camera = this.engine.camera;
        if (!camera) return;

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

        const speed = this.isCrouching ? PHYSICS.CROUCH_SPEED : PHYSICS.MOVE_SPEED;

        // Apply Friction
        this.velocity.x -= this.velocity.x * 10.0 * delta;
        this.velocity.z -= this.velocity.z * 10.0 * delta;
        this.velocity.y -= PHYSICS.GRAVITY * delta;

        // Calculate local direction
        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        // Apply movement to velocity
        if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * speed * delta;
        if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * speed * delta;

        // --- CAMERA-RELATIVE MOVEMENT MATH ---
        // Get the horizontal forward and right vectors from the camera
        const tempVec = new THREE.Vector3();
        
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
        moveVec.addScaledVector(forward, -this.velocity.z * delta);

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

        // Y movement (Gravity & Jump)
        const nextY = camera.position.clone();
        nextY.y += this.velocity.y * delta;
        
        const currentHeight = this.isCrouching ? PHYSICS.CROUCHING_HEIGHT : PHYSICS.STANDING_HEIGHT;
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
