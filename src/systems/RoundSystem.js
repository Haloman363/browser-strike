import { System } from '../core/System.js';
import { GameState } from '../GameState.js';

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

    update(delta) {
        // Only the host (or local solo player) drives the round timer
        if (!GameState.get('isHost') && GameState.get('lobbyCode') !== "") {
            return;
        }

        // If game hasn't started, don't tick the round timer
        if (!GameState.get('isGameStarted')) return;

        let timeLeft = GameState.get('roundTimeLeft');
        let currentState = GameState.get('roundState');

        timeLeft -= delta;
        
        if (timeLeft <= 0) {
            this.transition(currentState);
        } else {
            GameState.set({ roundTimeLeft: timeLeft });
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
                // In a real game, this would be triggered by bomb explosion, 
                // all players dead, or time out. For now, we just loop on timeout.
                nextState = 'POST_ROUND';
                nextTime = this.roundStates.POST_ROUND;
                break;
            case 'POST_ROUND':
                nextState = 'PREROUND';
                nextTime = this.roundStates.PREROUND;
                // Signal a round reset (players back to spawn, reset health, etc.)
                this.engine.emit('round:reset');
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
        const network = this.engine.getSystem('NetworkSystem');
        if (network && GameState.get('isHost')) {
            network.send('ROUND_STATE', {
                roundState: nextState,
                roundTimeLeft: nextTime
            }, true);
        }
    }
}
