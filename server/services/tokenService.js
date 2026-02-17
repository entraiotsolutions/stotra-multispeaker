// Token Generation Service

const { AccessToken } = require('livekit-server-sdk');
const config = require('../config');

class TokenService {
  /**
   * Generate LiveKit access token
   * @param {string} roomName - Room name
   * @param {string} identity - User identity (optional, auto-generated if not provided)
   * @returns {Promise<Object>} Token data
   */
  async generateToken(roomName, identity = null) {
    try {
      // Auto-generate identity if not provided
      const userIdentity = identity || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
        identity: userIdentity,
      });

      token.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      });

      const jwt = await token.toJwt();

      return {
        token: jwt,
        url: config.livekit.url,
        identity: userIdentity,
        roomName: roomName,
      };
    } catch (error) {
      console.error('[TokenService] Error generating token:', error);
      throw error;
    }
  }
}

module.exports = new TokenService();
