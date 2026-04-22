"""Gunicorn configuration.

We run with --preload so APScheduler starts in the master only (avoids
duplicate jobs across workers). Preload forks workers after the app is
loaded, which means the SQLAlchemy engine (with its connection pool) is
inherited by every worker. Shared postgres sockets across forked processes
cause intermittent "ResourceClosedError" errors as workers race on the same
connection — so each worker must dispose the inherited pool and build its
own on first query.
"""

def post_fork(server, worker):  # noqa: ARG001 -- gunicorn hook signature
    from models import engine
    engine.dispose()
