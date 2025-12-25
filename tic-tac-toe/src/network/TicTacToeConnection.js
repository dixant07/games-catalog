import { NetworkProtocol } from './NetworkProtocol.js';
import { GameConnection } from './GameConnection.js';

export class TicTacToeConnection {
    constructor(gameConnection, scene) {
        // Accept any connection that implements the GameConnection surface
        if (!gameConnection || typeof gameConnection.send !== 'function') {
            throw new Error('TicTacToeConnection requires a connection with send()');
        }

        this.gameConnection = gameConnection;
        this.scene = scene;
        this.heartbeatInterval = null;

        this.setupMessageHandlers();
    }

    setupMessageHandlers() {
        this.scene.events.on('game_data_received', (event) => {
            const msg = NetworkProtocol.decode(event.data);
            if (msg) {
                this.handleGameMessage(msg);
            }
        });
    }

    handleGameMessage(msg) {
        switch (msg.type) {
            case 'move':
                this.scene.events.emit('remote_move', msg);
                break;
            case 'reset':
                this.scene.events.emit('remote_reset', msg);
                break;
            case 'game_over':
                this.scene.events.emit('remote_game_over', msg);
                break;
            case 'ping':
                break;
            default:
                console.log('[TicTacToe] Unknown message type:', msg.type);
        }
    }

    sendMove(index) {
        const data = { type: 'move', index: index };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        }
    }

    sendReset() {
        const data = { type: 'reset' };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        }
    }

    sendGameOver(winnerRole) {
        const data = { type: 'game_over', winnerRole: winnerRole };
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
        }, 5000);
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
