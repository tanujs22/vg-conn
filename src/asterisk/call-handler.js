const logger = require('../utils/logger');
const VoicebotAPI = require('../voicebot/api-client');
const VoicebotClient = require('../voicebot/websocket-client');
const RTPServer = require('../audio/rtp-server');
const AudioStreamBridge = require('../audio/stream-bridge');
const config = require('../../config/default');

class CallHandler {
  constructor() {
    this.activeCalls = new Map();
    this.voicebotAPI = new VoicebotAPI(config.voicebot);
  }

  async handleCallStart(event, channel) {
    const callId = channel.id;
    logger.info(`New call received`, { callId });
    
    // Store the channel
    this.activeCalls.set(callId, { 
      channel,
      state: 'new',
      startTime: new Date()
    });
    
    try {
      // Answer the call
      await channel.answer();
      logger.info(`Call answered`, { callId });
      this.activeCalls.get(callId).state = 'answered';
      
      // Get caller/called information
      const callerNumber = channel.caller.number;
      const calledNumber = channel.connected.number;
      
      // Prepare call details for voicebot
      const callDetails = {
        AccountSid: "ASTERISK",
        ApiVersion: "1.0",
        CallSid: callId,
        CallStatus: "ringing",
        Called: calledNumber,
        Caller: callerNumber,
        Direction: "inbound",
        From: callerNumber,
        To: calledNumber
      };
      
      // Register the call with voicebot
      const response = await this.voicebotAPI.registerCall(callDetails);
      
      // Log the full response for debugging
      logger.info('Voicebot API response', { callId, response });
      
      // Check if we have a valid response with socketURL
      if (response && 
          response.status === 'success' && 
          response.data && 
          response.data.data && 
          response.data.data.socketURL) {
          
          // The structure is different - socketURL is inside data.data
          const responseData = response.data.data;
          
          // Store the websocket URL and hangup URL
          this.activeCalls.get(callId).socketURL = responseData.socketURL;
          this.activeCalls.get(callId).HangupUrl = responseData.HangupUrl;
          this.activeCalls.get(callId).statusCallbackUrl = responseData.statusCallbackUrl;
          this.activeCalls.get(callId).recordingStatusUrl = responseData.recordingStatusUrl;
          
          // Set up RTP and connect to voicebot
          await this.setupRTPAndConnectVoicebot(callId);
      } else {
          logger.error('Failed to get WebSocket URL from voicebot', { callId, response });
          await channel.play({
            media: 'sound:/var/lib/asterisk/sounds/sorry.gsm',
            lang: 'en'
          });
          await channel.hangup();
      }
      
    } catch (err) {
      logger.error(`Error handling call`, { 
        callId,
        error: err.message,
        stack: err.stack
      });
      
      // Attempt to hangup on error
      try {
        await channel.hangup();
      } catch (hangupErr) {
        logger.error('Error hanging up call', { 
          callId, 
          error: hangupErr.message 
        });
      }
    }
  }

