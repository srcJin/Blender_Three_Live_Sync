const WebSocket = require('ws');
const net = require('net');
const zlib = require('zlib');

// Error handling
function handleError(error, source) {
    console.error(`[${source}] Error:`, error);
}

// WebSocket server
let wsServer;
try {
    wsServer = new WebSocket.Server({ port: 10005 });
    console.log('WebSocket server started successfully, listening on port 10005');
} catch (error) {
    handleError(error, 'WebSocket');
}

let wsClients = new Set();

// Transform update buffering and smoothing
const transformBuffer = new Map(); // objectName -> latest transform data
const transformTimers = new Map(); // objectName -> timer reference
const TRANSFORM_SEND_RATE = process.env.TRANSFORM_RATE || 10; // Hz, configurable via env
const TRANSFORM_SEND_INTERVAL = 1000 / TRANSFORM_SEND_RATE; // milliseconds

console.log(`🔧 Server transform buffering configured at ${TRANSFORM_SEND_RATE}Hz (${TRANSFORM_SEND_INTERVAL}ms interval)`);

// TCP server
const tcpServer = net.createServer();
let dataBuffer = Buffer.alloc(0);
let expectedDataSize = null;
let blenderSocket = null; // Keep reference to Blender connection

// Function to send buffered transform to Blender
function sendBufferedTransform(objectName) {
    const transformData = transformBuffer.get(objectName);
    if (!transformData) return;
    
    console.log(`📡 Sending buffered transform for '${objectName}' to Blender:`, {
        position: transformData.position,
        rotation: transformData.rotation,
        scale: transformData.scale,
        bufferedFor: `${Date.now() - transformData.firstReceived}ms`
    });
    
    const success = forwardToBlenderImmediate(transformData);
    
    if (success) {
        // Clear the buffer and timer for this object
        transformBuffer.delete(objectName);
        const timer = transformTimers.get(objectName);
        if (timer) {
            clearTimeout(timer);
            transformTimers.delete(objectName);
        }
        console.log(`✅ Buffered transform sent for '${objectName}', buffer cleared`);
    }
}

// Function to buffer and smooth transform updates
function bufferTransformUpdate(message) {
    const objectName = message.objectName;
    const now = Date.now();
    
    // Update the buffer with the latest transform
    const existingData = transformBuffer.get(objectName);
    const transformData = {
        ...message,
        firstReceived: existingData ? existingData.firstReceived : now,
        lastUpdated: now
    };
    
    transformBuffer.set(objectName, transformData);
    
    // Clear existing timer if any
    const existingTimer = transformTimers.get(objectName);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }
    
    // Set new timer to send the latest transform after the interval
    const timer = setTimeout(() => {
        sendBufferedTransform(objectName);
    }, TRANSFORM_SEND_INTERVAL);
    
    transformTimers.set(objectName, timer);
    
    console.log(`🔄 Buffered transform update for '${objectName}' (${TRANSFORM_SEND_RATE}Hz smoothing)`);
}

// Function to forward messages to Blender immediately (renamed from forwardToBlender)
function forwardToBlenderImmediate(message) {
    if (blenderSocket && !blenderSocket.destroyed) {
        try {
            const messageStr = JSON.stringify(message);
            const messageBuffer = Buffer.from(messageStr, 'utf8');
            
            console.log(`📤 Preparing to send to Blender: ${messageBuffer.length} bytes`);
            
            // Send message size first (4 bytes), then the message
            const sizeBuffer = Buffer.allocUnsafe(4);
            sizeBuffer.writeUInt32BE(messageBuffer.length, 0);
            
            blenderSocket.write(sizeBuffer);
            blenderSocket.write(messageBuffer);
            
            console.log(`✅ Successfully sent transform update to Blender (${messageBuffer.length} bytes)`);
            return true;
        } catch (error) {
            handleError(error, 'Forward to Blender');
            console.log('❌ Failed to write to Blender socket:', error.message);
            return false;
        }
    } else {
        console.warn('❌ Cannot forward to Blender - no active TCP connection');
        console.log('🔍 Blender socket state:', {
            socketExists: !!blenderSocket,
            isDestroyed: blenderSocket ? blenderSocket.destroyed : 'N/A',
            readyState: blenderSocket ? blenderSocket.readyState : 'N/A'
        });
        return false;
    }
}

// Function to flush all pending transforms (cleanup)
function flushAllTransforms() {
    console.log(`🧹 Flushing ${transformBuffer.size} pending transforms`);
    
    // Clear all timers
    for (const [objectName, timer] of transformTimers) {
        clearTimeout(timer);
    }
    
    // Clear all data
    transformBuffer.clear();
    transformTimers.clear();
    
    console.log('✅ All transform buffers cleared');
}

// Legacy function name for compatibility (now uses buffering)
function forwardToBlender(message) {
    if (message.type === 'transform_update') {
        bufferTransformUpdate(message);
    } else {
        forwardToBlenderImmediate(message);
    }
}

