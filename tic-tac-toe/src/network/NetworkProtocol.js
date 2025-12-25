export const MSG_TYPE = {
    MOVE: 1,
    RESET: 2,
    GAME_OVER: 3,
    PING: 4
};

export class NetworkProtocol {
    static encode(data) {
        switch (data.type) {
            case 'move':
                return this.encodeMove(data);
            case 'reset':
                return this.encodeReset(data);
            case 'game_over':
                return this.encodeGameOver(data);
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
            case MSG_TYPE.MOVE:
                return this.decodeMove(view);
            case MSG_TYPE.RESET:
                return { type: 'reset' };
            case MSG_TYPE.GAME_OVER:
                return this.decodeGameOver(view);
            case MSG_TYPE.PING:
                return { type: 'ping' };
            default:
                return null;
        }
    }

    static encodeMove(data) {
        // [Type:1][Index:1]
        const buffer = new ArrayBuffer(2);
        const view = new DataView(buffer);
        view.setUint8(0, MSG_TYPE.MOVE);
        view.setUint8(1, data.index);
        return buffer;
    }

    static decodeMove(view) {
        return {
            type: 'move',
            index: view.getUint8(1)
        };
    }

    static encodeReset(data) {
        const buffer = new ArrayBuffer(1);
        new DataView(buffer).setUint8(0, MSG_TYPE.RESET);
        return buffer;
    }

    static encodeGameOver(data) {
        // [Type:1][Winner:1] (0: Draw, 1: Player A, 2: Player B)
        const buffer = new ArrayBuffer(2);
        const view = new DataView(buffer);
        view.setUint8(0, MSG_TYPE.GAME_OVER);
        view.setUint8(1, data.winnerRole === 'A' ? 1 : (data.winnerRole === 'B' ? 2 : 0));
        return buffer;
    }

    static decodeGameOver(view) {
        const winner = view.getUint8(1);
        return {
            type: 'game_over',
            winnerRole: winner === 1 ? 'A' : (winner === 2 ? 'B' : null)
        };
    }

    static encodePing(data) {
        const buffer = new ArrayBuffer(1);
        new DataView(buffer).setUint8(0, MSG_TYPE.PING);
        return buffer;
    }
}
