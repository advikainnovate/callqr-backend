/**
 * Socket.IO Client Example with Rate Limit Handling
 * 
 * This example shows how to properly handle rate limiting on the client side
 */

const io = require('socket.io-client');

class RateLimitAwareSocketClient {
  constructor(url, token) {
    this.socket = io(url, {
      auth: { token },
      transports: ['websocket'],
    });

    this.rateLimitedEvents = new Set();
    this.setupRateLimitHandling();
    this.setupEventHandlers();
  }

  setupRateLimitHandling() {
    // Listen for rate limit events
    this.socket.on('rate-limit-exceeded', ({ event, message, retryAfter }) => {
      console.warn(`⚠️ Rate limit exceeded for event: ${event}`);
      console.warn(`Message: ${message}`);
      console.warn(`Retry after: ${retryAfter} seconds`);

      // Mark event as rate limited
      this.rateLimitedEvents.add(event);

      // Show user-friendly notification
      this.showRateLimitNotification(event, message, retryAfter);

      // Auto-remove after retry period
      setTimeout(() => {
        this.rateLimitedEvents.delete(event);
        console.log(`✅ Rate limit cleared for event: ${event}`);
      }, retryAfter * 1000);
    });

    // Handle connection errors
    this.socket.on('connect_error', (error) => {
      if (error.message.includes('Too many connections')) {
        console.error('❌ Connection rate limit exceeded. Please wait before reconnecting.');
        this.showConnectionRateLimitError(error.message);
      } else {
        console.error('Connection error:', error.message);
      }
    });
  }

  setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log('✅ Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
    });

    // Handle server shutdown notification
    this.socket.on('server-shutdown', ({ reason, message, timestamp }) => {
      console.warn('🔴 SERVER SHUTDOWN NOTIFICATION');
      console.warn(`Reason: ${reason}`);
      console.warn(`Message: ${message}`);
      console.warn(`Time: ${timestamp}`);
      
      this.handleServerShutdown(reason, message);
    });

    // WebRTC signaling
    this.socket.on('webrtc-signal', (data) => {
      console.log('Received WebRTC signal:', data.type);
      this.handleWebRTCSignal(data);
    });

    // Call events
    this.socket.on('incoming-call', (data) => {
      console.log('Incoming call from:', data.callerId);
      this.handleIncomingCall(data);
    });

    this.socket.on('call-accepted', (data) => {
      console.log('Call accepted:', data.callId);
      this.handleCallAccepted(data);
    });

    this.socket.on('call-rejected', (data) => {
      console.log('Call rejected:', data.callId);
      this.handleCallRejected(data);
    });

    this.socket.on('call-ended', (data) => {
      console.log('Call ended:', data.callId);
      this.handleCallEnded(data);
    });

    // Chat events
    this.socket.on('new-message', (data) => {
      console.log('New message in chat:', data.chatSessionId);
      this.handleNewMessage(data);
    });

    this.socket.on('user-typing', (data) => {
      console.log('User typing:', data.userId);
      this.handleUserTyping(data);
    });

    this.socket.on('user-stopped-typing', (data) => {
      console.log('User stopped typing:', data.userId);
      this.handleUserStoppedTyping(data);
    });
  }

  // Safe emit with rate limit checking
  safeEmit(event, data, callback) {
    if (this.rateLimitedEvents.has(event)) {
      console.warn(`⚠️ Event ${event} is currently rate limited. Request blocked.`);
      if (callback) {
        callback(new Error('Rate limit active'));
      }
      return false;
    }

    this.socket.emit(event, data, callback);
    return true;
  }

  // WebRTC Methods
  sendWebRTCSignal(callId, targetUserId, type, data) {
    return this.safeEmit('webrtc-signal', {
      callId,
      targetUserId,
      type,
      data,
    });
  }

  initiateCall(callId) {
    return this.safeEmit('initiate-call', { callId });
  }

  acceptCall(callId) {
    return this.safeEmit('accept-call', { callId });
  }

  rejectCall(callId) {
    return this.safeEmit('reject-call', { callId });
  }

  endCall(callId) {
    return this.safeEmit('end-call', { callId });
  }

  // Chat Methods
  joinChat(chatSessionId) {
    return this.safeEmit('join-chat', { chatSessionId });
  }

  leaveChat(chatSessionId) {
    return this.safeEmit('leave-chat', { chatSessionId });
  }

  sendMessage(chatSessionId, messageId) {
    return this.safeEmit('chat-message', { chatSessionId, messageId });
  }

  // Throttled typing indicators
  startTyping(chatSessionId) {
    // Throttle typing events to avoid rate limits
    if (!this.typingThrottle) {
      this.typingThrottle = {};
    }

    const now = Date.now();
    const lastTyping = this.typingThrottle[chatSessionId] || 0;

    // Only send if 2 seconds have passed
    if (now - lastTyping > 2000) {
      this.typingThrottle[chatSessionId] = now;
      return this.safeEmit('typing-start', { chatSessionId });
    }

    return false;
  }

  stopTyping(chatSessionId) {
    return this.safeEmit('typing-stop', { chatSessionId });
  }

  markMessageAsRead(chatSessionId, messageId) {
    return this.safeEmit('message-read', { chatSessionId, messageId });
  }

  // UI Notification Methods (implement based on your UI framework)
  showRateLimitNotification(event, message, retryAfter) {
    // Example: Show toast notification
    console.log(`
╔════════════════════════════════════════╗
║        RATE LIMIT EXCEEDED             ║
╠════════════════════════════════════════╣
║ Event: ${event.padEnd(32)} ║
║ ${message.padEnd(38)} ║
║ Retry after: ${retryAfter}s${' '.repeat(25)} ║
╚════════════════════════════════════════╝
    `);
  }

  showConnectionRateLimitError(message) {
    console.error(`
╔════════════════════════════════════════╗
║    CONNECTION RATE LIMIT EXCEEDED      ║
╠════════════════════════════════════════╣
║ ${message.padEnd(38)} ║
║ Please wait before reconnecting        ║
╚════════════════════════════════════════╝
    `);
  }

  // Event handlers (implement based on your application logic)
  handleWebRTCSignal(data) {
    // Handle incoming WebRTC signals
  }

  handleIncomingCall(data) {
    // Show incoming call UI
  }

  handleCallAccepted(data) {
    // Start WebRTC connection
  }

  handleCallRejected(data) {
    // Show call rejected notification
  }

  handleCallEnded(data) {
    // Clean up call resources
  }

  handleNewMessage(data) {
    // Display new message in chat
  }

  handleUserTyping(data) {
    // Show typing indicator
  }

  handleUserStoppedTyping(data) {
    // Hide typing indicator
  }

  handleServerShutdown(reason, message) {
    // Clean up resources
    console.log('🧹 Cleaning up resources before shutdown...');
    
    // Stop any ongoing calls
    // Save any pending messages
    // Clear local state
    
    // Show user notification
    console.log(`
╔════════════════════════════════════════╗
║       SERVER SHUTTING DOWN             ║
╠════════════════════════════════════════╣
║ ${reason.padEnd(38)} ║
║ ${message.padEnd(38)} ║
║                                        ║
║ The connection will be closed shortly. ║
║ Please reconnect in a few moments.     ║
╚════════════════════════════════════════╝
    `);
    
    // Optionally attempt reconnection after delay
    setTimeout(() => {
      console.log('🔄 Attempting to reconnect...');
      this.socket.connect();
    }, 5000);
  }

  disconnect() {
    this.socket.disconnect();
  }
}

// Usage Example
if (require.main === module) {
  const client = new RateLimitAwareSocketClient(
    'http://localhost:3000',
    'your-jwt-token-here'
  );

  // Example: Send multiple messages (will hit rate limit)
  setTimeout(() => {
    console.log('\n📤 Testing chat message rate limit...\n');
    
    for (let i = 0; i < 35; i++) {
      const success = client.sendMessage('test-chat-123', `msg-${i}`);
      if (!success) {
        console.log(`Message ${i} blocked by client-side rate limit check`);
      }
    }
  }, 2000);

  // Example: Test typing throttling
  setTimeout(() => {
    console.log('\n⌨️  Testing typing indicator throttling...\n');
    
    // Rapid typing events (will be throttled client-side)
    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        client.startTyping('test-chat-123');
      }, i * 100);
    }
  }, 5000);

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n👋 Disconnecting...');
    client.disconnect();
    process.exit(0);
  });
}

module.exports = RateLimitAwareSocketClient;
