/**
 * Tic-Tac-Toe Game Configuration
 */

const BASE_PATH = import.meta.env.BASE_URL || '/games/tic-tac-toe/';

const GameConfig = {
    DISPLAY: {
        WIDTH: window.innerWidth,
        HEIGHT: window.innerHeight,
        TARGET_WIDTH: 600,
        TARGET_HEIGHT: 800,
        PARENT: 'app',
        BACKGROUND_COLOR: '#1a1a1a',
    },

    GAME: {
        GRID_SIZE: 3,
        CELL_SIZE: 150,
        WINNING_STREAK: 3,
    },

    NETWORK: {
        SERVER_URL: (window.location.port === '5173' || window.location.port === '3000' || window.location.port === '3001')
            ? 'http://localhost:8000'
            : window.location.origin,
        SOCKET_PATH: '/socket.io',
        RECONNECT_DELAY: 3000,
    },

    UI: {
        FONT_FAMILY: 'Arial',
        TEXT_COLOR: '#ffffff',
        X_COLOR: '#ff4d4d',
        O_COLOR: '#4d79ff',
        GRID_COLOR: '#444444',
    },

    DEBUG: {
        LOG_NETWORK_MESSAGES: true,
    }
};

export default GameConfig;
