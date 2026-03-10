import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { texture, color, float } from 'three/tsl';
import { COLORS } from '../Constants_v2.js';
import { wallTexture, crateTexture, concreteTexture } from './FactoryUtils.js';

export function createLadder(width, height, x, y, z, scene, objects) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const metalMat = new MeshStandardNodeMaterial();
    metalMat.colorNode = color(0x333333);
    metalMat.roughnessNode = float(0.2);
    metalMat.metalnessNode = float(1.0);

    // Side rails
    const railGeo = new THREE.BoxGeometry(2, height, 2);
    const railL = new THREE.Mesh(railGeo, metalMat);
    railL.position.x = -width / 2;
    group.add(railL);

    const railR = new THREE.Mesh(railGeo, metalMat);
    railR.position.x = width / 2;
    group.add(railR);

    // Rungs
    const rungGeo = new THREE.CylinderGeometry(0.5, 0.5, width, 8);
    rungGeo.rotateZ(Math.PI / 2);
    const rungCount = Math.floor(height / 20);
    for (let i = 0; i < rungCount; i++) {
        const rung = new THREE.Mesh(rungGeo, metalMat);
        rung.position.y = -height / 2 + (i * 20) + 10;
        group.add(rung);
    }

    group.userData.type = 'ladder';
    group.userData.height = height;
    group.userData.width = width;
    
    if (scene) scene.add(group);
    if (objects) objects.push(group);

    return group;
}

export function createWall(width, height, depth, x, y, z, colorVal = COLORS.WALL_DEFAULT, scene, objects) {
    const tex = colorVal === 0xaaaaaa ? concreteTexture.clone() : wallTexture.clone();
    
    const repeatX = Math.max(width / 40, 1);
    const repeatY = Math.max(height / 40, 1);
    const repeatZ = Math.max(depth / 40, 1);
    
    if (width > depth) {
        tex.repeat.set(repeatX, repeatY);
    } else {
        tex.repeat.set(repeatZ, repeatY);
    }
    
    const wallMat = new MeshStandardNodeMaterial();
    wallMat.colorNode = texture(tex).mul(color(colorVal));
    wallMat.roughnessNode = float(0.8);
    wallMat.metalnessNode = float(0.0);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
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

export function createCrate(size, x, y, z, scene, objects, health = 100) {
    const crateMat = new MeshStandardNodeMaterial();
    crateMat.colorNode = texture(crateTexture);
    crateMat.roughnessNode = float(0.9);
    crateMat.metalnessNode = float(0.0);

    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
    crate.position.set(x, y, z);
    crate.castShadow = true;
    crate.receiveShadow = true;
    crate.userData.isSolid = true;
    crate.userData.isCrate = true;
    crate.userData.isDestructible = true;
    crate.userData.health = health;
    crate.userData.maxHealth = health;
    crate.userData.id = `crate_${x}_${y}_${z}`;
    
    const half = size / 2;
    crate.userData.boundingBox = new THREE.Box3(
        new THREE.Vector3(x - half, y - half, z - half),
        new THREE.Vector3(x + half, y + half, z + half)
    );
    
    if (scene) scene.add(crate);
    if (objects) objects.push(crate);
    return crate;
}

export function createStairs(width, height, depth, steps, x, y, z, ry = 0, scene, objects) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = ry;

    const stepHeight = height / steps;
    const stepDepth = depth / steps;

    // Use concrete texture for stairs
    const tex = concreteTexture.clone();
    tex.repeat.set(width / 40, depth / 40);

    const mat = new MeshStandardNodeMaterial();
    mat.colorNode = texture(tex);
    mat.roughnessNode = float(0.8);
    mat.metalnessNode = float(0.0);

    for (let i = 0; i < steps; i++) {
        const h = stepHeight * (i + 1);
        const geo = new THREE.BoxGeometry(width, h, stepDepth);
        const mesh = new THREE.Mesh(geo, mat);
        
        // Position relative to group center
        mesh.position.y = h / 2 - height / 2;
        mesh.position.z = (i * stepDepth) + stepDepth / 2 - depth / 2;
        
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        group.add(mesh);
    }

    group.userData.isSolid = true;
    group.userData.type = 'stairs';
    
    if (scene) scene.add(group);
    
    // Ensure world matrices are updated for bounding box calculation
    group.updateMatrixWorld(true);

    // Add individual steps to objects for collision
    group.children.forEach(step => {
        step.userData.isSolid = true;
        // Compute world-space bounding box for the physics system
        step.userData.boundingBox = new THREE.Box3().setFromObject(step);
        if (objects) objects.push(step);
    });

    return group;
}

