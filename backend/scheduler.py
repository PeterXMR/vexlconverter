import requests
import os
import time
from apscheduler.schedulers.background import BackgroundScheduler
from models import BTCPrice, CryptoPrice, PriceAlert, SessionLocal, SUPPORTED_CRYPTOS
from datetime import datetime

COINGECKO_API = os.getenv('COINGECKO_API_URL',
                          'https://api.coingecko.com/api/v3/simple/price')


def fetch_and_store_prices():
    """Fetch prices for all supported cryptos from CoinGecko and store in database."""
    max_retries = 3
    retry_delay = 2
    crypto_ids = ','.join(SUPPORTED_CRYPTOS.keys())

    for attempt in range(max_retries):
        try:
            response = requests.get(
                COINGECKO_API,
                params={'ids': crypto_ids, 'vs_currencies': 'usd,eur'},
                timeout=10
            )
            response.raise_for_status()
            data = response.json()

            db = None
            try:
                db = SessionLocal()
                now = datetime.utcnow()

                for crypto_id in SUPPORTED_CRYPTOS:
                    if crypto_id not in data:
                        continue
                    usd_price = data[crypto_id].get('usd', 0)
                    eur_price = data[crypto_id].get('eur', 0)

                    new_price = CryptoPrice(
                        crypto_id=crypto_id,
                        price_usd=usd_price,
                        price_eur=eur_price,
                        timestamp=now
                    )
                    db.add(new_price)

                # Also store in legacy btc_prices table
                if 'bitcoin' in data:
                    btc_usd = data['bitcoin']['usd']
                    btc_eur = data['bitcoin']['eur']
                    legacy_price = BTCPrice(
                        btc_usd=btc_usd,
                        btc_eur=btc_eur,
                        timestamp=now
                    )
                    db.add(legacy_price)

                db.commit()

                symbols = [SUPPORTED_CRYPTOS[c]['symbol'] for c in SUPPORTED_CRYPTOS if c in data]
                print(f"Prices updated for: {', '.join(symbols)}")

                # Check price alerts
                check_price_alerts(data)

                return True
            except Exception as db_error:
                if db:
                    db.rollback()
                raise db_error
            finally:
                if db:
                    db.close()

        except Exception as e:
            print(f"Error fetching prices (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
            else:
                return False

    return False


def check_price_alerts(price_data):
    """Check all active alerts against current prices and trigger matches."""
    db = None
    try:
        db = SessionLocal()
        active_alerts = db.query(
            PriceAlert.id,
            PriceAlert.crypto,
            PriceAlert.target_price,
            PriceAlert.currency,
            PriceAlert.direction,
        ).filter(
            PriceAlert.is_triggered == False
        ).all()

        triggered_count = 0
        for alert in active_alerts:
            crypto_data = price_data.get(alert.crypto)
            if not crypto_data:
                continue

            current_price = crypto_data.get(alert.currency, 0)
            target = float(alert.target_price)

            should_trigger = False
            if alert.direction == 'above' and current_price >= target:
                should_trigger = True
            elif alert.direction == 'below' and current_price <= target:
                should_trigger = True

            if should_trigger:
                db.query(PriceAlert).filter(
                    PriceAlert.id == alert.id
                ).update({
                    PriceAlert.is_triggered: True,
                    PriceAlert.triggered_at: datetime.utcnow(),
                })
                triggered_count += 1

        if triggered_count > 0:
            db.commit()
            print(f"  Triggered {triggered_count} price alert(s)")
    except Exception as e:
        if db:
            db.rollback()
        print(f"  Error checking price alerts: {e}")
    finally:
        if db:
            db.close()


def start_scheduler():
    """Start background scheduler for price updates."""
    try:
        scheduler = BackgroundScheduler()
        interval = int(os.getenv('PRICE_UPDATE_INTERVAL', 300))

        try:
            print("Fetching initial crypto prices...")
            fetch_and_store_prices()
        except Exception as e:
            print(f"Initial price fetch failed: {e}")
            print("   Will retry in scheduled interval")

        scheduler.add_job(
            fetch_and_store_prices,
            'interval',
            seconds=interval,
            id='fetch_crypto_prices'
        )

        scheduler.start()
        print(f"Price scheduler started (updates every {interval} seconds)")
        return scheduler
    except Exception as e:
        print(f"Failed to start scheduler: {e}")
        raise
