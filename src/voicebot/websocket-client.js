const WebSocket = require('ws');
const logger = require('../utils/logger');
const EventEmitter = require('events');

class VoicebotClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.websocket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectInterval = config.reconnectInterval || 3000;
  }

  handleOpen() {
    this.connected = true;
    this.reconnectAttempts = 0;
    logger.info('Connected to voicebot WebSocket');
    
    // Send the start event as soon as we connect
    const startEvent = {
      sequenceNumber: 0,
      event: "start",
      start: {
        callId: this.callId,
        streamId: this.generateStreamId(), // We'll add this method
        accountId: "10144634", // This could be configurable
        tracks: ["inbound"],
        mediaFormat: {
          encoding: "mulaw",
          sampleRate: 8000
        }
      }
    };
    
    this.sendControl(startEvent);
    logger.info('Sent start event to voicebot', { callId: this.callId });
    
    this.emit('connected');
  }


async connect(callId, socketURL) {
  if (this.websocket && this.connected) {
    logger.info('WebSocket already connected');
    return true;
  }

  try {
    // Store the callId for use in the start event
    this.callId = callId;
    
    // Build the connection URL with call ID
    const url = `${socketURL}`;  // No need to append call_id as query parameter
    logger.info(`Connecting to voicebot WebSocket`, { url });
    
    // Create a new WebSocket connection
    this.websocket = new WebSocket(url);
    
    // Set up event handlers
    this.websocket.on('open', () => this.handleOpen());
    this.websocket.on('message', (data) => this.handleMessage(data));
    this.websocket.on('error', (error) => this.handleError(error));
    this.websocket.on('close', (code, reason) => this.handleClose(code, reason, callId, socketURL));
    
    // Wait for connection to be established
    return new Promise((resolve) => {
      this.once('connected', () => resolve(true));
      this.once('connection_failed', () => resolve(false));
    });
  } catch (error) {
    logger.error('Error creating WebSocket connection', { error: error.message });
    return false;
  }
}
  
  // Also update the handleClose method to include the socketURL for reconnection:
  handleClose(code, reason, callId, socketURL) {
    this.connected = false;
    logger.info('WebSocket connection closed', { code, reason });
    
    // Store the socketURL in the class instance
    this.socketURL = socketURL;
    
    // Attempt to reconnect if needed
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        // Use the stored socketURL
        this.connect(callId, this.socketURL).catch(err => {
          logger.error('Reconnection attempt failed', { error: err.message });
        });
      }, this.reconnectInterval);
    } else {
      logger.error('Max reconnection attempts reached');
      this.emit('connection_failed');
    }
  }

  handleOpen() {
    this.connected = true;
    this.reconnectAttempts = 0;
    logger.info('Connected to voicebot WebSocket');
    this.emit('connected');
  }

  handleMessage(data) {
    try {
      // Check if this is a text message (could be control or media)
      if (typeof data === 'string') {
        const message = JSON.parse(data);
        
        // Check if this is a media event
        if (message.event === 'media' && message.media && message.media.payload) {
          logger.debug('Received media from voicebot');
          this.emit('media', message);
        } else {
          // This is a control message
          logger.debug('Received control message from voicebot', { message });
          this.emit('control', message);
        }
      } else {
        // This is a binary message (rare but possible)
        logger.debug('Received binary data from voicebot', { 
          byteLength: data.byteLength 
        });
        this.emit('binary', data);
      }
    } catch (error) {
      logger.error('Error processing message from voicebot', { 
        error: error.message 
      });
    }
  }

  handleError(error) {
    logger.error('WebSocket error', { error: error.message });
    this.emit('error', error);
  }

  handleClose(code, reason, callId) {
    this.connected = false;
    logger.info('WebSocket connection closed', { code, reason });
    
    // Attempt to reconnect if needed
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect(callId).catch(err => {
          logger.error('Reconnection attempt failed', { error: err.message });
        });
      }, this.reconnectInterval);
    } else {
      logger.error('Max reconnection attempts reached');
      this.emit('connection_failed');
    }
  }

  sendAudio(audioData) {
    if (!this.connected || !this.websocket) {
      logger.error('Cannot send audio: WebSocket not connected');
      return false;
    }
    
    try {
      this.websocket.send(audioData, { binary: true });
      return true;
    } catch (error) {
      logger.error('Error sending audio to voicebot', { error: error.message });
      return false;
    }
  }

  sendControl(message) {
    if (!this.connected || !this.websocket) {
      logger.error('Cannot send control message: WebSocket not connected');
      return false;
    }
    
    try {
      const data = JSON.stringify(message);
      this.websocket.send(data);
      return true;
    } catch (error) {
      logger.error('Error sending control message to voicebot', { 
        error: error.message 
      });
      return false;
    }
  }

  disconnect() {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
      this.connected = false;
      logger.info('Disconnected from voicebot WebSocket');
    }
  }

  sendMediaEvent(mediaEvent) {
    if (!this.connected || !this.websocket) {
      logger.error('Cannot send media event: WebSocket not connected');
      return false;
    }
    
    try {
      const data = JSON.stringify(mediaEvent);
      this.websocket.send(data);
      return true;
    } catch (error) {
      logger.error('Error sending media event to voicebot', { 
        error: error.message 
      });
      return false;
    }
  }
  
  sendDisconnectEvent(disconnectEvent) {
    if (!this.connected || !this.websocket) {
      logger.error('Cannot send disconnect event: WebSocket not connected');
      return false;
    }
    
    try {
      const data = JSON.stringify(disconnectEvent);
      this.websocket.send(data);
      logger.info('Sent disconnect event to voicebot');
      return true;
    } catch (error) {
      logger.error('Error sending disconnect event to voicebot', { 
        error: error.message 
      });
      return false;
    }
  }
}

module.exports = VoicebotClient;