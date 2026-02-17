// Session Management Service
// In-memory storage (can be replaced with database)

class SessionService {
  constructor() {
    // In-memory storage for sessions
    // In production, replace with a proper database (PostgreSQL, MongoDB, etc.)
    this.sessions = new Map();
  }

  /**
   * Generate a random session ID (8-10 characters)
   */
  generateSessionId() {
    const config = require('../config');
    const { idLength, idChars } = config.session;
    let sessionId = '';
    for (let i = 0; i < idLength; i++) {
      sessionId += idChars.charAt(Math.floor(Math.random() * idChars.length));
    }
    return sessionId;
  }

  /**
   * Create a new session
   * @returns {Object} Session object
   */
  createSession() {
    const sessionId = this.generateSessionId();
    const session = {
      sessionId,
      roomName: sessionId, // Use sessionId as room name
      createdAt: new Date(),
      participants: [],
      isRecording: false,
      recordingEgressId: null,
      recordingStartedAt: null,
    };

    this.sessions.set(sessionId, session);
    console.log(`[SessionService] Created session: ${sessionId}`);
    return session;
  }

  /**
   * Get session by ID
   * @param {string} sessionId
   * @returns {Object|null} Session object or null if not found
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Check if session exists
   * @param {string} sessionId
   * @returns {boolean}
   */
  sessionExists(sessionId) {
    return this.sessions.has(sessionId);
  }

  /**
   * Add participant to session
   * @param {string} sessionId
   * @param {string} participantIdentity
   */
  addParticipant(sessionId, participantIdentity) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.participants.includes(participantIdentity)) {
      session.participants.push(participantIdentity);
      console.log(`[SessionService] Added participant ${participantIdentity} to session ${sessionId}`);
    }

    return session;
  }

  /**
   * Remove participant from session
   * @param {string} sessionId
   * @param {string} participantIdentity
   */
  removeParticipant(sessionId, participantIdentity) {
    const session = this.getSession(sessionId);
    if (!session) {
      console.warn(`[SessionService] Session ${sessionId} not found when removing participant`);
      return null;
    }

    session.participants = session.participants.filter(p => p !== participantIdentity);
    console.log(`[SessionService] Removed participant ${participantIdentity} from session ${sessionId}`);

    return session;
  }

  /**
   * Get participant count for a session
   * @param {string} sessionId
   * @returns {number}
   */
  getParticipantCount(sessionId) {
    const session = this.getSession(sessionId);
    return session ? session.participants.length : 0;
  }

  /**
   * Mark session as recording
   * @param {string} sessionId
   * @param {string} egressId
   */
  setRecording(sessionId, egressId) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.isRecording = true;
    session.recordingEgressId = egressId;
    session.recordingStartedAt = new Date();
    console.log(`[SessionService] Started recording for session ${sessionId}, egress: ${egressId}`);
  }

  /**
   * Mark session as not recording
   * @param {string} sessionId
   */
  clearRecording(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      console.warn(`[SessionService] Session ${sessionId} not found when clearing recording`);
      return;
    }

    session.isRecording = false;
    session.recordingEgressId = null;
    console.log(`[SessionService] Stopped recording for session ${sessionId}`);
  }

  /**
   * Delete session (cleanup)
   * @param {string} sessionId
   */
  deleteSession(sessionId) {
    this.sessions.delete(sessionId);
    console.log(`[SessionService] Deleted session: ${sessionId}`);
  }

  /**
   * Get all sessions (for debugging/admin)
   * @returns {Array}
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }
}

// Singleton instance
module.exports = new SessionService();
