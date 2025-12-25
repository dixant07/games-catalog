import Phaser from 'phaser';
import GameConfig from '../config/GameConfig.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { TicTacToeConnection } from '../network/TicTacToeConnection.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.board = Array(9).fill(null);
        this.currentPlayer = 'A'; // 'A' or 'B'
        this.myRole = null; // 'A' or 'B'
        this.isGameOver = false;
        this.networkManager = null;
        this.ticTacToeConnection = null;
        this.cells = [];
        this.statusText = null;
        this.winningLine = null;
    }

    create() {
        const { width, height } = this.scale;
        // Normalize initial role from match data if present
        let initialRole = 'B';
        if (GameConfig.MATCH_DATA.role === 'A' || GameConfig.MATCH_DATA.role === 'host') {
            initialRole = 'A';
        }
        this.myRole = initialRole;

        // UI Setup
        this.add.text(width / 2, 50, 'Tic-Tac-Toe', {
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.statusText = this.add.text(width / 2, 120, 'Connecting...', {
            fontSize: '24px',
            color: '#ffff00'
        }).setOrigin(0.5);

        this.createBoard();
        this.setupNetworking();
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
                console.log('[TicTacToe] Using embedded match data:', matchData);
                // Allow ICE servers to arrive first (parity with other games)
                await new Promise(resolve => setTimeout(resolve, 500));
                this.networkManager.handleMatchFound(matchData);
                this.statusText.setText('Connecting to game...');
            } else {
                console.log('[TicTacToe] Joining matchmaking queue...');
                this.statusText.setText('Finding Match...');
                this.networkManager.findMatch();
            }
        } catch (error) {
            console.error('[TicTacToe] Failed to connect:', error);
            if (this.statusText) this.statusText.setText('Connection Failed');
        }
    }

    setupNetworkEvents() {
        // Matchmaking
        this.events.on('queued', () => {
            if (this.statusText) this.statusText.setText('Waiting for opponent...');
        });

        this.events.on('match_found', (data) => {
            let normalizedRole = 'B';
            if (data.role === 'A' || data.role === 'host') {
                normalizedRole = 'A';
            }
            this.myRole = normalizedRole;
            if (this.statusText) this.statusText.setText(`Match Found! You are ${this.myRole}`);
            this.networkManager.connectToGame();
        });

        // WebRTC data channel ready
        this.events.on('game_datachannel_open', () => {
            console.log('[TicTacToe] Data channel open!');

            // Ensure we hold the live game connection reference
            if (!this.networkManager.gameConnection && this.networkManager.localNetworkManager?.gameConnection) {
                this.networkManager.gameConnection = this.networkManager.localNetworkManager.gameConnection;
            }

            if (this.networkManager.gameConnection) {
                this.ticTacToeConnection = new TicTacToeConnection(this.networkManager.gameConnection, this);
                this.ticTacToeConnection.startHeartbeat();
                this.updateStatus();
            } else {
                console.warn('[TicTacToe] No gameConnection available for TicTacToeConnection');
            }
        });

        this.events.on('connection_failed', () => {
            if (this.statusText) this.statusText.setText('Connection Lost');
        });

        // Game events
        this.events.on('remote_move', (msg) => {
            this.makeMove(msg.index, false);
        });

        this.events.on('remote_reset', () => {
            this.resetGame(false);
        });

        this.events.on('remote_game_over', (msg) => {
            this.isGameOver = true;
            if (msg.winnerRole) {
                this.statusText.setText(`Player ${msg.winnerRole} Wins!`);
            } else {
                this.statusText.setText("It's a Draw!");
            }
        });

        this.events.on('shutdown', () => {
            if (this.ticTacToeConnection) {
                this.ticTacToeConnection.destroy();
            }
        });
    }

    createBoard() {
        const { width, height } = this.scale;
        const cellSize = GameConfig.GAME.CELL_SIZE;
        const startX = (width - cellSize * 3) / 2;
        const startY = (height - cellSize * 3) / 2 + 50;

        for (let i = 0; i < 9; i++) {
            const x = startX + (i % 3) * cellSize + cellSize / 2;
            const y = startY + Math.floor(i / 3) * cellSize + cellSize / 2;

            const cell = this.add.rectangle(x, y, cellSize - 10, cellSize - 10, 0x333333)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.handleCellClick(i));

            const text = this.add.text(x, y, '', {
                fontSize: '64px',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            this.cells.push({ bg: cell, text: text });
        }

        // Draw grid lines
        const graphics = this.add.graphics();
        graphics.lineStyle(4, 0x444444);

        // Vertical lines
        for (let i = 1; i < 3; i++) {
            graphics.lineBetween(startX + i * cellSize, startY, startX + i * cellSize, startY + 3 * cellSize);
        }
        // Horizontal lines
        for (let i = 1; i < 3; i++) {
            graphics.lineBetween(startX, startY + i * cellSize, startX + 3 * cellSize, startY + i * cellSize);
        }
    }

    handleCellClick(index) {
        if (this.isGameOver || this.board[index] !== null) return;
        if (this.currentPlayer !== this.myRole) {
            console.log("Not your turn!");
            return;
        }
        if (!this.networkManager.isConnected) {
            console.log("Not connected!");
            return;
        }

        this.makeMove(index, true);
    }

    makeMove(index, isLocal) {
        if (this.board[index] !== null) return;

        this.board[index] = this.currentPlayer;
        const cell = this.cells[index];
        cell.text.setText(this.currentPlayer === 'A' ? 'X' : 'O');
        cell.text.setColor(this.currentPlayer === 'A' ? GameConfig.UI.X_COLOR : GameConfig.UI.O_COLOR);

        // Marker Animation
        cell.text.setScale(0);
        this.tweens.add({
            targets: cell.text,
            scale: 1,
            duration: 300,
            ease: 'Back.easeOut'
        });

        if (isLocal && this.ticTacToeConnection) {
            this.ticTacToeConnection.sendMove(index);
        }

        const winPattern = this.checkWin();
        if (winPattern) {
            this.isGameOver = true;
            this.statusText.setText(`Player ${this.currentPlayer} Wins!`);
            this.statusText.setColor('#00ff00');
            this.drawWinningLine(winPattern);
        } else if (this.board.every(cell => cell !== null)) {
            this.isGameOver = true;
            this.statusText.setText("It's a Draw!");
            this.statusText.setColor('#ffffff');
        } else {
            this.currentPlayer = this.currentPlayer === 'A' ? 'B' : 'A';
            this.updateStatus();
        }
    }

    checkWin() {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
            [0, 4, 8], [2, 4, 6]             // Diagonals
        ];

        return winPatterns.find(pattern => {
            const [a, b, c] = pattern;
            return this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c];
        });
    }

    drawWinningLine(pattern) {
        if (this.winningLine) this.winningLine.destroy();

        const startCell = this.cells[pattern[0]];
        const endCell = this.cells[pattern[2]];

        this.winningLine = this.add.graphics();
        this.winningLine.setDepth(10);

        const animObj = { progress: 0 };
        this.tweens.add({
            targets: animObj,
            progress: 1,
            duration: 600,
            ease: 'Cubic.easeInOut',
            onUpdate: () => {
                if (!this.winningLine.active) return;
                this.winningLine.clear();
                this.winningLine.lineStyle(8, 0xffffff, 1);
                const currentX = startCell.bg.x + (endCell.bg.x - startCell.bg.x) * animObj.progress;
                const currentY = startCell.bg.y + (endCell.bg.y - startCell.bg.y) * animObj.progress;
                this.winningLine.lineBetween(startCell.bg.x, startCell.bg.y, currentX, currentY);
            }
        });
    }

    updateStatus() {
        if (this.isGameOver) return;
        const turnText = this.currentPlayer === this.myRole ? "Your Turn" : "Opponent's Turn";
        this.statusText.setText(`${turnText} (${this.currentPlayer === 'A' ? 'X' : 'O'})`);
        this.statusText.setColor(this.currentPlayer === this.myRole ? '#00ff00' : '#ffff00');
    }

    resetGame(isLocal) {
        this.board.fill(null);
        this.currentPlayer = 'A';
        this.isGameOver = false;
        this.cells.forEach(cell => {
            cell.text.setText('');
        });
        if (this.winningLine) {
            this.winningLine.destroy();
            this.winningLine = null;
        }
        this.updateStatus();

        if (isLocal && this.ticTacToeConnection) {
            this.ticTacToeConnection.sendReset();
        }
    }
}
