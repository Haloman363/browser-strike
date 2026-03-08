import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Mock TextureGenerator
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
        createCamoTexture: vi.fn(() => new THREE.Texture()),
        createC4Texture: vi.fn(() => new THREE.Texture()),
        createBombSiteTexture: vi.fn(() => new THREE.Texture())
    }
}));

import { MeshStandardNodeMaterial } from 'three/webgpu';
import { createKnifeModel, createGunModel, createHumanoidModel } from './Factory.js';

// Mock THREE.Color if needed, but we probably don't need to mock much since we're in Vite
// We need to ensure that the environment supports the three/webgpu imports.

describe('Factory Material Validation', () => {
    it('createKnifeModel should return a group containing MeshStandardNodeMaterial', () => {
        const model = createKnifeModel();
        let foundStandardMaterial = false;
        model.traverse((child) => {
            if (child.isMesh && child.material instanceof MeshStandardNodeMaterial) {
                foundStandardMaterial = true;
            }
        });
        expect(foundStandardMaterial).toBe(true);
    });

    it('createGunModel should return a group containing MeshStandardNodeMaterial', () => {
        const model = createGunModel('GLOCK');
        let foundStandardMaterial = false;
        model.traverse((child) => {
            if (child.isMesh && child.material instanceof MeshStandardNodeMaterial) {
                foundStandardMaterial = true;
            }
        });
        expect(foundStandardMaterial).toBe(true);
    });

    it('createHumanoidModel should use MeshStandardNodeMaterial', () => {
        const model = createHumanoidModel('TERRORIST');
        let foundStandardMaterial = false;
        model.traverse((child) => {
            if (child.isMesh && child.material instanceof MeshStandardNodeMaterial) {
                // Ignore basic materials like the LED or screen if any
                if (child.material.type === 'MeshStandardNodeMaterial') {
                   foundStandardMaterial = true;
                }
            }
        });
        expect(foundStandardMaterial).toBe(true);
    });
});
