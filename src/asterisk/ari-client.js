const ARI = require('ari-client');
const logger = require('../utils/logger');
const config = require('../../config/default');

class AsteriskClient {
  constructor() {
    this.client = null;
    this.connected = false;
  }

async connect() {
    try {
      logger.info('Connecting to Asterisk ARI...', {
        url: config.asterisk.url,
        username: config.asterisk.username,
        appName: config.asterisk.appName
      });
      
      this.client = await ARI.connect(
        config.asterisk.url,
        config.asterisk.username,
        config.asterisk.password
      );
      
      this.connected = true;
      logger.info('Successfully connected to Asterisk ARI');
      
      return this.client;
    } catch (error) {
      logger.error('Failed to connect to Asterisk ARI', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  startApplication(handlers = {}) {
    if (!this.connected || !this.client) {
      throw new Error('Not connected to Asterisk');
    }
    
    // Register event handlers
    if (handlers.onCallStart) {
      this.client.on('StasisStart', handlers.onCallStart);
    }
    
    if (handlers.onCallEnd) {
      this.client.on('StasisEnd', handlers.onCallEnd);
    }
    
    // Start the Stasis application
    this.client.start(config.asterisk.appName);
    logger.info(`Stasis application '${config.asterisk.appName}' started`);
  }
}

module.exports = new AsteriskClient();