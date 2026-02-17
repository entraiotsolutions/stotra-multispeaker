//@ts-ignore
import E2EEWorker from 'livekit-client/e2ee-worker?worker';
import type {
  ChatMessage,
  RoomConnectOptions,
  RoomOptions,
  ScalabilityMode,
  SimulationScenario,
  VideoCaptureOptions,
  VideoCodec,
} from 'livekit-client';
import {
  BackupCodecPolicy,
  ConnectionQuality,
  ConnectionState,
  DisconnectReason,
  ExternalE2EEKeyProvider,
  LogLevel,
  MediaDeviceFailure,
  Participant,
  ParticipantEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  TrackPublication,
  VideoPresets,
  VideoQuality,
  createAudioAnalyser,
  isAudioTrack,
  isLocalParticipant,
  isLocalTrack,
  isRemoteParticipant,
  isRemoteTrack,
  setLogLevel,
  supportsAV1,
  supportsVP9,
} from 'livekit-client';
// Utility function
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

setLogLevel(LogLevel.debug);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  isFrontFacing: false,
  encoder: new TextEncoder(),
  decoder: new TextDecoder(),
  defaultDevices: new Map<MediaDeviceKind, string>([['audioinput', 'default']]),
  bitrateInterval: undefined as any,
  e2eeKeyProvider: new ExternalE2EEKeyProvider({ ratchetWindowSize: 100 }),
  chatMessages: new Map<string, { text: string; participant?: Participant }>(),
};
let currentRoom: Room | undefined;

let startTime: number;

let streamReaderAbortController: AbortController | undefined;

// Helper to get the LiveKit server URL
function getLiveKitUrl(): string {
  // Use environment variable if set (for production builds)
  if (import.meta.env.VITE_LIVEKIT_URL) {
    return import.meta.env.VITE_LIVEKIT_URL;
  }
  
  const hostname = window.location.hostname;
  // If accessing via localhost, use localhost. Otherwise use the same hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://localhost:7880';
  }
  // If accessing via network IP, use the same IP for LiveKit server
  return `ws://${hostname}:7880`;
}

const searchParams = new URLSearchParams(window.location.search);
const storedUrl = searchParams.get('url') ?? getLiveKitUrl();
const storedToken = searchParams.get('token') ?? '';
const storedSessionId = searchParams.get('sessionId') ?? '';
(<HTMLInputElement>$('url')).value = storedUrl;
(<HTMLInputElement>$('token')).value = storedToken;
(<HTMLInputElement>$('session-id')).value = storedSessionId;
let storedKey = searchParams.get('key');
if (!storedKey) {
  (<HTMLSelectElement>$('crypto-key')).value = 'password';
} else {
  (<HTMLSelectElement>$('crypto-key')).value = storedKey;
}

