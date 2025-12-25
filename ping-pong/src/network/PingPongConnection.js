import { NetworkProtocol } from './NetworkProtocol.js';
import { GameConnection } from './GameConnection.js';

/**
 * PingPongConnection - Game-specific WebRTC logic for Table Tennis
 * Handles encoding/decoding and game-specific message types
 */
export class PingPongConnection {
    constructor(gameConnection, scene) {
        // Accept any connection that implements the GameConnection surface
        if (!gameConnection || typeof gameConnection.send !== 'function') {
            throw new Error('PingPongConnection requires a connection with send()');
        }

        this.gameConnection = gameConnection;
        this.scene = scene;
        this.heartbeatInterval = null;

        // Setup game-specific message handlers
        this.setupMessageHandlers();
    }

    setupMessageHandlers() {
        console.log('[PingPong] Setting up message handlers');
        this.scene.events.on('game_data_received', (event) => {
            const msg = NetworkProtocol.decode(event.data);
            if (msg) {
                this.handleGameMessage(msg);
            }
        });
    }

    handleGameMessage(msg) {
        switch (msg.type) {
            case 'bat':
                this.scene.events.emit('remote_bat_update', msg);
                break;

            case 'hit':
                this.scene.events.emit('remote_hit_event', msg);
                break;

            case 'score':
                this.scene.events.emit('remote_score_update', msg);
                break;

            case 'ping':
                // Keepalive
                break;

            default:
                console.log('[PingPong] Unknown message type:', msg.type);
        }
    }

    // --- Senders ---

    sendBatUpdate(role, x, y, vx, vy) {
        const data = {
            type: 'bat',
            role: role,
            x: x,
            y: y,
            vx: vx,
            vy: vy
        };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, false); // Unreliable
        }
    }

    sendHitEvent(ballState, isServing) {
        const data = {
            type: 'hit',
            state: ballState,
            isServing: isServing
        };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        }
    }

    sendScoreUpdate(scoreA, scoreB, currentServer) {
        const data = {
            type: 'score',
            scoreA: scoreA,
            scoreB: scoreB,
            currentServer: currentServer
        };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        }
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.gameConnection.isConnected) {
                const data = { type: 'ping' };
                const encoded = NetworkProtocol.encode(data);
                if (encoded) {
                    this.gameConnection.send(encoded, false);
                }
            }
        }, 5000); // 5 seconds
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    destroy() {
        this.stopHeartbeat();
        this.scene.events.off('game_data_received');
    }
}
