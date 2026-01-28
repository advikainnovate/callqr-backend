-- Privacy-Preserving QR-Based Calling System Database Schema
-- 
-- This schema implements the database structure for the privacy-preserving
-- QR-based calling system with encryption at rest and minimal personal data storage.
-- 
-- Requirements: 10.4, 10.5

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for encryption functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (minimal personal data)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_hash VARCHAR(256) NOT NULL,  -- For authentication only (hashed)
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_token_gen TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    emergency_contact TEXT,           -- Optional emergency contact (encrypted)
    vehicle_number VARCHAR(100),      -- Optional vehicle identification (encrypted)
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Token mappings (all tokens are hashed)
CREATE TABLE token_mappings (
    hashed_token VARCHAR(256) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    revoked_reason VARCHAR(100)
);

-- Anonymous call sessions (no personal data)
CREATE TABLE call_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_a_anon VARCHAR(256) NOT NULL,  -- Anonymous IDs only
    participant_b_anon VARCHAR(256) NOT NULL,  -- Anonymous IDs only
    status VARCHAR(50) NOT NULL DEFAULT 'INITIATING',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP,
    encryption_fingerprint VARCHAR(256),  -- For security audit only
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User sessions for authentication
CREATE TABLE user_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    session_token_hash VARCHAR(256) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    last_accessed TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true
);

-- MFA secrets (encrypted)
CREATE TABLE mfa_secrets (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    secret_encrypted TEXT NOT NULL,  -- TOTP secret (encrypted)
    backup_codes_encrypted TEXT,     -- Backup codes (encrypted)
    is_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used TIMESTAMP
);

-- Rate limiting tracking
CREATE TABLE rate_limits (
    identifier VARCHAR(256) NOT NULL,
    action VARCHAR(100) NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMP NOT NULL DEFAULT NOW(),
    window_end TIMESTAMP NOT NULL,
    PRIMARY KEY (identifier, action, window_start)
);

