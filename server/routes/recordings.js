// Recording Routes

const express = require('express');
const router = express.Router();
const recordingStorage = require('../services/recordingStorage');
const recordingService = require('../services/recordingService');
const sessionService = require('../services/sessionService');

/**
 * GET /api/recordings/session/:sessionId
 * Get all recordings for a session
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const recordings = await recordingStorage.getRecordingsBySession(sessionId);

    res.json({
      success: true,
      recordings: recordings,
    });
  } catch (error) {
    console.error('[Recordings] Error getting recordings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/recordings/:recordingId
 * Get a specific recording
 */
router.get('/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params;
    const recording = await recordingStorage.getRecording(recordingId);

    if (!recording) {
      res.status(404).json({ success: false, error: 'Recording not found' });
      return;
    }

    res.json({
      success: true,
      recording: recording,
    });
  } catch (error) {
    console.error('[Recordings] Error getting recording:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/recordings
 * Get all recordings (admin/debugging)
 */
router.get('/', async (req, res) => {
  try {
    const recordings = await recordingStorage.getAllRecordings();
    res.json({
      success: true,
      recordings: recordings,
    });
  } catch (error) {
    console.error('[Recordings] Error getting all recordings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/recordings/session/:sessionId/start
 * Start recording for a session (manual control)
 */
router.post('/session/:sessionId/start', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { identity } = req.body; // Identity of the user requesting to start recording

    // Check if session exists
    const session = sessionService.getSession(sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    // Check if user is the creator
    if (!sessionService.isCreator(sessionId, identity)) {
      res.status(403).json({ success: false, error: 'Only the session creator can start recording' });
      return;
    }

    // Check if already recording
    if (session.isRecording) {
      res.status(400).json({ success: false, error: 'Recording is already in progress' });
      return;
    }

    // Start recording
    console.log(`[Recordings] Attempting to start recording for session: ${sessionId}, room: ${session.roomName}`);
    const egressId = await recordingService.startRecording(session.roomName, sessionId);

    res.json({
      success: true,
      egressId: egressId,
      message: 'Recording started successfully',
    });
  } catch (error) {
    console.error('[Recordings] Error starting recording:', error);
    console.error('[Recordings] Error name:', error.name);
    console.error('[Recordings] Error message:', error.message);
    console.error('[Recordings] Error stack:', error.stack);
    
    // Log additional error properties if they exist
    if (error.response) {
      console.error('[Recordings] Error response:', error.response);
    }
    if (error.status) {
      console.error('[Recordings] Error status:', error.status);
    }
    if (error.code) {
      console.error('[Recordings] Error code:', error.code);
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to start recording',
      errorType: error.name,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/recordings/session/:sessionId/stop
 * Stop recording for a session (manual control)
 */
router.post('/session/:sessionId/stop', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { identity } = req.body; // Identity of the user requesting to stop recording

    // Check if session exists
    const session = sessionService.getSession(sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    // Check if user is the creator
    if (!sessionService.isCreator(sessionId, identity)) {
      res.status(403).json({ success: false, error: 'Only the session creator can stop recording' });
      return;
    }

    // Check if recording is in progress
    if (!session.isRecording || !session.recordingEgressId) {
      res.status(400).json({ success: false, error: 'No recording in progress' });
      return;
    }

    // Stop recording
    await recordingService.stopRecording(session.recordingEgressId);

    // Mark session as not recording immediately (file processing continues in background)
    // The session will be fully cleared when the webhook fires
    sessionService.clearRecording(sessionId);

    res.json({
      success: true,
      message: 'Recording stopped successfully. File will be processed and stored.',
    });
  } catch (error) {
    console.error('[Recordings] Error stopping recording:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
