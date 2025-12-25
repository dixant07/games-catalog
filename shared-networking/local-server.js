const WebSocket = require('ws');
const http = require('http');

// Create HTTP server
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Map();
let waitingClient = null;

wss.on('connection', (ws) => {
    const clientId = 'client-' + Math.random().toString(36).substr(2, 9);
    clients.set(clientId, { ws, id: clientId, role: null });
    
    console.log(`[Server] Client connected: ${clientId}`);
    
    // Send client their ID
    ws.send(JSON.stringify({
        type: 'client-id',
        clientId: clientId
    }));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(clientId, data);
        } catch (err) {
            console.error('[Server] Error parsing message:', err);
        }
    });
    
    ws.on('close', () => {
        console.log(`[Server] Client disconnected: ${clientId}`);
        
        // If this was the waiting client, clear it
        if (waitingClient && waitingClient.id === clientId) {
            waitingClient = null;
        }
        
        // If this client was matched, notify the other client
        const client = clients.get(clientId);
        if (client && client.role) {
            const otherClientId = client.role === 'A' ? 'B' : 'A';
            const otherClient = Array.from(clients.values()).find(c => c.role === otherClientId);
            
            if (otherClient && otherClient.ws.readyState === WebSocket.OPEN) {
                otherClient.ws.send(JSON.stringify({
                    type: 'peer-disconnected'
                }));
            }
        }
        
        clients.delete(clientId);
    });
    
    ws.on('error', (err) => {
        console.error(`[Server] Client error: ${clientId}`, err);
        clients.delete(clientId);
    });
});

function handleMessage(clientId, data) {
    const client = clients.get(clientId);
    if (!client) return;
    
    switch (data.type) {
        case 'find-match':
            handleFindMatch(clientId);
            break;
            
        case 'signal':
            handleSignal(clientId, data);
            break;
            
        default:
            console.log('[Server] Unknown message type:', data.type);
    }
}

function handleFindMatch(clientId) {
    const client = clients.get(clientId);
    
    if (waitingClient && waitingClient.id !== clientId) {
        // We have a waiting client, match them
        console.log(`[Server] Matching clients: ${waitingClient.id} (A) and ${clientId} (B)`);
        
        // Assign roles
        waitingClient.role = 'A';
        waitingClient.isInitiator = true;
        waitingClient.opponentId = clientId;
        
        client.role = 'B';
        client.isInitiator = false;
        client.opponentId = waitingClient.id;
        
        // Send match found to both clients
        const matchData = {
            type: 'match-found',
            roomId: 'local-room',
            role: waitingClient.role,
            opponentId: waitingClient.opponentId,
            isInitiator: waitingClient.isInitiator,
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        // Send to waiting client (Player A)
        if (waitingClient.ws.readyState === WebSocket.OPEN) {
            waitingClient.ws.send(JSON.stringify(matchData));
        }
        
        // Send to new client (Player B)
        const matchDataB = { ...matchData, role: client.role, opponentId: client.opponentId, isInitiator: client.isInitiator };
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(matchDataB));
        }
        
        waitingClient = null;
        
    } else {
        // No waiting client, this client waits
        console.log(`[Server] Client ${clientId} waiting for opponent...`);
        waitingClient = client;
        
        // Send waiting status
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
                type: 'waiting',
                message: 'Waiting for opponent...'
            }));
        }
    }
}

function handleSignal(clientId, data) {
    const client = clients.get(clientId);
    if (!client || !client.opponentId) return;
    
    const opponent = Array.from(clients.values()).find(c => c.id === client.opponentId);
    if (!opponent || opponent.ws.readyState !== WebSocket.OPEN) return;
    
    // Forward signal to opponent
    opponent.ws.send(JSON.stringify({
        type: 'signal',
        from: clientId,
        data: data.data
    }));
}

// Start server
const PORT = 8081;
server.listen(PORT, () => {
    console.log(`[Server] Local matchmaking server running on port ${PORT}`);
    console.log('[Server] Clients can connect to ws://localhost:8081');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('[Server] Shutting down...');
    wss.close(() => {
        server.close(() => {
            console.log('[Server] Server closed');
            process.exit(0);
        });
    });
});
