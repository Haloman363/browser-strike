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

// Mock SnapshotInterpolation
vi.mock('@geckos.io/snapshot-interpolation', () => {
    return {
        SnapshotInterpolation: vi.fn().mockImplementation(() => {
            return {
                snapshot: {
                    create: vi.fn().mockReturnValue({ id: 'snap-id', state: [], timestamp: Date.now() }),
                    add: vi.fn()
                },
                calcInterpolation: vi.fn()
            };
        })
    };
});

import { Peer } from 'peerjs';
import { SnapshotInterpolation } from '@geckos.io/snapshot-interpolation';

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

    it('host(code) should start a broadcast loop', () => {
        vi.useFakeTimers();
        const broadcastSpy = vi.spyOn(system, 'broadcastSnapshot');
        
        system.host('test-code');
        
        vi.advanceTimersByTime(50);
        expect(broadcastSpy).toHaveBeenCalled();
        
        vi.useRealTimers();
    });

    it('broadcastSnapshot should send snapshot message via unreliable channel', () => {
        const unreliableConn = { send: vi.fn(), open: true };
        system.connections.set('client-1', { reliable: { open: true }, unreliable: unreliableConn });
        system.isHost = true;
        
        // Mock state to broadcast
        system.engine.entities = [{
            id: 'player-1',
            position: { x: 1, y: 2, z: 3 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 }
        }];

        system.broadcastSnapshot();

        expect(unreliableConn.send).toHaveBeenCalledWith(expect.objectContaining({
            type: 'SNAPSHOT',
            data: expect.objectContaining({
                state: expect.arrayContaining([
                    expect.objectContaining({ id: 'player-1' })
                ])
            })
        }));
    });

    it('receiving SNAPSHOT should add it to SI instance', () => {
        const addSnapshotSpy = vi.spyOn(system.SI.snapshot, 'add');
        const snapshot = { id: 'snap-1', state: [{ id: 'p1', x: 10, y: 0, z: 10 }] };
        
        // Simulate data reception
        system._handleMessage('SNAPSHOT', snapshot, 'host-peer');
        
        expect(addSnapshotSpy).toHaveBeenCalledWith(snapshot);
    });

    it('update() should interpolate entity positions on client', () => {
        system.isHost = false;
        const mockEntity = {
            id: 'p1',
            position: { x: 0, y: 0, z: 0 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 }
        };
        system.engine.entities = [mockEntity];

        // Setup mock to return an interpolated snapshot
        system.SI.calcInterpolation.mockReturnValue({
            state: [{ id: 'p1', x: 5, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }]
        });

        // Call update
        system.update(0.016); // 60fps delta

        // Check if calcInterpolation was called
        expect(system.SI.calcInterpolation).toHaveBeenCalledWith('x y z qx qy qz qw');

        // Check if position was updated
        expect(mockEntity.position.x).toBe(5);
    });
});
