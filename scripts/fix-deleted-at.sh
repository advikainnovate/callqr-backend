#!/bin/bash

# Fix missing users.deleted_at column and index
# Usage: ./scripts/fix-deleted-at.sh

set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL not found in environment variables"
    echo "Make sure .env exists or DATABASE_URL is exported"
    exit 1
fi

# Check if psql is installed
if ! command -v psql >/dev/null 2>&1; then
    echo "ERROR: psql is not installed or not in PATH"
    echo "Install postgresql-client first"
    exit 1
fi

echo "Applying deleted_at schema fix..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamp;

CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users (deleted_at);

UPDATE users
SET deleted_at = updated_at
WHERE status = 'deleted' AND deleted_at IS NULL;

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'deleted_at';

SELECT indexname
FROM pg_indexes
WHERE tablename = 'users' AND indexname = 'users_deleted_at_idx';
SQL
echo "Schema fix completed successfully."
