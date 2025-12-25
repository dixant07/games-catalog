/**
 * Centralized Game Configuration for Doodle Guess
 */

const BASE_PATH = import.meta.env.BASE_URL || '/games/doodle-guess/';

const GameConfig = {
    DISPLAY: {
        WIDTH: window.innerWidth,
        HEIGHT: window.innerHeight,
        PARENT: 'app',
        BACKGROUND_COLOR: '#2ecc71', // Green background
    },

    GAME: {
        ROUND_TIME: 60, // 2 minutes in seconds
        HINT_INTERVAL: 30, // Show a hint every 30 seconds
        MAX_WORDS_TO_CHOICE: 3,
        WORDS: [
            "apple", "banana", "cat", "dog", "elephant", "frog", "guitar", "house", "island", "jungle",
            "kangaroo", "lemon", "mountain", "notebook", "ocean", "pencil", "queen", "robot", "sun", "tree",
            "umbrella", "violin", "whale", "xylophone", "yacht", "zebra", "airplane", "bicycle", "camera", "dolphin",
            "eagle", "flower", "garden", "hammer", "iceberg", "jacket", "ketchup", "ladder", "mirror", "nurse",
            "octopus", "pizza", "quilt", "rocket", "star", "telescope", "unicorn", "volcano", "window", "yo-yo"
        ]
    },

    NETWORK: {
        SERVER_URL: (window.location.port === '5173' || window.location.port === '3000')
            ? 'http://localhost:8000'
            : window.location.origin,
        SOCKET_PATH: '/socket.io',
        RECONNECT_DELAY: 3000,
    },

    COLORS: [
        '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500'
    ],

    UI: {
        FONT_FAMILY: 'Arial, sans-serif',
        PRIMARY_COLOR: '#4a90e2',
        SECONDARY_COLOR: '#f3f4f6',
    },

    DEBUG: {
        LOG_NETWORK_MESSAGES: true,
    }
};

export default GameConfig;
