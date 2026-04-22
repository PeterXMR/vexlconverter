#!/bin/bash

# Vexl Converter - Local Backend Setup

# Run from the repo root regardless of where the script is invoked from
cd "$(dirname "$0")/.." || exit 1

echo "🚀 Starting Vexl Converter Backend Locally"
echo "=============================================="
echo ""

# Check PostgreSQL in Docker
echo "1️⃣  Checking PostgreSQL..."
if docker ps | grep -q btc_postgres; then
    echo "✅ PostgreSQL is running in Docker"
else
    echo "⚠️  Starting PostgreSQL in Docker..."
    docker-compose up -d postgres
    sleep 5
fi

# Verify Python
echo ""
echo "2️⃣  Verifying Python environment..."
python --version
echo "Python location: $(which python)"

# Install dependencies
echo ""
echo "3️⃣  Installing Python dependencies..."
python -m pip install --upgrade pip
python -m pip install Flask flask-cors flask-swagger-ui 'psycopg[binary]' requests python-dotenv APScheduler SQLAlchemy

# Verify installation
echo ""
echo "4️⃣  Verifying packages..."
python -c "import flask; import flask_swagger_ui; import psycopg; import sqlalchemy; print('✅ All packages installed')"

# Start backend
echo ""
echo "5️⃣  Starting Flask backend..."
cd backend
python app.py > /tmp/backend-local.log 2>&1 &
BACKEND_PID=$!
cd ..

echo "Backend PID: $BACKEND_PID"
echo "⏳ Waiting for backend to start..."
sleep 10

# Test backend
echo ""
echo "6️⃣  Testing backend..."
HEALTH=$(curl -s http://localhost:5001/api/health 2>&1)
if echo "$HEALTH" | grep -q "healthy"; then
    echo "✅ Backend is running!"
    echo "$HEALTH"
else
    echo "❌ Backend not responding"
    echo "Check logs: tail -f /tmp/backend-local.log"
fi

# Summary
echo ""
echo "=============================================="
echo "📍 Service Status:"
echo "=============================================="
echo "PostgreSQL (Docker): $(docker ps | grep btc_postgres > /dev/null && echo '✅ Running' || echo '❌ Not running')"
echo "Backend (Local):     $(curl -s http://localhost:5001/api/health > /dev/null 2>&1 && echo '✅ Running' || echo '❌ Not running')"
echo ""
echo "📖 Access URLs:"
echo "   Backend API:  http://localhost:5001"
echo "   Swagger Docs: http://localhost:5001/api/docs"
echo "   Frontend:     http://localhost:3000"
echo ""
echo "📋 Logs:"
echo "   Backend: tail -f /tmp/backend-local.log"
echo ""
echo "🛑 To stop backend:"
echo "   kill $BACKEND_PID"
echo ""

