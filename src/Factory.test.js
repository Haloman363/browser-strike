import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Mock TSL and WebGPU BEFORE imports
vi.mock('three/webgpu', () => ({
    MeshStandardNodeMaterial: class extends THREE.MeshStandardMaterial {},
    MeshBasicNodeMaterial: class extends THREE.MeshBasicMaterial {}
}));

vi.mock('three/tsl', () => ({
    texture: vi.fn(() => ({})),
    color: vi.fn(() => ({})),
    float: vi.fn(() => ({})),
    vec3: vi.fn(() => ({}))
}));

vi.mock('./core/AssetManager.js', () => ({
    assetManager: {
        loadOBJ: vi.fn(() => Promise.resolve(new THREE.Group())),
        loadGLB: vi.fn(() => Promise.resolve(new THREE.Group()))
    }
}));

// Mock TextureGenerator to avoid Canvas issues in JSDOM
vi.mock('./TextureGenerator.js', () => ({
    TextureGenerator: {
        createWallTexture: vi.fn(() => new THREE.Texture()),
        createCrateTexture: vi.fn(() => new THREE.Texture()),
        createConcreteTexture: vi.fn(() => new THREE.Texture()),
        createMetalTexture: vi.fn(() => new THREE.Texture()),
        createPolymerTexture: vi.fn(() => new THREE.Texture()),
        createGloveTexture: vi.fn(() => new THREE.Texture()),
        createSteelTexture: vi.fn(() => new THREE.Texture()),
        createSkinTexture: vi.fn(() => new THREE.Texture()),
        createC4Texture: vi.fn(() => new THREE.Texture()),
        createBombSiteTexture: vi.fn(() => new THREE.Texture()),
        createSandTexture: vi.fn(() => new THREE.Texture()),
        createCamoTexture: vi.fn(() => new THREE.Texture()),
        createWoodTexture: vi.fn(() => new THREE.Texture())
    }
}));

// Now import after mocks are defined
import { createGunModel, createKnifeModel, createHumanoidModel } from './Factory.js';

describe('Factory Model Generation', () => {
    
    it('createKnifeModel should return a group', () => {
        const model = createKnifeModel();
        expect(model).toBeInstanceOf(THREE.Group);
    });

    it('createGunModel should return a group', () => {
        const model = createGunModel('AK47');
        expect(model).toBeInstanceOf(THREE.Group);
    });

    it('createHumanoidModel should return a group', () => {
        const model = createHumanoidModel('CT');
        expect(model).toBeInstanceOf(THREE.Group);
        expect(model.name).toBe('humanoid');
    });
});
