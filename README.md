# Vexl Converter MVP v0.0.1

A simple, real-time Bitcoin price converter with PostgreSQL database backend, Flask API, and React frontend.

## 🎯 Features

- ✅ Real-time BTC prices from CoinGecko API
- ✅ Automatic price updates every 5 minutes
- ✅ PostgreSQL database in Docker
- ✅ Convert BTC to USD and EUR
- ✅ Clean, responsive React UI
- ✅ REST API with 3 endpoints

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.11+
- Node.js 18+
- npm

### 1. Start PostgreSQL Database

```bash
docker-compose up -d postgres
```

Verify it's running:
```bash
docker ps | grep btc_postgres
```

### 2. Start Backend (Flask API)

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The backend will start on http://localhost:5001 and immediately fetch BTC prices.

### 3. Start Frontend (React)

```bash
cd frontend
npm install
npm start
```

The app will open in your browser at http://localhost:3000

## 📊 Usage

1. **View Current Rates**: The app displays live BTC/USD and BTC/EUR exchange rates
2. **Convert BTC**: Enter any BTC amount (e.g., 0.01) in the input field
3. **See Results**: USD and EUR values automatically calculate and display
4. **Auto-Refresh**: Prices refresh every 30 seconds on the frontend

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18+ |
| Backend | Python 3 + Flask 3.0 |
| Database | PostgreSQL 15 (Docker) |
| API Client | Axios |
| ORM | SQLAlchemy 2.0 |
| Scheduler | APScheduler 3.10 |
| External API | CoinGecko (free tier) |

## 📁 Project Structure

```
PythonProject/
├── backend/
│   ├── app.py              # Flask REST API
│   ├── models.py           # SQLAlchemy database models
│   ├── scheduler.py        # Background price updater
│   ├── requirements.txt    # Python dependencies
│   └── .env               # Environment configuration
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main React app
│   │   ├── App.css        # Global styles
│   │   └── components/
│   │       ├── Converter.js    # Main converter UI
│   │       └── Converter.css   # Converter styles
│   └── package.json       # npm dependencies
├── database/
│   └── init.sql           # PostgreSQL schema
├── docker-compose.yml     # Docker configuration
├── TODO.txt              # Implementation guide
└── README.md             # This file
```

## 🔌 API Endpoints

### GET /api/health
Health check endpoint

**Response:**
```json
{
  "status": "healthy",
  "version": "0.0.1"
}
```

### GET /api/prices/latest
Get most recent BTC prices

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "btc_usd": 97345.00,
    "btc_eur": 91267.00,
    "timestamp": "2025-12-10T12:34:56"
  }
}
```

### POST /api/convert
Convert BTC amount to USD and EUR

**Request:**
```json
{
  "btc_amount": 0.01
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "btc_amount": 0.01,
    "usd_amount": 973.45,
    "eur_amount": 912.67,
    "rates": {
      "btc_usd": 97345.00,
      "btc_eur": 91267.00
    },
    "timestamp": "2025-12-10T12:34:56"
  }
}
```

## 🧪 Testing

### Test Backend

```bash
# Health check
curl http://localhost:5001/api/health

# Get latest prices
curl http://localhost:5001/api/prices/latest

# Convert BTC
curl -X POST http://localhost:5001/api/convert \
  -H "Content-Type: application/json" \
  -d '{"btc_amount": 0.01}'
```

### Test Database

```bash
# Connect to PostgreSQL
docker exec -it btc_postgres psql -U user -d btc_converter

# View prices table
\dt
SELECT * FROM btc_prices ORDER BY timestamp DESC LIMIT 5;
\q
```

## 🔧 Configuration

### Backend Environment (.env)

```env
DATABASE_URL=postgresql://user:user@localhost:5432/btc_converter
FLASK_ENV=development
FLASK_PORT=5001
COINGECKO_API_URL=https://api.coingecko.com/api/v3/simple/price
PRICE_UPDATE_INTERVAL=300
```

### Database Credentials

- **Database**: btc_converter
- **User**: user
- **Password**: user
- **Port**: 5432 (exposed via Docker)

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check if dependencies are installed
pip list | grep Flask

# Reinstall dependencies
cd backend
pip install -r requirements.txt
```

### Database connection error
```bash
# Check if PostgreSQL container is running
docker ps | grep btc_postgres

# Restart container
docker-compose restart postgres

# View logs
docker-compose logs postgres
```

### Frontend can't connect to backend
- Verify backend is running on http://localhost:5001
- Check browser console for CORS errors
- Ensure flask-cors is installed in backend

### Prices not updating
- Check backend terminal for scheduler logs
- Verify CoinGecko API is accessible:
  ```bash
  curl "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur"
  ```

## 📈 Future Enhancements (v0.0.2+)

- [ ] Reverse conversion (USD/EUR → BTC)
- [ ] Price history charts
- [ ] More cryptocurrencies (ETH, LTC, etc.)
- [ ] User accounts and conversion history
- [ ] Price alerts
- [ ] WebSocket for real-time updates
- [ ] Mobile app (React Native)
- [ ] API authentication

## 🛑 Stopping the Application

```bash
# Stop backend (Ctrl+C in terminal)

# Stop frontend (Ctrl+C in terminal)

# Stop database
docker-compose down
```

## 📚 Documentation

- **TODO.txt**: Step-by-step implementation guide
- **This README**: Quick start and usage

## 📄 License

MIT License - Educational/Personal use

---

**Version**: 0.0.1  
**Status**: ✅ MVP Complete  
**Last Updated**: December 10, 2025

