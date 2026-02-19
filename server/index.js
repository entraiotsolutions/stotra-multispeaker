// Main Production Server
// This is the entry point for the production-ready backend

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

// Import routes
const sessionsRouter = require('./routes/sessions');
const recordingsRouter = require('./routes/recordings');
const webhooksRouter = require('./routes/webhooks');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/sessions', sessionsRouter);
app.use('/api/recordings', recordingsRouter);
app.use('/api/webhooks', webhooksRouter);

// Legacy token endpoint (for backward compatibility)
const tokenService = require('./services/tokenService');
app.post('/api/token', async (req, res) => {
  try {
    const { identity, roomName = 'test-room' } = req.body;
    const tokenData = await tokenService.generateToken(roomName, identity);
    res.json(tokenData);
  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.server.nodeEnv,
  });
});

// Configuration check endpoint (for debugging)
app.get('/api/config/check', (req, res) => {
  res.json({
    success: true,
    config: {
      livekit: {
        httpUrl: config.livekit.httpUrl,
        hasApiKey: !!config.livekit.apiKey,
        hasApiSecret: !!config.livekit.apiSecret,
        apiKeyPrefix: config.livekit.apiKey ? config.livekit.apiKey.substring(0, 8) + '...' : 'missing',
      },
      r2: {
        hasAccessKey: !!config.r2.accessKeyId,
        hasSecretKey: !!config.r2.secretAccessKey,
        bucket: config.r2.bucket || 'not set',
        endpoint: config.r2.endpoint || 'not set',
        region: config.r2.region,
      },
    },
  });
});

// Serve static files from client/dist (both development and production)
const fs = require('fs');
const distPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  
  // Serve index.html for all routes (SPA routing)
  // Express 5.x requires a proper catch-all pattern
  app.get(/^(?!\/api|\/health).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.warn(`⚠️  Frontend build not found at ${distPath}. Run 'pnpm build' first.`);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Server] Error:', err);
  res.status(500).json({ 
    success: false,
    error: config.server.nodeEnv === 'production' ? 'Internal server error' : err.message 
  });
});

// Start server
// Use PORT from environment (required by Render) or fallback to config
const PORT = process.env.PORT || config.server.port;
const HOST = '0.0.0.0'; // Listen on all network interfaces

app.listen(PORT, HOST, () => {
  console.log(`🚀 Production server running in ${config.server.nodeEnv} mode`);
  console.log(`Server listening on:`);
  console.log(`  - http://localhost:${PORT} (local access)`);
  console.log(`LiveKit URL: ${config.livekit.url}`);
  console.log(`LiveKit HTTP URL: ${config.livekit.httpUrl}`);
  console.log(`API Key: ${config.livekit.apiKey ? config.livekit.apiKey.substring(0, 8) + '...' : 'not set'}`);
  
  if (config.r2.bucket) {
    console.log(`R2 Bucket: ${config.r2.bucket}`);
  } else {
    console.warn(`⚠️  R2 Bucket not configured`);
  }
  
  console.log(`\n📋 API Endpoints:`);
  console.log(`  POST /api/sessions/create - Create a new session`);
  console.log(`  POST /api/sessions/:sessionId/join - Join a session`);
  console.log(`  GET  /api/sessions/:sessionId - Get session info`);
  console.log(`  GET  /api/recordings/session/:sessionId - Get recordings for session`);
  console.log(`  POST /api/webhooks/livekit - LiveKit webhook handler`);
  console.log(`  GET  /health - Health check`);
  console.log(`  GET  /api/config/check - Configuration check`);
});

module.exports = app;
