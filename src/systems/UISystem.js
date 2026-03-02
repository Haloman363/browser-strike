import { System } from '../core/System.js';
import { GameState } from '../GameState.js';

export class UISystem extends System {
    constructor(engine) {
        super(engine);
        this.domElements = {
            health: document.getElementById('health-val'),
            ammo: document.getElementById('ammo-val'),
            weapon: document.getElementById('weapon-name'),
            kills: document.getElementById('kills-val'),
            cash: document.getElementById('cash-val')
        };
    }

    init() {
        console.log("UISystem initialized");
        
        // Listen for individual state changes
        GameState.on('change:health', (val) => this.updateElement('health', val));
        GameState.on('change:ammoInClip', () => this.updateAmmo());
        GameState.on('change:ammoTotal', () => this.updateAmmo());
        GameState.on('change:currentWeaponName', (val) => this.updateElement('weapon', val));
        GameState.on('change:playerKills', (val) => this.updateElement('kills', val));
        GameState.on('change:cash', (val) => this.updateElement('cash', `$${val}`));

        // Initial update
        this.fullUpdate();
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
