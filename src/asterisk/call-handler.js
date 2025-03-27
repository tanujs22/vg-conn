const logger = require('../utils/logger');

class CallHandler {
  constructor() {
    this.activeCalls = new Map();
  }

  handleCallStart(event, channel) {
    const callId = channel.id;
    logger.info(`New call received`, { callId });
    
    // Store the channel
    this.activeCalls.set(callId, { 
      channel,
      state: 'new',
      startTime: new Date()
    });
    
    // Answer the call
    channel.answer()
      .then(() => {
        logger.info(`Call answered`, { callId });
        this.activeCalls.get(callId).state = 'answered';
        
        // Play a test message
        return channel.play({ media: 'sound:hello-world' });
      })
      .then(() => {
        logger.info(`Played greeting`, { callId });
      })
      .catch(err => {
        logger.error(`Error handling call`, { 
          callId,
          error: err.message
        });
      });
      
    // Monitor channel state
    channel.on('ChannelStateChange', event => {
      logger.info(`Channel state changed`, {
        callId,
        state: channel.state
      });
    });
  }

  handleCallEnd(event, channel) {
    const callId = channel.id;
    logger.info(`Call ended`, { callId });
    
    // Calculate call duration if we have the call data
    const callData = this.activeCalls.get(callId);
    if (callData) {
      const duration = (new Date() - callData.startTime) / 1000;
      logger.info(`Call statistics`, {
        callId,
        durationSeconds: duration
      });
      
      // Remove from active calls
      this.activeCalls.delete(callId);
    }
  }
}

module.exports = new CallHandler();