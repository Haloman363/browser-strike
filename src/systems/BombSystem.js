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

        GameState.set({ 
            bombPlanted: true, 
            bombTimeLeft: Math.ceil(this.timer),
            bombDefused: false,
            bombExploded: false,
            defuseProgress: 0,
            isDefusing: false
        });
    }

    update(delta, time) {
        if (!GameState.get('bombPlanted') || GameState.get('bombExploded') || GameState.get('bombDefused')) return;

        this.timer -= delta;
        GameState.set({ bombTimeLeft: Math.max(0, Math.ceil(this.timer)) });

        // Defusal logic
        this.updateDefusal(delta);

        // Beeping logic
        const beepInterval = this.timer > 10 ? 1000 : (this.timer > 5 ? 500 : 250);
        if (performance.now() - this.lastBeepTime > (beepInterval / 1000)) {
            // Need to convert interval to seconds for comparison with delta-driven time or use absolute time
            // Let's use performance.now() which is easier for now, but update it in init/update
        }
        
        // Let's stick with performance.now() as it was.
        if (performance.now() - this.lastBeepTime > beepInterval) {
            this.lastBeepTime = performance.now();
            this.beep();
        }

        if (this.timer <= 0) {
            this.explode();
        }
    }

    updateDefusal(delta) {
        const input = this.engine.getSystem('InputSystem');
        const isDefuseKeyPressed = input && input.isKeyPressed('KeyB');
        
        // We use camera position as player position in this simplified architecture
        const playerPos = this.engine.camera.position;
        
        let canDefuse = false;
        if (this.plantedBomb) {
            const dist = playerPos.distanceTo(this.plantedBomb.position);
            if (dist < BOMB_SETTINGS.DEFUSE_RADIUS) {
                canDefuse = true;
            }
        }

        if (isDefuseKeyPressed && canDefuse) {
            const hasKit = GameState.get('hasDefuseKit');
            const defuseTime = hasKit ? 5 : 10;
            const progressInc = delta / defuseTime;
            
            let progress = GameState.get('defuseProgress') || 0;
            progress += progressInc;
            
            if (progress >= 1) {
                this.defuse();
            } else {
                GameState.set({ 
                    defuseProgress: progress, 
                    isDefusing: true 
                });
            }
        } else {
            if (GameState.get('defuseProgress') > 0) {
                GameState.set({ 
                    defuseProgress: 0, 
                    isDefusing: false 
                });
            }
        }
    }

    defuse() {
        GameState.set({ 
            bombDefused: true,
            defuseProgress: 1,
            isDefusing: false
        });
        console.log("BOMB DEFUSED!");
        this.engine.emit('bomb:defused');
        
        // Visual feedback
        if (this.plantedBomb) {
            const led = this.plantedBomb.getObjectByName('led');
            if (led && led.material) led.material.color.set(0x00ff00);
        }
    }

    beep() {
        if (this.plantedBomb) {
            const led = this.plantedBomb.getObjectByName('led');
            if (led && led.material) {
                led.material.color.set(0xffffff);
                setTimeout(() => {
                    if (led && led.material) led.material.color.set(0xff0000);
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
        this.engine.emit('bomb:exploded');
        
        if (this.plantedBomb) {
            const pos = this.plantedBomb.position.clone();
            
            // Trigger explosion visual
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
