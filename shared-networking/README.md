# Local Development Networking Setup

This directory contains simplified networking components for local development of multiplayer games.

## Overview

The original games used complex matchmaking servers and Socket.IO connections. For local development, this has been simplified to:

- **Tab-based peer matching** using localStorage
- **WebRTC with STUN servers only** (no TURN servers required)
- **No matchmaking server dependency**

## How It Works

1. **Peer Discovery**: When you open a game in two browser tabs, the first tab becomes Player A (host) and the second tab becomes Player B (client)
2. **Signaling**: Communication between tabs happens via localStorage events
3. **WebRTC Connection**: Once peers are matched, they establish a direct WebRTC connection using public STUN servers
4. **Game State Sharing**: Game data is shared through WebRTC data channels as before

## Files

- `LocalNetworkManager.js` - Handles peer discovery and signaling via localStorage
- `LocalGameConnection.js` - Simplified WebRTC connection using STUN servers only

## Usage

Simply open any game in two browser tabs to test local multiplayer. The games will automatically detect each other and establish a connection.

## STUN Servers Used

- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

These are public Google STUN servers that work for local development without requiring authentication.
