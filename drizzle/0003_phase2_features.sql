-- Phase 2: Core Feature Completion Migration

-- Add new columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified VARCHAR(10) DEFAULT 'no';
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_by UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Add expiration to qr_codes table
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- Create email_verifications table
CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_verifications_user_id_idx ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS email_verifications_token_idx ON email_verifications(token);
CREATE INDEX IF NOT EXISTS email_verifications_expires_at_idx ON email_verifications(expires_at);

-- Create password_resets table
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_resets_user_id_idx ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets(token);
CREATE INDEX IF NOT EXISTS password_resets_expires_at_idx ON password_resets(expires_at);

-- Create deleted_users table for soft delete recovery
CREATE TABLE IF NOT EXISTS deleted_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_user_id UUID NOT NULL UNIQUE,
  username TEXT NOT NULL,
  user_data JSONB NOT NULL,
  deleted_at TIMESTAMP DEFAULT NOW(),
  deleted_by UUID,
  reason TEXT,
  can_recover VARCHAR(10) NOT NULL DEFAULT 'yes',
  recovery_expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS deleted_users_original_user_id_idx ON deleted_users(original_user_id);
CREATE INDEX IF NOT EXISTS deleted_users_deleted_at_idx ON deleted_users(deleted_at);
CREATE INDEX IF NOT EXISTS deleted_users_recovery_expires_at_idx ON deleted_users(recovery_expires_at);

-- Add comments for documentation
COMMENT ON COLUMN users.email_verified IS 'Email verification status: yes or no';
COMMENT ON COLUMN users.blocked_reason IS 'Reason for blocking the user';
COMMENT ON COLUMN users.blocked_at IS 'Timestamp when user was blocked';
COMMENT ON COLUMN users.blocked_by IS 'Admin user ID who blocked this user';
COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp';
COMMENT ON COLUMN qr_codes.expires_at IS 'QR code expiration timestamp';
COMMENT ON TABLE email_verifications IS 'Email verification tokens';
COMMENT ON TABLE password_resets IS 'Password reset tokens';
COMMENT ON TABLE deleted_users IS 'Soft deleted users for recovery';
