import bisect
import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import requests as http_requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_swagger_ui import get_swaggerui_blueprint
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from werkzeug.middleware.proxy_fix import ProxyFix

from models import BTCPrice, CryptoPrice, PriceAlert, SUPPORTED_CRYPTOS, get_db, init_schema
from scheduler import start_scheduler

load_dotenv()

logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO').upper(),
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Render is a reverse proxy. Trust X-Forwarded-For (one hop) so the rate
# limiter sees the real client IP, not the platform's edge address.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)

# Reject huge bodies before they reach handler code (defense against the
# unbounded `acks: []` / `X-Alert-Tokens` headers callable below).
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024  # 64 KB

# CORS: comma-separated list of allowed origins; default is local dev frontend.
_cors_origins_env = os.getenv('CORS_ORIGINS', 'http://localhost:3000')
CORS_ORIGINS = [origin.strip() for origin in _cors_origins_env.split(',') if origin.strip()]
CORS(
    app,
    origins=CORS_ORIGINS,
    supports_credentials=False,
    allow_headers=['Content-Type', 'X-Alert-Token', 'X-Alert-Tokens'],
)

# Rate limiter — in-memory bucket (per-worker). IPs live in volatile memory
# only; we never log them (gunicorn access log is off), so this doesn't
# conflict with the no-IP-retention privacy stance.
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["60 per minute"],
    storage_uri="memory://",
    # Don't expose X-RateLimit-* on every response — leaks the per-route
    # bucket shape and helps an attacker pace brute force at the limit.
    headers_enabled=False,
)


# ─── Token helpers (per-alert ownership) ─────────────

def _hash_token(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _verify_token(provided, stored_hash):
    if not provided or not stored_hash:
        return False
    return hmac.compare_digest(_hash_token(provided), stored_hash)


# Cap the number of tokens we'll process per request. Each becomes a
# SHA-256 hash and an entry in a SQL `IN` clause; an attacker who sends
# 100k tokens would otherwise spike CPU and choke the driver.
_MAX_TOKENS_PER_REQUEST = 50


def _tokens_from_header():
    """Return a list of SHA-256 hashes parsed from the X-Alert-Tokens header
    (comma-separated plaintext tokens). Empty list if header missing/blank.
    Capped at _MAX_TOKENS_PER_REQUEST entries."""
    header = request.headers.get('X-Alert-Tokens', '')
    if not header:
        return []
    parts = [t.strip() for t in header.split(',') if t.strip()]
    return [_hash_token(t) for t in parts[:_MAX_TOKENS_PER_REQUEST]]


@app.after_request
def add_security_headers(response):
    """Privacy/security response headers applied to every response.

    Strips the gunicorn server identifier and adds standard hardening.
    """
    response.headers['Server'] = 'web'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Permissions-Policy'] = (
        'geolocation=(), camera=(), microphone=(), payment=(), interest-cohort=()'
    )
    return response


# Constants
SATOSHIS_PER_BTC = 100_000_000
MAX_AMOUNT = Decimal('1e12')

# Swagger UI: enabled only outside production to reduce info disclosure.
# Set ENABLE_API_DOCS=true to force-enable it on a production deploy.
_swagger_enabled = (
    os.getenv('ENABLE_API_DOCS', '').lower() == 'true'
    or os.getenv('FLASK_ENV', 'production').lower() != 'production'
)
if _swagger_enabled:
    SWAGGER_URL = '/api/docs'
    API_URL = '/static/swagger.json'

    swaggerui_blueprint = get_swaggerui_blueprint(
        SWAGGER_URL,
        API_URL,
        config={'app_name': "Vexl Converter API"}
    )
    app.register_blueprint(swaggerui_blueprint, url_prefix=SWAGGER_URL)

    @app.route('/static/swagger.json')
    def swagger_json():
        import json
        with open('swagger.json', 'r') as f:
            return jsonify(json.load(f))

# Bootstrap DB schema on first run. Managed Postgres (Neon) doesn't run
# database/init.sql, so we create tables idempotently here.
try:
    init_schema()
    logger.info("DB schema ensured (create_all)")
except Exception:
    logger.exception("init_schema failed; API endpoints that hit the DB will return 500")

