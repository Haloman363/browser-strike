import { System } from '../core/System.js';
import { GameState } from '../GameState.js';

export class UISystem extends System {
    static systemName = 'UISystem';
    constructor(engine) {
        super(engine);
        this.domElements = {
            health: document.getElementById('health'),
            ammo: document.getElementById('ammo'),
            weapon: document.getElementById('weapon-name'),
            kills: document.getElementById('alive-count'),
            cash: document.getElementById('wallet'),
            bombAlert: document.getElementById('bomb-alert'),
            bombTimer: document.getElementById('timer'),
            plantContainer: document.getElementById('plant-progress-container'),
            plantBar: document.getElementById('plant-progress-bar'),
            pickupPrompt: document.getElementById('pickup-prompt'),
            backend: document.getElementById('backend-label'),
            crosshair: document.getElementById('crosshair')
        };
    }

    init() {
        console.log("UISystem initialized");

        if (this.domElements.backend) {
            this.domElements.backend.innerText = `Backend: ${this.engine.backend}`;
            this.domElements.backend.style.color = this.engine.backend === 'WebGPU' ? '#00ff00' : '#ff9d00';
        }
        
        GameState.on('change:health', (val) => this.updateElement('health', val));
        GameState.on('change:ammoInClip', () => this.updateAmmo());
        GameState.on('change:ammoTotal', () => this.updateAmmo());
        GameState.on('change:currentWeaponName', (val) => this.updateElement('weapon', val));
        GameState.on('change:playerKills', (val) => this.updateElement('kills', val));
        GameState.on('change:cash', (val) => this.updateElement('cash', `$${val}`));

        // Bomb Sites
        GameState.on('change:atBombSite', (site) => this.updateBombSitePrompt(site));
        GameState.on('change:currentNearPickup', (pickup) => this.updatePickupPrompt(pickup));
        GameState.on('change:bombPlanting', (planting) => this.updatePlantingUI(planting));
        GameState.on('change:bombPlantProgress', (progress) => this.updatePlantingProgress(progress));
        GameState.on('change:bombPlanted', (planted) => this.updateBombPlantedUI(planted));
        GameState.on('change:bombTimeLeft', (time) => this.updateBombTimer(time));

        this.fullUpdate();
    }

    update(delta, time) {
        // Handle elements that might need frequent updates
        
        // Update Dynamic Crosshair
        if (this.domElements.crosshair) {
            const weaponSystem = this.engine.getSystem('WeaponSystem');
            if (weaponSystem) {
                // Scale spread to pixels (e.g. 0.02 base spread * 500 = 10px gap)
                const gap = Math.max(2, weaponSystem.currentSpread * 500);
                this.domElements.crosshair.style.setProperty('--crosshair-gap', `${gap}px`);
            }
        }
    }

    updateBombSitePrompt(site) {
        if (!this.domElements.pickupPrompt) return;
        
        const hasC4 = GameState.get('currentWeapon') === 'c4';
        const alreadyPlanted = GameState.get('bombPlanted');

        if (site && hasC4 && !alreadyPlanted) {
            this.domElements.pickupPrompt.innerHTML = `PRESS <span style="background: #ff9d00; color: #000; padding: 2px 8px; border-radius: 3px;">E</span> TO PLANT AT SITE ${site}`;
            this.domElements.pickupPrompt.style.display = 'block';
        } else {
            this.updatePickupPrompt(GameState.get('currentNearPickup'));
        }
    }

    updatePickupPrompt(pickup) {
        if (!this.domElements.pickupPrompt) return;
        if (GameState.get('atBombSite') && GameState.get('currentWeapon') === 'c4' && !GameState.get('bombPlanted')) return;

        if (pickup && pickup.userData.weaponKey) {
            const wName = pickup.userData.weaponKey;
            this.domElements.pickupPrompt.innerHTML = `PRESS <span style="background: #ff9d00; color: #000; padding: 2px 8px; border-radius: 3px;">E</span> TO SWAP FOR ${wName}`;
            this.domElements.pickupPrompt.style.display = 'block';
        } else {
            this.domElements.pickupPrompt.style.display = 'none';
        }
    }

    updatePlantingUI(planting) {
        if (this.domElements.plantContainer) {
            this.domElements.plantContainer.style.display = planting ? 'block' : 'none';
        }
    }

    updatePlantingProgress(progress) {
        if (this.domElements.plantBar) {
            this.domElements.plantBar.style.width = `${progress * 100}%`;
        }
    }

    updateBombPlantedUI(planted) {
        if (this.domElements.bombAlert) {
            this.domElements.bombAlert.style.display = planted ? 'block' : 'none';
            if (planted && this.domElements.bombTimer) {
                this.domElements.bombTimer.style.display = 'block';
                this.domElements.bombTimer.style.color = '#ff0000';
            }
        }
    }

    updateBombTimer(timeLeft) {
        if (this.domElements.bombTimer && GameState.get('bombPlanted')) {
            const mins = Math.floor(timeLeft / 60);
            const secs = timeLeft % 60;
            this.domElements.bombTimer.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
    }

    updateElement(key, value) {
        if (this.domElements[key]) {
            this.domElements[key].innerText = value;
        }
    }

    updateAmmo() {
        const inClip = GameState.get('ammoInClip');
        const total = GameState.get('ammoTotal');
        if (this.domElements.ammo) {
            this.domElements.ammo.innerText = `${inClip} / ${total}`;
        }
    }

    fullUpdate() {
        this.updateElement('health', GameState.get('health'));
        this.updateAmmo();
        this.updateElement('weapon', GameState.get('currentWeaponName'));
        this.updateElement('kills', GameState.get('playerKills'));
        this.updateElement('cash', `$${GameState.get('cash')}`);
    }
}
