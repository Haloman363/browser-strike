import * as THREE from 'three';
import { COLORS } from './Constants.js';
import { TextureGenerator } from './TextureGenerator.js';
import { WeaponBuilder } from './WeaponBuilder.js';
import { WEAPON_RECIPES } from './WeaponRecipes.js';

const wallTexture = TextureGenerator.createWallTexture();
const crateTexture = TextureGenerator.createCrateTexture();
const concreteTexture = TextureGenerator.createConcreteTexture();

// Weapon Textures
const gunBodyTex = TextureGenerator.createMetalTexture('#222222');
const gunSlideTex = TextureGenerator.createMetalTexture('#333333');
const gunGripTex = TextureGenerator.createPolymerTexture('#151515');
const gloveTex = TextureGenerator.createGloveTexture();
const bladeTex = TextureGenerator.createSteelTexture();
const nadeTex = TextureGenerator.createMetalTexture('#4b5320');

// Helper for detail functions that were moved to builder but still referenced
function addEjectionPort(group, position, size, material) {
    const portGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const port = new THREE.Mesh(portGeo, material);
    port.position.copy(position);
    group.add(port);
    
    // Bolt inside
    const boltGeo = new THREE.BoxGeometry(size.x * 0.9, size.y * 0.9, size.z * 0.9);
    const bolt = new THREE.Mesh(boltGeo, new THREE.MeshPhongMaterial({ color: 0x555555, shininess: 80 }));
    bolt.position.copy(position);
    bolt.position.x -= 0.005; 
    group.add(bolt);
}

function addBoltDetails(group, positions, size, material) {
    const boltGeo = new THREE.CylinderGeometry(size, size, 0.01, 8);
    boltGeo.rotateZ(Math.PI / 2);
    positions.forEach(pos => {
        const bolt = new THREE.Mesh(boltGeo, material);
        bolt.position.copy(pos);
        group.add(bolt);
    });
}

function createViewModelArms(group, skinMat, gloveMat, side = 'both', overrides = {}) {
    const createArm = (isRight) => {
        const armGroup = new THREE.Group();
        const sidePrefix = isRight ? 'r' : 'l';
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
        const sleeveMat = new THREE.MeshPhongMaterial({ color: isRight ? 0x222222 : 0x252525 }); // Dark fabric
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
            const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 8), new THREE.MeshPhongMaterial({ color: 0x111111 }));
            watchGroup.add(strap);
            
            // Face
            const face = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.04), new THREE.MeshPhongMaterial({ color: 0x222222 }));
            face.position.y = 0.04;
            watchGroup.add(face);
            
            // Screen
            const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 }));
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

export function createKnifeModel(isViewModel = false) {
    const recipe = WEAPON_RECIPES['COMBAT_KNIFE'];
    const builder = new WeaponBuilder();
    const group = builder.getGroup();
    
    const bladeMat = new THREE.MeshPhongMaterial({ map: bladeTex, shininess: 100 });
    const gripMat = new THREE.MeshPhongMaterial({ map: gunGripTex });
    const metalMat = new THREE.MeshPhongMaterial({ map: gunBodyTex });

    // Blade
    if (recipe.bladePoints) {
        // Move blade forward so it starts at the guard
        builder.addExtrudedShape(recipe.bladePoints, recipe.bladeWidth, bladeMat, {x: 0, y: -0.04, z: -0.01});
    }

    // Fuller (Groove) - refined
    builder.addBox({x: 0.005, y: 0.01, z: 0.15}, new THREE.MeshPhongMaterial({ color: 0x111111 }), {x: 0, y: 0, z: -0.12});

    // Serrations - refined
    for (let i = 0; i < 6; i++) {
        builder.addBox({x: 0.02, y: 0.015, z: 0.015}, bladeMat, 
            {x: 0, y: 0.035, z: -0.05 - (i * 0.025)}, 
            {x: Math.PI / 4, y: 0, z: 0});
    }

    // Handle
    builder.addCylinder(recipe.handleRadius, recipe.handleRadius, recipe.handleLength, gripMat, 
        {x: 0, y: 0, z: recipe.handleLength / 2}, 
        {x: Math.PI / 2, y: 0, z: 0});

    // Pommel
    builder.addBox({x: 0.045, y: 0.045, z: 0.03}, metalMat, {x: 0, y: 0, z: recipe.handleLength + 0.015});

    // Guard
    const gSize = recipe.guardSize;
    builder.addBox(gSize, metalMat, {x: 0, y: 0, z: 0});
    
    // Add some holes to the guard for detail
    const holeMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    builder.addCylinder(0.005, 0.005, 0.03, holeMat, {x: 0, y: 0.035, z: 0}, {x: Math.PI/2, y: 0, z: 0});
    builder.addCylinder(0.005, 0.005, 0.03, holeMat, {x: 0, y: -0.035, z: 0}, {x: Math.PI/2, y: 0, z: 0});

    if (isViewModel) {
        // --- VIEWMODEL ARMS ---
        const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(COLORS.SKIN).getHexString()}`);
        const skinMat = new THREE.MeshPhongMaterial({ map: skinTex });
        const gloveMat = new THREE.MeshPhongMaterial({ map: gloveTex });
        
        const overrides = {
            right: recipe.vmRightHand
        };
        
        createViewModelArms(group, skinMat, gloveMat, 'right', overrides);
    }

    return group;
}

export function createGrenadeModel(isViewModel = false, type = 'HE') {
    const group = new THREE.Group();
    group.userData.grenadeType = type;

    // Determine color based on type
    let bodyColor = '#4b5320'; // Default HE Green
    if (type === 'FLASH') bodyColor = '#888888';
    else if (type === 'SMOKE') bodyColor = '#333333';
    else if (type === 'MOLOTOV') bodyColor = '#8b4513';

    const nadeTex = TextureGenerator.createMetalTexture(bodyColor);

    // Body
    let body;
    if (type === 'MOLOTOV') {
        const bodyGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.15, 8);
        const bodyMat = new THREE.MeshPhongMaterial({ map: nadeTex });
        body = new THREE.Mesh(bodyGeo, bodyMat);
    } else {
        const bodyGeo = new THREE.SphereGeometry(0.05, 12, 12);
        bodyGeo.scale(1, 1.2, 1);
        const bodyMat = new THREE.MeshPhongMaterial({ map: nadeTex });
        body = new THREE.Mesh(bodyGeo, bodyMat);
        
        // Fragmentation ribs
        if (type === 'HE') {
            for (let i = 0; i < 4; i++) {
                const ringGeo = new THREE.TorusGeometry(0.05, 0.005, 8, 16);
                const ring = new THREE.Mesh(ringGeo, bodyMat);
                ring.rotation.x = Math.PI / 2;
                ring.position.y = (i - 1.5) * 0.03;
                group.add(ring);
            }
        }
    }
    group.add(body);

    if (type === 'MOLOTOV') {
        // Rag in bottle
        const ragGeo = new THREE.BoxGeometry(0.02, 0.1, 0.02);
        const ragMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const rag = new THREE.Mesh(ragGeo, ragMat);
        rag.position.y = 0.1;
        group.add(rag);
    } else {
        // Top Fuse Assembly
        const topGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8);
        const topMat = new THREE.MeshPhongMaterial({ map: gunBodyTex });
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.y = 0.06;
        group.add(top);

        // Lever (Spoon)
        const leverGeo = new THREE.BoxGeometry(0.015, 0.08, 0.005);
        const lever = new THREE.Mesh(leverGeo, topMat);
        lever.position.set(0, 0.04, 0.03);
        lever.rotation.x = -0.2;
        group.add(lever);

        // Pin
        const pinGeo = new THREE.TorusGeometry(0.015, 0.005, 8, 16);
        const pin = new THREE.Mesh(pinGeo, topMat);
        pin.position.set(0.03, 0.07, 0);
        group.add(pin);
    }

    if (isViewModel) {
        // --- VIEWMODEL ARMS ---
        const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(COLORS.SKIN).getHexString()}`);
        const skinMat = new THREE.MeshPhongMaterial({ map: skinTex });
        const gloveMat = new THREE.MeshPhongMaterial({ map: gloveTex });
        
        // Default grenade position (slightly centered)
        const overrides = {
            right: { x: 0.1, y: -0.15, z: 0.1, rx: -0.1, ry: -0.6 }
        };
        
        createViewModelArms(group, skinMat, gloveMat, 'right', overrides);
    }

    return group;
}