// Handle TCP connections
tcpServer.on('connection', (socket) => {
    console.log('Blender connected');
    blenderSocket = socket; // Store reference for bidirectional communication
    
    socket.setKeepAlive(true, 1000);
    socket.setNoDelay(true);

    socket.on('data', (data) => {
        try {
            // Add new data to buffer
            dataBuffer = Buffer.concat([dataBuffer, data]);
            console.log(`📦 Received ${data.length} bytes, buffer now ${dataBuffer.length} bytes`);

            // Process all complete packets in buffer
            while (dataBuffer.length > 0) {
                // If data size hasn't been read yet
                if (expectedDataSize === null && dataBuffer.length >= 4) {
                    expectedDataSize = dataBuffer.readUInt32BE(0);
                    dataBuffer = dataBuffer.slice(4);
                    
                    // Validate data size (prevent corruption attacks)
                    if (expectedDataSize > 50 * 1024 * 1024) { // 50MB max
                        console.error(`❌ Invalid data size: ${expectedDataSize} bytes (too large)`);
                        // Reset and try to recover
                        dataBuffer = Buffer.alloc(0);
                        expectedDataSize = null;
                        break;
                    }
                    
                    console.log(`📏 New packet header: expecting ${expectedDataSize} bytes`);
                }

                // If we have complete data
                if (expectedDataSize !== null && dataBuffer.length >= expectedDataSize) {
                    const compressedData = dataBuffer.slice(0, expectedDataSize);
                    console.log(`🗜️ Processing complete packet: ${compressedData.length} bytes`);
                    
                    // Decompress data
                    zlib.inflate(compressedData, (err, result) => {
                        if (err) {
                            console.error(`💥 Decompression failed for ${compressedData.length} bytes:`, err.message);
                            console.error(`🔍 First 20 bytes:`, compressedData.slice(0, 20));
                            handleError(err, 'Data Decompression');
                            return;
                        }

                        console.log(`✅ Decompression successful: ${result.length} bytes original`);

                        // Send to all WebSocket clients
                        const data = result.toString();
                        let clientCount = 0;
                        wsClients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(data);
                                clientCount++;
                            }
                        });
                        console.log(`📤 Data forwarded to ${clientCount} WebSocket clients`);
                    });

                    // Clean up buffer for next packet
                    dataBuffer = dataBuffer.slice(expectedDataSize);
                    expectedDataSize = null;
                    console.log(`🔄 Buffer cleaned, remaining: ${dataBuffer.length} bytes`);
                } else {
                    // Not enough data yet, wait for more
                    console.log(`⏳ Waiting for more data: have ${dataBuffer.length}, need ${expectedDataSize || 'header'}`);
                    break;
                }
            }
        } catch (error) {
            console.error(`💥 TCP data processing error:`, error);
            handleError(error, 'Data Processing');
            // Reset buffer on any error to prevent cascade failures
            dataBuffer = Buffer.alloc(0);
            expectedDataSize = null;
        }
    });

    socket.on('error', (error) => {
        handleError(error, 'TCP Socket');
    });

    socket.on('close', () => {
        console.log('Blender disconnected');
        flushAllTransforms(); // Clear pending transforms
        blenderSocket = null; // Clear reference when disconnected
    });
});

tcpServer.on('error', (error) => {
    handleError(error, 'TCP Server');
});

// Handle WebSocket connections
wsServer.on('connection', (ws) => {
    console.log('WebSocket client connected');
    wsClients.add(ws);
    console.log(`Current connected clients: ${wsClients.size}`);

    // Handle incoming messages from clients (e.g., transform updates)
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('📨 Received message from client:', {
                type: message.type,
                size: data.length,
                timestamp: new Date().toISOString()
            });
            
            if (message.type === 'transform_update') {
                console.log('🔄 Forwarding transform update to Blender:', {
                    objectName: message.objectName,
                    position: message.position,
                    rotation: message.rotation,
                    scale: message.scale,
                    timestamp: message.timestamp
                });
                
                // Forward to Blender via TCP
                const success = forwardToBlender(message);
                if (success) {
                    console.log('✅ Transform update successfully sent to Blender');
                } else {
                    console.log('❌ Failed to send transform update to Blender');
                }
            } else {
                console.log('ℹ️ Received non-transform message:', message.type || 'unknown type');
            }
        } catch (error) {
            handleError(error, 'Message Processing');
            console.log('📦 Raw message data (first 100 chars):', data.toString().substring(0, 100));
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        wsClients.delete(ws);
        console.log(`Current connected clients: ${wsClients.size}`);
    });

    ws.on('error', (error) => {
        handleError(error, 'WebSocket Client');
    });
});

// Start TCP server
try {
    tcpServer.listen(10006, '0.0.0.0', () => {
        console.log('TCP server started successfully, listening on port 10006');
        console.log('Server address:', tcpServer.address());
        console.log(`🔧 Transform smoothing: ${TRANSFORM_SEND_RATE}Hz (${TRANSFORM_SEND_INTERVAL}ms buffering)`);
    });
} catch (error) {
    handleError(error, 'TCP Server Start');
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    flushAllTransforms(); // Clean up pending transforms
    wsServer.close(() => {
        console.log('WebSocket server closed');
    });
    tcpServer.close(() => {
        console.log('TCP server closed');
        process.exit(0);
    });
}); 