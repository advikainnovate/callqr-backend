/**
 * WebRTC Signaling Server
 * Handles secure signaling for WebRTC peer connections
 */

import WebSocket from 'ws';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { AnonymousSessionId, SignalingMessage } from './types';
import { peerConnectionManager } from './peerConnectionManager';
import { secureSignalingProtocol, SecureSignalingMessage } from './secureSignaling';
import { encryptionManager } from './encryptionManager';
import { connectionSecurityManager } from './connectionSecurity';
import { logger } from '../utils/logger';

export interface SignalingServerConfig {
  port: number;
  httpsOptions?: {
    key: string;
    cert: string;
  };
}

export class SignalingServer {
  private wss: WebSocket.Server | null = null;
  private readonly sessionConnections: Map<AnonymousSessionId, Set<WebSocket>>;
  private readonly connectionSessions: Map<WebSocket, AnonymousSessionId>;

  constructor() {
    this.sessionConnections = new Map();
    this.connectionSessions = new Map();
  }

  /**
   * Start the signaling server with HTTPS/WSS support
   */
  public async start(config: SignalingServerConfig): Promise<void> {
    try {
      let server;
      
      if (config.httpsOptions) {
        // Create HTTPS server for secure WebSocket connections
        const httpsOptions = {
          key: readFileSync(config.httpsOptions.key),
          cert: readFileSync(config.httpsOptions.cert)
        };
        server = createServer(httpsOptions);
      }

      this.wss = new WebSocket.Server({
        port: config.port,
        server: server,
        verifyClient: this.verifyClient.bind(this)
      });

      this.setupWebSocketHandlers();
      
      if (server) {
        server.listen(config.port);
      }

      logger.info(`Signaling server started on port ${config.port} with ${config.httpsOptions ? 'HTTPS/WSS' : 'HTTP/WS'}`);
    } catch (error) {
      logger.error('Failed to start signaling server:', error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Stop the signaling server
   */
  public async stop(): Promise<void> {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      this.sessionConnections.clear();
      this.connectionSessions.clear();
      logger.info('Signaling server stopped');
    }
  }

  /**
   * Send secure signaling message to specific session participants
   */
  public sendToSession(sessionId: AnonymousSessionId, message: SignalingMessage, excludeConnection?: WebSocket): void {
    const connections = this.sessionConnections.get(sessionId);
    if (!connections) {
      logger.warn(`No connections found for session: ${sessionId}`);
      return;
    }

    // Create secure message
    const secureMessage = secureSignalingProtocol.createSecureMessage(
      sessionId,
      message.type,
      message.payload,
      true // Encrypt by default
    );

    const messageStr = JSON.stringify(secureMessage);
    
    connections.forEach(connection => {
      if (connection !== excludeConnection && connection.readyState === WebSocket.OPEN) {
        try {
          connection.send(messageStr);
        } catch (error) {
          logger.error('Error sending secure message to connection:', error as Record<string, unknown>);
          this.removeConnection(connection);
        }
      }
    });
  }

  /**
   * Add connection to session
   */
  public addConnectionToSession(connection: WebSocket, sessionId: AnonymousSessionId): void {
    // Remove from previous session if exists
    const previousSession = this.connectionSessions.get(connection);
    if (previousSession) {
      this.removeConnectionFromSession(connection, previousSession);
    }

    // Add to new session
    if (!this.sessionConnections.has(sessionId)) {
      this.sessionConnections.set(sessionId, new Set());
    }
    
    this.sessionConnections.get(sessionId)!.add(connection);
    this.connectionSessions.set(connection, sessionId);
    
    logger.debug(`Added connection to session: ${sessionId}`);
  }

  /**
   * Remove connection from session
   */
  public removeConnectionFromSession(connection: WebSocket, sessionId: AnonymousSessionId): void {
    const connections = this.sessionConnections.get(sessionId);
    if (connections) {
      connections.delete(connection);
      if (connections.size === 0) {
        this.sessionConnections.delete(sessionId);
      }
    }
    
    this.connectionSessions.delete(connection);
    logger.debug(`Removed connection from session: ${sessionId}`);
  }

  /**
   * Verify client connection with security validation
   */
  private verifyClient(info: { origin: string; secure: boolean; req: any }): boolean {
    // Require secure connections in production
    if (!info.secure && process.env.NODE_ENV === 'production') {
      logger.warn('Rejected non-secure connection in production');
      return false;
    }

    // Validate origin if specified
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    if (allowedOrigins.length > 0 && !allowedOrigins.includes(info.origin)) {
      logger.warn(`Rejected connection from unauthorized origin: ${info.origin}`);
      return false;
    }

    // Additional security checks can be added here
    // For example, rate limiting, IP whitelisting, etc.

    return true;
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.wss) return;

    this.wss.on('connection', async (ws: WebSocket, request) => {
      logger.debug('New WebSocket connection established');

      try {
        // Validate connection security
        const sessionId = `temp_${Date.now()}` as AnonymousSessionId;
        await connectionSecurityManager.validateConnectionSecurity(sessionId, {
          tlsVersion: (request.socket as any).getProtocol?.() || 'TLSv1.2',
          cipherSuite: (request.socket as any).getCipher?.()?.name || 'unknown',
          remoteAddress: request.socket.remoteAddress
        });

        const securityInfo = connectionSecurityManager.getSessionSecurity(sessionId);
        if (securityInfo && securityInfo.errors.length > 0) {
          logger.warn(`Connection security issues: ${securityInfo.errors.join(', ')}`);
          // In production, you might want to close insecure connections
          if (process.env.NODE_ENV === 'production' && securityInfo.securityLevel < 50) {
            ws.close(1008, 'Connection does not meet security requirements');
            return;
          }
        }
      } catch (error) {
        logger.error('Connection security validation failed:', error as Record<string, unknown>);
        if (process.env.NODE_ENV === 'production') {
          ws.close(1008, 'Security validation failed');
          return;
        }
      }

      ws.on('message', async (data: WebSocket.Data) => {
        try {
          await this.handleMessage(ws, data);
        } catch (error) {
          logger.error('Error handling WebSocket message:', error as Record<string, unknown>);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', (code: number, reason: string) => {
        logger.debug(`WebSocket connection closed: ${code} - ${reason}`);
        this.removeConnection(ws);
      });

      ws.on('error', (error: Error) => {
        logger.error('WebSocket connection error:', { message: error.message, stack: error.stack });
        this.removeConnection(ws);
      });

      // Send connection acknowledgment
      this.sendMessage(ws, {
        type: 'connection-ack',
        timestamp: new Date()
      });
    });
  }

  /**
   * Handle incoming WebSocket message with security validation
   */
  private async handleMessage(ws: WebSocket, data: WebSocket.Data): Promise<void> {
    const rawMessage = JSON.parse(data.toString());
    
    // Validate and decrypt secure message
    let message: SignalingMessage;
    try {
      if (this.isSecureSignalingMessage(rawMessage)) {
        message = secureSignalingProtocol.validateSecureMessage(rawMessage);
      } else {
        // Handle legacy non-encrypted messages (for initial handshake)
        if (!this.isValidSignalingMessage(rawMessage)) {
          throw new Error('Invalid signaling message format');
        }
        message = {
          ...rawMessage,
          timestamp: new Date()
        };
      }
    } catch (error) {
      logger.error('Message validation failed:', error as Record<string, unknown>);
      this.sendError(ws, 'Message validation failed');
      return;
    }

    switch (message.type) {
      case 'call-start':
        await this.handleCallStart(ws, message);
        break;
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        await this.handleWebRTCSignaling(ws, message);
        break;
      case 'call-end':
        await this.handleCallEnd(ws, message);
        break;
      default:
        logger.warn(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle call start message with encryption setup
   */
  private async handleCallStart(ws: WebSocket, message: SignalingMessage): Promise<void> {
    const sessionId = message.sessionId;
    
    // Generate encryption configuration for the session
    try {
      await encryptionManager.generateEncryptionConfig(sessionId);
      await secureSignalingProtocol.generateSignalingKeys(sessionId);
    } catch (error) {
      logger.error(`Failed to setup encryption for session ${sessionId}:`, error as Record<string, unknown>);
      this.sendError(ws, 'Failed to setup secure communication');
      return;
    }
    
    // Add connection to session
    this.addConnectionToSession(ws, sessionId);
    
    // Create peer connection if it doesn't exist
    if (!peerConnectionManager.getPeerConnection(sessionId)) {
      await peerConnectionManager.createPeerConnection(sessionId);
    }
    
    // Notify other participants with secure message
    this.sendToSession(sessionId, message, ws);
    
    logger.info(`Secure call started for session: ${sessionId}`);
  }

  /**
   * Handle WebRTC signaling messages
   */
  private async handleWebRTCSignaling(ws: WebSocket, message: SignalingMessage): Promise<void> {
    const sessionId = message.sessionId;
    
    // Process the signaling message through peer connection manager
    await peerConnectionManager.processSignalingMessage(message);
    
    // Forward to other participants in the session
    this.sendToSession(sessionId, message, ws);
    
    logger.debug(`Processed ${message.type} for session: ${sessionId}`);
  }

  /**
   * Handle call end message with cleanup
   */
  private async handleCallEnd(ws: WebSocket, message: SignalingMessage): Promise<void> {
    const sessionId = message.sessionId;
    
    // Close peer connection
    await peerConnectionManager.closePeerConnection(sessionId);
    
    // Cleanup encryption data
    secureSignalingProtocol.cleanupSession(sessionId);
    
    // Notify other participants
    this.sendToSession(sessionId, message, ws);
    
    // Remove all connections from session
    const connections = this.sessionConnections.get(sessionId);
    if (connections) {
      connections.forEach(connection => {
        this.removeConnectionFromSession(connection, sessionId);
      });
    }
    
    logger.info(`Secure call ended for session: ${sessionId}`);
  }

  /**
   * Validate signaling message format
   */
  private isValidSignalingMessage(message: any): boolean {
    return (
      message &&
      typeof message.type === 'string' &&
      typeof message.sessionId === 'string' &&
      ['call-start', 'offer', 'answer', 'ice-candidate', 'call-end'].includes(message.type)
    );
  }

  /**
   * Check if message is a secure signaling message
   */
  private isSecureSignalingMessage(message: any): message is SecureSignalingMessage {
    return (
      this.isValidSignalingMessage(message) &&
      typeof message.messageId === 'string' &&
      typeof message.integrity === 'string' &&
      typeof message.encrypted === 'boolean'
    );
  }

  /**
   * Send message to WebSocket connection
   */
  private sendMessage(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error('Error sending message:', error as Record<string, unknown>);
      }
    }
  }

  /**
   * Send error message to WebSocket connection
   */
  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: 'error',
      message: error,
      timestamp: new Date()
    });
  }

  /**
   * Remove connection and cleanup with security cleanup
   */
  private removeConnection(ws: WebSocket): void {
    const sessionId = this.connectionSessions.get(ws);
    if (sessionId) {
      this.removeConnectionFromSession(ws, sessionId);
      // Cleanup security data when session ends
      connectionSecurityManager.cleanupSession(sessionId);
    }
  }
}

export const signalingServer = new SignalingServer();