# Start price update scheduler (gunicorn --preload ensures master-only).
# RUN_SCHEDULER=false lets tests skip the background job.
if os.environ.get('RUN_SCHEDULER', 'true').lower() == 'true':
    try:
        scheduler = start_scheduler()
        logger.info("Scheduler started successfully")
    except Exception:
        logger.exception("Scheduler failed to start; API will still work but prices won't auto-update")
        scheduler = None
else:
    logger.info("Scheduler disabled via RUN_SCHEDULER env var")
    scheduler = None

VALID_FIAT_CURRENCIES = {
    'usd', 'eur', 'ars', 'aud', 'brl', 'gbp', 'cad', 'cny', 'czk', 'dkk',
    'hkd', 'inr', 'jpy', 'mxn', 'nzd', 'nok', 'pyg', 'pln', 'rub', 'sgd',
    'zar', 'krw', 'sek', 'chf', 'thb', 'try'
}


# ─── Health ──────────────────────────────────────────

@app.route('/api/health', methods=['GET'])
def health_check():
    """Liveness/readiness probe. Exercises the DB with SELECT 1."""
    db_status = 'ok'
    http_status = 200
    try:
        with get_db() as db:
            db.execute(text('SELECT 1'))
    except Exception:
        logger.exception("Health check DB probe failed")
        db_status = 'error'
        http_status = 503

    payload = {
        'status': 'healthy' if db_status == 'ok' else 'unhealthy',
        'db': db_status,
        'version': '0.2.0',
    }
    return jsonify(payload), http_status


# ─── Crypto List ─────────────────────────────────────

@app.route('/api/cryptos', methods=['GET'])
def get_supported_cryptos():
    """List all supported cryptocurrencies."""
    cryptos = [
        {'id': cid, 'symbol': info['symbol'], 'name': info['name']}
        for cid, info in SUPPORTED_CRYPTOS.items()
    ]
    return jsonify({'success': True, 'data': cryptos})


# ─── Fiat rates ──────────────────────────────────────

# 10-minute in-process cache of the USD-based fiat rates so we don't hit
# open.er-api.com per request. Lives in module memory; resets on restart.
_FIAT_RATES_TTL = 600  # seconds
_fiat_rates_cache = {'rates': None, 'fetched_at': 0.0}
FIAT_RATES_PROVIDER_URL = os.getenv(
    'FIAT_RATES_PROVIDER_URL',
    'https://open.er-api.com/v6/latest/USD',
)


@app.route('/api/fiat-rates', methods=['GET'])
@limiter.limit("30 per minute")
def get_fiat_rates():
    """Proxy USD-based fiat rates from the upstream provider.

    Frontend calls this instead of hitting the third-party directly, so
    visitor IPs never reach `open.er-api.com` and the call stays inside
    our CSP `connect-src 'self' ...onrender.com`.
    """
    import time
    now = time.time()
    if (
        _fiat_rates_cache['rates'] is not None
        and (now - _fiat_rates_cache['fetched_at']) < _FIAT_RATES_TTL
    ):
        return jsonify({
            'success': True,
            'rates': _fiat_rates_cache['rates'],
            'base': 'USD',
            'cached': True,
        })

    try:
        resp = http_requests.get(FIAT_RATES_PROVIDER_URL, timeout=10)
        resp.raise_for_status()
        payload = resp.json()
        if payload.get('result') != 'success' or 'rates' not in payload:
            raise ValueError('Unexpected provider payload')

        _fiat_rates_cache['rates'] = payload['rates']
        _fiat_rates_cache['fetched_at'] = now
        return jsonify({
            'success': True,
            'rates': payload['rates'],
            'base': 'USD',
            'cached': False,
        })
    except Exception:
        logger.exception("Fiat rates upstream failed")
        # If we have any stale data, return it so the UI keeps working
        if _fiat_rates_cache['rates'] is not None:
            return jsonify({
                'success': True,
                'rates': _fiat_rates_cache['rates'],
                'base': 'USD',
                'cached': True,
                'stale': True,
            })
        return jsonify({'success': False, 'error': 'fiat rates unavailable'}), 503


# ─── Prices ──────────────────────────────────────────

