import * as THREE from 'three';
import { COLORS } from './Constants_v2.js';
import { createWall, createCrate, createPillar, createGunModel, createGrenadeModel, createHumanoidModel, createBombSiteMarker } from './Factory.js';
import { TextureGenerator } from './TextureGenerator.js';

export const Maps = {
    'dust2': {
        spawnPoint: { x: 0, y: 18, z: 600 }, // CT Spawn area
        build: (scene, objects, enemies, droppedGuns, createEnemyFn, botsEnabled, teamsEnabled, peer, weaponsData, grenadesData) => {
            const bombsites = [];
            if (window.engine && window.engine.context) window.engine.context.bombsites = bombsites;

            // A Site Marker
            const aMarker = createBombSiteMarker('A');
            aMarker.position.set(800, 15, -800);
            scene.add(aMarker);
            objects.push(aMarker);
            bombsites.push(aMarker);

            // B Site Marker
            const bMarker = createBombSiteMarker('B');
            bMarker.position.set(-700, 10, -800);
            scene.add(bMarker);
            objects.push(bMarker);
            bombsites.push(bMarker);

            // Floor (The Sand)
            const floorGeometry = new THREE.PlaneGeometry(5000, 5000);
            floorGeometry.rotateX(-Math.PI / 2);
            const sandTex = TextureGenerator.createSandTexture();
            sandTex.repeat.set(125, 125);
            const floorMaterial = new THREE.MeshPhongMaterial({ map: sandTex });
            const floor = new THREE.Mesh(floorGeometry, floorMaterial);
            floor.receiveShadow = true;
            floor.userData.isGround = true;
            scene.add(floor);
            objects.push(floor);

            // Perimeter (Enclosing the whole scene)
            createWall(4000, 150, 20, 0, 75, -2000, COLORS.WALL_DEFAULT, scene, objects);
            createWall(4000, 150, 20, 0, 75, 2000, COLORS.WALL_DEFAULT, scene, objects);
            createWall(20, 150, 4000, -2000, 75, 0, COLORS.WALL_DEFAULT, scene, objects);
            createWall(20, 150, 4000, 2000, 75, 0, COLORS.WALL_DEFAULT, scene, objects);

            // Mid Pillars
            createPillar(20, 100, -200, 0, -200, scene, objects);
            createPillar(20, 100, 200, 0, -200, scene, objects);

            // --- CT SPAWN AREA (South/Positive Z) ---
            createWall(400, 40, 200, 0, 20, 800, 0xaaaaaa, scene, objects); // CT Ramp
            createWall(600, 80, 20, 0, 40, 950, COLORS.WALL_DEFAULT, scene, objects); // Back Wall CT

            // --- B SITE (West/Negative X) ---
            // B Platform
            createWall(300, 20, 300, -700, 10, -800, 0xaaaaaa, scene, objects); 
            // B Back Wall & Hole
            createWall(20, 80, 600, -900, 40, -800, COLORS.WALL_DEFAULT, scene, objects);
            createWall(300, 80, 20, -750, 40, -1100, COLORS.WALL_DEFAULT, scene, objects);
            // B Tunnels Exit
            createWall(20, 80, 200, -500, 40, -700, COLORS.WALL_DEFAULT, scene, objects);
            // Strategic B Crates
            createCrate(40, -700, 30, -800, scene, objects); // Center Crate B
            createCrate(30, -850, 25, -950, scene, objects);
            createCrate(30, -850, 55, -950, scene, objects);
            createPillar(15, 60, -600, 0, -950, scene, objects);

            // --- MID AREA ---
            // Mid Doors (Double Doors)
            createWall(80, 100, 10, -40, 50, -100, 0x554433, scene, objects); // Left Door
            createWall(80, 100, 10, 40, 50, -100, 0x554433, scene, objects);  // Right Door
            // Xbox
            createCrate(45, 0, 22.5, -250, scene, objects);
            // Catwalk
            createWall(200, 10, 600, 200, 40, -400, 0x999999, scene, objects);
            createWall(20, 60, 600, 300, 70, -400, COLORS.WALL_DEFAULT, scene, objects); // Catwalk Wall
            
            // --- A SITE (East/Positive X) ---
            // A Platform
            createWall(400, 30, 300, 800, 15, -800, 0xaaaaaa, scene, objects);
            // A Short (stairs area)
            createWall(200, 20, 100, 600, 10, -500, 0x999999, scene, objects);
            // A Long
            createWall(20, 80, 1000, 1100, 40, 0, COLORS.WALL_DEFAULT, scene, objects);
            createWall(400, 80, 20, 900, 40, 500, COLORS.WALL_DEFAULT, scene, objects); // Long Corner
            // Pit
            createWall(300, 5, 300, 900, 2.5, 800, 0x665544, scene, objects);
            
            // Strategic A Crates
            createCrate(40, 800, 55, -800, scene, objects);
            createCrate(40, 700, 35, -700, scene, objects);
            createPillar(15, 80, 1000, 0, -850, scene, objects);

            // --- T SPAWN AREA (North/Negative Z) ---
            createWall(600, 80, 20, 0, 40, -1800, COLORS.WALL_DEFAULT, scene, objects); // T Spawn Back Wall
            createWall(20, 80, 400, -300, 40, -1600, COLORS.WALL_DEFAULT, scene, objects); // T Ramp Side
            createWall(20, 80, 400, 300, 40, -1600, COLORS.WALL_DEFAULT, scene, objects);  // T Ramp Side

            // --- TUNNELS ---
            // Upper Tunnels
            createWall(400, 100, 20, -600, 50, -400, 0x333333, scene, objects); // Tunnel Wall
            createWall(20, 100, 400, -800, 50, -600, 0x333333, scene, objects); // Tunnel Wall
            // Lower Tunnels
            createWall(200, 100, 20, -300, 50, -250, 0x333333, scene, objects);

            // Additional Scatter Crates for cover
            for(let i=0; i<30; i++) {
                const x = Math.random() * 3000 - 1500;
                const z = Math.random() * 3000 - 1500;
                // Avoid spawns and sites for random crates
                if (Math.abs(x) > 200 || Math.abs(z) < 600) {
                    createCrate(20, x, 10, z, scene, objects);
                }
            }

            // Enemies (Team-based Spawning)
            if (botsEnabled && !peer) {
                for (let i = 0; i < 20; i++) {
                    const isT = i < 10;
                    const team = isT ? 'B' : 'A';
                    // T's spawn North, CT's spawn South
                    const spawnX = Math.random() * 400 - 200;
                    const spawnZ = isT ? -1600 + Math.random() * 200 : 800 + Math.random() * 200;
                    
                    const enemy = createEnemyFn(spawnX, 0, spawnZ, team);
                    // Give them a target towards the other side or a site
                    const targetX = Math.random() * 1600 - 800;
                    const targetZ = isT ? 400 : -400;
                    enemy.userData.targetPos = new THREE.Vector3(targetX, 0, targetZ);
                }
            }
        }
    },
    'training': {
        spawnPoint: { x: 0, y: 25, z: -100 },
        build: (scene, objects, enemies, droppedGuns, createEnemyFn, botsEnabled, teamsEnabled, peer, weaponsData, grenadesData) => {
            console.log("BUILDING UPDATED TRAINING MAP V4 - Systems Active");
            // Training Facility (Compact Scale)
            
            // Ground (Concrete) - Using createWall for solid collision
            const floorWidth = 1000;
            const floorDepth = 1200;
            
            // Revert floor to use concrete texture
            const floorWall = createWall(floorWidth, 10, floorDepth, 0, -5, 250, 0xaaaaaa, scene, objects);
            // Apply concrete texture if possible (createWall usually clones textures based on color)
            // But let's ensure it looks right
            
            // Perimeter Walls
            createWall(floorWidth, 100, 20, 0, 50, -350, COLORS.WALL_DEFAULT, scene, objects); // Back Wall
            createWall(floorWidth, 100, 20, 0, 50, 850, COLORS.WALL_DEFAULT, scene, objects);  // Far Wall
            createWall(20, 100, floorDepth, -500, 50, 250, COLORS.WALL_DEFAULT, scene, objects); // Left Wall
            createWall(20, 100, floorDepth, 500, 50, 250, COLORS.WALL_DEFAULT, scene, objects);  // Right Wall

            // --- SECTION 1: CENTRAL HUB (EQUIPMENT) ---
            // Equipment pad
            createWall(400, 5, 200, 0, 2.5, -150, 0x554433, scene, objects);
            
            // Group weapons by type
            const weaponsByType = {
                'pistol': [],
                'smg': [],
                'rifle': [],
                'sniper': [],
                'shotgun': [],
                'heavy': []
            };

            Object.keys(weaponsData).forEach(key => {
                const type = weaponsData[key].type || 'pistol';
                if (weaponsByType[type]) {
                    weaponsByType[type].push(key);
                }
            });

            const typeOrder = ['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'heavy'];
            let mountIdx = 0;
            const backWallZ = -340; // Mount guns on the back wall

            typeOrder.forEach((type, typeIdx) => {
                const keys = weaponsByType[type];
                keys.forEach((key, keyIdx) => {
                    const x = (mountIdx - 9.5) * 40; // Spread across the wall
                    const y = 30; // Height on the wall
                    
                    // Small wall mount shelf
                    createWall(30, 2, 10, x, y - 5, backWallZ + 10, 0x444444, scene, objects);
                    
                    const pickup = createGunModel(key, false);
                    pickup.scale.set(15, 15, 15);
                    pickup.position.set(x, y, backWallZ + 15);
                    pickup.rotation.set(0, Math.PI / 2, 0); // Flat against wall
                    pickup.userData.isPickup = true;
                    pickup.userData.weaponKey = key;
                    pickup.userData.ammoAmount = weaponsData[key].magSize * 5;
                    scene.add(pickup);
                    droppedGuns.push(pickup);
                    
                    mountIdx++;
                });
                // Add a small gap between types
                mountIdx += 0.5;
            });

            // Grenade Station (also on wall or nearby)
            const grenadeKeys = Object.keys(grenadesData);
            grenadeKeys.forEach((key, idx) => {
                const x = (idx - (grenadeKeys.length / 2)) * 40 + 350;
                const z = -330;
                const y = 25;
                createWall(25, 2, 10, x, y - 5, z, 0x333333, scene, objects);
                const pickup = createGrenadeModel(false, key);
                pickup.scale.set(30, 30, 30);
                pickup.position.set(x, y, z + 5);
                pickup.userData.isPickup = true;
                pickup.userData.grenadeKey = key;
                pickup.userData.count = 10;
                scene.add(pickup);
                droppedGuns.push(pickup);
            });

            // --- SECTION 2: SHOOTING RANGE (NORTH) ---
            // Wall removed from here
            const laneWidth = 80;
            const numLanes = 5;
            for(let i=0; i<=numLanes; i++) {
                const x = (i - numLanes/2) * laneWidth;
                createWall(5, 50, 600, x, 25, 350, 0x999999, scene, objects);
            }

            for(let lane=0; lane<numLanes; lane++) {
                const laneX = (lane - (numLanes-1)/2) * laneWidth;
                const dists = [200, 400, 600];
                dists.forEach(z => {
                    const offset = (Math.random() - 0.5) * 40;
                    const isStationary = z < 500;
                    const enemy = createEnemyFn(laneX + offset, 0, z, 'A', { 
                        isStationary: isStationary,
                        isCrouched: Math.random() > 0.8
                    });
                    if (!isStationary) {
                        enemy.userData.targetPos = new THREE.Vector3(laneX - 30, 0, z);
                        enemy.userData.laneX = laneX;
                        enemy.userData.isPacer = true;
                    }
                    if (Math.random() > 0.6) createCrate(15, laneX + offset, 7.5, z - 20, scene, objects);
                });
            }

            // --- SECTION 3: KILL HOUSE (EAST) ---
            const khX = 350;
            const khZ = 400;
            createWall(250, 5, 400, khX, 2.5, khZ, 0x777777, scene, objects);
            createWall(250, 80, 10, khX, 40, khZ - 200, 0x555555, scene, objects);
            createWall(250, 80, 10, khX, 40, khZ + 200, 0x555555, scene, objects);
            createWall(10, 80, 400, khX - 125, 40, khZ, 0x555555, scene, objects);
            createWall(10, 80, 400, khX + 125, 40, khZ, 0x555555, scene, objects);
            createWall(150, 80, 10, khX + 50, 40, khZ, 0x666666, scene, objects);
            createEnemyFn(khX + 80, 0, khZ - 150, 'A', { isStationary: true });
            createEnemyFn(khX - 80, 0, khZ + 150, 'A', { isStationary: true });

            // --- SECTION 4: PARKOUR (WEST) ---
            const pkX = -350;
            const pkZ = 400;
            createWall(200, 10, 80, pkX, 5, pkZ - 150, 0x444444, scene, objects);
            for(let i=0; i<6; i++) {
                const x = pkX + (Math.random() - 0.5) * 100;
                const z = pkZ - 50 + i * 80;
                const h = 10 + i * 8;
                if (Math.random() > 0.5) createCrate(20, x, h/2, z, scene, objects);
                else createPillar(12, h, x, 0, z, scene, objects);
            }
            createWall(150, 80, 80, pkX, 40, pkZ + 450, 0x555555, scene, objects);
            const reward = createGunModel('AWP', false);
            reward.position.set(pkX, 85, pkZ + 450);
            reward.scale.set(15, 15, 15);
            reward.userData.isPickup = true;
            reward.userData.weaponKey = 'AWP';
            reward.userData.ammoAmount = 30;
            scene.add(reward);
            droppedGuns.push(reward);
        }
    }

};
