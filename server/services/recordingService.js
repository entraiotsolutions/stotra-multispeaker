// Recording Service - Handles LiveKit Egress API for recording

const { 
  RoomServiceClient, 
  EgressClient,
  EncodedFileOutput,
  S3Upload
} = require('livekit-server-sdk');
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
   * Start recording a room (audio-only, M4A)
   * Uses RoomCompositeEgress to record the entire room
   * Based on official LiveKit examples from Slack
   * 
   * NOTE: Requires PulseAudio to be installed on the LiveKit server for audio-only recording
   * 
   * @param {string} roomName - The room name to record
   * @param {string} sessionId - The session ID
   * @returns {Promise<string>} Egress ID
   */
  async startRecording(roomName, sessionId) {
    try {
      console.log(`Starting recording for room: ${roomName}, session: ${sessionId}`);
      console.log(`[RecordingService] LiveKit HTTP URL: ${config.livekit.httpUrl}`);
      console.log(`[RecordingService] LiveKit WebSocket URL: ${config.livekit.url}`);

      // Validate R2 configuration
      if (!config.r2.accessKeyId || !config.r2.secretAccessKey || !config.r2.bucket || !config.r2.endpoint) {
        throw new Error('R2 configuration is missing. Please set R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, and R2_ENDPOINT environment variables.');
      }

      // Verify room exists and has participants (RoomCompositeEgress REQUIRES active participants)
      let participants = [];
      try {
        participants = await this.roomService.listParticipants(roomName);
        console.log(`[RecordingService] Room ${roomName} has ${participants?.length || 0} participants`);
        
        if (!participants || participants.length === 0) {
          throw new Error(`Room ${roomName} has no participants. RoomCompositeEgress requires at least one active participant in the room. Please ensure participants have joined the room before starting recording.`);
        }
        
        // Check if any participant is publishing audio
        const hasAudio = participants.some(p => {
          const tracks = p.tracks || [];
          return tracks.some(t => t.type === 0 && !t.muted); // AUDIO type = 0
        });
        
        if (!hasAudio) {
          console.warn(`[RecordingService] ⚠️ WARNING: No active audio tracks found in room ${roomName}. Recording may produce empty files or fail.`);
          console.warn(`[RecordingService] Participants: ${participants.map(p => `${p.identity} (${p.tracks?.length || 0} tracks)`).join(', ')}`);
        } else {
          console.log(`[RecordingService] ✅ Room has ${participants.length} participant(s) with active audio tracks. Ready to record.`);
        }
        
        // Add a small delay to ensure participants are fully connected
        // RoomCompositeEgress needs participants to be fully established before it can connect
        console.log(`[RecordingService] Waiting 2 seconds for participants to fully establish connection...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (roomError) {
        // If it's our custom error about no participants, throw it
        if (roomError.message && roomError.message.includes('no participants')) {
          throw roomError;
        }
        // Otherwise, it might be a connectivity issue
        console.error(`[RecordingService] ❌ ERROR: Could not verify room participants: ${roomError.message}`);
        console.error(`[RecordingService] This might indicate the LiveKit server is not accessible at ${config.livekit.httpUrl}`);
        throw new Error(`Failed to connect to LiveKit room ${roomName}. Please verify the LiveKit server is running and accessible. Error: ${roomError.message}`);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      // Use .m4a for audio-only recording (AAC encoding)
      // Files are saved to the 'audios' directory in R2
      const fileName = `audios/${sessionId}/${sessionId}-${timestamp}.m4a`;

      // Create S3Upload instance for R2 (S3-compatible)
      const s3Upload = new S3Upload({
        accessKey: config.r2.accessKeyId,
        secret: config.r2.secretAccessKey,
        region: config.r2.region || 'auto',
        bucket: config.r2.bucket,
        endpoint: config.r2.endpoint,
        forcePathStyle: true,
      });

      // Create EncodedFileOutput with S3Upload in output.case structure
      const fileOutput = new EncodedFileOutput({
        filepath: fileName,
        output: {
          case: 's3',
          value: s3Upload,
        },
      });

      console.log("Starting room composite egress with audio-only layout...");
      console.log(`[RecordingService] ⚠️ IMPORTANT: Ensure your egress.yaml file has ws_url matching: ${config.livekit.url}`);
      console.log(`[RecordingService] If egress.yaml uses ws://127.0.0.1:7880 but your server is at ${config.livekit.url}, update egress.yaml and restart the egress container.`);

      // Use the correct method signature: startRoomCompositeEgress(roomName, { file }, { layout })
      // This matches the official LiveKit examples
      const info = await this.egressClient.startRoomCompositeEgress(
        roomName,
        { file: fileOutput },
        { layout: 'audio-only' }
      );

      console.log("✅ Egress started with ID:", info.egressId);

      sessionService.setRecording(sessionId, info.egressId);

      return info.egressId;
    } catch (error) {
      console.error("START RECORDING ERROR:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      
      // Provide helpful error messages for common issues
      if (error.message && error.message.includes('pulse')) {
        throw new Error(`Failed to start recording: PulseAudio is not available on the LiveKit egress service. Audio-only RoomCompositeEgress requires PulseAudio to be installed and running in the egress container. Error: ${error.message}`);
      }
      
      if (error.message && (error.message.includes('Start signal not received') || error.message.includes('connection') || error.message.includes('timeout'))) {
        throw new Error(`Failed to start recording: The egress service cannot connect to the LiveKit room. This usually means: (1) No participants are in the room, (2) The LiveKit server is not accessible from the egress container, or (3) The WebSocket connection failed. Please verify participants are in the room and the LiveKit server is running. Error: ${error.message}`);
      }
      
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  /**
   * Helper to normalize status (handles both enum numbers and strings)
   * LiveKit SDK enum values (based on protobuf EgressStatus):
   * 0 = EGRESS_STARTING
   * 1 = EGRESS_ACTIVE
   * 2 = EGRESS_ENDING
   * 3 = EGRESS_COMPLETE
   * 4 = EGRESS_FAILED
   * 5 = EGRESS_ABORTED
   */
  normalizeStatus(status) {
    if (typeof status === 'number') {
      const statusMap = {
        0: 'EGRESS_STARTING',
        1: 'EGRESS_ACTIVE',
        2: 'EGRESS_ENDING',
        3: 'EGRESS_COMPLETE',
        4: 'EGRESS_FAILED',
        5: 'EGRESS_ABORTED',
      };
      return statusMap[status] || `UNKNOWN_${status}`;
    }
    return status;
  }

  /**
   * Stop recording
   * @param {string} egressId - The egress ID to stop
   * @returns {Promise<void>}
   */
  async stopRecording(egressId) {
    try {
      console.log(`[RecordingService] Stopping recording: ${egressId}`);
      
      // Check egress status first
      const egressList = await this.egressClient.listEgress([egressId]);
      if (egressList.length === 0) {
        console.warn(`[RecordingService] Egress ${egressId} not found`);
        return;
      }
      
      const egress = egressList[0];
      const rawStatus = egress.status;
      const status = this.normalizeStatus(rawStatus);
      
      console.log(`[RecordingService] Current egress status: ${rawStatus} (${status})`);
      
      // Handle different statuses - check failed/aborted FIRST before trying to stop
      if (status === 'EGRESS_FAILED' || status === 'EGRESS_ABORTED') {
        console.warn(`[RecordingService] ⚠️ Egress has ${status}. Cannot stop a failed/aborted egress.`);
        console.warn(`[RecordingService] Error info:`, egress.error || egress.errorReason || 'No error details available');
        
        // Handle the failed recording immediately
        await this.handleRecordingComplete(egressId, egress);
        return;
      }
      
      if (status === 'EGRESS_COMPLETE' || status === 'EGRESS_ENDING') {
        console.log(`[RecordingService] Egress is already ${status === 'EGRESS_COMPLETE' ? 'complete' : 'ending'}. File should be processing.`);
        return;
      }
      
      if (status === 'EGRESS_ACTIVE' || status === 'EGRESS_STARTING') {
        console.log(`[RecordingService] Stopping active egress...`);
        await this.egressClient.stopEgress(egressId);
        console.log(`[RecordingService] ✅ Recording stop command sent successfully`);
        console.log(`[RecordingService] LiveKit is now finalizing the file and uploading to R2`);
        console.log(`[RecordingService] You will receive an 'egress_ended' webhook when the file is saved`);
      } else {
        console.log(`[RecordingService] Egress is in unknown status: ${status} (${rawStatus}). Attempting to stop anyway...`);
        // Try to stop anyway if status is unknown
        try {
          await this.egressClient.stopEgress(egressId);
          console.log(`[RecordingService] ✅ Stop command sent for status ${status}`);
        } catch (stopError) {
          console.warn(`[RecordingService] Could not stop egress with status ${status}:`, stopError.message);
          // If it failed, check if it's actually a failed egress
          if (stopError.status === 412 || stopError.code === 'failed_precondition') {
            console.warn(`[RecordingService] Egress cannot be stopped. It may have already failed.`);
          }
        }
      }
    } catch (error) {
      console.error(`[RecordingService] Error stopping recording:`, error);
      
      // If it's a "cannot be stopped" error, the egress likely already failed
      if (error.status === 412 || error.code === 'failed_precondition') {
        console.warn(`[RecordingService] Egress cannot be stopped (likely already failed). Checking status...`);
        try {
          const egressList = await this.egressClient.listEgress([egressId]);
          if (egressList.length > 0) {
            const egress = egressList[0];
            const status = this.normalizeStatus(egress.status);
            console.warn(`[RecordingService] Egress status: ${egress.status} (${status})`);
            if (status === 'EGRESS_FAILED' || status === 'EGRESS_ABORTED') {
              console.warn(`[RecordingService] Egress failed. Error: ${egress.error || 'Unknown error'}`);
              // Try to handle the failed recording
              await this.handleRecordingComplete(egressId, egress);
            }
          }
        } catch (statusError) {
          console.error(`[RecordingService] Error checking egress status:`, statusError);
        }
      }
      
      // Don't throw - recording might have already stopped or failed
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
      const rawStatus = egressInfo.status || egressInfo.egressStatus;
      const status = this.normalizeStatus(rawStatus);
      const isFailed = status === 'EGRESS_FAILED' || status === 'EGRESS_ABORTED';
      
      if (isFailed) {
        console.warn(`[RecordingService] ⚠️ Recording failed: ${egressId}`);
        console.warn(`[RecordingService] Status: ${status}`);
        console.warn(`[RecordingService] Error: ${egressInfo.error || egressInfo.errorReason || 'Unknown error'}`);
      } else {
        console.log(`[RecordingService] Recording completed: ${egressId}`);
      }
      
      console.log(`[RecordingService] Egress info:`, JSON.stringify(egressInfo, null, 2));

      // Find session by egress ID
      const sessions = sessionService.getAllSessions();
      const session = sessions.find(s => s.recordingEgressId === egressId);

      if (!session) {
        console.warn(`[RecordingService] No session found for egress ID: ${egressId}`);
        return;
      }

      // Extract file information from egress info
      // LiveKit automatically uploads the file to R2 when egress ends
      let fileUrl = null;
      let fileName = null;
      
      // Check different possible structures for file info
      if (egressInfo.file) {
        fileName = egressInfo.file.filename || egressInfo.file.filepath || egressInfo.file.location || egressInfo.file.name;
        
        if (fileName) {
          console.log(`[RecordingService] File name from egress: ${fileName}`);
          
          // If LiveKit provides a direct URL, use it
          if (egressInfo.file.url) {
            fileUrl = egressInfo.file.url;
            console.log(`[RecordingService] Using direct URL from LiveKit: ${fileUrl}`);
          } else if (config.r2.bucket && config.r2.endpoint) {
            // Construct R2 URL based on your R2 configuration
            // R2 files are accessible via: https://<bucket>.<account-id>.r2.cloudflarestorage.com/<filepath>
            // Or via custom domain if configured
            const r2Domain = config.r2.endpoint.replace('https://', '').replace('http://', '').split('/')[0];
            fileUrl = `https://${config.r2.bucket}.${r2Domain}/${fileName}`;
            console.log(`[RecordingService] Constructed R2 URL: ${fileUrl}`);
          }
        }
      }
      
      // Also check stream info (for stream-based egress)
      if (!fileUrl && egressInfo.stream) {
        console.log(`[RecordingService] Stream info found (not file-based egress)`);
      }

      // Calculate duration
      const startedAt = session.recordingStartedAt || new Date();
      const endedAt = new Date();
      const duration = Math.floor((endedAt - startedAt) / 1000); // Duration in seconds

      // Store recording metadata (even for failed recordings)
      const recordingData = {
        sessionId: session.sessionId,
        startedAt: startedAt,
        endedAt: endedAt,
        duration: duration,
        r2FileUrl: fileUrl,
        r2FileName: fileName,
        egressId: egressId,
        status: status,
        error: isFailed ? (egressInfo.error || egressInfo.errorReason || 'Unknown error') : null,
      };
      
      const savedRecording = await recordingStorage.saveRecording(recordingData);

      // Clear recording status from session (even if failed)
      sessionService.clearRecording(session.sessionId);

      if (isFailed) {
        console.log(`[RecordingService] ⚠️ Recording failed - metadata saved`);
        console.log(`[RecordingService] Session: ${session.sessionId}`);
        console.log(`[RecordingService] Error: ${recordingData.error}`);
        console.log(`[RecordingService] Status: ${status}`);
      } else {
        console.log(`[RecordingService] ✅ Recording saved to R2!`);
        console.log(`[RecordingService] Session: ${session.sessionId}`);
        console.log(`[RecordingService] File: ${fileName || 'unknown'}`);
        console.log(`[RecordingService] URL: ${fileUrl || 'N/A'}`);
        console.log(`[RecordingService] Duration: ${duration} seconds`);
      }
      console.log(`[RecordingService] Recording metadata saved with ID: ${savedRecording.id}`);
    } catch (error) {
      console.error(`[RecordingService] Error handling recording completion:`, error);
      console.error(`[RecordingService] Error stack:`, error.stack);
    }
  }
}

module.exports = new RecordingService();

//testing to push and deploy
