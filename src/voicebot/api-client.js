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
      logger.info('Registering call with voicebot', { 
        callId: callDetails.CallSid,
        url: this.config.incomingCallUrl
      });
      
      logger.debug('Call details being sent', {
        callDetails: JSON.stringify(callDetails)
      });
      
      const response = await this.axios.post(
        this.config.incomingCallUrl,
        callDetails
      );
      
      // Log the raw response
      logger.info('Raw API response', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: JSON.stringify(response.data)
      });
      
      logger.info('Call registered successfully', { 
        callId: callDetails.CallSid,
        status: response.data.status
      });
      
      return response.data;
    } catch (error) {
      logger.error('Error registering call with voicebot', {
        callId: callDetails.CallSid,
        error: error.message,
        config: error.config ? {
          url: error.config.url,
          method: error.config.method,
          headers: error.config.headers
        } : 'No config available',
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        } : 'No response data'
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