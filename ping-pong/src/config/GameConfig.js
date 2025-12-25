/**
 * Centralized Game Configuration
 * 
 * This file contains all configurable and tunable parameters for the game.
 * Modify values here to adjust game behavior, physics, networking, and display settings.
 */

// Base path for assets - uses Vite's base URL in production
const BASE_PATH = import.meta.env.BASE_URL || '/games/ping-pong/';

const GameConfig = {
    DISPLAY: {
        WIDTH: window.innerWidth,
        HEIGHT: window.innerHeight,
        TARGET_WIDTH: 500, // Reference width for scaling
        TARGET_HEIGHT: 700, // Reference height for scaling
        PARENT: 'app',
        BACKGROUND_COLOR: '#F1C40F', // Yellow/Gold background as requested
        TYPE: 'AUTO', // Phaser.AUTO will be resolved in main.js
    },

    PHYSICS: {
        GRAVITY: 400,                    // Even lower gravity for more hang time and slower movement
        BOUNCE_DAMPING: 1.0,            // Perfect elastic bounce as requested
        FRICTION: 0.98,                  // Horizontal friction on bounce
        MAX_SPEED: 600,                  // Lower speed cap for arcade feel
        SERVE_BOUNCE_IMPULSE: 300,       // Minimum bounce height during serve
        MIN_BOUNCE_VELOCITY: 50,         // Minimum velocity to continue bouncing
        MIN_STUCK_VELOCITY: 10,          // Velocity threshold for stuck ball detection

        // Bat collision
        BAT_MIN_HIT_VELOCITY: 250,       // Minimum velocity on bat hit (increased for guaranteed reach)
        BAT_HIT_VELOCITY_MULTIPLIER: 1.8, // Horizontal velocity transfer on hit
        BAT_SPEED_TO_DISTANCE_FACTOR: 1.5, // How bat speed maps to ball forward velocity
        BAT_HIT_Z_IMPULSE: 350,          // Vertical impulse on bat hit (unused now)
        MAX_BALL_HEIGHT_FOR_HIT: 1000,   // Maximum ball height (z) for collision (effectively unlimited)

        // Elastic collision - bat velocity transfer
        BAT_VELOCITY_TRANSFER: 0.7,      // How much bat velocity transfers to ball (0-1)
        BAT_VELOCITY_SMOOTHING: 0.3,     // Velocity smoothing factor for tracking

        // Spin mechanics
        SPIN_ENABLED: true,              // Enable spin mechanics
        SPIN_MULTIPLIER: 0.5,            // How much bat velocity affects spin
        TOPSPIN_GRAVITY_MULTIPLIER: 1.3, // Gravity multiplier for topspin
        BACKSPIN_GRAVITY_MULTIPLIER: 0.6, // Gravity multiplier for backspin
        SPIN_DECAY: 0.95,                // How fast spin decays per second

        // Trajectory control
        GUARANTEED_REACH_VELOCITY: 280,  // Velocity to guarantee reaching opponent's side
        OPTIMAL_HIT_ANGLE: 15,           // Optimal launch angle in degrees
        BALL_RADIUS: 10,                 // Logical radius of the ball
    },

    GAME: {
        // Game Rules
        COURT_Y_BOUNDARY: 600,           // Canonical boundary for authoritative scoring (Way past visible area)
        INITIAL_SERVER: 'A',             // Who serves first
        BALL_SERVE_Y_OFFSET: 150,        // Distance from center for serve placement
        BALL_SERVE_Z: 80,               // Slightly lower for better visual alignment with table
        WINNING_SCORE: 6,                // Score required to win the game

        // Bat positioning constraints (world coordinates)
        BAT_A_Y_MIN: 50,                 // Player A minimum Y (bottom player)
        BAT_A_Y_MAX: 300,                // Player A maximum Y
        BAT_B_Y_MIN: -300,               // Player B minimum Y (top player)
        BAT_B_Y_MAX: -50,                // Player B maximum Y

        // Table Dimensions (World coordinates)
        TABLE_WIDTH: 300,
        TABLE_LENGTH: 480,

        // Fall Margins (Outside Region)
        FALL_MARGIN_X: 20,
        FALL_MARGIN_Y: 80,               // Increased Y margin to allow fall animation when ball flies past table ends

        BAT_VERTICES: [{ x: 0, y: -30 },
        { x: 22, y: -22 },
        { x: 30, y: 0 },
        { x: 22, y: 22 },
        { x: 0, y: 30 },
        { x: -22, y: 22 },
        { x: -30, y: 0 },
        { x: -22, y: -22 }],

        // Smart Aiming / Landing Zone tuning
        LANDING_ZONE_MARGIN_X: 20,       // Safety margin from table edges in X
        LANDING_ZONE_MARGIN_Y: 20,       // Safety margin from table ends in Y
        LANDING_ZONE_MIN_DEPTH: 0.1,     // Minimum % of table depth to cross (past net)
        LANDING_ZONE_MAX_DEPTH: 0.9      // Maximum % of table depth to reach
    },

    NETWORK: {
        // Recognize both 5173 (Vite default) and 3000 (alternative Vite) as local dev
        SERVER_URL: (window.location.port === '5173' || window.location.port === '3000')
            ? 'http://localhost:8000'
            : window.location.origin,
        SOCKET_PATH: '/socket.io',  // Default Socket.IO path (server has its own domain)
        RECONNECT_DELAY: 3000,
    },

    UI: {
        // Menu scene
        MENU_TITLE: 'Table Tennis Web',
        MENU_TITLE_FONT_SIZE: '40px',
        MENU_TITLE_COLOR: '#fff',
        MENU_TITLE_Y: 100,

        MENU_STATUS_FONT_SIZE: '20px',
        MENU_STATUS_COLOR: '#aaa',
        MENU_STATUS_Y: 300,

        MENU_BUTTON_FONT_SIZE: '32px',
        MENU_BUTTON_COLOR: '#0f0',
        MENU_BUTTON_BG_COLOR: '#333',
        MENU_BUTTON_PADDING: { x: 20, y: 10 },
        MENU_BUTTON_Y: 400,

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
        WIN_OVERLAY_ALPHA: 0.9,         // Transparency for win screen overlay

        SCORE_FONT_SIZE: '24px',
        SCORE_COLOR: '#fff',
        SCORE_POSITION: { x: 20, y: 20 },

        INFO_FONT_SIZE: '18px',
        INFO_COLOR: '#ffff00',
        INFO_Y: 50,

        // Connection check interval
        CONNECTION_CHECK_INTERVAL: 500,   // milliseconds

        // Match found delay before starting game
        MATCH_START_DELAY: 1000,          // milliseconds
    },

    ASSETS: {
        // Sprite scales
        TABLE_SCALE: 0.32,
        BAT_SCALE: 0.45,
        BALL_BASE_SCALE: 0.2,
        BALL_Z_SCALE_FACTOR: 2500,       // Divisor for z-based scaling

        // Asset paths
        BALL_SPRITE: `${BASE_PATH}assets/svg/ball.svg`,
        BAT_A_SPRITE: `${BASE_PATH}assets/svg/red_bat.svg`,
        BAT_B_SPRITE: `${BASE_PATH}assets/svg/blue_bat.svg`,
        TABLE_SPRITE: `${BASE_PATH}assets/svg/table.svg`,

        // Audio paths
        BAT_HIT_AUDIO: `${BASE_PATH}assets/audio/bat_hit.mp3`,
        TABLE_BOUNCE_AUDIO: `${BASE_PATH}assets/audio/table_bounce.mp3`,
    },

    DEBUG: {
        PHYSICS_DEBUG: false,             // Show Phaser physics debug
        LOG_NETWORK_MESSAGES: false,      // Log network messages to console
        LOG_COLLISIONS: false,            // Log bat/ball collisions
    }
};

export default GameConfig;
