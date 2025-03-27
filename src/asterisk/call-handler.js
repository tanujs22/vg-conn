const logger = require('../utils/logger');
const VoicebotAPI = require('../voicebot/api-client');
const VoicebotClient = require('../voicebot/websocket-client');
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
          
          // Connect to the voicebot via WebSocket
          await this.connectToVoicebot(callId);
      } else {
          logger.error('Failed to get WebSocket URL from voicebot', { callId, response });
          await channel.play({
            media: 'sound:/var/lib/asterisk/sounds/sorry.gsm',
            lang: 'en'  // Specify the language
          });
          await channel.hangup();
      }
      
    } catch (err) {
      logger.error(`Error handling call`, { 
        callId,
        error: err.message
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

  async connectToVoicebot(callId) {
    const callData = this.activeCalls.get(callId);
    if (!callData) {
      logger.error('Call data not found', { callId });
      return false;
    }
    
    // Create a voicebot client for this call
    const voicebotClient = new VoicebotClient(config.voicebot);
    callData.voicebotClient = voicebotClient;
    
    // Set up event handlers
    voicebotClient.on('connected', () => {
      logger.info('Connected to voicebot', { callId });
      callData.state = 'connected_to_voicebot';
      
      // Here we would set up audio streaming between Asterisk and the voicebot
      // This will be implemented in the next step
    });
    
    voicebotClient.on('control', (message) => {
      logger.info('Received control message from voicebot', { callId, message });
      // Handle control messages (like hangup requests)
    });
    
    voicebotClient.on('audio', (audioData) => {
      logger.debug('Received audio from voicebot', { 
        callId, 
        size: audioData.byteLength 
      });
      // Forward audio to Asterisk (implemented in next step)
    });
    
    // Connect to the voicebot
    const connected = await voicebotClient.connect(callId, callData.socketURL);
    
    if (!connected) {
      logger.error('Failed to connect to voicebot WebSocket', { callId });
      return false;
    }
    
    return true;
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
      
      // Notify voicebot of hangup if we have a HangupUrl
      if (callData.HangupUrl) {
        try {
          // Use the full URL from the response
          await this.voicebotAPI.notifyHangup(callId, {
            Duration: Math.floor(duration),
            CallStatus: "completed"
          }, callData.HangupUrl); // Pass the hangup URL to the method
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