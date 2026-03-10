import * as THREE from 'three';
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, color, float } from 'three/tsl';
import { COLORS } from '../Constants_v2.js';
import { TextureGenerator } from '../TextureGenerator.js';
import { assetManager } from '../core/AssetManager.js';

export function createHumanoidModel(team = 'TERRORIST') {
    const isCT = (team === 'COUNTER_TERRORIST' || team === 'CT');
    const group = new THREE.Group();
    group.name = "humanoid";

    // --- EXTERNAL ASSET LOADING (Optional) ---
    const isHighRes = localStorage.getItem('bs_low_res_textures') !== 'true';
    if (isHighRes && !isCT) {
        const baseUrl = import.meta.env.BASE_URL;
        const modelPath = `${baseUrl}assets/models/characters/arctic/TERRORIST_Arctic Avenger.obj`;
        const mtlPath = `${baseUrl}assets/models/characters/arctic/TERRORIST_Arctic Avenger.mtl`;
        
        assetManager.loadOBJ(modelPath, mtlPath).then(externalGroup => {
            // Remove procedural children
            while(group.children.length > 0) {
                group.remove(group.children[0]);
            }
            
            // Align external model
            // 1.6 models are usually huge (units are small). Scale down to match our ~20 unit height.
            externalGroup.scale.set(0.15, 0.15, 0.15); 
            externalGroup.position.y = 0; // Feet at ground
            externalGroup.rotation.y = Math.PI; // Face forward
            
            group.add(externalGroup);
            console.log("Swapped Terrorist with high-res Arctic Avenger.");
        }).catch(err => {
            console.error("Failed to load external character model, keeping procedural.", err);
        });
    }
    
    // Create specific camo/skin textures
    const clothColor = isCT ? COLORS.CLOTH_CT : COLORS.CLOTH_T;
    const skinColor = COLORS.SKIN;
    const vestColor = COLORS.VEST_COLOR;

    const clothTex = TextureGenerator.createCamoTexture(isCT ? 'camo_ct' : 'camo_t', `#${new THREE.Color(clothColor).getHexString()}`);
    const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(skinColor).getHexString()}`);
    const vestTex = TextureGenerator.createMetalTexture(`#${new THREE.Color(vestColor).getHexString()}`);
    const bootTex = TextureGenerator.createPolymerTexture('#111111');

    const clothMat = new MeshStandardNodeMaterial();
    clothMat.colorNode = texture(clothTex);
    clothMat.roughnessNode = float(0.9);
    clothMat.metalnessNode = float(0.0);
    const skinMat = new MeshStandardNodeMaterial();
    skinMat.colorNode = texture(skinTex);
    skinMat.roughnessNode = float(0.6);
    skinMat.metalnessNode = float(0.0);
    const vestMat = new MeshStandardNodeMaterial();
    vestMat.colorNode = texture(vestTex);
    vestMat.roughnessNode = float(0.8);
    vestMat.metalnessNode = float(0.0);
    const bootMat = new MeshStandardNodeMaterial();
    bootMat.colorNode = texture(bootTex);
    bootMat.roughnessNode = float(0.8);
    bootMat.metalnessNode = float(0.0);
    const metalMat = new MeshStandardNodeMaterial();
    metalMat.colorNode = color(0x333333);
    metalMat.roughnessNode = float(0.2);
    metalMat.metalnessNode = float(1.0);
    const jointMat = new MeshStandardNodeMaterial();
    jointMat.colorNode = color(0x111111);
    jointMat.roughnessNode = float(0.8);
    jointMat.metalnessNode = float(0.0);

    // --- TORSO & VEST ---
    const torso = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 4), clothMat);
    torso.position.y = 12;
    torso.castShadow = true;
    torso.name = "torso";
    group.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(8.5, 9, 5), vestMat);
    vest.position.y = 12.5;
    vest.name = "vest";
    group.add(vest);
    
    for (let i = -1; i <= 1; i++) {
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1), vestMat);
        pouch.position.set(i * 2.5, 11, 2.5);
        group.add(pouch);
    }

    const backpack = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 2.5), clothMat);
    backpack.position.set(0, 13, -3);
    group.add(backpack);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.5, 4.5), jointMat);
    belt.position.y = 7;
    group.add(belt);

    const sidePouchL = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 2), jointMat);
    sidePouchL.position.set(4, 7, 0);
    group.add(sidePouchL);
    const sidePouchR = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 2), jointMat);
    sidePouchR.position.set(-4, 7, 0);
    group.add(sidePouchR);

    const radio = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.5), jointMat);
    radio.position.set(2.5, 16, 2);
    group.add(radio);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), jointMat);
    antenna.position.set(2.5, 17.5, 2);
    group.add(antenna);

    const holster = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 2.5), jointMat);
    holster.position.set(4.5, 7, 0);
    group.add(holster);

    // --- HEAD ---
    const headGroup = new THREE.Group();
    headGroup.position.y = 20;
    headGroup.name = "headGroup";
    group.add(headGroup);

    const head = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), skinMat);
    head.castShadow = true;
    head.userData.isSkin = true;
    head.name = "head";
    headGroup.add(head);

    if (isCT) {
        const helmet = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.8, 4.8), metalMat);
        helmet.position.y = 1.2;
        helmet.name = "helmet";
        headGroup.add(helmet);
        
        const nvgMount = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.5), jointMat);
        nvgMount.position.set(0, 1.5, 2.4);
        headGroup.add(nvgMount);

        const goggles = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.2, 0.5), jointMat);
        goggles.position.set(0, 0.5, 2.1);
        headGroup.add(goggles);
    } else {
        const mask = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3, 1), jointMat);
        mask.position.set(0, -0.5, 1.8);
        headGroup.add(mask);
        
        const headband = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, 4.2), color(0x880000));
        headband.position.y = 1.5;
        headGroup.add(headband);
    }

    // --- LIMBS ---
    const createLimb = (x, y, z, isArm = false) => {
        const limb = new THREE.Group();
        limb.position.set(x, y, z);
        
        const upper = new THREE.Mesh(new THREE.BoxGeometry(isArm ? 2.5 : 3.5, 6, isArm ? 2.5 : 3.5), clothMat);
        upper.position.y = -3;
        limb.add(upper);
        
        const joint = new THREE.Mesh(new THREE.SphereGeometry(isArm ? 1.2 : 1.8, 8, 8), jointMat);
        joint.position.y = -6;
        limb.add(joint);
        
        const lower = new THREE.Mesh(new THREE.BoxGeometry(isArm ? 2.2 : 3.2, 6, isArm ? 2.2 : 3.2), clothMat);
        lower.position.y = -9;
        limb.add(lower);

        if (isArm) {
            const hand = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), skinMat);
            hand.position.y = -12.5;
            limb.add(hand);
        } else {
            const boot = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.5, 6), bootMat);
            boot.position.set(0, -13, 1.5);
            limb.add(boot);
        }
        
        return limb;
    };

    group.add(createLimb(5, 18, 0, true));  // R Arm
    group.add(createLimb(-5, 18, 0, true)); // L Arm
    group.add(createLimb(2.2, 7, 0, false)); // R Leg
    group.add(createLimb(-2.2, 7, 0, false)); // L Leg

    return group;
}

