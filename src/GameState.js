import { EventEmitter } from './core/EventEmitter.js';

/**
 * Central state management for the game.
 * Uses an EventEmitter pattern to notify systems of state changes.
 */
export class GameStateManager extends EventEmitter {
    constructor() {
        super();
        this.state = {
            playerName: "Noob",
            playerKills: 0,
            networkScores: {},
            selectedMap: 'dust2',
            selectedMode: 'dm',
            teamsEnabled: false,
            playerTeam: 'A',
            teamScores: { A: 0, B: 0 },
            botsEnabled: true,
            isGameStarted: false,
            gameTimeLeft: 600,
            isPlayerDead: false,
            health: 100,
            cash: 800,
            ammoInClip: 20,
            ammoTotal: 120,
            currentWeaponName: "Glock-18",
            grenadeCount: 2,
            maxGrenades: 4,
            isReloading: false,
            currentWeapon: 'gun',
            currentSlot: 2,
            isHost: false,
            lobbyCode: "",
            peer: null,
            connections: [],
            // Bomb State
            bombPlanted: false,
            bombPlanting: false,
            bombPlantProgress: 0,
            bombTimeLeft: 40,
            canPlant: false,
            atBombSite: null, // 'A' or 'B'
            bombExploded: false
        };
    }

    /**
     * Updates one or more state properties and emits a 'change' event.
     * @param {Object} partialState 
     */
    set(partialState) {
        const oldState = { ...this.state };
        let changed = false;

        for (const key in partialState) {
            if (this.state[key] !== partialState[key]) {
                this.state[key] = partialState[key];
                this.emit(`change:${key}`, this.state[key], oldState[key]);
                changed = true;
            }
        }

        if (changed) {
            this.emit('change', this.state, oldState);
        }
    }

    /**
     * Retrieves a value from the state.
     * @param {string} key 
     */
    get(key) {
        return this.state[key];
    }

    /**
     * Resets the game state to initial values.
     */
    reset() {
        this.set({
            playerKills: 0,
            health: 100,
            cash: 800,
            ammoInClip: 20,
            ammoTotal: 120,
            grenadeCount: 2,
            isPlayerDead: false,
            isGameStarted: false
        });
    }
}

// Export a singleton instance for backward compatibility where needed,
// but encourage passing the instance via engine context in the new architecture.
export const GameState = new GameStateManager();
