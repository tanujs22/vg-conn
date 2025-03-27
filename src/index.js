const asteriskClient = require('./asterisk/ari-client');
const callHandler = require('./asterisk/call-handler');
const logger = require('./utils/logger');

async function main() {
  try {
    // Connect to Asterisk
    await asteriskClient.connect();
    
    // Start the Stasis application with handlers
    asteriskClient.startApplication({
      onCallStart: callHandler.handleCallStart.bind(callHandler),
      onCallEnd: callHandler.handleCallEnd.bind(callHandler)
    });
    
    logger.info('Voicebot connector started and ready for calls');
    
    // Keep the application running
    setInterval(() => {
      logger.debug('Connector alive and listening for calls');
    }, 60000); // Log every minute to show it's still running
    
    // Handle process termination
    process.on('SIGINT', () => {
      logger.info('Shutting down...');
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start connector', { error: error.message });
    process.exit(1);
  }
}

// Start the application
main();