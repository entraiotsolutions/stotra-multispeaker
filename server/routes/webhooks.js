// LiveKit Webhook Handler
// Handles participant join/leave events to trigger recording

const express = require('express');
const router = express.Router();
const sessionService = require('../services/sessionService');
const recordingService = require('../services/recordingService');
const config = require('../config');

/**
 * POST /api/webhooks/livekit
 * Handle LiveKit webhook events
 */
router.post('/livekit', async (req, res) => {
  try {
    // Verify webhook secret (basic security)
    const webhookSecret = req.headers['authorization'];
    if (webhookSecret !== `Bearer ${config.server.webhookSecret}`) {
      console.warn('[Webhooks] Unauthorized webhook request');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const event = req.body;
    console.log(`[Webhooks] Received event: ${event.event}`);

    // Handle different event types
    switch (event.event) {
      case 'participant_joined':
        await handleParticipantJoined(event);
        break;

      case 'participant_left':
        await handleParticipantLeft(event);
        break;

      case 'egress_ended':
        await handleEgressEnded(event);
        break;

      case 'egress_started':
        await handleEgressStarted(event);
        break;

      case 'egress_failed':
        // Handle failed egress (may also be sent as egress_ended with failed status)
        await handleEgressEnded(event);
        break;

      default:
        console.log(`[Webhooks] Unhandled event type: ${event.event}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Webhooks] Error handling webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle participant joined event
 */
async function handleParticipantJoined(event) {
  const { room, participant } = event;
  const roomName = room.name;
  
  // Try to find session by room name (sessionId = roomName)
  // Auto-create session if it doesn't exist (ensures recording always works)
  const session = sessionService.createOrGetSession(roomName);

  // Add participant to session
  sessionService.addParticipant(roomName, participant.identity);

  // Get current participant count
  const participantCount = sessionService.getParticipantCount(roomName);

  console.log(`[Webhooks] Participant ${participant.identity} joined room ${roomName}. Total participants: ${participantCount}`);

  // Note: Recording is now manually controlled via API endpoints
  // Auto-recording has been disabled in favor of manual start/stop buttons
}

/**
 * Handle participant left event
 */
async function handleParticipantLeft(event) {
  const { room, participant } = event;
  const roomName = room.name;
  
  // Try to find session by room name (auto-create if needed for consistency)
  const session = sessionService.createOrGetSession(roomName);

  // Remove participant from session
  sessionService.removeParticipant(roomName, participant.identity);

  // Get current participant count
  const participantCount = sessionService.getParticipantCount(roomName);

  console.log(`[Webhooks] Participant ${participant.identity} left room ${roomName}. Remaining participants: ${participantCount}`);

  // Note: Recording stop is now manually controlled via API endpoints
  // Auto-stop has been disabled in favor of manual stop button
}

/**
 * Handle egress started event
 */
async function handleEgressStarted(event) {
  const { egress } = event;
  console.log(`[Webhooks] Egress started: ${egress.egressId} for room: ${egress.roomName}`);
}

/**
 * Handle egress ended event (recording completed)
 */
async function handleEgressEnded(event) {
  const { egress } = event;
  console.log(`[Webhooks] Egress ended: ${egress.egressId} for room: ${egress.roomName}`);

  // Stop polling if it was started (webhook arrived first)
  recordingService.stopPollingForCompletion(egress.egressId);

  // Handle recording completion
  await recordingService.handleRecordingComplete(egress.egressId, egress);
}

module.exports = router;