function generateSessionId(): string {
  // Generate a random session ID (8 characters, alphanumeric)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let sessionId = '';
  for (let i = 0; i < 8; i++) {
    sessionId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return sessionId;
}

function updateSearchParams(url: string, token: string, key: string, sessionId?: string) {
  const params = new URLSearchParams({ url, token, key });
  if (sessionId) {
    params.set('sessionId', sessionId);
  }
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

// handles actions from the HTML
const appActions = {
  createSession: async () => {
    try {
      const response = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.sessionId) {
        const newSessionId = data.sessionId;
        (<HTMLInputElement>$('session-id')).value = newSessionId;
        appendLog(`Created new session: ${newSessionId}`);
        appendLog(`Shareable link: ${data.shareableLink}`);
        
        // Update URL with session ID
        updateSearchParams(
          (<HTMLInputElement>$('url')).value,
          (<HTMLInputElement>$('token')).value,
          (<HTMLSelectElement>$('crypto-key')).value,
          newSessionId
        );
      } else {
        throw new Error('Failed to create session');
      }
    } catch (error: any) {
      appendLog('Failed to create session:', error.message);
      console.error('Session creation error:', error);
    }
  },

  generateSessionId: () => {
    const newSessionId = generateSessionId();
    (<HTMLInputElement>$('session-id')).value = newSessionId;
    appendLog(`Generated new session ID: ${newSessionId}`);
    updateSearchParams(
      (<HTMLInputElement>$('url')).value,
      (<HTMLInputElement>$('token')).value,
      (<HTMLSelectElement>$('crypto-key')).value,
      newSessionId
    );
  },

  generateToken: async () => {
    try {
      // Get session ID from input field
      const sessionIdInput = (<HTMLInputElement>$('session-id')).value.trim();

      if (!sessionIdInput) {
        appendLog('No session ID entered. Please create or enter a session ID.');
        return;
      }

      // Use new session join endpoint
      const response = await fetch(`/api/sessions/${sessionIdInput}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // identity is optional, will be auto-generated if not provided
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate token');
      }
      
      // If token server returned localhost but we're accessing from network IP, fix the URL
      let livekitUrl = data.url;
      const currentHostname = window.location.hostname;
      if (livekitUrl.includes('localhost') && currentHostname !== 'localhost' && currentHostname !== '127.0.0.1') {
        livekitUrl = `ws://${currentHostname}:7880`;
        appendLog(`Updated LiveKit URL to network address: ${livekitUrl}`);
      }
      
      (<HTMLInputElement>$('url')).value = livekitUrl;
      (<HTMLInputElement>$('token')).value = data.token;
      appendLog(`Generated token for identity: ${data.identity}, session: ${data.sessionId}`);

      // Update URL with session info
      updateSearchParams(livekitUrl, data.token, (<HTMLSelectElement>$('crypto-key')).value, data.sessionId);
    } catch (error: any) {
      appendLog('Failed to generate token:', error.message);
      console.error('Token generation error:', error);
    }
  },

  shareRoom: async () => {
    try {
      const url = (<HTMLInputElement>$('url')).value;
      if (!url) {
        alert('Please generate a token first or enter a server URL');
        return;
      }

      // Get room name from session ID input or use default
      const sessionId = (<HTMLInputElement>$('session-id')).value.trim();
      const roomName = sessionId || 'test-room';

      // Get local IP address (for sharing on local network)
      let shareUrl = window.location.origin;
      const localIP = await fetch('/api/local-ip').then(r => r.json()).catch(() => null);
      
      // Determine the best URLs to share
      const hostname = window.location.hostname;
      let shareDemoUrl = shareUrl;
      let shareLiveKitUrl = url;
      
      // If we're on localhost, try to get the network IP for sharing
      if ((hostname === 'localhost' || hostname === '127.0.0.1') && localIP && localIP.ip) {
        shareDemoUrl = `http://${localIP.ip}:${window.location.port || '8080'}`;
        shareLiveKitUrl = `ws://${localIP.ip}:7880`;
      }

      const shareInfo = `
🎥 LiveKit Room Invitation

Session ID / Room Name: ${roomName}

📋 Connection Details:
- Demo App URL: ${shareDemoUrl}?sessionId=${roomName}
- LiveKit Server: ${shareLiveKitUrl}

🚀 Quick Start (for others on your network):
1. Open this URL in your browser: ${shareDemoUrl}?sessionId=${roomName}
2. The Session ID should be pre-filled: ${roomName}
3. Click "Generate Token" button
4. Click "Connect" button
5. Enable your camera and microphone!

💡 Note: Make sure you're on the same network (WiFi/LAN) as the host.

Alternative (manual setup):
- Session ID: ${roomName}
- LiveKit URL: ${shareLiveKitUrl}
      `.trim();

      // Copy to clipboard
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareInfo);
        appendLog('Room information copied to clipboard!');
        alert('Room information copied to clipboard!\n\nShare this with others so they can join the same room.');
      } else {
        // Fallback: show in prompt
        prompt('Copy this information to share with others:', shareInfo);
      }
    } catch (error: any) {
      appendLog('Failed to share room:', error.message);
      console.error('Share error:', error);
    }
  },
  sendFile: async () => {
    console.log('start sending');
    const file = ($('file') as HTMLInputElement).files?.[0]!;
    currentRoom?.localParticipant.sendFile(file, {
      mimeType: file.type,
      topic: 'files',
      onProgress: (progress) => console.log('sending file, progress', Math.ceil(progress * 100)),
    });
  },
  connectWithFormInput: async () => {
    let url = (<HTMLInputElement>$('url')).value;
    let token = (<HTMLInputElement>$('token')).value;
    const e2eeEnabled = (<HTMLInputElement>$('e2ee')).checked;
    const audioOutputId = (<HTMLSelectElement>$('audio-output')).value;

    const roomOpts: RoomOptions = {
      audioOutput: {
        deviceId: audioOutputId,
      },
      publishDefaults: {
        dtx: true,
        red: true,
        forceStereo: false,
      },
      encryption: e2eeEnabled
        ? { keyProvider: state.e2eeKeyProvider, worker: new E2EEWorker() }
        : undefined,
    };

    const forceTURN = (<HTMLInputElement>$('force-turn')).checked;
    const shouldPublish = (<HTMLInputElement>$('publish-option')).checked;
    const cryptoKey = (<HTMLSelectElement>$('crypto-key')).value;
    const autoSubscribe = (<HTMLInputElement>$('auto-subscribe')).checked;
    const sessionId = (<HTMLInputElement>$('session-id')).value.trim();

    // If token is empty but session ID exists, generate token automatically
    if (!token && sessionId) {
      appendLog('No token found. Generating token for session ID: ' + sessionId);
      try {
        const response = await fetch(`/api/sessions/${sessionId}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        if (response.ok) {
          const data = await response.json();
          
          if (!data.success) {
            throw new Error(data.error || 'Failed to join session');
          }
          
          // If token server returned localhost but we're accessing from network IP, fix the URL
          let livekitUrl = data.url;
          const currentHostname = window.location.hostname;
          if (livekitUrl.includes('localhost') && currentHostname !== 'localhost' && currentHostname !== '127.0.0.1') {
            livekitUrl = `ws://${currentHostname}:7880`;
            appendLog(`Updated LiveKit URL to network address: ${livekitUrl}`);
          }
          
          (<HTMLInputElement>$('token')).value = data.token;
          (<HTMLInputElement>$('url')).value = livekitUrl;
          token = data.token;
          url = livekitUrl;
          appendLog(`Auto-generated token for session: ${sessionId}`);
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Server responded with ${response.status}`);
        }
      } catch (error: any) {
        appendLog('Failed to auto-generate token:', error.message);
        return;
      }
    }

    updateSearchParams(url, token, cryptoKey, sessionId);

    const connectOpts: RoomConnectOptions = {
      autoSubscribe: autoSubscribe,
    };
    if (forceTURN) {
      connectOpts.rtcConfig = {
        iceTransportPolicy: 'relay',
      };
    }
    await appActions.connectToRoom(url, token, roomOpts, connectOpts, shouldPublish);

    state.bitrateInterval = setInterval(renderBitrate, 1000);
  },

  connectToRoom: async (
    url: string,
    token: string,
    roomOptions?: RoomOptions,
    connectOptions?: RoomConnectOptions,
    shouldPublish?: boolean,
  ): Promise<Room | undefined> => {
    const room = new Room(roomOptions);

    startTime = Date.now();
    await room.prepareConnection(url, token);
    const prewarmTime = Date.now() - startTime;
    appendLog(`prewarmed connection in ${prewarmTime}ms`);

    room
      .on(RoomEvent.ParticipantConnected, participantConnected)
      .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
      .on(RoomEvent.ChatMessage, handleChatMessage)
      .on(RoomEvent.Disconnected, handleRoomDisconnect)
      .on(RoomEvent.Reconnecting, () => appendLog('Reconnecting to room'))
      .on(RoomEvent.Reconnected, async () => {
        appendLog(
          'Successfully reconnected. server',
          await room.engine.getConnectedServerAddress(),
        );
      })
      .on(RoomEvent.ParticipantActive, async (participant) => {
        appendLog(`participant ${participant.identity} is active and ready to receive messages`);
        await sendGreetingTo(participant);
      })
      .on(RoomEvent.ActiveDeviceChanged, handleActiveDeviceChanged)
      .on(RoomEvent.LocalTrackPublished, (pub) => {
        const track = pub.track;

        if (isLocalTrack(track) && isAudioTrack(track)) {
          const { calculateVolume } = createAudioAnalyser(track);

          setInterval(() => {
            $('local-volume')?.setAttribute('value', calculateVolume().toFixed(4));
          }, 200);
        }
        renderParticipant(room.localParticipant);
        updateButtonsForPublishState();

      })
      .on(RoomEvent.LocalTrackUnpublished, () => {
        renderParticipant(room.localParticipant);
        updateButtonsForPublishState();

      })
      .on(RoomEvent.RoomMetadataChanged, (metadata) => {
        appendLog('new metadata for room', metadata);
      })
      .on(RoomEvent.MediaDevicesChanged, handleDevicesChanged)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (room.canPlaybackAudio) {
          $('start-audio-button')?.setAttribute('disabled', 'true');
        } else {
          $('start-audio-button')?.removeAttribute('disabled');
        }
      })
      .on(RoomEvent.MediaDevicesError, (e: Error) => {
        const failure = MediaDeviceFailure.getFailure(e);
        appendLog('media device failure', failure);
      })
      .on(
        RoomEvent.ConnectionQualityChanged,
        (quality: ConnectionQuality, participant?: Participant) => {
          appendLog('connection quality changed', participant?.identity, quality);
        },
      )
      .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        appendLog('subscribed to track', pub.trackSid, participant.identity);
        renderParticipant(participant);

      })
      .on(RoomEvent.TrackUnsubscribed, (_, pub, participant) => {
        appendLog('unsubscribed from track', pub.trackSid);
        renderParticipant(participant);

      })
      .on(RoomEvent.SignalConnected, async () => {
        const signalConnectionTime = Date.now() - startTime;
        appendLog(`signal connection established in ${signalConnectionTime}ms`);
        // speed up publishing by starting to publish before it's fully connected
        // publishing is accepted as soon as signal connection has established
      })
      .on(RoomEvent.ParticipantEncryptionStatusChanged, () => {
        updateButtonsForPublishState();
      })
      .on(RoomEvent.TrackStreamStateChanged, (pub, streamState, participant) => {
        appendLog(
          `stream state changed for ${pub.trackSid} (${participant.identity
          }) to ${streamState.toString()}`,
        );
      })
      .on(RoomEvent.EncryptionError, (error) => {
        appendLog(`Error encrypting track data: ${error.message}`);
      });

    room.registerTextStreamHandler('lk.chat', async (reader, participant) => {
      streamReaderAbortController = new AbortController();
      (<HTMLButtonElement>$('cancel-chat-receive-button')).style.display = 'block';

      const info = reader.info;

      let message = '';
      try {
        for await (const chunk of reader.withAbortSignal(streamReaderAbortController.signal)) {
          message += chunk;
          console.log('received message', message, participant);
          handleChatMessage(
            {
              id: info.id,
              timestamp: info.timestamp,
              message,
            },
            room.getParticipantByIdentity(participant?.identity),
          );
        }
      } catch (err) {
        message += 'ERROR';
        handleChatMessage(
          {
            id: info.id,
            timestamp: info.timestamp,
            message,
          },
          room.getParticipantByIdentity(participant?.identity),
        );
        throw err;
      }

      if (!info.size) {
        appendLog('text stream finished');
      }
      console.log('final info including close extensions', reader.info);

      streamReaderAbortController = undefined;
      (<HTMLButtonElement>$('cancel-chat-receive-button')).style.display = 'none';
    });

    room.registerByteStreamHandler('files', async (reader, participant) => {
      const info = reader.info;

      appendLog(`started to receive a file called "${info.name}" from ${participant?.identity}`);

      const progressContainer = document.createElement('div');
      progressContainer.style.margin = '10px 0';
      const progressLabel = document.createElement('div');
      progressLabel.innerText = `Receiving "${info.name}" from ${participant?.identity}...`;
      const progressBar = document.createElement('progress');
      progressBar.max = 100;
      progressBar.value = 0;
      progressBar.style.width = '100%';

      progressContainer.appendChild(progressLabel);
      progressContainer.appendChild(progressBar);
      $('chat-area').after(progressContainer);

      appendLog(`Started receiving file "${info.name}" from ${participant?.identity}`);

      streamReaderAbortController = new AbortController();
      (<HTMLButtonElement>$('cancel-chat-receive-button')).style.display = 'block';

      reader.onProgress = (progress) => {
        console.log(`"progress ${progress ? (progress * 100).toFixed(0) : 'undefined'}%`);

        if (progress) {
          progressBar.value = progress * 100;
          progressLabel.innerText = `Receiving "${info.name}" from ${participant?.identity} (${(progress * 100).toFixed(0)}%)`;
        }
      };

      let byteContents;
      try {
        byteContents = await reader.readAll({
          signal: streamReaderAbortController.signal,
        });
      } catch (err) {
        progressLabel.innerText = `Receiving "${info.name}" - readAll aborted!`;
        throw err;
      }
      const result = new Blob(byteContents, { type: info.mimeType });
      appendLog(`Completely received file "${info.name}" from ${participant?.identity}`);

      streamReaderAbortController = undefined;
      (<HTMLButtonElement>$('cancel-chat-receive-button')).style.display = 'none';

      progressContainer.remove();

      if (info.mimeType.startsWith('image/')) {
        // Embed images directly in HTML
        const imgContainer = document.createElement('div');
        imgContainer.style.margin = '10px 0';
        imgContainer.style.padding = '10px';

        const img = document.createElement('img');
        img.style.maxWidth = '300px';
        img.style.maxHeight = '300px';
        img.src = URL.createObjectURL(result);

        const downloadLink = document.createElement('a');
        downloadLink.href = img.src;
        downloadLink.innerText = `Download ${info.name}`;
        downloadLink.setAttribute('download', info.name);
        downloadLink.style.display = 'block';
        downloadLink.style.marginTop = '5px';

        imgContainer.appendChild(img);
        imgContainer.appendChild(downloadLink);
        $('chat-area').after(imgContainer);
      } else {
        // Non-images get a text download link instead
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(result);
        downloadLink.innerText = `Download ${info.name}`;
        downloadLink.setAttribute('download', info.name);
        downloadLink.style.margin = '10px';
        downloadLink.style.padding = '5px';
        downloadLink.style.display = 'block';
        $('chat-area').after(downloadLink);
      }
    });

    try {
      // read and set current key from input (only if E2EE is enabled)
      const e2eeEnabled = (<HTMLInputElement>$('e2ee')).checked;
      if (e2eeEnabled) {
        try {
          const cryptoKey = (<HTMLSelectElement>$('crypto-key')).value;
          state.e2eeKeyProvider.setKey(cryptoKey);
          await room.setE2EEEnabled(true);
        } catch (e2eeError: any) {
          appendLog('E2EE setup failed (this is OK if disabled):', e2eeError.message);
          // Continue without E2EE if it fails
        }
      }
      const publishPromise = new Promise<void>(async (resolve, reject) => {
        try {
          if (shouldPublish) {
            await room.localParticipant.setMicrophoneEnabled(true);
            appendLog(`audio published in ${Date.now() - startTime}ms`);
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      await Promise.all([
        room.connect(url, token, connectOptions),
        publishPromise.catch(appendLog),
      ]);
      const elapsed = Date.now() - startTime;
      appendLog(
        `successfully connected to ${room.name} in ${Math.round(elapsed)}ms`,
        await room.engine.getConnectedServerAddress(),
      );
    } catch (error: any) {
      let message: any = error;
      if (error.message) {
        message = error.message;
      }
      appendLog('could not connect:', message);
      return;
    }
    currentRoom = room;
    window.currentRoom = room;
    setButtonsForState(true);

    room.remoteParticipants.forEach((participant) => {
      participantConnected(participant);
    });
    participantConnected(room.localParticipant);
    updateButtonsForPublishState();

    return room;
  },

  toggleE2EE: async () => {
    if (!currentRoom || !currentRoom.hasE2EESetup) {
      return;
    }
    // read and set current key from input
    const cryptoKey = (<HTMLSelectElement>$('crypto-key')).value;
    state.e2eeKeyProvider.setKey(cryptoKey);

    await currentRoom.setE2EEEnabled(!currentRoom.isE2EEEnabled);
  },





  ratchetE2EEKey: async () => {
    if (!currentRoom || !currentRoom.hasE2EESetup) {
      return;
    }
    await state.e2eeKeyProvider.ratchetKey();
  },

  toggleAudio: async () => {
    if (!currentRoom) return;
    const enabled = currentRoom.localParticipant.isMicrophoneEnabled;
    setButtonDisabled('toggle-audio-button', true);
    if (enabled) {
      appendLog('disabling audio');
    } else {
      appendLog('enabling audio');
    }
    await currentRoom.localParticipant.setMicrophoneEnabled(!enabled);
    setButtonDisabled('toggle-audio-button', false);
    updateButtonsForPublishState();
  },







  startAudio: () => {
    currentRoom?.startAudio();
  },

  enterText: () => {
    if (!currentRoom) return;
    const textField = <HTMLInputElement>$('entry');
    if (textField.value) {
      let localParticipant = currentRoom.localParticipant;
      let message = textField.value;
      localParticipant.sendText(message, { topic: 'lk.chat' }).then((info) => {
        handleChatMessage(
          {
            id: info.id,
            timestamp: info.timestamp,
            message: message,
          },
          localParticipant,
        );
      });

      textField.value = '';
    }
  },

  cancelChatReceive: () => {
    if (!streamReaderAbortController) {
      return;
    }
    streamReaderAbortController.abort();

    (<HTMLButtonElement>$('cancel-chat-receive-button')).style.display = 'none';
  },

  disconnectRoom: () => {
    if (currentRoom) {
      currentRoom.disconnect();
    }
    if (state.bitrateInterval) {
      clearInterval(state.bitrateInterval);
    }
  },

  handleScenario: (e: Event) => {
    const scenario = (<HTMLSelectElement>e.target).value;
    if (scenario === 'subscribe-all') {
      currentRoom?.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((rp) => rp.setSubscribed(true));
      });
    } else if (scenario === 'unsubscribe-all') {
      currentRoom?.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((rp) => rp.setSubscribed(false));
      });
    } else if (scenario === 'mute-all') {
      currentRoom?.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((rp) => rp.setEnabled(false));
      });
    } else if (scenario === 'unmute-all') {
      currentRoom?.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((rp) => rp.setEnabled(true));
      });
    } else if (scenario !== '') {
      currentRoom?.simulateScenario(scenario as SimulationScenario);
      (<HTMLSelectElement>e.target).value = '';
    }
  },

  handleDeviceSelected: async (e: Event) => {
    const deviceId = (<HTMLSelectElement>e.target).value;
    const elementId = (<HTMLSelectElement>e.target).id;
    const kind = elementMapping[elementId];
    if (!kind) {
      return;
    }

    if (currentRoom) {
      await currentRoom.switchActiveDevice(kind, deviceId);
    }
  },




};

