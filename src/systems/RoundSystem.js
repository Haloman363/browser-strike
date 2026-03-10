import * as THREE from 'three';
import { System } from '../core/System.js';
import { GameState } from '../GameState.js';
import { Maps } from '../Maps_v2.js';
import { ECONOMY_SETTINGS, WEAPONS_DATA } from '../Constants_v2.js';

/**
 * Manages the competitive round lifecycle (FSM).
 * States: PREROUND (Freeze Time) -> ROUND_RUNNING -> POST_ROUND -> PREROUND
 */
export class RoundSystem extends System {
    static systemName = 'RoundSystem';

    constructor(engine) {
        super(engine);
        this.roundStates = {
            PREROUND: 15,
            ROUND_RUNNING: 115,
            POST_ROUND: 5
        };
    }

    init() {
        console.log("RoundSystem initialized");
        
        this.engine.on('bomb:defused', () => this.onRoundWin('A', 'bomb')); // CT win
        this.engine.on('bomb:exploded', () => this.onRoundWin('B', 'bomb')); // T win
        
        // Cash Reward for Kills
        this.engine.on('entity:killed', ({ killer, weaponKey }) => {
            if (killer === 'player') {
                const weapon = WEAPONS_DATA[weaponKey] || {};
                const reward = weapon.killReward || ECONOMY_SETTINGS.KILL_REWARD_DEFAULT;
                const currentCash = GameState.get('cash');
                
                GameState.set({ cash: Math.min(currentCash + reward, ECONOMY_SETTINGS.MAX_CASH) });
                console.log(`Kill reward: $${reward} (Weapon: ${weaponKey})`);
            }
        });

        // Listen for network ROUND_STATE updates if we're a client
        this.engine.on('network:round_state', (data) => {
            if (!GameState.get('isHost')) {
                GameState.set({
                    roundState: data.roundState,
                    roundTimeLeft: data.roundTimeLeft
                });
            }
        });
    }

    onRoundWin(winner, type = 'elimination') {
        // Only host/local handles win conditions
        if (!GameState.get('isHost') && GameState.get('lobbyCode') !== "") return;
        if (GameState.get('roundState') === 'POST_ROUND') return;

        const scores = { ...GameState.get('teamScores') };
        scores[winner]++;
        
        // Grant Round Rewards
        const playerTeam = GameState.get('playerTeam');
        const isWinner = (playerTeam === winner);
        
        let reward = 0;
        let currentLossStreak = GameState.get('lossStreak');

        if (isWinner) {
            reward = (type === 'bomb') ? ECONOMY_SETTINGS.ROUND_WIN_BOMB : ECONOMY_SETTINGS.ROUND_WIN_ELIMINATION;
            GameState.set({ lossStreak: 0 }); // Reset loss streak on win
        } else {
            reward = ECONOMY_SETTINGS.ROUND_LOSS_BASE + (currentLossStreak * ECONOMY_SETTINGS.ROUND_LOSS_INCREMENT);
            reward = Math.min(reward, ECONOMY_SETTINGS.ROUND_LOSS_MAX);
            GameState.set({ lossStreak: currentLossStreak + 1 }); // Increment loss streak
        }

        const currentCash = GameState.get('cash');
        GameState.set({ cash: Math.min(currentCash + reward, ECONOMY_SETTINGS.MAX_CASH) });

        GameState.set({ 
            teamScores: scores,
            roundState: 'POST_ROUND',
            roundTimeLeft: this.roundStates.POST_ROUND
        });

        console.log(`Team ${winner} wins the round! Reward: $${reward}. Loss streak: ${GameState.get('lossStreak')}`);
        this.engine.emit('round:win', { winner });
        
        // Broadcast win to clients
        this.broadcastState();
    }

    update(delta) {
        // Only the host (or local solo player) drives the round timer
        if (!GameState.get('isHost') && GameState.get('lobbyCode') !== "") {
            return;
        }

        // If game hasn't started, don't tick the round timer
        if (!GameState.get('isGameStarted')) return;

        let timeLeft = GameState.get('roundTimeLeft');
        let currentState = GameState.get('roundState');

        // CS logic: Round timer stops when bomb is planted
        const isBombPlanted = GameState.get('bombPlanted');
        const isBombActive = isBombPlanted && !GameState.get('bombExploded') && !GameState.get('bombDefused');

        if (currentState === 'ROUND_RUNNING' && isBombActive) {
            // Timer is effectively the bomb timer now, which is handled by BombSystem
            // We just keep the round state as ROUND_RUNNING
        } else {
            timeLeft -= delta;
            
            if (timeLeft <= 0) {
                this.transition(currentState);
            } else {
                GameState.set({ roundTimeLeft: timeLeft });
            }
        }
    }

    transition(currentState) {
        let nextState;
        let nextTime;

        switch (currentState) {
            case 'PREROUND':
                nextState = 'ROUND_RUNNING';
                nextTime = this.roundStates.ROUND_RUNNING;
                break;
            case 'ROUND_RUNNING':
                // Timer hit 0 before bomb plant -> CT win
                this.onRoundWin('A');
                return; // onRoundWin handles transition to POST_ROUND
            case 'POST_ROUND':
                this.resetRound();
                nextState = 'PREROUND';
                nextTime = this.roundStates.PREROUND;
                break;
            default:
                nextState = 'PREROUND';
                nextTime = this.roundStates.PREROUND;
        }

        GameState.set({
            roundState: nextState,
            roundTimeLeft: nextTime
        });

        console.log(`Round transitioned to ${nextState}`);

        // Broadcast state if we are in a network lobby
        this.broadcastState();
    }

    broadcastState() {
        const network = this.engine.getSystem('NetworkSystem');
        if (network && GameState.get('isHost')) {
            network.send('ROUND_STATE', {
                roundState: GameState.get('roundState'),
                roundTimeLeft: GameState.get('roundTimeLeft')
            }, true);
        }
    }

    resetRound() {
        console.log("Resetting round...");
        
        // 1. Teleport Player
        this.teleportToSpawn();

        // 2. Reset Health/State (Inventory persists if alive)
        const isPlayerDead = GameState.get('isPlayerDead');
        if (isPlayerDead) {
            GameState.clearInventory();
        }

        GameState.set({
            health: 100,
            bombPlanted: false,
            bombExploded: false,
            bombDefused: false,
            bombTimeLeft: 40,
            defuseProgress: 0,
            isDefusing: false,
            isPlayerDead: false
        });

        // 3. Emit reset for other systems (bots, dropped guns, FX)
        this.engine.emit('round:reset');
    }

    teleportToSpawn() {
        const team = GameState.get('playerTeam') || 'A'; // 'A' (CT), 'B' (T)
        const mapName = GameState.get('selectedMap') || 'dust2';
        const mapData = Maps[mapName];
        
        let spawnPos = new THREE.Vector3(0, 18, 0);
        
        if (mapName === 'dust2') {
            const isT = team === 'B';
            // Simple deterministic spawn or random within zone
            const spawnX = (Math.random() * 200 - 100);
            const spawnZ = isT ? -1600 + (Math.random() * 100) : 800 + (Math.random() * 100);
            spawnPos.set(spawnX, 18, spawnZ);
        } else if (mapData && mapData.spawnPoint) {
            spawnPos.set(mapData.spawnPoint.x, mapData.spawnPoint.y, mapData.spawnPoint.z);
        }

        // Teleport camera (player)
        if (this.engine.camera) {
            this.engine.camera.position.copy(spawnPos);
        }
    }
}
