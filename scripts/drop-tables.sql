-- Drop all tables in reverse order of dependencies
DROP TABLE IF EXISTS "calls" CASCADE;
DROP TABLE IF EXISTS "qr_codes" CASCADE;
DROP TABLE IF EXISTS "auth_session_tokens" CASCADE;
DROP TABLE IF EXISTS "examples" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- Drop migration table
DROP TABLE IF EXISTS "__drizzle_migrations" CASCADE;

-- Drop drizzle schema
DROP SCHEMA IF EXISTS "drizzle" CASCADE;
