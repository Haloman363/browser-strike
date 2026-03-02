import * as THREE from 'three';
import { System } from '../core/System.js';
import { PHYSICS } from '../Constants.js';
import { GameState } from '../GameState.js';

export class PlayerControllerSystem extends System {
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
    }

    init() {
        console.log("PlayerControllerSystem initialized");
        this.input = this.engine.getSystem('InputSystem');
        this.physics = this.engine.getSystem('PhysicsSystem');
        
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
        }
    }

    handleKeyUp(code) {
        switch (code) {
            case 'KeyW': this.moveForward = false; break;
            case 'KeyS': this.moveBackward = false; break;
            case 'KeyA': this.moveLeft = false; break;
            case 'KeyD': this.moveRight = false; break;
            case 'ControlLeft': this.isCrouching = false; break;
        }
    }

    update(delta) {
        if (this.isPlayerDead) return;

        const camera = this.engine.camera;
        const speed = this.isCrouching ? PHYSICS.CROUCH_SPEED : PHYSICS.MOVE_SPEED;

        this.velocity.x -= this.velocity.x * 10.0 * delta;
        this.velocity.z -= this.velocity.z * 10.0 * delta;
        this.velocity.y -= PHYSICS.GRAVITY * delta;

        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * speed * delta;
        if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * speed * delta;

        // X movement
        const nextX = camera.position.clone().add(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-this.velocity.x * delta));
        if (!this.physics.checkCollision(nextX)) {
            camera.position.x = nextX.x;
        }

        // Z movement
        const nextZ = camera.position.clone();
        const zDir = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).cross(new THREE.Vector3(0, 1, 0));
        nextZ.add(zDir.multiplyScalar(this.velocity.z * delta));
        if (!this.physics.checkCollision(nextZ)) {
            camera.position.z = nextZ.z;
        }

        // Y movement (Gravity & Jump)
        const nextY = camera.position.clone();
        nextY.y += this.velocity.y * delta;
        
        const currentHeight = this.isCrouching ? PHYSICS.CROUCHING_HEIGHT : PHYSICS.STANDING_HEIGHT;
        if (this.physics.checkCollision(nextY, PHYSICS.PLAYER_RADIUS, currentHeight)) {
            this.velocity.y = Math.max(0, this.velocity.y);
            this.canJump = true;
        } else {
            camera.position.y = nextY.y;
        }

        // Ground Clamp
        if (camera.position.y < PHYSICS.STANDING_HEIGHT && !this.physics.checkCollision(camera.position)) {
             camera.position.y = THREE.MathUtils.lerp(camera.position.y, currentHeight, 0.1);
        }
    }
}
