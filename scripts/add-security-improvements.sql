-- Phase 1: Critical Security & Stability Improvements
-- This script adds audit logging and missing database indexes

-- ==================== AUDIT LOGS TABLE ====================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id UUID,
    ip_address VARCHAR(45),
    user_agent TEXT,
    status VARCHAR(20) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);

-- ==================== MISSING INDEXES ====================

-- Users table indexes
CREATE INDEX IF NOT EXISTS users_status_idx ON users(status);
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users(created_at);

-- QR Codes table indexes
CREATE INDEX IF NOT EXISTS qr_codes_assigned_user_id_idx ON qr_codes(assigned_user_id);
CREATE INDEX IF NOT EXISTS qr_codes_status_idx ON qr_codes(status);

-- Call Sessions table indexes
CREATE INDEX IF NOT EXISTS call_sessions_caller_id_idx ON call_sessions(caller_id);
CREATE INDEX IF NOT EXISTS call_sessions_receiver_id_idx ON call_sessions(receiver_id);
CREATE INDEX IF NOT EXISTS call_sessions_qr_id_idx ON call_sessions(qr_id);
CREATE INDEX IF NOT EXISTS call_sessions_status_idx ON call_sessions(status);
CREATE INDEX IF NOT EXISTS call_sessions_started_at_idx ON call_sessions(started_at);

-- Chat Sessions table indexes
CREATE INDEX IF NOT EXISTS chat_sessions_participant1_id_idx ON chat_sessions(participant1_id);
CREATE INDEX IF NOT EXISTS chat_sessions_participant2_id_idx ON chat_sessions(participant2_id);
CREATE INDEX IF NOT EXISTS chat_sessions_qr_id_idx ON chat_sessions(qr_id);
CREATE INDEX IF NOT EXISTS chat_sessions_status_idx ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS chat_sessions_last_message_at_idx ON chat_sessions(last_message_at);

-- Messages table indexes
CREATE INDEX IF NOT EXISTS messages_chat_session_id_idx ON messages(chat_session_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages(sender_id);
CREATE INDEX IF NOT EXISTS messages_sent_at_idx ON messages(sent_at);
CREATE INDEX IF NOT EXISTS messages_is_read_idx ON messages(is_read);

-- Subscriptions table indexes
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_expires_at_idx ON subscriptions(expires_at);

-- Bug Reports table indexes
CREATE INDEX IF NOT EXISTS bug_reports_user_id_idx ON bug_reports(user_id);
CREATE INDEX IF NOT EXISTS bug_reports_severity_idx ON bug_reports(severity);
CREATE INDEX IF NOT EXISTS bug_reports_status_idx ON bug_reports(status);
CREATE INDEX IF NOT EXISTS bug_reports_created_at_idx ON bug_reports(created_at);

-- ==================== UNIQUE CONSTRAINTS ====================

-- Prevent duplicate active chats between same participants
-- Note: This constraint needs to be added carefully to avoid conflicts with existing data
-- First, check if there are any violations:
-- SELECT participant1_id, participant2_id, status, COUNT(*) 
-- FROM chat_sessions 
-- WHERE status = 'active' 
-- GROUP BY participant1_id, participant2_id, status 
-- HAVING COUNT(*) > 1;

-- If no violations, add the constraint:
-- CREATE UNIQUE INDEX IF NOT EXISTS chat_sessions_unique_active_participants 
-- ON chat_sessions(participant1_id, participant2_id, status) 
-- WHERE status = 'active';

-- Note: The above constraint is commented out because it requires data cleanup first
-- Run the SELECT query above to check for violations before adding the constraint

-- ==================== VERIFICATION ====================

-- Verify indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Verify audit_logs table was created
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'audit_logs'
ORDER BY ordinal_position;
