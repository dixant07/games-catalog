export const MSG_TYPE = {
    JSON_DATA: 128,
    PING: 4
};

export class NetworkProtocol {
    static encode(data) {
        if (data.type === 'ping') {
            const buffer = new ArrayBuffer(1);
            new DataView(buffer).setUint8(0, MSG_TYPE.PING);
            return buffer;
        }

        // For all other types, encode as JSON for simplicity in Doodle Guess
        const jsonStr = JSON.stringify(data);
        const encoder = new TextEncoder();
        const jsonBuffer = encoder.encode(jsonStr);

        const finalBuffer = new ArrayBuffer(1 + jsonBuffer.byteLength);
        const view = new Uint8Array(finalBuffer);
        view[0] = MSG_TYPE.JSON_DATA;
        view.set(jsonBuffer, 1);

        return finalBuffer;
    }

    static decode(buffer) {
        const view = new DataView(buffer);
        const type = view.getUint8(0);

        if (type === MSG_TYPE.PING) {
            return { type: 'ping' };
        }

        if (type === MSG_TYPE.JSON_DATA) {
            const decoder = new TextDecoder();
            const jsonStr = decoder.decode(new Uint8Array(buffer, 1));
            try {
                return JSON.parse(jsonStr);
            } catch (e) {
                console.error('Failed to parse JSON from network:', e);
                return null;
            }
        }

        console.error('Unknown message type for decoding:', type);
        return null;
    }
}