export function createHostageModel() {
    const group = new THREE.Group();
    group.name = "hostage";
    
    // Orange Jumpsuit
    const clothColor = 0xff6600;
    const skinColor = COLORS.SKIN;

    const clothTex = TextureGenerator.createPolymerTexture('#ff6600');
    const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(skinColor).getHexString()}`);

    const clothMat = new MeshStandardNodeMaterial();
    clothMat.colorNode = texture(clothTex);
    clothMat.roughnessNode = float(0.9);
    clothMat.metalnessNode = float(0.0);
    const skinMat = new MeshStandardNodeMaterial();
    skinMat.colorNode = texture(skinTex);
    skinMat.roughnessNode = float(0.6);
    skinMat.metalnessNode = float(0.0);
    const jointMat = new MeshStandardNodeMaterial();
    jointMat.colorNode = color(0x111111);
    jointMat.roughnessNode = float(0.8);
    jointMat.metalnessNode = float(0.0);

    // --- TORSO ---
    const torso = new THREE.Mesh(new THREE.BoxGeometry(7, 11, 3.5), clothMat);
    torso.position.y = 11.5;
    torso.castShadow = true;
    torso.name = "torso";
    group.add(torso);

    // --- HEAD ---
    const headGroup = new THREE.Group();
    headGroup.position.y = 19;
    headGroup.name = "headGroup";
    group.add(headGroup);

    const head = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.8, 3.8), skinMat);
    head.castShadow = true;
    head.userData.isSkin = true;
    headGroup.add(head);

    // Gag / Blindfold
    const gag = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4), jointMat);
    gag.position.y = -0.5;
    headGroup.add(gag);

    // --- LIMBS ---
    const createLimb = (x, y, z, isArm = false) => {
        const limb = new THREE.Group();
        limb.position.set(x, y, z);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(isArm ? 2.2 : 3.2, 6, isArm ? 2.2 : 3.2), clothMat);
        upper.position.y = -3;
        limb.add(upper);
        const lower = new THREE.Mesh(new THREE.BoxGeometry(isArm ? 2 : 3, 6, isArm ? 2 : 3), clothMat);
        lower.position.y = -9;
        limb.add(lower);
        if (isArm) {
            const hand = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), skinMat);
            hand.position.y = -12.5;
            limb.add(hand);
        } else {
            const foot = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 5), jointMat);
            foot.position.set(0, -13, 1.5);
            limb.add(foot);
        }
        return limb;
    };

    const rArm = createLimb(4.5, 17, 0, true);
    const lArm = createLimb(-4.5, 17, 0, true);
    // Bound hands position
    rArm.rotation.z = -0.5;
    rArm.rotation.x = 0.5;
    lArm.rotation.z = 0.5;
    lArm.rotation.x = 0.5;
    
    group.add(rArm);
    group.add(lArm);
    group.add(createLimb(2, 6, 0, false));
    group.add(createLimb(-2, 6, 0, false));

    return group;
}
