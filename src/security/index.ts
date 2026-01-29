/**
 * Security Module Index
 * 
 * Exports all security components for the privacy-preserving QR-based calling system.
 * Provides a clean interface for importing security functionality.
 */

// Core types
export * from './types';

// Token generation
export * from './tokenGenerator';

// Token validation
export * from './tokenValidator';

// Token hashing
export * from './tokenHasher';

// Token storage
export * from './tokenStorage';

// Token management (high-level interface)
export * from './tokenManager';

// QR code generation
export * from './qrCodeGenerator';

// Default instances for common use
export { defaultTokenGenerator } from './tokenGenerator';
export { defaultTokenValidator, TokenValidationUtils } from './tokenValidator';
export { defaultTokenHasher, defaultTokenLookupUtils } from './tokenHasher';
export { defaultTokenStorage } from './tokenStorage';

// Factory for creating configured token managers and QR generators
export { TokenManagerFactory } from './tokenManager';
export { QRCodeGeneratorFactory } from './qrCodeGenerator';