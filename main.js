import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { COLORS, PHYSICS, WEAPON_SETTINGS, WEAPONS_DATA, GRENADES_DATA } from './src/Constants.js';
import { createHumanoidModel, createGunModel, createKnifeModel, createGrenadeModel, createWall, createCrate } from './src/Factory.js';
import { TextureGenerator } from './src/TextureGenerator.js';
import { GameState } from './src/GameState.js';
import { Maps } from './src/Maps.js';
import { UI } from './src/UI.js';
import { checkCollisionAt } from './src/Physics.js';
import { createBloodSplatter, createImpactEffect } from './src/Weapon.js';
import { updateBotAI, updateRagdoll } from './src/AI.js';
import { soundEngine } from './src/SoundEngine.js';

console.log("Script starting...");

let camera, scene, renderer, controls;
const objects = [];
let raycaster;
const enemies = [];
const bloodParticles = [];
const impactParticles = [];
const droppedGuns = [];
const activeGrenades = [];

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let isCrouching = false;
const standingHeight = PHYSICS.STANDING_HEIGHT;
const crouchingHeight = PHYSICS.CROUCHING_HEIGHT;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

let gun, knife, grenade, muzzleFlash, muzzleLight;
let currentWeapon = 'gun'; // 'gun', 'knife', or 'grenade'
let currentSlot = 2;
let currentWeaponData = WEAPONS_DATA['GLOCK'];

const inventory = {
    1: { type: 'knife', weaponKey: 'KNIFE', model: null },
    2: { type: 'gun', weaponKey: 'GLOCK', model: null, ammoInClip: 20, ammoTotal: 120 },
    3: { type: 'gun', weaponKey: 'AK47', model: null, ammoInClip: 30, ammoTotal: 90 },
    4: { type: 'grenade', weaponKey: 'HE', model: null, count: 1 },
    5: { type: 'special', model: null },
    6: { type: 'grenade', weaponKey: 'FLASH', model: null, count: 2 },
    7: { type: 'grenade', weaponKey: 'SMOKE', model: null, count: 1 },
    8: { type: 'grenade', weaponKey: 'MOLOTOV', model: null, count: 1 }
};

// Animation States
let recoil = 0;
let recoilRotation = 0;
let cameraRecoilX = 0;
let swayX = 0;
let swayY = 0;
let bobCounter = 0;
let lastBobCounter = 0;
let lastMouseX = 0;
let lastMouseY = 0;

const restPos = new THREE.Vector3(0.25, -0.3, -0.5);
const adsPos = new THREE.Vector3(0, -0.125, -0.4); // Perfectly centered on X
let isAiming = false;
let adsProgress = 0; // 0 to 1
let isFiring = false;
let lastFireTime = 0;
let currentNearPickup = null;
const crosshair = document.getElementById('crosshair');
const pickupPrompt = document.getElementById('pickup-prompt');

// Player Stats
let health = 100;
let ammoInClip = 20;
let ammoTotal = 120;
let grenadeCount = 2;
const MAX_GRENADES = 4;
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
let wasInAir = false;

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
let playerCash = 800;
let networkScores = {}; // peerId -> { name, kills }

