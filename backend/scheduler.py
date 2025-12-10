import requests
import os
import time
from apscheduler.schedulers.background import BackgroundScheduler
from models import BTCPrice, SessionLocal
from datetime import datetime

COINGECKO_API = os.getenv('COINGECKO_API_URL',
                          'https://api.coingecko.com/api/v3/simple/price')

def fetch_and_store_prices():
    """Fetch BTC prices from CoinGecko and store in database."""
    max_retries = 3
    retry_delay = 2

    for attempt in range(max_retries):
        try:
            response = requests.get(
                COINGECKO_API,
                params={'ids': 'bitcoin', 'vs_currencies': 'usd,eur'},
                timeout=10
            )
            response.raise_for_status()
            data = response.json()

            btc_usd = data['bitcoin']['usd']
            btc_eur = data['bitcoin']['eur']

            # Store in database with retry logic
            db = None
            try:
                db = SessionLocal()
                new_price = BTCPrice(
                    btc_usd=btc_usd,
                    btc_eur=btc_eur,
                    timestamp=datetime.utcnow()
                )
                db.add(new_price)
                db.commit()
                print(f"✓ Price updated: BTC/USD=${btc_usd}, BTC/EUR=€{btc_eur}")
                return True
            except Exception as db_error:
                if db:
                    db.rollback()
                raise db_error
            finally:
                if db:
                    db.close()

        except Exception as e:
            print(f"✗ Error fetching prices (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
            else:
                return False

    return False

def start_scheduler():
    """Start background scheduler for price updates."""
    try:
        scheduler = BackgroundScheduler()
        interval = int(os.getenv('PRICE_UPDATE_INTERVAL', 300))

        # Try to fetch prices immediately on startup (but don't fail if it errors)
        try:
            print("Fetching initial BTC prices...")
            fetch_and_store_prices()
        except Exception as e:
            print(f"⚠️  Initial price fetch failed: {e}")
            print("   Will retry in scheduled interval")

        # Schedule periodic updates
        scheduler.add_job(
            fetch_and_store_prices,
            'interval',
            seconds=interval,
            id='fetch_btc_prices'
        )

        scheduler.start()
        print(f"✓ Price scheduler started (updates every {interval} seconds)")
        return scheduler
    except Exception as e:
        print(f"✗ Failed to start scheduler: {e}")
        raise

