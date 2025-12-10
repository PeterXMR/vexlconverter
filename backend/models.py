from sqlalchemy import create_engine, Column, Integer, Numeric, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

Base = declarative_base()

class BTCPrice(Base):
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

# Database connection
# Use postgresql+psycopg:// to explicitly use psycopg3 instead of psycopg2
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