declare global {
  interface Window {
    currentRoom: any;
    appActions: typeof appActions;
  }
}

window.appActions = appActions;

// --------------------------- event handlers ------------------------------- //
function handleChatMessage(msg: ChatMessage, participant?: Participant) {
  state.chatMessages.set(msg.id, { text: msg.message, participant });

  const chatEl = <HTMLTextAreaElement>$('chat');
  chatEl.value = '';
  for (const chatMsg of state.chatMessages.values()) {
    chatEl.value += `${chatMsg.participant?.identity}${participant && isLocalParticipant(participant) ? ' (me)' : ''}: ${chatMsg.text}\n`;
  }
}

async function sendGreetingTo(participant: Participant) {
  const greeting = `Hello new participant ${participant.identity}. This is just an progressively updating chat message from me, participant ${currentRoom?.localParticipant.identity}.`;

  const streamWriter = await currentRoom!.localParticipant.streamText({
    topic: 'lk.chat',
    destinationIdentities: [participant.identity],
  });

  for (const char of greeting) {
    await streamWriter.write(char);
    await sleep(50);
  }
  await streamWriter.close();
}

async function participantConnected(participant: Participant) {
  appendLog('participant', participant.identity, 'connected', participant.metadata);
  participant
    .on(ParticipantEvent.TrackMuted, (pub: TrackPublication) => {
      appendLog('track was muted', pub.trackSid, participant.identity);
      renderParticipant(participant);
    })
    .on(ParticipantEvent.TrackUnmuted, (pub: TrackPublication) => {
      appendLog('track was unmuted', pub.trackSid, participant.identity);
      renderParticipant(participant);
    })
    .on(ParticipantEvent.IsSpeakingChanged, () => {
      renderParticipant(participant);
    })
    .on(ParticipantEvent.ConnectionQualityChanged, () => {
      renderParticipant(participant);
    });
}

