// Session Management Routes

const express = require('express');
const router = express.Router();
const sessionService = require('../services/sessionService');
const tokenService = require('../services/tokenService');

/**
 * POST /api/sessions/create
 * Create a new session
 */
router.post('/create', (req, res) => {
  try {
    const session = sessionService.createSession();
    res.json({
      success: true,
      sessionId: session.sessionId,
      shareableLink: `${req.protocol}://${req.get('host')}?sessionId=${session.sessionId}`,
    });
  } catch (error) {
    console.error('[Sessions] Error creating session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/sessions/:sessionId/join
 * Generate token for joining a session
 */
router.post('/:sessionId/join', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { identity } = req.body;

    // Check if session exists, create if it doesn't (for flexibility)
    let session = sessionService.getSession(sessionId);
    if (!session) {
      // Auto-create session if it doesn't exist
      session = sessionService.createSession();
      // Override with requested sessionId if it's valid format
      if (sessionId && /^[A-Z0-9]{8,10}$/.test(sessionId)) {
        sessionService.sessions.delete(session.sessionId);
        session.sessionId = sessionId;
        session.roomName = sessionId;
        sessionService.sessions.set(sessionId, session);
      } else {
        res.status(400).json({ success: false, error: 'Invalid session ID format' });
        return;
      }
    }

    // Generate token
    const tokenData = await tokenService.generateToken(session.roomName, identity);

    res.json({
      success: true,
      token: tokenData.token,
      url: tokenData.url,
      identity: tokenData.identity,
      roomName: session.roomName,
      sessionId: session.sessionId,
    });
  } catch (error) {
    console.error('[Sessions] Error joining session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sessions/:sessionId
 * Get session information
 */
router.get('/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessionService.getSession(sessionId);

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        participantCount: session.participants.length,
        isRecording: session.isRecording,
      },
    });
  } catch (error) {
    console.error('[Sessions] Error getting session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
