import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { EventEmitter } from './EventEmitter.js';

/**
 * The core engine class that orchestrates systems and the game loop.
 */
export class Engine extends EventEmitter {
    constructor() {
        super();
        console.log("Engine constructor called - has update method:", typeof this.update === 'function');
        this.systems = new Map();
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.backend = null;
        this.clock = new THREE.Clock();
        this.isRunning = false;
        this.context = {}; // Global context for systems to share resources
    }

    /**
     * Initializes the core Three.js components.
     * @param {Object} options Scene/Camera/Renderer configuration.
     */
    async init(options = {}) {
        this.scene = options.scene || new THREE.Scene();
        this.camera = options.camera || new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.renderer = options.renderer || new WebGPURenderer({ antialias: true });
        
        if (!options.renderer) {
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // Initialize WebGPU backend
        await this.renderer.init();
        this.backend = this.renderer.isWebGPU ? 'WebGPU' : 'WebGL';
        console.log(`Renderer initialized with ${this.backend} backend`);

        // Add renderer to DOM if not already present
        if (!this.renderer.domElement.parentElement && options.container) {
            options.container.appendChild(this.renderer.domElement);
        }

        window.addEventListener('resize', () => this.onResize());

        // Initialize systems
        for (const system of this.systems.values()) {
            system.init();
        }

        return this;
    }

    /**
     * Registers a system with the engine.
     * @param {SystemClass} SystemClass 
     */
    registerSystem(SystemClass) {
        const system = new SystemClass(this);
        // Use static systemName if available, otherwise fallback to constructor name (minification unsafe)
        const name = SystemClass.systemName || system.name;
        this.systems.set(name, system);
        if (this.isRunning) {
            system.init();
        }
        return system;
    }

    /**
     * Returns a registered system by name.
     * @param {string} name 
     */
    getSystem(name) {
        return this.systems.get(name);
    }

    /**
     * Starts the game loop.
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.clock.start();
        this.loop();
    }

    /**
     * Updates all registered systems.
     * @param {number} delta 
     * @param {number} time 
     */
    update(delta, time) {
        for (const system of this.systems.values()) {
            if (system.enabled) {
                system.update(delta, time);
            }
        }
    }

    /**
     * Main game loop.
     */
    loop() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.loop());

        const delta = Math.min(this.clock.getDelta(), 0.1); // Cap delta to prevent huge jumps
        const time = this.clock.elapsedTime;

        // Update all enabled systems
        for (const system of this.systems.values()) {
            if (system.enabled) {
                system.update(delta, time);
            }
        }

        // Render the scene
        if (this.scene && this.camera && this.renderer) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Stops the game loop.
     */
    stop() {
        this.isRunning = false;
        this.clock.stop();
    }

    onResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    /**
     * Cleanup resources.
     */
    destroy() {
        this.stop();
        for (const system of this.systems.values()) {
            system.destroy();
        }
        this.systems.clear();
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement.parentElement) {
                this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
            }
        }
    }
}
