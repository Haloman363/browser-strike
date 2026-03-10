import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayerControllerSystem } from './PlayerControllerSystem.js';
import * as THREE from 'three';
import { GameState } from '../GameState.js';

// Mock GameState
vi.mock('../GameState.js', () => ({
    GameState: {
        get: vi.fn(),
        set: vi.fn(),
        on: vi.fn()
    }
}));

// Mock Constants
vi.mock('../Constants_v2.js', () => ({
    PHYSICS: {
        GRAVITY: 980,
        STANDING_HEIGHT: 18,
        CROUCHING_HEIGHT: 10,
        PLAYER_RADIUS: 4.0,
        MOVE_SPEED: 1000.0,
        CROUCH_SPEED: 500.0,
        JUMP_FORCE: 250.0
    },
    BOMB_SETTINGS: {
        PLANT_RADIUS: 50,
        PLANT_TIME: 3000,
        EXPLODE_TIME: 40000
    }
}));

describe('PlayerControllerSystem', () => {
    let engine;
    let pcSystem;
    let physicsSystem;

    beforeEach(() => {
        physicsSystem = {
            checkCollision: vi.fn(() => false)
        };

        engine = {
            on: vi.fn(),
            emit: vi.fn(),
            getSystem: vi.fn((name) => {
                if (name === 'PhysicsSystem') return physicsSystem;
                if (name === 'InputSystem') return {};
                return null;
            }),
            scene: {
                traverse: vi.fn()
            },
            camera: new THREE.PerspectiveCamera(),
            context: {
                bombsites: []
            }
        };

        pcSystem = new PlayerControllerSystem(engine);
        pcSystem.init();

        GameState.get.mockImplementation((key) => {
            if (key === 'roundState') return 'ROUND_RUNNING';
            return null;
        });
    });

    describe('applyInput', () => {
        it('should move forward when KeyW is pressed', () => {
            const input = {
                keys: { KeyW: true }
            };
            const initialZ = engine.camera.position.z;
            pcSystem.applyInput(input, 0.016);
            expect(engine.camera.position.z).toBeLessThan(initialZ);
        });

        it('should stop instantly when counter-strafing (A while moving D)', () => {
            // Setup moving right (velocity.x positive)
            pcSystem.velocity.x = 500;
            pcSystem.prevKeys.KeyD = true;
            pcSystem.prevKeys.KeyA = false;
            
            const input = {
                keys: { KeyA: true, KeyD: false }
            };
            
            const delta = 0.016;
            pcSystem.applyInput(input, delta);
            
            // It should kill the 500 velocity, then add 1 frame of acceleration
            // speed = 1000, delta = 0.016, accel = 1000 * 0.016 = 16
            expect(pcSystem.velocity.x).toBeCloseTo(16, 1);
        });
    });

    describe('Input Buffering', () => {
        it('should buffer input and increment sequenceNumber in update', () => {
            pcSystem.update(0.016);
            expect(pcSystem.inputBuffer.length).toBe(1);
            expect(pcSystem.sequenceNumber).toBe(1);
        });
    });
});
