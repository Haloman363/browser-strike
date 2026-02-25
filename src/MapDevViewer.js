import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Maps } from './Maps.js';
import { createHumanoidModel, createGunModel, createKnifeModel, createGrenadeModel, createWall, createCrate } from './Factory.js';
import { TextureGenerator } from './TextureGenerator.js';
import { COLORS } from './Constants.js';

let scene, camera, renderer, controls;
let objects = [];
let enemies = [];
let droppedGuns = [];
let currentMapKey = 'dust2';

function createEnemy(x, y, z, team = 'A') {
    const enemy = new THREE.Group();
    const humanoid = createHumanoidModel(team === 'B' ? 'TERRORIST' : 'COUNTER_TERRORIST');
    enemy.add(humanoid);
    enemy.userData.team = team;
    enemy.position.set(x, y, z);
    scene.add(enemy);
    enemies.push(enemy);
    return enemy;
}

window.changeMap = (key) => {
    currentMapKey = key;
    loadMap();
};

window.reloadMap = () => {
    loadMap();
};

window.resetCamera = () => {
    camera.position.set(0, 1500, 0);
    controls.target.set(0, 0, 0);
    controls.update();
};

window.perspectiveView = () => {
    camera.position.set(1000, 800, 1000);
    controls.target.set(0, 0, 0);
    controls.update();
};

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xadd8e6); // Sky color
    
    // --- SKYDOME ---
    const skyGeo = new THREE.SphereGeometry(2000, 32, 32);
    const skyTex = TextureGenerator.createSkyTexture();
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
    const skydome = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skydome);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 5000);
    camera.position.set(0, 1500, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.1; // Prevent going below ground

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directLight.position.set(100, 200, 100);
    directLight.castShadow = true;
    directLight.shadow.mapSize.width = 2048;
    directLight.shadow.mapSize.height = 2048;
    directLight.shadow.camera.left = -1500;
    directLight.shadow.camera.right = 1500;
    directLight.shadow.camera.top = 1500;
    directLight.shadow.camera.bottom = -1500;
    scene.add(directLight);

    loadMap();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function loadMap() {
    // Clear existing
    objects.forEach(obj => scene.remove(obj));
    enemies.forEach(en => scene.remove(en));
    droppedGuns.forEach(dg => scene.remove(dg));
    
    // Remove walls/crates explicitly if not in objects
    const toRemove = [];
    scene.children.forEach(child => {
        if (child.userData && (child.userData.isWall || child.userData.isCrate || child.userData.isGround)) {
            toRemove.push(child);
        }
    });
    toRemove.forEach(c => scene.remove(c));

    objects = [];
    enemies = [];
    droppedGuns = [];

    const map = Maps[currentMapKey];
    console.log('Loading map:', currentMapKey);
    
    // Build map (mocking peers/teams for dev view)
    map.build(scene, objects, enemies, droppedGuns, createEnemy, true, true, null);

    // Update UI
    const objCount = document.getElementById('obj-count');
    const enemyCount = document.getElementById('enemy-count');
    if (objCount) objCount.innerText = objects.length;
    if (enemyCount) enemyCount.innerText = enemies.length;
    
    const mapName = document.getElementById('map-name');
    if (mapName) mapName.innerText = `Map: ${currentMapKey.toUpperCase()}`;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    // Update coordinates display
    const coordsEl = document.getElementById('coords');
    if (coordsEl) {
        coordsEl.innerText = `X: ${Math.round(camera.position.x)}, Y: ${Math.round(camera.position.y)}, Z: ${Math.round(camera.position.z)}`;
    }
    
    renderer.render(scene, camera);
}

init();
