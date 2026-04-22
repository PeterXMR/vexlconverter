#!/bin/bash
# Entrypoint script to wait for PostgreSQL before starting Flask

set -e

echo "Waiting for PostgreSQL to be ready..."

# Wait for PostgreSQL to accept connections. pg_isready is a listener probe
# and needs no credentials, so we don't have to expose POSTGRES_PASSWORD to
# the backend container (the secret only lives inside DATABASE_URL).
until pg_isready -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "PostgreSQL is up - starting application"

# Start the Flask application with gunicorn.
# --preload ensures APScheduler runs in the master only (no duplicate jobs).
# --config gunicorn.conf.py disposes the forked engine per worker to avoid
# shared-connection races (ResourceClosedError).
exec gunicorn --config gunicorn.conf.py --preload --workers 2 --bind 0.0.0.0:5001 --access-logfile - --error-logfile - app:app

