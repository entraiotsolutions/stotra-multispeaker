// Recording Service - Handles LiveKit Egress API for recording

const { RoomServiceClient, EgressClient } = require('livekit-server-sdk');
const config = require('../config');
const sessionService = require('./sessionService');
const r2Service = require('./r2Service');
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

      // Check if room exists
      const rooms = await this.roomService.listRooms([roomName]);
      if (rooms.length === 0) {
        throw new Error(`Room ${roomName} does not exist`);
      }

      // Generate R2 file path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `recordings/${sessionId}/${sessionId}-${timestamp}.mp3`;

      // Start Egress recording (audio only, MP3)
      // Using RoomCompositeEgressRequest format for audio-only recording
      const egressRequest = {
        roomName: roomName,
        layout: '', // Empty layout for audio-only
        audioOnly: true,
        audioCodec: 1, // MP3 = 1, OPUS = 2, AAC = 3
        file: {
          fileType: 1, // MP3 = 1
          filepath: fileName, // Path within bucket
          s3: {
            accessKey: config.r2.accessKeyId,
            secret: config.r2.secretAccessKey,
            region: config.r2.region,
            endpoint: config.r2.endpoint,
            bucket: config.r2.bucket,
            forcePathStyle: true, // Required for R2 compatibility
          },
        },
      };

      const egress = await this.egressClient.startRoomCompositeEgress(egressRequest);

      const egressId = egress.egressId;
      console.log(`[RecordingService] Recording started with egress ID: ${egressId}`);

      // Update session
      sessionService.setRecording(sessionId, egressId);

      return egressId;
    } catch (error) {
      console.error(`[RecordingService] Error starting recording:`, error);
      throw error;
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
      if (egressInfo.file && egressInfo.file.filename) {
        // Construct R2 public URL or use the file path
        // Adjust based on your R2 public URL structure
        const fileName = egressInfo.file.filename;
        fileUrl = `https://${config.r2.bucket}.r2.cloudflarestorage.com/${fileName}`;
        // Or use your custom domain if configured:
        // fileUrl = `https://your-custom-domain.com/${fileName}`;
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
