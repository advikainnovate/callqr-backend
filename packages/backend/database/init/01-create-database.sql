-- Privacy-Preserving QR-Based Calling System Database Initialization
-- This script creates the basic database structure for secure token storage

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table (minimal personal data storage)
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_hash VARCHAR(256) NOT NULL UNIQUE, -- Email for authentication lookup
    password_hash VARCHAR(256) NOT NULL,
    salt VARCHAR(256) NOT NULL,
    mfa_secret VARCHAR(256),
    mfa_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    last_token_gen TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    emergency_contact VARCHAR(256),
    vehicle_number VARCHAR(100)
);

-- Create token mappings table (all tokens are hashed)
CREATE TABLE IF NOT EXISTS token_mappings (
    hashed_token VARCHAR(256) PRIMARY KEY,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT false
);

-- Create anonymous call sessions table (no personal data)
CREATE TABLE IF NOT EXISTS call_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_a_anon VARCHAR(256) NOT NULL,
    participant_b_anon VARCHAR(256) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'initiating',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    encryption_fingerprint VARCHAR(256)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_token_mappings_user_id ON token_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_token_mappings_expires_at ON token_mappings(expires_at);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_created_at ON call_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Create function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM token_mappings 
    WHERE expires_at < CURRENT_TIMESTAMP OR is_revoked = true;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up old call sessions
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM call_sessions 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
    AND status IN ('ended', 'failed');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;