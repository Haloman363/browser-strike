import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

console.log("Script starting...");

let camera, scene, renderer, controls;
const objects = [];
let raycaster;
const enemies = [];
const bloodParticles = [];
const droppedGuns = [];

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let isCrouching = false;
const standingHeight = 18;
const crouchingHeight = 10;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

let gun, knife, muzzleFlash, muzzleLight;
let currentWeapon = 'gun'; // 'gun' or 'knife'
let recoil = 0;
let cameraRecoilX = 0;
const restPos = new THREE.Vector3(0.25, -0.3, -0.5);
const adsPos = new THREE.Vector3(0, -0.125, -0.3); // Perfectly centered on X
let isAiming = false;
let adsProgress = 0; // 0 to 1
const crosshair = document.getElementById('crosshair');

// Player Stats
let health = 100;
let ammoInClip = 20;
let ammoTotal = 120;
let isReloading = false;
let reloadStartTime = 0;
let reloadOffset = 0;
let selectedMap = 'dust2';
let selectedMode = 'dm';
let botsEnabled = true;
let isGameStarted = false;

// Multiplayer State
let peer = null;
let connections = []; // List of all active data connections
let networkPlayers = {}; // peerId -> humanoid model
let isHost = false;
let lobbyCode = "";
let playerName = "Player";
let playerKills = 0;
let networkScores = {}; // peerId -> { name, kills }

// Settings State (with defaults)
let settings = {
    fov: 75,
    sensitivity: 1.0,
    viewDistance: 800,
    playerName: "Noob"
};

function loadSettings() {
    const saved = localStorage.getItem('bs_settings');
    if (saved) {
        settings = JSON.parse(saved);
        playerName = settings.playerName || "Noob";
    }
}

function saveSettings() {
    settings.playerName = playerName;
    localStorage.setItem('bs_settings', JSON.stringify(settings));
}

const healthUI = document.getElementById('health');
const ammoUI = document.getElementById('ammo');
const killStatsUI = document.getElementById('kill-stats');
const aliveCountUI = document.getElementById('alive-count');
const damageFlash = document.getElementById('damage-flash');

// Global one-time initialization
renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
controls = new PointerLockControls(camera, renderer.domElement);

setupMenu();

function createKnifeModel() {
    const group = new THREE.Group();
    
    // Blade
    const bladeGeo = new THREE.BoxGeometry(0.02, 0.08, 0.3);
    const bladeMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 100 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.z = -0.15;
    group.add(blade);

    // Handle
    const handleGeo = new THREE.BoxGeometry(0.04, 0.05, 0.15);
    const handleMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.z = 0.05;
    group.add(handle);

    // Guard
    const guardGeo = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const guard = new THREE.Mesh(guardGeo, handleMat);
    guard.position.z = -0.02;
    group.add(guard);

    // --- VIEWMODEL ARMS (Always on for knife as it's only for player) ---
    const skinMat = new THREE.MeshPhongMaterial({ color: 0xdbac82 });
    
    // Right Arm
    const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.0, 8), skinMat);
    armMesh.rotation.x = Math.PI / 2;
    armMesh.position.z = 0.5;
    
    const armGroup = new THREE.Group();
    armGroup.add(armMesh);
    armGroup.position.set(0.1, -0.1, 0.1);
    armGroup.rotation.set(-0.2, -0.4, -0.2);
    group.add(armGroup);

    return group;
}

