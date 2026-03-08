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
    }

    /**
     * Initializes PeerJS.
     */
    init() {
        this.peer = new Peer();
        
        // Error handling for PeerJS
        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
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