function participantDisconnected(participant: RemoteParticipant) {
  appendLog('participant', participant.sid, 'disconnected');

  renderParticipant(participant, true);
}

function handleRoomDisconnect(reason?: DisconnectReason) {
  if (!currentRoom) return;
  appendLog('disconnected from room', { reason });
  setButtonsForState(false);
  renderParticipant(currentRoom.localParticipant, true);
  currentRoom.remoteParticipants.forEach((p) => {
    renderParticipant(p, true);
  });

  const container = $('participants-area');
  if (container) {
    container.innerHTML = '';
  }

  // clear the chat area on disconnect
  const chat = <HTMLTextAreaElement>$('chat');
  chat.value = '';

  currentRoom = undefined;
  window.currentRoom = undefined;
}

// -------------------------- rendering helpers ----------------------------- //

function appendLog(...args: any[]) {
  const logger = $('log')!;
  for (let i = 0; i < arguments.length; i += 1) {
    if (typeof args[i] === 'object') {
      logger.innerHTML += `${JSON && JSON.stringify ? JSON.stringify(args[i], undefined, 2) : args[i]
        } `;
    } else {
      logger.innerHTML += `${args[i]} `;
    }
  }
  logger.innerHTML += '\n';
  (() => {
    logger.scrollTop = logger.scrollHeight;
  })();
}

