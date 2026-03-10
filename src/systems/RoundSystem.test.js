import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoundSystem } from './RoundSystem.js';
import { GameState } from '../GameState.js';

vi.mock('../Maps_v2.js', () => ({
    Maps: {
        dust2: { spawnPoint: { x: 0, y: 18, z: 0 } }
    }
}));

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
        GameState.set({ roundState: 'PREROUND', roundTimeLeft: 0.01 });
        roundSystem.update(0.02);

        expect(GameState.get('roundState')).toBe('ROUND_RUNNING');
        expect(GameState.get('roundTimeLeft')).toBe(115);
    });

    it('should award $300 on engine:kill event', () => {
        const initialCash = GameState.get('cash');
        // Simulate engine event
        const killHandler = engine.on.mock.calls.find(call => call[0] === 'engine:kill')[1];
        killHandler({ attacker: 'player' }); // Assuming it passes attacker info

        expect(GameState.get('cash')).toBe(initialCash + 300);
    });

    it('should award $3250 for win and $1400 for loss', () => {
        GameState.set({ cash: 1000, playerTeam: 'A' });
        
        // Winner A
        roundSystem.onRoundWin('A');
        expect(GameState.get('cash')).toBe(4250);

        // Loser B (player is A, so player loses)
        GameState.set({ cash: 1000, playerTeam: 'A', roundState: 'ROUND_RUNNING' });
        roundSystem.onRoundWin('B');
        expect(GameState.get('cash')).toBe(2400);
    });

    it('should persist inventory if alive at resetRound', () => {
        const spy = vi.spyOn(GameState, 'clearInventory');
        GameState.set({ isPlayerDead: false });
        GameState.setInventorySlot(1, 'AK47');

        roundSystem.resetRound();

        expect(spy).not.toHaveBeenCalled();
        expect(GameState.getInventorySlot(1)).toBe('AK47');
        spy.mockRestore();
    });

    it('should clear inventory if dead at resetRound', () => {
        const spy = vi.spyOn(GameState, 'clearInventory');
        GameState.set({ isPlayerDead: true });
        GameState.setInventorySlot(1, 'AK47');

        roundSystem.resetRound();

        expect(spy).toHaveBeenCalled();
        expect(GameState.getInventorySlot(1)).toBeNull();
        spy.mockRestore();
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
