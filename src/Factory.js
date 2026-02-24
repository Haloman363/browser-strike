import * as THREE from 'three';
import { COLORS } from './Constants.js';

export function createKnifeModel(isViewModel = false) {
    const group = new THREE.Group();
    
    // Blade
    const bladeGeo = new THREE.BoxGeometry(0.02, 0.08, 0.3);
    const bladeMat = new THREE.MeshPhongMaterial({ color: COLORS.BLADE, shininess: 100 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.z = -0.15;
    group.add(blade);

    // Handle
    const handleGeo = new THREE.BoxGeometry(0.04, 0.05, 0.15);
    const handleMat = new THREE.MeshPhongMaterial({ color: COLORS.HANDLE });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.z = 0.05;
    group.add(handle);

    // Guard
    const guardGeo = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const guard = new THREE.Mesh(guardGeo, handleMat);
    guard.position.z = -0.02;
    group.add(guard);

    if (isViewModel) {
        // --- VIEWMODEL ARMS ---
        const skinMat = new THREE.MeshPhongMaterial({ color: COLORS.SKIN });
        
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
    const bodyMat = new THREE.MeshPhongMaterial({ color: COLORS.NADE_BODY });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Top
    const topGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
    const topMat = new THREE.MeshPhongMaterial({ color: COLORS.GUN_IRON });
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
        const skinMat = new THREE.MeshPhongMaterial({ color: COLORS.SKIN });
        
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
    const clothMat = new THREE.MeshPhongMaterial({ color: clothColor });
    const skinMat = new THREE.MeshPhongMaterial({ color: skinColor });

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
    const bodyMat = new THREE.MeshPhongMaterial({ color: COLORS.GUN_BODY });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Slide
    const slideGeo = new THREE.BoxGeometry(0.085, 0.05, 0.41);
    const slideMat = new THREE.MeshPhongMaterial({ color: COLORS.GUN_SLIDE });
    const slide = new THREE.Mesh(slideGeo, slideMat);
    slide.position.y = 0.05;
    group.add(slide);

    // Ironsights
    const sightMat = new THREE.MeshPhongMaterial({ color: COLORS.GUN_IRON });
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), sightMat);
    rearSight.position.set(0, 0.08, 0.18);
    group.add(rearSight);

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.03, 0.02), sightMat);
    frontSight.position.set(0, 0.08, -0.18);
    group.add(frontSight);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8);
    barrelGeo.rotateX(Math.PI / 2);
    const barrelMat = new THREE.MeshPhongMaterial({ color: COLORS.GUN_IRON });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.z = -0.3;
    barrel.position.y = 0.02;
    group.add(barrel);

    // Handle
    const handleGeo = new THREE.BoxGeometry(0.06, 0.15, 0.1);
    const handle = new THREE.Mesh(handleGeo, bodyMat);
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
        const skinMat = new THREE.MeshPhongMaterial({ color: COLORS.SKIN });
        
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
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshPhongMaterial({ color }));
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
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshPhongMaterial({ color: COLORS.CRATE }));
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
