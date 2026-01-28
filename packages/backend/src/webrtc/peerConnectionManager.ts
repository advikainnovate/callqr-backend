/**
 * Peer Connection Manager
 * Manages WebRTC peer connections with security and privacy controls
 */

import { EventEmitter } from 'events';
import { AnonymousSessionId, WebRTCConfiguration, PeerConnectionState, SignalingMessage } from './types';
import { iceServerManager } from './iceServerManager';
import { logger } from '../utils/logger';

export interface PeerConnectionEvents {
  'ice-candidate': (candidate: any, sessionId: AnonymousSessionId) => void;
  'connection-state-change': (state: PeerConnectionState, sessionId: AnonymousSessionId) => void;
  'data-channel': (channel: any, sessionId: AnonymousSessionId) => void;
  'track': (track: any, sessionId: AnonymousSessionId) => void;
}

export class PeerConnectionManager extends EventEmitter {
  private readonly peerConnections: Map<AnonymousSessionId, any>;
  private readonly connectionStates: Map<AnonymousSessionId, PeerConnectionState>;

  constructor() {
    super();
    this.peerConnections = new Map();
    this.connectionStates = new Map();
  }

  /**
   * Create a new peer connection for a session
   */
  public async createPeerConnection(sessionId: AnonymousSessionId): Promise<any> {
    if (this.peerConnections.has(sessionId)) {
      throw new Error(`Peer connection already exists for session: ${sessionId}`);
    }

    const configuration = this.getWebRTCConfiguration();
    
    // Note: In Node.js environment, we would use a WebRTC library like 'wrtc'
    // For now, we'll create a mock implementation that follows the WebRTC API
    const peerConnection = this.createMockPeerConnection(configuration);
    
    this.setupPeerConnectionEventHandlers(peerConnection, sessionId);
    this.peerConnections.set(sessionId, peerConnection);
    
    logger.info(`Created peer connection for session: ${sessionId}`);
    return peerConnection;
  }

  /**
   * Get existing peer connection for a session
   */
  public getPeerConnection(sessionId: AnonymousSessionId): any | undefined {
    return this.peerConnections.get(sessionId);
  }

  /**
   * Close and cleanup peer connection
   */
  public async closePeerConnection(sessionId: AnonymousSessionId): Promise<void> {
    const peerConnection = this.peerConnections.get(sessionId);
    if (!peerConnection) {
      return;
    }

    try {
      peerConnection.close();
      this.peerConnections.delete(sessionId);
      this.connectionStates.delete(sessionId);
      
      logger.info(`Closed peer connection for session: ${sessionId}`);
    } catch (error) {
      logger.error(`Error closing peer connection for session ${sessionId}:`, error as Record<string, unknown>);
    }
  }

  /**
   * Get connection state for a session
   */
  public getConnectionState(sessionId: AnonymousSessionId): PeerConnectionState | undefined {
    return this.connectionStates.get(sessionId);
  }

  /**
   * Process signaling message for peer connection
   */
  public async processSignalingMessage(message: SignalingMessage): Promise<void> {
    const peerConnection = this.peerConnections.get(message.sessionId);
    if (!peerConnection) {
      throw new Error(`No peer connection found for session: ${message.sessionId}`);
    }

    try {
      switch (message.type) {
        case 'offer':
          await peerConnection.setRemoteDescription(message.payload);
          break;
        case 'answer':
          await peerConnection.setRemoteDescription(message.payload);
          break;
        case 'ice-candidate':
          await peerConnection.addIceCandidate(message.payload);
          break;
        default:
          logger.warn(`Unknown signaling message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`Error processing signaling message:`, error as Record<string, unknown>);
      throw error;
    }
  }

  /**
   * Create offer for outgoing call
   */
  public async createOffer(sessionId: AnonymousSessionId): Promise<any> {
    const peerConnection = this.peerConnections.get(sessionId);
    if (!peerConnection) {
      throw new Error(`No peer connection found for session: ${sessionId}`);
    }

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false // Audio only for privacy
    });

    await peerConnection.setLocalDescription(offer);
    return offer;
  }

  /**
   * Create answer for incoming call
   */
  public async createAnswer(sessionId: AnonymousSessionId): Promise<any> {
    const peerConnection = this.peerConnections.get(sessionId);
    if (!peerConnection) {
      throw new Error(`No peer connection found for session: ${sessionId}`);
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    return answer;
  }

  /**
   * Get WebRTC configuration with ICE servers
   */
  private getWebRTCConfiguration(): WebRTCConfiguration {
    const iceServers = iceServerManager.getWebRTCICEServers();
    
    return {
      iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };
  }

  /**
   * Setup event handlers for peer connection
   */
  private setupPeerConnectionEventHandlers(
    peerConnection: any, 
    sessionId: AnonymousSessionId
  ): void {
    peerConnection.onicecandidate = (event: any) => {
      if (event.candidate) {
        this.emit('ice-candidate', event.candidate, sessionId);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state: PeerConnectionState = {
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
        iceGatheringState: peerConnection.iceGatheringState,
        signalingState: peerConnection.signalingState
      };
      
      this.connectionStates.set(sessionId, state);
      this.emit('connection-state-change', state, sessionId);
    };

    peerConnection.ondatachannel = (event: any) => {
      this.emit('data-channel', event.channel, sessionId);
    };

    peerConnection.ontrack = (event: any) => {
      if (event.track) {
        this.emit('track', event.track, sessionId);
      }
    };
  }

  /**
   * Create mock peer connection for Node.js environment
   * In production, this would use a proper WebRTC library like 'wrtc'
   */
  private createMockPeerConnection(configuration: WebRTCConfiguration): any {
    // This is a simplified mock implementation
    // In production, you would use: new RTCPeerConnection(configuration)
    const mockPeerConnection = {
      connectionState: 'new' as string,
      iceConnectionState: 'new' as string,
      iceGatheringState: 'new' as string,
      signalingState: 'stable' as string,
      
      onicecandidate: null as ((event: any) => void) | null,
      onconnectionstatechange: null as (() => void) | null,
      ondatachannel: null as ((event: any) => void) | null,
      ontrack: null as ((event: any) => void) | null,
      
      createOffer: async (options?: any): Promise<any> => {
        return {
          type: 'offer',
          sdp: 'mock-sdp-offer'
        };
      },
      
      createAnswer: async (): Promise<any> => {
        return {
          type: 'answer',
          sdp: 'mock-sdp-answer'
        };
      },
      
      setLocalDescription: async (description: any): Promise<void> => {
        // Mock implementation
      },
      
      setRemoteDescription: async (description: any): Promise<void> => {
        // Mock implementation
      },
      
      addIceCandidate: async (candidate: any): Promise<void> => {
        // Mock implementation
      },
      
      close: (): void => {
        // Mock implementation
      }
    };

    return mockPeerConnection;
  }

  /**
   * Cleanup all peer connections
   */
  public async cleanup(): Promise<void> {
    const sessionIds = Array.from(this.peerConnections.keys());
    await Promise.all(sessionIds.map(sessionId => this.closePeerConnection(sessionId)));
    
    logger.info('Cleaned up all peer connections');
  }
}

export const peerConnectionManager = new PeerConnectionManager();