import * as THREE from 'three';
import { System } from '../core/System.js';
import { GameState } from '../GameState.js';
import { BOMB_SETTINGS } from '../Constants_v2.js';
import { createC4Model } from '../Factory.js';

export class BombSystem extends System {
    static systemName = 'BombSystem';
    constructor(engine) {
        super(engine);
        this.plantedBomb = null;
        this.timer = 0;
        this.lastBeepTime = 0;
    }

    init() {
        console.log("BombSystem initialized");
        this.engine.on('bomb:planted', (data) => this.onBombPlanted(data));
    }

    onBombPlanted(data) {
        console.log("Bomb planted at", data.position);
        
        // Spawn world bomb model
        const worldBomb = createC4Model(false);
        worldBomb.position.copy(data.position);
        worldBomb.position.y = 1; // On ground
        this.engine.scene.add(worldBomb);
        this.plantedBomb = worldBomb;
        
        this.timer = BOMB_SETTINGS.EXPLODE_TIME / 1000;
        this.lastBeepTime = performance.now();
        
        // Play plant sound if available
        if (this.engine.context.soundEngine) {
            this.engine.context.soundEngine.playLand(); // Placeholder for plant sound
        }
    }

    update(delta, time) {
        if (!GameState.get('bombPlanted') || GameState.get('bombExploded')) return;

        this.timer -= delta;
        GameState.set({ bombTimeLeft: Math.max(0, Math.ceil(this.timer)) });

        // Beeping logic
        const beepInterval = this.timer > 10 ? 1000 : (this.timer > 5 ? 500 : 250);
        if (performance.now() - this.lastBeepTime > beepInterval) {
            this.lastBeepTime = performance.now();
            this.beep();
        }

        if (this.timer <= 0) {
            this.explode();
        }
    }

    beep() {
        if (this.plantedBomb) {
            const led = this.plantedBomb.getObjectByName('led');
            if (led) {
                led.material.color.set(0xffffff);
                setTimeout(() => {
                    if (led.material) led.material.color.set(0xff0000);
                }, 100);
            }
        }
        
        if (this.engine.context.soundEngine) {
            // this.engine.context.soundEngine.playBeep(); // Need to add this
        }
    }

    explode() {
        GameState.set({ bombExploded: true });
        console.log("BOMB EXPLODED!");
        
        if (this.plantedBomb) {
            const pos = this.plantedBomb.position.clone();
            
            // Trigger explosion visual/damage (reusing grenade logic if possible)
            // For now, let's just log and maybe add a big sphere
            const explosionGeo = new THREE.SphereGeometry(BOMB_SETTINGS.EXPLOSION_RADIUS, 32, 32);
            const explosionMat = new THREE.MeshBasicMaterial({ 
                color: 0xffaa00, 
                transparent: true, 
                opacity: 0.5 
            });
            const explosion = new THREE.Mesh(explosionGeo, explosionMat);
            explosion.position.copy(pos);
            this.engine.scene.add(explosion);
            
            // Damage check
            const dist = this.engine.camera.position.distanceTo(pos);
            if (dist < BOMB_SETTINGS.EXPLOSION_RADIUS) {
                // takeDamage is global in main.js, we might need to emit an event
                this.engine.emit('player:damage', { 
                    amount: BOMB_SETTINGS.EXPLOSION_DAMAGE, 
                    source: 'bomb' 
                });
            }

            // Cleanup
            setTimeout(() => {
                this.engine.scene.remove(explosion);
                this.engine.scene.remove(this.plantedBomb);
                this.plantedBomb = null;
            }, 2000);
        }
    }
}
