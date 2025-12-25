/**
 * GameConnection - Generic WebRTC connection for sharing game states
 */
export class GameConnection {
    constructor(socket, eventEmitter) {
        this.socket = socket;
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
    }

    async initialize(config) {
        this.isInitiator = config.isInitiator;
        this.opponentId = config.opponentId;
        this.opponentUid = config.opponentUid;
        this.roomId = config.roomId;
        this.iceServers = config.iceServers || [];

        const validatedIceServers = this.validateIceServers(this.iceServers);

        // Check for TURN servers to decide policy
        const hasTurnServer = validatedIceServers.some(server =>
            server.urls && (server.urls.startsWith('turn:') || server.urls.startsWith('turns:'))
        );

        this.usingRelay = hasTurnServer;

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

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                const payload = {
                    candidate: event.candidate.toJSON(),
                    to: this.opponentId
                };
                if (this.opponentUid) payload.targetUid = this.opponentUid;
                this.socket.emit('ice-candidate', payload);
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            if (this.peerConnection.connectionState === 'connected') {
                this.isConnected = true;
                this.eventEmitter.emit('game_connection_established');
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

        if (this.isInitiator) {
            this.createDataChannels();
            this.createAndSendOffer();
        } else {
            this.setupDataChannelReceiver();
        }
    }

    handleConnectionFailure() {
        if (this.usingRelay) {
            console.log('[GameConnection] Relay connection failed. Switching to backup (STUN/Direct)...');
            this.usingRelay = false;

            const defaultStunServers = [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ];

            const rtcConfig = {
                iceServers: [...this.iceServers, ...defaultStunServers],
                iceTransportPolicy: 'all'
            };

            this.createPeerConnection(rtcConfig);
        } else {
            // Existing or implied fallback (ICE Restart)
            if (this.isInitiator && this.peerConnection) {
                this.peerConnection.createOffer({ iceRestart: true })
                    .then(offer => this.peerConnection.setLocalDescription(offer))
                    .then(() => {
                        const payload = { offer: this.peerConnection.localDescription, to: this.opponentId };
                        if (this.opponentUid) payload.targetUid = this.opponentUid;
                        this.socket.emit('offer', payload);
                    })
                    .catch(err => console.error('[GameConnection] ICE Restart failed:', err));
            }
        }
    }

    validateIceServers(servers) {
        const defaultStunServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
        if (!servers || servers.length === 0) return defaultStunServers;
        return servers;
    }

    createDataChannels() {
        this.dataChannels.reliable = this.peerConnection.createDataChannel("game_reliable", { ordered: true });
        this.setupDataChannel(this.dataChannels.reliable);

        this.dataChannels.unreliable = this.peerConnection.createDataChannel("game_unreliable", {
            ordered: false,
            maxRetransmits: 0
        });
        this.setupDataChannel(this.dataChannels.unreliable);
    }

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

    setupDataChannel(channel) {
        if (!channel) return;
        channel.binaryType = 'arraybuffer';
        channel.onopen = () => {
            if (channel.label === 'game_reliable') {
                this.isConnected = true;
                this.eventEmitter.emit('game_datachannel_open');
            }
        };
        channel.onmessage = (event) => {
            this.eventEmitter.emit('game_data_received', {
                data: event.data,
                channel: channel.label
            });
        };
        channel.onclose = () => {
            if (channel.label === 'game_reliable') {
                this.isConnected = false;
            }
        };
    }

    async createAndSendOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            const payload = { offer: offer, to: this.opponentId };
            if (this.opponentUid) payload.targetUid = this.opponentUid;
            this.socket.emit('offer', payload);
        } catch (err) {
            console.error('[GameConnection] Error creating offer:', err);
        }
    }

    async handleOffer(data) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            const payload = { answer: answer, to: this.opponentId };
            if (this.opponentUid) payload.targetUid = this.opponentUid;
            this.socket.emit('answer', payload);
        } catch (err) {
            console.error('[GameConnection] Error handling offer:', err);
        }
    }

    async handleAnswer(data) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (err) {
            console.error('[GameConnection] Error handling answer:', err);
        }
    }

    async handleCandidate(data) {
        try {
            if (this.peerConnection && this.peerConnection.signalingState !== 'closed') {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (err) {
            console.warn('[GameConnection] Error handling ICE candidate:', err);
        }
    }

    send(data, reliable = true) {
        const channel = reliable ? this.dataChannels.reliable : this.dataChannels.unreliable;
        if (channel && channel.readyState === 'open') {
            channel.send(data);
            return true;
        }
        return false;
    }

    close() {
        if (this.dataChannels.reliable) this.dataChannels.reliable.close();
        if (this.dataChannels.unreliable) this.dataChannels.unreliable.close();
        if (this.peerConnection) this.peerConnection.close();
        this.isConnected = false;
    }
}
