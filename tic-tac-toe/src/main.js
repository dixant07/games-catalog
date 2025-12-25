import Phaser from 'phaser';
import GameConfig from './config/GameConfig.js';
import GameScene from './scenes/GameScene.js';

const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('userId');

if (!userId) {
    console.warn('[Main] Warning: No userId found in URL parameters!');
}

GameConfig.USER_ID = userId;
GameConfig.MATCH_DATA = {
    roomId: urlParams.get('roomId'),
    role: urlParams.get('role'),
    opponentId: urlParams.get('opponentId'),
    opponentUid: urlParams.get('opponentUid'),
    isInitiator: urlParams.get('isInitiator') === 'true',
    mode: urlParams.get('mode'),
    iceServers: processIceServers(urlParams.get('iceServers'))
};

function processIceServers(iceServersStr) {
    if (!iceServersStr) return null;
    try {
        return JSON.parse(decodeURIComponent(iceServersStr));
    } catch (e) {
        console.warn('[Main] Failed to parse ICE servers from URL', e);
        return null;
    }
}

const serverUrl = urlParams.get('serverUrl');
if (serverUrl) {
    GameConfig.NETWORK.SERVER_URL = decodeURIComponent(serverUrl);
}

const config = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GameConfig.DISPLAY.TARGET_WIDTH,
        height: GameConfig.DISPLAY.TARGET_HEIGHT,
        parent: GameConfig.DISPLAY.PARENT
    },
    backgroundColor: GameConfig.DISPLAY.BACKGROUND_COLOR,
    scene: [GameScene]
};

const game = new Phaser.Game(config);
