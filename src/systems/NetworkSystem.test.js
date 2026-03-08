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

    it('host(code) should set isHost and initialize Peer with ID', () => {
        system.host('my-lobby-code');
        expect(system.isHost).toBe(true);
        expect(Peer).toHaveBeenCalledWith('my-lobby-code');
    });

    it('join(code) should set isHost to false and connect to peer', () => {
        const mockConn = { on: vi.fn() };
        system.init();
        system.peer.connect = vi.fn().mockReturnValue(mockConn);

        system.join('target-host-code');
        expect(system.isHost).toBe(false);
        expect(system.peer.connect).toHaveBeenCalledWith('target-host-code', expect.anything());
    });
});
