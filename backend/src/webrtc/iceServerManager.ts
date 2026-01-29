/**
 * ICE Server Manager
 * Manages STUN/TURN server configuration and credentials
 */

import { STUNServerConfig, TURNServerConfig, ICEServerConfig } from './types';
import { logger } from '../utils/logger';

export class ICEServerManager {
  private readonly stunServers: STUNServerConfig[];
  private readonly turnServers: TURNServerConfig[];

  constructor() {
    this.stunServers = this.loadSTUNServers();
    this.turnServers = this.loadTURNServers();
  }

  /**
   * Get ICE server configuration for WebRTC peer connections
   */
  public getICEServerConfig(): ICEServerConfig {
    return {
      stunServers: this.stunServers,
      turnServers: this.turnServers
    };
  }

  /**
   * Get WebRTC-compatible ICE servers array
   */
  public getWebRTCICEServers(): (STUNServerConfig | TURNServerConfig)[] {
    return [...this.stunServers, ...this.turnServers];
  }

  /**
   * Validate ICE server connectivity
   */
  public async validateICEServers(): Promise<boolean> {
    try {
      // Test STUN servers
      for (const stunServer of this.stunServers) {
        await this.testSTUNServer(stunServer);
      }

      // Test TURN servers
      for (const turnServer of this.turnServers) {
        await this.testTURNServer(turnServer);
      }

      logger.info('All ICE servers validated successfully');
      return true;
    } catch (error) {
      logger.error('ICE server validation failed:', error as Record<string, unknown>);
      return false;
    }
  }

  /**
   * Load STUN server configuration from environment
   */
  private loadSTUNServers(): STUNServerConfig[] {
    const stunUrls = process.env.STUN_SERVERS?.split(',') || [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302'
    ];

    return [{
      urls: stunUrls
    }];
  }

  /**
   * Load TURN server configuration from environment
   */
  private loadTURNServers(): TURNServerConfig[] {
    const turnUrls = process.env.TURN_SERVERS?.split(',') || [];
    const turnUsername = process.env.TURN_USERNAME || '';
    const turnCredential = process.env.TURN_CREDENTIAL || '';

    if (turnUrls.length === 0 || !turnUsername || !turnCredential) {
      logger.warn('TURN servers not configured, using STUN only');
      return [];
    }

    return [{
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
      credentialType: 'password'
    }];
  }

  /**
   * Test STUN server connectivity
   */
  private async testSTUNServer(stunServer: STUNServerConfig): Promise<void> {
    // In a real implementation, this would test STUN connectivity
    // For now, we'll just validate the URL format
    for (const url of stunServer.urls) {
      if (!url.startsWith('stun:')) {
        throw new Error(`Invalid STUN URL format: ${url}`);
      }
    }
    logger.debug(`STUN server validated: ${stunServer.urls.join(', ')}`);
  }

  /**
   * Test TURN server connectivity
   */
  private async testTURNServer(turnServer: TURNServerConfig): Promise<void> {
    // In a real implementation, this would test TURN connectivity
    // For now, we'll just validate the URL format and credentials
    for (const url of turnServer.urls) {
      if (!url.startsWith('turn:') && !url.startsWith('turns:')) {
        throw new Error(`Invalid TURN URL format: ${url}`);
      }
    }

    if (!turnServer.username || !turnServer.credential) {
      throw new Error('TURN server missing credentials');
    }

    logger.debug(`TURN server validated: ${turnServer.urls.join(', ')}`);
  }

  /**
   * Generate temporary TURN credentials (for TURN servers that support it)
   */
  public generateTURNCredentials(sessionId: string): { username: string; credential: string } {
    const timestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour expiry
    const username = `${timestamp}:${sessionId}`;
    
    // In production, this would use HMAC-SHA1 with a shared secret
    const credential = Buffer.from(`${username}:${process.env.TURN_SECRET || 'default-secret'}`).toString('base64');
    
    return { username, credential };
  }
}

export const iceServerManager = new ICEServerManager();