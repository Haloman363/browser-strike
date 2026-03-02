import * as THREE from 'three';
import { System } from '../core/System.js';
import { GameState } from '../GameState.js';
import { WEAPONS_DATA, GRENADES_DATA } from '../Constants.js';
import { createBloodSplatter, createImpactEffect } from '../Weapon.js';

export class WeaponSystem extends System {
    constructor(engine) {
        super(engine);
        this.lastFireTime = 0;
        this.recoil = 0;
        this.cameraRecoilX = 0;
        this.isFiring = false;
        this.inventory = null; // Will be synced from GameState or main
        this.objects = []; // For raycasting
    }

    init() {
        console.log("WeaponSystem initialized");
        // Sync with engine context if available
        this.objects = this.engine.context.objects || [];

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
    }

    update(delta, time) {
        // Handle recoil recovery
        if (this.recoil > 0) {
            this.recoil -= delta * 0.5;
            if (this.recoil < 0) this.recoil = 0;
        }
        if (this.cameraRecoilX > 0) {
            this.cameraRecoilX -= delta * 0.5;
            if (this.cameraRecoilX < 0) this.cameraRecoilX = 0;
        }

        // Handle auto-firing if mouse is down
        if (this.isFiring) {
            this.shoot();
        }
    }

    setFiring(isFiring) {
        this.isFiring = isFiring;
    }

    shoot() {
        const currentSlot = GameState.get('currentSlot');
        const ammoInClip = GameState.get('ammoInClip');
        const weaponKey = GameState.get('currentWeaponName'); // Or some key to WEAPONS_DATA
        const weaponData = WEAPONS_DATA[weaponKey] || WEAPONS_DATA['GLOCK'];

        if (ammoInClip <= 0) {
            // Play click sound via engine/soundEngine
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

        // Update Ammo
        GameState.set({ ammoInClip: ammoInClip - 1 });
        
        // Play Shoot Sound
        if (this.engine.context.soundEngine) {
            this.engine.context.soundEngine.playShoot();
        }

        // Notify systems
        this.engine.emit('weapon:fired', { weaponKey, weaponData });

        // Add recoil
        this.recoil = Math.min(this.recoil + weaponData.recoil, 0.2);
        this.cameraRecoilX += weaponData.recoil * 0.5;

        // Raycasting for hits
        const numPellets = weaponData.pellets || 1;
        const scene = this.engine.scene;
        const camera = this.engine.camera;
        const bloodParticles = this.engine.context.bloodParticles || [];
        const impactParticles = this.engine.context.impactParticles || [];

        for (let i = 0; i < numPellets; i++) {
            const shootRaycaster = new THREE.Raycaster();
            
            const spreadVal = weaponData.spread || 0.02;
            const spread = new THREE.Vector2(
                (Math.random() - 0.5) * spreadVal,
                (Math.random() - 0.5) * spreadVal
            );
            
            shootRaycaster.setFromCamera(spread, camera);
            const intersects = shootRaycaster.intersectObjects(this.objects);

            if (intersects.length > 0) {
                const hitPart = intersects[0].object;
                this.handleHit(hitPart, intersects[0].point, weaponData);
            }
        }

        if (!weaponData.isAutomatic) {
            this.isFiring = false;
        }
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
            if (this.engine.context.soundEngine) {
                this.engine.context.soundEngine.playImpact();
            }
        }
    }
}
