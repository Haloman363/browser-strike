import { System } from '../core/System.js';
import { Peer } from 'peerjs';
import { SnapshotInterpolation } from '@geckos.io/snapshot-interpolation';

/**
 * NetworkSystem manages P2P connectivity via PeerJS.
 */
export class NetworkSystem extends System {
    constructor(engine) {
        super(engine);
        this.name = 'NetworkSystem';
        this.peer = null;
        this.isHost = false;
        this.connections = new Map(); // PeerID -> { reliable, unreliable }
        this.broadcastInterval = null;
        this.SI = new SnapshotInterpolation();
        this.localPeerId = null;
    }

    /**
     * Initializes PeerJS.
     */
    init() {
        if (!this.peer) {
            this.peer = new Peer();
            this._setupPeerListeners();
        }
    }

    /**
     * Starts as a host with the given lobby code.
     */
    host(code) {
        this.isHost = true;
        this.peer = new Peer(code);
        this._setupPeerListeners();

        // Start broadcast loop at 20Hz (50ms)
        this.broadcastInterval = setInterval(() => {
            this.broadcastSnapshot();
        }, 50);
    }

    /**
     * Broadcasts a snapshot of the current world state to all peers.
     */
    broadcastSnapshot() {
        if (!this.isHost) return;

        // Gather state from networked entities (players)
        // In the final game, this would query specific networked components.
        // For now, we assume engine.entities is the source of truth.
        const state = (this.engine.entities || []).map(entity => ({
            id: entity.id,
            x: entity.position.x,
            y: entity.position.y,
            z: entity.position.z,
            qx: entity.quaternion.x,
            qy: entity.quaternion.y,
            qz: entity.quaternion.z,
            qw: entity.quaternion.w
        }));

        if (state.length === 0) return;

        const snapshot = this.SI.snapshot.create(state);
        this.send('SNAPSHOT', snapshot, false);
    }

    /**
     * Joins a host with the given lobby code.
     */
    join(code) {
        this.isHost = false;
        if (!this.peer) {
            this.init();
        }

        const reliable = this.peer.connect(code, { label: 'reliable', reliable: true });
        const unreliable = this.peer.connect(code, { label: 'unreliable', reliable: false });

        this._setupConnection(reliable);
        this._setupConnection(unreliable);
    }

    /**
     * Sends a message to all connected peers (if host) or to the host (if client).
     */
    send(type, data, reliable = true) {
        const payload = { type, data, timestamp: Date.now() };

        this.connections.forEach((conns) => {
            const conn = reliable ? conns.reliable : conns.unreliable;
            if (conn && conn.open) {
                conn.send(payload);
            }
        });
    }

    _setupPeerListeners() {
        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
        });

        this.peer.on('connection', (conn) => {
            console.log('Incoming connection:', conn.peer, conn.label);
            this._setupConnection(conn);
        });
    }

    _setupConnection(conn) {
        conn.on('open', () => {
            console.log('Connection open:', conn.peer, conn.label);
            
            // Store connection in map
            if (!this.connections.has(conn.peer)) {
                this.connections.set(conn.peer, { reliable: null, unreliable: null });
            }
            
            const peerConns = this.connections.get(conn.peer);
            if (conn.label === 'reliable') {
                peerConns.reliable = conn;
            } else if (conn.label === 'unreliable') {
                peerConns.unreliable = conn;
            }

            // Client handshake: if both are open, send JOIN
            if (!this.isHost && peerConns.reliable?.open && peerConns.unreliable?.open) {
                this.send('JOIN', { peerId: this.peer.id }, true);
            }
        });

        conn.on('data', (payload) => {
            // payload is { type, data, timestamp }
            if (payload && payload.type) {
                this._handleMessage(payload.type, payload.data, conn.peer);
            }
        });

        conn.on('close', () => {
            console.log('Connection closed:', conn.peer);
            this.connections.delete(conn.peer);
        });
    }

    /**
     * Internal message dispatcher.
     */
    _handleMessage(type, data, peerId) {
        switch (type) {
            case 'SNAPSHOT':
                if (!this.isHost) {
                    this.SI.snapshot.add(data);
                }
                break;
            case 'JOIN':
                console.log('Player joined:', data.peerId);
                break;
            default:
                console.log('Unknown message type:', type, 'from', peerId);
        }
    }

    /**
     * Updates interpolation on client.
     */
    update(dt) {
        if (this.isHost) return;

        const snapshot = this.SI.calcInterpolation('x y z qx qy qz qw');
        if (snapshot) {
            const { state } = snapshot;
            state.forEach((s) => {
                const entity = (this.engine.entities || []).find(e => e.id === s.id);
                if (entity) {
                    entity.position.x = s.x;
                    entity.position.y = s.y;
                    entity.position.z = s.z;
                    if (entity.quaternion) {
                        entity.quaternion.x = s.qx;
                        entity.quaternion.y = s.qy;
                        entity.quaternion.z = s.qz;
                        entity.quaternion.w = s.qw;
                    }
                }
            });
        }
    }

    /**
     * Clean up peer on destroy.
     */
    destroy() {
        if (this.broadcastInterval) {
            clearInterval(this.broadcastInterval);
        }
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }
}
