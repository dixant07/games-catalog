import Phaser from 'phaser';
import GameConfig from '../config/GameConfig.js';
import TableTennisConfig from '../config/TableTennisConfig.js';
import PhysicsUtils from '../utils/PhysicsUtils.js';
import ViewTransform from '../utils/ViewTransform.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { PingPongConnection } from '../network/PingPongConnection.js';

/**
 * GameScene - Main table tennis gameplay
 */
export default class GameScene extends Phaser.Scene {
    constructor() {
        super(TableTennisConfig.SCENES.GAME);
    }

    init() {
        // Game state
        this.role = null; // 'A' or 'B'
        this.network = new NetworkManager(this);
        this.pingPongConnection = null;

        this.gameStarted = false;
        this.gameOver = false; // New flag for win state

        // UI elements
        this.statusText = null;
        this.connectButton = null;
        this.scoreGroup = null;
        this.scoreTextA = null;
        this.scoreTextB = null;
        this.nameTextA = null;
        this.nameTextB = null;
        this.bgA = null;
        this.bgB = null;
        this.infoText = null;

        // Logical State (World Coordinates)
        this.ballState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 };
        this.batAState = { x: 0, y: 200, vx: 0, vy: 0, prevX: 0, prevY: 200 };
        this.batBState = { x: 0, y: -200, vx: 0, vy: 0, prevX: 0, prevY: -200 };

        // Collision cooldown tracking
        this.lastHitTime = 0;
        this.COLLISION_COOLDOWN = 150;

        // Game State
        this.isServing = true;
        this.currentServer = GameConfig.GAME.INITIAL_SERVER;

