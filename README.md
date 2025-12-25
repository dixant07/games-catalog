# Rumi Games (Local)

This repo contains multiple Phaser/Vite game clients and a small WebSocket server for local matchmaking. Each game can be run independently for quick local testing.

## Contents
- `doodle-guess/`
- `knife-throw/`
- `ping-pong/`
- `tic-tac-toe/`
- `shared-networking/` – local matchmaking WebSocket server

## Prerequisites
- Node.js 18+ and npm
- Ports used by default: `3000` (Vite dev server) per game, `8081` (local matchmaking server)

## Quick Start (any game)
1) Install dependencies inside the game folder:
   ```bash
   npm install
   ```
2) Start the dev server:
   ```bash
   npm run dev
   ```
3) Open the shown `http://localhost:3000` URL in two tabs to test multiplayer (tab A = host, tab B = client).

Repeat the above steps in `doodle-guess/`, `knife-throw/`, `ping-pong/`, or `tic-tac-toe/` depending on which game you want to run.

## Local matchmaking WebSocket server
All builds can use a WebSocket server instead of tab-to-tab signaling.

```bash
cd shared-networking
npm install
npm run start   # runs on ws://localhost:8081
```

The server will pair the first two connected clients and forward their signaling messages.

## Common scripts
- `npm run dev` – start Vite dev server
- `npm run build` – production build
- `npm run preview` – preview production build locally (after `npm run build`)
- `npm run start` in `shared-networking/` – start the local matchmaking server

## Troubleshooting
- If ports are busy, change the Vite port via `vite.config.js` or run with `npm run dev -- --port <port>`.
- Clear browser localStorage if tabs fail to discover each other during local multiplayer testing.
