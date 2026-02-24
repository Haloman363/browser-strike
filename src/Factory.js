import * as THREE from 'three';
import { COLORS } from './Constants.js';
import { TextureGenerator } from './TextureGenerator.js';

const wallTexture = TextureGenerator.createWallTexture();
const crateTexture = TextureGenerator.createCrateTexture();
const concreteTexture = TextureGenerator.createConcreteTexture();

// Weapon Textures
const gunBodyTex = TextureGenerator.createMetalTexture('#222222');
const gunSlideTex = TextureGenerator.createMetalTexture('#333333');
const gunGripTex = TextureGenerator.createPolymerTexture('#151515');
const bladeTex = TextureGenerator.createSteelTexture();
const nadeTex = TextureGenerator.createMetalTexture('#4b5320');

export function createKnifeModel(isViewModel = false) {
    const group = new THREE.Group();
    
    // Blade
    const bladeGeo = new THREE.BoxGeometry(0.02, 0.08, 0.3);
    const bladeMat = new THREE.MeshPhongMaterial({ map: bladeTex, shininess: 100 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.z = -0.15;
    group.add(blade);

    // Handle
    const handleGeo = new THREE.BoxGeometry(0.04, 0.05, 0.15);
    const handleMat = new THREE.MeshPhongMaterial({ map: gunGripTex });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.z = 0.05;
    group.add(handle);

    // Guard
    const guardGeo = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const guardMat = new THREE.MeshPhongMaterial({ map: gunBodyTex });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.z = -0.02;
    group.add(guard);

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

export function createGrenadeModel(isViewModel = false) {
    const group = new THREE.Group();
    
    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8);
    const bodyMat = new THREE.MeshPhongMaterial({ map: nadeTex });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Top
    const topGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
    const topMat = new THREE.MeshPhongMaterial({ map: gunBodyTex });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 0.06;
    group.add(top);

    // Pin
    const pinGeo = new THREE.TorusGeometry(0.015, 0.005, 8, 16);
    const pin = new THREE.Mesh(pinGeo, topMat);
    pin.position.set(0.02, 0.07, 0);
    group.add(pin);

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

export function createHumanoidModel(clothColor = COLORS.CLOTH_DEFAULT, skinColor = COLORS.SKIN) {
    const group = new THREE.Group();
    
    // Create specific camo for the requested color
    const clothColorHex = `#${new THREE.Color(clothColor).getHexString()}`;
    const clothTex = TextureGenerator.createCamoTexture(clothColorHex);
    clothTex.repeat.set(1, 1.5);
    
    const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(skinColor).getHexString()}`);

    const clothMat = new THREE.MeshPhongMaterial({ map: clothTex });
    const skinMat = new THREE.MeshPhongMaterial({ map: skinTex });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 4), clothMat);
    torso.position.y = 12;
    torso.castShadow = true;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), skinMat);
    head.position.y = 20;
    head.castShadow = true;
    head.userData.isSkin = true;
    group.add(head);

    // Arms
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

    // Legs
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

    return group;
}

export function createGunModel(isViewModel = false) {
    const group = new THREE.Group();
    
    // Gun Body
    const bodyGeo = new THREE.BoxGeometry(0.08, 0.12, 0.4);
    const bodyMat = new THREE.MeshPhongMaterial({ map: gunBodyTex });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Slide
    const slideGeo = new THREE.BoxGeometry(0.085, 0.05, 0.41);
    const slideMat = new THREE.MeshPhongMaterial({ map: gunSlideTex });
    const slide = new THREE.Mesh(slideGeo, slideMat);
    slide.position.y = 0.05;
    group.add(slide);

    // Ironsights
    const sightMat = new THREE.MeshPhongMaterial({ map: gunBodyTex });
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), sightMat);
    rearSight.position.set(0, 0.08, 0.18);
    group.add(rearSight);

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.03, 0.02), sightMat);
    frontSight.position.set(0, 0.08, -0.18);
    group.add(frontSight);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8);
    barrelGeo.rotateX(Math.PI / 2);
    const barrelMat = new THREE.MeshPhongMaterial({ map: gunBodyTex });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.z = -0.3;
    barrel.position.y = 0.02;
    group.add(barrel);

    // Handle
    const handleGeo = new THREE.BoxGeometry(0.06, 0.15, 0.1);
    const handle = new THREE.Mesh(handleGeo, new THREE.MeshPhongMaterial({ map: gunGripTex }));
    handle.position.y = -0.12;
    handle.position.z = 0.1;
    handle.rotation.x = -0.2;
    group.add(handle);

    // Trigger Guard
    const guardGeo = new THREE.BoxGeometry(0.02, 0.05, 0.08);
    const guard = new THREE.Mesh(guardGeo, bodyMat);
    guard.position.set(0, -0.05, -0.05);
    group.add(guard);

    if (isViewModel) {
        const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(COLORS.SKIN).getHexString()}`);
        const skinMat = new THREE.MeshPhongMaterial({ map: skinTex });
        
        const rightArmGroup = new THREE.Group();
        const rightArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.0, 8), skinMat);
        rightArmMesh.rotation.x = Math.PI / 2;
        rightArmMesh.position.z = 0.5;
        rightArmGroup.add(rightArmMesh);

        const rightHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.12), skinMat);
        rightArmGroup.add(rightHandMesh);

        rightArmGroup.position.set(0, -0.12, 0.1);
        rightArmGroup.rotation.set(-0.2, -0.5, -0.3);
        group.add(rightArmGroup);

        const leftArmGroup = new THREE.Group();
        const leftArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.2, 8), skinMat);
        leftArmMesh.rotation.x = Math.PI / 2;
        leftArmMesh.position.z = 0.6;
        leftArmGroup.add(leftArmMesh);

        const leftHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.12), skinMat);
        leftArmGroup.add(leftHandMesh);

        leftArmGroup.position.set(-0.02, -0.06, -0.15);
        leftArmGroup.rotation.set(0.3, 0.9, 0.6);
        group.add(leftArmGroup);
        group.rotation.y = 0; 
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
    
    const half = size / 2;
    crate.userData.boundingBox = new THREE.Box3(
        new THREE.Vector3(x - half, y - half, z - half),
        new THREE.Vector3(x + half, y + half, z + half)
    );
    
    if (scene) scene.add(crate);
    if (objects) objects.push(crate);
    return crate;
}
