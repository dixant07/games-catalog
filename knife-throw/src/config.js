// Base path for assets - uses Vite's base URL in production
const BASE_PATH = import.meta.env.BASE_URL || '/games/knife-throw/';

export const CONFIG = {
    // Game dimensions
    WIDTH: window.innerWidth,
    HEIGHT: window.innerHeight,

    // Target disc
    TARGET: {
        RADIUS: 120,
        ROTATION_SPEED: 2, // degrees per frame
        ROTATION_CHANGE_INTERVAL: 4000, // ms
        CENTER_X: 400,
        CENTER_Y: 300,
    },

    // Knife settings
    KNIFE: {
        WIDTH: 10,
        HEIGHT: 40,
        THROW_SPEED: 500, //pixel per second
        COLLISION_THRESHOLD: 8, // degrees - minimum angle between knives
        KNIVES_PER_ROUND: 6,
        PENETRATION_DEPTH: 30,
        SNAP_DISTANCE: 100, // pixels from target to start snap
        SNAP_SPEED_MULTIPLIER: 3, // speed multiplier during snap
    },

    // Dummy knives configuration
    DUMMY_KNIVES: {
        POSSIBLE_COUNTS: [0, 1, 2, 2, 4, 4, 5], // weighted random
    },

    // Scoring
    SCORE: {
        SUCCESSFUL_THROW: 5,
        WIN_DIFFERENCE: 30,
    },

    // Network
    NETWORK: {
        // Recognize both 5173 (Vite default) and 3000 (alternative Vite) as local dev
        SERVER_URL: (window.location.port === '5173' || window.location.port === '3000')
            ? 'http://localhost:8080'
            : window.location.origin,
        SOCKET_PATH: '/socket.io',  // Default Socket.IO path (server has its own domain)
        RECONNECT_DELAY: 3000,
    },

    // Colors
    COLORS: {
        PLAYER_A: 0xff4444, // Red
        PLAYER_B: 0x4444ff, // Blue
        DUMMY: 0x888888, // Gray
        BACKGROUND: 0x2c3e50,
        UI_TEXT: '#ffffff',
        UI_TEXT: '#ffffff',
        UI_BACKGROUND: 'rgba(0, 0, 0, 0.7)',
    },

    // Scoreboard
    SCORE_BOARD: {
        MARGIN_X: 20,
        MARGIN_Y: 20,
        WIDTH: 140,
        HEIGHT: 60,
        RADIUS: 10,
        BG_ALPHA: 0.8,
        TEXT_COLOR: '#ffffff',
        FONT_SIZE_NAME: '16px',
        FONT_SIZE_SCORE: '24px'
    },

    // Audio - paths relative to base URL
    AUDIO: {
        HIT: `${BASE_PATH}audio/hit.mp3`,
        FAIL: `${BASE_PATH}audio/fail.mp3`,
        THROW: `${BASE_PATH}audio/throw.mp3`,
    },

    // Assets - paths relative to base URL
    ASSETS: {
        TARGET: `${BASE_PATH}assets/target.svg`,
        BLUE_KNIFE: `${BASE_PATH}assets/blue_knife.svg`,
        RED_KNIFE: `${BASE_PATH}assets/red_knife.svg`,
        DUMMY_KNIFE: `${BASE_PATH}assets/dummy_knife.svg`,
    }
};
