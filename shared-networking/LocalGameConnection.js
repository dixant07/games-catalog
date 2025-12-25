/**
 * LocalGameConnection - Simplified WebRTC connection for local development
 * Uses STUN servers only, compatible with existing game logic
 */
export class LocalGameConnection {
    constructor(socket, eventEmitter) {
        this.socket = socket; // LocalNetworkManager instance
        this.eventEmitter = eventEmitter;
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
        this.pendingRemoteCandidates = [];
    }

    /**
     * Initialize WebRTC connection
     */
    async initialize(config) {
        this.isInitiator = config.isInitiator;
        this.opponentId = config.opponentId;
        this.opponentUid = config.opponentUid;
        this.roomId = config.roomId;
        this.iceServers = config.iceServers || [];
        this.pendingRemoteCandidates = [];

        console.log('[LocalGameConnection] Initializing WebRTC...');
        console.log(`Initiator: ${this.isInitiator}, Opponent: ${this.opponentId}`);

        const rtcConfig = {
            iceServers: this.iceServers,
            iceTransportPolicy: 'all' // Use STUN only for local development
        };

        this.createPeerConnection(rtcConfig);
    }

    createPeerConnection(rtcConfig) {
        // Close existing connection if any
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.peerConnection = new RTCPeerConnection(rtcConfig);

        // Setup ICE candidate handler
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('[LocalGameConnection] ICE candidate generated:', event.candidate.type);
                const payload = {
                    candidate: event.candidate.toJSON(),
                    to: this.opponentId
                };
                if (this.opponentUid) payload.targetUid = this.opponentUid;

                this.socket.emit('ice-candidate', payload);
            } else {
                console.log('[LocalGameConnection] ICE candidate gathering complete');
            }
        };

        // Setup connection state change handler
        this.peerConnection.onconnectionstatechange = () => {
            console.log('[LocalGameConnection] Connection state:', this.peerConnection.connectionState);

            if (this.peerConnection.connectionState === 'connected') {
                this.isConnected = true;
                this.eventEmitter.emit('game_connection_established');
            } else if (this.peerConnection.connectionState === 'disconnected' ||
                this.peerConnection.connectionState === 'failed') {
                this.isConnected = false;
                this.eventEmitter.emit('game_connection_lost');
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
     * Create data channels (initiator only)
     */
    createDataChannels() {
        // Reliable channel for critical game state
        this.dataChannels.reliable = this.peerConnection.createDataChannel("game_reliable", {
            ordered: true
        });
        this.setupDataChannel(this.dataChannels.reliable);

        // Unreliable channel for frequent updates
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
            console.log(`[LocalGameConnection] DataChannel ${channel.label} OPEN`);
            if (channel.label === 'game_reliable') {
                this.isConnected = true;
                this.eventEmitter.emit('game_datachannel_open');
            }
        };

        channel.onmessage = (event) => {
            console.log(`[LocalGameConnection] Data received on ${channel.label}, size: ${event.data.byteLength} bytes`);
            this.eventEmitter.emit('game_data_received', {
                data: event.data,
                channel: channel.label
            });
        };

        channel.onclose = () => {
            console.log(`[LocalGameConnection] DataChannel ${channel.label} CLOSED`);
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
            console.log(`[LocalGameConnection] Sending offer to: ${this.opponentId}`);

            const payload = {
                offer: offer,
                to: this.opponentId
            };
            if (this.opponentUid) payload.targetUid = this.opponentUid;

            this.socket.emit('offer', payload);
        } catch (err) {
            console.error('[LocalGameConnection] Error creating offer:', err);
        }
    }

    /**
     * Handle incoming offer
     */
    async handleOffer(data) {
        if (!this.peerConnection) {
            console.error('[LocalGameConnection] PeerConnection not initialized');
            return;
        }

        try {
            console.log(`[LocalGameConnection] Received offer`);
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            console.log(`[LocalGameConnection] Sending answer to: ${this.opponentId}`);

            const payload = {
                answer: answer,
                to: this.opponentId
            };
            if (this.opponentUid) payload.targetUid = this.opponentUid;

            this.socket.emit('answer', payload);

            // Apply any ICE candidates that arrived before the offer
            await this.flushPendingRemoteCandidates();
        } catch (err) {
            console.error('[LocalGameConnection] Error handling offer:', err);
        }
    }

    /**
     * Handle incoming answer
     */
    async handleAnswer(data) {
        try {
            console.log('[LocalGameConnection] Received answer');
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));

            // Apply any ICE candidates that arrived before the answer
            await this.flushPendingRemoteCandidates();
        } catch (err) {
            console.error('[LocalGameConnection] Error handling answer:', err);
        }
    }

    /**
     * Handle incoming ICE candidate
     */
    async handleCandidate(data) {
        try {
            if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;

            // If remote description not set yet, queue the candidate
            if (!this.peerConnection.remoteDescription || !this.peerConnection.remoteDescription.type) {
                this.pendingRemoteCandidates.push(data.candidate);
                return;
            }

            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error('[LocalGameConnection] Error handling ICE candidate:', err);
        }
    }

    /**
     * Apply any queued ICE candidates once remote description is set
     */
    async flushPendingRemoteCandidates() {
        if (!this.peerConnection || !this.peerConnection.remoteDescription) return;

        while (this.pendingRemoteCandidates.length > 0) {
            const candidate = this.pendingRemoteCandidates.shift();
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.error('[LocalGameConnection] Error applying queued ICE candidate:', err);
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
            console.warn(`[LocalGameConnection] Failed to send data: ${reliable ? 'Reliable' : 'Unreliable'} channel not ready.`);
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
