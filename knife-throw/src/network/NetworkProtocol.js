export const MSG_TYPE = {
    THROW_KNIFE: 1,
    THROW_START: 2,
    ROUND_SETUP: 3,
    ROTATION_UPDATE: 4,
    PING: 5
};

export class NetworkProtocol {
    static encode(data) {
        switch (data.type) {
            case 'throw_knife':
                return this.encodeThrowKnife(data);
            case 'throw_start':
                return this.encodeThrowStart(data);
            case 'round_setup':
                return this.encodeRoundSetup(data);
            case 'rotation_update':
                return this.encodeRotationUpdate(data);
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
            case MSG_TYPE.THROW_KNIFE:
                return this.decodeThrowKnife(view);
            case MSG_TYPE.THROW_START:
                return this.decodeThrowStart(view);
            case MSG_TYPE.ROUND_SETUP:
                return this.decodeRoundSetup(view);
            case MSG_TYPE.ROTATION_UPDATE:
                return this.decodeRotationUpdate(view);
            case MSG_TYPE.PING:
                return { type: 'ping' };
            default:
                console.error('Unknown message type for decoding:', type);
                return null;
        }
    }

    // --- Encoders ---

    static encodeThrowKnife(data) {
        // [Type:1][Angle:2][Success:1][Timestamp:4] = 8 bytes
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);

        view.setUint8(0, MSG_TYPE.THROW_KNIFE);
        // Quantize angle: 0-360 -> 0-36000
        view.setUint16(1, Math.round(data.angle * 100));
        view.setUint8(3, data.success ? 1 : 0);
        view.setUint32(4, data.timestamp);

        return buffer;
    }

    static encodeThrowStart(data) {
        // [Type:1][Timestamp:4] = 5 bytes
        const buffer = new ArrayBuffer(5);
        const view = new DataView(buffer);

        view.setUint8(0, MSG_TYPE.THROW_START);
        view.setUint32(1, data.timestamp);

        return buffer;
    }

    static encodeRoundSetup(data) {
        // [Type:1][Count:1][Angle1:2][Angle2:2]...
        const count = data.dummyKnives.length;
        const buffer = new ArrayBuffer(2 + (count * 2));
        const view = new DataView(buffer);

        view.setUint8(0, MSG_TYPE.ROUND_SETUP);
        view.setUint8(1, count);

        for (let i = 0; i < count; i++) {
            view.setUint16(2 + (i * 2), Math.round(data.dummyKnives[i] * 100));
        }

        return buffer;
    }

    static encodeRotationUpdate(data) {
        // [Type:1][Speed:2][Direction:1][Timestamp:4] = 8 bytes
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);

        view.setUint8(0, MSG_TYPE.ROTATION_UPDATE);
        // Quantize speed: 0-10 -> 0-10000
        view.setUint16(1, Math.round(data.speed * 1000));
        view.setInt8(3, data.direction);
        view.setUint32(4, data.timestamp);

        return buffer;
    }

    static encodePing(data) {
        const buffer = new ArrayBuffer(1);
        new DataView(buffer).setUint8(0, MSG_TYPE.PING);
        return buffer;
    }

    // --- Decoders ---

    static decodeThrowKnife(view) {
        return {
            type: 'throw_knife',
            angle: view.getUint16(1) / 100,
            success: view.getUint8(3) === 1,
            timestamp: view.getUint32(4)
        };
    }

    static decodeThrowStart(view) {
        return {
            type: 'throw_start',
            timestamp: view.getUint32(1)
        };
    }

    static decodeRoundSetup(view) {
        const count = view.getUint8(1);
        const dummyKnives = [];

        for (let i = 0; i < count; i++) {
            dummyKnives.push(view.getUint16(2 + (i * 2)) / 100);
        }

        return {
            type: 'round_setup',
            dummyKnives: dummyKnives
        };
    }

    static decodeRotationUpdate(view) {
        return {
            type: 'rotation_update',
            speed: view.getUint16(1) / 1000,
            direction: view.getInt8(3),
            timestamp: view.getUint32(4)
        };
    }
}
