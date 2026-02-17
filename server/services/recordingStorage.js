// Recording Metadata Storage
// In-memory storage (can be replaced with database)

class RecordingStorage {
  constructor() {
    // In-memory storage for recordings
    // In production, replace with a proper database (PostgreSQL, MongoDB, etc.)
    this.recordings = new Map();
  }

  /**
   * Save recording metadata
   * @param {Object} recordingData
   * @returns {Promise<Object>} Saved recording
   */
  async saveRecording(recordingData) {
    const recording = {
      id: recordingData.sessionId + '-' + Date.now(),
      sessionId: recordingData.sessionId,
      startedAt: recordingData.startedAt,
      endedAt: recordingData.endedAt,
      duration: recordingData.duration, // in seconds
      r2FileUrl: recordingData.r2FileUrl,
      egressId: recordingData.egressId,
      createdAt: new Date(),
    };

    this.recordings.set(recording.id, recording);
    console.log(`[RecordingStorage] Saved recording: ${recording.id}`);
    return recording;
  }

  /**
   * Get recording by session ID
   * @param {string} sessionId
   * @returns {Promise<Array>} Array of recordings for the session
   */
  async getRecordingsBySession(sessionId) {
    const allRecordings = Array.from(this.recordings.values());
    return allRecordings.filter(r => r.sessionId === sessionId);
  }

  /**
   * Get recording by ID
   * @param {string} recordingId
   * @returns {Promise<Object|null>}
   */
  async getRecording(recordingId) {
    return this.recordings.get(recordingId) || null;
  }

  /**
   * Get all recordings
   * @returns {Promise<Array>}
   */
  async getAllRecordings() {
    return Array.from(this.recordings.values());
  }

  /**
   * Delete recording
   * @param {string} recordingId
   */
  async deleteRecording(recordingId) {
    this.recordings.delete(recordingId);
    console.log(`[RecordingStorage] Deleted recording: ${recordingId}`);
  }
}

module.exports = new RecordingStorage();