  async setupRTPAndConnectVoicebot(callId) {
    const callData = this.activeCalls.get(callId);
    if (!callData) {
      logger.error('Call data not found', { callId });
      return false;
    }
    
    try {
      // Create RTP server for audio exchange
      const rtpServer = new RTPServer({
        localPort: 3000,
        remotePort: 3001,
        localAddress: '127.0.0.1',
        remoteAddress: '127.0.0.1',
        payloadType: 0  // 0 = PCMU (G.711 μ-law)
      });
      callData.rtpServer = rtpServer;
      
      // Create a voicebot client for this call
      const voicebotClient = new VoicebotClient(config.voicebot);
      callData.voicebotClient = voicebotClient;
      
      // Create audio stream bridge
      const audioStreamBridge = new AudioStreamBridge(callId);
      callData.audioStreamBridge = audioStreamBridge;
      
      // Start RTP server
      rtpServer.start();
      
      // Set up event handlers for RTP server
      rtpServer.on('audio', (audioData) => {
        // Process audio from Asterisk and forward to voicebot
        audioStreamBridge.processAudioFromAsterisk(audioData);
      });
      
      // Set up event handlers for audio bridge
      audioStreamBridge.on('outgoing_media', (mediaEvent) => {
        // Send media event to voicebot
        voicebotClient.sendMediaEvent(mediaEvent);
      });
      
      audioStreamBridge.on('incoming_audio', (audioData) => {
        // Send audio back to Asterisk via RTP
        rtpServer.sendAudio(audioData);
      });
      
      // Set up event handlers for the voicebot client
      voicebotClient.on('connected', () => {
        logger.info('Connected to voicebot', { callId });
        callData.state = 'connected_to_voicebot';
        
        // Send start event
        const startEvent = {
          sequenceNumber: 0,
          event: "start",
          start: {
            callId: callId,
            streamId: audioStreamBridge.streamId,
            accountId: "10144634", // This could be configurable
            tracks: ["inbound"],
            mediaFormat: {
              encoding: "mulaw",
              sampleRate: 8000
            }
          }
        };
        
        voicebotClient.sendControl(startEvent);
        logger.info('Sent start event to voicebot', { callId });
        
        // Start audio streaming
        audioStreamBridge.startStreaming();
        
        // Transfer the call to the External Media extension
        this.transferCallToExternalMedia(callId);
      });
      
      voicebotClient.on('media', (mediaEvent) => {
        // Process audio from voicebot
        audioStreamBridge.processAudioFromVoicebot(mediaEvent);
      });
      
      voicebotClient.on('control', (message) => {
        logger.info('Received control message from voicebot', { callId, message });
      });
      
      voicebotClient.on('error', (error) => {
        logger.error('Voicebot WebSocket error', { callId, error: error.message });
      });
      
      // Connect to the voicebot
      const connected = await voicebotClient.connect(callId, callData.socketURL);
      
      if (!connected) {
        logger.error('Failed to connect to voicebot WebSocket', { callId });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error setting up RTP and connecting to voicebot', { 
        callId, 
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  async transferCallToExternalMedia(callId) {
    const callData = this.activeCalls.get(callId);
    if (!callData) return;
    
    try {
      // Determine the extension to transfer to (in the 7XXX range)
      const externalMediaExt = '7000';
      
      // Redirect the call to the external media extension
      await callData.channel.continueInDialplan({
        context: 'stream-audio',
        extension: externalMediaExt,
        priority: 1
      });
      
      logger.info('Transferred call to External Media', { 
        callId, 
        extension: externalMediaExt 
      });
    } catch (error) {
      logger.error('Error transferring call to External Media', { 
        callId, 
        error: error.message,
        stack: error.stack
      });
    }
  }

  async handleCallEnd(event, channel) {
    const callId = channel.id;
    logger.info(`Call ended`, { callId });
    
    // Get call data
    const callData = this.activeCalls.get(callId);
    if (callData) {
      // Calculate call duration
      const duration = (new Date() - callData.startTime) / 1000;
      logger.info(`Call statistics`, {
        callId,
        durationSeconds: duration
      });
      
      // Stop audio streaming
      if (callData.audioStreamBridge) {
        callData.audioStreamBridge.stopStreaming();
        
        // Send disconnect event to voicebot
        if (callData.voicebotClient && callData.voicebotClient.connected) {
          const disconnectEvent = callData.audioStreamBridge.createDisconnectEvent();
          callData.voicebotClient.sendDisconnectEvent(disconnectEvent);
        }
      }
      
      // Stop RTP server
      if (callData.rtpServer) {
        callData.rtpServer.stop();
      }
      
      // Notify voicebot of hangup
      if (callData.HangupUrl) {
        try {
          await this.voicebotAPI.notifyHangup(callId, {
            hangupCause: "Customer Hungup",
            disconnectedBy: channel.caller.number,
            AnswerTime: new Date(callData.startTime).toISOString().replace('T', ' ').substring(0, 19),
            BillDuration: Math.floor(duration).toString(),
            BillRate: "0.006",
            CallStatus: "completed",
            CallUUID: callId,
            Direction: "inbound",
            Duration: Math.floor(duration).toString(),
            EndTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
            Event: "Hangup",
            From: channel.caller.number,
            HangupCause: "NORMAL_CLEARING",
            HangupSource: "Callee",
            SessionStart: new Date(callData.startTime).toISOString().replace('T', ' ').substring(0, 19),
            StartTime: new Date(callData.startTime).toISOString().replace('T', ' ').substring(0, 19),
            To: channel.connected.number,
            TotalCost: "0.00000"
          }, callData.HangupUrl);
        } catch (error) {
          logger.error('Failed to notify hangup', { callId, error: error.message });
        }
      }
      
      // Disconnect voicebot client if it exists
      if (callData.voicebotClient) {
        callData.voicebotClient.disconnect();
      }
      
      // Remove from active calls
      this.activeCalls.delete(callId);
    }
  }
}

module.exports = new CallHandler();