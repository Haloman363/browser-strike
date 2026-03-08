import * as THREE from 'three';
import { System } from '../core/System.js';
import { 
    storage, 
    instancedArray, 
    uniform, 
    attribute, 
    float, 
    vec3, 
    instanceIndex,
    assign,
    If,
    add,
    mul,
    f32
} from 'three/tsl';

/**
 * FXSystem handles GPU-accelerated visual effects using WebGPU compute shaders.
 */
export class FXSystem extends System {
    static systemName = 'FXSystem';

    constructor(engine) {
        super(engine);
        this.maxSparks = 10000;
        this.sparkIndex = 0;
        this.sparkStorage = null;
        this.computeUpdate = null;
        this.sparkMesh = null;
    }

    init() {
        if (!this.engine.renderer.isWebGPU) {
            console.warn('FXSystem: WebGPU not supported. FX will be disabled.');
            this.enabled = false;
            return;
        }

        this.initSparks();
        
        // Listen for weapon fire events to spawn sparks
        this.engine.on('weapon:fired', (data) => this.spawnMuzzleSparks(data));

        console.log('FXSystem initialized');
    }

    initSparks() {
        // Define particle structure in storage buffer
        // Using instancedArray for easy attribute mapping later
        this.sparkStorage = instancedArray(this.maxSparks, 'struct { position vec3, velocity vec3, age float, life float }');

        // Initial state is naturally zeros, which is fine as 'life' 0 means inactive
    }

    spawnMuzzleSparks(data) {
        const { weaponKey, weaponData } = data;
        // To be implemented in Task 2/3
        // console.log(`Spawning sparks for ${weaponKey}`);
    }

    update(delta, time) {
        if (!this.enabled || !this.computeUpdate) return;
        
        // Dispatch compute shaders
        // this.engine.renderer.compute(this.computeUpdate);
    }
}