export function createHumanoidModel(team = 'TERRORIST') {
    const isCT = (team === 'COUNTER_TERRORIST' || team === 'CT');
    const group = new THREE.Group();
    group.name = "humanoid";
    
    // Create specific camo/skin textures
    const clothColor = isCT ? COLORS.CLOTH_CT : COLORS.CLOTH_T;
    const skinColor = COLORS.SKIN;
    const vestColor = COLORS.VEST_COLOR;

    const clothTex = TextureGenerator.createCamoTexture(`#${new THREE.Color(clothColor).getHexString()}`);
    const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(skinColor).getHexString()}`);
    const vestTex = TextureGenerator.createMetalTexture(`#${new THREE.Color(vestColor).getHexString()}`);
    const bootTex = TextureGenerator.createPolymerTexture('#111111');

    const clothMat = new THREE.MeshPhongMaterial({ map: clothTex });
    const skinMat = new THREE.MeshPhongMaterial({ map: skinTex });
    const vestMat = new THREE.MeshPhongMaterial({ map: vestTex });
    const bootMat = new THREE.MeshPhongMaterial({ map: bootTex });
    const metalMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const jointMat = new THREE.MeshPhongMaterial({ color: 0x111111 });

    // --- TORSO & VEST ---
    // Inner Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 4), clothMat);
    torso.position.y = 12;
    torso.castShadow = true;
    torso.name = "torso";
    group.add(torso);

    // Tactical Vest
    const vest = new THREE.Mesh(new THREE.BoxGeometry(8.5, 9, 5), vestMat);
    vest.position.y = 12.5;
    vest.name = "vest";
    group.add(vest);
    
    // Vest Pouches
    for (let i = -1; i <= 1; i++) {
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1), vestMat);
        pouch.position.set(i * 2.5, 11, 2.5);
        group.add(pouch);
    }

    // Backpack
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 2.5), clothMat);
    backpack.position.set(0, 13, -3);
    group.add(backpack);

    // Utility Belt
    const belt = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.5, 4.5), jointMat);
    belt.position.y = 7;
    group.add(belt);

    // Belt Pouches
    const sidePouchL = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 2), jointMat);
    sidePouchL.position.set(4, 7, 0);
    group.add(sidePouchL);
    const sidePouchR = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 2), jointMat);
    sidePouchR.position.set(-4, 7, 0);
    group.add(sidePouchR);

    // Radio on shoulder
    const radio = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.5), jointMat);
    radio.position.set(2.5, 16, 2);
    group.add(radio);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), jointMat);
    antenna.position.set(2.5, 17.5, 2);
    group.add(antenna);

    // Holster on right leg
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
        // Helmet (More detailed)
        const helmet = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.8, 4.8), metalMat);
        helmet.position.y = 1.2;
        helmet.name = "helmet";
        headGroup.add(helmet);
        
        // NVG Mount
        const nvgMount = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.5), jointMat);
        nvgMount.position.set(0, 1.5, 2.4);
        headGroup.add(nvgMount);

        // Goggles
        const goggles = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 0.6), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 100, transparent: true, opacity: 0.9 }));
        goggles.position.set(0, 0.5, 2.1);
        headGroup.add(goggles);

        // Comms Headset
        const earL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 2), jointMat);
        earL.position.set(2.2, 0, 0);
        headGroup.add(earL);
        const earR = new THREE.Mesh(earL.geometry, jointMat);
        earR.position.set(-2.2, 0, 0);
        headGroup.add(earR);
        
        // Microphone
        const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 8), jointMat);
        mic.rotation.z = Math.PI / 2;
        mic.position.set(1.5, -0.5, 1.5);
        headGroup.add(mic);
    } else {
        // Balaclava
        const mask = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.2, 4.2), clothMat);
        mask.name = "mask";
        headGroup.add(mask);
        // Eye slot
        const eyes = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.5), skinMat);
        eyes.position.set(0, 0.5, 2);
        headGroup.add(eyes);
        
        // Sunglasses/Tactical glasses for Terrorist
        const glasses = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.6, 0.2), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 100 }));
        glasses.position.set(0, 0.7, 2.1);
        headGroup.add(glasses);
    }

    // --- ARMS ---
    const upperArmGeo = new THREE.CylinderGeometry(1.2, 1, 4, 8);
    upperArmGeo.translate(0, -2, 0);
    const lowerArmGeo = new THREE.CylinderGeometry(1, 0.8, 4, 8);
    lowerArmGeo.translate(0, -2, 0);
    
    // Shoulder Joints
    const shoulderGeo = new THREE.SphereGeometry(1.3, 8, 8);
    
    // Right Arm
    const rightArm = new THREE.Group();
    rightArm.name = "rightArm";
    rightArm.position.set(5, 18, 0);
    group.add(rightArm);

    const rShoulder = new THREE.Mesh(shoulderGeo, clothMat);
    rightArm.add(rShoulder);

    const rUpperArm = new THREE.Mesh(upperArmGeo, clothMat);
    rightArm.add(rUpperArm);

    const rElbow = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), clothMat);
    rElbow.position.y = -4;
    rightArm.add(rElbow);

    const rLowerArm = new THREE.Mesh(lowerArmGeo, clothMat);
    rLowerArm.position.y = -4;
    rightArm.add(rLowerArm);

    // Shoulder Pad
    const rShoulderPad = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3, 3), vestMat);
    rShoulderPad.position.set(0.5, -0.5, 0);
    rightArm.add(rShoulderPad);

    // Elbow Pad
    const rElbowPad = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.2), jointMat);
    rElbowPad.position.y = -4;
    rightArm.add(rElbowPad);

    // Glove
    const rGlove = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.2), bootMat);
    rGlove.position.y = -8;
    rightArm.add(rGlove);

    // Left Arm
    const leftArm = new THREE.Group();
    leftArm.name = "leftArm";
    leftArm.position.set(-5, 18, 0);
    group.add(leftArm);

    const lShoulder = new THREE.Mesh(shoulderGeo, clothMat);
    leftArm.add(lShoulder);

    const lUpperArm = new THREE.Mesh(upperArmGeo, clothMat);
    leftArm.add(lUpperArm);

    const lElbow = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), clothMat);
    lElbow.position.y = -4;
    leftArm.add(lElbow);

    const lLowerArm = new THREE.Mesh(lowerArmGeo, clothMat);
    lLowerArm.position.y = -4;
    leftArm.add(lLowerArm);

    // Shoulder Pad
    const lShoulderPad = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3, 3), vestMat);
    lShoulderPad.position.set(-0.5, -0.5, 0);
    leftArm.add(lShoulderPad);

    // Elbow Pad
    const lElbowPad = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.2), jointMat);
    lElbowPad.position.y = -4;
    leftArm.add(lElbowPad);

    // Glove
    const lGlove = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.2), bootMat);
    lGlove.position.y = -8;
    leftArm.add(lGlove);

    // --- LEGS ---
    const upperLegGeo = new THREE.CylinderGeometry(1.8, 1.5, 4.5, 8);
    upperLegGeo.translate(0, -2.25, 0);
    const lowerLegGeo = new THREE.CylinderGeometry(1.5, 1.2, 4.5, 8);
    lowerLegGeo.translate(0, -2.25, 0);

    // Right Leg
    const rightLeg = new THREE.Group();
    rightLeg.name = "rightLeg";
    rightLeg.position.set(2.5, 9, 0); 
    group.add(rightLeg);

    const rHip = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), clothMat);
    rightLeg.add(rHip);

    const rUpperLeg = new THREE.Mesh(upperLegGeo, clothMat);
    rightLeg.add(rUpperLeg);

    const rKnee = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), clothMat);
    rKnee.position.y = -4.5;
    rightLeg.add(rKnee);

    // Knee Pad
    const rKneePad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3, 2), jointMat);
    rKneePad.position.set(0, -4.5, 1);
    rightLeg.add(rKneePad);

    const rLowerLeg = new THREE.Mesh(lowerLegGeo, clothMat);
    rLowerLeg.position.y = -4.5;
    rightLeg.add(rLowerLeg);

    // Boot
    const rBoot = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 4.5), bootMat);
    rBoot.position.set(0, -9, 0.5);
    rightLeg.add(rBoot);

    // Left Leg
    const leftLeg = new THREE.Group();
    leftLeg.name = "leftLeg";
    leftLeg.position.set(-2.5, 9, 0); 
    group.add(leftLeg);

    const lHip = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), clothMat);
    leftLeg.add(lHip);

    const lUpperLeg = new THREE.Mesh(upperLegGeo, clothMat);
    leftLeg.add(lUpperLeg);

    const lKnee = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), clothMat);
    lKnee.position.y = -4.5;
    leftLeg.add(lKnee);

    // Knee Pad
    const lKneePad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3, 2), jointMat);
    lKneePad.position.set(0, -4.5, 1);
    leftLeg.add(lKneePad);

    const lLowerLeg = new THREE.Mesh(lowerLegGeo, clothMat);
    lLowerLeg.position.y = -4.5;
    leftLeg.add(lLowerLeg);

    // Boot
    const lBoot = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 4.5), bootMat);
    lBoot.position.set(0, -9, 0.5);
    leftLeg.add(lBoot);

    return group;
}

