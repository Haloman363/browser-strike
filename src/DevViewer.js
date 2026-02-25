import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createGunModel, createGrenadeModel, createHumanoidModel, createWall, createCrate } from './Factory.js';
import { WEAPON_RECIPES } from './WeaponRecipes.js';
import { COLORS } from './Constants.js';

let scene, camera, renderer, controls, currentMesh;
let categories = {
    weapons: Object.keys(WEAPON_RECIPES),
    grenades: ['HE', 'FLASH', 'SMOKE', 'MOLOTOV'],
    characters: ['TERRORIST', 'COUNTER_TERRORIST'],
    environment: ['CRATE', 'STONE_WALL', 'CONCRETE_WALL']
};
let currentCategory = 'weapons';
let currentIndex = 0;
let isViewModel = false;

// Export to window for HTML event handlers
window.changeCategory = (cat) => {
    console.log('Changing category to:', cat);
    currentCategory = cat;
    currentIndex = 0;
    loadItem();
};

window.nextWeapon = () => {
    const items = categories[currentCategory];
    currentIndex = (currentIndex + 1) % items.length;
    loadItem();
};

window.prevWeapon = () => {
    const items = categories[currentCategory];
    currentIndex = (currentIndex - 1 + items.length) % items.length;
    loadItem();
};

window.toggleViewModel = () => {
    isViewModel = !isViewModel;
    loadItem();
};

window.reloadItem = () => {
    loadItem();
};

window.resetCamera = () => {
    if (currentMesh) {
        const box = new THREE.Box3().setFromObject(currentMesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        const dist = maxDim * 1.5;
        camera.position.set(center.x + dist, center.y + dist * 0.5, center.z + dist);
        controls.target.copy(center);
        controls.update();
    }
};

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(1, 1, 2);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directLight = new THREE.DirectionalLight(0xffffff, 1);
    directLight.position.set(5, 10, 7);
    scene.add(directLight);

    // Grid Helper
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    scene.add(grid);

    loadItem();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function loadItem() {
    const items = categories[currentCategory];
    const key = items[currentIndex];
    
    console.log('Loading item:', currentCategory, key);
    if (currentMesh) scene.remove(currentMesh);
    
    const vmToggle = document.getElementById('vm-toggle');
    if (vmToggle) {
        vmToggle.style.display = (currentCategory === 'weapons' || currentCategory === 'grenades') ? 'inline-block' : 'none';
    }

    switch (currentCategory) {
        case 'weapons':
            currentMesh = createGunModel(key, isViewModel);
            break;
        case 'grenades':
            currentMesh = createGrenadeModel(isViewModel, key);
            break;
        case 'characters':
            currentMesh = createHumanoidModel(key);
            break;
        case 'environment':
            if (key === 'CRATE') currentMesh = createCrate(1, 0, 0.5, 0);
            else if (key === 'STONE_WALL') currentMesh = createWall(2, 2, 0.2, 0, 1, 0, COLORS.WALL_DEFAULT);
            else if (key === 'CONCRETE_WALL') currentMesh = createWall(2, 2, 0.2, 0, 1, 0, 0xaaaaaa);
            break;
    }

    scene.add(currentMesh);
    updateUI(key);
    window.resetCamera();
}

function updateUI(key) {
    const items = categories[currentCategory];
    const vmText = (currentCategory === 'weapons' || currentCategory === 'grenades') ? (isViewModel ? ' (VM)' : ' (WM)') : '';
    const nameEl = document.getElementById('weapon-name');
    if (nameEl) {
        nameEl.innerText = `${currentIndex + 1}/${items.length}: ${key}${vmText}`;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

init();
