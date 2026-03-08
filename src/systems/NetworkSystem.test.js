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

    it('join(code) should set isHost to false and connect to peer with dual channels', () => {
        const mockConn = { on: vi.fn() };
        system.init();
        system.peer.connect = vi.fn().mockReturnValue(mockConn);

        system.join('target-host-code');
        expect(system.isHost).toBe(false);
        expect(system.peer.connect).toHaveBeenCalledWith('target-host-code', expect.objectContaining({ label: 'reliable', reliable: true }));
        expect(system.peer.connect).toHaveBeenCalledWith('target-host-code', expect.objectContaining({ label: 'unreliable', reliable: false }));
    });

    it('send(type, data, reliable) should route to correct channel', () => {
        const reliableConn = { send: vi.fn(), open: true };
        const unreliableConn = { send: vi.fn(), open: true };
        system.connections.set('host', { reliable: reliableConn, unreliable: unreliableConn });

        system.send('TEST_TYPE', { foo: 'bar' }, true);
        expect(reliableConn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'TEST_TYPE' }));
        expect(unreliableConn.send).not.toHaveBeenCalled();

        system.send('UNRELIABLE_TYPE', { bar: 'baz' }, false);
        expect(unreliableConn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'UNRELIABLE_TYPE' }));
    });
});