@app.route('/api/prices/latest', methods=['GET'])
def get_latest_prices():
    """Get the most recent price for a crypto. Default: bitcoin."""
    crypto = request.args.get('crypto', 'bitcoin')

    if crypto not in SUPPORTED_CRYPTOS:
        return jsonify({'success': False, 'error': f'Unknown crypto: {crypto}'}), 400

    try:
        with get_db() as db:
            latest = db.query(
                CryptoPrice.id,
                CryptoPrice.crypto_id,
                CryptoPrice.price_usd,
                CryptoPrice.price_eur,
                CryptoPrice.timestamp
            ).filter(
                CryptoPrice.crypto_id == crypto
            ).order_by(CryptoPrice.timestamp.desc()).first()

            if not latest:
                # Fallback to legacy table for bitcoin
                if crypto == 'bitcoin':
                    legacy = db.query(BTCPrice).order_by(BTCPrice.timestamp.desc()).first()
                    if legacy:
                        return jsonify({'success': True, 'data': legacy.to_dict()})
                return jsonify({'success': False, 'error': 'No price data available'}), 404

            info = SUPPORTED_CRYPTOS[crypto]
            result = {
                'id': latest.id,
                'crypto_id': crypto,
                'symbol': info['symbol'],
                'name': info['name'],
                'price_usd': float(latest.price_usd),
                'price_eur': float(latest.price_eur),
                'timestamp': latest.timestamp.isoformat(),
            }
            # Backwards compat for bitcoin
            if crypto == 'bitcoin':
                result['btc_usd'] = result['price_usd']
                result['btc_eur'] = result['price_eur']

            return jsonify({'success': True, 'data': result})
    except Exception:
        logger.exception("Failed to fetch latest price for %s", crypto)
        return jsonify({'error': 'internal server error'}), 500


@app.route('/api/prices/all', methods=['GET'])
def get_all_latest_prices():
    """Get latest prices for all supported cryptos in one call."""
    try:
        with get_db() as db:
            results = {}
            for crypto_id, info in SUPPORTED_CRYPTOS.items():
                latest = db.query(
                    CryptoPrice.price_usd,
                    CryptoPrice.price_eur,
                    CryptoPrice.timestamp
                ).filter(
                    CryptoPrice.crypto_id == crypto_id
                ).order_by(CryptoPrice.timestamp.desc()).first()

                if latest:
                    results[crypto_id] = {
                        'crypto_id': crypto_id,
                        'symbol': info['symbol'],
                        'name': info['name'],
                        'price_usd': float(latest.price_usd),
                        'price_eur': float(latest.price_eur),
                        'timestamp': latest.timestamp.isoformat(),
                    }

        return jsonify({'success': True, 'data': results})
    except Exception:
        logger.exception("Failed to fetch all latest prices")
        return jsonify({'error': 'internal server error'}), 500


# ─── Conversion ──────────────────────────────────────