export function createGunModel(weaponKey = 'GLOCK', isViewModel = false) {
    const recipe = WEAPON_RECIPES[weaponKey] || WEAPON_RECIPES['GLOCK'];
    
    if (recipe.isKnife) {
        return createKnifeModel(isViewModel);
    }

    const builder = new WeaponBuilder();
    const group = builder.getGroup();
    group.userData.weaponKey = weaponKey;

    // Materials
    const bodyTex = TextureGenerator.createMetalTexture(recipe.bodyColor || '#222222');
    const gripTex = TextureGenerator.createPolymerTexture(recipe.gripColor || '#111111');
    const accentTex = TextureGenerator.createMetalTexture(recipe.accentColor || '#1a1a1a');
    const woodTex = (weaponKey === 'AK47' || recipe.stockType === 'wood') 
        ? TextureGenerator.createWoodTexture(recipe.gripColor || '#4a2c11') 
        : TextureGenerator.createCrateTexture();

    const bodyMat = new THREE.MeshPhongMaterial({ map: bodyTex });
    const gripMat = new THREE.MeshPhongMaterial({ map: gripTex });
    const accentMat = new THREE.MeshPhongMaterial({ map: accentTex });
    const woodMat = new THREE.MeshPhongMaterial({ map: woodTex });

    // 1. Receiver / Slide
    let slideGroup = group;
    if (recipe.pistolDetails) {
        slideGroup = new THREE.Group();
        slideGroup.name = 'slide';
        group.add(slideGroup);
    }

    if (recipe.receiverPoints) {
        const receiver = builder.addExtrudedShape(recipe.receiverPoints, recipe.receiverWidth, bodyMat);
        if (recipe.pistolDetails) {
            slideGroup.add(receiver);
            receiver.position.set(0, 0, 0); // Builder already set it, but we parented it
        }

        if (recipe.m4ReceiverDetails) {
            // Upper receiver protrusion (where bolt sits)
            builder.addCylinder(0.045, 0.045, 0.35, bodyMat, {x: 0, y: 0.045, z: -0.05}, {x: Math.PI/2, y: 0, z: 0});
            // Dust cover door (closed)
            builder.addBox({x: 0.01, y: 0.025, z: 0.12}, accentMat, {x: 0.04, y: 0.04, z: -0.05});
        }
    }
    if (recipe.framePoints) {
        builder.addExtrudedShape(recipe.framePoints, recipe.receiverWidth, gripMat);
    }

    // 2. Barrel
    if (recipe.barrelType === 'rectangular') {
        const bPos = recipe.barrelPos || {x:0, y:0, z:0};
        const bSize = recipe.barrelSize || {x: 0.06, y: 0.07, z: 0.3};
        builder.addBox(bSize, bodyMat, {x: bPos.x, y: bPos.y, z: bPos.z - bSize.z/2});
    } else if (recipe.barrelProfile) {
        builder.addLathedPart(recipe.barrelProfile, bodyMat, recipe.barrelPos || {x:0, y:0, z:0});
    }

    // 3. Stock
    if (recipe.stockPos) {
        const sMat = recipe.stockType === 'wood' || weaponKey === 'AK47' ? woodMat : bodyMat;
        if (recipe.akDetails) {
            const stockShape = new THREE.Shape();
            stockShape.moveTo(0, 0.04);
            stockShape.lineTo(0.4, 0.08);
            stockShape.lineTo(0.5, 0.05);
            stockShape.lineTo(0.5, -0.15);
            stockShape.lineTo(0.4, -0.05);
            stockShape.lineTo(0, 0);
            stockShape.lineTo(0, 0.04);
            // Rotate 180 degrees to point backward (+Z)
            builder.addExtrudedShape(stockShape.getPoints(), 0.06, sMat, recipe.stockPos, {x: 0, y: Math.PI, z: 0});
        } else if (recipe.m4Details) {
            // M4 Buffer Tube
            builder.addCylinder(0.018, 0.018, 0.3, bodyMat, {x: recipe.stockPos.x, y: recipe.stockPos.y + 0.02, z: recipe.stockPos.z - 0.1}, {x: Math.PI/2, y: 0, z: 0});
            // Adjustable Stock
            const stockShape = new THREE.Shape();
            stockShape.moveTo(0, 0.03);
            stockShape.lineTo(0.25, 0.03);
            stockShape.lineTo(0.25, -0.12);
            stockShape.lineTo(0.2, -0.12);
            stockShape.lineTo(0.1, -0.04);
            stockShape.lineTo(0, -0.04);
            stockShape.lineTo(0, 0.03);
            // Rotate 180 degrees to point backward (+Z)
            const stock = builder.addExtrudedShape(stockShape.getPoints(), 0.06, bodyMat, recipe.stockPos, {x: 0, y: Math.PI, z: 0});

            if (recipe.m4AdjustableStock) {
                // Adjustment lever
                builder.addBox({x: 0.02, y: 0.015, z: 0.1}, accentMat, {x: 0, y: recipe.stockPos.y - 0.03, z: recipe.stockPos.z + 0.15});
                // Buttpad ribs
                for (let i = 0; i < 4; i++) {
                    builder.addBox({x: 0.05, y: 0.005, z: 0.01}, accentMat, {x: 0, y: recipe.stockPos.y + 0.01 - (i * 0.04), z: recipe.stockPos.z + 0.255});
                }
            }
        } else if (recipe.awpDetails) {
            // AWP Thumbhole Stock
            const stockShape = new THREE.Shape();
            stockShape.moveTo(0, 0.04);
            stockShape.lineTo(0.6, 0.06);
            stockShape.lineTo(0.7, 0.02);
            stockShape.lineTo(0.7, -0.15);
            stockShape.lineTo(0.65, -0.18);
            stockShape.lineTo(0.5, -0.18);
            stockShape.lineTo(0.4, -0.1);
            stockShape.lineTo(0.3, -0.1);
            stockShape.lineTo(0.2, -0.18);
            stockShape.lineTo(0.1, -0.18);
            stockShape.lineTo(0, -0.05);
            stockShape.lineTo(0, 0.04);
            
            // Thumbhole cutout
            const hole = new THREE.Path();
            hole.moveTo(0.3, -0.02);
            hole.lineTo(0.45, -0.02);
            hole.lineTo(0.45, -0.08);
            hole.lineTo(0.3, -0.08);
            hole.lineTo(0.3, -0.02);
            stockShape.holes.push(hole);
            
            // Rotate 180 degrees to point backward (+Z)
            builder.addExtrudedShape(stockShape.getPoints(), 0.08, bodyMat, recipe.stockPos, {x: 0, y: Math.PI, z: 0});
            // Cheek rest
            builder.addBox({x: 0.07, y: 0.02, z: 0.2}, accentMat, {x: 0, y: recipe.stockPos.y + 0.05, z: recipe.stockPos.z + 0.2});
        } else {
            const sSize = recipe.stockSize || {x: 0.06, y: 0.15, z: 0.4};
            builder.addBox(sSize, sMat, recipe.stockPos);
        }
    }

    // 4. Pistol Grip
    if (recipe.pistolGrip) {
        const pgMat = recipe.stockType === 'wood' || weaponKey === 'AK47' ? woodMat : gripMat;
        const gripShape = new THREE.Shape();
        gripShape.moveTo(0, 0);
        gripShape.lineTo(0.04, 0);
        gripShape.lineTo(0.06, -0.15);
        gripShape.lineTo(0, -0.15);
        gripShape.lineTo(-0.02, 0);
        builder.addExtrudedShape(gripShape.getPoints(), 0.05, pgMat, {x: 0, y: -0.05, z: 0.1}, {x: 0.2, y: 0, z: 0});
    } else if (recipe.pistolDetails) {
        // More ergonomic pistol grip for Glocks/modern pistols
        const gripPos = recipe.pistolGripPos || {x: 0, y: -0.1, z: 0.08};
        builder.addBox({x: 0.05, y: 0.14, z: 0.065}, gripMat, gripPos, {x: -0.15, y: 0, z: 0});
        // Backstrap detail
        builder.addBox({x: 0.045, y: 0.12, z: 0.02}, accentMat, {x: gripPos.x, y: gripPos.y - 0.01, z: gripPos.z + 0.03}, {x: -0.15, y: 0, z: 0});
    } else {
        builder.addBox({x: 0.05, y: 0.15, z: 0.08}, gripMat, {x: 0, y: -0.1, z: 0.1}, {x: -0.3, y: 0, z: 0});
    }

    // 5. Magazine
    if (recipe.magType === 'rifle_curved') {
        const shape = new THREE.Shape();
        if (recipe.curvedMag) {
            // Highly curved 7.62x39 style mag
            shape.moveTo(0, 0);
            shape.lineTo(0.12, 0);
            shape.quadraticCurveTo(0.12, -0.15, 0.05, -0.32);
            shape.lineTo(-0.08, -0.32);
            shape.quadraticCurveTo(-0.02, -0.15, 0, 0);
        } else {
            shape.moveTo(0, 0);
            shape.quadraticCurveTo(-0.04, -0.1, -0.04, -0.28);
            shape.lineTo(0.06, -0.28);
            shape.quadraticCurveTo(0.06, -0.1, 0.1, 0);
            shape.lineTo(0, 0);
        }

        const mPos = recipe.magPos || {x:0, y:-0.05, z:-0.05};
        const mag = builder.addExtrudedShape(shape.getPoints(), 0.065, accentMat, mPos, {x: 0, y: 0, z: 0});
        mag.name = 'magazine';

        // Enhanced Ribbing for AK mag
        if (recipe.curvedMag) {
            // Horizontal ribs
            for (let i = 0; i < 6; i++) {
                const ribY = -0.05 - (i * 0.045);
                const rib = builder.addBox({x: 0.075, y: 0.015, z: 0.015}, accentMat, {x: 0, y: mPos.y + ribY, z: mPos.z + 0.02});
                mag.add(rib);
                rib.position.sub(new THREE.Vector3(mPos.x, mPos.y, mPos.z));
            }
            // Vertical rear spine
            const spine = builder.addBox({x: 0.02, y: 0.3, z: 0.02}, accentMat, {x: 0, y: mPos.y - 0.15, z: mPos.z + 0.05});
            mag.add(spine);
            spine.position.sub(new THREE.Vector3(mPos.x, mPos.y, mPos.z));
        } else if (recipe.akDetails) {
            for (let i = 0; i < 5; i++) {
                const rib = builder.addBox({x: 0.07, y: 0.01, z: 0.1}, accentMat, {x: 0, y: mPos.y - 0.05 - (i * 0.045), z: mPos.z - 0.02});
                mag.add(rib);
                rib.position.sub(new THREE.Vector3(mPos.x, mPos.y, mPos.z));
            }
        }
    } else if (recipe.magType === 'rifle_straight') {
        const mag = builder.addBox({x: 0.06, y: 0.22, z: 0.09}, accentMat, recipe.magPos, {x: 0.2, y: 0, z: 0});
        mag.name = 'magazine';
        if (recipe.magRibs) {
            // Horizontal ribs for STANAG style mags
            for (let i = 0; i < 4; i++) {
                const ribY = 0.05 - (i * 0.04);
                const rib = builder.addBox({x: 0.065, y: 0.01, z: 0.1}, accentMat, {x: 0, y: ribY, z: 0});
                mag.add(rib);
            }
        }
    } else if (recipe.magType === 'smg_long') {        const mag = builder.addBox({x: 0.045, y: 0.35, z: 0.06}, accentMat, recipe.magPos, {x: 0.2, y: 0, z: 0});
        mag.name = 'magazine';
        mag.userData.isInternalMag = true;
        mag.visible = false;
    } else if (recipe.magType === 'box_large') {
        const mag = builder.addBox({x: 0.15, y: 0.25, z: 0.2}, accentMat, recipe.magPos);
        mag.name = 'magazine';
    } else if (recipe.magType === 'top_flat') {
        const mag = builder.addBox(recipe.magSize || {x: 0.06, y: 0.03, z: 0.3}, accentMat, recipe.magPos);
        mag.name = 'magazine';
    } else if (recipe.magType === 'shotgun_tube') {
        // Shotguns don't usually have detachable mags in this model yet
        builder.addCylinder(0.015, 0.015, 0.5, accentMat, {x: 0, y: 0.01, z: -0.2}, {x: Math.PI/2, y: 0, z: 0});
    } else if (recipe.magType === 'pistol' || recipe.magType === 'box_small') {
        const mPos = recipe.magPos || {x: 0, y: -0.04, z: 0.06};
        const mRot = {x: 0.2, y: 0, z: 0};
        const mag = builder.addBox({x: 0.06, y: 0.2, z: 0.1}, accentMat, mPos, mRot);
        mag.name = 'magazine';
        
        // Pistols should hide the mag inside the handle (in both VM and WM)
        if (recipe.magType === 'pistol') {
            mag.userData.isInternalMag = true;
            mag.visible = false;
        }
        
        if (recipe.pistolDetails) {
            // Magazine Baseplate
            const baseplate = builder.addBox({x: 0.065, y: 0.015, z: 0.12}, accentMat, {x: mPos.x, y: mPos.y - 0.1, z: mPos.z + 0.02}, mRot);
            mag.add(baseplate);
            baseplate.position.sub(new THREE.Vector3(mPos.x, mPos.y, mPos.z));
        }
    } else if (recipe.magType === 'rifle_straight') {
        const mPos = recipe.magPos || {x:0, y:-0.05, z:-0.08};
        const mag = builder.addBox({x: 0.06, y: 0.25, z: 0.12}, accentMat, mPos, {x: 0.2, y: 0, z: 0});
        mag.name = 'magazine';
        
        // STANAG mag ribbing
        if (recipe.m4Details) {
            for (let i = 0; i < 3; i++) {
                const rib = builder.addBox({x: 0.065, y: 0.15, z: 0.005}, accentMat, {x: 0, y: mPos.y - 0.03, z: mPos.z + (i * 0.03) - 0.01}, {x: 0.2, y: 0, z: 0});
                mag.add(rib);
                rib.position.sub(new THREE.Vector3(mPos.x, mPos.y, mPos.z));
            }
        }
    } else if (recipe.magType) {
        const mag = builder.addBox({x: 0.06, y: 0.2, z: 0.1}, accentMat, recipe.magPos);
        mag.name = 'magazine';
    }

    // 6. Handguards & Rails
    if (recipe.handguardType) {
        if (recipe.handguardType === 'wood_ak') {
            if (recipe.akDetails) {
                // More detailed AK handguard
                const lowerShape = new THREE.Shape();
                lowerShape.moveTo(-0.15, -0.04);
                lowerShape.lineTo(0.15, -0.04);
                lowerShape.lineTo(0.15, 0.02);
                lowerShape.lineTo(0.13, 0.04);
                lowerShape.lineTo(-0.13, 0.04);
                lowerShape.lineTo(-0.15, 0.02);
                lowerShape.lineTo(-0.15, -0.04);
                builder.addExtrudedShape(lowerShape.getPoints(), 0.08, woodMat, {x: 0, y: -0.01, z: -0.25});
                
                const upperShape = new THREE.Shape();
                upperShape.moveTo(-0.1, 0);
                upperShape.lineTo(0.1, 0);
                upperShape.lineTo(0.1, 0.03);
                upperShape.lineTo(0.08, 0.05);
                upperShape.lineTo(-0.08, 0.05);
                upperShape.lineTo(-0.1, 0.03);
                upperShape.lineTo(-0.1, 0);
                builder.addExtrudedShape(upperShape.getPoints(), 0.07, woodMat, {x: 0, y: 0.05, z: -0.2});

                if (recipe.ventedHandguard) {
                    // Add some vertical slits/vents to the upper wood handguard
                    for (let i = 0; i < 4; i++) {
                        const slitZ = -0.2 + (i * 0.04) - 0.06;
                        builder.addBox({x: 0.075, y: 0.005, z: 0.015}, accentMat, {x: 0, y: 0.09, z: slitZ});
                    }
                }
            } else {
                // Lower handguard
                builder.addBox({x: 0.08, y: 0.08, z: 0.3}, woodMat, {x: 0, y: 0.0, z: -0.25});
                // Gas tube upper guard
                builder.addBox({x: 0.07, y: 0.04, z: 0.2}, woodMat, {x: 0, y: 0.07, z: -0.2});
            }
        } else {
            const hgMat = recipe.handguardType === 'wood' || weaponKey === 'AK47' ? woodMat : accentMat;
            if (recipe.m4Details) {
                // Ribbed M4 handguard
                builder.addCylinder(0.045, 0.045, 0.3, hgMat, {x: 0, y: 0.035, z: -0.25});
                
                if (recipe.ventedHandguard) {
                    // Vertical cooling vents on top
                    for (let i = 0; i < 6; i++) {
                        const ventZ = -0.25 + (i * 0.04) - 0.1;
                        builder.addBox({x: 0.01, y: 0.01, z: 0.02}, accentMat, {x: 0, y: 0.08, z: ventZ});
                    }
                }

                // Quad rail side/bottom
                builder.addPicatinnyRail(0.3, 0.04, new THREE.Vector3(0, 0.035, -0.25), accentMat); // bottom
                builder.addPicatinnyRail(0.3, 0.04, new THREE.Vector3(0.04, 0.035, -0.25), accentMat); // right
                builder.addPicatinnyRail(0.3, 0.04, new THREE.Vector3(-0.04, 0.035, -0.25), accentMat); // left
            } else {
                builder.addBox({x: 0.09, y: 0.09, z: 0.3}, hgMat, {x: 0, y: 0.02, z: -0.25});
            }
        }
    }
    if (recipe.railSystem) {
        builder.addPicatinnyRail(0.4, 0.06, new THREE.Vector3(0, 0.08, 0), accentMat);
    }

    // Fire Selector (for AK)
    if (recipe.akDetails) {
        // Lever on right side
        builder.addBox({x: 0.005, y: 0.02, z: 0.15}, accentMat, {x: 0.038, y: 0.03, z: 0.08}, {x: 0.15, y: 0, z: 0});
    }

    // Gas Tube (for AK models)
    if (recipe.gasTube) {
        builder.addCylinder(0.012, 0.012, 0.4, accentMat, {x: 0, y: 0.07, z: -0.25});
    }

    // Dust Cover
    if (recipe.dustCover) {
        const dc = builder.addBox({x: 0.06, y: 0.05, z: 0.4}, accentMat, {x: 0, y: 0.06, z: -0.05});
        if (recipe.ribbedDustCover) {
            for (let i = 0; i < 4; i++) {
                const ribZ = -0.15 + (i * 0.08);
                const rib = builder.addBox({x: 0.065, y: 0.01, z: 0.02}, accentMat, {x: 0, y: 0.025, z: ribZ});
                dc.add(rib);
            }
        }
    }

    // Charging Handle
    if (recipe.chargingHandle) {
        // Handle sticking out on right side
        builder.addCylinder(0.008, 0.008, 0.04, accentMat, {x: 0.045, y: 0.05, z: -0.05}, {x: 0, y: 0, z: -Math.PI/2});
    }

    // Front/Rear Sights
    if (recipe.rearSight) {
        builder.addBox({x: 0.02, y: 0.03, z: 0.04}, accentMat, {x: 0, y: 0.09, z: -0.05});
    }
    if (recipe.frontSight) {
        builder.addBox({x: 0.015, y: 0.06, z: 0.02}, accentMat, {x: 0, y: 0.1, z: -0.65});
    }

    // 7. Details
    builder.addTriggerGroup({x: 0, y: -0.06, z: 0.05}, accentMat, bodyMat, !recipe.pistolDetails);
    
    if (recipe.m4Details) {
        // Brass Deflector
        if (recipe.brassDeflector) {
            builder.addBox({x: 0.02, y: 0.03, z: 0.04}, accentMat, {x: 0.04, y: 0.04, z: 0.05}, {x: 0, y: 0.5, z: 0});
        }
        // Forward Assist
        if (recipe.forwardAssist) {
            builder.addCylinder(0.01, 0.01, 0.04, accentMat, {x: 0.04, y: 0.02, z: 0.12}, {x: 0, y: 0, z: -Math.PI/2});
        }
    } else if (recipe.awpDetails) {
        // AWP Bolt Shroud
        builder.addCylinder(0.025, 0.025, 0.1, accentMat, {x: 0, y: 0.035, z: 0.1}, {x: Math.PI/2, y: 0, z: 0});
    }

    // Slide Serrations
    if (recipe.slideSerrations) {
        if (recipe.pistolDetails) {
            // Rear serrations for Glock
            const serrations = builder.addSlideSerrations(10, {y: 0.04, z: 0.05}, 0.008, {x: 0, y: 0.025, z: 0.05}, accentMat);
            slideGroup.add(serrations);
            serrations.position.set(0, 0.025, 0.05);
            // Ejection port
            addEjectionPort(slideGroup, new THREE.Vector3(0.03, 0.03, -0.02), {x: 0.01, y: 0.02, z: 0.06}, accentMat);
        } else {
            builder.addSlideSerrations(8, {y: 0.04, z: 0.04}, 0.01, {x: 0, y: 0.02, z: 0.06}, accentMat);
        }
    }

    // Charging Handle / Bolt Action
    if (recipe.boltAction) {
        // Bolt Handle
        if (recipe.awpDetails) {
            // AWP Specific large bolt handle
            const handle = builder.addCylinder(0.008, 0.008, 0.1, accentMat, {x: 0.05, y: 0.05, z: 0.1}, {x: 0, y: 0, z: -Math.PI/3});
            const knob = builder.addCylinder(0.022, 0.022, 0.022, accentMat, {x: 0.12, y: 0.02, z: 0.1}, {x: Math.PI/2, y: 0, z: 0});
            handle.name = 'bolt';
            knob.name = 'bolt';
        } else {
            const handle = builder.addBox({x: 0.08, y: 0.015, z: 0.015}, accentMat, {x: 0.06, y: 0.05, z: 0.15}, {x: 0, y: 0, z: -0.5});
            const knob = builder.addCylinder(0.02, 0.02, 0.02, accentMat, {x: 0.1, y: 0.03, z: 0.15}, {x: Math.PI/2, y: 0, z: 0});
            handle.name = 'bolt';
            knob.name = 'bolt';
        }
    } else {
        if (recipe.akDetails) {
            // AK style bolt handle
            const bolt = builder.addCylinder(0.012, 0.01, 0.08, accentMat, {x: 0.07, y: 0.045, z: -0.05}, {x: 0, y: 0, z: -Math.PI/2});
            bolt.name = 'bolt';
        } else if (recipe.m4Details) {
            // T-style charging handle at back
            const bolt = builder.addBox({x: 0.08, y: 0.015, z: 0.02}, accentMat, {x: 0, y: 0.07, z: 0.22});
            bolt.name = 'bolt';
        } else if (weaponKey === 'NOVA' || weaponKey === 'XM1014') {
            // Shotgun pump/bolt
            const bolt = builder.addCylinder(0.035, 0.035, 0.15, accentMat, {x: 0, y: 0.02, z: -0.2});
            bolt.name = 'bolt';
        } else if (!recipe.pistolDetails) {
            const bolt = builder.addBox({x: 0.08, y: 0.02, z: 0.02}, accentMat, {x: 0.05, y: 0.02, z: -0.05});
            bolt.name = 'bolt';
        }
    }

    // 8. Sights
    if (recipe.sightType === 'scope_large') {
        // Scope Body
        builder.addCylinder(0.035, 0.035, 0.45, accentMat, {x: 0, y: 0.14, z: 0}, {x: Math.PI/2, y: 0, z: 0});
        // Lens Housing (Front)
        const frontLensRadius = recipe.awpDetails ? 0.055 : 0.05;
        const frontLensLength = recipe.awpDetails ? 0.2 : 0.12;
        builder.addCylinder(frontLensRadius, 0.035, frontLensLength, accentMat, {x: 0, y: 0.14, z: -0.22 - (frontLensLength - 0.12)/2}, {x: Math.PI/2, y: 0, z: 0});
        // Eyepiece (Rear)
        builder.addCylinder(0.035, 0.045, 0.1, accentMat, {x: 0, y: 0.14, z: 0.18}, {x: Math.PI/2, y: 0, z: 0});
        // Mounting Rings
        builder.addBox({x: 0.04, y: 0.06, z: 0.04}, accentMat, {x: 0, y: 0.09, z: -0.1});
        builder.addBox({x: 0.04, y: 0.06, z: 0.04}, accentMat, {x: 0, y: 0.09, z: 0.1});

        if (recipe.awpDetails) {
            // Adjustment Turrets
            builder.addCylinder(0.015, 0.015, 0.02, accentMat, {x: 0, y: 0.175, z: 0}, {x: 0, y: 0, z: 0}); // Top
            builder.addCylinder(0.015, 0.015, 0.02, accentMat, {x: 0.035, y: 0.14, z: 0}, {x: 0, y: 0, z: Math.PI/2}); // Side
        }
    } else if (recipe.sightType === 'large_pistol') {
        // Beefy sights for Deagle
        const s1 = builder.addBox({x: 0.015, y: 0.035, z: 0.02}, accentMat, {x: 0, y: 0.08, z: -0.25});
        const s2 = builder.addBox({x: 0.05, y: 0.025, z: 0.02}, accentMat, {x: 0, y: 0.08, z: 0.1});
        slideGroup.add(s1, s2);
        s1.position.set(0, 0.08, -0.25);
        s2.position.set(0, 0.08, 0.1);
    } else if (recipe.pistolDetails) {
        // Low-profile white dot sights for Glock/USP
        const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        // Rear
        const rear = builder.addBox({x: 0.05, y: 0.015, z: 0.01}, accentMat, {x: 0, y: 0.05, z: 0.1});
        const d1 = builder.addBox({x: 0.01, y: 0.005, z: 0.002}, whiteMat, {x: 0.015, y: 0.055, z: 0.105});
        const d2 = builder.addBox({x: 0.01, y: 0.005, z: 0.002}, whiteMat, {x: -0.015, y: 0.055, z: 0.105});
        
        // Front
        const front = builder.addBox({x: 0.01, y: 0.015, z: 0.01}, accentMat, {x: 0, y: 0.05, z: -0.1});
        const d3 = builder.addBox({x: 0.006, y: 0.006, z: 0.002}, whiteMat, {x: 0, y: 0.055, z: -0.105});

        slideGroup.add(rear, d1, d2, front, d3);
        rear.position.set(0, 0.05, 0.1);
        d1.position.set(0.015, 0.055, 0.105);
        d2.position.set(-0.015, 0.055, 0.105);
        front.position.set(0, 0.05, -0.1);
        d3.position.set(0, 0.055, -0.105);
    } else if (recipe.sightType === 'iron_rifle') {

        if (recipe.akDetails) {
            // Specific AK Rear Sight (tangent sight)
            builder.addBox({x: 0.03, y: 0.02, z: 0.12}, accentMat, {x: 0, y: 0.08, z: -0.1}, {x: -0.05, y: 0, z: 0});
        } else if (recipe.m4Details) {
            // M4 Carry Handle Rear Sight
            const carryHandleShape = new THREE.Shape();
            carryHandleShape.moveTo(-0.15, 0);
            carryHandleShape.lineTo(0.15, 0);
            carryHandleShape.lineTo(0.1, 0.04);
            carryHandleShape.lineTo(-0.1, 0.04);
            carryHandleShape.lineTo(-0.15, 0);
            const ch = builder.addExtrudedShape(carryHandleShape.getPoints(), 0.04, accentMat, {x: 0, y: 0.08, z: 0.05});
            
            if (recipe.m4CarryHandle) {
                // Precise rear sight notch block
                builder.addBox({x: 0.05, y: 0.03, z: 0.05}, accentMat, {x: 0, y: 0.1, z: 0.15});
                // Thumb screws for mounting
                builder.addCylinder(0.015, 0.015, 0.01, accentMat, {x: 0.025, y: 0.08, z: 0.05}, {x: 0, y: 0, z: Math.PI/2});
                builder.addCylinder(0.015, 0.015, 0.01, accentMat, {x: 0.025, y: 0.08, z: 0.15}, {x: 0, y: 0, z: Math.PI/2});
            }
        } else {
            builder.addIronSights({x: 0, y: 0.08, z: 0}, accentMat);
        }
    } else {
        // Simple Iron Sights
        builder.addBox({x: 0.01, y: 0.03, z: 0.02}, accentMat, {x: 0, y: 0.06, z: -0.3});
        builder.addBox({x: 0.04, y: 0.02, z: 0.02}, accentMat, {x: 0, y: 0.06, z: 0.1});
    }

    // 9. Muzzle Brake / Suppressor
    if (recipe.suppressor && recipe.barrelProfile) {
        const barrelLength = recipe.barrelProfile[recipe.barrelProfile.length - 1].y;
        const muzzlePos = (recipe.barrelPos ? recipe.barrelPos.z : 0) - barrelLength;
        const bY = recipe.barrelPos ? recipe.barrelPos.y : 0;
        builder.addCylinder(0.035, 0.035, 0.35, accentMat, {x: 0, y: bY, z: muzzlePos - 0.17});
    } else if (recipe.muzzleBrake && recipe.barrelProfile) {
        const barrelLength = recipe.barrelProfile[recipe.barrelProfile.length - 1].y;
        const muzzlePos = (recipe.barrelPos ? recipe.barrelPos.z : 0) - barrelLength;
        const bY = recipe.barrelPos ? recipe.barrelPos.y : 0;
        
        builder.addCylinder(0.03, 0.025, 0.1, accentMat, {x: 0, y: bY, z: muzzlePos - 0.05});
        // Ports
        builder.addBox({x: 0.03, y: 0.015, z: 0.05}, accentMat, {x: 0, y: bY, z: muzzlePos - 0.05});

        // AK Specific Front Sight and Gas Block
        if (recipe.akDetails) {
            // Gas Block (connects barrel to gas tube)
            builder.addBox({x: 0.03, y: 0.06, z: 0.05}, accentMat, {x: 0, y: bY + 0.02, z: muzzlePos + 0.25});
            
            // Front Sight Base
            builder.addBox({x: 0.03, y: 0.08, z: 0.04}, accentMat, {x: 0, y: bY + 0.025, z: muzzlePos + 0.05});
            // Front Sight Hood/Ring
            builder.addTorus(0.02, 0.005, accentMat, {x: 0, y: bY + 0.065, z: muzzlePos + 0.05}, {x: 0, y: 0, z: 0});
            // Front Sight Post
            builder.addBox({x: 0.005, y: 0.02, z: 0.005}, accentMat, {x: 0, y: bY + 0.065, z: muzzlePos + 0.05});
        } else if (recipe.m4Details) {
            // M4 Front Sight Post (Triangular)
            const fsShape = new THREE.Shape();
            fsShape.moveTo(-0.04, 0);
            fsShape.lineTo(0.04, 0);
            fsShape.lineTo(0.01, 0.1);
            fsShape.lineTo(-0.01, 0.1);
            fsShape.lineTo(-0.04, 0);
            builder.addExtrudedShape(fsShape.getPoints(), 0.03, accentMat, {x: 0, y: bY, z: muzzlePos + 0.15});
        }
    }
    if (recipe.bipod) {
        const bipodColor = new THREE.MeshPhongMaterial({ color: 0x111111 });
        if (recipe.awpDetails) {
            // Detailed AWP Bipod
            builder.addBox({x: 0.04, y: 0.04, z: 0.06}, bipodColor, {x: 0, y: -0.02, z: -0.4}); // Mount
            // Leg 1
            builder.addCylinder(0.008, 0.008, 0.35, bipodColor, {x: 0.06, y: -0.12, z: -0.42}, {x: 0.4, y: 0, z: 0.4});
            builder.addBox({x: 0.03, y: 0.01, z: 0.04}, bipodColor, {x: 0.12, y: -0.25, z: -0.48}); // Foot 1
            // Leg 2
            builder.addCylinder(0.008, 0.008, 0.35, bipodColor, {x: -0.06, y: -0.12, z: -0.42}, {x: 0.4, y: 0, z: -0.4});
            builder.addBox({x: 0.03, y: 0.01, z: 0.04}, bipodColor, {x: -0.12, y: -0.25, z: -0.48}); // Foot 2
        } else {
            // Leg 1
            builder.addCylinder(0.01, 0.01, 0.3, bipodColor, {x: 0.04, y: -0.1, z: -0.4}, {x: 0.3, y: 0, z: 0.4});
            // Leg 2
            builder.addCylinder(0.01, 0.01, 0.3, bipodColor, {x: -0.04, y: -0.1, z: -0.4}, {x: 0.3, y: 0, z: -0.4});
        }
    }

    if (isViewModel) {
        const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(COLORS.SKIN).getHexString()}`);
        const skinMat = new THREE.MeshPhongMaterial({ map: skinTex });
        const gloveMat = new THREE.MeshPhongMaterial({ map: gloveTex });
        
        const overrides = {
            right: recipe.vmRightHand,
            left: recipe.vmLeftHand
        };
        
        createViewModelArms(group, skinMat, gloveMat, 'both', overrides);
    }

    return group;
}



export function createWall(width, height, depth, x, y, z, color = COLORS.WALL_DEFAULT, scene, objects) {
    const tex = color === 0xaaaaaa ? concreteTexture.clone() : wallTexture.clone();
    
    // Scale texture based on wall size for tiling
    const repeatX = Math.max(width / 40, 1);
    const repeatY = Math.max(height / 40, 1);
    const repeatZ = Math.max(depth / 40, 1);
    
    // Simplistic tiling for the most prominent face
    if (width > depth) {
        tex.repeat.set(repeatX, repeatY);
    } else {
        tex.repeat.set(repeatZ, repeatY);
    }
    
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshPhongMaterial({ 
        map: tex,
        color: color 
    }));
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.userData.isSolid = true;
    wall.userData.isWall = true;
    
    const halfW = width / 2;
    const halfH = height / 2;
    const halfD = depth / 2;
    wall.userData.boundingBox = new THREE.Box3(
        new THREE.Vector3(x - halfW, y - halfH, z - halfD),
        new THREE.Vector3(x + halfW, y + halfH, z + halfD)
    );
    
    if (scene) scene.add(wall);
    if (objects) objects.push(wall);
    return wall;
}

export function createCrate(size, x, y, z, scene, objects) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshPhongMaterial({ 
        map: crateTexture 
    }));
    crate.position.set(x, y, z);
    crate.castShadow = true;
    crate.receiveShadow = true;
    crate.userData.isSolid = true;
    crate.userData.isCrate = true;
    
    const half = size / 2;
    crate.userData.boundingBox = new THREE.Box3(
        new THREE.Vector3(x - half, y - half, z - half),
        new THREE.Vector3(x + half, y + half, z + half)
    );
    
    if (scene) scene.add(crate);
    if (objects) objects.push(crate);
    return crate;
}

export function createPillar(radius, height, x, y, z, scene, objects) {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 8);
    const mat = new THREE.MeshPhongMaterial({ map: concreteTexture });
    const pillar = new THREE.Mesh(geo, mat);
    pillar.position.set(x, y + height / 2, z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    pillar.userData.isSolid = true;
    
    pillar.geometry.computeBoundingBox();
    pillar.userData.boundingBox = pillar.geometry.boundingBox.clone().applyMatrix4(pillar.matrixWorld);
    
    if (scene) scene.add(pillar);
    if (objects) objects.push(pillar);
    return pillar;
}
