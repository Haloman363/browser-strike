import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { COLORS, PHYSICS, WEAPON_SETTINGS } from './src/Constants.js';
import { createHumanoidModel, createGunModel, createKnifeModel, createGrenadeModel, createWall, createCrate } from './src/Factory.js';
import { GameState } from './src/GameState.js';
import { UI } from './src/UI.js';
import { checkCollisionAt } from './src/Physics.js';
import { createBloodSplatter } from './src/Weapon.js';
import { updateBotAI, updateRagdoll } from './src/AI.js';

console.log("Script starting...");

let camera, scene, renderer, controls;
const objects = [];
let raycaster;
const enemies = [];
const bloodParticles = [];
const droppedGuns = [];
const activeGrenades = [];

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

let gun, knife, grenade, muzzleFlash, muzzleLight;
let currentWeapon = 'gun'; // 'gun', 'knife', or 'grenade'
let currentSlot = 2;
const inventory = {
    1: { type: 'knife', model: null },
    2: { type: 'gun', model: null },
    3: { type: 'none', model: null },
    4: { type: 'grenade', model: null },
    5: { type: 'special', model: null }
};
let recoil = 0;
let cameraRecoilX = 0;
const restPos = new THREE.Vector3(0.25, -0.3, -0.5);
const adsPos = new THREE.Vector3(0, -0.125, -0.4); // Perfectly centered on X
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
let teamsEnabled = false;
let playerTeam = 'A'; // 'A' or 'B'
let teamScores = { A: 0, B: 0 };
let botsEnabled = true;
let isGameStarted = false;
let gameTimeLeft = 600; // 10 minutes in seconds
let gameTimerInterval = null;
let isPlayerDead = false;

// Grenade Interaction
let isGrenadeCooking = false;
let grenadeCookStartTime = 0;
const GRENADE_FUSE = 3000; // 3 seconds

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

// Settings managed by UI.js
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

camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 2000);
controls = new PointerLockControls(camera, renderer.domElement);

