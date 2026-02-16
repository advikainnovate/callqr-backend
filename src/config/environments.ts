/**
 * Environment-specific configurations
 * Provides different settings for development, staging, and production
 */

export interface EnvironmentConfig {
  name: string;
  isDevelopment: boolean;
  isProduction: boolean;
  isStaging: boolean;
  features: {
    enableDebugLogs: boolean;
    enableSwagger: boolean;
    enableDetailedErrors: boolean;
  };
  security: {
    requireStrongPasswords: boolean;
    enableRateLimiting: boolean;
    maxLoginAttempts: number;
    lockoutDuration: number; // minutes
  };
  files: {
    maxFileSize: number; // bytes
    allowedMimeTypes: string[];
    uploadPath: string;
  };
  email: {
    enabled: boolean;
    verificationRequired: boolean;
  };
}

const development: EnvironmentConfig = {
  name: 'development',
  isDevelopment: true,
  isProduction: false,
  isStaging: false,
  features: {
    enableDebugLogs: true,
    enableSwagger: true,
    enableDetailedErrors: true,
  },
  security: {
    requireStrongPasswords: false,
    enableRateLimiting: false,
    maxLoginAttempts: 10,
    lockoutDuration: 5,
  },
  files: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'],
    uploadPath: 'uploads',
  },
  email: {
    enabled: false,
    verificationRequired: false,
  },
};

const staging: EnvironmentConfig = {
  name: 'staging',
  isDevelopment: false,
  isProduction: false,
  isStaging: true,
  features: {
    enableDebugLogs: true,
    enableSwagger: true,
    enableDetailedErrors: true,
  },
  security: {
    requireStrongPasswords: true,
    enableRateLimiting: true,
    maxLoginAttempts: 5,
    lockoutDuration: 15,
  },
  files: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'],
    uploadPath: 'uploads',
  },
  email: {
    enabled: true,
    verificationRequired: false,
  },
};

const production: EnvironmentConfig = {
  name: 'production',
  isDevelopment: false,
  isProduction: true,
  isStaging: false,
  features: {
    enableDebugLogs: false,
    enableSwagger: false,
    enableDetailedErrors: false,
  },
  security: {
    requireStrongPasswords: true,
    enableRateLimiting: true,
    maxLoginAttempts: 3,
    lockoutDuration: 30,
  },
  files: {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    uploadPath: 'uploads',
  },
  email: {
    enabled: true,
    verificationRequired: true,
  },
};

const test: EnvironmentConfig = {
  name: 'test',
  isDevelopment: true,
  isProduction: false,
  isStaging: false,
  features: {
    enableDebugLogs: false,
    enableSwagger: false,
    enableDetailedErrors: true,
  },
  security: {
    requireStrongPasswords: false,
    enableRateLimiting: false,
    maxLoginAttempts: 100,
    lockoutDuration: 1,
  },
  files: {
    maxFileSize: 1 * 1024 * 1024, // 1MB
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    uploadPath: 'test-uploads',
  },
  email: {
    enabled: false,
    verificationRequired: false,
  },
};

const environments: Record<string, EnvironmentConfig> = {
  development,
  staging,
  production,
  test,
};

export const getEnvironmentConfig = (env: string = 'development'): EnvironmentConfig => {
  return environments[env] || development;
};

export const currentEnv = getEnvironmentConfig(process.env.NODE_ENV);
