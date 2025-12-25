export const MSG_TYPE = {
    BAT_UPDATE: 1,
    HIT_EVENT: 2,
    SCORE_UPDATE: 3,
    PING: 4
};

export class NetworkProtocol {
    static encode(data) {
        switch (data.type) {
            case 'bat':
                return this.encodeBatUpdate(data);
            case 'hit':
                return this.encodeHitEvent(data);
            case 'score':
                return this.encodeScoreUpdate(data);
            case 'ping':
                return this.encodePing(data);
            default:
                console.error('Unknown message type for encoding:', data.type);
                return null;
        }
    }

    static decode(buffer) {
        const view = new DataView(buffer);
        const type = view.getUint8(0);

        switch (type) {
            case MSG_TYPE.BAT_UPDATE:
                return this.decodeBatUpdate(view);
            case MSG_TYPE.HIT_EVENT:
                return this.decodeHitEvent(view);
            case MSG_TYPE.SCORE_UPDATE:
                return this.decodeScoreUpdate(view);
            case MSG_TYPE.PING:
                return { type: 'ping' };
            default:
                console.error('Unknown message type for decoding:', type);
                return null;
        }
    }

    // --- Encoders ---

    static encodeBatUpdate(data) {
        // [Type:1][Role:1][X:4][Y:4][VX:4][VY:4] = 18 bytes
        const buffer = new ArrayBuffer(18);
        const view = new DataView(buffer);

        view.setUint8(0, MSG_TYPE.BAT_UPDATE);
        view.setUint8(1, data.role === 'A' ? 1 : 2);
        view.setFloat32(2, data.x);
        view.setFloat32(6, data.y);
        view.setFloat32(10, data.vx || 0);
        view.setFloat32(14, data.vy || 0);

        return buffer;
    }

    static encodeHitEvent(data) {
        // [Type:1][X:4][Y:4][Z:4][VX:4][VY:4][VZ:4][Spin:4][IsServing:1] = 30 bytes
        const buffer = new ArrayBuffer(30);
        const view = new DataView(buffer);

        view.setUint8(0, MSG_TYPE.HIT_EVENT);

        // Ball State
        const s = data.state;
        view.setFloat32(1, s.x);
        view.setFloat32(5, s.y);
        view.setFloat32(9, s.z);
        view.setFloat32(13, s.vx);
        view.setFloat32(17, s.vy);
        view.setFloat32(21, s.vz);
        view.setFloat32(25, s.spin || 0);

        // Flags
        view.setUint8(29, data.isServing ? 1 : 0);

        return buffer;
    }

    static encodeScoreUpdate(data) {
        // [Type:1][ScoreA:2][ScoreB:2][CurrentServer:1] = 6 bytes
        const buffer = new ArrayBuffer(6);
        const view = new DataView(buffer);

        view.setUint8(0, MSG_TYPE.SCORE_UPDATE);
        view.setUint16(1, data.scoreA);
        view.setUint16(3, data.scoreB);
        view.setUint8(5, data.currentServer === 'A' ? 1 : 2);

        return buffer;
    }

    static encodePing(data) {
        const buffer = new ArrayBuffer(1);
        new DataView(buffer).setUint8(0, MSG_TYPE.PING);
        return buffer;
    }

    // --- Decoders ---

    static decodeBatUpdate(view) {
        return {
            type: 'bat',
            role: view.getUint8(1) === 1 ? 'A' : 'B',
            x: view.getFloat32(2),
            y: view.getFloat32(6),
            vx: view.getFloat32(10),
            vy: view.getFloat32(14)
        };
    }

    static decodeHitEvent(view) {
        return {
            type: 'hit',
            state: {
                x: view.getFloat32(1),
                y: view.getFloat32(5),
                z: view.getFloat32(9),
                vx: view.getFloat32(13),
                vy: view.getFloat32(17),
                vz: view.getFloat32(21),
                spin: view.getFloat32(25)
            },
            isServing: view.getUint8(29) === 1
        };
    }

    static decodeScoreUpdate(view) {
        return {
            type: 'score',
            scoreA: view.getUint16(1),
            scoreB: view.getUint16(3),
            currentServer: view.getUint8(5) === 1 ? 'A' : 'B'
        };
    }
}
