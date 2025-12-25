import GameConfig from '../config/GameConfig.js';
import { LocalNetworkManager as WebSocketNetworkManager } from '../../../shared-networking/WebSocketNetworkManager.js';
import { LocalGameConnection } from '../../../shared-networking/LocalGameConnection.js';

/**
 * NetworkManager - Main network coordinator
 */
export class NetworkManager {
    constructor(scene) {
        this.scene = scene;
        this.socket = null;
        this.userId = this.generateUserId();
        this.roomId = null;
        this.role = null;
        this.opponentId = null;
        this.isInitiator = false;
        this.iceServers = { game: [] };

        this.gameConnection = null;
        
        // Use WebSocket-based local networking
        this.localNetworkManager = new WebSocketNetworkManager(scene);

        this.isSignalingConnected = false;
        this.isEmbedded = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        this.pendingOffer = null;
        this.pendingCandidates = [];
    }

    generateUserId() {
        return 'user-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Connect to WebSocket-based local development networking
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                // Use generated userId for local development
                this.userId = this.generateUserId();

                console.log('[NetworkManager] Starting WEBSOCKET LOCAL DEVELOPMENT mode. Using WebSocket server for peer discovery.');
                this.isSignalingConnected = true;
                
                // Initialize WebSocket networking
                this.initializeWebSocketNetworking();
                // Wait until the underlying WebSocket is actually connected
                this.localNetworkManager.connect().then(resolve).catch(reject);

            } catch (error) {
                console.error("[NetworkManager] Error initializing WebSocket networking:", error);
                reject(error);
            }
        });
    }

    /**
     * Initialize WebSocket networking components
     */
    initializeWebSocketNetworking() {
        // Forward events from WebSocket network manager to scene
        this.localNetworkManager.scene.events.on('match_found', (data) => {
            this.handleMatchFound(data);
        });

        // Forward raw game data one-way into the scene so game-specific
        // connections can decode it. Guard to avoid re-entry.
        this.localNetworkManager.scene.events.on('game_data_received', (data) => {
            if (data && data.__forwarded) return;
            this.scene.events.emit('game_data_received', { ...data, __forwarded: true });
        });
    }

    setupEmbeddedHandlers() {
        window.addEventListener('message', (event) => {
            const { type, payload } = event.data;
            if (type === 'game_signal_offer') {
                if (this.gameConnection) {
                    this.gameConnection.handleOffer(payload);
                } else {
                    this.pendingOffer = payload;
                }
            } else if (type === 'game_signal_answer') {
                if (this.gameConnection) {
                    this.gameConnection.handleAnswer(payload);
                }
            } else if (type === 'game_signal_candidate') {
                if (this.gameConnection) {
                    this.gameConnection.handleCandidate(payload);
                } else {
                    this.pendingCandidates.push(payload);
                }
            } else if (type === 'ice_servers_config') {
                this.iceServers = payload || { game: [] };
            }
        });
    }

    emitToServer(event, payload) {
        if (this.isEmbedded) {
            window.parent.postMessage({
                type: 'game_signal_emit',
                event: event,
                payload: payload
            }, '*');
        } else if (this.socket && this.socket.connected) {
            this.socket.emit(event, payload);
        }
    }

    emit(event, payload) {
        this.emitToServer(event, payload);
    }

    setupSignalingHandlers() {
        if (!this.socket) return;

        this.socket.on('ice_servers_config', (data) => {
            this.iceServers = data.iceServers || { game: [] };
        });

        this.socket.on('offer', (data) => {
            if (this.gameConnection) {
                this.gameConnection.handleOffer(data);
            } else {
                this.pendingOffer = data;
            }
        });

        this.socket.on('answer', (data) => {
            if (this.gameConnection) {
                this.gameConnection.handleAnswer(data);
            }
        });

        this.socket.on('ice-candidate', (data) => {
            if (this.gameConnection) {
                this.gameConnection.handleCandidate(data);
            } else {
                this.pendingCandidates.push(data);
            }
        });
    }

    async handleMatchFound(msg) {
        this.roomId = msg.roomId;
        this.role = msg.role;
        this.opponentId = msg.opponentId;
        this.opponentUid = msg.opponentUid;
        this.isInitiator = msg.isInitiator;

        if (msg.iceServers) {
            this.iceServers = msg.iceServers;
        }

    }

    /**
     * Connect to game WebRTC connection
     */
    async connectToGame() {
        if (!this.roomId || !this.opponentId) {
            console.error("[NetworkManager] Cannot connect to game: No match details found");
            return;
        }

        console.log('[NetworkManager] Connecting to game via local networking...');
        if (this.localNetworkManager) {
            await this.localNetworkManager.connectToGame();

            // Expose the underlying game connection for GameScene
            this.gameConnection = this.localNetworkManager.gameConnection;
        }
    }

    async waitForIceServers(timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            if (this.iceServers && this.iceServers.game && this.iceServers.game.length > 0) {
                resolve(this.iceServers);
                return;
            }
            const timeout = setTimeout(() => {
                this.socket.off('ice_servers_config', handler);
                reject(new Error('Timeout waiting for ICE servers'));
            }, timeoutMs);
            const handler = (data) => {
                clearTimeout(timeout);
                resolve(data.iceServers);
            };
            this.socket.once('ice_servers_config', handler);
            this.socket.emit('get_ice_servers');
        });
    }

    async waitForIceServersEmbedded(timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            if (this.iceServers && this.iceServers.game && this.iceServers.game.length > 0) {
                resolve(this.iceServers);
                return;
            }

            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                if (this.iceServers && this.iceServers.game && this.iceServers.game.length > 0) {
                    clearInterval(checkInterval);
                    resolve(this.iceServers);
                } else if (Date.now() - startTime > timeoutMs) {
                    clearInterval(checkInterval);
                    reject(new Error('Timeout waiting for ICE servers (Embedded)'));
                }
            }, 100);
        });
    }

    /**
     * Initialize game connection with local networking
     */
    async initializeGameConnection() {
        // Use LocalGameConnection for local development
        this.gameConnection = new LocalGameConnection(this.localNetworkManager || this, this.scene.events);

        await this.gameConnection.initialize({
            isInitiator: this.isInitiator,
            opponentId: this.opponentId,
            opponentUid: this.opponentUid,
            roomId: this.roomId,
            iceServers: this.iceServers.game || [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
    }

    /**
     * Find match - send request to WebSocket server
     */
    async findMatch(preferences = {}) {
        console.log('[NetworkManager] Looking for local peer via WebSocket server...');
        if (this.localNetworkManager) {
            // Ensure signaling is ready before sending find-match
            await this.localNetworkManager.connect();
            await this.localNetworkManager.findMatch(preferences);
        }
    }

    disconnect() {
        console.log('[NetworkManager] Disconnecting all connections...');
        if (this.gameConnection) this.gameConnection.close();
        if (this.localNetworkManager) this.localNetworkManager.disconnect();
        if (this.socket) this.socket.disconnect();
    }

    get isConnected() {
        return this.localNetworkManager ? this.localNetworkManager.isConnected : 
               (this.gameConnection ? this.gameConnection.isConnected : false);
    }
}
