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
        
        // Right Arm
        const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.0, 8), skinMat);
        armMesh.rotation.x = Math.PI / 2;
        armMesh.position.z = 0.5;
        
        const armGroup = new THREE.Group();
        armGroup.add(armMesh);
        armGroup.position.set(0.1, -0.1, 0.1);
        armGroup.rotation.set(-0.2, -0.4, -0.2);
        group.add(armGroup);
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
        
        // Right Arm
        const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.0, 8), skinMat);
        armMesh.rotation.x = Math.PI / 2;
        armMesh.position.z = 0.5;
        
        const armGroup = new THREE.Group();
        armGroup.add(armMesh);
        armGroup.position.set(0.1, -0.1, 0.1);
        armGroup.rotation.set(-0.2, -0.4, -0.2);
        group.add(armGroup);
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
    
    // Vest Pouches
    for (let i = -1; i <= 1; i++) {
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1), vestMat);
        pouch.position.set(i * 2.5, 11, 2.5);
        group.add(pouch);
    }

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
        // Helmet
        const helmet = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.5, 4.5), metalMat);
        helmet.position.y = 1.2;
        helmet.name = "helmet";
        headGroup.add(helmet);
        // Goggles
        const goggles = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1, 0.5), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 100 }));
        goggles.position.set(0, 0.5, 2);
        headGroup.add(goggles);
    } else {
        // Balaclava
        const mask = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.2, 4.2), clothMat);
        mask.name = "mask";
        headGroup.add(mask);
        // Eye slot
        const eyes = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.5), skinMat);
        eyes.position.set(0, 0.5, 2);
        headGroup.add(eyes);
    }

    // --- ARMS ---
    const armGeo = new THREE.BoxGeometry(2, 8, 2);
    armGeo.translate(0, -4, 0);
    
    const rightArm = new THREE.Mesh(armGeo, clothMat);
    rightArm.name = "rightArm";
    rightArm.position.set(5, 18, 0);
    group.add(rightArm);

    const leftArm = new THREE.Mesh(armGeo, clothMat);
    leftArm.name = "leftArm";
    leftArm.position.set(-5, 18, 0);
    group.add(leftArm);
    
    // Gloves
    const gloveGeo = new THREE.BoxGeometry(2.2, 2, 2.2);
    const rGlove = new THREE.Mesh(gloveGeo, bootMat);
    rGlove.position.y = -8;
    rightArm.add(rGlove);
    
    const lGlove = new THREE.Mesh(gloveGeo, bootMat);
    lGlove.position.y = -8;
    leftArm.add(lGlove);

    // --- LEGS ---
    const legGeo = new THREE.BoxGeometry(3, 9, 3);
    legGeo.translate(0, -4.5, 0);
    
    const rightLeg = new THREE.Mesh(legGeo, clothMat);
    rightLeg.name = "rightLeg";
    rightLeg.position.set(2, 9, 0); 
    group.add(rightLeg);

    const leftLeg = new THREE.Mesh(legGeo, clothMat);
    leftLeg.name = "leftLeg";
    leftLeg.position.set(-2, 9, 0); 
    group.add(leftLeg);
    
    // Boots
    const bootGeo = new THREE.BoxGeometry(3.2, 2, 4.5);
    const rBoot = new THREE.Mesh(bootGeo, bootMat);
    rBoot.position.set(0, -9, 0.5);
    rightLeg.add(rBoot);
    
    const lBoot = new THREE.Mesh(bootGeo, bootMat);
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
    const woodTex = TextureGenerator.createCrateTexture();

    const bodyMat = new THREE.MeshPhongMaterial({ map: bodyTex });
    const gripMat = new THREE.MeshPhongMaterial({ map: gripTex });
    const accentMat = new THREE.MeshPhongMaterial({ map: accentTex });
    const woodMat = new THREE.MeshPhongMaterial({ map: woodTex });

    // 1. Receiver
    if (recipe.receiverPoints) {
        builder.addExtrudedShape(recipe.receiverPoints, recipe.receiverWidth, bodyMat);
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
        const sSize = recipe.stockSize || {x: 0.06, y: 0.15, z: 0.4};
        builder.addBox(sSize, sMat, recipe.stockPos);
    }

    // 4. Pistol Grip
    builder.addBox({x: 0.05, y: 0.15, z: 0.08}, gripMat, {x: 0, y: -0.1, z: 0.1}, {x: -0.3, y: 0, z: 0});

    // 5. Magazine
    if (recipe.magType === 'rifle_curved') {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(0.04, -0.1, 0.04, -0.28);
        shape.lineTo(-0.06, -0.28);
        shape.quadraticCurveTo(-0.06, -0.1, -0.1, 0);
        shape.lineTo(0, 0);
        
        const mPos = recipe.magPos || {x:0, y:-0.05, z:-0.05};
        builder.addExtrudedShape(shape.getPoints(), 0.06, accentMat, mPos, {x: 0, y: 0, z: 0});
    } else if (recipe.magType) {
        builder.addBox({x: 0.06, y: 0.2, z: 0.1}, accentMat, recipe.magPos);
    }

    // 6. Handguards & Rails
    if (recipe.handguardType) {
        const hgMat = recipe.handguardType === 'wood' || weaponKey === 'AK47' ? woodMat : accentMat;
        builder.addBox({x: 0.09, y: 0.09, z: 0.3}, hgMat, {x: 0, y: 0.02, z: -0.25});
    }
    if (recipe.railSystem) {
        builder.addPicatinnyRail(0.4, 0.06, new THREE.Vector3(0, 0.08, 0), accentMat);
    }

    // 7. Details
    builder.addTriggerGroup({x: 0, y: -0.06, z: 0.05}, accentMat, bodyMat);
    
    // Slide Serrations
    if (recipe.slideSerrations) {
        builder.addSlideSerrations(8, {y: 0.04, z: 0.04}, 0.01, {x: 0, y: 0.02, z: 0.06}, accentMat);
    }

    // Charging Handle / Bolt Action
    if (recipe.boltAction) {
        // Bolt Handle
        builder.addBox({x: 0.08, y: 0.015, z: 0.015}, accentMat, {x: 0.06, y: 0.05, z: 0.15}, {x: 0, y: 0, z: -0.5});
        builder.addCylinder(0.02, 0.02, 0.02, accentMat, {x: 0.1, y: 0.03, z: 0.15}, {x: Math.PI/2, y: 0, z: 0});
    } else {
        builder.addBox({x: 0.08, y: 0.02, z: 0.02}, accentMat, {x: 0.05, y: 0.02, z: -0.05});
    }

    // 8. Sights
    if (recipe.sightType === 'scope_large') {
        // Scope Body
        builder.addCylinder(0.03, 0.03, 0.4, accentMat, {x: 0, y: 0.12, z: 0}, {x: Math.PI/2, y: 0, z: 0});
        // Lens Housing (Front)
        builder.addCylinder(0.045, 0.03, 0.1, accentMat, {x: 0, y: 0.12, z: -0.2}, {x: Math.PI/2, y: 0, z: 0});
        // Eyepiece (Rear)
        builder.addCylinder(0.03, 0.035, 0.08, accentMat, {x: 0, y: 0.12, z: 0.15}, {x: Math.PI/2, y: 0, z: 0});
        // Mounting Rings
        builder.addBox({x: 0.04, y: 0.04, z: 0.04}, accentMat, {x: 0, y: 0.08, z: -0.08});
        builder.addBox({x: 0.04, y: 0.04, z: 0.04}, accentMat, {x: 0, y: 0.08, z: 0.08});
    } else if (recipe.sightType === 'large_pistol') {
        // Beefy sights for Deagle
        builder.addBox({x: 0.015, y: 0.03, z: 0.02}, accentMat, {x: 0, y: 0.07, z: -0.15});
        builder.addBox({x: 0.05, y: 0.02, z: 0.02}, accentMat, {x: 0, y: 0.07, z: 0.08});
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
        builder.addCylinder(0.035, 0.035, 0.35, accentMat, {x: 0, y: bY, z: muzzlePos - 0.17}, {x: Math.PI/2, y: 0, z: 0});
    } else if (recipe.muzzleBrake && recipe.barrelProfile) {
        const barrelLength = recipe.barrelProfile[recipe.barrelProfile.length - 1].y;
        const muzzlePos = (recipe.barrelPos ? recipe.barrelPos.z : 0) - barrelLength;
        const bY = recipe.barrelPos ? recipe.barrelPos.y : 0;
        
        builder.addCylinder(0.03, 0.025, 0.1, accentMat, {x: 0, y: bY, z: muzzlePos - 0.05}, {x: Math.PI/2, y: 0, z: 0});
        // Ports
        builder.addBox({x: 0.03, y: 0.015, z: 0.05}, accentMat, {x: 0, y: bY, z: muzzlePos - 0.05});
    }
    if (recipe.bipod) {
        const bipodColor = new THREE.MeshPhongMaterial({ color: 0x111111 });
        // Leg 1
        builder.addCylinder(0.01, 0.01, 0.3, bipodColor, {x: 0.04, y: -0.1, z: -0.4}, {x: 0.3, y: 0, z: 0.4});
        // Leg 2
        builder.addCylinder(0.01, 0.01, 0.3, bipodColor, {x: -0.04, y: -0.1, z: -0.4}, {x: 0.3, y: 0, z: -0.4});
    }

    if (isViewModel) {
        const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(COLORS.SKIN).getHexString()}`);
        const skinMat = new THREE.MeshPhongMaterial({ map: skinTex });
        
        // Right Arm (Trigger hand)
        const rightArmGroup = new THREE.Group();
        const rArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.0, 8), skinMat);
        rArmMesh.rotation.x = Math.PI / 2;
        rArmMesh.position.z = 0.5;
        rightArmGroup.add(rArmMesh);
        rightArmGroup.position.set(0.2, -0.2, 0.2);
        rightArmGroup.rotation.set(-0.2, -0.4, -0.2);
        group.add(rightArmGroup);

        // Left Arm (Support hand)
        const leftArmGroup = new THREE.Group();
        const lArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.0, 8), skinMat);
        lArmMesh.rotation.x = Math.PI / 2;
        lArmMesh.position.z = 0.5;
        leftArmGroup.add(lArmMesh);
        leftArmGroup.position.set(-0.2, -0.2, -0.1);
        leftArmGroup.rotation.set(-0.3, 0.4, 0.2);
        group.add(leftArmGroup);
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
