import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FXSystem } from './FXSystem.js';
import { Engine } from '../core/Engine.js';
import * as THREE from 'three';

// Mock WebGPURenderer since it requires a real WebGPU context
vi.mock('three/webgpu', () => {
    class WebGPURenderer {
        constructor() {
            this.init = vi.fn().mockResolvedValue({});
            this.isWebGPU = true;
            this.compute = vi.fn();
            this.dispose = vi.fn();
            this.setPixelRatio = vi.fn();
            this.setSize = vi.fn();
            this.domElement = document.createElement('div');
        }
    }
    class PostProcessing {
        constructor() {
            this.render = vi.fn();
        }
    }
    return { WebGPURenderer, PostProcessing };
});

// Mock TSL functions
vi.mock('three/tsl', () => {
    return {
        instancedArray: vi.fn(() => ({
            nodeType: 'StorageBuffer'
        })),
        uniform: vi.fn((val) => ({
            value: val,
            nodeType: 'Uniform'
        })),
        storage: vi.fn(() => ({
            nodeType: 'Storage'
        })),
        assign: vi.fn(),
        add: vi.fn(),
        mul: vi.fn(),
        vec3: vi.fn(),
        f32: vi.fn(),
        float: vi.fn(),
        uint: vi.fn(),
        If: vi.fn(),
        instanceIndex: { nodeType: 'InstanceIndex' }
    };
});

describe('FXSystem', () => {
    let engine;
    let fxSystem;

    beforeEach(async () => {
        engine = new Engine();
        // Initialize renderer mock
        engine.renderer = new (await import('three/webgpu')).WebGPURenderer();
        engine.renderer.isWebGPU = true;
        
        fxSystem = engine.registerSystem(FXSystem);
    });

    it('should register with Engine and initialize', () => {
        expect(engine.getSystem('FXSystem')).toBe(fxSystem);
        fxSystem.init();
        expect(fxSystem.enabled).toBe(true);
    });

    it('should pre-allocate StorageBuffer for spark particles', () => {
        fxSystem.init();
        expect(fxSystem.sparkStorage).toBeDefined();
        // The plan mentions max 10,000 sparks
        expect(fxSystem.maxSparks).toBe(10000);
    });

    it('should listen for weapon:fired events', () => {
        fxSystem.init();
        const spawnSparksSpy = vi.spyOn(fxSystem, 'spawnMuzzleSparks');
        
        engine.emit('weapon:fired', { 
            weaponKey: 'AK47', 
            weaponData: { muzzleOffset: [0, 0, 1] } 
        });

        expect(spawnSparksSpy).toHaveBeenCalled();
    });
});
