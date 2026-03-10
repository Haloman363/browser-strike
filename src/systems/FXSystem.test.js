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
            nodeType: 'StorageBuffer',
            element: vi.fn(() => ({
                nodeType: 'StorageElement',
                age: { 
                    add: vi.fn(() => ({ 
                        nodeType: 'AddedAge',
                        add: vi.fn(),
                        div: vi.fn(() => ({ mul: vi.fn() })),
                        greaterThan: vi.fn()
                    })),
                    div: vi.fn(() => ({ mul: vi.fn() })) 
                },
                life: { 
                    greaterThan: vi.fn(() => ({ append: vi.fn() })),
                    add: vi.fn()
                },
                position: { 
                    nodeType: 'Position',
                    add: vi.fn()
                },
                velocity: { 
                    nodeType: 'Velocity',
                    add: vi.fn(() => ({ mul: vi.fn(() => ({ mul: vi.fn(), add: vi.fn() })) })),
                    mul: vi.fn(() => ({ mul: vi.fn(), add: vi.fn() }))
                }
            }))
        })),
        uniform: vi.fn((val) => ({
            value: typeof val === 'object' && val !== null ? { 
                copy: vi.fn(),
                ...val 
            } : val,
            nodeType: 'Uniform',
            add: vi.fn(() => ({ 
                nodeType: 'AddedUniform',
                add: vi.fn()
            })),
            greaterThanEqual: vi.fn(),
            lessThan: vi.fn()
        })),
        storage: vi.fn(() => ({
            nodeType: 'Storage'
        })),
        assign: vi.fn(() => ({ 
            append: vi.fn(() => ({
                compute: vi.fn(() => ({ 
                    nodeType: 'ComputeNode' 
                }))
            })),
            compute: vi.fn(() => ({ 
                nodeType: 'ComputeNode' 
            }))
        })),
        add: vi.fn(),
        mul: vi.fn(),
        sub: vi.fn(),
        div: vi.fn(),
        mix: vi.fn(),
        hash: vi.fn(),
        vec3: vi.fn((x, y, z) => ({ x, y, z, mul: vi.fn(), add: vi.fn() })),
        f32: vi.fn(),
        float: vi.fn((v) => ({ 
            v, 
            mul: vi.fn(() => ({ add: vi.fn() })), 
            div: vi.fn(() => ({ mul: vi.fn() })),
            add: vi.fn()
        })),
        uint: vi.fn(),
        If: vi.fn(() => ({ 
            append: vi.fn(() => ({
                compute: vi.fn(() => ({ nodeType: 'ComputeNode' }))
            })),
            compute: vi.fn(() => ({ nodeType: 'ComputeNode' }))
        })),
        instanceIndex: { 
            nodeType: 'InstanceIndex', 
            add: vi.fn(() => ({ 
                add: vi.fn(),
                nodeType: 'AddedIndex'
            })),
            greaterThanEqual: vi.fn(() => ({ 
                and: vi.fn(() => ({ 
                    lessThan: vi.fn(),
                    nodeType: 'AndResult'
                })),
                lessThan: vi.fn()
            })),
            lessThan: vi.fn()
        }
    };
});

// Mock PointsNodeMaterial
vi.mock('three/webgpu', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        PointsNodeMaterial: class {
            constructor() {
                this.transparent = false;
                this.blending = THREE.NormalBlending;
                this.depthWrite = true;
                this.positionNode = null;
                this.pointSizeNode = null;
                this.colorNode = null;
            }
        }
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
        engine.scene = new THREE.Scene();
        engine.camera = new THREE.PerspectiveCamera();
        
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
