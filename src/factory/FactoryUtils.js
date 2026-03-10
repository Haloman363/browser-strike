import * as THREE from 'three';
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial, MeshPhongNodeMaterial } from 'three/webgpu';
import { texture, color, float, vec3 } from 'three/tsl';
import { COLORS } from '../Constants_v2.js';
import { TextureGenerator } from '../TextureGenerator.js';
import { WeaponBuilder } from '../WeaponBuilder.js';

export const wallTexture = TextureGenerator.createWallTexture();
export const crateTexture = TextureGenerator.createCrateTexture();
export const concreteTexture = TextureGenerator.createConcreteTexture();

// Weapon Textures
export const gunBodyTex = TextureGenerator.createMetalTexture('#222222');
export const gunSlideTex = TextureGenerator.createMetalTexture('#333333');
export const gunGripTex = TextureGenerator.createPolymerTexture('#151515');
export const gloveTex = TextureGenerator.createGloveTexture();
export const bladeTex = TextureGenerator.createSteelTexture();
export const nadeTex = TextureGenerator.createMetalTexture('#4b5320');

// Helper for detail functions that were moved to builder but still referenced
export function addEjectionPort(group, position, size, material) {
    const portGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const port = new THREE.Mesh(portGeo, material);
    port.position.copy(position);
    group.add(port);
    
    // Bolt inside
    const boltGeo = new THREE.BoxGeometry(size.x * 0.9, size.y * 0.9, size.z * 0.9);
    const boltMat = new MeshStandardNodeMaterial();
    boltMat.colorNode = color(0x555555);
    boltMat.roughnessNode = float(0.2);
    boltMat.metalnessNode = float(1.0);
    const bolt = new THREE.Mesh(boltGeo, boltMat);
    bolt.position.copy(position);
    bolt.position.x -= 0.005; 
    group.add(bolt);
}

export function addBoltDetails(group, positions, size, material) {
    const boltGeo = new THREE.CylinderGeometry(size, size, 0.01, 8);
    boltGeo.rotateZ(Math.PI / 2);
    positions.forEach(pos => {
        const bolt = new THREE.Mesh(boltGeo, material);
        bolt.position.copy(pos);
        group.add(bolt);
    });
}

