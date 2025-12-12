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
- (Optional) Python 3.11+ for local backend development
- (Optional) Node.js 18+ for local frontend development

### Option 1: Full Docker Setup (Recommended)

Start all services with Docker (PostgreSQL + Backend + Frontend):

```bash
docker compose up --build
```

Or run in background:
```bash
docker compose up -d --build
```

Access the application:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5001
- **Swagger Docs**: http://localhost:5001/api/docs

Stop all services:
```bash
docker compose down
```

### Option 2: Local Development Setup

**1. Start PostgreSQL Database**

```bash
docker compose up -d postgres
```

Verify it's running:
```bash
docker ps | grep btc_postgres
```

**2. Start Backend (Flask API)**

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The backend will start on http://localhost:5001 and immediately fetch BTC prices.

**3. Start Frontend (React)**

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
│   ├── Dockerfile          # Backend container config
│   ├── entrypoint.sh       # Container startup script
│   └── .env               # Environment configuration
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main React app
│   │   ├── App.css        # Global styles
│   │   └── components/
│   │       ├── Converter.js    # Main converter UI
│   │       └── Converter.css   # Converter styles
│   ├── package.json       # npm dependencies
│   └── Dockerfile         # Frontend container config
├── database/
│   └── init.sql           # PostgreSQL schema
├── .github/workflows/
│   └── docker-image.yml   # CI/CD workflow
├── docker-compose.yml     # Multi-container orchestration
├── test-workflow.sh       # Local CI/CD testing script
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

## 🚢 CI/CD - GitHub Actions

### Automated Testing Workflow

The project includes a GitHub Actions workflow (`.github/workflows/docker-image.yml`) that automatically:
- ✅ Builds Docker images on every push/PR
- ✅ Starts all services (backend + PostgreSQL)
- ✅ Runs health checks
- ✅ Validates the application works end-to-end

### Test Workflow Locally

Before pushing to GitHub, test the workflow locally:

```bash
./test-workflow.sh
```

**What it does:**
1. Detects docker-compose (V1) or docker compose (V2)
2. Builds Docker images
3. Starts services
4. Waits 15 seconds for initialization
5. Checks backend health endpoint
6. Shows logs if anything fails
7. Cleans up containers

**Expected output:**
```
🧪 Testing Docker Image CI workflow locally
==============================================

Using: docker-compose
✓ Step 1: Checkout (using current directory)
📦 Step 2: Build Docker images with docker compose
✅ Build successful
🚀 Step 3: Start services
✅ Services started
⏳ Step 4: Wait for services to be ready (15 seconds)
🏥 Step 5: Check backend health
{"status":"healthy","version":"0.0.1"}
✅ Backend is healthy
🛑 Step 7: Stop services

==============================================
✅ Workflow test PASSED
Your workflow will work on GitHub Actions!
```

### Workflow Configuration

The workflow (`.github/workflows/docker-image.yml`) runs on:
- Every push to `main` or `master` branch
- Every pull request to `main` or `master` branch

**Workflow steps:**
```yaml
- Checkout code
- Build Docker images (docker compose build)
- Start services (docker compose up -d)
- Wait 15 seconds
- Health check (curl http://localhost:5001/api/health)
- Show logs on failure
- Clean up (docker compose down)
```

### View CI/CD Results

1. Push code to GitHub: `git push origin main`
2. Go to your repository on GitHub
3. Click the **"Actions"** tab
4. See the workflow run in real-time
5. ✅ Green checkmark = all tests passed
6. ❌ Red X = tests failed (check logs)

### Docker Compose V2 Compatibility

The workflow uses **Docker Compose V2** (`docker compose` without hyphen) which is the standard on GitHub Actions runners. The test script automatically detects which version you have locally.

**Check your version:**
```bash
# V1 (old)
docker-compose --version

# V2 (new - used by GitHub Actions)
docker compose version
```

### CI/CD Best Practices

✅ **Always test locally first**: Run `./test-workflow.sh` before pushing
✅ **Check logs on failure**: Script shows container logs if health check fails
✅ **Commit permissions**: entrypoint.sh has execute permissions in git
✅ **Line endings**: .gitattributes ensures proper Unix line endings

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