-- Security audit log (privacy-compliant)
CREATE TABLE security_audit_log (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    anonymous_user_id VARCHAR(256),  -- Anonymous user identifier
    ip_address INET,
    user_agent TEXT,
    event_data JSONB,  -- Additional event data (no personal info)
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_auth_hash ON users(auth_hash);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_is_active ON users(is_active);

CREATE INDEX idx_token_mappings_user_id ON token_mappings(user_id);
CREATE INDEX idx_token_mappings_expires_at ON token_mappings(expires_at);
CREATE INDEX idx_token_mappings_is_revoked ON token_mappings(is_revoked);
CREATE INDEX idx_token_mappings_created_at ON token_mappings(created_at);

CREATE INDEX idx_call_sessions_status ON call_sessions(status);
CREATE INDEX idx_call_sessions_created_at ON call_sessions(created_at);
CREATE INDEX idx_call_sessions_participant_a ON call_sessions(participant_a_anon);
CREATE INDEX idx_call_sessions_participant_b ON call_sessions(participant_b_anon);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX idx_user_sessions_session_token_hash ON user_sessions(session_token_hash);

CREATE INDEX idx_rate_limits_identifier_action ON rate_limits(identifier, action);
CREATE INDEX idx_rate_limits_window_end ON rate_limits(window_end);

CREATE INDEX idx_security_audit_log_event_type ON security_audit_log(event_type);
CREATE INDEX idx_security_audit_log_created_at ON security_audit_log(created_at);
CREATE INDEX idx_security_audit_log_anonymous_user_id ON security_audit_log(anonymous_user_id);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_sessions_updated_at BEFORE UPDATE ON call_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM token_mappings 
    WHERE expires_at < NOW() OR is_revoked = true;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    INSERT INTO security_audit_log (event_type, event_data)
    VALUES ('TOKEN_CLEANUP', jsonb_build_object('deleted_count', deleted_count));
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions 
    WHERE expires_at < NOW() OR is_active = false;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    INSERT INTO security_audit_log (event_type, event_data)
    VALUES ('SESSION_CLEANUP', jsonb_build_object('deleted_count', deleted_count));
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old call sessions
CREATE OR REPLACE FUNCTION cleanup_old_call_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete call sessions older than 30 days
    DELETE FROM call_sessions 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    INSERT INTO security_audit_log (event_type, event_data)
    VALUES ('CALL_SESSION_CLEANUP', jsonb_build_object('deleted_count', deleted_count));
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old rate limit entries
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM rate_limits 
    WHERE window_end < NOW() - INTERVAL '1 day';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old audit logs
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Keep audit logs for 90 days
    DELETE FROM security_audit_log 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comprehensive cleanup function
CREATE OR REPLACE FUNCTION perform_database_cleanup()
RETURNS JSONB AS $$
DECLARE
    tokens_cleaned INTEGER;
    sessions_cleaned INTEGER;
    calls_cleaned INTEGER;
    rate_limits_cleaned INTEGER;
    audit_logs_cleaned INTEGER;
BEGIN
    tokens_cleaned := cleanup_expired_tokens();
    sessions_cleaned := cleanup_expired_sessions();
    calls_cleaned := cleanup_old_call_sessions();
    rate_limits_cleaned := cleanup_old_rate_limits();
    audit_logs_cleaned := cleanup_old_audit_logs();
    
    RETURN jsonb_build_object(
        'tokens_cleaned', tokens_cleaned,
        'sessions_cleaned', sessions_cleaned,
        'calls_cleaned', calls_cleaned,
        'rate_limits_cleaned', rate_limits_cleaned,
        'audit_logs_cleaned', audit_logs_cleaned,
        'cleanup_time', NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) policies for additional security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_secrets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own data
CREATE POLICY user_isolation_policy ON users
    FOR ALL
    TO authenticated_user
    USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY token_isolation_policy ON token_mappings
    FOR ALL
    TO authenticated_user
    USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY session_isolation_policy ON user_sessions
    FOR ALL
    TO authenticated_user
    USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY mfa_isolation_policy ON mfa_secrets
    FOR ALL
    TO authenticated_user
    USING (user_id = current_setting('app.current_user_id')::UUID);

-- Create database roles
CREATE ROLE app_user;
CREATE ROLE app_admin;

-- Grant permissions to app_user role
GRANT CONNECT ON DATABASE privacy_qr_calling TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, token_mappings, call_sessions, user_sessions, mfa_secrets TO app_user;
GRANT SELECT, INSERT, DELETE ON rate_limits, security_audit_log TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Grant additional permissions to app_admin role
GRANT app_user TO app_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_admin;

-- Create application user (replace with actual credentials in production)
-- CREATE USER privacy_qr_app WITH PASSWORD 'secure_password_here';
-- GRANT app_user TO privacy_qr_app;

-- Create admin user (replace with actual credentials in production)
-- CREATE USER privacy_qr_admin WITH PASSWORD 'secure_admin_password_here';
-- GRANT app_admin TO privacy_qr_admin;

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts with minimal personal data storage';
COMMENT ON TABLE token_mappings IS 'Secure token mappings with hashed tokens only';
COMMENT ON TABLE call_sessions IS 'Anonymous call sessions with no personal information';
COMMENT ON TABLE user_sessions IS 'User authentication sessions';
COMMENT ON TABLE mfa_secrets IS 'Multi-factor authentication secrets (encrypted)';
COMMENT ON TABLE rate_limits IS 'Rate limiting tracking data';
COMMENT ON TABLE security_audit_log IS 'Security events audit log (privacy-compliant)';

COMMENT ON COLUMN users.auth_hash IS 'Hashed authentication credentials';
COMMENT ON COLUMN users.emergency_contact IS 'Optional emergency contact (encrypted)';
COMMENT ON COLUMN users.vehicle_number IS 'Optional vehicle identification (encrypted)';
COMMENT ON COLUMN token_mappings.hashed_token IS 'SHA-256 hash of the actual token';
COMMENT ON COLUMN call_sessions.participant_a_anon IS 'Anonymous participant identifier A';
COMMENT ON COLUMN call_sessions.participant_b_anon IS 'Anonymous participant identifier B';
COMMENT ON COLUMN call_sessions.encryption_fingerprint IS 'WebRTC encryption key fingerprint for audit';