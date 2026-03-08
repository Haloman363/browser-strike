import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkSystem } from './NetworkSystem.js';

// Mock PeerJS
vi.mock('peerjs', () => {
    return {
        Peer: vi.fn().mockImplementation(function() {
            this.on = vi.fn();
            this.destroy = vi.fn();
        }),
    };
});

import { Peer } from 'peerjs';

describe('NetworkSystem', () => {
    let mockEngine;
    let system;

    beforeEach(() => {
        mockEngine = {};
        system = new NetworkSystem(mockEngine);
    });

    it('should have the correct name', () => {
        expect(system.name).toBe('NetworkSystem');
    });

    it('should initialize a Peer instance in init()', () => {
        system.init();
        expect(Peer).toHaveBeenCalled();
        expect(system.peer).toBeDefined();
    });
});
