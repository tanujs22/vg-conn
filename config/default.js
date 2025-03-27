// Load environment variables
require('dotenv').config();

module.exports = {
  asterisk: {
    url: process.env.ASTERISK_URL || 'http://localhost:8088',
    username: process.env.ASTERISK_USERNAME || 'asterisk',
    password: process.env.ASTERISK_PASSWORD || 'asterisk',
    appName: process.env.ASTERISK_APP_NAME || 'voicebot-connector'
  },
  voicebot: {
    incomingCallUrl: process.env.VOICEBOT_INCOMING_CALL_URL,
    maxReconnectAttempts: parseInt(process.env.VOICEBOT_MAX_RECONNECT || '10'),
    reconnectInterval: parseInt(process.env.VOICEBOT_RECONNECT_INTERVAL || '3000')
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs/connector.log'
  }
};