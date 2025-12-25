import { NetworkProtocol } from './NetworkProtocol.js';
import { GameConnection } from './GameConnection.js';

/**
 * DoodleGuessConnection - Game-specific WebRTC logic for Doodle Guess
 */
export class DoodleGuessConnection {
    constructor(gameConnection, scene) {
        // Accept any connection that implements the GameConnection surface
        if (!gameConnection || typeof gameConnection.send !== 'function') {
            throw new Error('DoodleGuessConnection requires a connection with send()');
        }

        this.gameConnection = gameConnection;
        this.scene = scene;
        this.heartbeatInterval = null;

        // Setup game-specific message handlers
        this.setupMessageHandlers();
    }

    setupMessageHandlers() {
        console.log('[DoodleGuess] Setting up message handlers');
        this.scene.events.on('game_data_received', (event) => {
            const msg = NetworkProtocol.decode(event.data);
            if (msg) {
                this.handleGameMessage(msg);
            }
        });
    }

    handleGameMessage(msg) {
        switch (msg.type) {
            case 'draw':
                this.scene.events.emit('remote_draw', msg);
                break;

            case 'clear_canvas':
                this.scene.events.emit('remote_clear_canvas', msg);
                break;

            case 'word_selected':
                this.scene.events.emit('remote_word_selected', msg);
                break;

            case 'guess':
                this.scene.events.emit('remote_guess', msg);
                break;

            case 'game_state':
                this.scene.events.emit('remote_game_state', msg);
                break;

            case 'typing_sync':
                this.scene.events.emit('remote_typing_sync', msg);
                break;

            case 'typing_feedback':
                this.scene.events.emit('remote_typing_feedback', msg);
                break;

            case 'flood_fill':
                this.scene.events.emit('remote_flood_fill', msg);
                break;

            case 'undo':
                this.scene.events.emit('remote_undo', msg);
                break;

            case 'round_end':
                this.scene.events.emit('remote_round_end', msg);
                break;

            case 'ping':
                // Keepalive
                break;

            default:
                console.log('[DoodleGuess] Unknown message type:', msg.type);
        }
    }

    // --- Senders ---

    sendDraw(x, y, isDrawing, color, thickness) {
        const data = {
            type: 'draw',
            x: x,
            y: y,
            isDrawing: isDrawing,
            color: color,
            thickness: thickness
        };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, false); // Unreliable for strokes
        }
    }

    sendClearCanvas() {
        const data = { type: 'clear_canvas' };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        }
    }

    sendWordSelected(word) {
        const data = {
            type: 'word_selected',
            word: word
        };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        }
    }

    sendGuess(guess) {
        const data = {
            type: 'guess',
            guess: guess
        };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        }
    }

    sendGameState(state, timeRemaining, wordLength, hints) {
        const data = {
            type: 'game_state',
            state: state,
            timeRemaining: timeRemaining,
            wordLength: wordLength,
            hints: hints
        };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        }
    }

    sendTyping(text) {
        const data = {
            type: 'typing_sync',
            text: text
        };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, false); // Unreliable is fine for fast updates
        }
    }

    sendTypingFeedback(status, text, points = 0) {
        const data = {
            type: 'typing_feedback',
            status: status, // 'wrong', 'close', 'correct'
            text: text,
            points: points
        };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, false);
        }
    }

    sendFloodFill(x, y, color) {
        const data = {
            type: 'flood_fill',
            x: x,
            y: y,
            color: color
        };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        }
    }

    sendUndo() {
        const data = { type: 'undo' };
        const encoded = NetworkProtocol.encode(data);
        if (encoded) {
            this.gameConnection.send(encoded, true); // Reliable
        }
    }

    sendRoundEnd(guessedCorrectly, word, points = 0) {
        const data = {
            type: 'round_end',
            guessedCorrectly: guessedCorrectly,
            word: word,
            points: points
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
