/**
 * GameConnection - Generic WebRTC connection for sharing game states
 * This is game-agnostic and can be reused across different games
 */
export class GameConnection {
    constructor(socket, eventEmitter) {
        this.socket = socket;
        this.eventEmitter = eventEmitter; // Phaser scene or custom event emitter
        this.peerConnection = null;
        this.dataChannels = {
            reliable: null,
            unreliable: null
        };
        this.isConnected = false;
        this.isInitiator = false;
        this.opponentId = null;
        this.roomId = null;
        this.iceServers = [];
    }

    /**
     * Initialize WebRTC connection
     */
    async initialize(config) {
        this.isInitiator = config.isInitiator;
        this.opponentId = config.opponentId;
        this.opponentUid = config.opponentUid; // Store opponentUid
        this.roomId = config.roomId;
        this.iceServers = config.iceServers || [];

        console.log('[GameConnection] Initializing WebRTC...');
        console.log(`Initiator: ${this.isInitiator}, Opponent: ${this.opponentId}, UID: ${this.opponentUid}`);

        // Validate ICE servers
        const validatedIceServers = this.validateIceServers(this.iceServers);

        // Check for TURN servers to decide policy
        const hasTurnServer = validatedIceServers.some(server =>
            server.urls && (server.urls.startsWith('turn:') || server.urls.startsWith('turns:'))
        );

        this.usingRelay = hasTurnServer;

        console.log('[GameConnection] ICE Server Configuration:');
        console.log('  - Servers:', JSON.stringify(validatedIceServers, null, 2));
        console.log('  - Has TURN server:', hasTurnServer);
        console.log(`  - Transport policy: ${this.usingRelay ? 'relay (TURN only)' : 'all (STUN/Direct)'}`);

        const rtcConfig = {
            iceServers: validatedIceServers,
            iceTransportPolicy: this.usingRelay ? 'relay' : 'all'
        };

        this.createPeerConnection(rtcConfig);
    }

