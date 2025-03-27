const express = require('express');
const asteriskClient = require('./asterisk/ari-client');
const callHandler = require('./asterisk/call-handler');
const logger = require('./utils/logger');

async function main() {
  try {
    // Set up a simple HTTP server to keep the app running and provide status
    const app = express();
    const port = process.env.PORT || 3000;
    
    app.get('/status', (req, res) => {
      res.json({
        status: 'running',
        asteriskConnected: asteriskClient.connected,
        activeCalls: Array.from(callHandler.activeCalls.keys())
      });
    });
    
    app.listen(port, () => {
      logger.info(`Status server listening on port ${port}`);
    });
    
    // Connect to Asterisk
    await asteriskClient.connect();
    
    // Start the Stasis application with handlers
    asteriskClient.startApplication({
      onCallStart: callHandler.handleCallStart.bind(callHandler),
      onCallEnd: callHandler.handleCallEnd.bind(callHandler)
    });
    
    logger.info('Voicebot connector started and ready for calls');
    
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