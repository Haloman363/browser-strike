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

// Mock Weapon Recipes
vi.mock('../WeaponRecipes.js', () => ({
    WEAPON_RECIPES: {
        AK47: {
            recoilPattern: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
            moveInaccuracy: 0.05
        },
        GLOCK: {
            recoilPattern: [{x: 0, y: 0.1}],
            moveInaccuracy: 0.05
        }
    }
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

describe('Recoil & Spread Logic', () => {
    let engine;
    let weaponSystem;

    beforeEach(() => {
        engine = {
            on: vi.fn(),
            emit: vi.fn(),
            getSystem: vi.fn((name) => {
                if (name === 'PlayerControllerSystem') return { velocity: new THREE.Vector3(0, 0, 0) };
                if (name === 'NetworkSystem') return { getServerTime: () => 12345, send: vi.fn() };
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

    it('should increment shotIndex on each fire', () => {
        expect(weaponSystem.shotIndex).toBe(0);
        weaponSystem.shoot();
        expect(weaponSystem.shotIndex).toBe(1);
        weaponSystem.shoot();
        expect(weaponSystem.shotIndex).toBe(2);
    });

    it('should reset shotIndex when setFiring(false) is called', () => {
        weaponSystem.shotIndex = 5;
        weaponSystem.setFiring(false);
        expect(weaponSystem.shotIndex).toBe(0);
    });

    it('should calculate totalSpread as base + movement penalty', () => {
        const baseSpread = 0.02;
        const moveInaccuracy = 0.05;
        
        // Setup mock weapon recipe data
        weaponSystem.currentWeaponRecipe = { spread: baseSpread, moveInaccuracy };
        
        // Static
        let spread = weaponSystem.calculateSpread();
        expect(spread).toBe(baseSpread);
        
        // Moving
        const playerController = engine.getSystem('PlayerControllerSystem');
        playerController.velocity.set(5, 0, 5); // moving (length approx 7.07)
        
        spread = weaponSystem.calculateSpread();
        expect(spread).toBeGreaterThan(baseSpread);
        // spread = base + length * moveInaccuracy
        const expected = baseSpread + playerController.velocity.length() * moveInaccuracy;
        expect(spread).toBeCloseTo(expected, 5);
    });

    it('should apply the correct recoil coordinate from the pattern based on shotIndex', () => {
        const pattern = [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }];
        weaponSystem.currentWeaponRecipe = { recoilPattern: pattern };
        
        weaponSystem.shotIndex = 0;
        let punch = weaponSystem.getRecoilPunch();
        expect(punch.x).toBe(0.1);
        expect(punch.y).toBe(0.2);
        
        weaponSystem.shotIndex = 1;
        punch = weaponSystem.getRecoilPunch();
        expect(punch.x).toBe(0.3);
        expect(punch.y).toBe(0.4);
    });
});
