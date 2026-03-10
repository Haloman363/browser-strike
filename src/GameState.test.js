import { describe, it, expect, beforeEach } from 'vitest';
import { GameStateManager } from './GameState.js';

describe('GameState Inventory', () => {
    let gameState;

    beforeEach(() => {
        gameState = new GameStateManager();
    });

    it('should have initial inventory state', () => {
        const inventory = gameState.get('inventory');
        expect(inventory).toEqual({ 1: null, 2: 'GLOCK', 3: 'KNIFE', 4: [], 5: null });
    });

    it('should award $300 on kill event', () => {
        const initialCash = gameState.get('cash');
        gameState.set({ cash: initialCash + 300 });
        expect(gameState.get('cash')).toBe(initialCash + 300);
    });

    it('should set and get inventory slots', () => {
        gameState.setInventorySlot(1, 'AK47');
        expect(gameState.getInventorySlot(1)).toBe('AK47');
        expect(gameState.get('inventory')[1]).toBe('AK47');
    });

    it('should handle grenade slot (slot 4) as an array', () => {
        gameState.setInventorySlot(4, 'HE_GRENADE');
        gameState.setInventorySlot(4, 'SMOKE');
        expect(gameState.getInventorySlot(4)).toEqual(['HE_GRENADE', 'SMOKE']);
    });

    it('should clear inventory except knife', () => {
        gameState.setInventorySlot(1, 'AK47');
        gameState.setInventorySlot(2, 'DEAGLE');
        gameState.clearInventory();
        expect(gameState.getInventorySlot(1)).toBeNull();
        expect(gameState.getInventorySlot(2)).toBe('GLOCK'); // Reset to default pistol
        expect(gameState.getInventorySlot(3)).toBe('KNIFE');
        expect(gameState.getInventorySlot(4)).toEqual([]);
    });
});
