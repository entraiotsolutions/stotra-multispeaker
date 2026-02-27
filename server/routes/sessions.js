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
    const { creatorIdentity } = req.body; // Optional: identity of the creator
    const session = sessionService.createSession(creatorIdentity);
    res.json({
      success: true,
      sessionId: session.sessionId,
      creatorIdentity: session.creatorIdentity,
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
      // Validate sessionId format - accept alphanumeric with hyphens (for room names like project-xxx-task-yyy)
      // Also accept the original 8-10 character format for backward compatibility
      const isValidFormat = sessionId && (
        /^[A-Z0-9]{8,10}$/.test(sessionId) || // Original format: 8-10 uppercase alphanumeric
        /^[a-zA-Z0-9\-_]{3,100}$/.test(sessionId) // New format: alphanumeric with hyphens/underscores, 3-100 chars
      );
      
      if (!isValidFormat) {
        res.status(400).json({ 
          success: false, 
          error: 'Invalid session ID format. Must be 8-10 uppercase alphanumeric characters, or 3-100 alphanumeric characters with hyphens/underscores.' 
        });
        return;
      }
      
      // Auto-create session if it doesn't exist
      session = sessionService.createOrGetSession(sessionId, identity);
    }

    // Generate token
    const tokenData = await tokenService.generateToken(session.roomName, identity);
    
    // If session has no participants yet and has a temporary creator identity, update it to the actual token identity
    // This ensures the first person to join becomes the creator
    if (session.participants.length === 0 && (!session.creatorIdentity || session.creatorIdentity.startsWith('creator-'))) {
      session.creatorIdentity = tokenData.identity;
      console.log(`[Sessions] Updated creator identity for session ${sessionId} to ${tokenData.identity}`);
    }

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
        creatorIdentity: session.creatorIdentity,
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