    createPeerConnection(rtcConfig) {
        if (this.peerConnection) {
            this.peerConnection.close();
        }

        this.peerConnection = new RTCPeerConnection(rtcConfig);

        // Setup ICE candidate handler with logging
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('[GameConnection] ICE candidate generated:', event.candidate.type, event.candidate.candidate.substring(0, 50) + '...');
                const payload = {
                    candidate: event.candidate.toJSON(), // Serialize to JSON to avoid DataCloneError in postMessage
                    to: this.opponentId
                };
                if (this.opponentUid) payload.targetUid = this.opponentUid;

                this.socket.emit('ice-candidate', payload);
            } else {
                console.log('[GameConnection] ICE candidate gathering complete');
            }
        };

        // Log ICE gathering state changes
        this.peerConnection.onicegatheringstatechange = () => {
            console.log('[GameConnection] ICE gathering state:', this.peerConnection.iceGatheringState);
        };

        // Log ICE connection state changes
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('[GameConnection] ICE connection state:', this.peerConnection.iceConnectionState);
        };

        // Setup connection state change handler
        this.peerConnection.onconnectionstatechange = () => {
            console.log('[GameConnection] Connection state:', this.peerConnection.connectionState);

            if (this.peerConnection.connectionState === 'connected') {
                this.isConnected = true;
                this.eventEmitter.emit('game_connection_established');

                // Notify server
                this.socket.emit('connection_stable', {
                    roomId: this.roomId,
                    service: 'game'
                });
            } else if (this.peerConnection.connectionState === 'disconnected' ||
                this.peerConnection.connectionState === 'failed') {
                this.isConnected = false;
                this.eventEmitter.emit('game_connection_lost');
                this.handleConnectionFailure();
            }
        };

        // Create or receive data channels
        if (this.isInitiator) {
            this.createDataChannels();
            this.createAndSendOffer();
        } else {
            this.setupDataChannelReceiver();
        }
    }

    /**
     * Validate ICE servers - filters out invalid/unconfigured servers and ensures fallback
     */
    validateIceServers(servers) {
        const defaultStunServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];

        if (!servers || servers.length === 0) {
            console.log('[GameConnection] No ICE servers provided, using default STUN servers');
            return defaultStunServers;
        }

        const validServers = servers.filter(server => {
            // Check if server has valid urls
            if (!server.urls) return false;

            // For TURN servers, ensure credentials are present
            if (server.urls.startsWith('turn:') || server.urls.startsWith('turns:')) {
                if (!server.username || !server.credential) {
                    console.log('[GameConnection] TURN server missing credentials, skipping:', server.urls);
                    return false;
                }
            }
            return true;
        });

        // If no valid servers remain, use defaults
        if (validServers.length === 0) {
            console.log('[GameConnection] No valid ICE servers after filtering, using defaults');
            return defaultStunServers;
        }

        // Ensure we have at least one STUN server
        const hasStun = validServers.some(s => s.urls && s.urls.startsWith('stun:'));
        if (!hasStun) {
            console.log('[GameConnection] Adding default STUN servers');
            return [...defaultStunServers, ...validServers];
        }

        return validServers;
    }

    /**
     * Create data channels (initiator only)
     */
    createDataChannels() {
        // Reliable channel for critical game state
        this.dataChannels.reliable = this.peerConnection.createDataChannel("game_reliable", {
            ordered: true
        });
        this.setupDataChannel(this.dataChannels.reliable);

        // Unreliable channel for frequent updates (position, rotation, etc.)
        this.dataChannels.unreliable = this.peerConnection.createDataChannel("game_unreliable", {
            ordered: false,
            maxRetransmits: 0
        });
        this.setupDataChannel(this.dataChannels.unreliable);
    }

    /**
     * Setup data channel receiver (non-initiator)
     */
    setupDataChannelReceiver() {
        this.peerConnection.ondatachannel = (event) => {
            if (event.channel.label === "game_reliable") {
                this.dataChannels.reliable = event.channel;
            } else if (event.channel.label === "game_unreliable") {
                this.dataChannels.unreliable = event.channel;
            }
            this.setupDataChannel(event.channel);
        };
    }

    /**
     * Setup individual data channel
     */
    setupDataChannel(channel) {
        if (!channel) return;

        channel.binaryType = 'arraybuffer';

        channel.onopen = () => {
            console.log(`[GameConnection] DataChannel ${channel.label} OPEN`);
            if (channel.label === 'game_reliable') {
                this.isConnected = true;
                this.eventEmitter.emit('game_datachannel_open');
            }
        };

        channel.onmessage = (event) => {
            console.log(`[GameConnection] Data received on ${channel.label}, size: ${event.data.byteLength} bytes`);
            // Emit raw data - let game-specific handler decode it
            this.eventEmitter.emit('game_data_received', {
                data: event.data,
                channel: channel.label
            });
        };

        channel.onclose = () => {
            console.log(`[GameConnection] DataChannel ${channel.label} CLOSED`);
            if (channel.label === 'game_reliable') {
                this.isConnected = false;
            }
        };
    }

    /**
     * Create and send offer (initiator only)
     */
    async createAndSendOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            console.log(`[GameConnection] Sending offer to: ${this.opponentId} (UID: ${this.opponentUid})`);

            const payload = {
                offer: offer,
                to: this.opponentId
            };
            if (this.opponentUid) payload.targetUid = this.opponentUid;

            this.socket.emit('offer', payload);
        } catch (err) {
            console.error('[GameConnection] Error creating offer:', err);
        }
    }

    /**
     * Handle incoming offer
     */
    async handleOffer(data) {
        if (!this.peerConnection) {
            console.error('[GameConnection] PeerConnection not initialized');
            return;
        }

        try {
            console.log(`[GameConnection] Received offer from: ${data.from}`);
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            console.log(`[GameConnection] Sending answer to: ${this.opponentId} (UID: ${this.opponentUid})`);

            const payload = {
                answer: answer,
                to: this.opponentId
            };
            if (this.opponentUid) payload.targetUid = this.opponentUid;

            this.socket.emit('answer', payload);
        } catch (err) {
            console.error('[GameConnection] Error handling offer:', err);
        }
    }

    /**
     * Handle incoming answer
     */
    async handleAnswer(data) {
        try {
            console.log('[GameConnection] Received answer');
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (err) {
            console.error('[GameConnection] Error handling answer:', err);
        }
    }

    /**
     * Handle incoming ICE candidate
     */
    async handleCandidate(data) {
        try {
            // [Safety Check] Ensure PC exists
            if (this.peerConnection && this.peerConnection.signalingState !== 'closed') {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (err) {
            console.error('[GameConnection] Error handling ICE candidate:', err);
        }
    }


    /**
     * Handle connection failure
     */
    handleConnectionFailure() {
        if (this.usingRelay) {
            console.log('[GameConnection] Relay connection failed. Switching to backup (STUN/Direct)...');
            this.usingRelay = false;

            // Force default STUN servers if we are switching to non-relay
            const defaultStunServers = [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ];

            // Re-initialize with all policy
            const rtcConfig = {
                iceServers: [...this.iceServers, ...defaultStunServers], // Ensure STUN is present
                iceTransportPolicy: 'all'
            };

            console.log('[GameConnection] Re-initializing with policy: all (STUN/Direct)');
            this.createPeerConnection(rtcConfig);

            // If we are not the initiator, we just wait for the new offer
            // But if we ARE the initiator, we need to restart the negotiation
            // NOTE: Since we created a new PC, we act as if we are starting fresh, but maintaining initiator role.
        } else {
            console.log('[GameConnection] Connection failed (already on backup). Attempting ICE Restart...');
            if (this.isInitiator && this.peerConnection) {
                this.peerConnection.createOffer({ iceRestart: true })
                    .then(offer => this.peerConnection.setLocalDescription(offer))
                    .then(() => {
                        const payload = {
                            offer: this.peerConnection.localDescription,
                            to: this.opponentId
                        };
                        if (this.opponentUid) payload.targetUid = this.opponentUid;

                        this.socket.emit('offer', payload);
                    })
                    .catch(err => console.error('[GameConnection] ICE Restart failed:', err));
            }
        }
    }

    /**
     * Send data through data channel
     */
    send(data, reliable = true) {
        const channel = reliable ? this.dataChannels.reliable : this.dataChannels.unreliable;

        if (channel && channel.readyState === 'open') {
            channel.send(data);
            return true;
        } else {
            console.warn(`[GameConnection] Failed to send data: ${reliable ? 'Reliable' : 'Unreliable'} channel not ready.`);
            return false;
        }
    }

    /**
     * Close connection
     */
    close() {
        if (this.dataChannels.reliable) this.dataChannels.reliable.close();
        if (this.dataChannels.unreliable) this.dataChannels.unreliable.close();
        if (this.peerConnection) this.peerConnection.close();
        this.isConnected = false;
    }
}
