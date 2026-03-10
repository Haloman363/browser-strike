import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { BombSystem } from './BombSystem.js';
import { GameState } from '../GameState.js';
import { BOMB_SETTINGS } from '../Constants_v2.js';

vi.mock('../Factory.js', () => ({
    createC4Model: vi.fn(() => {
        const mesh = new THREE.Mesh();
        mesh.add(new THREE.Object3D()); // mock led
        mesh.children[0].name = 'led';
        mesh.children[0].material = { color: { set: vi.fn() } };
        return mesh;
    })
}));

describe('BombSystem Defusal', () => {
    let engine;
    let bombSystem;
    let mockInput;

    beforeEach(() => {
        mockInput = {
            isKeyPressed: vi.fn()
        };

        engine = {
            on: vi.fn(),
            emit: vi.fn(),
            getSystem: vi.fn((name) => {
                if (name === 'InputSystem') return mockInput;
                return null;
            }),
            scene: {
                add: vi.fn(),
                remove: vi.fn()
            },
            camera: {
                position: new THREE.Vector3(0, 0, 0)
            },
            context: {
                soundEngine: null
            }
        };
        bombSystem = new BombSystem(engine);
        GameState.set({ 
            bombPlanted: false, 
            bombExploded: false, 
            bombDefused: false,
            defuseProgress: 0,
            hasDefuseKit: false 
        });
    });

    it('should start defusing when holding B near bomb', () => {
        bombSystem.onBombPlanted({ position: new THREE.Vector3(10, 0, 0) });
        
        mockInput.isKeyPressed.mockReturnValue(true);
        engine.camera.position.set(11, 0, 0); // Near bomb (dist = 1)
        
        bombSystem.update(1, 0);

        expect(GameState.get('defuseProgress')).toBeGreaterThan(0);
        expect(GameState.get('isDefusing')).toBe(true);
    });

    it('should NOT defuse if too far away', () => {
        bombSystem.onBombPlanted({ position: new THREE.Vector3(10, 0, 0) });
        
        mockInput.isKeyPressed.mockReturnValue(true);
        engine.camera.position.set(100, 0, 0); // Far from bomb (dist = 90 > DEFUSE_RADIUS=30)
        
        bombSystem.update(1, 0);

        expect(GameState.get('defuseProgress')).toBe(0);
        expect(GameState.get('isDefusing')).toBe(false);
    });

    it('should defuse twice as fast with kit', () => {
        bombSystem.onBombPlanted({ position: new THREE.Vector3(10, 0, 0) });
        engine.camera.position.set(11, 0, 0);
        mockInput.isKeyPressed.mockReturnValue(true);

        // Case 1: No kit (10s)
        GameState.set({ hasDefuseKit: false, defuseProgress: 0 });
        bombSystem.update(1, 0);
        const progressNoKit = GameState.get('defuseProgress');

        // Case 2: With kit (5s)
        GameState.set({ hasDefuseKit: true, defuseProgress: 0 });
        bombSystem.update(1, 0);
        const progressWithKit = GameState.get('defuseProgress');

        expect(progressWithKit).toBe(progressNoKit * 2);
    });

    it('should reset progress if B is released', () => {
        bombSystem.onBombPlanted({ position: new THREE.Vector3(10, 0, 0) });
        engine.camera.position.set(11, 0, 0);
        
        // Start defusing
        mockInput.isKeyPressed.mockReturnValue(true);
        bombSystem.update(1, 0);
        expect(GameState.get('defuseProgress')).toBeGreaterThan(0);

        // Release B
        mockInput.isKeyPressed.mockReturnValue(false);
        bombSystem.update(1, 0);
        expect(GameState.get('defuseProgress')).toBe(0);
        expect(GameState.get('isDefusing')).toBe(false);
    });

    it('should emit bomb:defused when progress reaches 1', () => {
        bombSystem.onBombPlanted({ position: new THREE.Vector3(10, 0, 0) });
        engine.camera.position.set(11, 0, 0);
        mockInput.isKeyPressed.mockReturnValue(true);
        GameState.set({ hasDefuseKit: true }); // 5s defuse

        bombSystem.update(5.1, 0);

        expect(GameState.get('bombDefused')).toBe(true);
        expect(engine.emit).toHaveBeenCalledWith('bomb:defused');
    });
});
