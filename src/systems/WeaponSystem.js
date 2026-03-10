import * as THREE from 'three';
import { System } from '../core/System.js';
import { GameState } from '../GameState.js';
import { WEAPONS_DATA, GRENADES_DATA, PHYSICS } from '../Constants_v2.js';
import { WEAPON_RECIPES } from '../WeaponRecipes.js';
import { Utils } from '../Utils.js';
import { createBloodSplatter, createImpactEffect } from '../Weapon.js';

export class WeaponSystem extends System {
    static systemName = 'WeaponSystem';
    constructor(engine) {
        super(engine);
        this.lastFireTime = 0;
        this.recoil = 0;
        this.cameraRecoilX = 0;
        this.cameraRecoilY = 0;
        this.shotIndex = 0;
        this.currentSpread = 0;
        this.isFiring = false;
        this.inventory = null; // Will be synced from GameState or main
        this.objects = []; // For raycasting
    }

    giveWeapon(weaponKey) {
        const weaponData = WEAPONS_DATA[weaponKey] || GRENADES_DATA[weaponKey];
        
        if (!weaponData) {
            // Handle Gear
            if (weaponKey === 'VEST') {
                GameState.set({ health: 100 });
                console.log("Gave Kevlar Vest");
                return true;
            }
            if (weaponKey === 'VESTHELM') {
                GameState.set({ health: 100 });
                console.log("Gave Kevlar + Helmet");
                return true;
            }
            if (weaponKey === 'DEFUSE') {
                GameState.set({ hasDefuseKit: true });
                console.log("Gave Defuse Kit");
                return true;
            }
            return false;
        }

        // --- UTILITY LIMITS ---
        if (GRENADES_DATA[weaponKey]) {
            const utilityCount = { ...GameState.get('utilityCount') };
            const totalUtility = Object.values(utilityCount).reduce((a, b) => a + b, 0);
            
            // Total limit (4)
            if (totalUtility >= ECONOMY_SETTINGS.UTILITY_LIMIT_TOTAL) {
                console.warn("Max utility reached (4)");
                return false;
            }

            // Flashbang limit (2)
            if (weaponKey === 'FLASH' && utilityCount.FLASH >= ECONOMY_SETTINGS.UTILITY_LIMIT_FLASH) {
                console.warn("Max flashbangs reached (2)");
                return false;
            }

            // Individual limit (1 for others)
            if (weaponKey !== 'FLASH' && utilityCount[weaponKey] >= 1) {
                console.warn(`Already carrying ${weaponKey}`);
                return false;
            }

            utilityCount[weaponKey]++;
            GameState.set({ utilityCount });
        }

        // Determine slot
        let slot = weaponData.slot; 
        if (weaponData.type === 'rifle' || weaponData.type === 'heavy' || weaponData.type === 'sniper' || weaponData.type === 'smg' || weaponData.type === 'shotgun') {
            slot = 2; // Primary
        } else if (weaponData.type === 'pistol') {
            slot = 3; // Secondary
        } else if (weaponData.type === 'knife') {
            slot = 1;
        } else if (GRENADES_DATA[weaponKey]) {
            slot = 4;
        } else if (weaponData.type === 'utility') {
            slot = 5;
        }

        // Update GameState
        GameState.setInventorySlot(slot, weaponKey);
        
        // Update current weapon if it's Primary or Secondary
        if (slot === 2 || slot === 3) {
            this.engine.emit('input:keydown', `Digit${slot}`);
        }
        
        console.log(`WeaponSystem: Given ${weaponKey} to slot ${slot}`);

        // Notify main to update models if necessary
        this.engine.emit('weapon:purchased', { slot, weaponKey, weaponData });
        return true;
    }

    init() {
        console.log("WeaponSystem initialized");
        // Sync with engine context if available
        this.objects = this.engine.context.objects || [];

        this.engine.on('input:keydown', (code) => {
            if (code === 'KeyG') {
                this.dropWeapon();
            }
        });

        this.engine.on('input:mousedown', (button) => {
            if (button === 0) { // Left click
                this.setFiring(true);
            }
        });

        this.engine.on('input:mouseup', (button) => {
            if (button === 0) { // Left click
                this.setFiring(false);
            }
        });

        this.engine.on('weapon:hit_confirmed', (data) => {
            this.handleHitConfirmed(data);
        });
    }

