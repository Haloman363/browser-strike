/**
 * DebugBridge.js
 * Connects the Browser-Strike game to the Gemini MCP server via WebSockets.
 * Enables live weapon tweaking, enemy spawning, and scene inspection.
 */

import { SceneInspector } from './SceneInspector.js';

export const DebugBridge = {
    socket: null,
    gameRefs: {},

    init(refs) {
        this.gameRefs = refs; // { scene, camera, enemies, WEAPONS_DATA, createEnemy, ... }
        this.connect();
        console.log("[DebugBridge] Initialized and connecting to MCP...");
    },

    connect() {
        try {
            const BRIDGE_TOKEN = "BS_DEV_12345";
            this.socket = new WebSocket(`ws://localhost:8081?token=${BRIDGE_TOKEN}`);

            this.socket.onopen = () => {
                console.log("[DebugBridge] Connected to MCP Bridge Server.");
            };

            this.socket.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            };

            this.socket.onclose = () => {
                console.warn("[DebugBridge] Disconnected from MCP. Retrying in 5s...");
                setTimeout(() => this.connect(), 5000);
            };

            this.socket.onerror = (err) => {
                // Silently fail if MCP isn't running
            };
        } catch (e) {
            console.error("[DebugBridge] Failed to connect:", e);
        }
    },

    handleMessage(msg) {
        const { type, data } = msg;
        console.log(`[DebugBridge] Received ${type}:`, data);

        switch (type) {
            case "TWEAK_WEAPON":
                this.tweakWeapon(data);
                break;
            case "SPAWN_ENEMY":
                this.spawnEnemy(data);
                break;
            case "GET_SCENE_SUMMARY":
                this.sendSceneSummary();
                break;
            default:
                console.warn("[DebugBridge] Unknown message type:", type);
        }
    },

    tweakWeapon({ weaponId, params }) {
        const { WEAPONS_DATA } = this.gameRefs;
        const forbiddenKeys = ['__proto__', 'constructor', 'prototype'];
        
        if (forbiddenKeys.includes(weaponId)) {
            console.error(`[DebugBridge] Blocked attempt to access forbidden key: ${weaponId}`);
            return;
        }

        if (WEAPONS_DATA && WEAPONS_DATA[weaponId]) {
            Object.assign(WEAPONS_DATA[weaponId], params);
            console.log(`[DebugBridge] Updated ${weaponId} with:`, params);
            // If the user is holding this weapon, we might need to refresh local refs
            if (this.gameRefs.updateUI) this.gameRefs.updateUI();
        } else {
            console.error(`[DebugBridge] Weapon ${weaponId} not found in WEAPONS_DATA.`);
        }
    },

    spawnEnemy({ type, position }) {
        const { createEnemy, scene } = this.gameRefs;
        if (createEnemy) {
            // Mapping 'grunt', 'sniper', 'heavy' to game teams/options
            const team = (type === 'sniper') ? 'A' : 'B';
            const options = {
                isStationary: (type === 'sniper'),
                isCrouched: (type === 'heavy')
            };
            createEnemy(position.x, position.y, position.z, team, options);
            console.log(`[DebugBridge] Spawned ${type} at`, position);
        }
    },

    sendSceneSummary() {
        const { scene } = this.gameRefs;
        const summary = SceneInspector.summarize(scene);
        this.socket.send(JSON.stringify({ type: "SCENE_SUMMARY", data: summary }));
    }
};
