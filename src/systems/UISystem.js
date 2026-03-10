import { System } from '../core/System.js';
import { GameState } from '../GameState.js';
import { WEAPONS_DATA, GRENADES_DATA } from '../Constants_v2.js';

const BUY_MENU_CONFIG = [
    { id: 'pistols', label: '1. PISTOLS', weapons: ['GLOCK', 'USP', 'P250', 'DEAGLE'] },
    { id: 'smgs', label: '2. SMGS', weapons: ['MAC10', 'MP9', 'MP7', 'P90'] },
    { id: 'rifles', label: '3. RIFLES', weapons: ['GALIL', 'FAMAS', 'AK47', 'M4A4', 'AUG', 'SG553'] },
    { id: 'heavy', label: '4. HEAVY', weapons: ['NOVA', 'XM1014', 'NEGEV', 'M249', 'SSG08', 'AWP'] },
    { id: 'grenades', label: '5. GRENADES', weapons: ['HE', 'FLASH', 'SMOKE', 'MOLOTOV'] },
    { id: 'gear', label: '6. GEAR', weapons: ['VEST', 'VESTHELM', 'DEFUSE'] }
];

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
            crosshair: document.getElementById('crosshair'),
            buyMenu: document.getElementById('buy-menu'),
            buyMenuSvg: document.getElementById('buy-menu-svg'),
            buySubMenu: document.getElementById('buy-sub-menu')
        };
        this.buyMenuOpen = false;
        this.currentCategory = null;
    }

    init() {
        console.log("UISystem initialized");

        this.createBuyMenu();

        if (this.domElements.backend) {
            this.domElements.backend.innerText = `Backend: ${this.engine.backend}`;
            this.domElements.backend.style.color = this.engine.backend === 'WebGPU' ? '#00ff00' : '#ff9d00';
        }
        
        GameState.on('change:health', (val) => this.updateElement('health', val));
        GameState.on('change:ammoInClip', () => this.updateAmmo());
        GameState.on('change:ammoTotal', () => this.updateAmmo());
        GameState.on('change:currentWeaponName', (val) => this.updateElement('weapon', val));
        GameState.on('change:playerKills', (val) => this.updateElement('kills', val));
        GameState.on('change:cash', (val) => {
            this.updateElement('cash', `$${val}`);
            if (this.buyMenuOpen) this.updateBuyMenuState();
        });

        // Bomb Sites
        GameState.on('change:atBombSite', (site) => this.updateBombSitePrompt(site));
        GameState.on('change:currentNearPickup', (pickup) => this.updatePickupPrompt(pickup));
        GameState.on('change:bombPlanting', (planting) => this.updatePlantingUI(planting));
        GameState.on('change:bombPlantProgress', (progress) => this.updatePlantingProgress(progress));
        GameState.on('change:bombPlanted', (planted) => this.updateBombPlantedUI(planted));
        GameState.on('change:bombTimeLeft', (time) => this.updateBombTimer(time));

        this.engine.on('input:keydown', (code) => {
            if (code === 'KeyB') {
                this.toggleBuyMenu();
            } else if (code === 'Escape' && this.buyMenuOpen) {
                this.closeBuyMenu();
            } else if (this.buyMenuOpen) {
                this.handleBuyMenuKeys(code);
            }
        });

        this.fullUpdate();
    }

    createBuyMenu() {
        const svg = this.domElements.buyMenuSvg;
        if (!svg) return;

        const centerX = 300;
        const centerY = 300;
        const radiusInner = 100;
        const radiusOuter = 280;
        const numSegments = BUY_MENU_CONFIG.length;
        const angleStep = (Math.PI * 2) / numSegments;

        BUY_MENU_CONFIG.forEach((config, i) => {
            const startAngle = i * angleStep - Math.PI / 2;
            const endAngle = (i + 1) * angleStep - Math.PI / 2;

            const x1_inner = centerX + radiusInner * Math.cos(startAngle);
            const y1_inner = centerY + radiusInner * Math.sin(startAngle);
            const x2_inner = centerX + radiusInner * Math.cos(endAngle);
            const y2_inner = centerY + radiusInner * Math.sin(endAngle);

            const x1_outer = centerX + radiusOuter * Math.cos(startAngle);
            const y1_outer = centerY + radiusOuter * Math.sin(startAngle);
            const x2_outer = centerX + radiusOuter * Math.cos(endAngle);
            const y2_outer = centerY + radiusOuter * Math.sin(endAngle);

            const pathData = `
                M ${x1_inner} ${y1_inner}
                L ${x1_outer} ${y1_outer}
                A ${radiusOuter} ${radiusOuter} 0 0 1 ${x2_outer} ${y2_outer}
                L ${x2_inner} ${y2_inner}
                A ${radiusInner} ${radiusInner} 0 0 0 ${x1_inner} ${y1_inner}
                Z
            `;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathData);
            path.setAttribute("class", "buy-segment");
            path.setAttribute("id", `segment-${i}`);
            path.addEventListener('click', () => this.showSubMenu(i));
            svg.appendChild(path);

            // Label
            const labelAngle = startAngle + angleStep / 2;
            const labelRadius = (radiusInner + radiusOuter) / 2;
            const lx = centerX + labelRadius * Math.cos(labelAngle);
            const ly = centerY + labelRadius * Math.sin(labelAngle);

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", lx);
            text.setAttribute("y", ly);
            text.setAttribute("class", "buy-label");
            text.textContent = config.label;
            svg.appendChild(text);
        });
    }

    toggleBuyMenu() {
        if (this.buyMenuOpen) {
            this.closeBuyMenu();
        } else {
            if (this.checkBuyZone()) {
                this.openBuyMenu();
            } else {
                console.log("Not in buy zone");
                // TODO: Show "Not in buy zone" hint
            }
        }
    }

    openBuyMenu() {
        this.buyMenuOpen = true;
        this.domElements.buyMenu.style.display = 'flex';
        this.currentCategory = null;
        this.domElements.buySubMenu.style.display = 'none';
        
        // Disable pointer lock if active
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    }

    closeBuyMenu() {
        this.buyMenuOpen = false;
        this.domElements.buyMenu.style.display = 'none';
        
        // Re-enable pointer lock is usually handled by clicking back in game
    }

    checkBuyZone() {
        // Simplified check: Are we near the spawn point?
        // In a real game, this would check against the map's defined buy zones
        const player = this.engine.getSystem('PlayerControllerSystem');
        if (!player || !player.camera) return false;

        const pos = player.camera.position;
        const currentMap = GameState.get('currentMap') || 'dust2';
        
        // Hardcoded for now based on Maps_v2.js
        let spawn;
        if (currentMap === 'dust2') {
            spawn = { x: 0, y: 18, z: 600 };
        } else {
            spawn = { x: 0, y: 25, z: -100 };
        }

        const distSq = Math.pow(pos.x - spawn.x, 2) + Math.pow(pos.z - spawn.z, 2);
        return distSq < 90000; // 300 units radius (300^2 = 90000)
    }

    showSubMenu(index) {
        this.currentCategory = index;
        const config = BUY_MENU_CONFIG[index];
        const subMenu = this.domElements.buySubMenu;
        subMenu.innerHTML = '';
        subMenu.style.display = 'flex';

        const currentCash = GameState.get('cash');
        const utilityCount = GameState.get('utilityCount') || { HE: 0, FLASH: 0, SMOKE: 0, MOLOTOV: 0 };
        const totalUtility = Object.values(utilityCount).reduce((a, b) => a + b, 0);
        
        config.weapons.forEach((weaponKey, i) => {
            const weapon = WEAPONS_DATA[weaponKey] || GRENADES_DATA[weaponKey] || { name: weaponKey, price: 0 };
            
            // Handle Gear prices if not in WEAPONS_DATA
            if (weaponKey === 'VEST') { weapon.name = 'Kevlar Vest'; weapon.price = 650; }
            if (weaponKey === 'VESTHELM') { weapon.name = 'Kevlar + Helmet'; weapon.price = 1000; }
            if (weaponKey === 'DEFUSE') { weapon.name = 'Defuse Kit'; weapon.price = 400; }

            // Check Limits
            let limitReached = false;
            if (GRENADES_DATA[weaponKey]) {
                if (totalUtility >= ECONOMY_SETTINGS.UTILITY_LIMIT_TOTAL) limitReached = true;
                if (weaponKey === 'FLASH' && utilityCount.FLASH >= ECONOMY_SETTINGS.UTILITY_LIMIT_FLASH) limitReached = true;
                if (weaponKey !== 'FLASH' && utilityCount[weaponKey] >= 1) limitReached = true;
            }

            const canAfford = currentCash >= weapon.price;
            const isAvailable = !limitReached;

            const item = document.createElement('div');
            item.className = `buy-item ${canAfford && isAvailable ? '' : 'disabled'}`;
            item.innerHTML = `
                <span class="item-key">${i + 1}</span>
                <span class="item-name">${weapon.name}${limitReached ? ' (MAX)' : ''}</span>
                <span class="item-price">$${weapon.price}</span>
            `;
            
            if (canAfford && isAvailable) {
                item.addEventListener('click', () => this.purchaseItem(weaponKey));
            }
            subMenu.appendChild(item);
        });

        // Highlight active segment
        document.querySelectorAll('.buy-segment').forEach((el, i) => {
            if (i === index) el.classList.add('active');
            else el.classList.remove('active');
        });
    }

    handleBuyMenuKeys(code) {
        const num = parseInt(code.replace('Digit', ''));
        if (isNaN(num)) return;

        if (this.currentCategory === null) {
            // Select category
            if (num > 0 && num <= BUY_MENU_CONFIG.length) {
                this.showSubMenu(num - 1);
            }
        } else {
            // Select item in category
            const config = BUY_MENU_CONFIG[this.currentCategory];
            if (num > 0 && num <= config.weapons.length) {
                this.purchaseItem(config.weapons[num - 1]);
            }
        }
    }

    purchaseItem(weaponKey) {
        const weapon = WEAPONS_DATA[weaponKey] || GRENADES_DATA[weaponKey] || { name: weaponKey, price: 0 };
        
        // Handle Gear prices
        if (weaponKey === 'VEST') { weapon.price = 650; }
        if (weaponKey === 'VESTHELM') { weapon.price = 1000; }
        if (weaponKey === 'DEFUSE') { weapon.price = 400; }

        if (GameState.get('cash') >= weapon.price) {
            const weaponSystem = this.engine.getSystem('WeaponSystem');
            if (weaponSystem) {
                // weaponSystem.giveWeapon now returns boolean for success
                const success = weaponSystem.giveWeapon(weaponKey);
                if (success) {
                    GameState.set('cash', GameState.get('cash') - weapon.price);
                    console.log(`Purchased ${weaponKey}`);
                    this.closeBuyMenu();
                } else {
                    console.log(`Limit reached for ${weaponKey}`);
                }
            }
        } else {
            console.log("Insufficient funds");
        }
    }

    updateBuyMenuState() {
        if (this.currentCategory !== null) {
            this.showSubMenu(this.currentCategory);
        }
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