@app.route('/api/convert', methods=['POST'])
def convert_crypto():
    """Convert crypto amount to fiat.

    Request body:
    {
        "crypto": "bitcoin",  // optional, defaults to bitcoin
        "amount": 0.01,       // or "btc_amount" for backwards compat
    }
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400
        crypto = data.get('crypto', 'bitcoin')
        raw_amount = data.get('amount') or data.get('btc_amount', 0)
        try:
            amount = Decimal(str(raw_amount))
        except (TypeError, ValueError, ArithmeticError):
            return jsonify({'success': False, 'error': 'amount must be a number'}), 400

        if crypto not in SUPPORTED_CRYPTOS:
            return jsonify({'success': False, 'error': f'Unknown crypto: {crypto}'}), 400

        if amount <= 0:
            return jsonify({'success': False, 'error': 'Amount must be greater than 0'}), 400

        if amount > MAX_AMOUNT:
            return jsonify({'success': False, 'error': 'Amount exceeds maximum allowed'}), 400

        with get_db() as db:
            latest = db.query(
                CryptoPrice.price_usd,
                CryptoPrice.price_eur,
                CryptoPrice.timestamp
            ).filter(
                CryptoPrice.crypto_id == crypto
            ).order_by(CryptoPrice.timestamp.desc()).first()

        if not latest:
            return jsonify({'success': False, 'error': 'No price data available'}), 404

        usd_amount = float(amount * latest.price_usd)
        eur_amount = float(amount * latest.price_eur)
        info = SUPPORTED_CRYPTOS[crypto]

        result = {
            'crypto': crypto,
            'symbol': info['symbol'],
            'amount': float(amount),
            'usd_amount': round(usd_amount, 2),
            'eur_amount': round(eur_amount, 2),
            'rates': {
                'usd': float(latest.price_usd),
                'eur': float(latest.price_eur),
            },
            'timestamp': latest.timestamp.isoformat()
        }
        # Backwards compat
        if crypto == 'bitcoin':
            result['btc_amount'] = result['amount']
            result['rates']['btc_usd'] = result['rates']['usd']
            result['rates']['btc_eur'] = result['rates']['eur']

        return jsonify({'success': True, 'data': result})
    except Exception:
        logger.exception("Failed to convert crypto -> fiat")
        return jsonify({'error': 'internal server error'}), 500


@app.route('/api/convert/reverse', methods=['POST'])
def convert_fiat_to_crypto():
    """Convert fiat amount to crypto.

    Request body:
    {
        "fiat_amount": 500,
        "fiat_currency": "usd",
        "crypto": "bitcoin"  // optional, defaults to bitcoin
    }
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400

        fiat_amount = data.get('fiat_amount')
        fiat_currency = data.get('fiat_currency', 'usd').lower()
        crypto = data.get('crypto', 'bitcoin')

        if fiat_amount is None:
            return jsonify({'success': False, 'error': 'fiat_amount is required'}), 400

        try:
            fiat_amount = Decimal(str(fiat_amount))
        except (TypeError, ValueError, ArithmeticError):
            return jsonify({'success': False, 'error': 'fiat_amount must be a number'}), 400
        if fiat_amount <= 0:
            return jsonify({'success': False, 'error': 'fiat_amount must be greater than 0'}), 400

        if fiat_amount > MAX_AMOUNT:
            return jsonify({'success': False, 'error': 'fiat_amount exceeds maximum allowed'}), 400

        if fiat_currency not in ('usd', 'eur'):
            return jsonify({'success': False, 'error': 'fiat_currency must be usd or eur'}), 400

        if fiat_currency not in VALID_FIAT_CURRENCIES:
            return jsonify({'success': False, 'error': f'Unknown fiat currency: {fiat_currency}'}), 400

        if crypto not in SUPPORTED_CRYPTOS:
            return jsonify({'success': False, 'error': f'Unknown crypto: {crypto}'}), 400

        with get_db() as db:
            latest = db.query(
                CryptoPrice.price_usd,
                CryptoPrice.price_eur,
                CryptoPrice.timestamp
            ).filter(
                CryptoPrice.crypto_id == crypto
            ).order_by(CryptoPrice.timestamp.desc()).first()

        if not latest:
            return jsonify({'success': False, 'error': 'No price data available'}), 404

        rate = latest.price_usd if fiat_currency == 'usd' else latest.price_eur
        if float(rate) == 0:
            return jsonify({'success': False, 'error': 'Price data unavailable'}), 500

        crypto_amount = float(fiat_amount / rate)
        info = SUPPORTED_CRYPTOS[crypto]
        sats_amount = round(crypto_amount * SATOSHIS_PER_BTC) if crypto == 'bitcoin' else None

        result = {
            'crypto': crypto,
            'symbol': info['symbol'],
            'crypto_amount': crypto_amount,
            'fiat_amount': float(fiat_amount),
            'fiat_currency': fiat_currency,
            'rate': float(rate),
            'timestamp': latest.timestamp.isoformat()
        }
        if sats_amount is not None:
            result['sats_amount'] = sats_amount

        return jsonify({'success': True, 'data': result})
    except Exception:
        logger.exception("Failed to convert fiat -> crypto")
        return jsonify({'error': 'internal server error'}), 500


# ─── Price Alerts ────────────────────────────────────

