import * as THREE from 'three';
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, color, float } from 'three/tsl';
import { COLORS } from '../Constants_v2.js';
import { TextureGenerator } from '../TextureGenerator.js';
import { WeaponBuilder } from '../WeaponBuilder.js';
import { WEAPON_RECIPES } from '../WeaponRecipes.js';
import { 
    gunBodyTex, gunSlideTex, gunGripTex, gloveTex, bladeTex, nadeTex,
    addEjectionPort, addBoltDetails, createViewModelArms
} from './FactoryUtils.js';

export function createKnifeModel(isViewModel = false) {
    const recipe = WEAPON_RECIPES['COMBAT_KNIFE'];
    const builder = new WeaponBuilder();
    const group = builder.getGroup();
    
    const bladeMat = new MeshStandardNodeMaterial();
    bladeMat.colorNode = texture(bladeTex);
    bladeMat.roughnessNode = float(0.2);
    bladeMat.metalnessNode = float(1.0);

    const gripMat = new MeshStandardNodeMaterial();
    gripMat.colorNode = texture(gunGripTex);
    gripMat.roughnessNode = float(0.8);
    gripMat.metalnessNode = float(0.0);

    const metalMat = new MeshStandardNodeMaterial();
    metalMat.colorNode = texture(gunBodyTex);
    metalMat.roughnessNode = float(0.2);
    metalMat.metalnessNode = float(1.0);

    if (recipe.bladePoints) {
        builder.addExtrudedShape(recipe.bladePoints, recipe.bladeWidth, bladeMat, {x: 0, y: -0.04, z: -0.01});
    }

    const fullerMat = new MeshStandardNodeMaterial();
    fullerMat.colorNode = color(0x111111);
    fullerMat.roughnessNode = float(0.2);
    fullerMat.metalnessNode = float(1.0);
    builder.addBox({x: 0.005, y: 0.01, z: 0.15}, fullerMat, {x: 0, y: 0, z: -0.12});

    for (let i = 0; i < 6; i++) {
        builder.addBox({x: 0.02, y: 0.015, z: 0.015}, bladeMat, 
            {x: 0, y: 0.035, z: -0.05 - (i * 0.025)}, 
            {x: Math.PI / 4, y: 0, z: 0});
    }

    builder.addCylinder(recipe.handleRadius, recipe.handleRadius, recipe.handleLength, gripMat, 
        {x: 0, y: 0, z: recipe.handleLength / 2}, 
        {x: Math.PI / 2, y: 0, z: 0});

    builder.addBox({x: 0.045, y: 0.045, z: 0.03}, metalMat, {x: 0, y: 0, z: recipe.handleLength + 0.015});

    const gSize = recipe.guardSize;
    builder.addBox(gSize, metalMat, {x: 0, y: 0, z: 0});
    
    const holeMat = new MeshStandardNodeMaterial();
    holeMat.colorNode = color(0x111111);
    holeMat.roughnessNode = float(0.2);
    holeMat.metalnessNode = float(1.0);
    builder.addCylinder(0.005, 0.005, 0.03, holeMat, {x: 0, y: 0.035, z: 0}, {x: Math.PI/2, y: 0, z: 0});
    builder.addCylinder(0.005, 0.005, 0.03, holeMat, {x: 0, y: -0.035, z: 0}, {x: Math.PI/2, y: 0, z: 0});

    if (isViewModel) {
        const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(COLORS.SKIN).getHexString()}`);
        const skinMat = new MeshStandardNodeMaterial();
        skinMat.colorNode = texture(skinTex);
        skinMat.roughnessNode = float(0.6);
        skinMat.metalnessNode = float(0.0);

        const gloveMat = new MeshStandardNodeMaterial();
        gloveMat.colorNode = texture(gloveTex);
        gloveMat.roughnessNode = float(0.8);
        gloveMat.metalnessNode = float(0.0);
        
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

    let bodyColor = '#4b5320';
    if (type === 'FLASH') bodyColor = '#888888';
    else if (type === 'SMOKE') bodyColor = '#333333';
    else if (type === 'MOLOTOV') bodyColor = '#8b4513';

    const localNadeTex = TextureGenerator.createMetalTexture(bodyColor);

    if (type === 'MOLOTOV') {
        const bodyGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.15, 8);
        const bodyMat = new MeshStandardNodeMaterial();
        bodyMat.colorNode = color(0x8b4513);
        bodyMat.transparent = true;
        bodyMat.opacityNode = float(0.7);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(body);

        const liqGeo = new THREE.CylinderGeometry(0.028, 0.038, 0.1, 8);
        const liqMat = new MeshStandardNodeMaterial();
        liqMat.colorNode = color(0xffaa00);
        const liq = new THREE.Mesh(liqGeo, liqMat);
        liq.position.y = -0.02;
        group.add(liq);

        const ragGeo = new THREE.BoxGeometry(0.02, 0.1, 0.02);
        const ragMat = new MeshStandardNodeMaterial();
        ragMat.colorNode = color(0xdddddd);
        const rag = new THREE.Mesh(ragGeo, ragMat);
        rag.position.y = 0.1;
        rag.rotation.z = 0.3;
        group.add(rag);
    } else {
        const bodyGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8);
        const bodyMat = new MeshStandardNodeMaterial();
        bodyMat.colorNode = texture(localNadeTex);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(body);

        const topGeo = new THREE.SphereGeometry(0.04, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const topMat = new MeshStandardNodeMaterial();
        topMat.colorNode = color(0x333333);
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.y = 0.05;
        group.add(top);

        const leverGeo = new THREE.BoxGeometry(0.02, 0.08, 0.01);
        const lever = new THREE.Mesh(leverGeo, topMat);
        lever.position.set(0, 0.04, 0.03);
        lever.rotation.x = -0.2;
        group.add(lever);

        const pinGeo = new THREE.TorusGeometry(0.015, 0.005, 8, 16);
        const pin = new THREE.Mesh(pinGeo, topMat);
        pin.position.set(0.03, 0.07, 0);
        group.add(pin);
    }

    if (isViewModel) {
        const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(COLORS.SKIN).getHexString()}`);
        const skinMat = new MeshStandardNodeMaterial();
        skinMat.colorNode = texture(skinTex);
        skinMat.roughnessNode = float(0.6);
        skinMat.metalnessNode = float(0.0);
        const gloveMat = new MeshStandardNodeMaterial();
        gloveMat.colorNode = texture(gloveTex);
        gloveMat.roughnessNode = float(0.8);
        gloveMat.metalnessNode = float(0.0);
        
        const overrides = {
            right: { x: 0.1, y: -0.15, z: 0.1, rx: -0.1, ry: -0.6 }
        };
        
        createViewModelArms(group, skinMat, gloveMat, 'right', overrides);
    }

    return group;
}