export function createViewModelArms(group, skinMat, gloveMat, side = 'both', overrides = {}) {
    const createArm = (isRight) => {
        const armGroup = new THREE.Group();
        const sideOver = overrides[isRight ? 'right' : 'left'] || {};
        
        // --- Geometry Constants ---
        const upperArmLen = 0.4;
        const forearmLen = 0.35;
        const handSize = { w: 0.07, h: 0.035, d: 0.09 };
        
        // Upper Arm (Bicep/Tricep area)
        const upperArmGeo = new THREE.CylinderGeometry(0.05, 0.065, upperArmLen, 8);
        const upperArm = new THREE.Mesh(upperArmGeo, skinMat);
        upperArm.rotation.x = Math.PI / 2;
        upperArm.position.z = upperArmLen + forearmLen + handSize.d / 2;
        armGroup.add(upperArm);
        
        // Elbow Joint
        const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 8), skinMat);
        elbow.position.z = forearmLen + handSize.d / 2;
        armGroup.add(elbow);
        
        // Forearm
        const forearmGeo = new THREE.CylinderGeometry(0.038, 0.05, forearmLen, 8);
        const forearm = new THREE.Mesh(forearmGeo, skinMat);
        forearm.rotation.x = Math.PI / 2;
        forearm.position.z = forearmLen / 2 + handSize.d / 2;
        armGroup.add(forearm);

        // Sleeve (Upper part of forearm)
        const sleeveGeo = new THREE.CylinderGeometry(0.052, 0.052, forearmLen * 0.6, 8);
        const sleeveMat = new MeshStandardNodeMaterial();
        sleeveMat.colorNode = color(isRight ? 0x222222 : 0x252525); // Dark fabric
        sleeveMat.roughnessNode = float(0.9);
        sleeveMat.metalnessNode = float(0.0);
        const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
        sleeve.rotation.x = Math.PI / 2;
        sleeve.position.z = forearmLen * 0.7 + handSize.d / 2;
        armGroup.add(sleeve);
        
        // Wrist / Glove Cuff
        const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.1, 8), gloveMat);
        wrist.rotation.x = Math.PI / 2;
        wrist.position.z = handSize.d / 2 + 0.02;
        armGroup.add(wrist);

        // Tactical Watch (Left arm only)
        if (!isRight) {
            const watchGroup = new THREE.Group();
            watchGroup.position.z = handSize.d / 2 + 0.05;
            watchGroup.rotation.x = Math.PI / 2;
            
            // Strap
            const strapMat = new MeshStandardNodeMaterial();
            strapMat.colorNode = color(0x111111);
            strapMat.roughnessNode = float(0.8);
            strapMat.metalnessNode = float(0.0);
            const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 8), strapMat);
            watchGroup.add(strap);
            
            // Face
            const faceMat = new MeshStandardNodeMaterial();
            faceMat.colorNode = color(0x222222);
            faceMat.roughnessNode = float(0.8);
            faceMat.metalnessNode = float(0.0);
            const face = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.04), faceMat);
            face.position.y = 0.04;
            watchGroup.add(face);
            
            // Screen
            const screenMat = new MeshBasicNodeMaterial();
            screenMat.colorNode = color(0x00ff00);
            screenMat.opacityNode = float(0.5);
            screenMat.transparent = true;
            const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), screenMat);
            screen.rotation.x = -Math.PI / 2;
            screen.position.y = 0.046;
            watchGroup.add(screen);
            
            armGroup.add(watchGroup);
        }
        
        // Hand Base (Palm)
        const hand = new THREE.Mesh(new THREE.BoxGeometry(handSize.w, handSize.h, handSize.d), gloveMat);
        hand.position.z = 0;
        armGroup.add(hand);
        
        // Fingers
        const fingerWidth = 0.014;
        const fingerSpacing = 0.016;
        for (let i = 0; i < 4; i++) {
            const fGroup = new THREE.Group();
            fGroup.position.set(-0.024 + (i * fingerSpacing), -0.005, -handSize.d/2);
            
            // Proximal Phalanx
            const prox = new THREE.Mesh(new THREE.BoxGeometry(fingerWidth, fingerWidth, 0.035), gloveMat);
            prox.position.z = -0.0175;
            fGroup.add(prox);
            
            // Intermediate/Distal (one piece for simplicity but bent)
            const distGroup = new THREE.Group();
            distGroup.position.z = -0.035;
            distGroup.rotation.x = 0.8; // Grip bend
            
            const dist = new THREE.Mesh(new THREE.BoxGeometry(fingerWidth, fingerWidth, 0.035), skinMat);
            dist.position.z = -0.0175;
            distGroup.add(dist);
            fGroup.add(distGroup);
            
            hand.add(fGroup);
        }
        
        // Thumb
        const tGroup = new THREE.Group();
        tGroup.position.set(isRight ? 0.035 : -0.035, -0.005, -0.01);
        tGroup.rotation.y = isRight ? -0.6 : 0.6;
        
        const tProx = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.03), gloveMat);
        tProx.position.z = -0.015;
        tGroup.add(tProx);
        
        const tDist = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.025), skinMat);
        tDist.position.z = -0.04;
        tDist.rotation.x = 0.4;
        tGroup.add(tDist);
        
        hand.add(tGroup);

        // Apply Position & Rotation
        const defPos = isRight ? {x: 0.2, y: -0.2, z: 0.2} : {x: -0.2, y: -0.2, z: -0.1};
        const defRot = isRight ? {x: -0.2, y: -0.4, z: -0.2} : {x: -0.3, y: 0.4, z: 0.2};
        
        armGroup.position.set(
            sideOver.x !== undefined ? sideOver.x : defPos.x,
            sideOver.y !== undefined ? sideOver.y : defPos.y,
            sideOver.z !== undefined ? sideOver.z : defPos.z
        );
        armGroup.rotation.set(
            sideOver.rx !== undefined ? sideOver.rx : defRot.x,
            sideOver.ry !== undefined ? sideOver.ry : defRot.y,
            sideOver.rz !== undefined ? sideOver.rz : defRot.z
        );
        
        armGroup.name = isRight ? 'rightArm' : 'leftArm';
        group.add(armGroup);
    };

    if (side === 'both' || side === 'right') createArm(true);
    if (side === 'both' || side === 'left') createArm(false);
}