@app.route('/api/alerts', methods=['POST'])
@limiter.limit("10 per minute")
def create_alert():
    """Create a new price alert. Triggers immediately if condition already met.

    Returns a one-time `edit_token` in the response. The client must store
    this token (e.g. localStorage) — it's required to delete/ack the alert
    and to list it via GET. The server stores only the SHA-256 hash.
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400

        target_price = data.get('target_price')
        currency = data.get('currency', 'usd').lower()
        direction = data.get('direction', 'above').lower()
        crypto = data.get('crypto', 'bitcoin')

        if target_price is None:
            return jsonify({'success': False, 'error': 'target_price required'}), 400
        try:
            target_price_dec = Decimal(str(target_price))
        except (TypeError, ValueError, ArithmeticError):
            return jsonify({'success': False, 'error': 'target_price must be a number'}), 400
        if target_price_dec <= 0:
            return jsonify({'success': False, 'error': 'target_price must be positive'}), 400
        if target_price_dec > MAX_AMOUNT:
            return jsonify({'success': False, 'error': 'target_price exceeds maximum allowed'}), 400
        if currency not in ('usd', 'eur'):
            return jsonify({'success': False, 'error': 'currency must be usd or eur'}), 400
        if direction not in ('above', 'below'):
            return jsonify({'success': False, 'error': 'direction must be above or below'}), 400

        edit_token = secrets.token_urlsafe(32)
        edit_token_hash = _hash_token(edit_token)

        with get_db() as db:
            # Check current price to see if alert should trigger immediately
            already_triggered = False
            latest = db.query(
                CryptoPrice.price_usd,
                CryptoPrice.price_eur,
            ).filter(
                CryptoPrice.crypto_id == crypto
            ).order_by(CryptoPrice.timestamp.desc()).first()

            if latest:
                current_price = float(latest.price_usd if currency == 'usd' else latest.price_eur)
                target_val = float(target_price)
                if direction == 'above' and current_price >= target_val:
                    already_triggered = True
                elif direction == 'below' and current_price <= target_val:
                    already_triggered = True

            alert = PriceAlert(
                crypto=crypto,
                target_price=target_price,
                currency=currency,
                direction=direction,
                is_triggered=already_triggered,
                triggered_at=datetime.now(timezone.utc) if already_triggered else None,
                edit_token_hash=edit_token_hash,
            )
            db.add(alert)
            db.commit()
            result = alert.to_dict()

        # Return the plaintext token exactly once. The server keeps only the
        # hash, so it can't recover the token later.
        result['edit_token'] = edit_token
        return jsonify({'success': True, 'data': result}), 201
    except Exception:
        logger.exception("Failed to create alert")
        return jsonify({'error': 'internal server error'}), 500


@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    """List active (non-triggered) alerts owned by the caller.

    Filters by SHA-256 hashes of plaintext tokens supplied via the
    `X-Alert-Tokens` header (comma-separated). No header => empty list,
    so anonymous callers can't enumerate other users' alerts.
    """
    token_hashes = _tokens_from_header()
    if not token_hashes:
        return jsonify({'success': True, 'data': []})
    try:
        with get_db() as db:
            alerts = db.query(
                PriceAlert.id,
                PriceAlert.crypto,
                PriceAlert.target_price,
                PriceAlert.currency,
                PriceAlert.direction,
                PriceAlert.is_triggered,
                PriceAlert.created_at,
                PriceAlert.triggered_at,
            ).filter(
                PriceAlert.is_triggered.is_(False),
                PriceAlert.edit_token_hash.in_(token_hashes),
            ).order_by(PriceAlert.created_at.desc()).all()

        data = [{
            'id': a.id,
            'crypto': a.crypto,
            'target_price': float(a.target_price),
            'currency': a.currency,
            'direction': a.direction,
            'is_triggered': a.is_triggered,
            'created_at': a.created_at.isoformat() if a.created_at else None,
            'triggered_at': a.triggered_at.isoformat() if a.triggered_at else None,
        } for a in alerts]

        return jsonify({'success': True, 'data': data})
    except Exception:
        logger.exception("Failed to list alerts")
        return jsonify({'error': 'internal server error'}), 500


@app.route('/api/alerts/<int:alert_id>', methods=['DELETE'])
def delete_alert(alert_id):
    """Delete a price alert. Requires the `X-Alert-Token` header to match
    the alert's stored hash.

    Returns 403 for missing token, wrong token, AND non-existent alert ID —
    a distinct 404 would let an attacker enumerate which IDs exist via
    sequential probing.
    """
    token = request.headers.get('X-Alert-Token', '')
    forbidden = (jsonify({'success': False, 'error': 'forbidden'}), 403)
    if not token:
        return forbidden
    try:
        with get_db() as db:
            # Match id + token-hash in one query so non-owners and
            # non-existent IDs share the same code path.
            deleted = db.query(PriceAlert).filter(
                PriceAlert.id == alert_id,
                PriceAlert.edit_token_hash == _hash_token(token),
            ).delete(synchronize_session=False)
            db.commit()
        if not deleted:
            return forbidden
        return jsonify({'success': True})
    except Exception:
        logger.exception("Failed to delete alert %s", alert_id)
        return jsonify({'error': 'internal server error'}), 500


@app.route('/api/alerts/triggered', methods=['GET'])
def get_triggered_alerts():
    """Get triggered alerts owned by the caller that haven't been
    acknowledged yet. Same X-Alert-Tokens filtering as GET /api/alerts."""
    token_hashes = _tokens_from_header()
    if not token_hashes:
        return jsonify({'success': True, 'data': []})
    try:
        with get_db() as db:
            alerts = db.query(
                PriceAlert.id,
                PriceAlert.crypto,
                PriceAlert.target_price,
                PriceAlert.currency,
                PriceAlert.direction,
                PriceAlert.triggered_at,
            ).filter(
                PriceAlert.is_triggered.is_(True),
                PriceAlert.seen_by_client.is_(False),
                PriceAlert.edit_token_hash.in_(token_hashes),
            ).all()

        data = [{
            'id': a.id,
            'crypto': a.crypto,
            'target_price': float(a.target_price),
            'currency': a.currency,
            'direction': a.direction,
            'triggered_at': a.triggered_at.isoformat() if a.triggered_at else None,
        } for a in alerts]

        return jsonify({'success': True, 'data': data})
    except Exception:
        logger.exception("Failed to list triggered alerts")
        return jsonify({'error': 'internal server error'}), 500


# Cap items in /api/alerts/ack so an attacker can't tie up a worker with
# a 50k-entry payload (each entry is a SELECT + token verify).
_MAX_ACKS_PER_REQUEST = 100


@app.route('/api/alerts/ack', methods=['POST'])
@limiter.limit("10 per minute")
def acknowledge_alerts():
    """Mark triggered alerts as seen by the client.

    Request body: {"acks": [{"id": 1, "token": "..."}, ...]}
    Each id is acked only if the accompanying token matches the alert's
    stored hash. Items with missing/invalid tokens are silently skipped.
    Capped at _MAX_ACKS_PER_REQUEST items per request.
    """
    try:
        data = request.get_json(silent=True)
        if not data or 'acks' not in data:
            return jsonify({'success': False, 'error': 'acks array required'}), 400

        acks = data['acks']
        if not isinstance(acks, list) or len(acks) == 0:
            return jsonify({'success': False, 'error': 'acks must be a non-empty array'}), 400
        if len(acks) > _MAX_ACKS_PER_REQUEST:
            return jsonify({'success': False, 'error': 'too many acks in one request'}), 400

        ack_ids = []
        with get_db() as db:
            for ack in acks:
                if not isinstance(ack, dict):
                    continue
                alert_id = ack.get('id')
                token = ack.get('token')
                if not alert_id or not token:
                    continue
                alert = db.query(PriceAlert).filter(
                    PriceAlert.id == alert_id,
                    PriceAlert.is_triggered.is_(True),
                ).first()
                if alert and _verify_token(token, alert.edit_token_hash):
                    ack_ids.append(alert_id)

            if ack_ids:
                db.query(PriceAlert).filter(
                    PriceAlert.id.in_(ack_ids)
                ).update({
                    PriceAlert.seen_by_client: True
                }, synchronize_session=False)
                db.commit()

        return jsonify({'success': True, 'acknowledged': len(ack_ids)})
    except Exception:
        logger.exception("Failed to acknowledge alerts")
        return jsonify({'error': 'internal server error'}), 500


# ─── Price History ───────────────────────────────────

_TRUNC_WHITELIST = {'hour', 'day', 'week', 'month'}


@app.route('/api/prices/history', methods=['GET'])
@limiter.limit("20 per minute")
def get_price_history():
    """Get historical price data with smart aggregation.

    Query params:
        period: 24h, 7d, 30d, 1y (default: 24h)
        crypto: coingecko id (default: bitcoin)
    """
    period = request.args.get('period', '24h')
    crypto = request.args.get('crypto', 'bitcoin')

    valid_periods = {'24h', '7d', '30d', '1y'}
    if period not in valid_periods:
        return jsonify({
            'success': False,
            'error': f'Invalid period. Must be one of: {", ".join(valid_periods)}'
        }), 400

    if crypto not in SUPPORTED_CRYPTOS:
        return jsonify({
            'success': False,
            'error': f'Unknown crypto: {crypto}'
        }), 400

    now = datetime.now(timezone.utc)
    period_deltas = {
        '24h': timedelta(hours=24),
        '7d': timedelta(days=7),
        '30d': timedelta(days=30),
        '1y': timedelta(days=365),
    }
    cutoff = now - period_deltas[period]

    try:
        with get_db() as db:
            if period == '24h':
                prices = db.query(
                    CryptoPrice.timestamp,
                    CryptoPrice.price_usd,
                    CryptoPrice.price_eur
                ).filter(
                    CryptoPrice.crypto_id == crypto,
                    CryptoPrice.timestamp >= cutoff
                ).order_by(CryptoPrice.timestamp.asc()).all()

                data = [{
                    'timestamp': p.timestamp.isoformat(),
                    'price_usd': float(p.price_usd),
                    'price_eur': float(p.price_eur),
                } for p in prices]
            elif period == '7d':
                trunc = 'hour'
                if trunc not in _TRUNC_WHITELIST:
                    return jsonify({'success': False, 'error': 'Invalid bucket'}), 400
                sql = (
                    "SELECT "
                    f"date_trunc('{trunc}', timestamp) AS bucket, "
                    "AVG(price_usd) AS price_usd, "
                    "AVG(price_eur) AS price_eur "
                    "FROM crypto_prices "
                    "WHERE crypto_id = :crypto AND timestamp >= :cutoff "
                    "GROUP BY bucket "
                    "ORDER BY bucket ASC"
                )
                prices = db.execute(
                    text(sql),
                    {'crypto': crypto, 'cutoff': cutoff}
                ).fetchall()

                data = [{
                    'timestamp': row[0].isoformat() if hasattr(row[0], 'isoformat') else str(row[0]),
                    'price_usd': round(float(row[1]), 2),
                    'price_eur': round(float(row[2]), 2),
                } for row in prices]
            else:
                trunc = 'day'
                if trunc not in _TRUNC_WHITELIST:
                    return jsonify({'success': False, 'error': 'Invalid bucket'}), 400
                sql = (
                    "SELECT "
                    f"date_trunc('{trunc}', timestamp) AS bucket, "
                    "AVG(price_usd) AS price_usd, "
                    "AVG(price_eur) AS price_eur "
                    "FROM crypto_prices "
                    "WHERE crypto_id = :crypto AND timestamp >= :cutoff "
                    "GROUP BY bucket "
                    "ORDER BY bucket ASC"
                )
                prices = db.execute(
                    text(sql),
                    {'crypto': crypto, 'cutoff': cutoff}
                ).fetchall()

                data = [{
                    'timestamp': row[0].isoformat() if hasattr(row[0], 'isoformat') else str(row[0]),
                    'price_usd': round(float(row[1]), 2),
                    'price_eur': round(float(row[2]), 2),
                } for row in prices]

            db_data = data

        # If we have enough data from the DB, return it directly
        if len(db_data) >= 2:
            return jsonify({
                'success': True,
                'period': period,
                'crypto': crypto,
                'count': len(db_data),
                'data': db_data,
                'source': 'database'
            })

        # Fallback to CoinGecko market_chart API when DB lacks sufficient history
        coingecko_days = {'24h': '1', '7d': '7', '30d': '30', '1y': '365'}
        try:
            cg_usd = http_requests.get(
                f'https://api.coingecko.com/api/v3/coins/{crypto}/market_chart',
                params={'vs_currency': 'usd', 'days': coingecko_days[period]},
                timeout=15
            )
            cg_usd.raise_for_status()
            cg_eur = http_requests.get(
                f'https://api.coingecko.com/api/v3/coins/{crypto}/market_chart',
                params={'vs_currency': 'eur', 'days': coingecko_days[period]},
                timeout=15
            )
            cg_eur.raise_for_status()

            usd_prices = cg_usd.json().get('prices', [])
            eur_prices = cg_eur.json().get('prices', [])

            # CoinGecko /market_chart requires one currency per call. The two
            # calls happen sequentially, so the *final* point's timestamp can
            # drift by the request latency. Prior points align exactly.
            # Nearest-neighbour match within tolerance; skip the point if we
            # have no close EUR reading (prevents writing EUR=0 rows that then
            # become the "latest price" served to converters).
            eur_sorted = sorted((int(ts), price) for ts, price in eur_prices)
            eur_keys = [k for k, _ in eur_sorted]
            TOL_MS = 60_000  # 60s

            def nearest_eur(ts_ms):
                if not eur_keys:
                    return None
                i = bisect.bisect_left(eur_keys, ts_ms)
                candidates = []
                if i < len(eur_keys):
                    candidates.append(eur_sorted[i])
                if i > 0:
                    candidates.append(eur_sorted[i - 1])
                best = min(candidates, key=lambda kv: abs(kv[0] - ts_ms))
                return best[1] if abs(best[0] - ts_ms) <= TOL_MS else None

            cg_data = []
            for ts_ms, usd_price in usd_prices:
                eur_price = nearest_eur(int(ts_ms))
                if eur_price is None:
                    continue
                ts_dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
                cg_data.append({
                    'timestamp': ts_dt.isoformat(),
                    'price_usd': round(usd_price, 2),
                    'price_eur': round(eur_price, 2),
                })

            # Persist CoinGecko data into the DB so future requests serve from DB
            # and stop triggering expensive/rate-limited fallback calls.
            # Use ON CONFLICT DO NOTHING to tolerate duplicates; if the unique
            # constraint isn't present, fall back to per-row try/except.
            if cg_data:
                try:
                    with get_db() as seed_db:
                        try:
                            insert_sql = text(
                                "INSERT INTO crypto_prices "
                                "(crypto_id, price_usd, price_eur, timestamp) "
                                "VALUES (:crypto_id, :price_usd, :price_eur, :timestamp) "
                                "ON CONFLICT (crypto_id, timestamp) DO NOTHING"
                            )
                            for point in cg_data:
                                ts = datetime.fromisoformat(point['timestamp'])
                                seed_db.execute(insert_sql, {
                                    'crypto_id': crypto,
                                    'price_usd': point['price_usd'],
                                    'price_eur': point['price_eur'],
                                    'timestamp': ts,
                                })
                            seed_db.commit()
                        except Exception:
                            seed_db.rollback()
                            # Fallback: per-row inserts tolerating IntegrityError
                            for point in cg_data:
                                ts = datetime.fromisoformat(point['timestamp'])
                                try:
                                    seed_db.add(CryptoPrice(
                                        crypto_id=crypto,
                                        price_usd=point['price_usd'],
                                        price_eur=point['price_eur'],
                                        timestamp=ts,
                                    ))
                                    seed_db.commit()
                                except IntegrityError:
                                    seed_db.rollback()
                except Exception:
                    logger.warning("Best-effort persistence of CoinGecko history failed", exc_info=True)

            return jsonify({
                'success': True,
                'period': period,
                'crypto': crypto,
                'count': len(cg_data),
                'data': cg_data,
                'source': 'coingecko'
            })
        except Exception as cg_err:
            # CoinGecko failed - return whatever DB data we have (even if < 2 points)
            # so the frontend can show something rather than a blank chart
            logger.warning("CoinGecko history fallback failed: %s", cg_err)
            return jsonify({
                'success': True,
                'period': period,
                'crypto': crypto,
                'count': len(db_data),
                'data': db_data,
                'source': 'database',
                # Don't echo upstream exception text — may leak URLs/IPs/
                # library internals. The detail is in our logger.exception.
                'warning': 'Limited data; upstream price feed unavailable.'
            })

    except Exception:
        logger.exception("Failed to fetch price history")
        return jsonify({'error': 'internal server error'}), 500


if __name__ == '__main__':
    port = int(os.getenv('FLASK_PORT', 5001))
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    logger.info("=" * 60)
    logger.info("  Vexl Converter API v0.2.0")
    logger.info("  Running on http://localhost:%s", port)
    logger.info("=" * 60)
    logger.info("Available endpoints:")
    logger.info("  GET  /api/health")
    logger.info("  GET  /api/cryptos")
    logger.info("  GET  /api/prices/latest?crypto=bitcoin")
    logger.info("  GET  /api/prices/all")
    logger.info("  GET  /api/prices/history?period=24h&crypto=bitcoin")
    logger.info("  POST /api/convert")
    logger.info("  POST /api/convert/reverse")
    logger.info("  POST /api/alerts")
    logger.info("  GET  /api/alerts")
    logger.info("  GET  /api/alerts/triggered")
    logger.info("  POST /api/alerts/ack")
    logger.info("  DEL  /api/alerts/<id>")
    logger.info("  Swagger API Docs: http://localhost:%s/api/docs", port)
    logger.info("=" * 60)
    app.run(debug=debug, port=port, host='0.0.0.0')
