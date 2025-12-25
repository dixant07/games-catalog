import Phaser from 'phaser';
import GameConfig from '../config/GameConfig.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { GameConnection } from '../network/GameConnection.js';
import { DoodleGuessConnection } from '../network/DoodleGuessConnection.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.networkManager = null;
        this.gameConnection = null;
        this.doodleConnection = null;

        this.isDrawer = false;
        this.currentWord = '';
        this.gameState = 'WAITING';
        this.timer = 0;

        // Drawing state
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.selectedColor = '#000000';
        this.selectedWidth = 4;
        this.selectedTool = 'pen'; // 'pen', 'eraser', 'fill'

        // Canvas & Undo
        this.drawingCanvas = null;
        this.drawingCtx = null;
        this.drawingTexture = null;
        this.undoStack = [];
        this.maxUndo = 15;

        this.guessInput = null;
        this.opponentTypingText = null;

        this.myScore = 0;
        this.opponentScore = 0;
        this.roundScore = 0;
    }

    create() {
        this.setupUI();
        this.setupNetworking();
        this.setupDrawing();
        this.guessInput = document.getElementById('guess-input');

        this.scale.on('resize', this.handleResize, this);
    }

    setupNetworking() {
        this.networkManager = new NetworkManager(this);
        this.setupNetworkEvents();
        this.connectToServer();
    }

    async connectToServer() {
        try {
            await this.networkManager.connect();
            const matchData = GameConfig.MATCH_DATA;
            if (matchData && matchData.roomId && matchData.mode === 'embedded') {
                console.log('[DoodleGuess] Using embedded match data:', matchData);
                // Wait 500ms to ensure ICE servers are received first (matching ping-pong)
                await new Promise(resolve => setTimeout(resolve, 500));
                // In embedded mode, match_found won't be sent by server, we simulate it
                this.networkManager.handleMatchFound(matchData);
            } else {
                console.log('[DoodleGuess] Joining matchmaking queue...');
                this.networkManager.findMatch();
            }
        } catch (error) {
            console.error('[DoodleGuess] Failed to connect:', error);
        }
    }

    setupNetworkEvents() {
        // Matchmaking Events
        this.events.on('queued', () => {
            this.wordDisplay.setText('WAITING FOR OPPONENT...');
        });

        this.events.on('match_found', (msg) => {
            console.log('[DoodleGuess] Match found, connecting to game...');

            // role normalization (A/host = Drawer, B/client = Guesser)
            let normalizedRole = 'B';
            if (msg.role === 'A' || msg.role === 'host') {
                normalizedRole = 'A';
            }
            this.isDrawer = normalizedRole === 'A';

            this.networkManager.connectToGame();

            if (this.isDrawer) {
                this.wordDisplay.setText('CONNECTING...');
            } else {
                this.wordDisplay.setText('WAITING FOR DRAWER...');
            }
        });

        // WebRTC Connection Events
        this.events.on('game_datachannel_open', () => {
            console.log('[DoodleGuess] WebRTC Channel Open!');

            // Ensure we have the live game connection reference
            if (!this.networkManager.gameConnection && this.networkManager.localNetworkManager?.gameConnection) {
                this.networkManager.gameConnection = this.networkManager.localNetworkManager.gameConnection;
            }
            if (this.networkManager.gameConnection) {
                this.doodleConnection = new DoodleGuessConnection(
                    this.networkManager.gameConnection,
                    this
                );
                this.doodleConnection.startHeartbeat();
            } else {
                console.warn('[DoodleGuess] No gameConnection available for DoodleGuessConnection');
            }

            if (this.isDrawer) {
                this.showWordChoice();
                this.createDrawerUI();
            } else {
                this.wordDisplay.setText('WAITING FOR DRAWER TO PICK...');
            }
        });

        this.events.on('connection_failed', () => {
            this.wordDisplay.setText('CONNECTION LOST');
        });

        // Game specific events
        this.events.on('remote_draw', (data) => this.handleRemoteDraw(data));
        this.events.on('remote_clear_canvas', () => this.handleRemoteClear());
        this.events.on('remote_word_selected', (data) => this.handleRemoteWordSelected(data));
        this.events.on('remote_guess', (data) => this.handleRemoteGuess(data));
        this.events.on('remote_game_state', (data) => this.handleRemoteGameState(data));
        this.events.on('remote_typing_sync', (data) => this.handleRemoteTyping(data));
        this.events.on('remote_typing_feedback', (data) => this.handleRemoteTypingFeedback(data));
        this.events.on('remote_flood_fill', (data) => this.handleRemoteFloodFill(data));
        this.events.on('remote_undo', () => this.handleRemoteUndo());
        this.events.on('remote_round_end', (data) => this.endRound(data.guessedCorrectly, false, data.points));
    }

    setupUI() {
        const { width, height } = this.scale;

        // Background (Improved Gradient-like Green)
        this.add.rectangle(0, 0, width, height, 0x27ae60).setOrigin(0);

        // -- Top UI Container --
        // 1. Timer (Top Middle)
        this.timerContainer = this.add.container(width / 2, 30);
        const timerBg = this.add.graphics();
        timerBg.fillStyle(0x000000, 0.4);
        timerBg.fillRoundedRect(-70, 0, 140, 50, 15);
        this.timerText = this.add.text(0, 25, '00:00', {
            fontSize: '24px',
            color: '#ffffff',
            fontFamily: 'Outfit',
            fontWeight: '700'
        }).setOrigin(0.5);
        this.timerContainer.add([timerBg, this.timerText]);

        // 2. "You" Label (Top Left)
        this.myScoreContainer = this.add.container(20, 30);
        const myBg = this.add.graphics();
        myBg.fillStyle(0x3498db, 0.9); // Blue
        myBg.fillRoundedRect(0, 0, 150, 70, 15);
        const myLabel = this.add.text(75, 20, 'YOU', {
            fontSize: '14px',
            color: '#ffffff',
            fontFamily: 'Outfit',
            fontWeight: '600'
        }).setOrigin(0.5);
        this.myScoreText = this.add.text(75, 45, 'Score: 0', {
            fontSize: '22px',
            color: '#ffffff',
            fontFamily: 'Outfit',
            fontWeight: '800'
        }).setOrigin(0.5);
        this.myScoreContainer.add([myBg, myLabel, this.myScoreText]);

        // 3. "Opponent" Label (Top Right)
        this.opponentScoreContainer = this.add.container(width - 170, 30);
        const oppBg = this.add.graphics();
        oppBg.fillStyle(0xe74c3c, 0.9); // Red
        oppBg.fillRoundedRect(0, 0, 150, 70, 15);
        const oppLabel = this.add.text(75, 20, 'OPPONENT', {
            fontSize: '14px',
            color: '#ffffff',
            fontFamily: 'Outfit',
            fontWeight: '600'
        }).setOrigin(0.5);
        this.opponentScoreText = this.add.text(75, 45, 'Score: 0', {
            fontSize: '22px',
            color: '#ffffff',
            fontFamily: 'Outfit',
            fontWeight: '800'
        }).setOrigin(0.5);
        this.opponentScoreContainer.add([oppBg, oppLabel, this.opponentScoreText]);

        // 4. Word Display (Below Timer)
        this.wordDisplay = this.add.text(width / 2, 100, 'CONNECTING...', {
            fontSize: '32px',
            color: '#ffffff',
            fontWeight: '800',
            fontFamily: 'Outfit',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.hintText = this.add.text(width / 2, 140, '', {
            fontSize: '18px',
            color: '#ffffff',
            fontFamily: 'Outfit',
            fontWeight: '600'
        }).setOrigin(0.5);

        this.opponentTypingText = this.add.text(width / 2, height / 2, '', {
            fontSize: '28px',
            color: '#000000',
            fontFamily: 'Outfit',
            fontWeight: '900',
            fontStyle: 'italic',
            stroke: '#ffffff',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(2000);
    }

    createDrawerUI() {
        if (this.drawerUIContainer) this.drawerUIContainer.destroy();
        const { width, height } = this.scale;

        // Tool area height
        const toolHeight = 140;
        this.drawerUIContainer = this.add.container(0, height).setDepth(150);
        const toolbar = this.drawerUIContainer;

        // Background for toolbar - Full Width Bottom
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.85);
        bg.fillRect(0, -toolHeight, width, toolHeight);
        toolbar.add(bg);

        // 1. Color Palette (10 colors, 5x2) - Left Side
        const colors = [
            '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
            '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#8b4513'
        ];

        colors.forEach((color, i) => {
            const x = 30 + (i % 5) * 50;
            const y = -toolHeight + 25 + Math.floor(i / 5) * 50;
            const swatch = this.add.rectangle(x, y, 40, 40, Phaser.Display.Color.HexStringToColor(color).color)
                .setStrokeStyle(2, 0xffffff)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    this.selectedColor = color;
                    if (this.selectedTool === 'eraser') {
                        this.selectedTool = 'pen';
                        this.updateToolButtons();
                    }
                    console.log('[DoodleGuess] Selected color:', color);
                });
            toolbar.add(swatch);
        });

        // 2. Tools - Middle
        const tools = [
            { id: 'pen', label: 'PEN' },
            { id: 'eraser', label: 'ERASER' },
            { id: 'fill', label: 'FILL' },
            { id: 'undo', label: 'UNDO' },
            { id: 'clear', label: 'CLEAR' }
        ];

        this.toolButtons = {};
        tools.forEach((tool, i) => {
            const row = Math.floor(i / 3);
            const col = i % 3;
            const x = width / 2 - 40 + (col - 1) * 110;
            const y = -toolHeight + 35 + row * 50;

            const isAction = tool.id === 'undo' || tool.id === 'clear';
            const btnBg = this.add.rectangle(x, y, 100, 40, isAction ? 0xe74c3c : 0x34495e)
                .setInteractive({ useHandCursor: true });
            
            const btnText = this.add.text(x, y, tool.label, { 
                fontSize: '16px', 
                fontWeight: '800', 
                fontFamily: 'Outfit',
                color: '#fff' 
            }).setOrigin(0.5);

            btnBg.on('pointerdown', () => {
                if (tool.id === 'undo') this.undo();
                else if (tool.id === 'clear') this.clearCanvas(true);
                else {
                    this.selectedTool = tool.id;
                    if (tool.id === 'eraser') this.selectedColor = '#ffffff';
                    this.updateToolButtons();
                }
            });

            if (!isAction) this.toolButtons[tool.id] = btnBg;
            toolbar.add([btnBg, btnText]);
        });

        // 3. Weight Selector - Right Side
        const weights = [4, 8, 16, 24];
        weights.forEach((w, i) => {
            const x = width - 150 + (i % 2) * 60;
            const y = -toolHeight + 35 + Math.floor(i / 2) * 50;
            
            const btn = this.add.circle(x, y, 15, 0x34495e)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    this.selectedWidth = w;
                    this.updateWeightButtons();
                });
            
            const indicator = this.add.circle(x, y, w / 4 + 2, 0xffffff);
            
            if (!this.weightButtons) this.weightButtons = [];
            this.weightButtons.push({ bg: btn, weight: w });
            toolbar.add([btn, indicator]);
        });

        this.updateToolButtons();
        this.updateWeightButtons();
    }

    updateToolButtons() {
        if (!this.toolButtons) return;
        Object.keys(this.toolButtons).forEach(id => {
            this.toolButtons[id].setFillStyle(id === this.selectedTool ? 0x2ecc71 : 0x34495e);
        });
    }

    updateWeightButtons() {
        if (!this.weightButtons) return;
        this.weightButtons.forEach(btn => {
            btn.bg.setFillStyle(btn.weight === this.selectedWidth ? 0x2ecc71 : 0x34495e);
        });
    }

    setupDrawing() {
        const { width, height } = this.scale;

        // Define drawing area (White Plane)
        const canvasWidth = 800;
        const canvasHeight = 600;

        // Create Canvas Texture
        this.drawingTexture = this.textures.createCanvas('drawing', canvasWidth, canvasHeight);
        this.drawingCanvas = this.drawingTexture.getSourceImage();
        this.drawingCtx = this.drawingCanvas.getContext('2d', { willReadFrequently: true });

        // Fill initial white
        this.drawingCtx.fillStyle = '#ffffff';
        this.drawingCtx.fillRect(0, 0, canvasWidth, canvasHeight);
        this.drawingTexture.refresh();

        // Create Sprite to display drawing
        this.drawingSprite = this.add.sprite(width / 2, height / 2 + 20, 'drawing');
        this.drawingSprite.setInteractive();
        this.updateCanvasPosition();

        // Input listeners
        this.drawingSprite.on('pointerdown', (pointer) => {
            if (!this.isDrawer || this.gameState !== 'DRAWING') return;

            const localPos = this.getLocalCoords(pointer.x, pointer.y);

            if (this.selectedTool === 'fill') {
                this.saveUndo();
                this.floodFill(localPos.x, localPos.y, this.selectedColor);
                this.doodleConnection.sendFloodFill(localPos.x, localPos.y, this.selectedColor);
                return;
            }

            this.saveUndo();
            this.isDrawing = true;
            this.lastX = localPos.x;
            this.lastY = localPos.y;

            this.drawOnCanvas(this.lastX, this.lastY, this.lastX, this.lastY, this.selectedColor, this.selectedWidth);
            this.doodleConnection.sendDraw(localPos.x, localPos.y, false, this.selectedColor, this.selectedWidth);
        });

        this.input.on('pointermove', (pointer) => {
            if (!this.isDrawing || !this.isDrawer || this.gameState !== 'DRAWING') return;

            const localPos = this.getLocalCoords(pointer.x, pointer.y);
            this.drawOnCanvas(this.lastX, this.lastY, localPos.x, localPos.y, this.selectedColor, this.selectedWidth);
            this.doodleConnection.sendDraw(localPos.x, localPos.y, true, this.selectedColor, this.selectedWidth);

            this.lastX = localPos.x;
            this.lastY = localPos.y;
        });

        this.input.on('pointerup', () => {
            this.isDrawing = false;
        });
    }

    getLocalCoords(x, y) {
        const scaleX = this.drawingSprite.scaleX;
        const scaleY = this.drawingSprite.scaleY;
        const localX = (x - (this.drawingSprite.x - (this.drawingSprite.displayWidth / 2))) / scaleX;
        const localY = (y - (this.drawingSprite.y - (this.drawingSprite.displayHeight / 2))) / scaleY;
        return { x: Math.floor(localX), y: Math.floor(localY) };
    }

    drawOnCanvas(x1, y1, x2, y2, color, thickness) {
        this.drawingCtx.beginPath();
        this.drawingCtx.strokeStyle = color;
        this.drawingCtx.lineWidth = thickness;
        this.drawingCtx.lineCap = 'round';
        this.drawingCtx.lineJoin = 'round';
        this.drawingCtx.moveTo(x1, y1);
        this.drawingCtx.lineTo(x2, y2);
        this.drawingCtx.stroke();
        this.drawingTexture.refresh();
    }

    updateCanvasPosition() {
        const { width, height } = this.scale;
        
        // Define margins
        const topMargin = 160;
        const bottomMargin = this.isDrawer ? 150 : 80;
        
        const availableWidth = width * 0.95;
        const availableHeight = height - topMargin - bottomMargin;

        const scale = Math.min(availableWidth / 800, availableHeight / 600);
        this.drawingSprite.setScale(scale);
        
        // Center vertically in the available space
        const centerY = topMargin + (availableHeight / 2);
        this.drawingSprite.setPosition(width / 2, centerY);
    }

    handleResize() {
        const { width, height } = this.scale;
        
        // Update all UI elements positions
        if (this.timerContainer) this.timerContainer.setX(width / 2);
        if (this.myScoreContainer) this.myScoreContainer.setX(20);
        if (this.opponentScoreContainer) this.opponentScoreContainer.setX(width - 170);
        if (this.wordDisplay) this.wordDisplay.setX(width / 2);
        if (this.hintText) this.hintText.setX(width / 2);
        if (this.opponentTypingText) {
            this.opponentTypingText.setX(width / 2);
            this.opponentTypingText.setY(height / 2);
        }

        if (this.drawerUIContainer) {
            this.drawerUIContainer.setPosition(0, height);
            // Re-render background or update it
            this.createDrawerUI();
        }

        this.updateCanvasPosition();
    }

    showWordChoice() {
        this.gameState = 'WORD_CHOICE';
        const { width, height } = this.scale;

        const words = Phaser.Utils.Array.Shuffle([...GameConfig.GAME.WORDS]).slice(0, 3);
        console.log('[DoodleGuess] Words chosen:', words);
        const container = this.add.container(width / 2, height / 2).setDepth(1000);

        const bg = this.add.rectangle(0, 0, 420, 350, 0x2ecc71).setStrokeStyle(6, 0x000000);
        bg.setInteractive().on('pointerdown', (p, x, y, event) => event.stopPropagation());

        const title = this.add.text(0, -120, 'CHOOSE A WORD', {
            color: '#000000',
            fontSize: '32px',
            fontWeight: '800',
            fontFamily: 'Outfit, Arial, sans-serif'
        }).setOrigin(0.5);

        container.add([bg, title]);

        words.forEach((word, i) => {
            const btnBg = this.add.rectangle(0, -20 + i * 80, 340, 60, 0x000000, 1).setInteractive({ useHandCursor: true });
            const btnText = this.add.text(0, -20 + i * 80, word.toUpperCase(), {
                color: '#2ecc71',
                fontSize: '24px',
                fontWeight: '800',
                fontFamily: 'Outfit, Arial, sans-serif'
            }).setOrigin(0.5);

            btnBg.on('pointerdown', () => {
                this.selectWord(word);
                container.destroy();
            });
            container.add([btnBg, btnText]);
        });
    }

    selectWord(word) {
        this.currentWord = word;
        this.gameState = 'DRAWING';
        this.timer = GameConfig.GAME.ROUND_TIME;
        this.wordDisplay.setText(word.toUpperCase());
        this.doodleConnection.sendWordSelected(word);
        this.startTimer();
    }

    startTimer() {
        if (this.timerEvent) this.timerEvent.remove();
        this.timerEvent = this.time.addEvent({
            delay: 1000,
            callback: () => {
                if (this.timer > 0) {
                    this.timer--;
                    this.updateTimerDisplay();
                    if (this.isDrawer) this.syncGameState();
                } else if (this.gameState === 'DRAWING') {
                    this.endRound(false);
                }
            },
            loop: true
        });
    }

    updateTimerDisplay() {
        const mins = Math.floor(this.timer / 60);
        const secs = this.timer % 60;
        if (this.timerText) {
            this.timerText.setText(`${mins}:${secs.toString().padStart(2, '0')}`);
        }
    }

    syncGameState() {
        const word = this.currentWord;
        let revealed = '';
        const revealCount = Math.floor((GameConfig.GAME.ROUND_TIME - this.timer) / GameConfig.GAME.HINT_INTERVAL);

        for (let i = 0; i < word.length; i++) {
            if (i < revealCount) revealed += word[i].toUpperCase() + ' ';
            else revealed += '_ ';
        }
        this.doodleConnection.sendGameState(this.gameState, this.timer, word.length, revealed);
    }

    handleRemoteDraw(data) {
        if (!data.isDrawing) {
            this.lastX = data.x;
            this.lastY = data.y;
        } else {
            this.drawOnCanvas(this.lastX, this.lastY, data.x, data.y, data.color, data.thickness);
            this.lastX = data.x;
            this.lastY = data.y;
        }
    }

    handleRemoteClear() {
        this.drawingCtx.fillStyle = '#ffffff';
        this.drawingCtx.fillRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
        this.drawingTexture.refresh();
    }

    showGuessUI() {
        if (this.guessInput) {
            this.guessInput.classList.remove('hidden');
            this.guessInput.focus();

            const handleKey = (e) => {
                if (e.key === 'Enter') {
                    const val = this.guessInput.value.trim();
                    if (val) {
                        this.doodleConnection.sendGuess(val);
                        this.guessInput.value = '';
                    }
                }
            };
            this.guessInput.addEventListener('keydown', handleKey);
            this.events.once('shutdown', () => {
                this.guessInput.removeEventListener('keydown', handleKey);
                this.guessInput.classList.add('hidden');
            });
        }
    }

    handleRemoteTyping(data) {
        // No longer informed real-time as per user request
    }

    getLevenshteinDistance(s1, s2) {
        if (s1.length < s2.length) [s1, s2] = [s2, s1];
        if (s2.length === 0) return s1.length;

        let costs = new Array(s2.length + 1);
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) costs[j] = j;
                else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }

    handleRemoteFloodFill(data) {
        this.saveUndo();
        this.floodFill(data.x, data.y, data.color);
    }

    handleRemoteUndo() {
        if (this.undoStack.length > 0) {
            const data = this.undoStack.pop();
            this.drawingCtx.putImageData(data, 0, 0);
            this.drawingTexture.refresh();
        }
    }

    handleRemoteWordSelected(data) {
        this.currentWord = data.word;
        this.gameState = 'DRAWING';
        this.showGuessUI();
    }

    handleRemoteGameState(data) {
        this.timer = data.timeRemaining;
        this.updateTimerDisplay();
        if (!this.isDrawer) {
            this.wordDisplay.setText(data.hints);
        }
    }

    handleRemoteGuess(data) {
        if (!this.isDrawer || this.gameState !== 'DRAWING') return;

        const guess = data.guess;
        if (!guess) return;

        const dist = this.getLevenshteinDistance(guess.toLowerCase(), this.currentWord.toLowerCase());
        let status = 'wrong';
        let color = '#ff0000'; // Red
        let points = 0;

        if (dist === 0) {
            status = 'correct';
            color = '#27ae60'; // Green
            this.roundScore = 10;
        } else if (dist <= 2) {
            status = 'close';
            color = '#f1c40f'; // Yellow
            this.roundScore = Math.max(this.roundScore, 5);
        }

        this.showFeedback(guess, color);

        // Notify guesser about their status
        this.doodleConnection.sendTypingFeedback(status, guess);

        if (status === 'correct') {
            this.time.delayedCall(1000, () => this.endRound(true));
        }
    }

    handleRemoteTypingFeedback(data) {
        if (this.isDrawer || !this.guessInput) return;

        let color = '#ff0000';
        if (data.status === 'correct') color = '#27ae60';
        else if (data.status === 'close') color = '#f1c40f';

        if (data.status === 'correct') {
            this.roundScore = 10;
        } else if (data.status === 'close') {
            this.roundScore = Math.max(this.roundScore, 5);
        }

        this.showFeedback(data.text, color);
    }

    showFeedback(text, color) {
        if (!this.opponentTypingText) return;

        this.opponentTypingText.setText(text.toUpperCase());
        this.opponentTypingText.setColor(color);
        this.opponentTypingText.setAlpha(1);

        // Hide after 3 seconds
        if (this.feedbackTimer) this.feedbackTimer.remove();
        this.feedbackTimer = this.time.delayedCall(3000, () => {
            if (this.opponentTypingText) {
                this.tweens.add({
                    targets: this.opponentTypingText,
                    alpha: 0,
                    duration: 500,
                    onComplete: () => {
                        if (this.opponentTypingText) this.opponentTypingText.setText('');
                    }
                });
            }
        });
    }

    clearCanvas(send = true) {
        this.saveUndo();
        this.drawingCtx.fillStyle = '#ffffff';
        this.drawingCtx.fillRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
        this.drawingTexture.refresh();
        if (send) this.doodleConnection.sendClearCanvas();
    }

    endRound(guessedCorrectly, sendToRemote = true, remotePoints = null) {
        if (this.gameState === 'RESULTS') return;
        this.gameState = 'RESULTS';

        // Apply scoring at end of round
        if (this.isDrawer) {
            // Drawer perspective: opponent guessed
            const finalPoints = remotePoints !== null ? remotePoints : this.roundScore;
            this.opponentScore += finalPoints;
            if (this.opponentScoreText) this.opponentScoreText.setText(`Score: ${this.opponentScore}`);

            if (sendToRemote) {
                this.doodleConnection.sendRoundEnd(guessedCorrectly, this.currentWord, finalPoints);
            }
        } else {
            // Guesser perspective: you guessed
            const finalPoints = remotePoints !== null ? remotePoints : this.roundScore;
            this.myScore += finalPoints;
            if (this.myScoreText) this.myScoreText.setText(`Score: ${this.myScore}`);

            if (sendToRemote) {
                // Guesser usually doesn't send round_end, but let's be safe
                this.doodleConnection.sendRoundEnd(guessedCorrectly, this.currentWord, finalPoints);
            }
        }

        if (this.timerEvent) this.timerEvent.remove();
        if (this.guessInput) this.guessInput.classList.add('hidden');

        const { width, height } = this.scale;
        const msg = guessedCorrectly ? 'CORRECT GUESS!' : 'TIME\'S UP!';
        const color = guessedCorrectly ? '#27ae60' : '#e74c3c';

        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.85).setOrigin(0).setDepth(100);
        const resultText = this.add.text(width / 2, height / 2 - 50, msg, {
            fontSize: '48px',
            fontWeight: '800',
            color: guessedCorrectly ? '#2ecc71' : '#ff7675',
            fontFamily: 'Outfit'
        }).setOrigin(0.5).setDepth(101);

        const wordText = this.add.text(width / 2, height / 2 + 20, `The word was: ${this.currentWord.toUpperCase()}`, {
            fontSize: '24px',
            color: '#ffffff',
            fontFamily: 'Outfit',
            fontWeight: '600'
        }).setOrigin(0.5).setDepth(101);

        // Check win condition
        const diff = Math.abs(this.myScore - this.opponentScore);
        if (diff >= 20) {
            const winner = this.myScore > this.opponentScore ? 'YOU WIN!' : 'OPPONENT WINS!';
            resultText.setText(winner);
            resultText.setColor('#f1c40f');

            this.add.text(width / 2, height / 2 + 100, 'GAME OVER', {
                fontSize: '32px',
                fontWeight: '900',
                color: '#ffffff',
                fontFamily: 'Outfit'
            }).setOrigin(0.5).setDepth(101);

            this.add.text(width / 2, height / 2 + 160, 'BACK TO HOME', {
                fontSize: '20px',
                fontWeight: '700',
                backgroundColor: '#2ecc71',
                padding: { x: 30, y: 15 },
                color: '#000000',
                fontFamily: 'Outfit'
            }).setOrigin(0.5).setDepth(101).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
                window.location.href = '/home';
            });
            return;
        }

        // Show transition after 3 seconds
        this.time.delayedCall(3000, () => {
            overlay.destroy();
            resultText.destroy();
            wordText.destroy();
            this.startTransition();
        });
    }

    startTransition() {
        this.gameState = 'TRANSITION';
        this.isDrawer = !this.isDrawer; // Swap roles

        const { width, height } = this.scale;
        const msg = this.isDrawer ? 'YOU ARE CHOOSING...' : 'OPPONENT IS CHOOSING...';

        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0).setDepth(200);
        const transText = this.add.text(width / 2, height / 2, msg, {
            fontSize: '36px',
            fontWeight: '800',
            color: '#2ecc71',
            fontFamily: 'Outfit'
        }).setOrigin(0.5).setDepth(201);

        this.time.delayedCall(5000, () => {
            overlay.destroy();
            transText.destroy();
            this.startNextRound();
        });
    }

    startNextRound() {
        this.clearCanvas(false);
        this.gameState = 'WAITING';
        this.roundScore = 0;
        this.wordDisplay.setText(this.isDrawer ? 'PICK A WORD' : 'WAITING FOR DRAWER...');
        this.hintText.setText('');

        if (this.isDrawer) {
            this.showWordChoice();
            this.createDrawerUI();
        } else {
            // Remove drawer UI if it exists (container needs to be destroyed or cleared)
            // Re-setup basic guess UI
            if (this.drawerUIContainer) this.drawerUIContainer.destroy();
        }
    }

    saveUndo() {
        const data = this.drawingCtx.getImageData(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
        this.undoStack.push(data);
        if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    }

    undo() {
        if (this.undoStack.length > 0) {
            const data = this.undoStack.pop();
            this.drawingCtx.putImageData(data, 0, 0);
            this.drawingTexture.refresh();
            this.doodleConnection.sendUndo();
        }
    }

    floodFill(startX, startY, fillColor) {
        const canvas = this.drawingCanvas;
        const ctx = this.drawingCtx;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const targetColor = this.getPixelColor(data, startX, startY, canvas.width);
        const replacementColor = this.hexToRgb(fillColor);

        if (this.colorsMatch(targetColor, replacementColor)) return;

        const stack = [[startX, startY]];
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const currentColor = this.getPixelColor(data, x, y, canvas.width);

            if (this.colorsMatch(currentColor, targetColor)) {
                this.setPixelColor(data, x, y, canvas.width, replacementColor);
                if (x > 0) stack.push([x - 1, y]);
                if (x < canvas.width - 1) stack.push([x + 1, y]);
                if (y > 0) stack.push([x, y - 1]);
                if (y < canvas.height - 1) stack.push([x, y + 1]);
            }
        }

        ctx.putImageData(imageData, 0, 0);
        this.drawingTexture.refresh();
    }

    getPixelColor(data, x, y, width) {
        const idx = (y * width + x) * 4;
        return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    }

    setPixelColor(data, x, y, width, color) {
        const idx = (y * width + x) * 4;
        data[idx] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
        data[idx + 3] = 255;
    }

    colorsMatch(c1, c2) {
        return c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2];
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : [0, 0, 0];
    }

    handleResize() {
        this.updateCanvasPosition();
    }
}
