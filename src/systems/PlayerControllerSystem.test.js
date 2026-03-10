import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PlayerControllerSystem } from './PlayerControllerSystem.js';
import { PHYSICS } from '../Constants_v2.js';

// Mock GameState
vi.mock('../GameState.js', () => {
    const state = {
        isPlayerDead: false,
        canPlant: false,
        currentWeapon: 'rifle',
        bombPlanted: false,
        bombPlanting: false,
        bombPlantProgress: 0,
        atBombSite: null
    };
    return {
        GameState: {
            get: vi.fn((key) => state[key]),
            set: vi.fn((update) => Object.assign(state, update)),
            on: vi.fn()
        }
    };
});

describe('PlayerControllerSystem', () => {
    let mockEngine;
    let system;
    let mockPhysics;
    let mockInput;
    let mockCamera;

    beforeEach(() => {
        mockCamera = {
            position: new THREE.Vector3(0, 1.7, 0),
            up: new THREE.Vector3(0, 1, 0),
            matrix: new THREE.Matrix4()
        };

        mockPhysics = {
            checkCollision: vi.fn().mockReturnValue(false)
        };

        mockInput = {
            // ... any input methods if needed
        };

        const mockNetwork = { send: vi.fn() };

        mockEngine = {
            camera: mockCamera,
            getSystem: vi.fn((name) => {
                if (name === 'PhysicsSystem') return mockPhysics;
                if (name === 'InputSystem') return mockInput;
                if (name === 'NetworkSystem') return mockNetwork;
                return null;
            }),
            on: vi.fn(),
            emit: vi.fn(),
            context: { bombsites: [] }
        };

        system = new PlayerControllerSystem(mockEngine);
        system.init();
    });

    describe('applyInput', () => {
        it('should be a function', () => {
            // This will fail initially as Task 1 hasn't refactored yet
            expect(typeof system.applyInput).toBe('function');
        });

        it('should move forward when KeyW is pressed', () => {
            const initialPos = mockCamera.position.clone();
            const inputState = {
                seq: 1,
                dt: 0.016,
                keys: { KeyW: true }
            };

            // Before implementation, applyInput might not exist or do nothing
            system.applyInput(inputState, 0.016);

            expect(mockCamera.position.z).toBeLessThan(initialPos.z);
        });

        it('should be deterministic', () => {
            const inputState = {
                seq: 1,
                dt: 0.016,
                keys: { KeyW: true, KeyD: true }
            };

            system.applyInput(inputState, 0.016);
            const pos1 = mockCamera.position.clone();

            // Reset position
            mockCamera.position.set(0, 1.7, 0);
            system.velocity.set(0, 0, 0);

            system.applyInput(inputState, 0.016);
            const pos2 = mockCamera.position.clone();

            expect(pos1.x).toBe(pos2.x);
            expect(pos1.y).toBe(pos2.y);
            expect(pos1.z).toBe(pos2.z);
        });
    });

    describe('Input Buffering', () => {
        it('should have an inputBuffer and sequenceNumber', () => {
            // Fails initially
            expect(system.inputBuffer).toBeDefined();
            expect(system.sequenceNumber).toBeDefined();
        });

        it('should buffer input and increment sequenceNumber in update', () => {
            // Mock InputSystem behavior if necessary, or manually set flags
            system.moveForward = true;
            
            system.update(0.016);

            expect(system.sequenceNumber).toBe(1);
            expect(system.inputBuffer.length).toBe(1);
            expect(system.inputBuffer[0]).toMatchObject({
                seq: 1,
                dt: 0.016,
                keys: expect.objectContaining({ KeyW: true })
            });
        });

        it('should send input to NetworkSystem', () => {
            const networkSystem = mockEngine.getSystem('NetworkSystem');
            system.moveForward = true;
            
            system.update(0.016);

            expect(networkSystem.send).toHaveBeenCalledWith('INPUT', expect.objectContaining({
                seq: 1,
                keys: expect.objectContaining({ KeyW: true })
            }), false);
        });
    });

    describe('Reconciliation', () => {
        it('should remove inputs with seq <= state.lastSeq from inputBuffer', () => {
            system.inputBuffer = [
                { seq: 10, dt: 0.016, keys: { KeyW: true } },
                { seq: 11, dt: 0.016, keys: { KeyW: true } },
                { seq: 12, dt: 0.016, keys: { KeyW: true } }
            ];

            const state = { lastSeq: 11, x: 0, y: 1.7, z: 0 };
            system.reconcile(state);

            expect(system.inputBuffer.length).toBe(1);
            expect(system.inputBuffer[0].seq).toBe(12);
        });

        it('should snap and replay when distance > 0.1 units', () => {
            // Buffer inputs from 3 to 5
            system.inputBuffer = [
                { seq: 3, dt: 0.016, keys: { KeyW: true } }, // Predicted forward
                { seq: 4, dt: 0.016, keys: { KeyW: true } }, // Predicted forward
                { seq: 5, dt: 0.016, keys: { KeyW: true } }  // Predicted forward
            ];
            
            // Set current predicted position way off (10 units away)
            mockCamera.position.set(0, 1.7, 10);
            
            // Authoritative state says we were at 0, 1.7, 0 at seq 2
            const authoritativeState = { lastSeq: 2, x: 0, y: 1.7, z: 0 };
            
            const applyInputSpy = vi.spyOn(system, 'applyInput');
            
            system.reconcile(authoritativeState);

            // Distance was 10, so should have snapped to 0, 1.7, 0
            // and replayed 3 inputs
            expect(applyInputSpy).toHaveBeenCalledTimes(3);
            expect(mockCamera.position.z).toBeLessThan(0); // Should have moved forward from 0
        });

        it('should NOT replay when distance <= 0.1 units', () => {
            system.inputBuffer = [
                { seq: 3, dt: 0.016, keys: { KeyW: true } }
            ];
            
            // Current position is close enough (0.05 units)
            mockCamera.position.set(0, 1.7, 0.05);
            
            // Authoritative state at seq 2
            const authoritativeState = { lastSeq: 2, x: 0, y: 1.7, z: 0 };
            
            const applyInputSpy = vi.spyOn(system, 'applyInput');
            
            system.reconcile(authoritativeState);

            // Distance was 0.05 <= 0.1, so no snap/replay should happen
            expect(applyInputSpy).not.toHaveBeenCalled();
            expect(mockCamera.position.z).toBe(0.05); // Position should remain same
        });
    });
});
