// src/audio/rtp-server.js
const dgram = require('dgram');
const logger = require('../utils/logger');
const EventEmitter = require('events');

class RTPServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      localPort: 3000,
      remotePort: 3001,
      localAddress: '127.0.0.1',
      remoteAddress: '127.0.0.1',
      payloadType: 0,  // 0 = PCMU (G.711 μ-law)
      sampleRate: 8000,
      frameDuration: 20, // ms
      ...options
    };
    
    this.server = null;
    this.client = null;
    this.running = false;
    this.sequenceNumber = 0;
    this.timestamp = 0;
    this.ssrc = Math.floor(Math.random() * 0xFFFFFFFF); // Random SSRC
  }

  start() {
    if (this.running) return;
    
    logger.info('Starting RTP server', this.options);
    
    // Create UDP socket for receiving RTP packets
    this.server = dgram.createSocket('udp4');
    
    // Set up event handlers
    this.server.on('error', (err) => {
      logger.error('RTP server error', { error: err.message });
      this.emit('error', err);
    });
    
    this.server.on('message', (msg, rinfo) => {
      try {
        // Process RTP packet
        if (msg.length < 12) {
          logger.warn('Received too small RTP packet', { length: msg.length });
          return;
        }
        
        // Extract RTP header information
        const version = (msg[0] >> 6) & 0x03;
        const payloadType = msg[1] & 0x7F;
        const seqNum = msg.readUInt16BE(2);
        const timestamp = msg.readUInt32BE(4);
        const ssrc = msg.readUInt32BE(8);
        
        // Log RTP packet details at debug level
        logger.debug('Received RTP packet', { 
          from: `${rinfo.address}:${rinfo.port}`,
          version, 
          payloadType, 
          seqNum, 
          timestamp,
          ssrc,
          length: msg.length
        });
        
        // Extract audio data from RTP packet (skip the 12-byte RTP header)
        const audioData = msg.slice(12);
        
        // Emit audio data event
        this.emit('audio', audioData);
        
        // For G.711 at 8kHz, each millisecond is 8 samples
        // So a 20ms frame is 160 bytes (8 samples/ms * 20ms * 1 byte/sample)
        this.timestamp += (audioData.length);
      } catch (error) {
        logger.error('Error processing RTP packet', { error: error.message });
      }
    });
    
    this.server.on('listening', () => {
      const address = this.server.address();
      logger.info('RTP server listening', { 
        address: address.address, 
        port: address.port 
      });
      this.running = true;
      this.emit('started');
    });
    
    // Bind to the local port
    this.server.bind(this.options.localPort, this.options.localAddress);
    
    // Create UDP client for sending RTP packets
    this.client = dgram.createSocket('udp4');
  }

  stop() {
    if (!this.running) return;
    
    // Close the server and client
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    
    this.running = false;
    logger.info('RTP server stopped');
    this.emit('stopped');
  }

  sendAudio(audioData) {
    if (!this.running || !this.client) return;
    
    try {
      // Create RTP header (12 bytes)
      const header = Buffer.alloc(12);
      
      // RTP version 2, no padding, no extension, no CSRC
      header[0] = 0x80;
      
      // Payload type: PCMU (G.711 μ-law) = 0
      header[1] = this.options.payloadType;
      
      // Sequence number (16 bits)
      header.writeUInt16BE(this.sequenceNumber & 0xffff, 2);
      this.sequenceNumber++;
      
      // Timestamp (32 bits)
      header.writeUInt32BE(this.timestamp, 4);
      
      // SSRC (32 bits) - use our random identifier
      header.writeUInt32BE(this.ssrc, 8);
      
      // Combine header and audio data
      const packet = Buffer.concat([header, audioData]);
      
      // Log at debug level
      logger.debug('Sending RTP packet', { 
        to: `${this.options.remoteAddress}:${this.options.remotePort}`,
        seqNum: this.sequenceNumber - 1,
        timestamp: this.timestamp,
        audioBytes: audioData.length
      });
      
      // Send the packet
      this.client.send(
        packet, 
        0, 
        packet.length, 
        this.options.remotePort, 
        this.options.remoteAddress,
        (err) => {
          if (err) {
            logger.error('Error sending RTP packet', { error: err.message });
          }
        }
      );
      
      // Update timestamp (8000 samples/sec, so 8 samples/ms)
      // For a typical 20ms packet, that's 160 samples
      this.timestamp += audioData.length;
    } catch (error) {
      logger.error('Error creating RTP packet', { error: error.message });
    }
  }
}

module.exports = RTPServer;