export function createC4Model(isViewModel = false) {
    const group = new THREE.Group();
    group.name = "c4";

    const c4Tex = TextureGenerator.createC4Texture();
    const material = new MeshStandardNodeMaterial();
    material.colorNode = texture(c4Tex);

    const bodyGeo = new THREE.BoxGeometry(0.12, 0.08, 0.18);
    const body = new THREE.Mesh(bodyGeo, material);
    group.add(body);

    const detGeo = new THREE.BoxGeometry(0.1, 0.04, 0.12);
    const det = new THREE.Mesh(detGeo, material);
    det.position.y = 0.06;
    group.add(det);

    const ledGeo = new THREE.SphereGeometry(0.005, 8, 8);
    const ledMat = new MeshBasicNodeMaterial();
    ledMat.colorNode = color(0xff0000);
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0.04, 0.07, 0.05);
    led.name = "led";
    group.add(led);

    if (isViewModel) {
        const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(COLORS.SKIN).getHexString()}`);
        const skinMat = new MeshStandardNodeMaterial();
        skinMat.colorNode = texture(skinTex);
        const gloveMat = new MeshStandardNodeMaterial();
        gloveMat.colorNode = texture(gloveTex);
        
        const overrides = {
            left: { x: -0.15, y: -0.2, z: 0.1, rx: 0.4, ry: 0.6 },
            right: { x: 0.15, y: -0.2, z: 0.1, rx: 0.4, ry: -0.6 }
        };
        
        createViewModelArms(group, skinMat, gloveMat, 'both', overrides);
    }

    return group;
}

export function createBombSiteMarker(siteLabel = 'A') {
    const group = new THREE.Group();
    group.name = `bombsite_${siteLabel}`;

    const tex = TextureGenerator.createBombSiteTexture(siteLabel);
    const geo = new THREE.PlaneGeometry(100, 100);
    const mat = new MeshBasicNodeMaterial();
    mat.colorNode = texture(tex);
    mat.transparent = true;
    mat.side = THREE.DoubleSide;
    mat.depthWrite = false;
    
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.5;
    group.add(plane);

    const glowGeo = new THREE.SphereGeometry(30, 16, 16);
    const glowMat = new MeshBasicNodeMaterial();
    glowMat.colorNode = color(0x00ff00);
    glowMat.transparent = true;
    glowMat.opacityNode = float(0.1);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = 10;
    group.add(glow);

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

    const bodyTexLocal = TextureGenerator.createMetalTexture(recipe.bodyColor || '#222222');
    const gripTexLocal = TextureGenerator.createPolymerTexture(recipe.gripColor || '#111111');
    const accentTexLocal = TextureGenerator.createMetalTexture(recipe.accentColor || '#1a1a1a');
    const woodTexLocal = (weaponKey === 'AK47' || recipe.stockType === 'wood') 
        ? TextureGenerator.createWoodTexture(recipe.gripColor || '#4a2c11') 
        : TextureGenerator.createCrateTexture();

    const bodyMat = new MeshStandardNodeMaterial();
    bodyMat.colorNode = texture(bodyTexLocal);
    bodyMat.roughnessNode = float(0.2);
    bodyMat.metalnessNode = float(1.0);

    const gripMat = new MeshStandardNodeMaterial();
    gripMat.colorNode = texture(gripTexLocal);
    gripMat.roughnessNode = float(0.8);
    gripMat.metalnessNode = float(0.0);

    const accentMat = new MeshStandardNodeMaterial();
    accentMat.colorNode = texture(accentTexLocal);
    accentMat.roughnessNode = float(0.2);
    accentMat.metalnessNode = float(1.0);

    const woodMat = new MeshStandardNodeMaterial();
    woodMat.colorNode = texture(woodTexLocal);
    woodMat.roughnessNode = float(0.9);
    woodMat.metalnessNode = float(0.0);

    if (recipe.receiverPoints) {
        builder.addExtrudedShape(recipe.receiverPoints, recipe.receiverWidth, bodyMat);
    }

    if (recipe.barrelProfile) {
        builder.addLatheBarrel(recipe.barrelProfile, bodyMat, recipe.barrelPos);
    }

    if (recipe.gripPoints) {
        builder.addExtrudedShape(recipe.gripPoints, recipe.gripWidth, gripMat, recipe.gripPos);
    }

    if (recipe.stockPoints) {
        const sMat = recipe.stockType === 'wood' ? woodMat : bodyMat;
        builder.addExtrudedShape(recipe.stockPoints, recipe.stockWidth, sMat, recipe.stockPos);
    }

    const slideGroup = new THREE.Group();
    group.add(slideGroup);
    if (recipe.slidePoints) {
        const slide = builder.addExtrudedShape(recipe.slidePoints, recipe.slideWidth, bodyMat, recipe.slidePos);
        slideGroup.add(slide);
        slide.name = 'slide';
    }

    if (recipe.magType === 'pistol' || recipe.magType === 'box_small') {
        const mPos = recipe.magPos || {x: 0, y: -0.04, z: 0.06};
        const mRot = recipe.magType === 'pistol' ? {x: 0.2, y: 0, z: 0} : {x: 0, y: 0, z: 0};
        const mSize = recipe.magType === 'pistol' ? {x: 0.06, y: 0.2, z: 0.1} : {x: 0.05, y: 0.12, z: 0.08};
        const mag = builder.addBox(mSize, accentMat, mPos, mRot);
        mag.name = 'magazine';
        
        if (recipe.magType === 'pistol') {
            mag.userData.isInternalMag = true;
            mag.visible = false;
        }
    } else if (recipe.magType === 'rifle_straight') {
        const mPos = recipe.magPos || {x:0, y:-0.05, z:-0.08};
        const mag = builder.addBox({x: 0.06, y: 0.25, z: 0.12}, accentMat, mPos, {x: 0.2, y: 0, z: 0});
        mag.name = 'magazine';
    } else if (recipe.magType) {
        const mag = builder.addBox({x: 0.06, y: 0.2, z: 0.1}, accentMat, recipe.magPos);
        mag.name = 'magazine';
    }

    if (recipe.handguardType) {
        const hgMat = recipe.handguardType === 'wood' || weaponKey === 'AK47' ? woodMat : accentMat;
        builder.addBox({x: 0.09, y: 0.09, z: 0.3}, hgMat, {x: 0, y: 0.02, z: -0.25});
    }

    if (recipe.railSystem) {
        builder.addPicatinnyRail(0.4, 0.06, new THREE.Vector3(0, 0.08, 0), accentMat);
    }

    if (recipe.boltAction) {
        const handle = builder.addBox({x: 0.08, y: 0.015, z: 0.015}, accentMat, {x: 0.06, y: 0.05, z: 0.15}, {x: 0, y: 0, z: -0.5});
        const knob = builder.addCylinder(0.02, 0.02, 0.02, accentMat, {x: 0.1, y: 0.03, z: 0.15}, {x: Math.PI/2, y: 0, z: 0});
        handle.name = 'bolt';
        knob.name = 'bolt';
    }

    if (isViewModel) {
        const skinTex = TextureGenerator.createSkinTexture(`#${new THREE.Color(COLORS.SKIN).getHexString()}`);
        const skinMat = new MeshStandardNodeMaterial();
        skinMat.colorNode = texture(skinTex);
        const gloveMat = new MeshStandardNodeMaterial();
        gloveMat.colorNode = texture(gloveTex);
        
        const overrides = {
            right: recipe.vmRightHand,
            left: recipe.vmLeftHand
        };
        
        createViewModelArms(group, skinMat, gloveMat, 'both', overrides);
    }

    return group;
}
