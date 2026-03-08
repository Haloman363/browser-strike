import { System } from '../core/System.js';
import { Peer } from 'peerjs';

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

        conn.on('data', (data) => {
            console.log('Data received from', conn.peer, ':', data);
            // Will be handled by a message dispatcher in a later task
        });

        conn.on('close', () => {
            console.log('Connection closed:', conn.peer);
            this.connections.delete(conn.peer);
        });
    }

    /**
     * Clean up peer on destroy.
     */
    destroy() {
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }
}