        // Score
        this.scoreA = 0;
        this.scoreB = 0;
    }

    preload() {
        this.load.image(
            TableTennisConfig.ASSETS.BALL,
            GameConfig.ASSETS.BALL_SPRITE
        );
        this.load.image(
            TableTennisConfig.ASSETS.BAT_A,
            GameConfig.ASSETS.BAT_A_SPRITE
        );
        this.load.image(
            TableTennisConfig.ASSETS.BAT_B,
            GameConfig.ASSETS.BAT_B_SPRITE
        );
        this.load.image(
            TableTennisConfig.ASSETS.TABLE,
            GameConfig.ASSETS.TABLE_SPRITE
        );

        // Load audio
        this.load.audio(
            TableTennisConfig.ASSETS.BAT_HIT,
            GameConfig.ASSETS.BAT_HIT_AUDIO
        );
        this.load.audio(
            TableTennisConfig.ASSETS.TABLE_BOUNCE,
            GameConfig.ASSETS.TABLE_BOUNCE_AUDIO
        );
    }

    create() {
        this.centerX = GameConfig.DISPLAY.WIDTH / 2;
        this.centerY = GameConfig.DISPLAY.HEIGHT / 2;

        // Initialize view transform utility
        this.viewTransform = new ViewTransform(this.centerX, this.centerY);

        // Set background
        this.cameras.main.setBackgroundColor(GameConfig.DISPLAY.BACKGROUND_COLOR);

        // Add Table
        this.table = this.add.image(
            this.centerX,
            this.centerY,
            TableTennisConfig.ASSETS.TABLE
        ).setScale(GameConfig.ASSETS.TABLE_SCALE);

        // Add Bats
        this.batA = this.add.image(
            this.centerX,
            this.centerY,
            TableTennisConfig.ASSETS.BAT_A
        ).setScale(GameConfig.ASSETS.BAT_SCALE);

        this.batB = this.add.image(
            this.centerX,
            this.centerY,
            TableTennisConfig.ASSETS.BAT_B
        ).setScale(GameConfig.ASSETS.BAT_SCALE);
        this.batB.setRotation(Math.PI); // Visual flip for opponent

        // Add Ball
        this.ball = this.add.image(
            this.centerX,
            this.centerY,
            TableTennisConfig.ASSETS.BALL
        ).setScale(GameConfig.ASSETS.BALL_BASE_SCALE);

        // Create UI
        this.createUI();

        // Setup resize listener
        this.scale.on('resize', this.handleResize, this);

        // Initial resize to set correct scaling
        this.handleResize({ width: this.scale.width, height: this.scale.height });

        // Setup network event listeners
        this.setupNetworkEvents();

        // Connect to server
        this.connectToServer();

        // Input
        this.input.on('pointermove', (pointer) => {
            // Adjust pointer for resize if necessary, though pointer coordinates usually scale automatically in RESIZE mode
            if (this.gameStarted) {
                this.handlePointerMove(pointer);
            }
        });

        // Matter.js Physics Setup

        // 1. Table Sensor (Rectangle)
        // Helps visualize but we use manual range checks for speed/simplicity in 2.5D
        this.tableBody = this.matter.add.rectangle(
            this.centerX,
            this.centerY,
            GameConfig.GAME.TABLE_WIDTH * this.viewTransform.scale,
            GameConfig.GAME.TABLE_LENGTH * this.viewTransform.scale,
            { isStatic: true, isSensor: true, label: 'table' }
        );

        // 2. Bat Bodies (Polygons)
        this.batABody = this.matter.add.fromVertices(
            0, 0,
            GameConfig.GAME.BAT_VERTICES,
            { isStatic: false, isSensor: true, label: 'batA' }
        );

        // Opponent bat body needs to be rotated 180 degrees (PI radians)
        const verticesB = GameConfig.GAME.BAT_VERTICES.map(v => ({ x: -v.x, y: -v.y }));
        this.batBBody = this.matter.add.fromVertices(
            0, 0,
            verticesB,
            { isStatic: false, isSensor: true, label: 'batB' }
        );

        // 3. Ball Body (Circle)
        this.ballBody = this.matter.add.circle(
            0, 0,
            GameConfig.PHYSICS.BALL_RADIUS,
            { isStatic: false, isSensor: true, label: 'ball' }
        );

        // Collision Event
        this.matter.world.on('collisionstart', (event) => {
            event.pairs.forEach(pair => {
                const labels = [pair.bodyA.label, pair.bodyB.label];
                if (labels.includes('ball') && labels.includes('batA')) {
                    // We ALWAYS control batA locally in our relative world
                    this.checkBatCollision(this.batAState, 1);
                }
            });
        });

        // Debug Graphics
        this.debugGraphics = this.add.graphics();
        this.debugGraphics.setDepth(150);


        // Start Game Loop logic
        this.isFalling = false;
        this.resetBall();

        // Cleanup on scene shutdown
        this.events.on('shutdown', () => {
            console.log('[GameScene] Shutting down, disconnecting network...');
            if (this.network) {
                this.network.disconnect();
            }
            this.scale.removeListener('resize', this.handleResize, this);
        });
    }

    handleResize(gameSize) {
        const width = gameSize.width;
        const height = gameSize.height;

        this.centerX = width / 2;
        this.centerY = height / 2;

        this.cameras.main.setViewport(0, 0, width, height);

        // Calculate global scale to fit the target aspect ratio
        // We want to fit the game area (TARGET_WIDTH x TARGET_HEIGHT) into the window
        const scaleX = width / GameConfig.DISPLAY.TARGET_WIDTH;
        const scaleY = height / GameConfig.DISPLAY.TARGET_HEIGHT;

        // Use the smaller scale to ensure everything fits
        const globalScale = Math.min(scaleX, scaleY);

        // Update ViewTransform
        this.viewTransform.update(this.centerX, this.centerY, globalScale);

        // Resize and Reposition Table
        this.table.setPosition(this.centerX, this.centerY);
        this.table.setScale(GameConfig.ASSETS.TABLE_SCALE * globalScale);

        // Reposition Bats & Ball (rendering loop will handle positions, but we need to update scales)
        this.batA.setScale(GameConfig.ASSETS.BAT_SCALE * globalScale);
        this.batB.setScale(GameConfig.ASSETS.BAT_SCALE * globalScale);
        // Ball scale is dynamic in render(), but base scale depends on global scale now (handled in ViewTransform)

        // UI Repositioning
        if (this.statusText) {
            this.statusText.setPosition(this.centerX, height - 20);
        }
        if (this.connectButton) {
            this.connectButton.setPosition(this.centerX, this.centerY + 50);
        }
        if (this.infoText) {
            this.infoText.setPosition(this.centerX, GameConfig.UI.INFO_Y);
        }

        // Reposition Scoreboard
        this.updateScoreBoardPositions(width, height);
    }

    createUI() {
        // Create Score scoreboard elements
        this.createScoreBoard();

        // Info/Status text (serving, etc.)
        this.infoText = this.add.text(
            this.centerX,
            GameConfig.UI.INFO_Y,
            '',
            {
                fontSize: GameConfig.UI.INFO_FONT_SIZE,
                fill: GameConfig.UI.INFO_COLOR
            }
        ).setOrigin(0.5);

        // Network Status text
        // Create Status Graphic Background First
        this.statusBg = this.add.graphics();
        this.statusBg.setDepth(100);

        this.statusText = this.add.text(
            this.centerX,
            GameConfig.DISPLAY.HEIGHT - 40,
            'Connecting...',
            {
                fontSize: '20px',
                fill: '#ffffff', // White text
                fontFamily: 'Arial, sans-serif'
            }
        );
        this.statusText.setOrigin(0.5, 0.5);
        this.statusText.setDepth(101); // Above BG

        // Initial Background Draw
        this.updateStatusDisplay('Connecting...');

        // Connect Button
        this.connectButton = this.add.text(
            this.centerX,
            this.centerY + 50,
            'CONNECT TO GAME',
            {
                fontSize: '32px',
                fill: '#00ff00',
                backgroundColor: '#000000',
                padding: { x: 20, y: 10 },
                fontFamily: 'Arial, sans-serif',
                stroke: '#ffffff',
                strokeThickness: 2
            }
        );
        this.connectButton.setOrigin(0.5);
        this.connectButton.setDepth(101);
        this.connectButton.setInteractive({ useHandCursor: true });
        this.connectButton.setVisible(false);

        this.connectButton.on('pointerdown', () => {
            this.connectButton.setVisible(false);
            this.updateStatusDisplay('Connecting...');
            this.network.connectToGame();
        });
    }

    updateStatusDisplay(text) {
        if (!this.statusText) return;

        this.statusText.setText(text);
        this.statusText.setVisible(true);

        // Update Background
        const padding = 20;
        const width = this.statusText.width + padding * 2;
        const height = this.statusText.height + padding;
        const radius = 15;

        this.statusBg.clear();
        this.statusBg.setVisible(true);
        this.statusBg.fillStyle(0x000000, 1); // Black background
        this.statusBg.fillRoundedRect(
            this.statusText.x - width / 2,
            this.statusText.y - height / 2,
            width,
            height,
            radius
        );
    }

    createScoreBoard() {
        const sb = GameConfig.UI.SCORE_BOARD;

        // Backgrounds (Rounded Rects) - Graphics objects
        this.bgA = this.add.graphics();
        this.bgB = this.add.graphics();

        // Text Styles
        const nameStyle = { fontSize: sb.FONT_SIZE_NAME, fill: sb.TEXT_COLOR, fontFamily: 'Arial' };
        const scoreStyle = { fontSize: sb.FONT_SIZE_SCORE, fill: sb.TEXT_COLOR, fontFamily: 'Arial', fontStyle: 'bold' };

        // Player A Elements (Left side usually, but depends on role)
        // We initialize them, positions will be set in updateScoreBoardPositions
        this.nameTextA = this.add.text(0, 0, 'Player A', nameStyle).setOrigin(0.5);
        this.scoreTextA = this.add.text(0, 0, '0', scoreStyle).setOrigin(0.5);

        // Player B Elements
        this.nameTextB = this.add.text(0, 0, 'Player B', nameStyle).setOrigin(0.5);
        this.scoreTextB = this.add.text(0, 0, '0', scoreStyle).setOrigin(0.5);

        // Set Depths to be on top
        this.bgA.setDepth(90);
        this.bgB.setDepth(90);
        this.nameTextA.setDepth(91);
        this.scoreTextA.setDepth(91);
        this.nameTextB.setDepth(91);
        this.scoreTextB.setDepth(91);
    }

    updateScoreBoardPositions(width, height) {
        if (!this.nameTextA) return;

        const sb = GameConfig.UI.SCORE_BOARD;
        const topY = sb.MARGIN_Y;
        const leftX = sb.MARGIN_X + (sb.WIDTH / 2);
        const rightX = width - sb.MARGIN_X - (sb.WIDTH / 2); // Mirror on right

        // Positions will be set in updateScoreBoardPositions
        // Block 1 (Left) and Block 2 (Right) positions

        // Left Block (Block 1)
        this._pos1 = { x: leftX, y: topY };

        // Right Block (Block 2)
        this._pos2 = { x: rightX, y: topY };

        // We will decide WHICH player goes to WHICH block in redrawScoreBoard()
        this.redrawScoreBoard();
    }

    redrawScoreBoard() {
        // If role is not known yet, we can still render the board with defaults
        const sb = GameConfig.UI.SCORE_BOARD;

        let leftName = "You";
        let rightName = "Opponent";
        let leftScoreVal = this.scoreA;
        let rightScoreVal = this.scoreB;

        // Default colors if role unknown
        let leftColor = 0xff0000; // Red for A
        let rightColor = 0x0000ff; // Blue for B

        if (this.role) {
            if (this.role === 'A') {
                leftName = "You";
                leftColor = 0xff0000;
                leftScoreVal = this.scoreA;

                rightName = "Opponent";
                rightColor = 0x0000ff;
                rightScoreVal = this.scoreB;
            } else {
                leftName = "You";
                leftColor = 0x0000ff;
                leftScoreVal = this.scoreB;

                rightName = "Opponent";
                rightColor = 0xff0000;
                rightScoreVal = this.scoreA;
            }
        }

        // Use calculated positions or defaults
        const posLeft = this._pos1 || { x: sb.MARGIN_X + sb.WIDTH / 2, y: sb.MARGIN_Y };
        const posRight = this._pos2 || { x: GameConfig.DISPLAY.WIDTH - sb.MARGIN_X - sb.WIDTH / 2, y: sb.MARGIN_Y };

        // Draw Backgrounds
        this.bgA.clear();
        this.bgB.clear();

        // Left Background
        this.bgA.fillStyle(leftColor, sb.BG_ALPHA);
        this.bgA.fillRoundedRect(
            posLeft.x - sb.WIDTH / 2,
            posLeft.y,
            sb.WIDTH,
            sb.HEIGHT,
            sb.RADIUS
        );

        // Right Background
        this.bgB.fillStyle(rightColor, sb.BG_ALPHA);
        this.bgB.fillRoundedRect(
            posRight.x - sb.WIDTH / 2,
            posRight.y,
            sb.WIDTH,
            sb.HEIGHT,
            sb.RADIUS
        );

        // Update Texts
        // Left Side
        this.nameTextA.setText(leftName);
        this.nameTextA.setPosition(posLeft.x, posLeft.y + 15);

        this.scoreTextA.setText(leftScoreVal);
        this.scoreTextA.setPosition(posLeft.x, posLeft.y + 40);

        // Right Side
        this.nameTextB.setText(rightName);
        this.nameTextB.setPosition(posRight.x, posRight.y + 15);

        this.scoreTextB.setText(rightScoreVal);
        this.scoreTextB.setPosition(posRight.x, posRight.y + 40);
    }

    async connectToServer() {
        try {
            await this.network.connect();

            if (GameConfig.MATCH_DATA && GameConfig.MATCH_DATA.roomId && GameConfig.MATCH_DATA.mode === 'embedded') {
                console.log('Using embedded match data:', GameConfig.MATCH_DATA);
                this.updateStatusDisplay('Joining...');

                // Wait 500ms to ensure ICE servers are received first
                await new Promise(resolve => setTimeout(resolve, 500));

                this.network.handleMatchFound(GameConfig.MATCH_DATA);
            } else {
                this.updateStatusDisplay('Finding opponent...');
                this.network.findMatch();
            }
        } catch (error) {
            console.error('Failed to connect:', error);
            this.updateStatusDisplay('Connection failed. Retrying...');
            this.connectButton.setText('RETRY CONNECTION');
            this.connectButton.setVisible(true);

            // Retry handler
            this.connectButton.removeAllListeners('pointerdown');
            this.connectButton.on('pointerdown', () => {
                this.connectButton.setVisible(false);
                this.connectToServer();
            });
        }
    }

    setupNetworkEvents() {
        // NetworkManager events
        this.events.on('queued', () => {
            this.updateStatusDisplay('Waiting...');
        });

        this.events.on('match_found', (msg) => {
            // Normalize Role: Handle 'host'/'client' from backend or 'A'/'B'
            // Default to 'B' unless explicitly 'A' or 'host'
            let normalizedRole = 'B';
            if (msg.role === 'A' || msg.role === 'host') {
                normalizedRole = 'A';
            }



            this.role = normalizedRole; // Set local role
            this.isInitiator = msg.isInitiator;
            this.updateStatusDisplay('Waiting...');

            // Now that we have a role, we can properly label "You" and "Opponent"
            this.redrawScoreBoard();

            this.network.connectToGame();
        });

        // Game connection established (WebRTC DataChannel open)
        this.events.on('game_datachannel_open', () => {
            console.log('Game Data Channel Open - Starting Sync');
            this.updateStatusDisplay('Start');

            // Hide status text after a moment
            this.time.delayedCall(1000, () => {
                this.statusText.setVisible(false);
                this.statusBg.setVisible(false);
            });

            // Initialize game-specific connection
            // Ensure we have the live game connection reference
            if (!this.network.gameConnection && this.network.localNetworkManager?.gameConnection) {
                this.network.gameConnection = this.network.localNetworkManager.gameConnection;
            }
            if (this.network.gameConnection) {
                this.pingPongConnection = new PingPongConnection(
                    this.network.gameConnection,
                    this
                );
                this.pingPongConnection.startHeartbeat();
            } else {
                console.warn('[GameScene] No gameConnection available to start PingPongConnection');
            }

            this.startGameplay();
        });

        this.events.on('connection_failed', () => {
            this.statusText.setText('Connection lost. Please refresh.');
            this.statusText.setVisible(true);
            this.gameStarted = false;
        });

        this.events.on('webrtc_disconnected', () => {
            this.statusText.setText('Opponent disconnected.');
            this.statusText.setVisible(true);
            this.gameStarted = false;
        });

        // Game specific events
        this.events.on('remote_bat_update', (msg) => this.handleRemoteBat(msg));
        this.events.on('remote_hit_event', (msg) => this.handleRemoteHit(msg));
        this.events.on('remote_score_update', (msg) => this.handleRemoteScore(msg));
    }

    startGameplay() {
        this.gameStarted = true;
        this.resetBall();
        this.updateInfoText();
    }

    update(time, delta) {
        if (!this.gameStarted || this.isFalling) return;

        const dt = delta / 1000;

        // BOTH players simulate physics locally
        this.updatePhysics(dt);

        this.render();
        this.updateInfoText();
    }

    handlePointerMove(pointer) {
        // RELATIVE INPUT: Everyone is Player A (Bottom) in their own world
        let worldX = pointer.x - this.centerX;
        let worldY = pointer.y - this.centerY;

        // Clamp to Bottom Side
        worldY = Phaser.Math.Clamp(
            worldY,
            GameConfig.GAME.BAT_A_Y_MIN,
            GameConfig.GAME.BAT_A_Y_MAX
        );

        // Store previous position for velocity
        this.batAState.prevX = this.batAState.x;
        this.batAState.prevY = this.batAState.y;

        this.batAState.x = worldX;
        this.batAState.y = worldY;

        this.sendBatUpdate();
    }

    updateInfoText() {
        if (this.isServing) {
            this.infoText.setText(''); // Removed "Serving - Hit ball to start" as requested
        } else {
            this.infoText.setText('');
        }
    }

    updatePhysics(dt) {
        const b = this.ballState;

        // Update bat velocities (smoothed)
        this.updateBatVelocities(dt);

        // Apply gravity with spin modifier
        // STATIONARY SERVE: Skip gravity if serving, so ball stays at serve height
        if (!this.isServing) {
            let gravityMultiplier = 1.0;
            if (GameConfig.PHYSICS.SPIN_ENABLED && b.spin !== 0) {
                if (b.spin > 0) {
                    // Topspin - more gravity
                    gravityMultiplier = GameConfig.PHYSICS.TOPSPIN_GRAVITY_MULTIPLIER;
                } else {
                    // Backspin - less gravity
                    gravityMultiplier = GameConfig.PHYSICS.BACKSPIN_GRAVITY_MULTIPLIER;
                }
            }
            b.vz -= (GameConfig.PHYSICS.GRAVITY * gravityMultiplier * dt);
        }

        // Apply spin decay
        if (b.spin !== 0) {
            b.spin *= Math.pow(GameConfig.PHYSICS.SPIN_DECAY, dt);
            if (Math.abs(b.spin) < 0.01) b.spin = 0;
        }

        // Move ball
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;

        // Ground/Table Bounce
        if (b.z <= 0) {
            // Check if ball is on the table
            const onTable = (
                Math.abs(b.x) <= GameConfig.GAME.TABLE_WIDTH / 2 &&
                Math.abs(b.y) <= GameConfig.GAME.TABLE_LENGTH / 2
            );

            // Outside region check (table boundary + margins)
            const inOutsideRegion = (
                Math.abs(b.x) <= (GameConfig.GAME.TABLE_WIDTH / 2 + GameConfig.GAME.FALL_MARGIN_X) &&
                Math.abs(b.y) <= (GameConfig.GAME.TABLE_LENGTH / 2 + GameConfig.GAME.FALL_MARGIN_Y)
            );

            if (onTable) {
                b.z = 0;
                if (b.vz < 0) {
                    // Play bounce sound if velocity is significant
                    if (Math.abs(b.vz) > 10) {
                        this.sound.play(TableTennisConfig.ASSETS.TABLE_BOUNCE);
                    }

                    // ELASTIC BOUNCE - Perfect reflection along Z
                    b.vz = -b.vz * GameConfig.PHYSICS.BOUNCE_DAMPING;

                    // Friction still applies to horizontal movement
                    b.vx = PhysicsUtils.applyFriction(b.vx);
                    b.vy = PhysicsUtils.applyFriction(b.vy);

                    // Min bounce threshold (to prevent micro-vibrations if damping was < 1)
                    if (Math.abs(b.vz) < GameConfig.PHYSICS.MIN_BOUNCE_VELOCITY) {
                        b.vz = 0;
                    }
                }
            } else if (inOutsideRegion) {
                // FALL OFF TABLE within the buffer zone
                // Only start falling if ball is low enough
                if (b.z < 20) {
                    this.startFallAnimation();
                }
            } else {
                // Completely outside the region - authoritative score if way past boundary
                // We removed the b.z < -50 check to ensure the ball flies naturally out of view
                if (Math.abs(b.y) > GameConfig.GAME.COURT_Y_BOUNDARY && this.role === 'A') {
                    const winner = (b.y > 0) ? 'B' : 'A';
                    this.handleScoreChange(winner);
                }
            }
        }

        // Check for stuck ball (only current server checks to avoid conflict)
        if (
            this.role === this.currentServer &&
            !this.isServing &&
            b.z === 0 &&
            PhysicsUtils.isStuck(b.vx, b.vy, b.vz)
        ) {
            this.handleScoreChange(this.currentServer);
        }

        // Bat Collisions
        // Matter.js collisionStart handles the triggers now.
        // But we still need to synchronize Matter bodies to world coordinates.
        this.syncMatterBodies();

        if (this.role === 'A' && !this.isFalling) {
            if (Math.abs(b.y) > GameConfig.GAME.COURT_Y_BOUNDARY) {
                if (b.y > 0) {
                    this.handleScoreChange('B');
                } else {
                    this.handleScoreChange('A');
                }
            }
        }
    }

    updateBatVelocities(dt) {
        // Update bat A velocity
        const smoothing = GameConfig.PHYSICS.BAT_VELOCITY_SMOOTHING;
        this.batAState.vx = Phaser.Math.Linear(
            this.batAState.vx,
            (this.batAState.x - this.batAState.prevX) / Math.max(dt, 0.001),
            smoothing
        );
        this.batAState.vy = Phaser.Math.Linear(
            this.batAState.vy,
            (this.batAState.y - this.batAState.prevY) / Math.max(dt, 0.001),
            smoothing
        );

        // Update bat B velocity
        this.batBState.vx = Phaser.Math.Linear(
            this.batBState.vx,
            (this.batBState.x - this.batBState.prevX) / Math.max(dt, 0.001),
            smoothing
        );
        this.batBState.vy = Phaser.Math.Linear(
            this.batBState.vy,
            (this.batBState.y - this.batBState.prevY) / Math.max(dt, 0.001),
            smoothing
        );
    }

    syncMatterBodies() {
        if (!this.viewTransform) return;

        // Sync local Bat A body (Perspective 'A' is always used locally)
        const posA = this.viewTransform.worldToScreen(this.batAState.x, this.batAState.y, 0, 'A');
        this.matter.body.setPosition(this.batABody, { x: posA.x, y: posA.y });

        // Sync Opponent Bat B body
        const posB = this.viewTransform.worldToScreen(this.batBState.x, this.batBState.y, 0, 'A');
        this.matter.body.setPosition(this.batBBody, { x: posB.x, y: posB.y });

        // Sync Ball body
        const posBall = this.viewTransform.worldToScreen(this.ballState.x, this.ballState.y, this.ballState.z, 'A');
        this.matter.body.setPosition(this.ballBody, { x: posBall.x, y: posBall.y });
    }

    startFallAnimation() {
        if (this.isFalling) return;
        this.isFalling = true;

        // Shrink and fade ball
        this.tweens.add({
            targets: this.ball,
            scale: 0,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => {
                // Award point to whoever hit it last/opponent
                // If ball went off table, the striker failed.
                // For simplicity, let's treat it as a point for opponent.
                const winner = (this.ballState.vy < 0) ? 'A' : 'B';
                this.handleScoreChange(winner);

                // Reset visual state
                this.ball.setAlpha(1);
                this.isFalling = false;
            }
        });
    }

    checkBatCollision(batState, direction) {
        const now = this.time.now;
        const b = this.ballState;

        if (now - this.lastHitTime < this.COLLISION_COOLDOWN) {
            return;
        }

        this.lastHitTime = now;
        this.sound.play(TableTennisConfig.ASSETS.BAT_HIT);
        // Hit!
        if (this.isServing) {
            const isServerA = (this.currentServer === 'A');
            const isBatA = (this.role === 'A');
            if (isServerA !== isBatA) return;
            this.isServing = false;
        }

        // ========================================
        // SMART AIMING - Guaranteed In-Bounds
        // ========================================

        // 1. PROJECTILE MATH: Calculate time until ball hits z=0
        // Formula: z(t) = z0 + vz0*t - 0.5*g*t^2 = 0
        // Solving for t: t = (vz0 + sqrt(vz0^2 + 2*g*z0)) / g
        const g = GameConfig.PHYSICS.GRAVITY;
        const z0 = Math.max(0, b.z);
        const vz0 = b.vz;

        // Calculate time to impact
        let tHit = (vz0 + Math.sqrt(vz0 * vz0 + 2 * g * z0)) / g;

        // Fallback for edge cases (e.g. ball stuck on table)
        if (isNaN(tHit) || tHit < 0.1) tHit = 0.5;

        // 2. TARGET SELECTION (Opponent's Table Region)
        const tableL = GameConfig.GAME.TABLE_LENGTH;
        const tableW = GameConfig.GAME.TABLE_WIDTH;
        const marginX = GameConfig.GAME.LANDING_ZONE_MARGIN_X;
        const marginY = GameConfig.GAME.LANDING_ZONE_MARGIN_Y;

        // Y-Targeting (Depth)
        // Map bat speed to % of opponent's table depth
        const batSpeed = Math.sqrt(batState.vx * batState.vx + batState.vy * batState.vy);
        const speedFactor = Math.min(1.0, batSpeed / 500); // Normalize speed
        const lerpDepth = GameConfig.GAME.LANDING_ZONE_MIN_DEPTH +
            (GameConfig.GAME.LANDING_ZONE_MAX_DEPTH - GameConfig.GAME.LANDING_ZONE_MIN_DEPTH) * speedFactor;

        // Calculate target Y relative to net (y=0)
        // Role A (Bottom) hits to Negative Y. Role B (Top) hits to Positive Y.
        const targetYLocal = (tableL / 2 - marginY) * lerpDepth + marginY;
        const targetY = -direction * targetYLocal;

        // X-Targeting (Width)
        // Map hit offset and bat vx to landing X
        const hitOffsetPct = (b.x - batState.x) / 30; // Normalize offset from bat center
        const batVxBonus = batState.vx / 200;
        let targetX = (hitOffsetPct + batVxBonus) * (tableW / 2 - marginX);
        targetX = Phaser.Math.Clamp(targetX, -(tableW / 2 - marginX), (tableW / 2 - marginX));

        // 3. VELOCITY CALCULATION
        // vy = (targetY - currentY) / tHit
        // vx = (targetX - currentX) / tHit
        b.vy = (targetY - b.y) / tHit;
        b.vx = (targetX - b.x) / tHit;

        // 4. VERTICAL CONSERVATION: z-velocity will not change on hit
        // (Handled by keeping b.vz as is)

        this.sendHitEvent();
        if (GameConfig.PHYSICS.SPIN_ENABLED) {
            b.spin = -batState.vy * direction * GameConfig.PHYSICS.SPIN_MULTIPLIER;
        }

        this.sendHitEvent();

        if (GameConfig.DEBUG.LOG_COLLISIONS) {
            console.log('🎯 Bat collision:', {
                role: this.role,
                direction,
                batVel: { vx: batState.vx.toFixed(1), vy: batState.vy.toFixed(1) },
                ballVel: { vx: b.vx.toFixed(1), vy: b.vy.toFixed(1), vz: b.vz.toFixed(1) }
            });
        }
    }

    handleScoreChange(winner) {
        if (winner === 'A') {
            this.scoreA++;
            this.currentServer = 'A';
        } else {
            this.scoreB++;
            this.currentServer = 'B';
        }
        this.isServing = true;
        this.resetBall();
        this.redrawScoreBoard();
        this.checkWinCondition();
        if (this.pingPongConnection) {
            this.pingPongConnection.sendScoreUpdate(this.scoreA, this.scoreB, this.currentServer);
        }
    }

    checkWinCondition() {
        if (this.gameOver) return;

        const winningScore = GameConfig.GAME.WINNING_SCORE;
        let winner = null;

        if (this.scoreA >= winningScore) {
            winner = 'A';
        } else if (this.scoreB >= winningScore) {
            winner = 'B';
        }

        if (winner) {
            this.handleWin(winner);
        }
    }

    handleWin(winner) {
        this.gameOver = true;
        this.gameStarted = false; // Stop updates

        const isMeWinner = (this.role === winner);

        // Visuals
        const overlayColor = (winner === 'A') ? 0xff0000 : 0x0000ff; // Red (A) or Blue (B)
        const overlayAlpha = GameConfig.UI.WIN_OVERLAY_ALPHA;

        const winText = isMeWinner ? "You Won" : "Opponent Won";

        // Create Full Screen Overlay
        const overlay = this.add.graphics();
        overlay.setDepth(200);
        overlay.fillStyle(overlayColor, overlayAlpha);
        overlay.fillRect(0, 0, GameConfig.DISPLAY.WIDTH, GameConfig.DISPLAY.HEIGHT);

        // Create Win Text
        const text = this.add.text(
            this.centerX,
            this.centerY,
            winText,
            {
                fontSize: '64px',
                fill: '#ffffff',
                fontFamily: 'Arial',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 6
            }
        ).setOrigin(0.5);
        text.setDepth(201);
    }

    resetBall() {
        // RELATIVE: Everyone is Player A locally.
        const iAmServer = (this.role === this.currentServer);

        const serveY = iAmServer
            ? GameConfig.GAME.BALL_SERVE_Y_OFFSET
            : -GameConfig.GAME.BALL_SERVE_Y_OFFSET;

        this.ballState = {
            x: 0,
            y: serveY,
            z: GameConfig.GAME.BALL_SERVE_Z,
            vx: 0,
            vy: 0,
            vz: 0,
            spin: 0
        };

        this.isServing = true;

        // Reset visual state
        const baseScale = this.viewTransform.calculateDepthScale(
            this.ballState.z,
            GameConfig.ASSETS.BALL_BASE_SCALE,
            GameConfig.ASSETS.BALL_Z_SCALE_FACTOR
        );
        this.ball.setScale(baseScale);
        this.ball.setAlpha(1);
    }

    render() {
        if (!this.viewTransform) return;

        // RELATIVE: Everyone uses perspective 'A' locally
        const posA = this.viewTransform.worldToScreen(this.batAState.x, this.batAState.y, 0, 'A');
        this.batA.setPosition(posA.x, posA.y);

        const posB = this.viewTransform.worldToScreen(this.batBState.x, this.batBState.y, 0, 'A');
        this.batB.setPosition(posB.x, posB.y);

        const posBall = this.viewTransform.worldToScreen(this.ballState.x, this.ballState.y, this.ballState.z, 'A');
        this.ball.setPosition(posBall.x, posBall.y);

        // Scale ball based on depth
        const scale = this.viewTransform.calculateDepthScale(
            this.ballState.z,
            GameConfig.ASSETS.BALL_BASE_SCALE,
            GameConfig.ASSETS.BALL_Z_SCALE_FACTOR
        );
        this.ball.setScale(scale);

        if (GameConfig.DEBUG.PHYSICS_DEBUG) {
            this.drawDebug();
        }
    }


    drawDebug() {
        this.debugGraphics.clear();

        // 1. Draw Table/Court Boundaries (Green)
        this.debugGraphics.lineStyle(2, 0x00ff00, 0.8);

        // Horizontal boundaries (y = 240 and y = -240)
        // Since court width isn't explicitly defined for collision (it's implicit in table size), 
        // let's use a reasonable width for the debug lines.
        const courtWidth = GameConfig.GAME.TABLE_WIDTH;
        const courtHeight = GameConfig.GAME.TABLE_LENGTH;

        // Table Rectangle
        const tableTopLeft = this.viewTransform.worldToScreen(-courtWidth / 2, -courtHeight / 2, 0, 'A');
        const tableBottomRight = this.viewTransform.worldToScreen(courtWidth / 2, courtHeight / 2, 0, 'A');
        this.debugGraphics.strokeRect(
            tableTopLeft.x,
            tableTopLeft.y,
            tableBottomRight.x - tableTopLeft.x,
            tableBottomRight.y - tableTopLeft.y
        );

        // Outside Region (Margins)
        this.debugGraphics.lineStyle(1, 0x00ff00, 0.4);
        const outsideTopLeft = this.viewTransform.worldToScreen(
            -(courtWidth / 2 + GameConfig.GAME.FALL_MARGIN_X),
            -(courtHeight / 2 + GameConfig.GAME.FALL_MARGIN_Y),
            0, 'A'
        );
        const outsideBottomRight = this.viewTransform.worldToScreen(
            (courtWidth / 2 + GameConfig.GAME.FALL_MARGIN_X),
            (courtHeight / 2 + GameConfig.GAME.FALL_MARGIN_Y),
            0, 'A'
        );
        this.debugGraphics.strokeRect(
            outsideTopLeft.x,
            outsideTopLeft.y,
            outsideBottomRight.x - outsideTopLeft.x,
            outsideBottomRight.y - outsideTopLeft.y
        );

        // Net (y = 0)
        this.debugGraphics.lineStyle(1, 0xffffff, 0.5);
        const netLeft = this.viewTransform.worldToScreen(-courtWidth / 2, 0, 0, 'A');
        const netRight = this.viewTransform.worldToScreen(courtWidth / 2, 0, 0, 'A');
        this.debugGraphics.lineBetween(netLeft.x, netLeft.y, netRight.x, netRight.y);

        // 2. Draw Bat Collision Polygons
        // Bat A
        this.debugGraphics.lineStyle(2, 0xff0000, 1);
        const pointsA = GameConfig.GAME.BAT_VERTICES.map(v => {
            const worldPos = { x: this.batAState.x + v.x, y: this.batAState.y + v.y };
            return this.viewTransform.worldToScreen(worldPos.x, worldPos.y, 0, 'A');
        });
        this.debugGraphics.strokePoints(pointsA, true);

        // Bat B
        this.debugGraphics.lineStyle(2, 0x0000ff, 1);
        const pointsB = GameConfig.GAME.BAT_VERTICES.map(v => {
            // RELATIVE: Bat B uses flipped vertices in physics, so we flip them here for debug too
            const worldPos = { x: this.batBState.x - v.x, y: this.batBState.y - v.y };
            return this.viewTransform.worldToScreen(worldPos.x, worldPos.y, 0, 'A');
        });
        this.debugGraphics.strokePoints(pointsB, true);


        // 3. Draw Ball logical center (crosshair)
        const screenBall = this.viewTransform.worldToScreen(this.ballState.x, this.ballState.y, this.ballState.z, 'A');
        this.debugGraphics.lineStyle(1, 0xffff00, 1);
        const chSize = 10;
        this.debugGraphics.lineBetween(screenBall.x - chSize, screenBall.y, screenBall.x + chSize, screenBall.y);
        this.debugGraphics.lineBetween(screenBall.x, screenBall.y - chSize, screenBall.x, screenBall.y + chSize);
    }

    // Network Synchronization

    sendBatUpdate() {
        if (this.pingPongConnection) {
            // RELATIVE: We always control batAState locally.
            // Transform for network based on our local role (A or B).
            const netState = this.viewTransform.toNetwork(this.batAState, this.role);

            this.pingPongConnection.sendBatUpdate(
                this.role,
                netState.x,
                netState.y,
                netState.vx,
                netState.vy
            );
        }
    }

    sendHitEvent() {
        if (this.pingPongConnection) {
            // Transform ball world state for remote client
            const netBall = this.viewTransform.toNetwork(this.ballState, this.role);
            this.pingPongConnection.sendHitEvent(netBall, this.isServing);
        }
    }

    handleRemoteBat(msg) {
        if (msg.role !== this.role) {
            // Transform inbound network coordinates to our local relative world
            const localState = this.viewTransform.fromNetwork(msg, this.role);

            this.batBState.prevX = this.batBState.x;
            this.batBState.prevY = this.batBState.y;
            this.batBState.x = localState.x;
            this.batBState.y = localState.y;
            if (msg.vx !== undefined) this.batBState.vx = localState.vx;
            if (msg.vy !== undefined) this.batBState.vy = localState.vy;
        }
    }

    handleRemoteHit(msg) {
        // Transform remote ball state to local world
        this.ballState = this.viewTransform.fromNetwork(msg.state, this.role);
        this.isServing = msg.isServing;
    }

    handleRemoteScore(msg) {
        this.scoreA = msg.scoreA;
        this.scoreB = msg.scoreB;
        this.currentServer = msg.currentServer;
        this.isServing = true;
        this.resetBall();
        this.redrawScoreBoard();
        this.checkWinCondition();
    }
}