// updates participant UI
function renderParticipant(participant: Participant, remove: boolean = false) {
  const container = getParticipantsAreaElement();
  if (!container) return;
  const { identity } = participant;
  let div = container.querySelector(`#participant-${identity}`);
  if (!div && !remove) {
    div = document.createElement('div');
    div.id = `participant-${identity}`;
    div.className = 'participant';
    div.innerHTML = `
      <audio id="audio-${identity}"></audio>
      <div class="info-bar">
        <div id="name-${identity}" class="name">
        </div>
        <div style="text-align: center;">
          <span id="codec-${identity}" class="codec">
          </span>
          <span id="size-${identity}" class="size">
          </span>
          <span id="bitrate-${identity}" class="bitrate">
          </span>
        </div>
        <div class="right">
          <span id="signal-${identity}"></span>
          <span id="mic-${identity}" class="mic-on"></span>
          <span id="e2ee-${identity}" class="e2ee-on"></span>
        </div>
      </div>
      ${!isLocalParticipant(participant)
        ? `<div class="volume-control">
        <input id="volume-${identity}" type="range" min="0" max="1" step="0.1" value="1" orient="vertical" />
      </div>`
        : `<progress id="local-volume" max="1" value="0" />`
      }

    `;
    container.appendChild(div);


  }
  const audioElm = <HTMLAudioElement>container.querySelector(`#audio-${identity}`);
  if (remove) {
    div?.remove();
    if (audioElm) {
      audioElm.srcObject = null;
      audioElm.src = '';
    }
    return;
  }

  // update properties
  container.querySelector(`#name-${identity}`)!.innerHTML = participant.identity;
  if (isLocalParticipant(participant)) {
    container.querySelector(`#name-${identity}`)!.innerHTML += ' (you)';
  }
  const micElm = container.querySelector(`#mic-${identity}`)!;
  const signalElm = container.querySelector(`#signal-${identity}`)!;
  const cameraPub = participant.getTrackPublication(Track.Source.Camera);
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  if (participant.isSpeaking) {
    div!.classList.add('speaking');
  } else {
    div!.classList.remove('speaking');
  }

  if (isRemoteParticipant(participant)) {
    const volumeSlider = <HTMLInputElement>container.querySelector(`#volume-${identity}`);
    volumeSlider.addEventListener('input', (ev) => {
      participant.setVolume(Number.parseFloat((ev.target as HTMLInputElement).value));
    });
  }



  const micEnabled = micPub && micPub.isSubscribed && !micPub.isMuted;
  if (micEnabled) {
    if (!isLocalParticipant(participant)) {
      // don't attach local audio
      audioElm.onloadeddata = () => {
        if (participant.joinedAt && participant.joinedAt.getTime() < startTime) {
          const fromJoin = Date.now() - startTime;
          appendLog(`RemoteAudioTrack ${micPub?.trackSid} played ${fromJoin}ms from start`);
        }
      };
      micPub?.audioTrack?.attach(audioElm);
    }
    micElm.className = 'mic-on';
    micElm.innerHTML = '<i class="fas fa-microphone"></i>';
  } else {
    micElm.className = 'mic-off';
    micElm.innerHTML = '<i class="fas fa-microphone-slash"></i>';
  }

  const e2eeElm = container.querySelector(`#e2ee-${identity}`)!;
  if (participant.isEncrypted) {
    e2eeElm.className = 'e2ee-on';
    e2eeElm.innerHTML = '<i class="fas fa-lock"></i>';
  } else {
    e2eeElm.className = 'e2ee-off';
    e2eeElm.innerHTML = '<i class="fas fa-unlock"></i>';
  }

  switch (participant.connectionQuality) {
    case ConnectionQuality.Excellent:
    case ConnectionQuality.Good:
    case ConnectionQuality.Poor:
      signalElm.className = `connection-${participant.connectionQuality}`;
      signalElm.innerHTML = '<i class="fas fa-circle"></i>';
      break;
    default:
      signalElm.innerHTML = '';
    // do nothing
  }
}



