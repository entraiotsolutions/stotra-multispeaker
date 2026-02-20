// Recording Service - Handles LiveKit Egress API for recording

const { RoomServiceClient, EgressClient } = require('livekit-server-sdk');
const config = require('../config');
const sessionService = require('./sessionService');
const recordingStorage = require('./recordingStorage');

class RecordingService {
  constructor() {
    this.roomService = new RoomServiceClient(
      config.livekit.httpUrl,
      config.livekit.apiKey,
      config.livekit.apiSecret
    );
    this.egressClient = new EgressClient(
      config.livekit.httpUrl,
      config.livekit.apiKey,
      config.livekit.apiSecret
    );
  }

  /**
   * Start recording a room (audio only, MP3)
   * @param {string} roomName - The room name to record
   * @param {string} sessionId - The session ID
   * @returns {Promise<string>} Egress ID
   */
  async startRecording(roomName, sessionId) {
    try {
      console.log(`[RecordingService] Starting recording for room: ${roomName}, session: ${sessionId}`);

      // Validate R2 configuration
      if (!config.r2.accessKeyId || !config.r2.secretAccessKey || !config.r2.bucket || !config.r2.endpoint) {
        throw new Error('R2 configuration is missing. Please set R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, and R2_ENDPOINT environment variables.');
      }

      // Check if room exists and is active
      let rooms;
      try {
        rooms = await this.roomService.listRooms([roomName]);
      } catch (roomError) {
        console.error(`[RecordingService] Error checking room:`, roomError);
        throw new Error(`Failed to check room status: ${roomError.message}`);
      }
      
      if (rooms.length === 0) {
        throw new Error(`Room ${roomName} does not exist. Please ensure participants are connected to the room before starting recording.`);
      }
      
      const room = rooms[0];
      console.log(`[RecordingService] Room found: ${roomName}, participants: ${room.numParticipants || 0}`);
      
      if (room.numParticipants === 0) {
        console.warn(`[RecordingService] Warning: Room ${roomName} has no participants. Recording may not capture any audio.`);
      }

      // Generate R2 file path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `recordings/${sessionId}/${sessionId}-${timestamp}.mp3`;

      // Start Egress recording (audio only, MP3)
      // Correct usage: startRoomCompositeEgress(roomName, options)
      // NOT startRoomCompositeEgress(requestObject)
      console.log(`[RecordingService] Calling LiveKit egress API at: ${config.livekit.httpUrl}`);
      console.log(`[RecordingService] Room name: ${roomName}, File path: ${fileName}`);
      
      let egress;
      try {
        // Correct method signature: startRoomCompositeEgress(roomName, options)
        egress = await this.egressClient.startRoomCompositeEgress(
          roomName,   // FIRST PARAM: room name as string
          {
            audioOnly: true,
            file: {
              filepath: fileName,
              s3: {
                accessKey: config.r2.accessKeyId,
                secret: config.r2.secretAccessKey,
                region: config.r2.region || 'auto',
                endpoint: config.r2.endpoint,
                bucket: config.r2.bucket,
                forcePathStyle: true, // Required for R2 compatibility
              },
            },
          }
        );
      } catch (egressError) {
        console.error(`[RecordingService] Egress API call failed:`, {
          message: egressError.message,
          name: egressError.name,
          code: egressError.code,
          status: egressError.status,
          statusCode: egressError.statusCode,
          response: egressError.response ? (typeof egressError.response === 'string' ? egressError.response : JSON.stringify(egressError.response, null, 2)) : undefined,
          stack: egressError.stack,
        });
        throw egressError;
      }
      
      const egressId = egress.egressId;
      console.log(`[RecordingService] Recording started with egress ID: ${egressId}`);
      
      // Update session
      sessionService.setRecording(sessionId, egressId);
      
      return egressId;
    } catch (error) {
      console.error(`[RecordingService] Error starting recording:`, error);
      console.error(`[RecordingService] Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
        status: error.status,
        response: error.response ? (typeof error.response === 'string' ? error.response : JSON.stringify(error.response)) : undefined,
      });
      // Re-throw with more context
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  /**
   * Stop recording
   * @param {string} egressId - The egress ID to stop
   * @returns {Promise<void>}
   */
  async stopRecording(egressId) {
    try {
      console.log(`[RecordingService] Stopping recording: ${egressId}`);
      await this.egressClient.stopEgress(egressId);
      console.log(`[RecordingService] Recording stopped: ${egressId}`);
    } catch (error) {
      console.error(`[RecordingService] Error stopping recording:`, error);
      // Don't throw - recording might have already stopped
      console.warn(`[RecordingService] Continuing despite stop error`);
    }
  }

  /**
   * Get recording status
   * @param {string} egressId
   * @returns {Promise<Object>}
   */
  async getRecordingStatus(egressId) {
    try {
      const egress = await this.egressClient.listEgress([egressId]);
      return egress.length > 0 ? egress[0] : null;
    } catch (error) {
      console.error(`[RecordingService] Error getting recording status:`, error);
      return null;
    }
  }

  /**
   * Handle recording completion (called from webhook)
   * @param {string} egressId
   * @param {Object} egressInfo
   */
  async handleRecordingComplete(egressId, egressInfo) {
    try {
      console.log(`[RecordingService] Recording completed: ${egressId}`);

      // Find session by egress ID
      const sessions = sessionService.getAllSessions();
      const session = sessions.find(s => s.recordingEgressId === egressId);

      if (!session) {
        console.warn(`[RecordingService] No session found for egress ID: ${egressId}`);
        return;
      }

      // Extract file URL from egress info
      let fileUrl = null;
      if (egressInfo.file) {
        // Try different possible property names for the filename
        const fileName = egressInfo.file.filename || egressInfo.file.filepath || egressInfo.file.location;
        if (fileName && config.r2.bucket) {
          // Construct R2 public URL or use the file path
          // Adjust based on your R2 public URL structure
          fileUrl = `https://${config.r2.bucket}.r2.cloudflarestorage.com/${fileName}`;
          // Or use your custom domain if configured:
          // fileUrl = `https://your-custom-domain.com/${fileName}`;
        } else if (egressInfo.file.url) {
          // If LiveKit provides a direct URL, use it
          fileUrl = egressInfo.file.url;
        }
      }

      // Calculate duration
      const startedAt = session.recordingStartedAt || new Date();
      const endedAt = new Date();
      const duration = Math.floor((endedAt - startedAt) / 1000); // Duration in seconds

      // Store recording metadata
      await recordingStorage.saveRecording({
        sessionId: session.sessionId,
        startedAt: startedAt,
        endedAt: endedAt,
        duration: duration,
        r2FileUrl: fileUrl,
        egressId: egressId,
      });

      // Clear recording status from session
      sessionService.clearRecording(session.sessionId);

      console.log(`[RecordingService] Recording metadata saved for session: ${session.sessionId}`);
    } catch (error) {
      console.error(`[RecordingService] Error handling recording completion:`, error);
    }
  }
}

module.exports = new RecordingService();

//testing to push and deploy