    update(delta, time) {
        // Handle recoil recovery with framerate-independent smoothing
        const recoverySpeed = 10.0; 
        const decay = Math.exp(-recoverySpeed * delta);
        
        this.recoil *= decay;
        this.cameraRecoilX *= decay;
        this.cameraRecoilY *= decay;
        
        // Decay current spread back to base
        const weaponKey = GameState.get('currentWeaponKey');
        const weaponData = WEAPONS_DATA[weaponKey] || WEAPONS_DATA['GLOCK'];
        const baseSpread = weaponData.spread || 0.02;
        
        if (this.currentSpread > baseSpread) {
            this.currentSpread = baseSpread + (this.currentSpread - baseSpread) * decay;
        } else {
            this.currentSpread = baseSpread;
        }

        // Handle auto-firing if mouse is down
        if (this.isFiring) {
            this.shoot();
        }
    }

    setFiring(isFiring) {
        this.isFiring = isFiring;
        if (!isFiring) {
            this.shotIndex = 0;
        }
    }

    dropWeapon() {
        const currentSlot = GameState.get('currentSlot');
        const weaponKey = GameState.get('currentWeaponKey');
        
        // Cannot drop knife (slot 1)
        if (currentSlot === 1) return;
        
        const inventory = GameState.get('inventory');
        if (!inventory[currentSlot]) return;

        console.log(`Dropping weapon: ${weaponKey} from slot ${currentSlot}`);

        // Notify world to spawn pickup
        const camera = this.engine.camera;
        const dropPos = camera.position.clone();
        const dropDir = new THREE.Vector3();
        camera.getWorldDirection(dropDir);
        
        this.engine.emit('weapon:dropped', {
            weaponKey,
            position: dropPos,
            direction: dropDir,
            ammoInClip: GameState.get('ammoInClip'),
            ammoTotal: GameState.get('ammoTotal')
        });

        // Remove from GameState inventory
        const newInventory = { ...inventory };
        newInventory[currentSlot] = null;
        GameState.set({ inventory: newInventory });

        // Switch to knife (slot 1) automatically
        this.engine.emit('input:keydown', 'Digit1');
    }

    calculateSpread() {
        const weaponKey = GameState.get('currentWeaponKey');
        const weaponData = WEAPONS_DATA[weaponKey] || WEAPONS_DATA['GLOCK'];
        const recipe = WEAPON_RECIPES[weaponKey] || WEAPON_RECIPES['GLOCK'];
        
        const baseSpread = weaponData.spread || 0.02;
        const moveInaccuracy = recipe.moveInaccuracy || 0.05;
        
        const pc = this.engine.getSystem('PlayerControllerSystem');
        let velocityLength = 0;
        let isCrouching = false;
        let isOnLadder = false;
        
        if (pc) {
            velocityLength = pc.velocity.length();
            isCrouching = pc.isCrouching;
            isOnLadder = pc.isOnLadder;
        }
        
        let totalSpread = baseSpread + (velocityLength * moveInaccuracy);
        
        if (isCrouching) {
            totalSpread *= 0.5;
        }

        if (isOnLadder) {
            totalSpread *= PHYSICS.LADDER_SPREAD_MULTIPLIER;
        }
        
        return totalSpread;
    }

    getRecoilPunch() {
        const weaponKey = GameState.get('currentWeaponKey');
        const recipe = WEAPON_RECIPES[weaponKey] || WEAPON_RECIPES['GLOCK'];
        const pattern = recipe.recoilPattern || [{x: 0, y: 0.1}];
        
        return pattern[this.shotIndex % pattern.length];
    }

