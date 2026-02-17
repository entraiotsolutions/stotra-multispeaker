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
  const session = sessionService.getSession(roomName);
  
  if (!session) {
    console.log(`[Webhooks] No session found for room: ${roomName}`);
    return;
  }

  // Add participant to session
  sessionService.addParticipant(roomName, participant.identity);

  // Get current participant count
  const participantCount = sessionService.getParticipantCount(roomName);

  console.log(`[Webhooks] Participant ${participant.identity} joined room ${roomName}. Total participants: ${participantCount}`);

  // Start recording if this is the first participant
  if (participantCount === 1 && !session.isRecording) {
    try {
      console.log(`[Webhooks] First participant joined, starting recording for session: ${roomName}`);
      await recordingService.startRecording(roomName, roomName);
    } catch (error) {
      console.error(`[Webhooks] Error starting recording:`, error);
    }
  }
}

/**
 * Handle participant left event
 */
async function handleParticipantLeft(event) {
  const { room, participant } = event;
  const roomName = room.name;
  
  // Try to find session by room name
  const session = sessionService.getSession(roomName);
  
  if (!session) {
    console.log(`[Webhooks] No session found for room: ${roomName}`);
    return;
  }

  // Remove participant from session
  sessionService.removeParticipant(roomName, participant.identity);

  // Get current participant count
  const participantCount = sessionService.getParticipantCount(roomName);

  console.log(`[Webhooks] Participant ${participant.identity} left room ${roomName}. Remaining participants: ${participantCount}`);

  // Stop recording if this was the last participant
  if (participantCount === 0 && session.isRecording && session.recordingEgressId) {
    try {
      console.log(`[Webhooks] Last participant left, stopping recording for session: ${roomName}`);
      await recordingService.stopRecording(session.recordingEgressId);
      // Note: Recording completion will be handled by egress_ended event
    } catch (error) {
      console.error(`[Webhooks] Error stopping recording:`, error);
    }
  }
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

  // Handle recording completion
  await recordingService.handleRecordingComplete(egress.egressId, egress);
}

module.exports = router;
