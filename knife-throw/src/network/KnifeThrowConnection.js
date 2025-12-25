import { NetworkProtocol } from './NetworkProtocol.js';
import { GameConnection } from './GameConnection.js';

/**
 * KnifeThrowConnection - Game-specific WebRTC logic for Knife Throw
 * Handles encoding/decoding and game-specific message types
 * This is the ONLY file that knows about Knife Throw game logic
 */
export class KnifeThrowConnection {
    constructor(gameConnection, scene) {
        // Accept any connection that implements the GameConnection surface
        if (!gameConnection || typeof gameConnection.send !== 'function') {
            throw new Error('KnifeThrowConnection requires a connection with send()');
        }

        this.gameConnection = gameConnection;
        this.scene = scene;
        this.heartbeatInterval = null;

        // Setup game-specific message handlers
        this.setupMessageHandlers();
    }

    /**
     * Setup handlers for game-specific messages
     */
    setupMessageHandlers() {
        console.log('[KnifeThrow] Setting up message handlers');
        this.scene.events.on('game_data_received', (event) => {
            console.log('[KnifeThrow] Received game_data_received event, data size:', event.data.byteLength);
            const msg = NetworkProtocol.decode(event.data);
            if (msg) {
                console.log('[KnifeThrow] Decoded message:', msg.type);
                this.handleGameMessage(msg);
            } else {
                console.error('[KnifeThrow] Failed to decode message');
            }
        });
    }

    /**
     * Handle incoming game messages
     */
    handleGameMessage(msg) {
        switch (msg.type) {
            case 'throw_knife':
                this.scene.events.emit('opponent_action', {
                    action: 'throw_knife',
                    angle: msg.angle,
                    success: msg.success,
                    timestamp: msg.timestamp
                });
                break;

            case 'throw_start':
                this.scene.events.emit('opponent_action', {
                    action: 'throw_start',
                    timestamp: msg.timestamp
                });
                break;

            case 'round_setup':
                this.scene.events.emit('round_setup', {
                    dummyKnives: msg.dummyKnives,
                    timestamp: msg.timestamp
                });
                break;

            case 'rotation_update':
                this.scene.events.emit('rotation_update', {
                    speed: msg.speed,
                    direction: msg.direction,
                    timestamp: msg.timestamp
                });
                break;

            case 'ping':
                // Keepalive - no action needed
                break;

            default:
                console.log('[KnifeThrow] Unknown message type:', msg.type);
        }
    }

    /**
     * Send knife throw event
     * @param {number} angle - Angle where knife stuck
     * @param {boolean} success - Whether throw was successful
     */
    sendKnifeThrow(angle, success) {
        const data = {
            type: 'throw_knife',
            angle: angle,
            success: success,
            timestamp: Date.now()
        };

        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        } else {
            console.error('[KnifeThrow] Failed to encode knife throw data');
        }
    }

    /**
     * Send throw start event (animation trigger)
     */
    sendThrowStart() {
        const data = {
            type: 'throw_start',
            timestamp: Date.now()
        };

        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        } else {
            console.error('[KnifeThrow] Failed to encode throw start data');
        }
    }

    /**
     * Send round setup (dummy knives configuration)
     * @param {Array<number>} dummyKnives - Array of angles for dummy knives
     */
    sendRoundSetup(dummyKnives) {
        console.log('[KnifeThrow] Sending round setup with', dummyKnives.length, 'dummy knives');

        const data = {
            type: 'round_setup',
            dummyKnives: dummyKnives,
            timestamp: Date.now()
        };

        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        } else {
            console.error('[KnifeThrow] Failed to encode round setup data');
        }
    }

    /**
     * Send rotation update (disc speed and direction)
     * @param {number} speed - Rotation speed
     * @param {number} direction - Rotation direction (1 or -1)
     */
    sendRotationUpdate(speed, direction) {
        const data = {
            type: 'rotation_update',
            speed: speed,
            direction: direction,
            timestamp: Date.now()
        };

        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, false); // Unreliable (frequent updates)
        } else {
            console.error('[KnifeThrow] Failed to encode rotation update data');
        }
    }

    /**
     * Start heartbeat (keepalive)
     * Sends periodic ping messages to keep connection alive
     */
    startHeartbeat() {
        // Clear any existing heartbeat
        this.stopHeartbeat();

        this.heartbeatInterval = setInterval(() => {
            if (this.gameConnection.isConnected) {
                const data = { type: 'ping' };
                const encoded = NetworkProtocol.encode(data);
                if (encoded) {
                    this.gameConnection.send(encoded, false); // Unreliable ping
                }
            }
        }, 30000); // Every 30 seconds

        console.log('[KnifeThrow] Heartbeat started');
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log('[KnifeThrow] Heartbeat stopped');
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stopHeartbeat();
        this.scene.events.off('game_data_received');
    }
}