    shoot() {
        const currentSlot = GameState.get('currentSlot');
        const ammoInClip = GameState.get('ammoInClip');
        const weaponKey = GameState.get('currentWeaponKey');
        const weaponData = WEAPONS_DATA[weaponKey] || WEAPONS_DATA['GLOCK'];

        if (ammoInClip <= 0) {
            if (this.engine.context.soundEngine) {
                this.engine.context.soundEngine.playClick(performance.now());
            }
            this.isFiring = false;
            return;
        }

        const now = performance.now();
        const fireRateMs = 60000 / weaponData.fireRate;

        if (now - this.lastFireTime < fireRateMs) {
            return;
        }

        this.lastFireTime = now;

        // Calculate and set current spread for UI
        this.currentSpread = this.calculateSpread();

        // Update shot index for recoil pattern
        const punch = this.getRecoilPunch();
        this.shotIndex++;

        // Update Ammo
        GameState.set({ ammoInClip: ammoInClip - 1 });
        
        // Play Shoot Sound
        if (this.engine.context.soundEngine) {
            this.engine.context.soundEngine.playShoot(weaponData);
        }

        // Notify systems
        this.engine.emit('weapon:fired', { weaponKey, weaponData });

        // Add recoil (visual punch)
        this.cameraRecoilX += punch.y * 0.1;
        this.cameraRecoilY += punch.x * 0.1;

        // Authoritative Shooting: Send SHOOT request to NetworkSystem
        const network = this.engine.getSystem('NetworkSystem');
        if (network) {
            const timestamp = network.getServerTime();
            const camera = this.engine.camera;
            const origin = camera.position.clone();
            
            // Apply Gaussian spread to direction
            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            
            if (this.currentSpread > 0) {
                const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
                const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
                
                const spreadX = Utils.getGaussian(this.currentSpread);
                const spreadY = Utils.getGaussian(this.currentSpread);
                
                direction.addScaledVector(right, spreadX);
                direction.addScaledVector(up, spreadY);
                direction.normalize();
            }

            network.send('SHOOT', {
                timestamp,
                origin,
                direction,
                weaponKey
            }, true);
        }

        if (!weaponData.isAutomatic) {
            this.isFiring = false;
        }
    }

    handleHitConfirmed(data) {
        const { targetId, damage, point, isHeadshot, weaponKey } = data;
        const scene = this.engine.scene;
        const bloodParticles = this.engine.context.bloodParticles || [];
        const impactParticles = this.engine.context.impactParticles || [];

        // Visual confirmation of hit (blood)
        createBloodSplatter(point, scene, bloodParticles);
        
        // If we want to show damage or other feedback locally:
        console.log(`Confirmed hit on ${targetId} for ${damage} damage (headshot: ${isHeadshot})`);
    }

    handleHit(hitPart, point, weaponData) {
        const scene = this.engine.scene;
        const bloodParticles = this.engine.context.bloodParticles || [];
        const impactParticles = this.engine.context.impactParticles || [];

        if (hitPart.userData.isEnemy && hitPart.userData.parentEnemy) {
            const enemy = hitPart.userData.parentEnemy;
            // Additional checks for teams could be here
            
            if (enemy.userData.alive) {
                createBloodSplatter(point, scene, bloodParticles);
                let damage = weaponData.damage;
                if (hitPart.userData.isHeadshot) damage *= weaponData.headshotMultiplier;
                
                // Signal hit (either via direct modification or an event)
                this.engine.emit('entity:hit', { entity: enemy, damage, point, isHeadshot: hitPart.userData.isHeadshot });
            }
        } else {
            let impactColor = 0x888888;
            if (hitPart.userData.isCrate) impactColor = 0x8b4513;
            if (hitPart.userData.isGround) impactColor = 0xd2b48c;
            
            createImpactEffect(point, scene, impactParticles, impactColor);
            
            // Handle destructible environment objects
            if (hitPart.userData.isDestructible) {
                this.engine.emit('environment:hit', { 
                    id: hitPart.userData.id, 
                    damage: weaponData.damage, 
                    point: point,
                    object: hitPart
                });
            }

            if (this.engine.context.soundEngine) {
                let surface = 'concrete';
                if (hitPart.userData.isCrate) surface = 'wood';
                if (hitPart.userData.isGround) surface = 'sand';
                this.engine.context.soundEngine.playImpact(surface);
            }
        }
    }
}