function renderBitrate() {
  if (!currentRoom || currentRoom.state !== ConnectionState.Connected) {
    return;
  }
  const participants: Participant[] = [...currentRoom.remoteParticipants.values()];
  participants.push(currentRoom.localParticipant);
  const container = getParticipantsAreaElement();

  for (const p of participants) {
    const elm = container.querySelector(`#bitrate-${p.identity}`);
    let totalBitrate = 0;
    for (const t of p.trackPublications.values()) {
      if (t.track) {
        totalBitrate += t.track.currentBitrate;
      }
    }
    let displayText = '';
    if (totalBitrate > 0) {
      displayText = `${Math.round(totalBitrate / 1024).toLocaleString()} kbps`;
    }
    if (elm) {
      elm.innerHTML = displayText;
    }
  }
}

function getParticipantsAreaElement(): HTMLElement {
  return (
    window.documentPictureInPicture?.window?.document.querySelector('#participants-area') ||
    $('participants-area')
  );
}



function setButtonState(
  buttonId: string,
  buttonText: string,
  isActive: boolean,
  isDisabled: boolean | undefined = undefined,
) {
  const el = $(buttonId) as HTMLButtonElement;
  if (!el) return;
  if (isDisabled !== undefined) {
    el.disabled = isDisabled;
  }
  el.innerHTML = buttonText;
  if (isActive) {
    el.classList.add('active');
  } else {
    el.classList.remove('active');
  }
}

