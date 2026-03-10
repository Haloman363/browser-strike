import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

/**
 * AssetManager handles centralized loading and caching of external 3D models.
 * Supports GLB/GLTF and OBJ formats.
 */
export class AssetManager {
    constructor() {
        this.manager = new THREE.LoadingManager();
        this.glbLoader = new GLTFLoader(this.manager);
        this.objLoader = new OBJLoader(this.manager);
        this.mtlLoader = new MTLLoader(this.manager);
        
        this.cache = new Map(); // URL -> Object3D
        this.loading = new Map(); // URL -> Promise
    }

    /**
     * Loads a GLB/GLTF model.
     * @param {string} url 
     * @returns {Promise<THREE.Group>}
     */
    async loadGLB(url) {
        if (this.cache.has(url)) return this.cache.get(url).clone();
        if (this.loading.has(url)) return this.loading.get(url);

        const promise = new Promise((resolve, reject) => {
            this.glbLoader.load(url, 
                (gltf) => {
                    const model = gltf.scene;
                    this.cache.set(url, model);
                    this.loading.delete(url);
                    resolve(model.clone());
                },
                undefined,
                (err) => {
                    console.error(`AssetManager: Error loading GLB from ${url}`, err);
                    this.loading.delete(url);
                    reject(err);
                }
            );
        });

        this.loading.set(url, promise);
        return promise;
    }

    /**
     * Loads an OBJ model with optional MTL.
     * @param {string} url 
     * @param {string} mtlUrl 
     * @returns {Promise<THREE.Group>}
     */
    async loadOBJ(url, mtlUrl = null) {
        const cacheKey = `${url}${mtlUrl || ''}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey).clone();
        if (this.loading.has(cacheKey)) return this.loading.get(cacheKey);

        const promise = new Promise((resolve, reject) => {
            const loadActualOBJ = (materials = null) => {
                if (materials) {
                    materials.preload();
                    this.objLoader.setMaterials(materials);
                }

                this.objLoader.load(url, 
                    (obj) => {
                        this.cache.set(cacheKey, obj);
                        this.loading.delete(cacheKey);
                        resolve(obj.clone());
                    },
                    undefined,
                    (err) => {
                        console.error(`AssetManager: Error loading OBJ from ${url}`, err);
                        this.loading.delete(cacheKey);
                        reject(err);
                    }
                );
            };

            if (mtlUrl) {
                this.mtlLoader.load(mtlUrl, 
                    (materials) => loadActualOBJ(materials),
                    undefined,
                    (err) => {
                        console.warn(`AssetManager: Could not load MTL from ${mtlUrl}, falling back to OBJ only.`, err);
                        loadActualOBJ();
                    }
                );
            } else {
                loadActualOBJ();
            }
        });

        this.loading.set(cacheKey, promise);
        return promise;
    }
}

// Singleton instance
export const assetManager = new AssetManager();