export function createArch(width, height, thickness, depth, x, y, z, ry = 0, scene, objects) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = ry;

    // Use concrete texture for arches
    const tex = concreteTexture.clone();
    tex.repeat.set(width / 40, thickness / 20);

    const mat = new MeshStandardNodeMaterial();
    mat.colorNode = texture(tex);
    mat.roughnessNode = float(0.8);
    mat.metalnessNode = float(0.0);

    // Create the arch curve
    const segments = 12;
    const radius = width / 2;
    
    // Side Pillars
    const pillarGeo = new THREE.BoxGeometry(thickness, height - radius, depth);
    const pillarL = new THREE.Mesh(pillarGeo, mat);
    pillarL.position.set(-radius + thickness / 2, (height - radius) / 2 - height / 2, 0);
    group.add(pillarL);

    const pillarR = new THREE.Mesh(pillarGeo, mat);
    pillarR.position.set(radius - thickness / 2, (height - radius) / 2 - height / 2, 0);
    group.add(pillarR);

    // Curved Top
    for (let i = 0; i < segments; i++) {
        const angleStart = (i / segments) * Math.PI;
        const angleEnd = ((i + 1) / segments) * Math.PI;
        const angleMid = (angleStart + angleEnd) / 2;

        const segmentGeo = new THREE.BoxGeometry(thickness, (radius * Math.PI) / segments + 2, depth);
        const segment = new THREE.Mesh(segmentGeo, mat);
        
        // Position on the semicircle
        segment.position.x = Math.cos(angleMid) * (radius - thickness / 2);
        segment.position.y = Math.sin(angleMid) * (radius - thickness / 2) + (height / 2 - radius);
        segment.rotation.z = angleMid + Math.PI / 2;
        
        segment.castShadow = true;
        segment.receiveShadow = true;
        group.add(segment);
    }

    group.userData.isSolid = true;
    group.userData.type = 'arch';
    
    if (scene) scene.add(group);
    group.updateMatrixWorld(true);

    // Add all children to collision objects
    group.children.forEach(child => {
        child.userData.isSolid = true;
        child.userData.boundingBox = new THREE.Box3().setFromObject(child);
        if (objects) objects.push(child);
    });

    return group;
}

export function createPillar(radius, height, x, y, z, scene, objects) {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 8);
    const mat = new MeshStandardNodeMaterial();
    mat.colorNode = texture(concreteTexture);
    mat.roughnessNode = float(0.8);
    mat.metalnessNode = float(0.0);
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

export function createPipe(radius, length, x, y, z, rx = 0, ry = 0, rz = 0, scene, objects) {
    const geo = new THREE.CylinderGeometry(radius, radius, length, 8);
    const mat = new MeshStandardNodeMaterial();
    mat.colorNode = color(0x555555);
    mat.roughnessNode = float(0.3);
    mat.metalnessNode = float(0.8);
    
    const pipe = new THREE.Mesh(geo, mat);
    pipe.position.set(x, y, z);
    pipe.rotation.set(rx, ry, rz);
    pipe.castShadow = true;
    pipe.receiveShadow = true;
    
    if (scene) scene.add(pipe);
    // Pipes are usually detail, no collision unless large
    if (radius > 5 && objects) {
        pipe.userData.isSolid = true;
        pipe.userData.boundingBox = new THREE.Box3().setFromObject(pipe);
        objects.push(pipe);
    }
    return pipe;
}

export function createLamp(x, y, z, lightColor = 0xfff0dd, scene) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Fixture
    const fixtureGeo = new THREE.BoxGeometry(4, 2, 4);
    const fixtureMat = new MeshStandardNodeMaterial();
    fixtureMat.colorNode = color(0x222222);
    const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
    group.add(fixture);

    // Bulb (Emissive)
    const bulbGeo = new THREE.SphereGeometry(1.5, 8, 8);
    const bulbMat = new THREE.MeshBasicMaterial({ color: lightColor });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.y = -1;
    group.add(bulb);

    // Light
    const light = new THREE.PointLight(lightColor, 50, 300);
    light.position.y = -2;
    light.castShadow = true;
    // Optimization: Low shadow map res for small lights
    light.shadow.mapSize.width = 256;
    light.shadow.mapSize.height = 256;
    group.add(light);

    if (scene) scene.add(group);
    return group;
}
