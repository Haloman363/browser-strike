import * as THREE from 'three';
import { COLORS, WEAPONS_DATA, GRENADES_DATA } from './Constants.js';
import { createWall, createCrate, createPillar, createGunModel, createGrenadeModel, createHumanoidModel } from './Factory.js';
import { TextureGenerator } from './TextureGenerator.js';

export const Maps = {
    'dust2': {
        spawnPoint: { x: 0, y: 18, z: 600 }, // CT Spawn area
        build: (scene, objects, enemies, droppedGuns, createEnemyFn, botsEnabled, teamsEnabled, peer) => {
            // ... (rest of the imports) ...
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
        spawnPoint: { x: 0, y: 18, z: -50 },
        build: (scene, objects, enemies, droppedGuns, createEnemyFn, botsEnabled, teamsEnabled, peer) => {
            // Training Shooting Range (Resized & Compact)
            
            // Ground (Concrete)
            const floorWidth = 1000;
            const floorDepth = 1200;
            const floorGeo = new THREE.PlaneGeometry(floorWidth, floorDepth);
            floorGeo.rotateX(-Math.PI / 2);
            const concreteTex = TextureGenerator.createConcreteTexture();
            concreteTex.repeat.set(20, 24);
            const floorMat = new THREE.MeshPhongMaterial({ map: concreteTex });
            const floor = new THREE.Mesh(floorGeo, floorMat);
            floor.receiveShadow = true;
            floor.userData.isGround = true;
            floor.position.set(0, 0, 350); 
            scene.add(floor);
            objects.push(floor);

            // Perimeter Walls
            createWall(floorWidth, 100, 20, 0, 50, -250, 0xaaaaaa, scene, objects); // Back Wall
            createWall(floorWidth, 100, 20, 0, 50, 950, 0xaaaaaa, scene, objects);  // Far Wall
            createWall(20, 100, floorDepth, -500, 50, 350, 0xaaaaaa, scene, objects); // Left Wall
            createWall(20, 100, floorDepth, 500, 50, 350, 0xaaaaaa, scene, objects);  // Right Wall

            // Shooting Stations (Gun Counter)
            const weaponKeys = Object.keys(WEAPONS_DATA);
            weaponKeys.forEach((key, idx) => {
                const x = (idx - (weaponKeys.length / 2)) * 35;
                const z = -120;
                
                // Station counter
                createWall(30, 10, 15, x, 5, z, 0x555555, scene, objects);
                
                const pickup = createGunModel(key, false);
                pickup.scale.set(15, 15, 15);
                pickup.position.set(x, 12, z);
                pickup.rotation.set(0, Math.PI / 2, Math.PI / 2);
                pickup.userData.isPickup = true;
                pickup.userData.weaponKey = key;
                pickup.userData.ammoAmount = WEAPONS_DATA[key].magSize * 5;
                scene.add(pickup);
                droppedGuns.push(pickup);
            });

            // Grenade Station (Smaller Counter)
            const grenadeKeys = Object.keys(GRENADES_DATA);
            grenadeKeys.forEach((key, idx) => {
                const x = (idx - (grenadeKeys.length / 2)) * 30;
                const z = -180;
                
                // Station counter
                createWall(25, 10, 15, x, 5, z, 0x444444, scene, objects);
                
                const pickup = createGrenadeModel(false, key);
                pickup.scale.set(30, 30, 30);
                pickup.position.set(x, 15, z);
                pickup.userData.isPickup = true;
                pickup.userData.grenadeKey = key;
                pickup.userData.count = 10;
                scene.add(pickup);
                droppedGuns.push(pickup);
            });

            // Target Lane Walls (Dividers)
            const dividerPositions = [-300, -100, 100, 300];
            dividerPositions.forEach(x => {
                createWall(5, 80, 800, x, 40, 500, 0x999999, scene, objects);
            });

            // Varied Enemies in Lanes
            const targetZPositions = [200, 350, 500, 650, 800];
            const targetXLanes = [-400, -200, 0, 200, 400];
            
            targetXLanes.forEach(laneX => {
                targetZPositions.forEach(distZ => {
                    const isCrouched = Math.random() > 0.6;
                    const isObscured = Math.random() > 0.4;
                    const offset = (Math.random() - 0.5) * 40;
                    
                    const enemy = createEnemyFn(laneX + offset, 0, distZ, 'A', { isStationary: true, isCrouched: isCrouched });
                    
                    if (isObscured) {
                         const coverType = Math.random();
                         const coverX = laneX + offset;
                         if (coverType > 0.6) {
                             // Small Crate for head-glitch or crouch cover
                             createCrate(12, coverX, 6, distZ - 10, scene, objects);
                         } else if (coverType > 0.3) {
                             // Half height wall
                             createWall(35, 12, 5, coverX, 6, distZ - 8, 0x777777, scene, objects);
                         } else {
                             // Vertical pillar to peek from
                             createWall(10, 30, 10, coverX - 15, 15, distZ - 5, 0x666666, scene, objects);
                         }
                    }
                });
            });
        }
    }
};
