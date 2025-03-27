const axios = require('axios');
const logger = require('../utils/logger');

class VoicebotAPI {
  constructor(config) {
    this.config = config;
    this.axios = axios.create({
      headers: {
        'Content-Type': 'application/json',
        'User-Agent' : 'vicidial'
      }
    });
  }

  async registerCall(callDetails) {
    try {
      logger.info('Registering call with voicebot', { callId: callDetails.CallSid });
      
      const response = await this.axios.post(
        this.config.incomingCallUrl,
        callDetails
      );
      
      logger.info('Call registered successfully', { 
        callId: callDetails.CallSid,
        status: response.data.status
      });
      
      return response.data;
    } catch (error) {
      logger.error('Error registering call with voicebot', {
        callId: callDetails.CallSid,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  async notifyHangup(callSid, callDetails) {
    try {
      logger.info('Notifying voicebot of call hangup', { callId: callSid });
      
      const response = await this.axios.post(
        this.config.hangupUrl,
        {
          CallSid: callSid,
          ...callDetails
        }
      );
      
      logger.info('Hangup notification sent', { 
        callId: callSid,
        status: response.data.status
      });
      
      return response.data;
    } catch (error) {
      logger.error('Error notifying hangup', {
        callId: callSid,
        error: error.message
      });
      // We don't throw here to avoid disrupting call cleanup
      return { status: 'error', message: error.message };
    }
  }
}

module.exports = VoicebotAPI;