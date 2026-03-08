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
            this.peer = new Peer();
            this._setupPeerListeners();
        }

        // We'll connect in Task 2 properly, but for Task 1:
        this.peer.connect(code, { reliable: true });
    }

    _setupPeerListeners() {
        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
        });

        this.peer.on('connection', (conn) => {
            console.log('Incoming connection:', conn.peer);
            // Will handle in Task 2
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
