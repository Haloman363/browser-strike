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
    sub,
    mix,
    hash,
    cos,
    sin,
    PI2,
    uint,
    mx_noise_float,
    depth,
    viewportLinearDepth,
    uv,
    vec2,
    Fn,
    texture
} from 'three/tsl';
import { PointsNodeMaterial, SpriteNodeMaterial } from 'three/webgpu';

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

        this.maxSmoke = 25000; // 5 grenades * 5000 particles
        this.smokeIndex = 0;
        this.smokeStorage = null;
        
        // TSL Nodes
        this.computeUpdate = null;
        this.computeSpawn = null;
        this.computeSmokeUpdate = null;
        this.computeSmokeSpawn = null;
        
        // Uniforms
        this.deltaTime = uniform(0);
        this.spawnOrigin = uniform(vec3(0, 0, 0));
        this.spawnCount = uniform(uint(0));
        this.spawnStartIndex = uniform(uint(0));
        this.spawnTime = uniform(0);

        this.smokeSpawnOrigin = uniform(vec3(0, 0, 0));
        this.smokeSpawnCount = uniform(uint(0));
        this.smokeSpawnStartIndex = uniform(uint(0));
        
        this.sparkMesh = null;
        this.smokeMesh = null;

        // Flashbang state
        this.flashIntensity = uniform(0);
        this.snapshotTexture = uniform(new THREE.Texture());
    }

    init() {
        if (!this.engine.renderer.isWebGPU) {
            console.warn('FXSystem: WebGPU not supported. FX will be disabled.');
            this.enabled = false;
            return;
        }

        this.initSparks();
        this.initSmoke();
        this.initCompute();
        this.initFlashbangPost();
        
        // Listen for weapon fire events to spawn sparks
        this.engine.on('weapon:fired', (data) => this.spawnMuzzleSparks(data));
        
        // Listen for grenade detonation
        this.engine.on('grenade:detonated', (data) => {
            if (data.type === 'smoke') {
                this.spawnSmokeCloud(data.position);
            } else if (data.type === 'flashbang') {
                this.triggerFlashbang(data.position);
            }
        });

        // Sync snapshot texture when captured
        this.engine.on('frame:captured', (tex) => {
            this.snapshotTexture.value = tex;
        });

        console.log('FXSystem initialized');
    }

    initFlashbangPost() {
        // Create the TSL post-processing pass for flashbang
        const flashOverlay = ( ( input ) => {
            const white = vec3(1, 1, 1);
            const intensity = this.flashIntensity;
            const snapshot = texture(this.snapshotTexture);
            
            // Blend original with ghost after-image and then white-out
            const ghostBlend = mix(input, snapshot, intensity.mul(0.8));
            return mix(ghostBlend, white, intensity.pow(2.0));
        } );

        // Add to engine's post-processing
        if (this.engine.postProcessing) {
            const currentOutput = this.engine.postProcessing.outputNode;
            this.engine.postProcessing.outputNode = flashOverlay(currentOutput);
        }
    }

    triggerFlashbang(position) {
        const camera = this.engine.camera;
        if (!camera) return;

        // 1. Line of Sight Check
        const dist = camera.position.distanceTo(position);
        if (dist > 500) return; // Too far

        // Raycast to check for occlusion
        const raycaster = new THREE.Raycaster();
        const dir = position.clone().sub(camera.position).normalize();
        raycaster.set(camera.position, dir);
        
        const intersects = raycaster.intersectObjects(this.engine.context.objects || [], true);
        if (intersects.length > 0 && intersects[0].distance < dist - 5) {
            console.log("Flashbang occluded");
            return;
        }

        // 2. Orientation Check (Are they looking at it?)
        const viewDir = new THREE.Vector3();
        camera.getWorldDirection(viewDir);
        const dot = viewDir.dot(dir);
        
        let intensity = 0;
        if (dot > 0.5) { // Looking at it
            intensity = 1.0;
        } else if (dot > -0.5) { // Peripheral
            intensity = 0.5;
        } else { // Looking away
            intensity = 0.1;
        }

        // Apply distance falloff
        intensity *= (1.0 - (dist / 500));

        if (intensity > 0.1) {
            // 3. Capture Ghost Frame
            this.engine.captureFrame();
            
            // 4. Activate Effect
            this.flashIntensity.value = intensity;
            console.log(`Flashed with intensity: ${intensity}`);
        }
    }

    initSparks() {
        // Define particle structure in storage buffer
        this.sparkStorage = instancedArray(this.maxSparks, 'struct { position vec3, velocity vec3, age float, life float }');

        // Create the rendering mesh (Points)
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)); // Placeholder
        geometry.drawRange.count = this.maxSparks;

        const material = new PointsNodeMaterial();
        material.transparent = true;
        material.blending = THREE.AdditiveBlending;
        material.depthWrite = false;

        const sparks = this.sparkStorage;
        const spark = sparks.element(instanceIndex);

        // Position Node: Use the storage buffer's position
        material.positionNode = spark.position;

        // Size Node: Pulse or fade based on age
        const ageNorm = spark.age.div(spark.life);
        material.pointSizeNode = float(4).mul(sub(1, ageNorm));

        // Color Node: Bright orange/yellow fading to red
        const sparkColor = mix(vec3(1, 0.8, 0.2), vec3(1, 0.1, 0), ageNorm);
        material.colorNode = vec3(sparkColor).mul(If(spark.life.greaterThan(0), 1, 0)); // Opacity hack

        this.sparkMesh = new THREE.Points(geometry, material);
        this.sparkMesh.frustumCulled = false; // Always render
        this.sparkMesh.isInstancedPoints = true; // Flag for WebGPURenderer
        this.sparkMesh.count = this.maxSparks;

        this.engine.scene.add(this.sparkMesh);
    }

    initSmoke() {
        this.smokeStorage = instancedArray(this.maxSmoke, 'struct { position vec3, velocity vec3, age float, life float, size float }');

        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new SpriteNodeMaterial();
        material.transparent = true;
        material.depthWrite = false;
        material.blending = THREE.NormalBlending;

        const smokeParticles = this.smokeStorage;
        const smoke = smokeParticles.element(instanceIndex);

        // Position Node
        material.positionNode = smoke.position;

        // Scale Node: Expansion then fade out
        const ageNorm = smoke.age.div(smoke.life);
        material.scaleNode = smoke.size.mul(ageNorm.smoothstep(0, 0.2)).mul(sub(1, ageNorm.pow(4)));

        // Color & Alpha with Soft-Particle blending
        material.colorNode = Fn(() => {
            const baseAlpha = ageNorm.smoothstep(0, 0.1).mul(sub(1, ageNorm.pow(2))).mul(0.4);
            
            // Radial density: fade at edges of the particle sprite
            const dist = uv().distance(vec2(0.5));
            const radialFade = dist.mul(2.0).oneMinus().smoothstep(0, 0.5);
            
            // Soft-particle logic: fade near geometry
            const fragmentDepth = depth;
            const sceneDepth = viewportLinearDepth;
            const depthDiff = sceneDepth.sub(fragmentDepth);
            const softFade = depthDiff.mul(0.01).clamp(0, 1);
            
            return vec3(0.6, 0.6, 0.6).toVar().pack(baseAlpha.mul(softFade).mul(radialFade));
        })();

        this.smokeMesh = new THREE.InstancedMesh(geometry, material, this.maxSmoke);
        this.smokeMesh.frustumCulled = false;
        this.smokeMesh.count = this.maxSmoke;

        this.engine.scene.add(this.smokeMesh);
    }

    initCompute() {
        const sparks = this.sparkStorage;
        const spark = sparks.element(instanceIndex);

        // Update Compute Node
        this.computeUpdate = ( () => {
            const gravity = vec3(0, -980, 0); // High gravity for sparks
            const drag = float(0.98); // Simple drag

            const age = spark.age.add(this.deltaTime);
            const velocity = spark.velocity.add(gravity.mul(this.deltaTime)).mul(drag);
            const position = spark.position.add(velocity.mul(this.deltaTime));

            return assign(spark, { position, velocity, age }).append(
                // If age > life, set life to 0 to mark as inactive (rendered with 0 opacity)
                If(age.greaterThan(spark.life), assign(spark.life, 0))
            );
        } )().compute(this.maxSparks);

        // Spawn Compute Node
        this.computeSpawn = ( () => {
            // Only update a range of particles defined by spawnStartIndex and spawnCount
            const isInRange = instanceIndex.greaterThanEqual(this.spawnStartIndex).and(instanceIndex.lessThan(this.spawnStartIndex.add(this.spawnCount)));

            return If(isInRange, () => {
                const h1 = hash(instanceIndex.add(this.spawnTime));
                const h2 = hash(instanceIndex.add(this.spawnTime).add(123.456));
                const h3 = hash(instanceIndex.add(this.spawnTime).add(789.012));

                const spread = float(1000);
                const randomVel = vec3(
                    h1.mul(2).sub(1).mul(spread),
                    h2.mul(2).sub(1).mul(spread),
                    h3.mul(2).sub(1).mul(spread)
                );

                return assign(spark, {
                    position: this.spawnOrigin,
                    velocity: randomVel,
                    age: 0,
                    life: h1.mul(0.5).add(0.2) // Life between 0.2 and 0.7 seconds
                });
            });
        } )().compute(this.maxSparks);

        // Smoke Update Compute
        this.computeSmokeUpdate = ( () => {
            const smoke = this.smokeStorage.element(instanceIndex);
            
            const age = smoke.age.add(this.deltaTime);
            
            // Turbulence and drift
            const noise = mx_noise_float(smoke.position.mul(0.01).add(this.spawnTime.mul(0.1)));
            const drift = vec3(noise.mul(10), float(20).add(noise.mul(5)), noise.mul(10));
            
            const velocity = smoke.velocity.add(drift.mul(this.deltaTime));
            const position = smoke.position.add(velocity.mul(this.deltaTime));

            return assign(smoke, { position, velocity, age }).append(
                If(age.greaterThan(smoke.life), assign(smoke.life, 0))
            );
        } )().compute(this.maxSmoke);

        // Smoke Spawn Compute
        this.computeSmokeSpawn = ( () => {
            const smoke = this.smokeStorage.element(instanceIndex);
            const isInRange = instanceIndex.greaterThanEqual(this.smokeSpawnStartIndex).and(instanceIndex.lessThan(this.smokeSpawnStartIndex.add(this.smokeSpawnCount)));

            return If(isInRange, () => {
                const h1 = hash(instanceIndex.add(this.spawnTime));
                const h2 = hash(instanceIndex.add(this.spawnTime).add(123.456));
                const h3 = hash(instanceIndex.add(this.spawnTime).add(789.012));

                const randomDir = vec3(
                    h1.mul(2).sub(1),
                    h2.mul(2).sub(1).abs(), // Mostly upwards
                    h3.mul(2).sub(1)
                ).normalize();

                const speed = h1.mul(100).add(50);
                const velocity = randomDir.mul(speed);

                return assign(smoke, {
                    position: this.smokeSpawnOrigin,
                    velocity: velocity,
                    age: 0,
                    life: h2.mul(10).add(10), // 10-20 seconds
                    size: h3.mul(100).add(150) // Random size
                });
            });
        } )().compute(this.maxSmoke);
    }

    spawnMuzzleSparks(data) {
        const { weaponKey, weaponData } = data;
        
        // Determine spawn location
        const camera = this.engine.camera;
        const muzzlePos = camera.position.clone();
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        muzzlePos.add(dir.multiplyScalar(5)); // Offset from camera

        const count = 20; // Sparks per shot
        
        // Update uniforms for spawn compute
        this.spawnOrigin.value.copy(muzzlePos);
        this.spawnStartIndex.value = this.sparkIndex;
        this.spawnCount.value = count;
        this.spawnTime.value = performance.now();
        
        // Dispatch spawn compute
        this.engine.renderer.compute(this.computeSpawn);
        
        // Advance index for next spawn (wrapping around)
        this.sparkIndex = (this.sparkIndex + count) % this.maxSparks;
    }

    spawnSmokeCloud(position) {
        const count = 5000;
        
        this.smokeSpawnOrigin.value.copy(position);
        this.smokeSpawnStartIndex.value = this.smokeIndex;
        this.smokeSpawnCount.value = count;
        this.spawnTime.value = performance.now();
        
        this.engine.renderer.compute(this.computeSmokeSpawn);
        
        this.smokeIndex = (this.smokeIndex + count) % this.maxSmoke;
    }

    update(delta, time) {
        if (!this.enabled || !this.computeUpdate) return;
        
        // Update uniforms
        this.deltaTime.value = delta;
        this.spawnTime.value = time;

        // Flashbang decay
        if (this.flashIntensity.value > 0) {
            this.flashIntensity.value -= delta * 0.15; // Fades out over ~6-7 seconds
            if (this.flashIntensity.value < 0) this.flashIntensity.value = 0;
        }
        
        // Dispatch update computes
        this.engine.renderer.compute(this.computeUpdate);
        if (this.computeSmokeUpdate) {
            this.engine.renderer.compute(this.computeSmokeUpdate);
        }
    }
}
