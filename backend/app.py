import bisect
import logging
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import requests as http_requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_swagger_ui import get_swaggerui_blueprint
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from models import BTCPrice, CryptoPrice, PriceAlert, SUPPORTED_CRYPTOS, get_db
from scheduler import start_scheduler

load_dotenv()

logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO').upper(),
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# CORS: comma-separated list of allowed origins; default is local dev frontend.
_cors_origins_env = os.getenv('CORS_ORIGINS', 'http://localhost:3000')
CORS_ORIGINS = [origin.strip() for origin in _cors_origins_env.split(',') if origin.strip()]
CORS(app, origins=CORS_ORIGINS, supports_credentials=False)

# Constants
SATOSHIS_PER_BTC = 100_000_000
MAX_AMOUNT = Decimal('1e12')

# Swagger UI configuration
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
        data = request.get_json()
        crypto = data.get('crypto', 'bitcoin')
        amount = data.get('amount') or data.get('btc_amount', 0)
        amount = Decimal(str(amount))

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
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400

        fiat_amount = data.get('fiat_amount')
        fiat_currency = data.get('fiat_currency', 'usd').lower()
        crypto = data.get('crypto', 'bitcoin')

        if fiat_amount is None:
            return jsonify({'success': False, 'error': 'fiat_amount is required'}), 400

        fiat_amount = Decimal(str(fiat_amount))
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
def create_alert():
    """Create a new price alert. Triggers immediately if condition already met."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400

        target_price = data.get('target_price')
        currency = data.get('currency', 'usd').lower()
        direction = data.get('direction', 'above').lower()
        crypto = data.get('crypto', 'bitcoin')

        if target_price is None or float(target_price) <= 0:
            return jsonify({'success': False, 'error': 'target_price must be positive'}), 400
        if Decimal(str(target_price)) > MAX_AMOUNT:
            return jsonify({'success': False, 'error': 'target_price exceeds maximum allowed'}), 400
        if currency not in ('usd', 'eur'):
            return jsonify({'success': False, 'error': 'currency must be usd or eur'}), 400
        if direction not in ('above', 'below'):
            return jsonify({'success': False, 'error': 'direction must be above or below'}), 400

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
            )
            db.add(alert)
            db.commit()
            result = alert.to_dict()

        return jsonify({'success': True, 'data': result}), 201
    except Exception:
        logger.exception("Failed to create alert")
        return jsonify({'error': 'internal server error'}), 500


@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    """List all active (non-triggered) alerts."""
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
                PriceAlert.is_triggered.is_(False)
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
    """Delete a price alert."""
    try:
        with get_db() as db:
            deleted = db.query(PriceAlert).filter(PriceAlert.id == alert_id).delete()
            db.commit()

        if not deleted:
            return jsonify({'success': False, 'error': 'Alert not found'}), 404

        return jsonify({'success': True})
    except Exception:
        logger.exception("Failed to delete alert %s", alert_id)
        return jsonify({'error': 'internal server error'}), 500


@app.route('/api/alerts/triggered', methods=['GET'])
def get_triggered_alerts():
    """Get triggered alerts not yet seen by the client.
    Uses seen_by_client flag instead of a time window, so alerts
    persist until the frontend acknowledges them."""
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
                PriceAlert.seen_by_client.is_(False)
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


@app.route('/api/alerts/ack', methods=['POST'])
def acknowledge_alerts():
    """Mark triggered alerts as seen by the client.
    Request body: {"ids": [1, 2, 3]}"""
    try:
        data = request.get_json()
        if not data or 'ids' not in data:
            return jsonify({'success': False, 'error': 'ids array required'}), 400

        alert_ids = data['ids']
        if not isinstance(alert_ids, list) or len(alert_ids) == 0:
            return jsonify({'success': False, 'error': 'ids must be a non-empty array'}), 400

        with get_db() as db:
            updated = db.query(PriceAlert).filter(
                PriceAlert.id.in_(alert_ids),
                PriceAlert.is_triggered.is_(True)
            ).update({
                PriceAlert.seen_by_client: True
            }, synchronize_session=False)
            db.commit()

        return jsonify({'success': True, 'acknowledged': updated})
    except Exception:
        logger.exception("Failed to acknowledge alerts")
        return jsonify({'error': 'internal server error'}), 500


# ─── Price History ───────────────────────────────────

_TRUNC_WHITELIST = {'hour', 'day', 'week', 'month'}


@app.route('/api/prices/history', methods=['GET'])
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
                'warning': f'Limited data. CoinGecko fallback failed: {str(cg_err)}'
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
