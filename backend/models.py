from sqlalchemy import create_engine, Column, Integer, Numeric, DateTime, String, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

Base = declarative_base()

# Supported cryptocurrencies: CoinGecko ID -> display info
SUPPORTED_CRYPTOS = {
    'bitcoin':       {'symbol': 'BTC',   'name': 'Bitcoin'},
    'ethereum':      {'symbol': 'ETH',   'name': 'Ethereum'},
    'solana':        {'symbol': 'SOL',   'name': 'Solana'},
    'ripple':        {'symbol': 'XRP',   'name': 'XRP'},
    'dogecoin':      {'symbol': 'DOGE',  'name': 'Dogecoin'},
    'cardano':       {'symbol': 'ADA',   'name': 'Cardano'},
    'polkadot':      {'symbol': 'DOT',   'name': 'Polkadot'},
    'matic-network': {'symbol': 'MATIC', 'name': 'Polygon'},
    'chainlink':     {'symbol': 'LINK',  'name': 'Chainlink'},
    'avalanche-2':   {'symbol': 'AVAX',  'name': 'Avalanche'},
}


class BTCPrice(Base):
    """Legacy BTC-only price table (kept for backwards compatibility)."""
    __tablename__ = 'btc_prices'

    id = Column(Integer, primary_key=True)
    btc_usd = Column(Numeric(12, 2), nullable=False)
    btc_eur = Column(Numeric(12, 2), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'btc_usd': float(self.btc_usd),
            'btc_eur': float(self.btc_eur),
            'timestamp': self.timestamp.isoformat()
        }


class CryptoPrice(Base):
    """Multi-cryptocurrency price table."""
    __tablename__ = 'crypto_prices'

    id = Column(Integer, primary_key=True)
    crypto_id = Column(String(32), nullable=False)
    price_usd = Column(Numeric(18, 8), nullable=False)
    price_eur = Column(Numeric(18, 8), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        info = SUPPORTED_CRYPTOS.get(self.crypto_id, {})
        return {
            'id': self.id,
            'crypto_id': self.crypto_id,
            'symbol': info.get('symbol', self.crypto_id.upper()),
            'name': info.get('name', self.crypto_id),
            'price_usd': float(self.price_usd),
            'price_eur': float(self.price_eur),
            'timestamp': self.timestamp.isoformat()
        }


class PriceAlert(Base):
    __tablename__ = 'price_alerts'

    id = Column(Integer, primary_key=True)
    crypto = Column(String(50), nullable=False, default='bitcoin')
    target_price = Column(Numeric(18, 2), nullable=False)
    currency = Column(String(10), nullable=False, default='usd')
    direction = Column(String(10), nullable=False, default='above')
    is_triggered = Column(Boolean, nullable=False, default=False)
    seen_by_client = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    triggered_at = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'crypto': self.crypto,
            'target_price': float(self.target_price),
            'currency': self.currency,
            'direction': self.direction,
            'is_triggered': self.is_triggered,
            'seen_by_client': self.seen_by_client,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'triggered_at': self.triggered_at.isoformat() if self.triggered_at else None,
        }


# Database connection
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://user:user@localhost:5432/btc_converter')
if DATABASE_URL.startswith('postgresql://'):
    DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+psycopg://', 1)
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