function setButtonDisabled(buttonId: string, isDisabled: boolean) {
  const el = $(buttonId) as HTMLButtonElement;
  el.disabled = isDisabled;
}

setTimeout(handleDevicesChanged, 100);

function setButtonsForState(connected: boolean) {
  const connectedSet = [
    'toggle-audio-button',
    'disconnect-ws-button',
    'disconnect-room-button',
    'send-button',
  ];
  if (currentRoom && currentRoom.hasE2EESetup) {
    connectedSet.push('toggle-e2ee-button', 'e2ee-ratchet-button');
  }
  const disconnectedSet = ['connect-button'];

  const toRemove = connected ? connectedSet : disconnectedSet;
  const toAdd = connected ? disconnectedSet : connectedSet;

  toRemove.forEach((id) => $(id)?.removeAttribute('disabled'));
  toAdd.forEach((id) => $(id)?.setAttribute('disabled', 'true'));
}

const elementMapping: { [k: string]: MediaDeviceKind } = {

  'audio-input': 'audioinput',
  'audio-output': 'audiooutput',
} as const;

async function handleDevicesChanged() {
  Promise.all(
    Object.keys(elementMapping).map(async (id) => {
      const kind = elementMapping[id];
      if (!kind) {
        return;
      }
      const devices = await Room.getLocalDevices(kind);
      const element = <HTMLSelectElement>$(id);
      populateSelect(element, devices, state.defaultDevices.get(kind));
    }),
  );
}

