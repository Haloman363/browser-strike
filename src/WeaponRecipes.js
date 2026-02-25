export const WEAPON_RECIPES = {
    'AK47': {
        bodyColor: '#4a2c11',
        slideColor: '#222222',
        accentColor: '#1a1a1a',
        receiverPoints: [
            { x: -0.25, y: -0.06 },
            { x: 0.2, y: -0.06 },
            { x: 0.2, y: 0.04 },
            { x: 0.1, y: 0.06 },
            { x: -0.25, y: 0.06 }
        ],
        receiverWidth: 0.08,
        barrelProfile: [
            { x: 0.02, y: 0 },
            { x: 0.02, y: 0.6 }
        ],
        barrelPos: { x: 0, y: 0.03, z: -0.2 },
        muzzleBrake: true,
        stockPos: { x: 0, y: -0.02, z: 0.25 },
        stockSize: {x: 0.06, y: 0.15, z: 0.45},
        stockType: 'wood',
        magPos: { x: 0, y: -0.06, z: -0.05 },
        magType: 'rifle_curved',
        handguardType: 'wood',
        railSystem: true
    },
    'M4A4': {
        bodyColor: '#1a1a1a',
        slideColor: '#222222',
        accentColor: '#151515',
        receiverPoints: [
            { x: -0.2, y: -0.05 },
            { x: 0.2, y: -0.05 },
            { x: 0.2, y: 0.06 },
            { x: -0.2, y: 0.06 }
        ],
        receiverWidth: 0.09,
        barrelProfile: [
            { x: 0.015, y: 0 },
            { x: 0.015, y: 0.45 }
        ],
        barrelPos: { x: 0, y: 0.02, z: -0.15 },
        suppressor: true,
        stockPos: { x: 0, y: 0, z: 0.25 },
        stockSize: {x: 0.07, y: 0.12, z: 0.35},
        magPos: { x: 0, y: -0.05, z: -0.08 },
        magType: 'rifle_straight'
    },
    'AWP': {
        bodyColor: '#2d3e2d',
        slideColor: '#222222',
        accentColor: '#111111',
        receiverPoints: [
            { x: -0.35, y: -0.07 },
            { x: 0.35, y: -0.07 },
            { x: 0.35, y: 0.07 },
            { x: -0.35, y: 0.07 }
        ],
        receiverWidth: 0.1,
        barrelProfile: [
            { x: 0.025, y: 0 },
            { x: 0.02, y: 1.2 }
        ],
        barrelPos: { x: 0, y: 0.03, z: -0.35 },
        muzzleBrake: true,
        stockPos: { x: 0, y: 0, z: 0.45 },
        stockSize: {x: 0.08, y: 0.18, z: 0.55},
        magPos: { x: 0, y: -0.07, z: 0.1 },
        magType: 'box_small',
        sightType: 'scope_large',
        boltAction: true,
        bipod: true
    },
    'DESERT_EAGLE': {
        bodyColor: '#888888',
        slideColor: '#aaaaaa',
        accentColor: '#222222',
        receiverPoints: [
            { x: -0.12, y: -0.05 },
            { x: 0.12, y: -0.05 },
            { x: 0.12, y: 0.05 },
            { x: -0.12, y: 0.05 }
        ],
        receiverWidth: 0.08,
        barrelType: 'rectangular',
        barrelSize: {x: 0.06, y: 0.07, z: 0.25},
        barrelPos: { x: 0, y: 0.03, z: -0.1 },
        magPos: { x: 0, y: -0.05, z: 0.08 },
        magType: 'pistol',
        muzzleBrake: true,
        sightType: 'large_pistol',
        slideSerrations: true
    },
    'GLOCK': {
        bodyColor: '#222222',
        slideColor: '#333333',
        accentColor: '#111111',
        receiverPoints: [
            { x: -0.1, y: -0.04 },
            { x: 0.1, y: -0.04 },
            { x: 0.1, y: 0.04 },
            { x: -0.1, y: 0.04 }
        ],
        receiverWidth: 0.06,
        barrelProfile: [
            { x: 0.015, y: 0 },
            { x: 0.015, y: 0.12 }
        ],
        barrelPos: { x: 0, y: 0.02, z: -0.08 },
        magPos: { x: 0, y: -0.04, z: 0.06 },
        magType: 'pistol',
        slideSerrations: true
    },
    'COMBAT_KNIFE': {
        isKnife: true,
        bodyColor: '#333333',
        accentColor: '#111111',
        bladePoints: [
            { x: 0, y: 0 },         // Handle/Guard junction bottom
            { x: 0.22, y: 0 },      // Start of edge curve
            { x: 0.28, y: 0.04 },   // Point
            { x: 0.22, y: 0.07 },   // Start of clip back
            { x: 0.1, y: 0.08 },    // Back of blade
            { x: 0, y: 0.08 }       // Handle/Guard junction top
        ],
        bladeWidth: 0.015,
        handleRadius: 0.022,
        handleLength: 0.16,
        guardSize: { x: 0.02, y: 0.1, z: 0.03 }
    }
};
