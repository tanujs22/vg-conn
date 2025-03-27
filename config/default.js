// Load environment variables
require('dotenv').config();

module.exports = {
  asterisk: {
    url: process.env.ASTERISK_URL || 'http://localhost:8088',
    username: process.env.ASTERISK_USERNAME || 'asterisk',
    password: process.env.ASTERISK_PASSWORD || 'asterisk',
    appName: process.env.ASTERISK_APP_NAME || 'voicebot-connector'
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs/connector.log'
  }
};