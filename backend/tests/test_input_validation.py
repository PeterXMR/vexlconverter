"""Regression tests for input validation hardening on the JSON endpoints.

Each test corresponds to a class of malformed input that previously escaped
the per-handler `except Exception:` and produced a generic 500. After the
fixes in this PR they all return the correct 4xx with a JSON error body
matching the rest of the API contract.

These tests do not require a running database — every check returns from
the validation phase before any DB query runs.
"""
from __future__ import annotations

import os
import sys

# Disable rate limiting + scheduler + DB-touching schema init noise *before*
# the app module is imported. Tests target the validation layer only.
os.environ.setdefault('RATELIMIT_ENABLED', 'False')
os.environ.setdefault('RUN_SCHEDULER', 'false')
os.environ.setdefault('FLASK_ENV', 'development')
os.environ.setdefault(
    'DATABASE_URL',
    'postgresql://user:user@localhost:5432/btc_converter',
)

# Patch Flask-Limiter to be globally disabled regardless of env-var support.
import flask_limiter

_orig_limiter_init = flask_limiter.Limiter.__init__


def _patched_limiter_init(self, *args, **kwargs):
    kwargs['enabled'] = False
    return _orig_limiter_init(self, *args, **kwargs)


flask_limiter.Limiter.__init__ = _patched_limiter_init

# Make the backend package importable when pytest is run from repo root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from app import app as flask_app  # noqa: E402


@pytest.fixture
def client():
    flask_app.config['TESTING'] = True
    return flask_app.test_client()


# ─── Non-object JSON body returns 400 (not 500) ───────

@pytest.mark.parametrize('body', ['[null,null]', '"string"', '42', 'true', 'null'])
@pytest.mark.parametrize('endpoint', [
    '/api/convert',
    '/api/convert/reverse',
    '/api/alerts',
    '/api/alerts/ack',
])
def test_non_object_body_returns_400(client, endpoint, body):
    r = client.post(endpoint, data=body, content_type='application/json')
    assert r.status_code == 400, (
        f"{endpoint} with body {body!r} -> {r.status_code} {r.data}"
    )
    assert r.is_json
    assert r.get_json().get('success') is False


# ─── Non-string values for enum-typed fields return 400 (not 500) ───

@pytest.mark.parametrize('field,bad_value', [
    ('crypto', ['bitcoin']),
    ('crypto', {'id': 'bitcoin'}),
    ('crypto', 42),
])
def test_convert_rejects_non_string_crypto(client, field, bad_value):
    r = client.post('/api/convert', json={'amount': 1, field: bad_value})
    assert r.status_code == 400


def test_convert_reverse_rejects_non_string_fiat_currency(client):
    r = client.post('/api/convert/reverse', json={
        'fiat_amount': 100, 'fiat_currency': ['usd'], 'crypto': 'bitcoin',
    })
    assert r.status_code == 400


@pytest.mark.parametrize('field,bad_value', [
    ('direction', ['above']),
    ('currency', ['usd']),
    ('crypto', {'id': 'bitcoin'}),
])
def test_alerts_rejects_non_string_enum_field(client, field, bad_value):
    body = {
        'target_price': 100, 'currency': 'usd',
        'direction': 'above', 'crypto': 'bitcoin',
    }
    body[field] = bad_value
    r = client.post('/api/alerts', json=body)
    assert r.status_code == 400


# ─── crypto allowlist on POST /api/alerts ──────────────

@pytest.mark.parametrize('c', [
    'fake_coin',
    '../etc/passwd',
    '<script>alert(1)</script>',
    '',
    'BITCOIN',  # case-sensitive
])
def test_alerts_rejects_unknown_crypto(client, c):
    r = client.post('/api/alerts', json={
        'target_price': 100, 'currency': 'usd',
        'direction': 'above', 'crypto': c,
    })
    assert r.status_code == 400


def test_alerts_accepts_known_crypto(client):
    # Sanity: the validation phase passes for a real crypto. We don't assert
    # 201 because the actual create needs a DB; we just want to be sure the
    # allowlist check itself doesn't reject the happy path.
    r = client.post('/api/alerts', json={
        'target_price': 100, 'currency': 'usd',
        'direction': 'above', 'crypto': 'bitcoin',
    })
    # 201 if DB is reachable, 5xx if not — but never 400 from validation.
    assert r.status_code != 400


# ─── Body too large returns 413 (not 500) ──────────────

def test_body_too_large_returns_413(client):
    body = b'{"a":"' + b'x' * 70_000 + b'"}'  # > 64 KB cap
    r = client.post(
        '/api/convert', data=body, content_type='application/json',
    )
    assert r.status_code == 413
    assert r.get_json() == {
        'success': False, 'error': 'Request body too large',
    }


# ─── Deeply-nested JSON returns 400 (not 500) ─────────

def test_deeply_nested_json_returns_400(client):
    body = ('{"a":' * 2000) + '1' + ('}' * 2000)
    r = client.post(
        '/api/convert', data=body, content_type='application/json',
    )
    assert r.status_code == 400


# ─── Cache-Control header set on every response ────────

@pytest.mark.parametrize('path', [
    '/api/health',
    '/api/cryptos',
])
def test_cache_control_default_no_store(client, path):
    r = client.get(path)
    assert 'Cache-Control' in r.headers
    assert 'no-store' in r.headers['Cache-Control']
