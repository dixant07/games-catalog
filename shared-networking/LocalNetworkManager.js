/**
 * LocalNetworkManager - Simplified networking for local development
 * Uses localStorage for peer discovery and WebRTC for direct communication
 * No matchmaking server required - works with two browser tabs
 */
export class LocalNetworkManager {
    constructor(scene) {
        this.scene = scene;
        this.peerId = this.generatePeerId();
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

        this.setupLocalStorageSignaling();
    }

    generatePeerId() {
        return 'peer-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Setup localStorage-based signaling for local development
     */
    setupLocalStorageSignaling() {
        // Listen for signaling messages from other tabs
        window.addEventListener('storage', (event) => {
            if (event.key !== 'local-game-signaling') return;
            
            try {
                const message = JSON.parse(event.newValue);
                if (message.targetPeer === this.peerId) {
                    this.handleSignalingMessage(message);
                }
            } catch (err) {
                console.error('[LocalNetworkManager] Error parsing signaling message:', err);
            }
        });

        // Don't auto-start matchmaking - wait for findMatch() call
        console.log('[LocalNetworkManager] Local signaling setup complete, waiting for findMatch()...');
    }

    /**
     * Start matchmaking process - find available peers or create room
     */
    startMatchmaking() {
        console.log('[LocalNetworkManager] Starting matchmaking process...');
        
        // Use leader election approach
        this.electLeader();
    }

    /**
     * Leader election - determine who should be host vs guest
     */
    electLeader() {
        const peersData = localStorage.getItem('local-game-peers');
        const peers = peersData ? JSON.parse(peersData) : [];
        
        // Clean up old inactive peers (older than 10 seconds)
        const now = Date.now();
        const activePeers = peers.filter(p => p.active && (now - p.timestamp) < 10000);
        
        // Check if we're already registered
        const existingPeer = activePeers.find(p => p.id === this.peerId);
        
        if (existingPeer) {
            console.log('[LocalNetworkManager] Already registered as', existingPeer.role);
            this.role = existingPeer.role;
            this.isInitiator = existingPeer.role === 'A';
            this.isSignalingConnected = true;
            return;
        }
        
        // Try to register as host first
        this.tryRegisterAsHost(activePeers);
    }

    /**
     * Try to register as host
     */
    tryRegisterAsHost(activePeers) {
        // Check if there's already a host
        const existingHost = activePeers.find(p => p.role === 'A' && p.lookingForMatch);
        
        if (existingHost) {
            // There's already a host, join as guest
            console.log('[LocalNetworkManager] Found existing host, joining as guest');
            this.joinAsGuest(existingHost);
        } else {
            // No host, try to become host
            console.log('[LocalNetworkManager] No host found, trying to become host');
            this.becomeHost();
        }
    }

    /**
     * Become host
     */
    becomeHost() {
        const peersData = localStorage.getItem('local-game-peers') || '[]';
        const peers = JSON.parse(peersData);
        
        // Add ourselves as host
        peers.push({ 
            id: this.peerId, 
            active: true, 
            timestamp: Date.now(),
            role: 'A',
            lookingForMatch: true
        });
        
        // Write to localStorage
        localStorage.setItem('local-game-peers', JSON.stringify(peers));
        
        // Wait a moment and verify we're still the only host
        setTimeout(() => {
            this.verifyHostStatus();
        }, 100);
        
        this.role = 'A';
        this.isInitiator = true;
        this.isSignalingConnected = true;
        
        console.log('[LocalNetworkManager] Registered as host, verifying...');
    }

    /**
     * Verify we're still the host (check for race conditions)
     */
    verifyHostStatus() {
        const peersData = localStorage.getItem('local-game-peers');
        const peers = peersData ? JSON.parse(peersData) : [];
        const now = Date.now();
        const activePeers = peers.filter(p => p.active && (now - p.timestamp) < 10000);
        
        const allHosts = activePeers.filter(p => p.role === 'A' && p.lookingForMatch);
        
        if (allHosts.length > 1) {
            // Multiple hosts, check if we should remain host
            allHosts.sort((a, b) => a.timestamp - b.timestamp);
            const earliestHost = allHosts[0];
            
            if (earliestHost.id !== this.peerId) {
                // We're not the earliest, switch to guest
                console.log('[LocalNetworkManager] Race condition detected, switching to guest');
                this.switchToGuest(earliestHost);
                return;
            }
        }
        
        // We're confirmed as host
        console.log('[LocalNetworkManager] Confirmed as host');
        this.startHostPolling();
        this.waitForPlayer();
    }

    /**
     * Switch to guest role
     */
    switchToGuest(host) {
        // Remove our host registration
        const peersData = localStorage.getItem('local-game-peers') || '[]';
        const peers = JSON.parse(peersData);
        const updatedPeers = peers.filter(p => p.id !== this.peerId);
        
        // Add ourselves as guest
        updatedPeers.push({ 
            id: this.peerId, 
            active: true, 
            timestamp: Date.now(),
            role: 'B',
            matchedWith: host.id
        });
        
        localStorage.setItem('local-game-peers', JSON.stringify(updatedPeers));
        
        this.role = 'B';
        this.isInitiator = false;
        this.opponentId = host.id;
        
        // Send join request to host
        this.emitSignalingMessage({
            type: 'join-request',
            fromPeer: this.peerId,
            toPeer: host.id
        });
        
        this.waitForHostAcceptance();
    }

    /**
     * Join as guest
     */
    joinAsGuest(host) {
        const peersData = localStorage.getItem('local-game-peers') || '[]';
        const peers = JSON.parse(peersData);
        
        // Add ourselves as guest
        peers.push({ 
            id: this.peerId, 
            active: true, 
            timestamp: Date.now(),
            role: 'B',
            matchedWith: host.id
        });
        
        localStorage.setItem('local-game-peers', JSON.stringify(peers));
        
        this.role = 'B';
        this.isInitiator = false;
        this.opponentId = host.id;
        this.isSignalingConnected = true;
        
        console.log('[LocalNetworkManager] Joined as guest');
        
        // Send join request to host
        this.emitSignalingMessage({
            type: 'join-request',
            fromPeer: this.peerId,
            toPeer: host.id
        });
        
        this.waitForHostAcceptance();
    }

    /**
     * Start polling to check if we should remain host or join as guest
     */
    startHostPolling() {
        this.hostPollingInterval = setInterval(() => {
            this.checkHostStatus();
        }, 200); // Check every 200ms
    }

    /**
     * Check if we should remain host or switch to guest
     */
    checkHostStatus() {
        if (this.matchmakingComplete) {
            clearInterval(this.hostPollingInterval);
            return;
        }

        const peersData = localStorage.getItem('local-game-peers');
        const peers = peersData ? JSON.parse(peersData) : [];
        const now = Date.now();
        const activePeers = peers.filter(p => p.active && (now - p.timestamp) < 10000);
        
        // Find all hosts
        const allHosts = activePeers.filter(p => p.role === 'A');
        
        if (allHosts.length > 1) {
            // Multiple hosts exist, find the earliest one
            allHosts.sort((a, b) => a.timestamp - b.timestamp);
            const earliestHost = allHosts[0];
            
            if (earliestHost.id !== this.peerId) {
                // We're not the earliest host, switch to guest and join the earliest host
                console.log('[LocalNetworkManager] Found earlier host, switching to guest');
                clearInterval(this.hostPollingInterval);
                
                // Remove our host registration
                const updatedPeers = peers.filter(p => p.id !== this.peerId);
                localStorage.setItem('local-game-peers', JSON.stringify(updatedPeers));
                
                // Join as guest
                this.role = 'B';
                this.isInitiator = false;
                this.opponentId = earliestHost.id;
                
                // Send join request
                this.emitSignalingMessage({
                    type: 'join-request',
                    fromPeer: this.peerId,
                    toPeer: earliestHost.id
                });
                
                // Register as guest
                updatedPeers.push({ 
                    id: this.peerId, 
                    active: true, 
                    timestamp: Date.now(),
                    role: 'B',
                    matchedWith: earliestHost.id
                });
                localStorage.setItem('local-game-peers', JSON.stringify(updatedPeers));
                
                this.waitForHostAcceptance();
            }
        }
    }

    /**
     * Try to join an existing room as guest (Player B)
     */
    tryJoinRoom(availableHosts) {
        // Find the first available host
        const host = availableHosts[0];
        
        this.role = 'B';
        this.isInitiator = false;
        this.opponentId = host.id;
        
        console.log('[LocalNetworkManager] Found host, joining as Player B (Guest)');
        
        // Send join request to host
        this.emitSignalingMessage({
            type: 'join-request',
            fromPeer: this.peerId,
            toPeer: host.id
        });
        
        // Register ourselves
        const peersData = localStorage.getItem('local-game-peers') || '[]';
        const peers = JSON.parse(peersData);
        peers.push({ 
            id: this.peerId, 
            active: true, 
            timestamp: Date.now(),
            role: 'B',
            matchedWith: host.id
        });
        localStorage.setItem('local-game-peers', JSON.stringify(peers));
        
        this.isSignalingConnected = true;
        
        // Wait for host to accept
        this.waitForHostAcceptance();
    }

    /**
     * Wait for a player to join our room
     */
    waitForPlayer() {
        // This will be handled by handleSignalingMessage when we receive join-request
    }

    /**
     * Wait for host to accept our join request
     */
    waitForHostAcceptance() {
        // This will be handled by handleSignalingMessage when we receive join-accept
    }

    /**
     * Handle incoming signaling messages
     */
    handleSignalingMessage(message) {
        console.log('[LocalNetworkManager] Received signaling message:', message.type);

        switch (message.type) {
            case 'join-request':
                if (this.role === 'A' && !this.opponentId && !this.matchmakingComplete) {
                    this.opponentId = message.fromPeer;
                    this.matchmakingComplete = true;
                    
                    console.log('[LocalNetworkManager] Player B joined, accepting match...');
                    
                    // Update our status in localStorage
                    this.updatePeerStatus(false); // No longer looking for match
                    
                    // Send acceptance to Player B
                    this.emitSignalingMessage({
                        type: 'join-accept',
                        fromPeer: this.peerId,
                        toPeer: message.fromPeer
                    });
                    
                    // Emit match_found for both players
                    this.emitMatchFound();
                    this.connectToGame();
                }
                break;

            case 'join-accept':
                if (this.role === 'B' && message.fromPeer === this.opponentId && !this.matchmakingComplete) {
                    this.matchmakingComplete = true;
                    
                    console.log('[LocalNetworkManager] Host accepted our join request');
                    
                    // Emit match_found for Player B
                    this.emitMatchFound();
                    this.connectToGame();
                }
                break;

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
     * Update peer status in localStorage
     */
    updatePeerStatus(lookingForMatch) {
        const peersData = localStorage.getItem('local-game-peers') || '[]';
        const peers = JSON.parse(peersData);
        const peerIndex = peers.findIndex(p => p.id === this.peerId);
        
        if (peerIndex !== -1) {
            peers[peerIndex].lookingForMatch = lookingForMatch;
            peers[peerIndex].timestamp = Date.now();
            localStorage.setItem('local-game-peers', JSON.stringify(peers));
        }
    }

    /**
     * Emit match_found event
     */
    emitMatchFound() {
        this.scene.events.emit('match_found', {
            roomId: this.roomId,
            role: this.role,
            opponentId: this.opponentId,
            opponentUid: this.opponentId,
            isInitiator: this.isInitiator,
            iceServers: { game: this.iceServers }
        });
    }

    /**
     * Emit signaling message via localStorage
     */
    emitSignalingMessage(message) {
        message.targetPeer = this.opponentId;
        message.fromPeer = this.peerId;
        message.timestamp = Date.now();
        
        localStorage.setItem('local-game-signaling', JSON.stringify(message));
        
        // Clear after a short delay to prevent old messages
        setTimeout(() => {
            localStorage.removeItem('local-game-signaling');
        }, 100);
    }

    /**
     * Wrapper for compatibility with existing GameConnection
     */
    emit(event, payload) {
        this.emitSignalingMessage({
            type: event,
            data: payload
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
            console.log(`[LocalNetworkManager] Processing ${this.pendingCandidates.length} buffered ICE candidates...`);
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
     * Find match - simplified for local development
     */
    async findMatch(preferences = {}) {
        console.log('[LocalNetworkManager] findMatch called - checking current status...');
        // Only start matchmaking if not already in progress or completed
        if (!this.isSignalingConnected || (!this.matchmakingComplete && !this.opponentId)) {
            console.log('[LocalNetworkManager] Starting fresh matchmaking process...');
            this.startMatchmaking();
        } else {
            console.log('[LocalNetworkManager] Matchmaking already in progress or completed');
        }
    }

    /**
     * Connect method for compatibility
     */
    async connect() {
        console.log('[LocalNetworkManager] Starting local development mode...');
        return Promise.resolve();
    }

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        console.log('[LocalNetworkManager] Disconnecting...');
        
        // Clear polling interval
        if (this.hostPollingInterval) {
            clearInterval(this.hostPollingInterval);
        }
        
        // Remove peer from active list
        const peersData = localStorage.getItem('local-game-peers');
        if (peersData) {
            const peers = JSON.parse(peersData);
            const updatedPeers = peers.filter(p => p.id !== this.peerId);
            localStorage.setItem('local-game-peers', JSON.stringify(updatedPeers));
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
