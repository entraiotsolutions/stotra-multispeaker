// Recording Service - Handles LiveKit Egress API for recording

const { 
  RoomServiceClient, 
  EgressClient, 
  EncodedFileOutput, 
  TrackCompositeEgressRequest 
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
   * Start recording a room (audio only, MP3)
   * Uses TrackCompositeEgressRequest - works on 2 CPU (no Chromium/PulseAudio needed)
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

      // Fetch participants to get the actual audio track name
      console.log(`[RecordingService] Fetching participants for room: ${roomName}`);
      const participants = await this.roomService.listParticipants(roomName);
      
      if (!participants || participants.length === 0) {
        throw new Error(`No participants found in room ${roomName}. Please ensure participants have joined and are publishing audio.`);
      }

      // Find the first active audio track using flatMap as per user's example
      const audioTrack = participants
        .flatMap(p => p.tracks || [])
        .find(t => t.type === 'AUDIO' && t.state === 'ACTIVE');

      if (!audioTrack || !audioTrack.name) {
        // Log participant structure for debugging
        console.log(`[RecordingService] Available participants:`, participants.length);
        console.log(`[RecordingService] Participant tracks:`, participants.map(p => ({
          identity: p.identity,
          tracksCount: p.tracks?.length || 0,
          tracks: p.tracks?.map(t => ({ name: t.name, type: t.type, state: t.state })) || [],
        })));
        throw new Error(`No active audio track found in room ${roomName}. Please ensure participants are publishing audio tracks.`);
      }

      const audioTrackName = audioTrack.name;
      console.log(`[RecordingService] Found audio track: ${audioTrackName}`);

      // Generate R2 file path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `recordings/${sessionId}/${sessionId}-${timestamp}.mp3`;

      console.log(`[RecordingService] Calling LiveKit egress API at: ${config.livekit.httpUrl}`);
      console.log(`[RecordingService] Room name: ${roomName}, Audio track: ${audioTrackName}, File path: ${fileName}`);
      
      // Create request with correct structure for TrackCompositeEgress
      // Use plain object with output.file structure (not file_outputs)
      const request = {
        roomName: roomName,
        audioTrackName: audioTrackName, // MUST be defined - fetched from participants
        output: {
          file: {
            fileType: 'MP3',
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
        },
      };

      console.log(`[RecordingService] Request structure:`, {
        roomName: request.roomName,
        audioTrackName: request.audioTrackName,
        hasOutput: !!request.output,
        hasFile: !!(request.output && request.output.file),
        filepath: request.output?.file?.filepath,
      });

      // Start track composite egress (no Chromium/PulseAudio needed - works on 2 CPU)
      const egress = await this.egressClient.startTrackCompositeEgress(request);
      
      const egressId = egress.egressId;
      console.log(`[RecordingService] ✅ Recording started with egress ID: ${egressId}`);
      console.log(`[RecordingService] Using TrackCompositeEgress (lightweight, no Chromium)`);
      
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
      
      // Check egress status first
      const egressList = await this.egressClient.listEgress([egressId]);
      if (egressList.length === 0) {
        console.warn(`[RecordingService] Egress ${egressId} not found`);
        return;
      }
      
      const egress = egressList[0];
      const status = egress.status;
      
      console.log(`[RecordingService] Current egress status: ${status}`);
      
      // Handle different statuses
      if (status === 'EGRESS_COMPLETE' || status === 'EGRESS_ENDING') {
        console.log(`[RecordingService] Egress is already ${status === 'EGRESS_COMPLETE' ? 'complete' : 'ending'}. File should be processing.`);
        return;
      }
      
      if (status === 'EGRESS_FAILED' || status === 'EGRESS_ABORTED') {
        console.warn(`[RecordingService] ⚠️ Egress has ${status}. Cannot stop a failed/aborted egress.`);
        console.warn(`[RecordingService] Error info:`, egress.error || 'No error details available');
        
        // Still try to handle the failed recording
        await this.handleRecordingComplete(egressId, egress);
        return;
      }
      
      if (status === 'EGRESS_ACTIVE' || status === 'EGRESS_STARTING') {
        console.log(`[RecordingService] Stopping active egress...`);
        await this.egressClient.stopEgress(egressId);
        console.log(`[RecordingService] ✅ Recording stop command sent successfully`);
        console.log(`[RecordingService] LiveKit is now finalizing the file and uploading to R2`);
        console.log(`[RecordingService] You will receive an 'egress_ended' webhook when the file is saved`);
      } else {
        console.log(`[RecordingService] Egress is in status: ${status}. No action needed.`);
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
            console.warn(`[RecordingService] Egress status: ${egress.status}`);
            if (egress.status === 'EGRESS_FAILED') {
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
      const status = egressInfo.status || egressInfo.egressStatus;
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
