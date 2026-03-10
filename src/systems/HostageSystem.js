import * as THREE from 'three';
import { System } from '../core/System.js';
import { GameState } from '../GameState.js';
import { createHostageModel } from '../Factory.js';

export class HostageSystem extends System {
    static systemName = 'HostageSystem';

    constructor(engine) {
        super(engine);
        this.hostages = [];
        this.rescueZones = [];
        this.interactionRadius = 30;
        this.followDistance = 40;
    }

    init() {
        console.log("HostageSystem initialized");
        
        this.engine.on('input:keydown', (code) => {
            if (code === 'KeyE') {
                this.tryInteract();
            }
        });

        this.engine.on('round:reset', () => this.onRoundReset());
    }

    onRoundReset() {
        this.hostages.forEach(h => {
            h.userData.leader = null;
            h.userData.isRescued = false;
            if (h.userData.spawnPos) {
                h.position.copy(h.userData.spawnPos);
            }
        });
    }

    spawnHostage(x, y, z) {
        const model = createHostageModel();
        model.position.set(x, y, z);
        
        model.userData.type = 'hostage';
        model.userData.spawnPos = new THREE.Vector3(x, y, z);
        model.userData.leader = null;
        model.userData.isRescued = false;
        model.userData.health = 100;
        
        this.engine.scene.add(model);
        this.hostages.push(model);
        return model;
    }

    addRescueZone(position, radius = 100) {
        this.rescueZones.push({ position, radius });
    }

    tryInteract() {
        const camera = this.engine.camera;
        if (!camera || GameState.get('playerTeam') !== 'A') return; // Only CTs rescue

        for (const hostage of this.hostages) {
            if (hostage.userData.isRescued) continue;

            const dist = camera.position.distanceTo(hostage.position);
            if (dist < this.interactionRadius) {
                if (hostage.userData.leader === 'player') {
                    hostage.userData.leader = null;
                    console.log("Hostage told to stay.");
                } else {
                    hostage.userData.leader = 'player';
                    console.log("Hostage is following you!");
                    this.engine.context.soundEngine.playUIClick(); // Temp sound
                }
                break;
            }
        }
    }

    update(delta) {
        const camera = this.engine.camera;
        if (!camera) return;

        this.hostages.forEach(hostage => {
            if (hostage.userData.isRescued) return;

            if (hostage.userData.leader === 'player') {
                const dist = hostage.position.distanceTo(camera.position);
                
                if (dist > this.followDistance) {
                    // Simple move towards player
                    const dir = new THREE.Vector3().subVectors(camera.position, hostage.position).normalize();
                    dir.y = 0;
                    
                    const moveSpeed = 800 * delta;
                    hostage.position.add(dir.multiplyScalar(moveSpeed));
                    
                    // Simple face player
                    hostage.lookAt(camera.position.x, hostage.position.y, camera.position.z);
                }

                // Check Rescue Zones
                for (const zone of this.rescueZones) {
                    if (hostage.position.distanceTo(zone.position) < zone.radius) {
                        this.rescueHostage(hostage);
                        break;
                    }
                }
            }
        });
    }

    rescueHostage(hostage) {
        hostage.userData.isRescued = true;
        hostage.userData.leader = null;
        hostage.visible = false; // "Extracted"
        
        console.log("Hostage Rescued!");
        this.engine.emit('hostage:rescued', { hostage });
        
        // Award cash
        const currentCash = GameState.get('cash');
        GameState.set({ cash: Math.min(currentCash + 1000, 16000) });

        // Check if all hostages are rescued
        const allRescued = this.hostages.every(h => h.userData.isRescued);
        if (allRescued) {
            this.engine.emit('round:win', { winner: 'A', type: 'hostage' });
        }
    }
}
