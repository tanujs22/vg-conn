// src/audio/stream-bridge.js
const EventEmitter = require('events');
const logger = require('../utils/logger');

class AudioStreamBridge extends EventEmitter {
  constructor(callId) {
    super();
    this.callId = callId;
    this.streamId = this.generateUUID();
    this.sequenceNumber = 1; // Start with 1 because 0 was the start event
    this.isStreaming = false;
    this.audioBuffer = Buffer.alloc(0);
    this.chunkSize = 160; // 20ms of μ-law audio at 8kHz = 160 bytes
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  startStreaming() {
    if (this.isStreaming) {
      logger.warn('Audio streaming already started', { callId: this.callId });
      return;
    }
    
    this.isStreaming = true;
    logger.info('Starting audio streaming', { 
      callId: this.callId, 
      streamId: this.streamId 
    });
    
    // Set up interval to emit queued audio chunks
    this.audioInterval = setInterval(() => this.processAudioBuffer(), 20);
  }

  stopStreaming() {
    if (!this.isStreaming) {
      return;
    }
    
    this.isStreaming = false;
    if (this.audioInterval) {
      clearInterval(this.audioInterval);
      this.audioInterval = null;
    }
    
    logger.info('Stopped audio streaming', { callId: this.callId });
  }

  // Process raw audio from Asterisk RTP and send to voicebot
  processAudioFromAsterisk(audioData) {
    if (!this.isStreaming) {
      logger.debug('Ignoring audio, streaming not started', { callId: this.callId });
      return;
    }
    
    // Add to our buffer
    this.audioBuffer = Buffer.concat([this.audioBuffer, audioData]);
    
    // The actual sending happens in the interval timer in processAudioBuffer()
  }

  // Process buffered audio and emit media events
  processAudioBuffer() {
    if (this.audioBuffer.length < this.chunkSize) {
      // Not enough data yet
      return;
    }
    
    // Extract 20ms chunk
    const chunk = this.audioBuffer.slice(0, this.chunkSize);
    this.audioBuffer = this.audioBuffer.slice(this.chunkSize);
    
    // Create media event
    const mediaEvent = this.createMediaEvent(chunk);
    
    // Emit event to be sent to WebSocket
    this.emit('outgoing_media', mediaEvent);
    
    // Increment sequence number
    this.sequenceNumber++;
  }

  // Process media events from the voicebot and extract audio for Asterisk
  processAudioFromVoicebot(mediaEvent) {
    try {
      if (!mediaEvent || !mediaEvent.media || !mediaEvent.media.payload) {
        logger.error('Invalid media event from voicebot', { 
          callId: this.callId, 
          event: mediaEvent 
        });
        return;
      }
      
      // Decode base64 audio payload
      const audioData = Buffer.from(mediaEvent.media.payload, 'base64');
      
      // Emit event to be sent to Asterisk
      this.emit('incoming_audio', audioData);
    } catch (error) {
      logger.error('Error processing audio from voicebot', {
        callId: this.callId,
        error: error.message
      });
    }
  }

  // Create a media event with proper format for voicebot
  createMediaEvent(audioChunk) {
    return {
      sequenceNumber: this.sequenceNumber,
      streamId: this.streamId,
      event: "media",
      media: {
        track: "inbound",
        timestamp: Date.now().toString(),
        chunk: this.sequenceNumber,
        payload: audioChunk.toString('base64')
      }
    };
  }

  // Create a disconnect event for voicebot
  createDisconnectEvent(reason = "Call ended") {
    return {
      sequenceNumber: this.sequenceNumber,
      streamId: this.streamId,
      event: "disconnect",
      disconnect: {
        reason: reason
      }
    };
  }
}

module.exports = AudioStreamBridge;