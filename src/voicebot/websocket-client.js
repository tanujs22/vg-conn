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
    this.callId = null;
    this.socketURL = null;
    this.streamId = null;
  }

  // Generate a unique stream ID for this connection
  generateStreamId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async connect(callId, socketURL) {
    if (this.websocket && this.connected) {
      logger.info('WebSocket already connected');
      return true;
    }
  
    try {
      // Store the callId and socketURL
      this.callId = callId;
      this.socketURL = socketURL;
      this.streamId = this.generateStreamId();
      
      // Build the connection URL
      logger.info(`Connecting to voicebot WebSocket`, { url: socketURL });
      
      // Create a new WebSocket connection
      this.websocket = new WebSocket(socketURL);
      
      // Set up event handlers
      this.websocket.on('open', () => this.handleOpen());
      this.websocket.on('message', (data) => this.handleMessage(data));
      this.websocket.on('error', (error) => this.handleError(error));
      this.websocket.on('close', (code, reason) => this.handleClose(code, reason, callId));
      
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

  handleOpen() {
    this.connected = true;
    this.reconnectAttempts = 0;
    logger.info('Connected to voicebot WebSocket');
    
    // Don't automatically send start event here
    // The call handler will send it at the appropriate time
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
        // Use the stored socketURL that we set in the connect method
        if (this.socketURL) {
          this.connect(callId, this.socketURL).catch(err => {
            logger.error('Reconnection attempt failed', { error: err.message });
          });
        } else {
          logger.error('Cannot reconnect - no socketURL available');
        }
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

  disconnect() {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
      this.connected = false;
      logger.info('Disconnected from voicebot WebSocket');
    }
  }
}

module.exports = VoicebotClient;