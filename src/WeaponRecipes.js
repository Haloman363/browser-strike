export const WEAPON_RECIPES = {
    'AK47': {
        bodyColor: '#222222',
        gripColor: '#4a2c11',
        accentColor: '#1a1a1a',
        receiverPoints: [
            { x: -0.28, y: -0.06 },
            { x: -0.1, y: -0.07 },
            { x: 0.1, y: -0.07 },
            { x: 0.22, y: -0.06 },
            { x: 0.22, y: 0.03 },
            { x: 0.24, y: 0.03 },
            { x: 0.24, y: 0.06 },
            { x: 0.18, y: 0.06 },
            { x: 0.15, y: 0.09 },
            { x: -0.1, y: 0.09 },
            { x: -0.1, y: 0.07 },
            { x: -0.28, y: 0.07 }
        ],
        chargingHandle: true,
        rearSight: true,
        frontSight: true,
        receiverWidth: 0.07,
        barrelProfile: [
            { x: 0.018, y: 0 },
            { x: 0.016, y: 0.65 }
        ],
        barrelPos: { x: 0, y: 0.045, z: -0.25 },
        muzzleBrake: true,
        gasTube: true,
        dustCover: true,
        akDetails: true,
        pistolGrip: true,
        stockPos: { x: 0, y: -0.01, z: 0.35 },
        stockSize: {x: 0.06, y: 0.16, z: 0.5},
        stockType: 'wood',
        magPos: { x: 0, y: -0.05, z: -0.05 },
        magType: 'rifle_curved',
        handguardType: 'wood_ak',
        boltAction: false,
        sightType: 'iron_rifle',
        vmRightHand: { x: 0.18, y: -0.18, z: 0.12, rx: -0.1, ry: -0.3 },
        vmLeftHand: { x: -0.18, y: -0.15, z: -0.25, rx: -0.2, ry: 0.3 }
    },
    'M4A4': {
        bodyColor: '#1a1a1a',
        gripColor: '#111111',
        accentColor: '#151515',
        receiverPoints: [
            { x: -0.22, y: -0.06 },
            { x: -0.05, y: -0.06 },
            { x: -0.05, y: -0.15 },
            { x: 0.1, y: -0.15 },
            { x: 0.1, y: -0.06 },
            { x: 0.22, y: -0.06 },
            { x: 0.22, y: 0.05 },
            { x: 0.1, y: 0.08 },
            { x: -0.22, y: 0.08 }
        ],
        receiverWidth: 0.08,
        m4Details: true,
        barrelProfile: [
            { x: 0.012, y: 0 },
            { x: 0.012, y: 0.05 },
            { x: 0.014, y: 0.05 },
            { x: 0.014, y: 0.45 }
        ],
        barrelPos: { x: 0, y: 0.035, z: -0.25 },
        muzzleBrake: true,
        railSystem: true,
        stockPos: { x: 0, y: 0.01, z: 0.3 },
        stockSize: {x: 0.07, y: 0.14, z: 0.45},
        magPos: { x: 0, y: -0.05, z: -0.08 },
        magType: 'rifle_straight',
        sightType: 'iron_rifle',
        vmRightHand: { x: 0.18, y: -0.18, z: 0.1, rx: -0.1, ry: -0.3 },
        vmLeftHand: { x: -0.18, y: -0.15, z: -0.22, rx: -0.2, ry: 0.3 }
    },
    'AWP': {
        bodyColor: '#2d3e2d',
        gripColor: '#1a1a1a',
        accentColor: '#111111',
        receiverPoints: [
            { x: -0.45, y: -0.06 },
            { x: -0.1, y: -0.06 },
            { x: -0.1, y: -0.1 },
            { x: 0.1, y: -0.1 },
            { x: 0.1, y: -0.06 },
            { x: 0.45, y: -0.06 },
            { x: 0.45, y: 0.04 },
            { x: 0.0, y: 0.07 },
            { x: -0.45, y: 0.04 }
        ],
        receiverWidth: 0.1,
        awpDetails: true,
        barrelProfile: [
            { x: 0.025, y: 0 },
            { x: 0.025, y: 0.1 },
            { x: 0.022, y: 0.1 },
            { x: 0.022, y: 0.2 },
            { x: 0.018, y: 0.2 },
            { x: 0.016, y: 1.2 }
        ],
        barrelPos: { x: 0, y: 0.03, z: -0.45 },
        muzzleBrake: true,
        stockPos: { x: 0, y: -0.04, z: 0.6 },
        stockSize: {x: 0.08, y: 0.2, z: 0.7},
        magPos: { x: 0, y: -0.08, z: 0.05 },
        magType: 'box_small',
        sightType: 'scope_large',
        boltAction: true,
        bipod: true,
        vmRightHand: { x: 0.2, y: -0.2, z: 0.3, rx: -0.1, ry: -0.4 },
        vmLeftHand: { x: -0.2, y: -0.18, z: -0.1, rx: -0.2, ry: 0.4 }
    },
    'DEAGLE': {
        bodyColor: '#bbbbbb', // Shinier silver
        gripColor: '#111111',
        accentColor: '#222222',
        receiverPoints: [
            { x: -0.15, y: -0.06 },
            { x: 0.15, y: -0.06 },
            { x: 0.15, y: 0.07 },
            { x: -0.15, y: 0.07 }
        ],
        receiverWidth: 0.085,
        pistolDetails: true,
        barrelType: 'rectangular',
        barrelSize: {x: 0.07, y: 0.09, z: 0.35},
        barrelPos: { x: 0, y: 0.035, z: -0.15 },
        magPos: { x: 0, y: -0.06, z: 0.08 },
        magType: 'pistol',
        muzzleBrake: true,
        sightType: 'large_pistol',
        slideSerrations: true,
        vmRightHand: { x: 0.12, y: -0.15, z: 0.1, rx: -0.1, ry: -0.4 },
        vmLeftHand: { x: -0.05, y: -0.18, z: 0.08, rx: -0.2, ry: 0.6 }
    },
    'GLOCK': {
        bodyColor: '#1a1a1a',
        gripColor: '#151515',
        accentColor: '#111111',
        receiverPoints: [
            // Slide (Upper)
            { x: -0.11, y: 0.045 },
            { x: 0.11, y: 0.045 },
            { x: 0.11, y: 0.005 },
            { x: -0.11, y: 0.005 },
            { x: -0.11, y: 0.045 }
        ],
        framePoints: [
            // Frame (Lower)
            { x: -0.1, y: 0.005 },
            { x: 0.09, y: 0.005 },
            { x: 0.09, y: -0.015 }, // accessory rail start
            { x: 0.05, y: -0.015 },
            { x: 0.04, y: -0.04 }, // trigger guard front
            { x: -0.02, y: -0.04 }, // trigger guard bottom
            { x: -0.04, y: -0.02 }, // grip start
            { x: -0.1, y: -0.02 },
            { x: -0.1, y: 0.005 }
        ],
        receiverWidth: 0.065,
        pistolDetails: true,
        barrelProfile: [
            { x: 0.014, y: 0 },
            { x: 0.014, y: 0.12 }
        ],
        barrelPos: { x: 0, y: 0.03, z: -0.1 },
        magPos: { x: 0, y: -0.04, z: 0.06 },
        magType: 'pistol',
        slideSerrations: true,
        vmRightHand: { x: 0.1, y: -0.12, z: 0.08, rx: -0.1, ry: -0.4 },
        vmLeftHand: { x: -0.04, y: -0.15, z: 0.06, rx: -0.2, ry: 0.6 }
    },
    'USP': {
        bodyColor: '#1a1a1a',
        gripColor: '#111111',
        accentColor: '#151515',
        receiverPoints: [
            // Slide (Upper)
            { x: -0.12, y: 0.05 },
            { x: 0.12, y: 0.05 },
            { x: 0.12, y: 0.0 },
            { x: -0.12, y: 0.0 }
        ],
        framePoints: [
            // Frame (Lower)
            { x: -0.11, y: 0.0 },
            { x: 0.1, y: 0.0 },
            { x: 0.1, y: -0.02 },
            { x: 0.06, y: -0.02 },
            { x: 0.05, y: -0.05 }, // trigger guard front
            { x: -0.01, y: -0.05 }, // trigger guard bottom
            { x: -0.04, y: -0.02 }, // grip start
            { x: -0.11, y: -0.02 }
        ],
        receiverWidth: 0.07,
        pistolDetails: true,
        barrelProfile: [
            { x: 0.014, y: 0 },
            { x: 0.014, y: 0.15 }
        ],
        barrelPos: { x: 0, y: 0.04, z: -0.1 },
        suppressor: true,
        magPos: { x: 0, y: -0.05, z: 0.06 },
        magType: 'pistol',
        slideSerrations: true,
        vmRightHand: { x: 0.1, y: -0.12, z: 0.08, rx: -0.1, ry: -0.4 },
        vmLeftHand: { x: -0.04, y: -0.15, z: 0.06, rx: -0.2, ry: 0.6 }
    },
    'P90': {
        bodyColor: '#1a1a1a',
        gripColor: '#111111',
        accentColor: '#222222',
        receiverPoints: [
            { x: -0.28, y: -0.12 },
            { x: 0.22, y: -0.12 },
            { x: 0.22, y: 0.08 },
            { x: -0.1, y: 0.12 },
            { x: -0.28, y: 0.12 }
        ],
        receiverWidth: 0.11,
        barrelProfile: [
            { x: 0.018, y: 0 },
            { x: 0.018, y: 0.2 }
        ],
        barrelPos: { x: 0, y: 0.02, z: -0.25 },
        magPos: { x: 0, y: 0.11, z: -0.02 },
        magSize: {x: 0.09, y: 0.035, z: 0.45},
        magType: 'top_flat',
        stockPos: { x: 0, y: -0.06, z: 0.35 },
        stockSize: {x: 0.11, y: 0.22, z: 0.25},
        sightType: 'iron_rifle',
        vmRightHand: { x: 0.15, y: -0.18, z: 0.1, rx: -0.1, ry: -0.3 },
        vmLeftHand: { x: -0.15, y: -0.15, z: -0.1, rx: -0.2, ry: 0.4 }
    },
    'MAC10': {
        bodyColor: '#3a3a3a',
        gripColor: '#111111',
        accentColor: '#1a1a1a',
        receiverPoints: [
            { x: -0.12, y: -0.12 },
            { x: 0.12, y: -0.12 },
            { x: 0.12, y: 0.12 },
            { x: -0.12, y: 0.12 }
        ],
        receiverWidth: 0.09,
        barrelProfile: [
            { x: 0.022, y: 0 },
            { x: 0.022, y: 0.15 }
        ],
        barrelPos: { x: 0, y: 0.06, z: -0.12 },
        magPos: { x: 0, y: -0.12, z: 0.02 },
        magType: 'smg_long',
        vmRightHand: { x: 0.15, y: -0.15, z: 0.05, rx: -0.1, ry: -0.3 },
        vmLeftHand: { x: -0.1, y: -0.18, z: -0.05, rx: -0.2, ry: 0.5 }
    },
    'MP9': {
        bodyColor: '#1a1a1a',
        gripColor: '#111111',
        accentColor: '#1a1a1a',
        receiverPoints: [
            { x: -0.18, y: -0.1 },
            { x: 0.18, y: -0.1 },
            { x: 0.18, y: 0.12 },
            { x: -0.18, y: 0.12 }
        ],
        receiverWidth: 0.08,
        barrelProfile: [
            { x: 0.016, y: 0 },
            { x: 0.016, y: 0.12 }
        ],
        barrelPos: { x: 0, y: 0.05, z: -0.18 },
        magPos: { x: 0, y: -0.1, z: 0.03 },
        magType: 'smg_long',
        stockPos: { x: 0, y: 0, z: 0.2 },
        stockSize: {x: 0.03, y: 0.12, z: 0.35},
        vmRightHand: { x: 0.15, y: -0.15, z: 0.05, rx: -0.1, ry: -0.3 },
        vmLeftHand: { x: -0.12, y: -0.18, z: -0.1, rx: -0.2, ry: 0.4 }
    },
    'GALIL': {
        bodyColor: '#252525',
        gripColor: '#111111',
        accentColor: '#1a1a1a',
        receiverPoints: [
            { x: -0.26, y: -0.06 },
            { x: 0.26, y: -0.06 },
            { x: 0.26, y: 0.07 },
            { x: -0.26, y: 0.07 }
        ],
        receiverWidth: 0.08,
        barrelProfile: [
            { x: 0.017, y: 0 },
            { x: 0.017, y: 0.55 }
        ],
        barrelPos: { x: 0, y: 0.035, z: -0.25 },
        muzzleBrake: true,
        stockPos: { x: 0, y: 0.02, z: 0.35 },
        stockSize: {x: 0.05, y: 0.14, z: 0.45},
        magPos: { x: 0, y: -0.06, z: -0.06 },
        magType: 'rifle_curved',
        vmRightHand: { x: 0.18, y: -0.18, z: 0.1, rx: -0.1, ry: -0.3 },
        vmLeftHand: { x: -0.18, y: -0.15, z: -0.2, rx: -0.2, ry: 0.3 }
    },
    'FAMAS': {
        bodyColor: '#2a2a2a',
        gripColor: '#111111',
        accentColor: '#1a1a1a',
        receiverPoints: [
            { x: -0.32, y: -0.08 },
            { x: 0.32, y: -0.08 },
            { x: 0.32, y: 0.14 },
            { x: -0.32, y: 0.14 }
        ],
        receiverWidth: 0.09,
        barrelProfile: [
            { x: 0.014, y: 0 },
            { x: 0.014, y: 0.4 }
        ],
        barrelPos: { x: 0, y: 0.04, z: -0.3 },
        magPos: { x: 0, y: -0.08, z: 0.18 },
        magType: 'rifle_straight',
        railSystem: true,
        vmRightHand: { x: 0.18, y: -0.18, z: 0.05, rx: -0.1, ry: -0.3 },
        vmLeftHand: { x: -0.18, y: -0.15, z: -0.15, rx: -0.2, ry: 0.3 }
    },
    'AUG': {
        bodyColor: '#2a3a2a',
        gripColor: '#111111',
        accentColor: '#1a1a1a',
        receiverPoints: [
            { x: -0.28, y: -0.08 },
            { x: 0.22, y: -0.08 },
            { x: 0.22, y: 0.11 },
            { x: -0.28, y: 0.11 }
        ],
        receiverWidth: 0.09,
        barrelProfile: [
            { x: 0.017, y: 0 },
            { x: 0.015, y: 0.55 }
        ],
        barrelPos: { x: 0, y: 0.04, z: -0.25 },
        magPos: { x: 0, y: -0.08, z: 0.16 },
        magType: 'rifle_curved',
        sightType: 'scope_large',
        vmRightHand: { x: 0.18, y: -0.18, z: 0.05, rx: -0.1, ry: -0.3 },
        vmLeftHand: { x: -0.18, y: -0.15, z: -0.15, rx: -0.2, ry: 0.3 }
    },
    'SG553': {
        bodyColor: '#111111',
        gripColor: '#111111',
        accentColor: '#1a1a1a',
        receiverPoints: [
            { x: -0.26, y: -0.07 },
            { x: 0.26, y: -0.07 },
            { x: 0.26, y: 0.09 },
            { x: -0.26, y: 0.09 }
        ],
        receiverWidth: 0.085,
        barrelProfile: [
            { x: 0.017, y: 0 },
            { x: 0.017, y: 0.5 }
        ],
        barrelPos: { x: 0, y: 0.035, z: -0.25 },
        magPos: { x: 0, y: -0.07, z: -0.05 },
        magType: 'rifle_curved',
        sightType: 'scope_large',
        railSystem: true,
        vmRightHand: { x: 0.18, y: -0.18, z: 0.1, rx: -0.1, ry: -0.3 },
        vmLeftHand: { x: -0.18, y: -0.15, z: -0.2, rx: -0.2, ry: 0.3 }
    },
    'SSG08': {
        bodyColor: '#1a1a1a',
        gripColor: '#1a1a1a',
        accentColor: '#111111',
        receiverPoints: [
            { x: -0.32, y: -0.06 },
            { x: 0.32, y: -0.06 },
            { x: 0.32, y: 0.06 },
            { x: -0.32, y: 0.06 }
        ],
        receiverWidth: 0.08,
        barrelProfile: [
            { x: 0.018, y: 0 },
            { x: 0.014, y: 1.0 }
        ],
        barrelPos: { x: 0, y: 0.035, z: -0.32 },
        muzzleBrake: true,
        stockPos: { x: 0, y: -0.01, z: 0.45 },
        stockSize: {x: 0.04, y: 0.14, z: 0.55},
        magPos: { x: 0, y: -0.06, z: 0.06 },
        magType: 'box_small',
        sightType: 'scope_large',
        boltAction: true
    },
    'NEGEV': {
        bodyColor: '#111111',
        gripColor: '#111111',
        accentColor: '#222222',
        receiverPoints: [
            { x: -0.4, y: -0.11 },
            { x: 0.4, y: -0.11 },
            { x: 0.4, y: 0.14 },
            { x: -0.4, y: 0.14 }
        ],
        receiverWidth: 0.14,
        barrelProfile: [
            { x: 0.028, y: 0 },
            { x: 0.022, y: 0.75 }
        ],
        barrelPos: { x: 0, y: 0.06, z: -0.35 },
        muzzleBrake: true,
        magPos: { x: 0.1, y: -0.06, z: 0.05 },
        magType: 'box_large',
        bipod: true,
        stockPos: { x: 0, y: 0, z: 0.45 },
        stockSize: {x: 0.07, y: 0.16, z: 0.35}
    },
    'M249': {
        bodyColor: '#1a1a1a',
        gripColor: '#111111',
        accentColor: '#1a1a1a',
        receiverPoints: [
            { x: -0.45, y: -0.13 },
            { x: 0.45, y: -0.13 },
            { x: 0.45, y: 0.13 },
            { x: -0.45, y: 0.13 }
        ],
        receiverWidth: 0.15,
        barrelProfile: [
            { x: 0.032, y: 0 },
            { x: 0.026, y: 0.85 }
        ],
        barrelPos: { x: 0, y: 0.06, z: -0.45 },
        muzzleBrake: true,
        magPos: { x: 0.12, y: -0.09, z: 0.08 },
        magType: 'box_large',
        bipod: true,
        stockPos: { x: 0, y: 0, z: 0.5 },
        stockSize: {x: 0.09, y: 0.2, z: 0.45}
    },
    'XM1014': {
        bodyColor: '#111111',
        gripColor: '#111111',
        accentColor: '#222222',
        receiverPoints: [
            { x: -0.32, y: -0.07 },
            { x: 0.32, y: -0.07 },
            { x: 0.32, y: 0.09 },
            { x: -0.32, y: 0.09 }
        ],
        receiverWidth: 0.08,
        barrelProfile: [
            { x: 0.022, y: 0 },
            { x: 0.022, y: 0.75 }
        ],
        barrelPos: { x: 0, y: 0.045, z: -0.35 },
        magType: 'shotgun_tube',
        stockPos: { x: 0, y: 0.03, z: 0.45 },
        stockSize: {x: 0.04, y: 0.14, z: 0.55}
    },
    'NOVA': {
        bodyColor: '#1a1a1a',
        gripColor: '#111111',
        accentColor: '#1a1a1a',
        receiverPoints: [
            { x: -0.38, y: -0.08 },
            { x: 0.38, y: -0.08 },
            { x: 0.38, y: 0.08 },
            { x: -0.38, y: 0.08 }
        ],
        receiverWidth: 0.075,
        barrelProfile: [
            { x: 0.02, y: 0 },
            { x: 0.02, y: 0.8 }
        ],
        barrelPos: { x: 0, y: 0.035, z: -0.4 },
        magType: 'shotgun_tube',
        stockPos: { x: 0, y: -0.02, z: 0.5 },
        stockSize: {x: 0.05, y: 0.16, z: 0.6}
    },
    'P250': {
        bodyColor: '#1a1a1a',
        gripColor: '#151515',
        accentColor: '#111111',
        receiverPoints: [
            // Slide (Upper)
            { x: -0.095, y: 0.04 },
            { x: 0.095, y: 0.04 },
            { x: 0.095, y: 0.0 },
            { x: -0.095, y: 0.0 }
        ],
        framePoints: [
            // Frame (Lower)
            { x: -0.09, y: 0.0 },
            { x: 0.08, y: 0.0 },
            { x: 0.08, y: -0.02 },
            { x: 0.04, y: -0.02 },
            { x: 0.035, y: -0.05 }, // trigger guard front
            { x: -0.02, y: -0.05 }, // trigger guard bottom
            { x: -0.04, y: -0.02 }, // grip start
            { x: -0.09, y: -0.02 }
        ],
        receiverWidth: 0.065,
        pistolDetails: true,
        barrelProfile: [
            { x: 0.014, y: 0 },
            { x: 0.014, y: 0.13 }
        ],
        barrelPos: { x: 0, y: 0.035, z: -0.09 },
        magPos: { x: 0, y: -0.04, z: 0.05 },
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
        guardSize: { x: 0.02, y: 0.1, z: 0.03 },
        vmRightHand: { x: 0.15, y: -0.15, z: 0.1, rx: -0.2, ry: -0.5 }
    }
};