function createHumanoidModel(clothColor = 0x556b2f, skinColor = 0xdbac82) {
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
    group.add(head);

    // Arms
    const armGeo = new THREE.BoxGeometry(2, 8, 2);
    armGeo.translate(0, -4, 0); // Shift geometry so pivot is at the top
    
    const rightArm = new THREE.Mesh(armGeo, clothMat);
    rightArm.name = "rightArm";
    rightArm.position.set(5, 18, 0); // Position at shoulder height
    group.add(rightArm);

    const leftArm = new THREE.Mesh(armGeo, clothMat);
    leftArm.name = "leftArm";
    leftArm.position.set(-5, 18, 0); // Position at shoulder height
    group.add(leftArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(3, 9, 3);
    legGeo.translate(0, -4.5, 0); // Pivot at top (hip)
    
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

function setupMenu() {
    const startButton = document.getElementById('start-button');
    const mainMenu = document.getElementById('main-menu');
    const mapOptions = document.querySelectorAll('#map-select .option');
    const modeOptions = document.querySelectorAll('#mode-select .option');
    const botOptions = document.querySelectorAll('#bot-select .option');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.menu-tab-content');
    const hostBtn = document.getElementById('host-btn');
    const joinBtn = document.getElementById('join-btn');
    const joinInput = document.getElementById('join-code');
    const statusText = document.getElementById('mp-status');
    const mpInitialChoice = document.getElementById('mp-initial-choice');
    const mpHostView = document.getElementById('mp-host-view');
    const mpJoinView = document.getElementById('mp-join-view');
    const showHostViewBtn = document.getElementById('show-host-view-btn');
    const showJoinViewBtn = document.getElementById('show-join-view-btn');
    const backBtns = document.querySelectorAll('.mp-back-btn');
    const mpLobbyHostControls = document.getElementById('mp-lobby-host-controls');
    const mpMapOptions = document.querySelectorAll('#mp-map-select .option');
    const mpModeOptions = document.querySelectorAll('#mp-mode-select .option');

    // Pre-fill and sync usernames
    const usernameInputs = document.querySelectorAll('.username-input');
    usernameInputs.forEach(input => {
        input.value = playerName;
        input.addEventListener('input', (e) => {
            // Sanitize: allow only letters, numbers, spaces, - and _
            let clean = e.target.value.replace(/[^a-zA-Z0-9 _-]/g, '');
            if (clean.length > 12) clean = clean.substring(0, 12);
            e.target.value = clean;
            
            playerName = clean.trim() || "Noob";
            // Sync other inputs but don't overwrite the one being typed in to avoid cursor jumps
            usernameInputs.forEach(i => {
                if (i !== e.target) i.value = playerName;
            });
            saveSettings();
        });
    });

    const getActiveUsername = () => {
        const inputs = document.querySelectorAll('.username-input');
        let name = "Noob";
        inputs.forEach(input => {
            // Check if this input is in a visible parent view
            if (input.closest('div').style.display !== 'none' && input.value.trim() !== "") {
                name = input.value.trim();
            }
        });
        return name;
    };

    // MP View Toggling
    showHostViewBtn.addEventListener('click', () => {
        mpInitialChoice.style.display = 'none';
        mpHostView.style.display = 'flex';
    });

    showJoinViewBtn.addEventListener('click', () => {
        mpInitialChoice.style.display = 'none';
        mpJoinView.style.display = 'flex';
    });

    backBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            mpHostView.style.display = 'none';
            mpJoinView.style.display = 'none';
            mpInitialChoice.style.display = 'flex';
            statusText.innerText = "";
        });
    });

    // MP Host Lobby Settings
    mpMapOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            if (opt.dataset.value !== 'dust2') return; 
            mpMapOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedMap = opt.dataset.value;
            broadcastLobbySettings();
        });
    });

    mpModeOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            mpModeOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedMode = opt.dataset.value;
            broadcastLobbySettings();
        });
    });

    function broadcastLobbySettings() {
        if (isHost && connections.length > 0) {
            const data = {
                type: 'lobby-settings',
                map: selectedMap,
                mode: selectedMode
            };
            connections.forEach(conn => {
                if (conn.open) conn.send(data);
            });
        }
    }

    // Tab switching
    tabButtons.forEach(btn => {
        // Initial state check for start button
        if (btn.classList.contains('active') && btn.dataset.tab === 'multiplayer') {
            startButton.style.visibility = 'hidden';
        }

        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-settings`).classList.add('active');
            
            // Hide start button if multiplayer is selected (unless hosting)
            if (btn.dataset.tab === 'multiplayer' && !isHost) {
                startButton.style.visibility = 'hidden';
            } else {
                startButton.style.visibility = 'visible';
            }
        });
    });

    hostBtn.addEventListener('click', () => {
        playerName = getActiveUsername();
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        lobbyCode = code;
        isHost = true;
        
        peer = new Peer(`BS-${code}`);
        
        peer.on('open', (id) => {
            statusText.innerText = `LOBBY CREATED: ${code}`;
            hostBtn.style.display = 'none'; // Hide create button
            // Hide back buttons once lobby is live
            document.querySelectorAll('.mp-back-btn').forEach(b => b.style.display = 'none');
            startButton.style.visibility = 'visible';
            
            peer.on('connection', (conn) => {
                connections.push(conn);
                setupDataConnection(conn);
                console.log("Player joined lobby");
                // Send current settings to the new player immediately
                setTimeout(() => {
                    if (conn.open) {
                        conn.send({
                            type: 'lobby-settings',
                            map: selectedMap,
                            mode: selectedMode
                        });
                    }
                }, 500);
            });
        });

        peer.on('error', (err) => {
            console.error(err);
            statusText.innerText = "Error creating lobby. Try again.";
        });
    });

    joinBtn.addEventListener('click', () => {
        playerName = getActiveUsername();
        const code = joinInput.value.toUpperCase();
        if (code.length !== 6) return;

        peer = new Peer(); // Random ID for client
        
        peer.on('open', (id) => {
            const conn = peer.connect(`BS-${code}`);
            conn.on('open', () => {
                isHost = false;
                lobbyCode = code;
                connections.push(conn);
                setupDataConnection(conn);
                statusText.innerText = "CONNECTED TO LOBBY!";
                
                // For clients, we start game when host says so or manually
                startButton.style.visibility = 'visible';
                startButton.innerText = "JOIN MATCH";
            });
        });

        peer.on('error', (err) => {
            console.error(err);
            statusText.innerText = "Lobby not found.";
        });
    });

    mapOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            if (opt.dataset.value !== 'dust2') return; // Only Dust 2 is active for now
            mapOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedMap = opt.dataset.value;
        });
    });

    modeOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            modeOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedMode = opt.dataset.value;
        });
    });

    botOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            botOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            botsEnabled = opt.dataset.value === 'true';
        });
    });

    startButton.addEventListener('click', () => {
        mainMenu.style.display = 'none';
        document.getElementById('crosshair').style.display = 'block';
        document.getElementById('stats').style.display = 'flex';
        
        if (!isGameStarted) {
            init();
            animate();
            isGameStarted = true;
        }
        
        // Lock controls on start
        setTimeout(() => {
            controls.lock();
        }, 100);
    });
}

function broadcastScore() {
    if (connections.length > 0) {
        const data = {
            type: 'score-update',
            name: playerName,
            kills: playerKills
        };
        connections.forEach(conn => {
            if (conn.open) conn.send(data);
        });
    }
}

function setupDataConnection(conn) {
    conn.on('data', (data) => {
        // Basic Validation
        if (!data || typeof data !== 'object') return;

        if (data.type === 'transform') {
            if (data.pos && typeof data.pos.x === 'number' && typeof data.pos.y === 'number' && typeof data.pos.z === 'number' &&
                data.rot && typeof data.rot.y === 'number') {
                updateNetworkPlayer(conn.peer, data);
            }
        } else if (data.type === 'shoot') {
            showNetworkShot(conn.peer, data);
        } else if (data.type === 'lobby-settings') {
            if (typeof data.map === 'string' && typeof data.mode === 'string') {
                selectedMap = data.map;
                selectedMode = data.mode;
                const statusText = document.getElementById('mp-status');
                if (statusText) statusText.innerText = `CONNECTED! (${selectedMap.toUpperCase()} - ${selectedMode.toUpperCase()})`;
            }
        } else if (data.type === 'score-update') {
            if (typeof data.name === 'string' && typeof data.kills === 'number') {
                // Sanitize remote name just in case
                const safeName = data.name.replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, 12);
                networkScores[conn.peer] = {
                    name: safeName || "Player",
                    kills: data.kills
                };
                if (document.getElementById('scoreboard').style.display === 'block') {
                    updateScoreboard();
                }
            }
        } else if (data.type === 'player-hit') {
            // Check if WE were the one hit
            if (data.targetId === peer.id) {
                takeDamage(data.damage);
            }
        }
    });

    conn.on('close', () => {
        removeNetworkPlayer(conn.peer);
    });
}

function updateNetworkPlayer(id, data) {
    if (!networkPlayers[id]) {
        // Spawn new model for this player
        const model = createHumanoidModel(0x0000ff, 0xdbac82); // Blue for remote players
        scene.add(model);
        networkPlayers[id] = model;

        // Mark parts for shooting/collision
        model.children.forEach(part => {
            part.userData.isEnemy = true; // Treated like an enemy for shooting logic
            part.userData.parentPlayerId = id;
            part.userData.isSolid = true;
            part.userData.boundingBox = new THREE.Box3().setFromObject(part);
            
            // Check for headshot
            if (part.position.y > 18) {
                part.userData.isHeadshot = true;
            }
            objects.push(part);
        });

        // Simple Nametag... (rest of nametag code)
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.font = 'bold 32px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(data.name || "Player", 128, 45);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(10, 2.5, 1);
        sprite.position.y = 25; // Above head
        model.add(sprite);
    }
    
    const model = networkPlayers[id];
    // Fix floating: Subtract eye height (18) so model feet are on ground
    model.position.set(data.pos.x, data.pos.y - 18, data.pos.z);
    model.rotation.set(0, data.rot.y, 0);

    // Update bounding boxes for shooting
    model.children.forEach(part => {
        if (part.userData.isSolid) {
            part.updateMatrixWorld(true);
            part.userData.boundingBox.setFromObject(part);
        }
    });
}

function removeNetworkPlayer(id) {
    if (networkPlayers[id]) {
        scene.remove(networkPlayers[id]);
        delete networkPlayers[id];
    }
}

function showNetworkShot(id, data) {
    // Show visual tracer or muzzle flash from the remote player's model
    console.log("Remote player shot");
}

function createGunModel(isViewModel = false) {
    const group = new THREE.Group();
    
    // Gun Body
    const bodyGeo = new THREE.BoxGeometry(0.08, 0.12, 0.4);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Slide (Top part)
    const slideGeo = new THREE.BoxGeometry(0.085, 0.05, 0.41);
    const slideMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const slide = new THREE.Mesh(slideGeo, slideMat);
    slide.position.y = 0.05;
    group.add(slide);

    // Ironsights
    const sightMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    
    // Rear Sight (Back of slide)
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), sightMat);
    rearSight.position.set(0, 0.08, 0.18);
    group.add(rearSight);

    // Front Sight (Front of slide)
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.03, 0.02), sightMat);
    frontSight.position.set(0, 0.08, -0.18);
    group.add(frontSight);

    // Gun Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8);
    barrelGeo.rotateX(Math.PI / 2);
    const barrelMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.z = -0.3;
    barrel.position.y = 0.02;
    group.add(barrel);

    // Gun Handle
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

    // --- FPS VIEWMODEL ARMS (Only for player) ---
    if (isViewModel) {
        const skinMat = new THREE.MeshPhongMaterial({ color: 0xdbac82 });
        
        // Right Arm Group (Hand + Long Arm)
        const rightArmGroup = new THREE.Group();
        const rightArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.0, 8), skinMat);
        rightArmMesh.rotation.x = Math.PI / 2;
        rightArmMesh.position.z = 0.5; // Extend back
        rightArmGroup.add(rightArmMesh);

        const rightHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.12), skinMat);
        rightArmGroup.add(rightHandMesh);

        rightArmGroup.position.set(0, -0.12, 0.1); // Grip the handle
        rightArmGroup.rotation.set(-0.2, -0.5, -0.3); // Point to bottom-right
        group.add(rightArmGroup);

        // Left Arm Group (Hand + Long Arm)
        const leftArmGroup = new THREE.Group();
        const leftArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.2, 8), skinMat);
        leftArmMesh.rotation.x = Math.PI / 2;
        leftArmMesh.position.z = 0.6; // Extend further back
        leftArmGroup.add(leftArmMesh);

        const leftHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.12), skinMat);
        leftArmGroup.add(leftHandMesh);

        leftArmGroup.position.set(-0.02, -0.06, -0.15); // Support the body
        leftArmGroup.rotation.set(0.3, 0.9, 0.6); // Point to bottom-left
        group.add(leftArmGroup);

        // Remove previous angle-to-center to ensure ADS is perfectly centered
        group.rotation.y = 0; 
    }

    return group;
}

function init() {
    console.log("Initializing scene...");
    try {
        // Use global camera instead of re-creating it
        camera.position.set(0, 18, 100); 

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xadd8e6); // Dust 2 Sky
        scene.fog = new THREE.Fog(0xadd8e6, 0, 500);

        const light = new THREE.HemisphereLight(0xeeeeff, 0x777788, 0.7);
        light.position.set(0.5, 1, 0.75);
        scene.add(light);
        
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.camera.left = -500;
        sun.shadow.camera.right = 500;
        sun.shadow.camera.top = 500;
        sun.shadow.camera.bottom = -500;
        sun.shadow.camera.far = 1000;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        scene.add(sun);

        const ambientLight = new THREE.AmbientLight(0x404040, 0.5); 
        scene.add(ambientLight);

        const pauseOverlay = document.getElementById('pause-overlay');
        const helpModal = document.getElementById('help-modal');
        const settingsModal = document.getElementById('settings-modal');
        const resumeBtn = document.getElementById('resume-button');
        const helpBtn = document.getElementById('help-button');
        const settingsBtn = document.getElementById('settings-button');
        const quitBtn = document.getElementById('quit-button');
        const closeHelpBtn = document.getElementById('close-help');
        const closeSettingsBtn = document.getElementById('close-settings');
        const resetSettingsBtn = document.getElementById('reset-settings');

        // Settings inputs
        const fovSlider = document.getElementById('fov-slider');
        const sensSlider = document.getElementById('sens-slider');
        const distSlider = document.getElementById('dist-slider');
        const fovVal = document.getElementById('fov-val');
        const sensVal = document.getElementById('sens-val');
        const distVal = document.getElementById('dist-val');

        loadSettings();

        // Apply saved settings to UI
        fovSlider.value = settings.fov;
        fovVal.innerText = settings.fov;
        sensSlider.value = settings.sensitivity;
        sensVal.innerText = settings.sensitivity.toFixed(1);
        distSlider.value = settings.viewDistance;
        distVal.innerText = settings.viewDistance;

        // Apply settings to game objects
        camera.fov = settings.fov;
        camera.far = settings.viewDistance + 500;
        camera.updateProjectionMatrix();
        
        if (scene.fog) {
            scene.fog.far = settings.viewDistance;
        }

        resumeBtn.addEventListener('click', () => controls.lock());
        
        helpBtn.addEventListener('click', () => {
            helpModal.style.display = 'flex';
        });

        settingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
        });

        closeHelpBtn.addEventListener('click', () => {
            helpModal.style.display = 'none';
        });

        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });

        resetSettingsBtn.addEventListener('click', () => {
            settings = { fov: 75, sensitivity: 1.0, viewDistance: 800 };
            fovSlider.value = 75; fovVal.innerText = 75;
            sensSlider.value = 1.0; sensVal.innerText = "1.0";
            distSlider.value = 800; distVal.innerText = 800;
            camera.fov = 75; camera.far = 1300; camera.updateProjectionMatrix();
            if (scene.fog) scene.fog.far = 800;
            saveSettings();
        });

        // Settings listeners
        fovSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            fovVal.innerText = val;
            settings.fov = val;
            camera.fov = val;
            camera.updateProjectionMatrix();
            saveSettings();
        });

        sensSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            sensVal.innerText = val.toFixed(1);
            settings.sensitivity = val;
            saveSettings();
        });

        distSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            distVal.innerText = val;
            settings.viewDistance = val;
            scene.fog.far = val;
            camera.far = val + 500;
            camera.updateProjectionMatrix();
            saveSettings();
        });

        quitBtn.addEventListener('click', () => {
            window.location.reload(); // Simple and clean reset for now
        });

        controls.addEventListener('lock', function () {
            console.log("Controls locked");
            pauseOverlay.style.display = 'none';
            helpModal.style.display = 'none';
            settingsModal.style.display = 'none';
        });

        controls.addEventListener('unlock', function () {
            console.log("Controls unlocked");
            pauseOverlay.style.display = 'flex';
            // Ensure any modals are hidden when pausing
            helpModal.style.display = 'none';
            settingsModal.style.display = 'none';
        });

        scene.add(camera);

        const onKeyDown = function (event) {
            switch (event.code) {
                case 'Digit1':
                    if (!isReloading) {
                        currentWeapon = 'knife';
                        gun.visible = false;
                        knife.visible = true;
                    }
                    break;
                case 'Digit2':
                    if (!isReloading) {
                        currentWeapon = 'gun';
                        gun.visible = true;
                        knife.visible = false;
                    }
                    break;
                case 'ArrowUp':
                case 'KeyW':
                    moveForward = true;
                    break;
                case 'ArrowLeft':
                case 'KeyA':
                    moveLeft = true;
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    moveBackward = true;
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    moveRight = true;
                    break;
                case 'Space':
                    if (canJump === true) velocity.y += 200;
                    canJump = false;
                    break;
                case 'KeyR':
                    reload();
                    break;
                case 'ControlLeft':
                    isCrouching = true;
                    break;
                case 'Tab':
                    event.preventDefault();
                    document.getElementById('scoreboard').style.display = 'block';
                    updateScoreboard();
                    break;
            }
        };

        const onKeyUp = function (event) {
            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW':
                    moveForward = false;
                    break;
                case 'ArrowLeft':
                case 'KeyA':
                    moveLeft = false;
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    moveBackward = false;
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    moveRight = false;
                    break;
                case 'ControlLeft':
                    isCrouching = false;
                    break;
                case 'Tab':
                    document.getElementById('scoreboard').style.display = 'none';
                    break;
            }
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 20);

        // Helper for building the map
        const createWall = (width, height, depth, x, y, z, color = 0xc2b280) => {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshPhongMaterial({ color }));
            wall.position.set(x, y, z);
            wall.castShadow = true;
            wall.receiveShadow = true;
            wall.userData.isSolid = true;
            
            // Explicitly set bounding box
            const halfW = width / 2;
            const halfH = height / 2;
            const halfD = depth / 2;
            wall.userData.boundingBox = new THREE.Box3(
                new THREE.Vector3(x - halfW, y - halfH, z - halfD),
                new THREE.Vector3(x + halfW, y + halfH, z + halfD)
            );
            
            scene.add(wall);
            objects.push(wall);
            return wall;
        };

        const createCrate = (size, x, y, z) => {
            const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshPhongMaterial({ color: 0x8b4513 }));
            crate.position.set(x, y, z);
            crate.castShadow = true;
            crate.receiveShadow = true;
            crate.userData.isSolid = true;
            
            // Explicitly set bounding box
            const half = size / 2;
            crate.userData.boundingBox = new THREE.Box3(
                new THREE.Vector3(x - half, y - half, z - half),
                new THREE.Vector3(x + half, y + half, z + half)
            );
            
            scene.add(crate);
            objects.push(crate);
            return crate;
        };

        // Floor (The Sand)
        const floorGeometry = new THREE.PlaneGeometry(4000, 4000);
        floorGeometry.rotateX(-Math.PI / 2);
        const floorMaterial = new THREE.MeshPhongMaterial({ color: 0xedc9af });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.receiveShadow = true;
        scene.add(floor);
        objects.push(floor);

        // --- EXPANDED DUST 2 LAYOUT ---
        // Main Perimeter (Bigger boundary)
        createWall(3000, 80, 20, 0, 40, -1500); // Back
        createWall(3000, 80, 20, 0, 40, 1500);  // Front
        createWall(20, 80, 3000, -1500, 40, 0); // Left
        createWall(20, 80, 3000, 1500, 40, 0);  // Right

        // "T-Spawn" Area (South)
        createWall(400, 60, 20, 0, 30, -1200); // T-Spawn back wall
        createWall(20, 60, 400, -200, 30, -1000); 
        createWall(20, 60, 400, 200, 30, -1000);

        // "Long A" Pathway (East)
        createWall(20, 60, 800, 600, 30, -400);  // Long A outer wall
        createWall(20, 60, 600, 400, 30, -300);  // Long A inner wall
        createWall(200, 60, 20, 500, 30, 0);     // Long A corner (Blue box area)
        createWall(20, 60, 400, 700, 30, 400);   // Pathway to A site
        
        // "Pit" Area
        createWall(200, 20, 200, 600, 10, -800, 0x8b7355); // Pit walls
        createWall(20, 40, 200, 500, 20, -800);

        // "A Site" (Northeast)
        createWall(300, 20, 300, 600, 10, 800, 0xaaaaaa); // Site platform
        createWall(20, 60, 300, 450, 30, 800);  // Short A wall
        createWall(300, 60, 20, 600, 30, 950);  // Site back wall

        // "Mid" Area (Center)
        createWall(20, 60, 400, -150, 30, -200); // Mid wall West
        createWall(20, 60, 400, 150, 30, -200);  // Mid wall East
        createWall(100, 60, 20, -100, 30, 200);  // Xbox area wall
        createWall(300, 60, 20, 0, 30, 400);     // Mid Doors boundary
        // Mid Doors
        createWall(120, 60, 10, -80, 30, 400, 0x554433); 
        createWall(120, 60, 10, 80, 30, 400, 0x554433);

        // "B Site" (Northwest)
        createWall(400, 60, 20, -700, 30, 800);  // B Back
        createWall(20, 60, 400, -900, 30, 600);  // B Side
        createWall(20, 60, 400, -500, 30, 600);  // B Entry wall
        createWall(200, 60, 20, -600, 30, 400);  // B Doors area

        // "Tunnels" (West)
        createWall(20, 60, 600, -600, 30, -200);  // Upper Tunnel Outer
        createWall(20, 60, 400, -400, 30, -100);  // Upper Tunnel Inner
        createWall(200, 60, 20, -500, 30, 100);   // Lower Tunnel connection
        
        // Roofs for Tunnels (Darker)
        createWall(200, 5, 600, -500, 60, -200, 0x333333); 

        // Strategic Crates
        // Mid
        createCrate(25, 0, 12.5, 150); // Xbox
        createCrate(20, 140, 10, -100);
        
        // A Site
        createCrate(20, 600, 20, 800); 
        createCrate(20, 620, 20, 800);
        
        // B Site
        createCrate(20, -700, 10, 700);
        createCrate(20, -700, 30, 700);
        createCrate(20, -720, 10, 700);

        // Long A
        createCrate(25, 550, 12.5, -300);
        createCrate(25, 550, 37.5, -300);

        // Random Scatter for extra cover
        for(let i=0; i<40; i++) {
            createCrate(20, Math.random()*2400-1200, 10, Math.random()*2400-1200);
        }

        // Enemies
        if (botsEnabled && !peer) { // Only spawn bots if enabled AND not in a network session
            for (let i = 0; i < 30; i++) {
                const enemy = new THREE.Group();
                const humanoid = createHumanoidModel(0x556b2f, 0xdbac82);
                enemy.add(humanoid);

                // Gun
                const enemyGun = createGunModel(false);
                enemyGun.scale.set(15, 15, 15); 
                enemyGun.position.set(4, 13.5, 7); // Pulled closer to body
                enemyGun.rotation.y = Math.PI; 
                enemy.add(enemyGun);

                // Adjust arms for a more tucked tactical grip
                humanoid.children.forEach(part => {
                    if (part.name === "rightArm") {
                        // Point forward and slightly in
                        part.rotation.x = -Math.PI / 2.5;
                        part.position.set(4.5, 17.5, 0); 
                        part.scale.y = 1.2; 
                    }
                    if (part.name === "leftArm") {
                        // Reach across to support the body
                        part.rotation.x = -Math.PI / 2.8;
                        part.rotation.z = 0.6;
                        part.position.set(-4.5, 17.5, 0); 
                        part.scale.y = 1.4; 
                    }
                });

                enemy.position.set(Math.random() * 1800 - 900, 0, Math.random() * 1800 - 900);
                
                // Add to scene
                scene.add(enemy);
                
                // Mark humanoid parts for collision/shooting
                humanoid.children.forEach(part => {
                    part.userData.isEnemy = true;
                    part.userData.parentEnemy = enemy;
                    part.userData.isSolid = true;
                    
                    // Simple Box3 for each part - might be slightly off due to group, 
                    // but good enough for hits. We'll update world bounds in animate or just once.
                    part.updateMatrixWorld(true);
                    part.userData.boundingBox = new THREE.Box3().setFromObject(part);

                    // Check if it's the head for headshots (based on position)
                    if (part.position.y > 18) {
                        part.userData.isHeadshot = true;
                    }
                    objects.push(part);
                });

                enemy.userData.health = 100;
                enemy.userData.alive = true;
                
                // Roaming state
                enemy.userData.targetPos = new THREE.Vector3(
                    Math.random() * 1800 - 900,
                    0,
                    Math.random() * 1800 - 900
                );
                enemy.userData.roamTimer = Math.random() * 5000 + 2000; // Time until new target
                enemy.userData.walkCycle = 0;
                
                enemies.push(enemy);
            }
        }

        // Gun Model (Grouped)
        gun = createGunModel(true);
        
        // Muzzle Flash (Add to the new gun model)
        muzzleFlash = new THREE.Group();
        muzzleFlash.visible = false;
        
        const flashGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        muzzleFlash.add(new THREE.Mesh(flashGeo, flashMat));
        
        muzzleLight = new THREE.PointLight(0xffaa00, 1, 10);
        muzzleFlash.add(muzzleLight);
        muzzleFlash.position.set(0, 0.02, -0.45);
        gun.add(muzzleFlash);

        gun.position.copy(restPos); 
        camera.add(gun);

        // Knife Model
        knife = createKnifeModel();
        knife.position.set(0.3, -0.4, -0.4);
        knife.visible = false;
        camera.add(knife);

        // Player Body (visible when looking down)
        const playerBody = createHumanoidModel(0x222222, 0xdbac82);
        playerBody.position.set(0, -18, 0); // Position below the camera
        // Hide the head of the player's own body to avoid clipping with camera
        playerBody.children.forEach(child => {
            if (child.position.y > 18) child.visible = false;
        });
        camera.add(playerBody);

        updateUI();

        // Shooting & Aiming
        document.addEventListener('mousedown', (e) => {
            if (controls.isLocked) {
                if (e.button === 0) { // Left click: Action
                    if (currentWeapon === 'gun') {
                        if (ammoInClip > 0 && !isReloading) {
                            shoot();
                            ammoInClip--;
                            updateUI();
                            
                            recoil = isAiming ? 0.05 : 0.1; // Reduced recoil while aiming
                            cameraRecoilX = 0.02;
                            
                            muzzleFlash.visible = true;
                            setTimeout(() => muzzleFlash.visible = false, 50);
                            
                            crosshair.classList.add('firing');
                            setTimeout(() => crosshair.classList.remove('firing'), 100);
                        } else if (ammoInClip <= 0 && !isReloading) {
                            reload();
                        }
                    } else if (currentWeapon === 'knife') {
                        knifeAttack();
                    }
                } else if (e.button === 2) { // Right click: Aim
                    if (currentWeapon === 'gun') {
                        isAiming = true;
                    }
                }
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                isAiming = false;
            }
        });

        // Prevent context menu on right click
        document.addEventListener('contextmenu', (e) => e.preventDefault());

        window.addEventListener('resize', onWindowResize);
        console.log("Renderer appended and scene ready.");
    } catch (error) {
        console.error("Initialization failed:", error);
        document.getElementById('instructions').innerHTML = "<h1>Error initializing 3D environment</h1><p>" + error.message + "</p>";
    }
}

function takeDamage(amount) {
    if (health <= 0) return;
    health -= amount;
    if (health < 0) health = 0;
    updateUI();
    
    if (damageFlash) {
        damageFlash.classList.add('active');
        setTimeout(() => damageFlash.classList.remove('active'), 100);
    }
    
    if (health === 0) {
        console.log("GAME OVER");
        document.getElementById('instructions').innerHTML = "<h1>GAME OVER</h1><p>Click to restart</p>";
        document.getElementById('instructions').style.display = 'block';
        controls.unlock();
        // Reset health for restart
        health = 100;
        ammoInClip = 30;
        ammoTotal = 90;
        updateUI();
    }
}

function updateScoreboard() {
    const scoreList = document.getElementById('score-list');
    if (!scoreList) return;

    // Preserve header
    scoreList.innerHTML = `
        <div class="score-header">
            <span>PLAYER</span>
            <span>KILLS</span>
        </div>
    `;

    // Helper for safe row creation
    const createRow = (name, kills, isLocal) => {
        const row = document.createElement('div');
        row.className = isLocal ? 'score-row local' : 'score-row';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = name; // SAFE
        
        const killsSpan = document.createElement('span');
        killsSpan.textContent = kills; // SAFE
        
        row.appendChild(nameSpan);
        row.appendChild(killsSpan);
        return row;
    };

    // Add local player
    scoreList.appendChild(createRow(`${playerName} (YOU)`, playerKills, true));

    // Add network players
    for (const id in networkScores) {
        const player = networkScores[id];
        scoreList.appendChild(createRow(player.name, player.kills, false));
    }
}

function updateUI() {
    if (healthUI) healthUI.innerText = `${Math.ceil(health)} HP`;
    if (ammoUI) ammoUI.innerText = `${ammoInClip} / ${ammoTotal}`;
    
    // Only show bot counter in Solo Deathmatch
    if (selectedMode === 'dm' && !peer && killStatsUI && aliveCountUI) {
        killStatsUI.style.display = 'block';
        const count = enemies.filter(e => e.userData.alive).length;
        aliveCountUI.innerText = count;
    } else if (killStatsUI) {
        killStatsUI.style.display = 'none';
    }
}

function reload() {
    if (isReloading || ammoInClip === 20 || ammoTotal === 0) return;

    console.log("Reloading...");
    isReloading = true;
    reloadStartTime = performance.now();
    ammoUI.innerText = "RELOADING...";
    
    // Simulate reload time (Glock is ~2.3s)
    const duration = 2300;
    setTimeout(() => {
        const needed = 20 - ammoInClip;
        const toLoad = Math.min(needed, ammoTotal);
        ammoInClip += toLoad;
        ammoTotal -= toLoad;
        isReloading = false;
        reloadOffset = 0;
        updateUI();
        console.log("Reload complete");
    }, duration);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function createBloodSplatter(position) {
    const particleCount = 8;
    const geo = new THREE.SphereGeometry(0.5, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xaa0000 });

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(geo, mat.clone());
        particle.position.copy(position);
        
        // Random velocity
        particle.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() * 5) + 2,
            (Math.random() - 0.5) * 10
        );
        particle.userData.life = 1.0; // Life from 1.0 to 0.0

        scene.add(particle);
        bloodParticles.push(particle);
    }
}

let knifeAttackProgress = 0;
let isKnifeAttacking = false;

function knifeAttack() {
    if (isKnifeAttacking) return;
    
    isKnifeAttacking = true;
    knifeAttackProgress = 0;

    const knifeRaycaster = new THREE.Raycaster();
    knifeRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    knifeRaycaster.far = 25; // Short range

    const intersects = knifeRaycaster.intersectObjects(objects);

    if (intersects.length > 0) {
        const hitPart = intersects[0].object;
        const enemy = hitPart.userData.parentEnemy;

        if (hitPart.userData.isEnemy && enemy.userData.alive) {
            createBloodSplatter(intersects[0].point);
            enemy.userData.health -= 50; // High damage for knife
            
            if (enemy.userData.health <= 0) {
                killEnemy(enemy);
            }
        }
    }

    // Reset attacking state after animation
    setTimeout(() => {
        isKnifeAttacking = false;
    }, 300);
}

function shoot() {
    const shootRaycaster = new THREE.Raycaster();
    shootRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const intersects = shootRaycaster.intersectObjects(objects);

    if (intersects.length > 0) {
        const hitPart = intersects[0].object;
        
        // Handle Bot hits
        if (hitPart.userData.isEnemy && hitPart.userData.parentEnemy) {
            const enemy = hitPart.userData.parentEnemy;
            if (enemy.userData.alive) {
                createBloodSplatter(intersects[0].point);
                let damage = 20; // Glock body damage
                if (hitPart.userData.isHeadshot) damage = 100;
                enemy.userData.health -= damage;
                
                const originalColor = hitPart.material.color.clone();
                hitPart.material.color.set(0xffffff);
                setTimeout(() => {
                    if (enemy.userData.alive) hitPart.material.color.copy(originalColor);
                }, 50);

                if (enemy.userData.health <= 0) killEnemy(enemy);
            }
        }
        
        // Handle Remote Player hits
        else if (hitPart.userData.isEnemy && hitPart.userData.parentPlayerId) {
            createBloodSplatter(intersects[0].point);
            let damage = 20; // Glock body damage
            if (hitPart.userData.isHeadshot) damage = 100;
            
            // Send hit to the specific player
            broadcastHit(hitPart.userData.parentPlayerId, damage);
        }
    }
}

function broadcastHit(targetId, damage) {
    if (connections.length > 0) {
        const data = {
            type: 'player-hit',
            targetId: targetId,
            damage: damage
        };
        connections.forEach(conn => {
            if (conn.open) conn.send(data);
        });
    }
}

function killEnemy(enemy) {
    enemy.userData.alive = false;

    // --- DISABLE COLLISION FOR DEAD BODY ---
    enemy.children.forEach(child => {
        if (child instanceof THREE.Group) { // Humanoid group
            child.children.forEach(part => {
                part.userData.isSolid = false;
            });
        }
    });

    // --- DROP GUN PICKUP ---
    // Find the gun in enemy children
    let gunModel = null;
    enemy.children.forEach(child => {
        // We know the gun is a group we added
        if (child instanceof THREE.Group && !child.userData.isEnemy) {
            gunModel = child;
        }
    });

    if (gunModel) {
        // Create a pickup version
        const pickup = createGunModel(false);
        pickup.scale.set(15, 15, 15);
        pickup.position.copy(enemy.position);
        pickup.position.y = 1; // Sit flat on ground
        pickup.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2); // Lay flat on its side
        
        pickup.userData.ammoAmount = 30; // Amount given on pickup
        scene.add(pickup);
        droppedGuns.push(pickup);

        // Despawn pickup after 2 minutes (120,000ms)
        setTimeout(() => {
            if (droppedGuns.includes(pickup)) {
                // Fade out and remove
                let fadeStart = performance.now();
                function fadePickup() {
                    let elapsed = performance.now() - fadeStart;
                    let progress = elapsed / 1000; // 1 second fade
                    if (progress < 1) {
                        pickup.children.forEach(child => {
                            if (child.material) {
                                child.material.transparent = true;
                                child.material.opacity = 1 - progress;
                            }
                        });
                        requestAnimationFrame(fadePickup);
                    } else {
                        scene.remove(pickup);
                        const idx = droppedGuns.indexOf(pickup);
                        if (idx > -1) droppedGuns.splice(idx, 1);
                    }
                }
                fadePickup();
            }
        }, 120000);
        
        // Hide the original gun on the dead body
        gunModel.visible = false;
    }

    // Death animation (fall over)
    enemy.rotation.x = -Math.PI / 2;
    enemy.position.y = 1; // Lie flat on ground
    
    // Change color to indicate death and enable transparency for fade out
    enemy.children.forEach(part => {
        if (part.material) {
            part.material = part.material.clone(); // Clone to avoid affecting other meshes
            part.material.color.set(0x333333);
            part.material.transparent = true;
        }
    });
    
    updateUI(); // Refresh count
    
    // Score update
    playerKills++;
    broadcastScore();
    console.log("Enemy eliminated");

    // Despawn after 5 seconds
    setTimeout(() => {
        let fadeTime = 1000; // 1 second fade
        let start = performance.now();
        
        function fadeOut() {
            let elapsed = performance.now() - start;
            let progress = elapsed / fadeTime;
            
            if (progress < 1) {
                enemy.children.forEach(part => {
                    if (part.material) part.material.opacity = 1 - progress;
                });
                requestAnimationFrame(fadeOut);
            } else {
                // Final removal
                scene.remove(enemy);
                
                // Remove body parts from 'objects' array to clean up collision/shooting
                enemy.children.forEach(part => {
                    const idx = objects.indexOf(part);
                    if (idx > -1) objects.splice(idx, 1);
                });

                // Remove from enemies array
                const eIdx = enemies.indexOf(enemy);
                if (eIdx > -1) enemies.splice(eIdx, 1);
            }
        }
        fadeOut();
    }, 5000);
}

function animate() {
    requestAnimationFrame(animate);

    if (!renderer || !scene || !camera) return;

    const time = performance.now();

    if (controls.isLocked === true) {
        raycaster.ray.origin.copy(camera.position);
        // The raycaster is already pointing down, so it will hit objects below the eye height

        const intersections = raycaster.intersectObjects(objects, false);
        const onObject = intersections.length > 0;

        const delta = (time - prevTime) / 1000;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta; // 100.0 = mass

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const moveSpeed = isCrouching ? 200.0 : 400.0;
        if (moveForward || moveBackward) velocity.z -= direction.z * moveSpeed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * moveSpeed * delta;

        if (onObject === true) {
            velocity.y = Math.max(0, velocity.y);
            canJump = true;
        }

        // --- COLLISION DETECTION (SLIDING) ---
        const playerRadius = 4.0; 
        const moveX = -velocity.x * delta;
        const moveZ = -velocity.z * delta;

        // Helper for collision
        const checkCollisionAt = (pos) => {
            // Create a bounding box for the player at the candidate position
            // Player height is 18, so box goes from pos.y - 18 to pos.y
            const playerBox = new THREE.Box3(
                new THREE.Vector3(pos.x - playerRadius, pos.y - 18, pos.z - playerRadius),
                new THREE.Vector3(pos.x + playerRadius, pos.y, pos.z + playerRadius)
            );

            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];
                if (obj.userData.isSolid) {
                    const box = obj.userData.boundingBox;
                    if (box) {
                        // Check if player's body height overlaps the object
                        if (playerBox.min.y < (box.max.y - 1) && playerBox.max.y > box.min.y) {
                            if (playerBox.intersectsBox(box)) return true;
                        }
                    }
                }
            }
            return false;
        };

        // Sub-stepping movement
        const steps = 5;
        const stepX = moveX / steps;
        const stepZ = moveZ / steps;

        for (let s = 0; s < steps; s++) {
            // 1. Try X movement
            const oldPos = camera.position.clone();
            controls.moveRight(stepX);
            if (checkCollisionAt(camera.position)) {
                camera.position.copy(oldPos); // Revert FULL position
            }

            // 2. Try Z movement
            const midPos = camera.position.clone();
            controls.moveForward(stepZ);
            if (checkCollisionAt(camera.position)) {
                camera.position.copy(midPos); // Revert FULL position
            }
        }

        camera.position.y += (velocity.y * delta);

        const currentTargetHeight = isCrouching ? crouchingHeight : standingHeight;
        if (camera.position.y <= currentTargetHeight + 0.1 && canJump) {
            // Smoothly lerp height when on ground
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, currentTargetHeight, 0.2);
            velocity.y = 0;
            canJump = true;
        }

        if (camera.position.y < currentTargetHeight) {
            velocity.y = 0;
            camera.position.y = currentTargetHeight;
            canJump = true;
        }
    }

    prevTime = time;

    // Gun animations
    if (gun) {
        // Recoil recovery
        recoil = THREE.MathUtils.lerp(recoil, 0, 0.1);
        
        // ADS Transition
        const adsSpeed = 0.15;
        if (isAiming && !isReloading) {
            adsProgress = THREE.MathUtils.lerp(adsProgress, 1, adsSpeed);
        } else {
            adsProgress = THREE.MathUtils.lerp(adsProgress, 0, adsSpeed);
        }

        // Lerp gun position between rest and ADS
        const currentTargetPos = new THREE.Vector3().lerpVectors(restPos, adsPos, adsProgress);
        gun.position.copy(currentTargetPos);
        
        // Apply recoil and reload offsets
        gun.position.z += recoil;
        gun.position.y += (recoil * 0.5);

        // Reload animation offset
        if (isReloading) {
            const duration = 2300;
            const elapsed = time - reloadStartTime;
            const progress = elapsed / duration;
            const targetY = -0.5;

            if (progress < 0.5) {
                reloadOffset = THREE.MathUtils.lerp(0, targetY, progress * 2);
            } else if (progress < 1) {
                reloadOffset = THREE.MathUtils.lerp(targetY, 0, (progress - 0.5) * 2);
            } else {
                reloadOffset = 0;
            }
        } else {
            reloadOffset = THREE.MathUtils.lerp(reloadOffset, 0, 0.1);
        }
        gun.position.y += reloadOffset;

        // FOV Zoom while aiming
        camera.fov = settings.fov - (adsProgress * 15);
        camera.updateProjectionMatrix();

        // Crosshair visibility
        if (crosshair) {
            crosshair.style.opacity = 1 - (adsProgress * 0.8); // Fade out but maybe keep a hint
        }
    }
    
    // Apply temporary recoil offset and then render
    const originalRotationX = camera.rotation.x;
    if (cameraRecoilX > 0.001) {
        cameraRecoilX = THREE.MathUtils.lerp(cameraRecoilX, 0, 0.15);
        camera.rotation.x += cameraRecoilX;
    }

    // Knife animation
    if (knife && currentWeapon === 'knife') {
        if (isKnifeAttacking) {
            knifeAttackProgress += 0.2;
            if (knifeAttackProgress > Math.PI) knifeAttackProgress = Math.PI;
            
            const stabDepth = Math.sin(knifeAttackProgress) * 0.4;
            knife.position.set(0.1, -0.4, -0.4 - stabDepth);
        } else {
            // Resting position
            knife.position.lerp(new THREE.Vector3(0.1, -0.4, -0.4), 0.1);
        }
    }

    // Enemy AI & Roaming
    enemies.forEach(enemy => {
        if (enemy.userData.alive) {
            // Face the player if close, otherwise face movement direction
            const distToPlayer = enemy.position.distanceTo(camera.position);
            
            if (distToPlayer < 100) {
                enemy.lookAt(camera.position.x, 0, camera.position.z);
                
                // Stand still
                const humanoid = enemy.children[0];
                humanoid.children.forEach(part => {
                    if (part.name === "rightLeg" || part.name === "leftLeg") {
                        part.rotation.x = THREE.MathUtils.lerp(part.rotation.x, 0, 0.1);
                    }
                });
            } else {
                // ROAMING
                const target = enemy.userData.targetPos;
                const moveDir = new THREE.Vector3().subVectors(target, enemy.position);
                moveDir.y = 0;
                
                if (moveDir.length() < 5 || enemy.userData.roamTimer <= 0) {
                    // New target
                    enemy.userData.targetPos = new THREE.Vector3(
                        Math.random() * 1800 - 900,
                        0,
                        Math.random() * 1800 - 900
                    );
                    enemy.userData.roamTimer = Math.random() * 10000 + 5000;
                } else {
                    // Move towards target
                    moveDir.normalize();
                    const walkSpeed = 0.5;
                    const oldPos = enemy.position.clone();
                    enemy.position.add(moveDir.clone().multiplyScalar(walkSpeed));
                    
                    // Walking Animation
                    enemy.userData.walkCycle += 0.1;
                    const swing = Math.sin(enemy.userData.walkCycle) * 0.5;
                    
                    const humanoid = enemy.children[0];
                    humanoid.children.forEach(part => {
                        if (part.name === "rightLeg") part.rotation.x = swing;
                        if (part.name === "leftLeg") part.rotation.x = -swing;
                    });

                    // Collision check for bot
                    const enemyRadius = 4.0;
                    const enemyBox = new THREE.Box3(
                        new THREE.Vector3(enemy.position.x - enemyRadius, 0, enemy.position.z - enemyRadius),
                        new THREE.Vector3(enemy.position.x + enemyRadius, 18, enemy.position.z + enemyRadius)
                    );

                    let collided = false;
                    for (let i = 0; i < objects.length; i++) {
                        const obj = objects[i];
                        // Check against walls and crates (not self or other bots)
                        if (obj.userData.isSolid && !obj.userData.isEnemy) {
                            const box = obj.userData.boundingBox;
                            if (box && enemyBox.intersectsBox(box)) {
                                collided = true;
                                break;
                            }
                        }
                    }

                    if (collided) {
                        enemy.position.copy(oldPos);
                        enemy.userData.roamTimer = 0; // Force new target on next frame
                    } else {
                        // Look where moving
                        const lookPos = enemy.position.clone().add(moveDir);
                        enemy.lookAt(lookPos.x, 0, lookPos.z);
                        
                        // IMPORTANT: Update body part bounding boxes for player-vs-bot collision & shooting
                        enemy.children.forEach(child => {
                            if (child instanceof THREE.Group) { // The humanoid group
                                child.children.forEach(part => {
                                    if (part.userData.isSolid) {
                                        part.updateMatrixWorld(true);
                                        part.userData.boundingBox.setFromObject(part);
                                    }
                                });
                            }
                        });
                    }
                    
                    enemy.userData.roamTimer -= 16;
                }
            }
            
            // Randomly shoot back (DISABLED FOR NOW)
            /*
            if (Math.random() < 0.005) { // Adjusted chance
                const dist = enemy.position.distanceTo(camera.position);
                if (dist < 200) {
                    takeDamage(5); // Increased damage for fewer shots
                }
            }
            */
        }
    });

    // Blood Particles animation
    for (let i = bloodParticles.length - 1; i >= 0; i--) {
        const p = bloodParticles[i];
        p.position.add(p.userData.velocity.clone().multiplyScalar(0.016)); // Simple step
        p.userData.velocity.y -= 0.5; // Gravity
        p.userData.life -= 0.02;
        p.material.opacity = p.userData.life;
        p.material.transparent = true;

        if (p.userData.life <= 0) {
            scene.remove(p);
            bloodParticles.splice(i, 1);
        }
    }

    // Dropped Guns animation & Pickup
    for (let i = droppedGuns.length - 1; i >= 0; i--) {
        const gunPickup = droppedGuns[i];
        
        // Use 2D distance (X and Z) to ignore height differences
        const dx = camera.position.x - gunPickup.position.x;
        const dz = camera.position.z - gunPickup.position.z;
        const dist2D = Math.sqrt(dx * dx + dz * dz);

        if (dist2D < 15) {
            // Pickup!
            ammoTotal += gunPickup.userData.ammoAmount;
            updateUI();
            
            scene.remove(gunPickup);
            droppedGuns.splice(i, 1);
            console.log("Picked up 30 ammo!");
        }
    }

    renderer.render(scene, camera);
    
    // Broadcast position to others
    if (connections.length > 0 && isGameStarted) {
        const transformData = {
            type: 'transform',
            name: playerName,
            pos: camera.position,
            rot: {
                y: camera.rotation.y
            }
        };
        connections.forEach(conn => {
            if (conn.open) conn.send(transformData);
        });
    }
    
    // Restore rotation so it doesn't drift permanently
    camera.rotation.x = originalRotationX;
}
