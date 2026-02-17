// Recording Routes

const express = require('express');
const router = express.Router();
const recordingStorage = require('../services/recordingStorage');

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

module.exports = router;
