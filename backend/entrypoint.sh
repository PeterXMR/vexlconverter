#!/bin/bash
# Entrypoint script to wait for PostgreSQL before starting Flask

set -e

# Local docker-compose sets DB_HOST and we can probe the listener directly.
# Managed providers (Render+Neon, etc.) only inject DATABASE_URL, so skip the
# wait — SQLAlchemy will surface a clear error on first query if the DB is
# unreachable.
if [ -n "$DB_HOST" ]; then
  echo "Waiting for PostgreSQL at $DB_HOST..."
  until pg_isready -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
    echo "PostgreSQL is unavailable - sleeping"
    sleep 2
  done
  echo "PostgreSQL is up - starting application"
fi

# Bind port: Render and most PaaS providers inject $PORT; fall back to 5001
# for local docker-compose.
BIND_PORT="${PORT:-5001}"

# Start the Flask application with gunicorn.
# --preload ensures APScheduler runs in the master only (no duplicate jobs).
# --config gunicorn.conf.py disposes the forked engine per worker to avoid
# shared-connection races (ResourceClosedError).
# Access logging is disabled to avoid retaining visitor IPs / User-Agents;
# error log only captures crashes/tracebacks (no per-request metadata).
exec gunicorn --config gunicorn.conf.py --preload --workers 2 --bind "0.0.0.0:${BIND_PORT}" --error-logfile - app:app

