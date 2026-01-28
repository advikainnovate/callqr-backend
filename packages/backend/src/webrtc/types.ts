/**
 * WebRTC Types and Interfaces
 * Defines the core types for WebRTC communication engine
 */

import { AnonymousId, AnonymousSessionId } from '../utils/types';

export { AnonymousId, AnonymousSessionId } from '../utils/types';

export enum CallStatus {
  INITIATING = "initiating",
  RINGING = "ringing",
  CONNECTED = "connected",
  ENDED = "ended",
  FAILED = "failed"
}

export interface EncryptionDetails {
  readonly algorithm: string;
  readonly keyFingerprint: string;
  readonly dtlsFingerprint: string;
}

export interface CallSession {
  readonly sessionId: AnonymousSessionId;
  readonly status: CallStatus;
  readonly encryptionInfo: EncryptionDetails;
  readonly createdAt: Date;
  readonly participantA: AnonymousId;
  readonly participantB: AnonymousId;
}

export interface STUNServerConfig {
  readonly urls: string[];
  readonly username?: string;
  readonly credential?: string;
}

export interface TURNServerConfig {
  readonly urls: string[];
  readonly username: string;
  readonly credential: string;
  readonly credentialType?: 'password' | 'oauth';
}

export interface ICEServerConfig {
  readonly stunServers: STUNServerConfig[];
  readonly turnServers: TURNServerConfig[];
}

export interface SignalingMessage {
  readonly type: 'offer' | 'answer' | 'ice-candidate' | 'call-end' | 'call-start' | 'quality-feedback';
  readonly sessionId: AnonymousSessionId;
  readonly payload: any;
  readonly timestamp: Date;
}

export interface WebRTCConfiguration {
  readonly iceServers: (STUNServerConfig | TURNServerConfig)[];
  readonly iceCandidatePoolSize: number;
  readonly bundlePolicy: 'balanced' | 'max-compat' | 'max-bundle';
  readonly rtcpMuxPolicy: 'negotiate' | 'require';
}

export interface PeerConnectionState {
  readonly connectionState: string; // RTCPeerConnectionState
  readonly iceConnectionState: string; // RTCIceConnectionState
  readonly iceGatheringState: string; // RTCIceGatheringState
  readonly signalingState: string; // RTCSignalingState
}