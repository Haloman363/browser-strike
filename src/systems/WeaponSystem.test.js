import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeaponSystem } from './WeaponSystem.js';
import * as THREE from 'three';
import { GameState } from '../GameState.js';

// Mock GameState
vi.mock('../GameState.js', () => ({
    GameState: {
        get: vi.fn(),
        set: vi.fn()
    }
}));

// Mock Constants
vi.mock('../Constants_v2.js', () => ({
    WEAPONS_DATA: {
        AK47: {
            name: 'AK47',
            fireRate: 600,
            recoil: 0.1,
            damage: 30,
            magSize: 30,
            spread: 0.02
        }
    },
    GRENADES_DATA: {}
}));

// Mock Weapon effects
vi.mock('../Weapon.js', () => ({
    createBloodSplatter: vi.fn(),
    createImpactEffect: vi.fn()
}));

describe('WeaponSystem Authoritative Flow', () => {
    let engine;
    let weaponSystem;
    let networkSystem;

    beforeEach(() => {
        networkSystem = {
            getServerTime: vi.fn(() => 123456),
            send: vi.fn()
        };

        engine = {
            on: vi.fn(),
            emit: vi.fn(),
            getSystem: vi.fn((name) => {
                if (name === 'NetworkSystem') return networkSystem;
                return null;
            }),
            context: {
                soundEngine: {
                    playShoot: vi.fn(),
                    playClick: vi.fn()
                }
            },
            scene: new THREE.Scene(),
            camera: new THREE.PerspectiveCamera()
        };

        weaponSystem = new WeaponSystem(engine);
        weaponSystem.init();

        GameState.get.mockImplementation((key) => {
            if (key === 'currentSlot') return 2;
            if (key === 'ammoInClip') return 30;
            if (key === 'currentWeaponKey') return 'AK47';
            return null;
        });
    });

    it('should send a SHOOT message with server timestamp and ray data', () => {
        weaponSystem.shoot();

        expect(networkSystem.send).toHaveBeenCalledWith('SHOOT', expect.objectContaining({
            timestamp: 123456,
            origin: expect.any(THREE.Vector3),
            direction: expect.any(THREE.Vector3),
            weaponKey: 'AK47'
        }), true);
    });

    it('should not trigger handleHit or blood splatters directly in shoot()', () => {
        const handleHitSpy = vi.spyOn(weaponSystem, 'handleHit');
        weaponSystem.shoot();
        expect(handleHitSpy).not.toHaveBeenCalled();
    });

    it('should handle HIT_CONFIRMED by triggering visual effects', () => {
        const handleHitConfirmedSpy = vi.spyOn(weaponSystem, 'handleHitConfirmed');
        
        // Simulate event from NetworkSystem
        const hitData = {
            point: new THREE.Vector3(1, 2, 3),
            targetId: 'enemy-1',
            isHeadshot: true
        };
        
        // Find the listener registered during init
        const hitConfirmedListener = engine.on.mock.calls.find(call => call[0] === 'weapon:hit_confirmed')[1];
        hitConfirmedListener(hitData);

        expect(handleHitConfirmedSpy).toHaveBeenCalledWith(hitData);
    });
});
