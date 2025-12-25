import Phaser from 'phaser';
import GameConfig from './config/GameConfig.js';
import GameScene from './scenes/GameScene.js';

// Get user ID from URL parameters or generate logical default for testing
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('userId');

console.log('[Main] URL Params:', window.location.search);
console.log('[Main] Extracted userId:', userId);

if (!userId) {
    console.warn('[Main] Warning: No userId found in URL parameters!');
}

// Update GameConfig with URL parameters
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

// Helper to process passed ICE servers string if it handles complex objects
function processIceServers(iceServersStr) {
    if (!iceServersStr) return null;
    try {
        return JSON.parse(decodeURIComponent(iceServersStr));
    } catch (e) {
        console.warn('[Main] Failed to parse ICE servers from URL', e);
        return null;
    }
}

// Override server URL if provided via URL parameter (for embedded games)
const serverUrl = urlParams.get('serverUrl');
if (serverUrl) {
    GameConfig.NETWORK.SERVER_URL = decodeURIComponent(serverUrl);
    console.log('[Main] Using server URL from params:', GameConfig.NETWORK.SERVER_URL);
} else {
    console.log('[Main] Using default server URL:', GameConfig.NETWORK.SERVER_URL);
}

console.log('[Main] Match Data:', GameConfig.MATCH_DATA);

const config = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%',
        parent: GameConfig.DISPLAY.PARENT
    },
    backgroundColor: GameConfig.DISPLAY.BACKGROUND_COLOR,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [GameScene]
};

const game = new Phaser.Game(config);
