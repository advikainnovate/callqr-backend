import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 4000,
  logLevel: process.env.LOG_LEVEL || 'info',

  database: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/express_ts_db',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'supersecretjwtkey',
    accessTokenExpiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '59m',
    refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d',
  },

  encryptionKey:
    process.env.ENCRYPTION_KEY || 'thisisasecretkeyfor32byteslong!', // Default for development and testing

  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000'],
  },
};

// Freeze the config object to make it immutable
export const appConfig = Object.freeze(config);

// Export environment-specific configurations
export { currentEnv, getEnvironmentConfig } from './environments';

// ==================== SECURITY VALIDATIONS ====================

// Validate JWT secret strength (minimum 32 characters)
if (appConfig.jwt.secret.length < 32) {
  console.error(
    'ERROR: JWT_SECRET must be at least 32 characters long for security. Please set a stronger secret in your .env file.'
  );
  process.exit(1);
}

// Warn if using default JWT secret in production
if (appConfig.env === 'production' && appConfig.jwt.secret === 'supersecretjwtkey') {
  console.error(
    'ERROR: Default JWT_SECRET detected in production! Please set a secure JWT_SECRET in your .env file.'
  );
  process.exit(1);
}

// Validate encryption key length (should be 64 hex chars = 32 bytes)
if (appConfig.encryptionKey.length !== 64) {
  console.error(
    'ERROR: ENCRYPTION_KEY must be a 32-byte string (64 hex characters). Please set it in your .env file.'
  );
  process.exit(1);
}

// Warn if using default encryption key in production
if (appConfig.env === 'production' && appConfig.encryptionKey === 'thisisasecretkeyfor32byteslong!') {
  console.error(
    'ERROR: Default ENCRYPTION_KEY detected in production! Please set a secure ENCRYPTION_KEY in your .env file.'
  );
  process.exit(1);
}

// Re-export other config modules for convenience

