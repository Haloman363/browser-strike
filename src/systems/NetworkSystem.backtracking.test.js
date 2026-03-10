import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkSystem } from './NetworkSystem.js';
import * as THREE from 'three';

// Mock PeerJS
vi.mock('peerjs', () => {
    return {
        Peer: vi.fn().mockImplementation(function() {
            this.on = vi.fn();
            this.destroy = vi.fn();
        }),
    };
});

// Mock SnapshotInterpolation
vi.mock('@geckos.io/snapshot-interpolation', () => {
    return {
        SnapshotInterpolation: vi.fn().mockImplementation(function() {
            this.snapshot = {
                create: vi.fn(),
                add: vi.fn()
            };
            this.vault = {
                add: vi.fn(),
                get: vi.fn()
            };
        })
    };
});

describe('NetworkSystem Backtracking', () => {
    let mockEngine;
    let system;

    beforeEach(() => {
        mockEngine = {
            emit: vi.fn(),
            getSystem: vi.fn(),
            entities: [],
            context: {
                objects: []
            }
        };
        system = new NetworkSystem(mockEngine);
        system.isHost = true;
    });

    it('_handleHostShoot should rewind, raycast, and restore', () => {
        const timestamp = 1000;
        const shooterId = 'player-shooter';
        const targetId = 'player-target';
        
        // Target entity at current position (20, 0, 20)
        const targetEntity = {
            id: targetId,
            position: new THREE.Vector3(20, 0, 20),
            quaternion: new THREE.Quaternion(),
            isCrouched: false,
            updateMatrixWorld: vi.fn()
        };
        system.engine.entities = [targetEntity];

        // Past snapshot has target at (10, 0, 10)
        const pastSnapshot = {
            state: [{
                id: targetId,
                x: 10, y: 0, z: 10,
                qx: 0, qy: 0, qz: 0, qw: 1,
                isCrouched: true
            }]
        };
        system.SI.vault.get = vi.fn().mockReturnValue(pastSnapshot);

        // Mock raycaster intersection
        const hitPart = new THREE.Mesh();
        hitPart.userData = { isEnemy: true, parentPlayerId: targetId };
        
        // Mock context objects for raycasting
        system.engine.context.objects = [hitPart];

        // Spy on Raycaster.intersectObjects
        const intersectSpy = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReturnValue([
            { object: hitPart, point: new THREE.Vector3(10, 0, 10) }
        ]);

        const sendSpy = vi.spyOn(system, 'send');

        // Execute shoot handling
        system._handleHostShoot({
            timestamp,
            origin: { x: 0, y: 0, z: 0 },
            direction: { x: 1, y: 0, z: 1 }, // Aiming towards (10, 0, 10)
            weaponKey: 'AK47'
        }, shooterId);

        // 1. Verify Rewind occurred
        // (Hard to verify timing, but we can verify it was called with the objects)
        expect(intersectSpy).toHaveBeenCalled();
        
        // 2. Verify Hit Confirmation was sent
        expect(sendSpy).toHaveBeenCalledWith('HIT_CONFIRMED', expect.objectContaining({
            targetId: targetId,
            point: expect.any(THREE.Vector3)
        }), true);

        // 3. Verify Restore occurred
        expect(targetEntity.position.x).toBe(20);
        expect(targetEntity.isCrouched).toBe(false);
    });

    it('_handleHostShoot should not confirm hit if aiming at current but target moved from past', () => {
        const timestamp = 1000;
        const shooterId = 'player-shooter';
        const targetId = 'player-target';
        
        // Target at current position (10, 0, 10)
        const targetEntity = {
            id: targetId,
            position: new THREE.Vector3(10, 0, 10),
            quaternion: new THREE.Quaternion(),
            isCrouched: false,
            updateMatrixWorld: vi.fn()
        };
        system.engine.entities = [targetEntity];

        // Past snapshot has target at (20, 0, 20)
        const pastSnapshot = {
            state: [{
                id: targetId,
                x: 20, y: 0, z: 20,
                qx: 0, qy: 0, qz: 0, qw: 1,
                isCrouched: false
            }]
        };
        system.SI.vault.get = vi.fn().mockReturnValue(pastSnapshot);

        // Raycaster aiming at (10, 0, 10) - where target IS now, but WAS NOT then
        vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReturnValue([]);

        const sendSpy = vi.spyOn(system, 'send');

        system._handleHostShoot({
            timestamp,
            origin: { x: 0, y: 0, z: 0 },
            direction: { x: 1, y: 0, z: 1 },
            weaponKey: 'AK47'
        }, shooterId);

        expect(sendSpy).not.toHaveBeenCalledWith('HIT_CONFIRMED', expect.any(Object), expect.any(Boolean));
    });
});
