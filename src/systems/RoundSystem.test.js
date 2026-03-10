import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoundSystem } from './RoundSystem.js';
import { GameState } from '../GameState.js';

describe('RoundSystem FSM', () => {
    let engine;
    let roundSystem;

    beforeEach(() => {
        engine = {
            on: vi.fn(),
            emit: vi.fn(),
            getSystem: vi.fn((name) => {
                if (name === 'NetworkSystem') return { send: vi.fn() };
                return null;
            })
        };
        roundSystem = new RoundSystem(engine);
        GameState.set({ isGameStarted: true, roundState: 'PREROUND', roundTimeLeft: 15, isHost: true });
    });

    it('should transition from PREROUND to ROUND_RUNNING on timeout', () => {
        roundSystem.update(16); // Trigger one update
        GameState.set({ roundTimeLeft: 0.01 }); // Force near-timeout
        roundSystem.update(0.02); // Trigger transition

        expect(GameState.get('roundState')).toBe('ROUND_RUNNING');
        expect(GameState.get('roundTimeLeft')).toBe(115);
    });

    it('should transition from ROUND_RUNNING to POST_ROUND on timeout', () => {
        GameState.set({ roundState: 'ROUND_RUNNING', roundTimeLeft: 0.01 });
        roundSystem.update(0.02);

        expect(GameState.get('roundState')).toBe('POST_ROUND');
        expect(GameState.get('roundTimeLeft')).toBe(5);
    });

    it('should transition from POST_ROUND back to PREROUND and emit reset', () => {
        GameState.set({ roundState: 'POST_ROUND', roundTimeLeft: 0.01 });
        roundSystem.update(0.02);

        expect(GameState.get('roundState')).toBe('PREROUND');
        expect(GameState.get('roundTimeLeft')).toBe(15);
        expect(engine.emit).toHaveBeenCalledWith('round:reset');
    });

    it('should NOT update timer if game is not started', () => {
        GameState.set({ isGameStarted: false, roundTimeLeft: 15 });
        roundSystem.update(1.0);
        expect(GameState.get('roundTimeLeft')).toBe(15);
    });
});