async function handleActiveDeviceChanged(kind: MediaDeviceKind, deviceId: string) {
  console.debug('active device changed', kind, deviceId);
  state.defaultDevices.set(kind, deviceId);
  const devices = await Room.getLocalDevices(kind);
  const element = <HTMLSelectElement>$(
    Object.entries(elementMapping)
      .map(([key, value]) => {
        if (value === kind) {
          return key;
        }
        return undefined;
      })
      .filter((val) => val !== undefined)[0],
  );
  populateSelect(element, devices, deviceId);
}

function populateSelect(
  element: HTMLSelectElement,
  devices: MediaDeviceInfo[],
  selectedDeviceId?: string,
) {
  // clear all elements
  element.innerHTML = '';

  for (const device of devices) {
    const option = document.createElement('option');
    option.text = device.label;
    option.value = device.deviceId;
    if (device.deviceId === selectedDeviceId) {
      option.selected = true;
    }
    element.appendChild(option);
  }
}

function updateButtonsForPublishState() {
  if (!currentRoom) {
    return;
  }
  const lp = currentRoom.localParticipant;

  // video


  // audio
  setButtonState(
    'toggle-audio-button',
    lp.isMicrophoneEnabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>',
    lp.isMicrophoneEnabled,
  );

  // screen share


  // e2ee
  setButtonState(
    'toggle-e2ee-button',
    `${currentRoom.isE2EEEnabled ? 'Disable' : 'Enable'} E2EE`,
    currentRoom.isE2EEEnabled,
  );
}

async function acquireDeviceList() {
  handleDevicesChanged();
}





acquireDeviceList();

