// Server configuration
require('dotenv').config();
console.log('LIVEKIT_API_KEY:', process.env.LIVEKIT_API_KEY);
console.log('LIVEKIT_API_SECRET:', process.env.LIVEKIT_API_SECRET);

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
    publicUrl: process.env.R2_PUBLIC_URL || 'https://pub-95b26d7009d14c6ca373f330f6d7923f.r2.dev',
    region: process.env.R2_REGION || 'us-east-1', // Optional: defaults to 'auto', automatically converted to 'us-east-1' for S3 compatibility
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