setupMenu();

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
    const teamsToggles = document.querySelectorAll('#teams-toggle .option, #mp-teams-toggle .option');
    const teamSelectors = document.querySelectorAll('.team-selector');
    const teamSelectOptions = document.querySelectorAll('#solo-team-select .option, #mp-host-team-select .option, #mp-join-team-select .option');

    // Teams Toggle
    teamsToggles.forEach(opt => {
        opt.addEventListener('click', () => {
            const val = opt.dataset.value === 'true';
            // Sync all team toggles
            teamsToggles.forEach(o => {
                if (o.dataset.value === opt.dataset.value) o.classList.add('active');
                else o.classList.remove('active');
            });
            
            teamsEnabled = val;
            teamSelectors.forEach(s => s.style.display = teamsEnabled ? 'block' : 'none');
            broadcastLobbySettings();
        });
    });

    // Team Selection
    teamSelectOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            const team = opt.dataset.value;
            // Sync all team selections for the user (Solo, Host, or Join)
            teamSelectOptions.forEach(o => {
                if (o.dataset.value === team) o.classList.add('active');
                else o.classList.remove('active');
            });
            playerTeam = team;
            // No need to broadcast here, we send team with transform or score
        });
    });

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
            UI.saveSettings({ playerName });
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
                mode: selectedMode,
                teamsEnabled: teamsEnabled
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
        document.getElementById('inventory').style.display = 'flex';
        
        if (!isGameStarted) {
            init();
            animate();
            isGameStarted = true;
            if (selectedMode === 'dm') {
                startTimer();
            }
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
            kills: playerKills,
            team: playerTeam
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
                if (data.teamsEnabled !== undefined) {
                    teamsEnabled = data.teamsEnabled;
                    const teamSelectors = document.querySelectorAll('.team-selector');
                    teamSelectors.forEach(s => s.style.display = teamsEnabled ? 'block' : 'none');
                }
                const statusText = document.getElementById('mp-status');
                if (statusText) statusText.innerText = `CONNECTED! (${selectedMap.toUpperCase()} - ${selectedMode.toUpperCase()})${teamsEnabled ? ' [TEAMS]' : ''}`;
            }
        } else if (data.type === 'score-update') {
            if (typeof data.name === 'string' && typeof data.kills === 'number') {
                // Sanitize remote name just in case
                const safeName = data.name.replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, 12);
                networkScores[conn.peer] = {
                    name: safeName || "Player",
                    kills: data.kills,
                    team: data.team || 'A'
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
        // Determine color based on team
        let clothColor = 0x0000ff; // Blue
        if (teamsEnabled) {
            if (data.team === 'B') clothColor = 0xff0000; // Red
        }

        // Spawn new model for this player
        const model = createHumanoidModel(clothColor, 0xdbac82); 
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

        // Simple Nametag
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.font = 'bold 32px Arial';
        
        ctx.fillStyle = 'white';
        if (teamsEnabled) {
            ctx.fillStyle = data.team === 'B' ? '#ff8888' : '#8888ff';
        }
        
        ctx.textAlign = 'center';
        ctx.fillText(data.name || "Player", 128, 45);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.name = "nametag";
        sprite.scale.set(10, 2.5, 1);
        sprite.position.y = 25; // Above head
        model.add(sprite);
    }
    
    const model = networkPlayers[id];
    
    // Update color if team changed
    if (teamsEnabled) {
        const expectedColor = data.team === 'B' ? 0xff0000 : 0x0000ff;
        model.children.forEach(part => {
            if (part.name !== "nametag" && part.material && part.material.color && !part.userData.isSkin) {
                if (part.material.color.getHex() !== expectedColor) {
                    part.material.color.setHex(expectedColor);
                }
            }
        });
    }

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

function switchWeapon(slot) {
    if (slot === currentSlot || !inventory[slot] || inventory[slot].type === 'none') return;
    if (isReloading) return;

    // Hide all first to be safe
    if (gun) gun.visible = false;
    if (knife) knife.visible = false;
    if (grenade) grenade.visible = false;

    // Show new
    currentSlot = slot;
    currentWeapon = inventory[slot].type;
    const item = inventory[slot];
    if (item.model) item.model.visible = true;

    // Update UI
    document.querySelectorAll('.inventory-slot').forEach(s => s.classList.remove('active'));
    const slotEl = document.getElementById(`slot-${slot}`);
    if (slotEl) slotEl.classList.add('active');

    // Reset weapon states
    isAiming = false;
    adsProgress = 0;
    recoil = 0;
    
    updateUI();
}

function init() {
    console.log("Initializing scene...");
    
    // Reset Game State
    playerKills = 0;
    networkScores = {};
    health = 100;
    ammoInClip = 20;
    ammoTotal = 120;
    isPlayerDead = false;
    
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

        const loaded = UI.loadSettings();
        if (loaded) {
            settings = loaded;
            playerName = settings.playerName || "Noob";
        }

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
            UI.saveSettings(settings);
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

        document.getElementById('respawn-overlay').addEventListener('click', () => {
            if (isPlayerDead) {
                respawnPlayer();
            }
        });

        document.getElementById('game-over-quit').addEventListener('click', () => {
            window.location.reload();
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
                    switchWeapon(1);
                    break;
                case 'Digit2':
                    switchWeapon(2);
                    break;
                case 'Digit3':
                    switchWeapon(3);
                    break;
                case 'Digit4':
                    switchWeapon(4);
                    break;
                case 'Digit5':
                    switchWeapon(5);
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
        createWall(3000, 80, 20, 0, 40, -1500, COLORS.WALL_DEFAULT, scene, objects); // Back
        createWall(3000, 80, 20, 0, 40, 1500, COLORS.WALL_DEFAULT, scene, objects);  // Front
        createWall(20, 80, 3000, -1500, 40, 0, COLORS.WALL_DEFAULT, scene, objects); // Left
        createWall(20, 80, 3000, 1500, 40, 0, COLORS.WALL_DEFAULT, scene, objects);  // Right

        // "T-Spawn" Area (South)
        createWall(400, 60, 20, 0, 30, -1200, COLORS.WALL_DEFAULT, scene, objects); // T-Spawn back wall
        createWall(20, 60, 400, -200, 30, -1000, COLORS.WALL_DEFAULT, scene, objects); 
        createWall(20, 60, 400, 200, 30, -1000, COLORS.WALL_DEFAULT, scene, objects);

        // "Long A" Pathway (East)
        createWall(20, 60, 800, 600, 30, -400, COLORS.WALL_DEFAULT, scene, objects);  // Long A outer wall
        createWall(20, 60, 600, 400, 30, -300, COLORS.WALL_DEFAULT, scene, objects);  // Long A inner wall
        createWall(200, 60, 20, 500, 30, 0, COLORS.WALL_DEFAULT, scene, objects);     // Long A corner (Blue box area)
        createWall(20, 60, 400, 700, 30, 400, COLORS.WALL_DEFAULT, scene, objects);   // Pathway to A site
        
        // "Pit" Area
        createWall(200, 20, 200, 600, 10, -800, 0x8b7355, scene, objects); // Pit walls
        createWall(20, 40, 200, 500, 20, -800, COLORS.WALL_DEFAULT, scene, objects);

        // "A Site" (Northeast)
        createWall(300, 20, 300, 600, 10, 800, 0xaaaaaa, scene, objects); // Site platform
        createWall(20, 60, 300, 450, 30, 800, COLORS.WALL_DEFAULT, scene, objects);  // Short A wall
        createWall(300, 60, 20, 600, 30, 950, COLORS.WALL_DEFAULT, scene, objects);  // Site back wall

        // "Mid" Area (Center)
        createWall(20, 60, 400, -150, 30, -200, COLORS.WALL_DEFAULT, scene, objects); // Mid wall West
        createWall(20, 60, 400, 150, 30, -200, COLORS.WALL_DEFAULT, scene, objects);  // Mid wall East
        createWall(100, 60, 20, -100, 30, 200, COLORS.WALL_DEFAULT, scene, objects);  // Xbox area wall
        createWall(300, 60, 20, 0, 30, 400, COLORS.WALL_DEFAULT, scene, objects);     // Mid Doors boundary
        // Mid Doors
        createWall(120, 60, 10, -80, 30, 400, 0x554433, scene, objects); 
        createWall(120, 60, 10, 80, 30, 400, 0x554433, scene, objects);

        // "B Site" (Northwest)
        createWall(400, 60, 20, -700, 30, 800, COLORS.WALL_DEFAULT, scene, objects);  // B Back
        createWall(20, 60, 400, -900, 30, 600, COLORS.WALL_DEFAULT, scene, objects);  // B Side
        createWall(20, 60, 400, -500, 30, 600, COLORS.WALL_DEFAULT, scene, objects);  // B Entry wall
        createWall(200, 60, 20, -600, 30, 400, COLORS.WALL_DEFAULT, scene, objects);  // B Doors area

        // "Tunnels" (West)
        createWall(20, 60, 600, -600, 30, -200, COLORS.WALL_DEFAULT, scene, objects);  // Upper Tunnel Outer
        createWall(20, 60, 400, -400, 30, -100, COLORS.WALL_DEFAULT, scene, objects);  // Upper Tunnel Inner
        createWall(200, 60, 20, -500, 30, 100, COLORS.WALL_DEFAULT, scene, objects);   // Lower Tunnel connection
        
        // Roofs for Tunnels (Darker)
        createWall(200, 5, 600, -500, 60, -200, 0x333333, scene, objects); 

        // Strategic Crates
        // Mid
        createCrate(25, 0, 12.5, 150, scene, objects); // Xbox
        createCrate(20, 140, 10, -100, scene, objects);
        
        // A Site
        createCrate(20, 600, 20, 800, scene, objects); 
        createCrate(20, 620, 20, 800, scene, objects);
        
        // B Site
        createCrate(20, -700, 10, 700, scene, objects);
        createCrate(20, -700, 30, 700, scene, objects);
        createCrate(20, -720, 10, 700, scene, objects);

        // Long A
        createCrate(25, 550, 12.5, -300, scene, objects);
        createCrate(25, 550, 37.5, -300, scene, objects);

        // Random Scatter for extra cover
        for(let i=0; i<40; i++) {
            createCrate(20, Math.random()*2400-1200, 10, Math.random()*2400-1200, scene, objects);
        }

        // Enemies
        if (botsEnabled && !peer) { // Only spawn bots if enabled AND not in a network session
            for (let i = 0; i < 30; i++) {
                const enemy = new THREE.Group();
                
                let botTeam = 'A';
                let botColor = 0x556b2f;
                if (teamsEnabled) {
                    botTeam = i % 2 === 0 ? 'A' : 'B';
                    botColor = botTeam === 'A' ? 0x0000ff : 0xff0000;
                }

                const humanoid = createHumanoidModel(botColor, 0xdbac82);
                enemy.add(humanoid);
                enemy.userData.team = botTeam;

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
        knife = createKnifeModel(true);
        knife.position.set(0.3, -0.4, -0.4);
        knife.visible = false;
        camera.add(knife);

        // Grenade Model
        grenade = createGrenadeModel(true);
        grenade.position.set(0.3, -0.4, -0.4);
        grenade.visible = false;
        camera.add(grenade);

        // Assign to inventory
        inventory[1].model = knife;
        inventory[2].model = gun;
        inventory[4].model = grenade;

        // Player Body (visible when looking down)
        let playerBodyColor = 0x222222;
        if (teamsEnabled) {
            playerBodyColor = playerTeam === 'A' ? 0x0000ff : 0xff0000;
        }
        const playerBody = createHumanoidModel(playerBodyColor, 0xdbac82);
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
                    } else if (currentWeapon === 'grenade') {
                        startGrenadeCook();
                    }
                } else if (e.button === 2) { // Right click: Aim
                    if (currentWeapon === 'gun') {
                        isAiming = true;
                    }
                }
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                if (currentWeapon === 'grenade' && isGrenadeCooking) {
                    throwGrenade();
                }
            }
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
    if (health <= 0 || isPlayerDead) return;
    health -= amount;
    if (health < 0) health = 0;
    updateUI();
    
    if (damageFlash) {
        damageFlash.classList.add('active');
        setTimeout(() => damageFlash.classList.remove('active'), 100);
    }
    
    if (health === 0) {
        playerDie();
    }
}

function updateUI() {
    // Sync to GameState for UI.js
    GameState.health = health;
    GameState.ammoInClip = ammoInClip;
    GameState.ammoTotal = ammoTotal;
    GameState.isReloading = isReloading;
    GameState.selectedMode = selectedMode;
    GameState.gameTimeLeft = gameTimeLeft;
    GameState.currentWeapon = currentWeapon;
    GameState.playerKills = playerKills;
    GameState.playerName = playerName;
    GameState.teamsEnabled = teamsEnabled;
    GameState.playerTeam = playerTeam;
    GameState.networkScores = networkScores;
    GameState.peer = peer;
    GameState.isPlayerDead = isPlayerDead;
    GameState.isGameStarted = isGameStarted;
    GameState.isHost = isHost;

    UI.updateUI(enemies);
}

function startTimer() {
    if (gameTimerInterval) clearInterval(gameTimerInterval);
    gameTimeLeft = 600;
    gameTimerInterval = setInterval(() => {
        if (!controls.isLocked && !isHost) return; // Only tick if active or hosting
        
        gameTimeLeft--;
        updateUI();
        
        if (gameTimeLeft <= 0) {
            clearInterval(gameTimerInterval);
            endGame();
        }
    }, 1000);
}

function endGame() {
    isGameStarted = false;
    controls.unlock();
    UI.showGameOver();
}

function respawnPlayer() {
    isPlayerDead = false;
    health = 100;
    ammoInClip = 20;
    ammoTotal = 120;
    isReloading = false;
    
    // Reset position to a "spawn point" (could be random or fixed)
    camera.position.set(Math.random() * 200 - 100, 18, Math.random() * 200 - 100);
    velocity.set(0, 0, 0);
    
    document.getElementById('respawn-overlay').style.display = 'none';
    document.getElementById('crosshair').style.display = 'block';
    
    updateUI();
    controls.lock();
}

function playerDie() {
    isPlayerDead = true;
    controls.unlock();
    document.getElementById('respawn-overlay').style.display = 'flex';
    document.getElementById('crosshair').style.display = 'none';
    
    // If in multiplayer, broadcast death if needed (optional for now)
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

// Blood effects handled by Weapon.js

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
            createBloodSplatter(intersects[0].point, scene, bloodParticles);
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
            
            // Friendly Fire Check
            if (teamsEnabled && enemy.userData.team === playerTeam) {
                console.log("Teammate hit - no damage");
                return;
            }

            if (enemy.userData.alive) {
                createBloodSplatter(intersects[0].point, scene, bloodParticles);
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
            const remoteId = hitPart.userData.parentPlayerId;
            
            // Friendly Fire Check for remote players
            if (teamsEnabled && networkScores[remoteId] && networkScores[remoteId].team === playerTeam) {
                console.log("Teammate player hit - no damage");
                return;
            }

            createBloodSplatter(intersects[0].point, scene, bloodParticles);
            let damage = 20; // Glock body damage
            if (hitPart.userData.isHeadshot) damage = 100;
            
            // Send hit to the specific player
            broadcastHit(remoteId, damage);
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

function startGrenadeCook() {
    if (isGrenadeCooking) return;
    isGrenadeCooking = true;
    grenadeCookStartTime = performance.now();
    console.log("Pin pulled!");
    // You could play a sound here or add a visual pin drop
}

function throwGrenade() {
    if (!isGrenadeCooking) return;
    
    const now = performance.now();
    const elapsed = now - grenadeCookStartTime;
    const remainingFuse = GRENADE_FUSE - elapsed;

    if (remainingFuse <= 0) {
        // Exploded in hand!
        explode(camera.position.clone());
        takeDamage(100);
    } else {
        // Create the thrown grenade entity
        const thrownNade = createGrenadeModel(false); // Reuse the model (no arms)
        thrownNade.scale.set(10, 10, 10); // Scale up for world visibility
        thrownNade.position.copy(camera.position);
        
        // Add velocity
        const throwDirection = new THREE.Vector3();
        camera.getWorldDirection(throwDirection);
        
        const force = 100;
        const velocity = throwDirection.clone().multiplyScalar(force);
        velocity.y += 20; // Slight upward arc

        thrownNade.userData = {
            velocity: velocity,
            fuse: remainingFuse,
            isThrown: true
        };

        scene.add(thrownNade);
        activeGrenades.push(thrownNade);
    }

    isGrenadeCooking = false;
    // Visually hide viewmodel grenade temporarily (re-equipping logic)
    if (grenade) grenade.visible = false;
    
    // Auto-switch back to primary or knife after a delay if you want, 
    // or just let the player switch manually.
    setTimeout(() => {
        if (currentWeapon === 'grenade') {
            if (grenade) grenade.visible = true;
        }
    }, 1000);
}

function updateGrenades(delta) {
    for (let i = activeGrenades.length - 1; i >= 0; i--) {
        const nade = activeGrenades[i];
        const data = nade.userData;

        // Fuse
        data.fuse -= delta * 1000;
        if (data.fuse <= 0) {
            explode(nade.position.clone());
            scene.remove(nade);
            activeGrenades.splice(i, 1);
            continue;
        }

        // Gravity
        data.velocity.y -= 9.8 * 10 * delta;

        // Movement
        const nextPos = nade.position.clone().add(data.velocity.clone().multiplyScalar(delta));
        
        // Very simple ground/wall bounce
        let bounced = false;
        if (nextPos.y < 1) {
            nextPos.y = 1;
            data.velocity.y *= -0.4; // Bounce
            data.velocity.x *= 0.8; // Friction
            data.velocity.z *= 0.8;
            bounced = true;
        }

        // Check for wall collisions using raycasting from current to next
        const dir = data.velocity.clone().normalize();
        const dist = data.velocity.length() * delta;
        const ray = new THREE.Raycaster(nade.position, dir, 0, dist + 2);
        const intersects = ray.intersectObjects(objects);

        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.object.userData.isSolid) {
                // Reflect velocity based on normal
                const normal = hit.face.normal.clone().applyQuaternion(hit.object.quaternion);
                data.velocity.reflect(normal).multiplyScalar(0.5);
                bounced = true;
            }
        }

        if (!bounced) {
            nade.position.copy(nextPos);
        }

        // Rotation
        nade.rotation.x += delta * 5;
        nade.rotation.z += delta * 3;
    }
}

function explode(position) {
    console.log("BOOM!");

    // 1. Visual Effect (Expanding sphere + flash)
    const explosionGroup = new THREE.Group();
    explosionGroup.position.copy(position);
    scene.add(explosionGroup);

    // Expansion sphere
    const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8 });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    explosionGroup.add(sphere);

    // Light flash
    const light = new THREE.PointLight(0xff5500, 10, 100);
    explosionGroup.add(light);

    // Animation
    let start = performance.now();
    const duration = 500;
    function animateExplosion() {
        let elapsed = performance.now() - start;
        let progress = elapsed / duration;

        if (progress < 1) {
            const scale = progress * 30; // Grow to size 30
            sphere.scale.set(scale, scale, scale);
            sphere.material.opacity = 1 - progress;
            light.intensity = (1 - progress) * 10;
            requestAnimationFrame(animateExplosion);
        } else {
            scene.remove(explosionGroup);
        }
    }
    animateExplosion();

    // 2. Damage Logic
    const blastRadius = 50;
    
    // Damage enemies
    enemies.forEach(enemy => {
        if (enemy.userData.alive) {
            // Friendly Fire Check
            if (teamsEnabled && enemy.userData.team === playerTeam) return;

            const dist = enemy.position.distanceTo(position);
            if (dist < blastRadius) {
                const damage = (1 - (dist / blastRadius)) * 150; // Falloff damage
                enemy.userData.health -= damage;
                if (enemy.userData.health <= 0) killEnemy(enemy);
            }
        }
    });

    // Damage players (self)
    const distToPlayer = camera.position.distanceTo(position);
    if (distToPlayer < blastRadius) {
        const damage = (1 - (distToPlayer / blastRadius)) * 100;
        takeDamage(damage);
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

    // Initialize "Ragdoll" (Faux-physics collapse)
    enemy.userData.isRagdoll = true;
    
    // Find the humanoid group
    const humanoidGroup = enemy.children.find(c => c instanceof THREE.Group && c.children.some(p => p.userData.isEnemy));
    if (humanoidGroup) {
        humanoidGroup.children.forEach(part => {
            // Give each part a slight random "kick"
            part.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 1.5,
                (Math.random() * 2.0),
                (Math.random() - 0.5) * 1.5
            );
            part.userData.angularVelocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.2
            );
        });
    }
    
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
    let isEnemyKill = true;
    if (teamsEnabled && enemy.userData.team === playerTeam) {
        isEnemyKill = false;
    }

    if (isEnemyKill) {
        playerKills++;
        broadcastScore();
        console.log("Enemy eliminated");
    } else {
        console.log("Teammate eliminated (no points)");
    }

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
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked === true) {
        raycaster.ray.origin.copy(camera.position);
        // The raycaster is already pointing down, so it will hit objects below the eye height

        const intersections = raycaster.intersectObjects(objects, false);
        const onObject = intersections.length > 0;

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
        const steps = 4;
        const stepX = moveX / steps;
        const stepZ = moveZ / steps;

        for (let s = 0; s < steps; s++) {
            // 1. Try X movement
            const oldPos = camera.position.clone();
            controls.moveRight(stepX);
            if (checkCollisionAt(camera.position, objects)) {
                camera.position.copy(oldPos); // Revert FULL position
            }

            // 2. Try Z movement
            const midPos = camera.position.clone();
            controls.moveForward(stepZ);
            if (checkCollisionAt(camera.position, objects)) {
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

        // Grenade animation
        if (grenade && currentWeapon === 'grenade') {
            // Simple breathing/resting for now
            grenade.position.lerp(new THREE.Vector3(0.1, -0.4, -0.4), 0.1);
        }

        updateGrenades(delta);

        // Enemy AI & Roaming
        enemies.forEach(enemy => {
            if (enemy.userData.alive) {
                updateBotAI(enemy, camera, objects, delta);
            } else if (enemy.userData.isRagdoll) {
                updateRagdoll(enemy);
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

        // Broadcast position to others
        if (connections.length > 0 && isGameStarted) {
            const transformData = {
                type: 'transform',
                name: playerName,
                team: playerTeam,
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

    prevTime = time;
    renderer.render(scene, camera);
}