// Settings State (with defaults)
let settings = {
    fov: 75,
    sensitivity: 1.0,
    viewDistance: 800,
    playerName: "Noob",
    showKillFeed: true
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
    // Initialize sound engine on first interaction
    const initSound = () => {
        soundEngine.init();
        window.removeEventListener('click', initSound);
        window.removeEventListener('keydown', initSound);
    };
    window.addEventListener('click', initSound);
    window.addEventListener('keydown', initSound);

    const startButton = document.getElementById('start-button');
    const mainMenu = document.getElementById('main-menu');
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
    const teamsToggles = document.querySelectorAll('#mp-teams-toggle .option');
    const teamSelectors = document.querySelectorAll('.team-selector');
    const teamSelectOptions = document.querySelectorAll('#mp-host-team-select .option, #mp-join-team-select .option');

    // Teams Toggle
    teamsToggles.forEach(opt => {
        opt.addEventListener('click', () => {
            soundEngine.playUIClick();
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
        opt.addEventListener('mouseenter', () => soundEngine.playUIHover());
    });

    // Team Selection
    teamSelectOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            soundEngine.playUIClick();
            const team = opt.dataset.value;
            // Sync all team selections for the user (Solo, Host, or Join)
            teamSelectOptions.forEach(o => {
                if (o.dataset.value === team) o.classList.add('active');
                else o.classList.remove('active');
            });
            playerTeam = team;
            // No need to broadcast here, we send team with transform or score
        });
        opt.addEventListener('mouseenter', () => soundEngine.playUIHover());
    });

    // Pre-fill and sync usernames
    const usernameInputs = document.querySelectorAll('.username-input');
    usernameInputs.forEach(input => {
        input.value = playerName;
        input.addEventListener('input', (e) => {
            soundEngine.playUIHover();
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
        soundEngine.playUIClick();
        mpInitialChoice.style.display = 'none';
        mpHostView.style.display = 'flex';
    });
    showHostViewBtn.addEventListener('mouseenter', () => soundEngine.playUIHover());

    showJoinViewBtn.addEventListener('click', () => {
        soundEngine.playUIClick();
        mpInitialChoice.style.display = 'none';
        mpJoinView.style.display = 'flex';
    });
    showJoinViewBtn.addEventListener('mouseenter', () => soundEngine.playUIHover());

    backBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            soundEngine.playUIClick();
            mpHostView.style.display = 'none';
            mpJoinView.style.display = 'none';
            mpInitialChoice.style.display = 'flex';
            statusText.innerText = "";
        });
        btn.addEventListener('mouseenter', () => soundEngine.playUIHover());
    });

    // MP Host Lobby Settings
    mpMapOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            soundEngine.playUIClick();
            mpMapOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedMap = opt.dataset.value;
            broadcastLobbySettings();
        });
        opt.addEventListener('mouseenter', () => soundEngine.playUIHover());
    });

    mpModeOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            soundEngine.playUIClick();
            mpModeOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedMode = opt.dataset.value;
            broadcastLobbySettings();
        });
        opt.addEventListener('mouseenter', () => soundEngine.playUIHover());
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
            soundEngine.playUIClick();
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-settings`).classList.add('active');
            
            // Force Training Range for Solo tab
            if (btn.dataset.tab === 'solo') {
                selectedMap = 'training';
                selectedMode = 'practice';
                botsEnabled = false; 
                teamsEnabled = false;
            }

            // Hide start button if multiplayer is selected (unless hosting)
            if (btn.dataset.tab === 'multiplayer' && !isHost) {
                startButton.style.visibility = 'hidden';
            } else {
                startButton.style.visibility = 'visible';
            }
        });
        btn.addEventListener('mouseenter', () => soundEngine.playUIHover());
    });

    hostBtn.addEventListener('click', () => {
        soundEngine.playUIClick();
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
    hostBtn.addEventListener('mouseenter', () => soundEngine.playUIHover());

    joinBtn.addEventListener('click', () => {
        soundEngine.playUIClick();
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
joinBtn.addEventListener('mouseenter', () => soundEngine.playUIHover());

startButton.addEventListener('click', () => {
        soundEngine.playUIClick();
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
    startButton.addEventListener('mouseenter', () => soundEngine.playUIHover());
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
                if (statusText) {
                    const mapName = selectedMap === 'training' ? 'TRAINING RANGE' : selectedMap.toUpperCase();
                    statusText.innerText = `CONNECTED! (${mapName} - ${selectedMode.toUpperCase()})${teamsEnabled ? ' [TEAMS]' : ''}`;
                }
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
                takeDamage(data.damage, data.attackerName || "Player", data.weapon || "Gun", data.attackerTeam);
            }
        } else if (data.type === 'kill-event') {
            addKillFeedEntry(data.killer, data.victim, data.weapon, data.team);
            if (data.killer === playerName && data.victim !== playerName) {
                playerKills++;
                let reward = 300;
                if (data.weapon === 'knife') reward = 1500;
                playerCash += reward;
                updateUI();
                broadcastScore();
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
        const model = createHumanoidModel(data.team === 'B' ? 'TERRORIST' : 'COUNTER_TERRORIST'); 
        scene.add(model);
        networkPlayers[id] = model;

        // Mark parts for shooting/collision
        model.traverse(part => {
            if (part instanceof THREE.Mesh) {
                part.userData.isEnemy = true; 
                part.userData.parentPlayerId = id;
                part.userData.isSolid = true;
                part.updateMatrixWorld(true);
                part.userData.boundingBox = new THREE.Box3().setFromObject(part);
                
                // Check for headshot based on world position
                const worldPos = new THREE.Vector3();
                part.getWorldPosition(worldPos);
                if (worldPos.y > 18) {
                    part.userData.isHeadshot = true;
                }
                objects.push(part);
            }
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

function pickupWeapon(pickup) {
    if (!pickup) return;

    if (pickup.userData.weaponKey) {
        const wData = WEAPONS_DATA[pickup.userData.weaponKey];
        const slot = wData.slot;
        
        // --- DROPPING OLD WEAPON LOGIC ---
        // If the slot is occupied and it's a different weapon, we swap (drop old)
        if (inventory[slot] && inventory[slot].type !== 'none' && inventory[slot].weaponKey !== pickup.userData.weaponKey) {
            const oldKey = inventory[slot].weaponKey;
            
            // Spawn dropped model of old weapon
            const dropped = createGunModel(oldKey, false);
            dropped.scale.set(15, 15, 15);
            dropped.position.copy(camera.position);
            dropped.position.y = 1;
            dropped.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2);
            dropped.userData = {
                weaponKey: oldKey,
                ammoAmount: inventory[slot].ammoTotal,
                isPickup: true
            };
            scene.add(dropped);
            droppedGuns.push(dropped);
        }

        // --- PICKING UP NEW WEAPON ---
        const newModel = createGunModel(pickup.userData.weaponKey, true);
        newModel.position.copy(restPos);
        newModel.visible = false;
        camera.add(newModel);
        
        const mf = new THREE.Group();
        mf.userData.isMuzzleFlash = true;
        mf.visible = false;
        mf.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffff00 })));
        
        let barrelZ = -0.45;
        if (pickup.userData.weaponKey === 'AK47') barrelZ = -1.2;
        else if (pickup.userData.weaponKey === 'AWP') barrelZ = -1.8;
        
        mf.position.set(0, 0.05, barrelZ);
        newModel.add(mf);

        if (inventory[slot] && inventory[slot].model) {
            camera.remove(inventory[slot].model);
        }

        inventory[slot] = {
            type: 'gun',
            weaponKey: pickup.userData.weaponKey,
            model: newModel,
            ammoInClip: wData.magSize,
            ammoTotal: pickup.userData.ammoAmount || wData.reserveAmmo
        };

        if (currentSlot === slot) {
            currentWeaponData = wData;
            ammoInClip = inventory[slot].ammoInClip;
            ammoTotal = inventory[slot].ammoTotal;
            gun = newModel;
            gun.visible = true;
            muzzleFlash = mf;
        } else if (slot === 3 && (inventory[2].type === 'none' || currentSlot === 2)) {
            // Auto-switch to primary if secondary was empty or being held? 
            // Actually let's just match CS: if you pick up a primary and you don't have one, switch.
            switchWeapon(3);
        }
    } else if (pickup.userData.grenadeKey) {
        let slot = 4;
        if (pickup.userData.grenadeKey === 'FLASH') slot = 6;
        else if (pickup.userData.grenadeKey === 'SMOKE') slot = 7;
        else if (pickup.userData.grenadeKey === 'MOLOTOV') slot = 8;

        if (inventory[slot]) {
            inventory[slot].count += (pickup.userData.count || 1);
            if (currentSlot === slot) {
                grenadeCount = inventory[slot].count;
                GameState.grenadeCount = grenadeCount;
                if (inventory[slot].model) inventory[slot].model.visible = true;
            }
        }
    }

    soundEngine.playLand();
    updateUI();
    
    // Remove from world
    const idx = droppedGuns.indexOf(pickup);
    if (idx > -1) droppedGuns.splice(idx, 1);
    scene.remove(pickup);
    
    // Clear prompt
    currentNearPickup = null;
    if (pickupPrompt) pickupPrompt.style.display = 'none';
}

function switchWeapon(slot) {
    if (slot === currentSlot || !inventory[slot] || inventory[slot].type === 'none') return;
    if (isReloading) return;

    // Hide all first
    Object.values(inventory).forEach(item => {
        if (item.model) item.model.visible = false;
    });

    // Update state
    currentSlot = slot;
    currentWeapon = inventory[slot].type;
    const item = inventory[slot];

    if (item.type === 'gun') {
        currentWeaponData = WEAPONS_DATA[item.weaponKey];
        ammoInClip = item.ammoInClip;
        ammoTotal = item.ammoTotal;
        gun = item.model;
        
        // Find muzzle flash in children
        muzzleFlash = gun.children.find(c => c.userData.isMuzzleFlash);
    }

    if (item.model) {
        if (item.type === 'grenade') {
            if (item.count <= 0) {
                item.model.visible = false;
            } else {
                item.model.visible = true;
            }
            grenadeCount = item.count;
            GameState.grenadeCount = grenadeCount;
        } else {
            item.model.visible = true;
        }
    }

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


function createEnemy(x, y, z, team = 'A') {
    const enemy = new THREE.Group();
    
    let botColor = 0x556b2f;
    if (teamsEnabled) {
        botColor = team === 'A' ? 0x0000ff : 0xff0000;
    }

    const humanoid = createHumanoidModel(team === 'B' ? 'TERRORIST' : 'COUNTER_TERRORIST');
    enemy.add(humanoid);
    enemy.userData.team = team;

    // Gun
    const enemyGun = createGunModel('GLOCK', false);
    enemyGun.scale.set(15, 15, 15); 
    enemyGun.position.set(4, 13.5, 7); 
    enemyGun.rotation.y = Math.PI; 
    enemy.add(enemyGun);

    humanoid.traverse(part => {
        if (part.name === "rightArm") {
            part.rotation.x = -Math.PI / 2.5;
            part.position.set(4.5, 17.5, 0); 
            part.scale.y = 1.2; 
        }
        if (part.name === "leftArm") {
            part.rotation.x = -Math.PI / 2.8;
            part.rotation.z = 0.6;
            part.position.set(-4.5, 17.5, 0); 
            part.scale.y = 1.4; 
        }
        
        if (part instanceof THREE.Mesh) {
            part.userData.isEnemy = true;
            part.userData.parentEnemy = enemy;
            part.userData.isSolid = true;
            part.updateMatrixWorld(true);
            part.userData.boundingBox = new THREE.Box3().setFromObject(part);
            
            // Headshot detection (using world position since head might be in headGroup)
            const worldPos = new THREE.Vector3();
            part.getWorldPosition(worldPos);
            if (worldPos.y > 18) part.userData.isHeadshot = true;
            objects.push(part);
        }
    });

    enemy.position.set(x, y, z);
    scene.add(enemy);

    enemy.userData.health = 100;
    enemy.userData.alive = true;
    enemy.userData.targetPos = new THREE.Vector3(x, y, z);
    enemy.userData.roamTimer = Math.random() * 5000 + 2000;
    enemy.userData.walkCycle = 0;
    
    enemies.push(enemy);
    return enemy;
}

function init() {
    console.log("Initializing scene...");
    
    // Reset Game State
    playerKills = 0;
    playerCash = 800;
    networkScores = {};
    health = 100;
    ammoInClip = 20;
    ammoTotal = 120;
    grenadeCount = 2;
    isPlayerDead = false;
    
    try {
        // Use global camera instead of re-creating it
                // Initial Spawn Position
                const mapData = Maps[selectedMap] || Maps['dust2'];
                const sp = mapData.spawnPoint || { x: 0, y: 18, z: 100 };
                camera.position.set(sp.x, sp.y, sp.z);
                
                // Ensure player is looking in a sensible direction (towards map center or targets)
                if (selectedMap === 'training') {
                    camera.lookAt(0, 18, 100);
                }
                scene = new THREE.Scene();
        
        // --- SKYDOME ---
        const skyGeo = new THREE.SphereGeometry(1500, 32, 32);
        const skyTex = TextureGenerator.createSkyTexture();
        const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
        const skydome = new THREE.Mesh(skyGeo, skyMat);
        scene.add(skydome);

        // Dust 2 Fog (match horizon haze)
        scene.fog = new THREE.Fog(0xe1f5fe, 100, 1500);

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
        const killfeedOpts = document.querySelectorAll('#killfeed-toggle .option');

        const loaded = UI.loadSettings();
        if (loaded) {
            settings = { ...settings, ...loaded };
            playerName = settings.playerName || "Noob";
        }

        // Apply saved settings to UI
        fovSlider.value = settings.fov;
        fovVal.innerText = settings.fov;
        sensSlider.value = settings.sensitivity;
        sensVal.innerText = settings.sensitivity.toFixed(1);
        distSlider.value = settings.viewDistance;
        distVal.innerText = settings.viewDistance;
        
        killfeedOpts.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.value === String(settings.showKillFeed));
        });

        // Apply settings to game objects
        camera.fov = settings.fov;
        camera.far = settings.viewDistance + 500;
        camera.updateProjectionMatrix();
        
        if (scene.fog) {
            scene.fog.far = settings.viewDistance;
        }

        resumeBtn.addEventListener('click', () => {
            soundEngine.playUIClick();
            controls.lock();
        });
        
        helpBtn.addEventListener('click', () => {
            soundEngine.playUIClick();
            helpModal.style.display = 'flex';
        });

        settingsBtn.addEventListener('click', () => {
            soundEngine.playUIClick();
            settingsModal.style.display = 'flex';
        });

        closeHelpBtn.addEventListener('click', () => {
            soundEngine.playUIClick();
            helpModal.style.display = 'none';
        });

        closeSettingsBtn.addEventListener('click', () => {
            soundEngine.playUIClick();
            settingsModal.style.display = 'none';
        });

        resetSettingsBtn.addEventListener('click', () => {
            soundEngine.playUIClick();
            settings = { fov: 75, sensitivity: 1.0, viewDistance: 800, showKillFeed: true };
            fovSlider.value = 75; fovVal.innerText = 75;
            sensSlider.value = 1.0; sensVal.innerText = "1.0";
            distSlider.value = 800; distVal.innerText = 800;
            killfeedOpts.forEach(opt => {
                opt.classList.toggle('active', opt.dataset.value === 'true');
            });
            camera.fov = 75; camera.far = 1300; camera.updateProjectionMatrix();
            if (scene.fog) scene.fog.far = 800;
            UI.saveSettings(settings);
        });

        // Settings listeners
        fovSlider.addEventListener('input', (e) => {
            soundEngine.playUIHover();
            const val = parseInt(e.target.value);
            fovVal.innerText = val;
            settings.fov = val;
            camera.fov = val;
            camera.updateProjectionMatrix();
            saveSettings();
        });

        sensSlider.addEventListener('input', (e) => {
            soundEngine.playUIHover();
            const val = parseFloat(e.target.value);
            sensVal.innerText = val.toFixed(1);
            settings.sensitivity = val;
            saveSettings();
        });

        distSlider.addEventListener('input', (e) => {
            soundEngine.playUIHover();
            const val = parseInt(e.target.value);
            distVal.innerText = val;
            settings.viewDistance = val;
            if (scene.fog) scene.fog.far = val;
            camera.far = val + 500;
            camera.updateProjectionMatrix();
            saveSettings();
        });

        killfeedOpts.forEach(opt => {
            opt.addEventListener('click', () => {
                soundEngine.playUIClick();
                const val = opt.dataset.value === 'true';
                settings.showKillFeed = val;
                killfeedOpts.forEach(o => o.classList.toggle('active', o === opt));
                saveSettings();
            });
        });

        quitBtn.addEventListener('click', () => {
            soundEngine.playUIClick();
            window.location.reload(); // Simple and clean reset for now
        });

        document.getElementById('respawn-overlay').addEventListener('click', () => {
            if (isPlayerDead) {
                soundEngine.playUIClick();
                respawnPlayer();
            }
        });

        document.getElementById('game-over-quit').addEventListener('click', () => {
            soundEngine.playUIClick();
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
                    soundEngine.playUIClick();
                    break;
                case 'Digit2':
                    switchWeapon(2);
                    soundEngine.playUIClick();
                    break;
                case 'Digit3':
                    switchWeapon(3);
                    soundEngine.playUIClick();
                    break;
                case 'Digit4':
                    switchWeapon(4);
                    soundEngine.playUIClick();
                    break;
                case 'Digit5':
                    switchWeapon(5);
                    soundEngine.playUIClick();
                    break;
                case 'Digit6':
                    switchWeapon(6);
                    soundEngine.playUIClick();
                    break;
                case 'Digit7':
                    switchWeapon(7);
                    soundEngine.playUIClick();
                    break;
                case 'Digit8':
                    switchWeapon(8);
                    soundEngine.playUIClick();
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
                    if (canJump === true) {
                        velocity.y += PHYSICS.JUMP_FORCE;
                        soundEngine.playJump();
                    }
                    canJump = false;
                    break;
                case 'KeyR':
                    reload();
                    break;
                case 'KeyE':
                    if (currentNearPickup) {
                        pickupWeapon(currentNearPickup);
                    }
                    break;
                case 'KeyC':
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
                case 'KeyC':
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

        // --- MAP BUILDING ---
        if (Maps[selectedMap]) {
            Maps[selectedMap].build(scene, objects, enemies, droppedGuns, createEnemy, botsEnabled, teamsEnabled, peer);
        } else {
            // Fallback to dust2 if map not found
            Maps['dust2'].build(scene, objects, enemies, droppedGuns, createEnemy, botsEnabled, teamsEnabled, peer);
        }

        // --- INVENTORY MODELS ---
        Object.keys(inventory).forEach(slot => {
            const item = inventory[slot];
            if (item.type === 'gun') {
                item.model = createGunModel(item.weaponKey, true);
                item.model.position.copy(restPos);
                
                // Muzzle Flash
                const mf = new THREE.Group();
                mf.userData.isMuzzleFlash = true;
                mf.visible = false;
                
                const flashGeo = new THREE.SphereGeometry(0.05, 8, 8);
                const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
                mf.add(new THREE.Mesh(flashGeo, flashMat));
                
                const ml = new THREE.PointLight(0xffaa00, 1, 10);
                mf.add(ml);
                
                // Position muzzle flash at the end of the barrel
                // Finding barrel might be hard, let's use weaponKey specific offsets
                let barrelZ = -0.45;
                if (item.weaponKey === 'AK47') barrelZ = -1.2;
                else if (item.weaponKey === 'M4A4') barrelZ = -1.1;
                else if (item.weaponKey === 'AWP') barrelZ = -1.8;
                else if (item.weaponKey === 'DEAGLE') barrelZ = -0.7;
                
                mf.position.set(0, 0.05, barrelZ);
                item.model.add(mf);
                
                if (slot == currentSlot) {
                    gun = item.model;
                    muzzleFlash = mf;
                }
            } else if (item.type === 'knife') {
                item.model = createKnifeModel(true);
                item.model.position.set(0.3, -0.4, -0.4);
                if (slot == currentSlot) knife = item.model;
            } else if (item.type === 'grenade') {
                item.model = createGrenadeModel(true, item.weaponKey);
                item.model.position.set(0.3, -0.4, -0.4);
                if (slot == currentSlot) grenade = item.model;
            }
            
            if (item.model) {
                item.model.visible = (slot == currentSlot);
                camera.add(item.model);
            }
        });

        // Player Body (visible when looking down)
        let playerBodyColor = 0x222222;
        if (teamsEnabled) {
            playerBodyColor = playerTeam === 'A' ? 0x0000ff : 0xff0000;
        }
        const playerBody = createHumanoidModel(playerTeam === 'B' ? 'TERRORIST' : 'COUNTER_TERRORIST');
        playerBody.position.set(0, -18, 0); // Position below the camera
        // Hide the head of the player's own body to avoid clipping with camera
        playerBody.traverse(child => {
            const worldPos = new THREE.Vector3();
            child.getWorldPosition(worldPos);
            if (worldPos.y > 18) child.visible = false;
        });
        camera.add(playerBody);

        updateUI();

        // Shooting & Aiming
        document.addEventListener('mousedown', (e) => {
            if (controls.isLocked) {
                if (e.button === 0) { // Left click: Action
                    if (currentWeapon === 'gun') {
                        isFiring = true;
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
                isFiring = false;
                if (currentWeapon === 'grenade' && isGrenadeCooking) {
                    throwGrenade();
                }
            }
            if (e.button === 2) {
                isAiming = false;
            }
        });

        // Weapon Sway Mouse Movement
        document.addEventListener('mousemove', (e) => {
            if (controls.isLocked) {
                const movementX = e.movementX || 0;
                const movementY = e.movementY || 0;
                
                swayX -= movementX * 0.0005;
                swayY += movementY * 0.0005;
                
                // Clamp sway
                const maxSway = 0.05;
                swayX = THREE.MathUtils.clamp(swayX, -maxSway, maxSway);
                swayY = THREE.MathUtils.clamp(swayY, -maxSway, maxSway);
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

function takeDamage(amount, killer = "Bot", weapon = "Gun", killerTeam = null) {
    if (health <= 0 || isPlayerDead) return;
    health -= amount;
    if (health < 0) health = 0;
    updateUI();
    
    soundEngine.playHit();

    if (damageFlash) {
        damageFlash.classList.add('active');
        setTimeout(() => damageFlash.classList.remove('active'), 100);
    }
    
    if (health === 0) {
        playerDie(killer, weapon, killerTeam);
    }
}

function updateUI() {
    // Sync to GameState for UI.js
    GameState.health = health;
    GameState.cash = playerCash;
    GameState.ammoInClip = ammoInClip;
    GameState.ammoTotal = ammoTotal;
    GameState.currentWeaponName = currentWeaponData ? currentWeaponData.name : "";
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
        
        UI.updateUI(enemies, inventory);
    }
    function addKillFeedEntry(killer, victim, weapon, killerTeam = null) {
    if (!settings.showKillFeed) return;

    const killFeed = document.getElementById('kill-feed');
    if (!killFeed) return;

    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    if (killerTeam === 'A') entry.classList.add('team-a-kill');
    if (killerTeam === 'B') entry.classList.add('team-b-kill');

    const killerSpan = document.createElement('span');
    killerSpan.className = 'killer';
    killerSpan.innerText = killer;

    const victimSpan = document.createElement('span');
    victimSpan.className = 'victim';
    victimSpan.innerText = victim;

    const weaponSpan = document.createElement('span');
    weaponSpan.className = 'weapon';
    weaponSpan.innerText = `[${weapon.toUpperCase()}]`;

    entry.appendChild(killerSpan);
    entry.appendChild(weaponSpan);
    entry.appendChild(victimSpan);

    killFeed.appendChild(entry);

    // Remove after 5 seconds
    setTimeout(() => {
        entry.style.opacity = '0';
        entry.style.transform = 'translateX(20px)';
        entry.style.transition = 'all 0.5s ease-out';
        setTimeout(() => entry.remove(), 500);
    }, 5000);

    // Keep only last 5 entries
    while (killFeed.children.length > 5) {
        killFeed.removeChild(killFeed.firstChild);
    }
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
    grenadeCount = 2;
    isReloading = false;
    
    // Reset position to a "spawn point" (could be random or fixed)
    const mapData = Maps[selectedMap] || Maps['dust2'];
    const sp = mapData.spawnPoint || { x: 0, y: 18, z: 100 };
    
    // Add slight random offset if it's Dust 2
    if (selectedMap === 'dust2') {
        camera.position.set(sp.x + (Math.random() * 200 - 100), sp.y, sp.z + (Math.random() * 200 - 100));
    } else {
        camera.position.set(sp.x, sp.y, sp.z);
    }
    velocity.set(0, 0, 0);
    
    document.getElementById('respawn-overlay').style.display = 'none';
    document.getElementById('crosshair').style.display = 'block';
    
    updateUI();
    controls.lock();
}

function playerDie(killer = "Bot", weapon = "Gun", killerTeam = null) {
    isPlayerDead = true;
    soundEngine.playDeath();
    controls.unlock();
    document.getElementById('respawn-overlay').style.display = 'flex';
    document.getElementById('crosshair').style.display = 'none';
    
    // Kill Feed Entry
    addKillFeedEntry(killer, playerName, weapon, killerTeam);
    
    // Broadcast death to others
    if (connections.length > 0) {
        broadcastKill(killer, playerName, weapon, killerTeam);
    }
}

function reload() {
    if (!currentWeaponData || isReloading || ammoInClip === currentWeaponData.magSize || ammoTotal === 0) return;

    console.log("Reloading " + currentWeaponData.name);
    soundEngine.playReload();
    isReloading = true;
    reloadStartTime = performance.now();
    ammoUI.innerText = "RELOADING...";
    
    const duration = currentWeaponData.reloadTime;
    setTimeout(() => {
        const needed = currentWeaponData.magSize - ammoInClip;
        const toLoad = Math.min(needed, ammoTotal);
        ammoInClip += toLoad;
        ammoTotal -= toLoad;
        
        // Sync back to inventory
        if (inventory[currentSlot]) {
            inventory[currentSlot].ammoInClip = ammoInClip;
            inventory[currentSlot].ammoTotal = ammoTotal;
        }

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
    
    soundEngine.playKnife();
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
        } else {
            // Hit wall, crate, or something else
            let impactColor = 0x888888;
            if (hitPart.userData.isCrate) impactColor = 0x8b4513;
            if (hitPart.userData.isGround) impactColor = 0xd2b48c;

            createImpactEffect(intersects[0].point, scene, impactParticles, impactColor);
            soundEngine.playImpact();
        }
    }

    // Reset attacking state after animation
    setTimeout(() => {
        isKnifeAttacking = false;
    }, 300);
}

function shoot() {
    if (ammoInClip <= 0) {
        soundEngine.playClick(performance.now());
        return;
    }

    ammoInClip--;
    if (inventory[currentSlot]) {
        inventory[currentSlot].ammoInClip = ammoInClip;
    }
    updateUI();

    soundEngine.playShoot();
    
    // Add recoil
    recoil = Math.min(recoil + currentWeaponData.recoil, 0.2);
    cameraRecoilX += currentWeaponData.recoil * 0.5;

    const numPellets = currentWeaponData.pellets || 1;
    
    for (let i = 0; i < numPellets; i++) {
        const shootRaycaster = new THREE.Raycaster();
        
        // Simple spread based on weapon
        const spreadVal = currentWeaponData.spread || 0.02;
        const spread = new THREE.Vector2(
            (Math.random() - 0.5) * spreadVal,
            (Math.random() - 0.5) * spreadVal
        );
        
        shootRaycaster.setFromCamera(spread, camera);

        const intersects = shootRaycaster.intersectObjects(objects);

        if (intersects.length > 0) {
            const hitPart = intersects[0].object;
            
            // Handle Bot hits
            if (hitPart.userData.isEnemy && hitPart.userData.parentEnemy) {
                const enemy = hitPart.userData.parentEnemy;
                
                if (teamsEnabled && enemy.userData.team === playerTeam) continue;

                if (enemy.userData.alive) {
                    createBloodSplatter(intersects[0].point, scene, bloodParticles);
                    let damage = currentWeaponData.damage;
                    if (hitPart.userData.isHeadshot) damage *= currentWeaponData.headshotMultiplier;
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
                if (teamsEnabled && networkScores[remoteId] && networkScores[remoteId].team === playerTeam) continue;

                createBloodSplatter(intersects[0].point, scene, bloodParticles);
                let damage = currentWeaponData.damage;
                if (hitPart.userData.isHeadshot) damage *= currentWeaponData.headshotMultiplier;
                broadcastHit(remoteId, damage);
            }
            else {
                let impactColor = 0x888888;
                if (hitPart.userData.isCrate) impactColor = 0x8b4513;
                if (hitPart.userData.isGround) impactColor = 0xd2b48c;
                
                createImpactEffect(intersects[0].point, scene, impactParticles, impactColor);
                soundEngine.playImpact();
            }
        }
    }
}



function broadcastHit(targetId, damage) {
    if (connections.length > 0) {
        const data = {
            type: 'player-hit',
            targetId: targetId,
            damage: damage,
            attackerName: playerName,
            attackerTeam: playerTeam,
            weapon: currentWeapon
        };
        connections.forEach(conn => {
            if (conn.open) conn.send(data);
        });
    }
}

function broadcastKill(killer, victim, weapon, team) {
    if (connections.length > 0) {
        const data = {
            type: 'kill-event',
            killer: killer,
            victim: victim,
            weapon: weapon,
            team: team
        };
        connections.forEach(conn => {
            if (conn.open) conn.send(data);
        });
    }
}

function startGrenadeCook() {
    if (isGrenadeCooking || grenadeCount <= 0) return;
    isGrenadeCooking = true;
    grenadeCookStartTime = performance.now();
    console.log("Pin pulled!");
}

function throwGrenade() {
    if (!isGrenadeCooking) return;
    
    const item = inventory[currentSlot];
    const nadeData = GRENADES_DATA[item.weaponKey];
    const maxFuse = nadeData.fuse || 3000;
    
    const now = performance.now();
    const elapsed = now - grenadeCookStartTime;
    const remainingFuse = maxFuse - elapsed;

    if (maxFuse > 0 && remainingFuse <= 0) {
        // Exploded in hand!
        explode(camera.position.clone(), playerName, playerTeam, item.weaponKey);
        takeDamage(100);
    } else {
        const thrownNade = createGrenadeModel(false, item.weaponKey);
        thrownNade.scale.set(30, 30, 30);
        thrownNade.position.copy(camera.position);
        
        const throwDirection = new THREE.Vector3();
        camera.getWorldDirection(throwDirection);
        
        const force = 100;
        const velocity = throwDirection.clone().multiplyScalar(force);
        velocity.y += 20;

        thrownNade.userData = {
            velocity: velocity,
            fuse: remainingFuse,
            isThrown: true,
            ownerName: playerName,
            ownerTeam: playerTeam,
            grenadeKey: item.weaponKey
        };

        scene.add(thrownNade);
        activeGrenades.push(thrownNade);
    }

    item.count--;
    grenadeCount = item.count;
    GameState.grenadeCount = grenadeCount;
    
    isGrenadeCooking = false;
    if (grenade) grenade.visible = false;
    updateUI();

    setTimeout(() => {
        if (item.count <= 0 && currentSlot === 4) {
            // Cycle to next nade if possible or gun
            switchWeapon(2);
        } else if (currentSlot >= 6 && currentSlot <= 8 && item.count <= 0) {
            switchWeapon(2);
        } else if (item.count > 0) {
            if (item.model) item.model.visible = true;
        }
    }, 500);
}


function updateGrenades(delta) {
    for (let i = activeGrenades.length - 1; i >= 0; i--) {
        const nade = activeGrenades[i];
        const data = nade.userData;

        // Fuse
        data.fuse -= delta * 1000;
        if (data.fuse <= 0 && data.grenadeKey !== 'MOLOTOV') {
            explode(nade.position.clone(), data.ownerName, data.ownerTeam, data.grenadeKey);
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
            
            if (data.grenadeKey === 'MOLOTOV') {
                explode(nade.position.clone(), data.ownerName, data.ownerTeam, 'MOLOTOV');
                scene.remove(nade);
                activeGrenades.splice(i, 1);
                continue;
            }

            if (Math.abs(data.velocity.y) > 2) soundEngine.playBounce();
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
                if (data.grenadeKey === 'MOLOTOV') {
                    explode(nade.position.clone(), data.ownerName, data.ownerTeam, 'MOLOTOV');
                    scene.remove(nade);
                    activeGrenades.splice(i, 1);
                    continue;
                }
                
                // Reflect velocity based on normal
                const normal = hit.face.normal.clone().applyQuaternion(hit.object.quaternion);
                data.velocity.reflect(normal).multiplyScalar(0.5);
                soundEngine.playBounce();
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

function createFlashOverlay() {
    let overlay = document.getElementById('flash-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'flash-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = '#fff';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
    return overlay;
}

function createSmokeCloud(position) {
    const smokeGroup = new THREE.Group();
    smokeGroup.position.copy(position);
    scene.add(smokeGroup);

    const particleCount = 25;
    const geo = new THREE.SphereGeometry(1, 12, 12);

    for (let i = 0; i < particleCount; i++) {
        const mat = new THREE.MeshPhongMaterial({ 
            color: 0x666666, 
            transparent: true, 
            opacity: 0.7 + Math.random() * 0.3 
        });
        const p = new THREE.Mesh(geo, mat);
        p.position.set(
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 15
        );
        p.scale.setScalar(Math.random() * 8 + 12);
        smokeGroup.add(p);
    }

    setTimeout(() => {
        let op = 1.0;
        const fade = setInterval(() => {
            op -= 0.01;
            smokeGroup.children.forEach(c => {
                if (c.material) c.material.opacity = op;
            });
            if (op <= 0) {
                clearInterval(fade);
                scene.remove(smokeGroup);
            }
        }, 100);
    }, 15000);
}

function createFireArea(position, killerName, killerTeam) {
    const fireGroup = new THREE.Group();
    fireGroup.position.copy(position);
    scene.add(fireGroup);

    const geo = new THREE.SphereGeometry(1, 8, 8);
    
    for (let i = 0; i < 20; i++) {
        const mat = new THREE.MeshBasicMaterial({ 
            color: i % 2 === 0 ? 0xffaa00 : 0xff4400, 
            transparent: true, 
            opacity: 0.6 
        });
        const p = new THREE.Mesh(geo, mat);
        const r = 40;
        p.position.set((Math.random() - 0.5) * r, (Math.random() * 5), (Math.random() - 0.5) * r);
        p.scale.set(Math.random() * 10 + 10, Math.random() * 5 + 2, Math.random() * 10 + 10);
        fireGroup.add(p);
    }

    const startTime = performance.now();
    const duration = 7000;
    const interval = setInterval(() => {
        const elapsed = performance.now() - startTime;
        if (elapsed > duration) {
            clearInterval(interval);
            scene.remove(fireGroup);
            return;
        }

        if (camera.position.distanceTo(position) < 40) {
            takeDamage(4);
        }

        enemies.forEach(enemy => {
            if (enemy.userData.alive && enemy.position.distanceTo(position) < 40) {
                enemy.userData.health -= 6;
                if (enemy.userData.health <= 0) killEnemy(enemy, killerName);
            }
        });
    }, 500);
}

function explode(position, killerName = playerName, killerTeam = playerTeam, grenadeKey = 'HE') {
    const data = GRENADES_DATA[grenadeKey] || GRENADES_DATA['HE'];
    console.log(data.name + " detonated");
    
    if (grenadeKey === 'HE') {
        soundEngine.playExplosion();
    } else if (grenadeKey === 'FLASH') {
        soundEngine.playClick(performance.now(), 2000);
        const dirToNade = position.clone().sub(camera.position).normalize();
        const lookDir = new THREE.Vector3();
        camera.getWorldDirection(lookDir);
        const dot = lookDir.dot(dirToNade);
        
        if (dot > 0.3) {
            const dist = camera.position.distanceTo(position);
            if (dist < 500) {
                const flashOverlay = createFlashOverlay();
                flashOverlay.style.opacity = '1';
                flashOverlay.style.display = 'block';
                
                let opacity = 1.0;
                const fade = setInterval(() => {
                    opacity -= 0.02;
                    flashOverlay.style.opacity = opacity;
                    if (opacity <= 0) {
                        clearInterval(fade);
                        flashOverlay.style.display = 'none';
                    }
                }, 100);
            }
        }
    } else if (grenadeKey === 'SMOKE') {
        createSmokeCloud(position);
    } else if (grenadeKey === 'MOLOTOV') {
        soundEngine.playExplosion();
        createFireArea(position, killerName, killerTeam);
    }

    if (grenadeKey === 'HE' || grenadeKey === 'MOLOTOV') {
        const explosionGroup = new THREE.Group();
        explosionGroup.position.copy(position);
        scene.add(explosionGroup);

        const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({ color: data.color, transparent: true, opacity: 0.8 });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        explosionGroup.add(sphere);

        const light = new THREE.PointLight(0xff5500, 10, 100);
        explosionGroup.add(light);

        let start = performance.now();
        const duration = 500;
        function animateExplosion() {
            let elapsed = performance.now() - start;
            let progress = elapsed / duration;

            if (progress < 1) {
                const scale = progress * data.radius * 0.5;
                sphere.scale.set(scale, scale, scale);
                sphere.material.opacity = 1 - progress;
                light.intensity = (1 - progress) * 10;
                requestAnimationFrame(animateExplosion);
            } else {
                scene.remove(explosionGroup);
            }
        }
        animateExplosion();
    }

    if (grenadeKey === 'HE') {
        const blastRadius = data.radius;
        // Check damage to player
        const distToPlayer = camera.position.distanceTo(position);
        if (distToPlayer < blastRadius) {
            const dmg = (1 - distToPlayer / blastRadius) * data.damage;
            takeDamage(dmg);
        }

        // Damage enemies
        enemies.forEach(enemy => {
            if (enemy.userData.alive) {
                const dist = enemy.position.distanceTo(position);
                if (dist < blastRadius) {
                    const dmg = (1 - dist / blastRadius) * data.damage;
                    enemy.userData.health -= dmg;
                    if (enemy.userData.health <= 0) killEnemy(enemy, killerName);
                }
            }
        });
    }
}

function broadcastExplosion(position, type) {
    if (connections.length > 0) {
        const data = {
            type: 'explosion',
            position: { x: position.x, y: position.y, z: position.z },
            grenadeType: type,
            ownerName: playerName
        };
        connections.forEach(conn => {
            if (conn.open) conn.send(data);
        });
    }
}

function killEnemy(enemy, killerName = playerName, weapon = currentWeapon, killerTeam = playerTeam) {
    enemy.userData.alive = false;
    
    // Kill Feed Entry
    addKillFeedEntry(killerName, enemy.userData.name || "Bot", weapon, killerTeam);

    if (killerName === playerName) {
        playerKills++;
        
        // Award Cash
        let reward = 300;
        if (weapon === 'knife') reward = 1500;
        playerCash += reward;
        
        updateUI();
        
        // Multiplayer: Broadcast the kill if we are host or just tell others
        if (connections.length > 0) {
            broadcastKill(killerName, enemy.userData.name || "Bot", weapon, killerTeam);
        }
    }

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
    const humanoidGroup = enemy.children.find(c => c instanceof THREE.Group && (c.name === "humanoid" || c.children.some(p => p.userData.isEnemy)));
    if (humanoidGroup) {
        humanoidGroup.children.forEach(part => {
            // Give each top-level part (Legs, Arms, Torso, headGroup) a slight random "kick"
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
    
    // Change color to indicate death and enable transparency for fade out (recursive)
    enemy.traverse(part => {
        if (part instanceof THREE.Mesh && part.material) {
            part.material = part.material.clone();
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
                enemy.traverse(part => {
                    if (part instanceof THREE.Mesh && part.material) {
                        part.material.opacity = 1 - progress;
                    }
                });
                requestAnimationFrame(fadeOut);
            } else {
                // Final removal
                scene.remove(enemy);
                
                // Remove body parts from 'objects' array (recursive)
                enemy.traverse(part => {
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

    // Make sky follow camera
    const skydome = scene.children.find(c => c.geometry instanceof THREE.SphereGeometry && c.material.side === THREE.BackSide);
    if (skydome) {
        skydome.position.copy(camera.position);
    }

    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.05);

    if (controls.isLocked === true) {
        // --- WEAPON FIRING ---
        if (isFiring && currentWeapon === 'gun' && !isReloading) {
            const now = performance.now();
            const msPerShot = 60000 / (currentWeaponData.fireRate || 400);
            
            if (now - lastFireTime >= msPerShot) {
                if (ammoInClip > 0) {
                    shoot();
                    lastFireTime = now;
                    
                    // Show muzzle flash
                    if (muzzleFlash) {
                        muzzleFlash.visible = true;
                        setTimeout(() => { if (muzzleFlash) muzzleFlash.visible = false; }, 50);
                    }
                    
                    // Visual recoil
                    recoil = isAiming ? 0.04 : 0.08; 
                    recoilRotation = isAiming ? 0.02 : 0.05;
                    cameraRecoilX = 0.02;
                    
                    crosshair.classList.add('firing');
                    setTimeout(() => crosshair.classList.remove('firing'), 100);

                    // If not automatic, stop firing after one shot
                    if (!currentWeaponData.isAutomatic) {
                        isFiring = false;
                    }
                } else {
                    reload();
                    isFiring = false;
                }
            }
        }

        // Update matrix to ensure movement uses the latest mouse rotation
        camera.updateMatrixWorld();

        raycaster.ray.origin.copy(camera.position);

        const intersections = raycaster.intersectObjects(objects, false);
        const onObject = intersections.length > 0;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta; 

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const moveSpeed = isCrouching ? PHYSICS.CROUCH_SPEED : PHYSICS.MOVE_SPEED;
        if (moveForward || moveBackward) velocity.z -= direction.z * moveSpeed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * moveSpeed * delta;

        // Ground detection
        if (onObject && velocity.y <= 0) {
            if (wasInAir) {
                soundEngine.playLand();
                wasInAir = false;
            }
            velocity.y = 0;
            canJump = true;
        } else {
            canJump = false;
            if (velocity.y > 0 || !onObject) {
                wasInAir = true;
            }
        }

        // --- COLLISION DETECTION (SLIDING) ---
        const playerRadius = PHYSICS.PLAYER_RADIUS; 
        const moveX = -velocity.x * delta;
        const moveZ = -velocity.z * delta;
        const steps = 4;
        const stepX = moveX / steps;
        const stepZ = moveZ / steps;

        for (let s = 0; s < steps; s++) {
            const oldPos = camera.position.clone();
            controls.moveRight(stepX);
            if (checkCollisionAt(camera.position, objects)) {
                camera.position.copy(oldPos);
            }

            const midPos = camera.position.clone();
            controls.moveForward(stepZ);
            if (checkCollisionAt(camera.position, objects)) {
                camera.position.copy(midPos);
            }
        }

        const currentTargetHeight = isCrouching ? crouchingHeight : standingHeight;
        
        if (!canJump) {
            camera.position.y += (velocity.y * delta);
        } else {
            const lerpSpeed = 12.0; 
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, currentTargetHeight, 1.0 - Math.exp(-lerpSpeed * delta));
            if (Math.abs(camera.position.y - currentTargetHeight) < 0.01) {
                camera.position.y = currentTargetHeight;
            }
        }

        // --- REFINED WEAPON ANIMATIONS ---
        const activeModel = currentWeapon === 'gun' ? gun : (currentWeapon === 'knife' ? knife : grenade);
        
        if (activeModel) {
            // 1. Recoil Recovery
            recoil = THREE.MathUtils.lerp(recoil, 0, 0.1);
            recoilRotation = THREE.MathUtils.lerp(recoilRotation, 0, 0.1);
            
            // 2. Sway Recovery (return to center)
            swayX = THREE.MathUtils.lerp(swayX, 0, 0.1);
            swayY = THREE.MathUtils.lerp(swayY, 0, 0.1);
            
            // 3. ADS Transitions
            const adsSpeed = 0.15;
            if (isAiming && !isReloading && currentWeapon === 'gun') {
                adsProgress = THREE.MathUtils.lerp(adsProgress, 1, adsSpeed);
            } else {
                adsProgress = THREE.MathUtils.lerp(adsProgress, 0, adsSpeed);
            }

            // 4. Movement Bobbing
            const isMoving = (moveForward || moveBackward || moveLeft || moveRight) && canJump;
            if (isMoving) {
                const speed = isCrouching ? 4 : 8;
                bobCounter += delta * speed;
                
                // Play footstep at specific points in the cycle
                if (Math.sin(bobCounter) < 0 && Math.sin(lastBobCounter) >= 0) {
                    soundEngine.playFootstep();
                }
                lastBobCounter = bobCounter;
            } else {
                bobCounter = THREE.MathUtils.lerp(bobCounter, Math.PI * 2, 0.1);
                if (bobCounter >= Math.PI * 2) bobCounter = 0;
            }

            const bobX = Math.cos(bobCounter) * (isCrouching ? 0.005 : 0.01);
            const bobY = Math.abs(Math.sin(bobCounter)) * (isCrouching ? 0.005 : 0.01);
            
            // 5. Position Calculation
            const targetRestPos = currentWeapon === 'gun' ? restPos : new THREE.Vector3(0.3, -0.4, -0.4);
            const currentBasePos = new THREE.Vector3().lerpVectors(targetRestPos, adsPos, adsProgress);
            
            activeModel.position.copy(currentBasePos);
            
            // Apply Bobbing (Reduced in ADS)
            const bobScale = 1 - (adsProgress * 0.8);
            activeModel.position.x += bobX * bobScale;
            activeModel.position.y += bobY * bobScale;
            
            // Apply Sway
            activeModel.position.x += swayX * bobScale;
            activeModel.position.y += swayY * bobScale;
            
            // Apply Recoil (Z kick)
            activeModel.position.z += recoil;
            
            // 6. Rotation Calculation
            // Reset rotation first
            activeModel.rotation.set(0, 0, 0);
            if (currentWeapon === 'gun') {
                activeModel.rotation.x = -recoilRotation; // Recoil Kick
                activeModel.rotation.y = swayX * 0.5;    // Horizontal Sway
                activeModel.rotation.z = swayX * 0.2;    // Slight tilt when turning
            } else if (currentWeapon === 'knife' && isKnifeAttacking) {
                // Knife stab animation logic
                knifeAttackProgress += delta * 15;
                if (knifeAttackProgress > Math.PI) knifeAttackProgress = Math.PI;
                const stabDepth = Math.sin(knifeAttackProgress) * 0.4;
                activeModel.position.z -= stabDepth;
                activeModel.rotation.x = Math.sin(knifeAttackProgress) * 0.5;
            }

            // 7. Reload Offset
            if (isReloading && currentWeapon === 'gun') {
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
            activeModel.position.y += reloadOffset;

            // 8. Camera Effects
            camera.fov = settings.fov - (adsProgress * 15);
            camera.updateProjectionMatrix();

            if (crosshair) {
                crosshair.style.opacity = 1 - (adsProgress * 0.8);
            }
        }

        updateGrenades(delta);

        enemies.forEach(enemy => {
            if (enemy.userData.alive) {
                updateBotAI(enemy, camera, objects, delta);
            } else if (enemy.userData.isRagdoll) {
                updateRagdoll(enemy);
            }
        });

        for (let i = bloodParticles.length - 1; i >= 0; i--) {
            const p = bloodParticles[i];
            p.position.add(p.userData.velocity.clone().multiplyScalar(0.016));
            p.userData.velocity.y -= 0.5;
            p.userData.life -= 0.02;
            p.material.opacity = p.userData.life;
            p.material.transparent = true;
            if (p.userData.life <= 0) {
                scene.remove(p);
                bloodParticles.splice(i, 1);
            }
        }

        for (let i = impactParticles.length - 1; i >= 0; i--) {
            const p = impactParticles[i];
            p.position.add(p.userData.velocity.clone().multiplyScalar(0.016));
            p.userData.velocity.y -= 0.5;
            p.userData.life -= 0.05; // Impact particles fade faster
            p.material.opacity = p.userData.life;
            p.material.transparent = true;
            if (p.userData.life <= 0) {
                scene.remove(p);
                impactParticles.splice(i, 1);
            }
        }

        let nearest = null;
        let minDist = 15;

        for (let i = droppedGuns.length - 1; i >= 0; i--) {
            const pickup = droppedGuns[i];
            const dx = camera.position.x - pickup.position.x;
            const dz = camera.position.z - pickup.position.z;
            const dist2D = Math.sqrt(dx * dx + dz * dz);
            
            if (dist2D < 15) {
                if (pickup.userData.weaponKey) {
                    const wData = WEAPONS_DATA[pickup.userData.weaponKey];
                    const slot = wData.slot;
                    const hasWeapon = inventory[slot] && inventory[slot].weaponKey === pickup.userData.weaponKey;
                    const slotEmpty = !inventory[slot] || inventory[slot].type === 'none';

                    if (slotEmpty || hasWeapon) {
                        // AUTO-PICKUP or AMMO MERGE
                        if (hasWeapon) {
                            inventory[slot].ammoTotal += (pickup.userData.ammoAmount || 30);
                            if (currentSlot === slot) ammoTotal = inventory[slot].ammoTotal;
                            soundEngine.playLand();
                            scene.remove(pickup);
                            droppedGuns.splice(i, 1);
                        } else {
                            pickupWeapon(pickup);
                        }
                    } else {
                        // DIFFERENT WEAPON IN SLOT: Propose SWAP
                        if (dist2D < minDist) {
                            minDist = dist2D;
                            nearest = pickup;
                        }
                    }
                } else if (pickup.userData.grenadeKey) {
                    // AUTO-PICKUP for grenades
                    pickupWeapon(pickup);
                }
            }
        }

        // Update Swap Prompt
        if (nearest) {
            currentNearPickup = nearest;
            if (pickupPrompt) {
                const wName = WEAPONS_DATA[nearest.userData.weaponKey].name;
                pickupPrompt.innerHTML = `PRESS <span style="background: #ff9d00; color: #000; padding: 2px 8px; border-radius: 3px;">E</span> TO SWAP FOR ${wName}`;
                pickupPrompt.style.display = 'block';
            }
        } else {
            currentNearPickup = null;
            if (pickupPrompt) pickupPrompt.style.display = 'none';
        }

        if (connections.length > 0 && isGameStarted) {
            const transformData = {
                type: 'transform',
                name: playerName,
                team: playerTeam,
                pos: camera.position,
                rot: { y: camera.rotation.y }
            };
            connections.forEach(conn => {
                if (conn.open) conn.send(transformData);
            });
        }

        // Apply temporary camera recoil for render only
        const originalRotationX = camera.rotation.x;
        if (cameraRecoilX > 0.001) {
            cameraRecoilX = THREE.MathUtils.lerp(cameraRecoilX, 0, 0.15);
            camera.rotation.x += cameraRecoilX;
        }

        renderer.render(scene, camera);

        // Restore rotation so it doesn't drift permanently
        camera.rotation.x = originalRotationX;
    } else {
        // Menu or unlocked: just render normally
        renderer.render(scene, camera);
    }

    prevTime = time;
}
