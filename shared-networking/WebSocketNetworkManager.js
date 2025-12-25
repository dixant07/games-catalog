/**
 * WebSocket-based LocalNetworkManager
 * Uses a simple WebSocket server for coordination between browser tabs
 */

export class LocalNetworkManager {
    constructor(scene) {
        this.scene = scene;
        this.peerId = null;
        this.roomId = 'local-room';
        this.role = null; // 'A' or 'B'
        this.opponentId = null;
        this.isInitiator = false;
        this.isSignalingConnected = false;
        this.matchmakingComplete = false;

        this.gameConnection = null;
        this.pendingOffer = null;
        this.pendingCandidates = [];
        
        // STUN servers only for local development
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];

        this.setupWebSocketConnection();
    }

    /**
     * Setup WebSocket connection to local server
     */
    setupWebSocketConnection() {
        try {
            this.ws = new WebSocket('ws://localhost:8081');
            
            this.ws.onopen = () => {
                console.log('[LocalNetworkManager] Connected to local server');
                this.isSignalingConnected = true;
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleServerMessage(message);
                } catch (err) {
                    console.error('[LocalNetworkManager] Error parsing server message:', err);
                }
            };
            
            this.ws.onclose = () => {
                console.log('[LocalNetworkManager] Disconnected from server');
                this.isSignalingConnected = false;
            };
            
            this.ws.onerror = (error) => {
                console.error('[LocalNetworkManager] WebSocket error:', error);
                this.isSignalingConnected = false;
            };
            
        } catch (err) {
            console.error('[LocalNetworkManager] Failed to connect to server:', err);
            this.scene.events.emit('connection_failed');
        }
    }

    /**
     * Handle messages from the server
     */
    handleServerMessage(message) {
        console.log('[LocalNetworkManager] Received server message:', message.type);

        switch (message.type) {
            case 'client-id':
                this.peerId = message.clientId;
                console.log('[LocalNetworkManager] Received client ID:', this.peerId);
                break;
                
            case 'waiting':
                console.log('[LocalNetworkManager] Waiting for opponent...');
                this.scene.events.emit('queued');
                break;
                
            case 'match-found':
                this.handleMatchFound(message);
                break;
                
            case 'signal':
                this.handleSignalingMessage(message);
                break;
                
            case 'peer-disconnected':
                console.log('[LocalNetworkManager] Opponent disconnected');
                this.scene.events.emit('connection_failed');
                break;
        }
    }

    /**
     * Handle match found message from server
     */
    handleMatchFound(message) {
        this.role = message.role;
        this.opponentId = message.opponentId;
        this.isInitiator = message.isInitiator;
        this.matchmakingComplete = true;
        
        console.log(`[LocalNetworkManager] Match found! Role: ${this.role}, Opponent: ${this.opponentId}`);

        // Emit match_found event to game
        this.scene.events.emit('match_found', {
            roomId: this.roomId,
            role: this.role,
            opponentId: this.opponentId,
            opponentUid: this.opponentId,
            isInitiator: this.isInitiator,
            iceServers: message.iceServers || { game: this.iceServers }
        });

        // Auto-initialize WebRTC once matchmaking completes so offers/answers
        // don't get dropped waiting for a manual connect call.
        this.connectToGame();
    }

    /**
     * Handle signaling messages
     */
    handleSignalingMessage(message) {
        if (!message.data) return;
        
        console.log('[LocalNetworkManager] Received signal:', message.data.type);

        switch (message.data.type) {
            case 'offer':
                if (this.gameConnection) {
                    this.gameConnection.handleOffer(message.data);
                } else {
                    this.pendingOffer = message.data;
                }
                break;

            case 'answer':
                if (this.gameConnection) {
                    this.gameConnection.handleAnswer(message.data);
                }
                break;

            case 'ice-candidate':
                if (this.gameConnection) {
                    this.gameConnection.handleCandidate(message.data);
                } else {
                    this.pendingCandidates.push(message.data);
                }
                break;
        }
    }

    /**
     * Send message to server
     */
    sendToServer(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.error('[LocalNetworkManager] Not connected to server');
        }
    }

    /**
     * Emit signaling message via server
     */
    emitSignalingMessage(message) {
        this.sendToServer({
            type: 'signal',
            data: message
        });
    }

    /**
     * Compatibility wrapper so LocalGameConnection can call socket.emit(...)
     */
    emit(event, payload) {
        // Flatten the payload instead of nesting under a data key so the
        // receiver gets { type: 'offer', offer: {...}, to: ... }
        this.emitSignalingMessage({
            type: event,
            ...payload
        });
    }

    /**
     * Find match - send request to server
     */
    async findMatch(preferences = {}) {
        console.log('[LocalNetworkManager] Finding match...');
        this.sendToServer({ type: 'find-match' });
    }

    /**
     * Connect method for compatibility
     */
    async connect() {
        console.log('[LocalNetworkManager] Starting WebSocket-based local development...');
        return new Promise((resolve) => {
            const checkConnection = () => {
                if (this.isSignalingConnected) {
                    resolve();
                } else {
                    setTimeout(checkConnection, 100);
                }
            };
            checkConnection();
        });
    }

    /**
     * Connect to game WebRTC connection
     */
    async connectToGame() {
        if (!this.opponentId) {
            console.error("[LocalNetworkManager] Cannot connect to game: No opponent found");
            return;
        }

        // Prevent multiple connection attempts
        if (this.gameConnection && this.gameConnection.isConnected) {
            console.log("[LocalNetworkManager] Already connected to game");
            return;
        }

        await this.initializeGameConnection();

        // Process pending messages
        if (this.pendingOffer && !this.isInitiator) {
            console.log('[LocalNetworkManager] Processing buffered offer...');
            await this.gameConnection.handleOffer(this.pendingOffer);
            this.pendingOffer = null;
        }

        if (this.pendingCandidates.length > 0) {
            console.log('[LocalNetworkManager] Processing buffered candidates...');
            for (const candidateData of this.pendingCandidates) {
                await this.gameConnection.handleCandidate(candidateData);
            }
            this.pendingCandidates = [];
        }
    }

    /**
     * Initialize game connection
     */
    async initializeGameConnection() {
        // Close existing game connection if any
        if (this.gameConnection) {
            this.gameConnection.close();
            this.gameConnection = null;
        }
        
        // Import LocalGameConnection dynamically to avoid circular dependencies
        const { LocalGameConnection } = await import('./LocalGameConnection.js');
        
        this.gameConnection = new LocalGameConnection(this, this.scene.events);

        await this.gameConnection.initialize({
            isInitiator: this.isInitiator,
            opponentId: this.opponentId,
            opponentUid: this.opponentId,
            roomId: this.roomId,
            iceServers: this.iceServers
        });
    }

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        console.log('[LocalNetworkManager] Disconnecting...');
        
        if (this.ws) {
            this.ws.close();
        }

        if (this.gameConnection) {
            this.gameConnection.close();
        }
        
        this.matchmakingComplete = false;
        this.opponentId = null;
    }

    /**
     * Connection status
     */
    get isConnected() {
        return this.gameConnection ? this.gameConnection.isConnected : false;
    }
}
