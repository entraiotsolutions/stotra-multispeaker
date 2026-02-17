// Server configuration
require('dotenv').config();

module.exports = {
  // LiveKit Configuration
  livekit: {
    apiKey: process.env.LIVEKIT_API_KEY || 'devkey',
    apiSecret: process.env.LIVEKIT_API_SECRET || 'devsecret',
    url: process.env.LIVEKIT_URL || 'ws://localhost:7880',
    httpUrl: process.env.LIVEKIT_HTTP_URL || 'http://localhost:7881',
  },

  // Cloudflare R2 Configuration
  r2: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
    bucket: process.env.R2_BUCKET,
    endpoint: process.env.R2_ENDPOINT,
    region: 'auto', // R2 uses 'auto' region
  },

  // Server Configuration
  server: {
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    webhookSecret: process.env.WEBHOOK_SECRET || 'dev-webhook-secret',
  },

  // Session Configuration
  session: {
    idLength: 8, // 8-10 characters as requested
    idChars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  },
};
