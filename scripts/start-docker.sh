#!/bin/bash

# Vexl Converter - Complete Startup Script with Docker

# Run from the repo root regardless of where the script is invoked from
cd "$(dirname "$0")/.." || exit 1

echo "🚀 Starting Vexl Converter MVP v0.0.1"
echo "=========================================="
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker Desktop."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose down 2>/dev/null

# Build and start services
echo ""
echo "🔨 Building and starting services..."
docker-compose up --build -d

# Wait for services to initialize
echo ""
echo "⏳ Waiting for services to start (15 seconds)..."
sleep 15

# Check service status
echo ""
echo "📊 Service Status:"
docker-compose ps

# Test backend
echo ""
echo "🧪 Testing Backend API..."
sleep 5

if curl -s http://localhost:5001/api/health > /dev/null 2>&1; then
    echo "✅ Backend API is responding"
    echo ""
    echo "Backend Health:"
    curl -s http://localhost:5001/api/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:5001/api/health
else
    echo "⚠️  Backend not responding yet. Check logs with: docker-compose logs backend"
fi

# Display URLs
echo ""
echo "=========================================="
echo "🎉 Services are starting!"
echo "=========================================="
echo ""
echo "📍 Access URLs:"
echo "   Frontend:     http://localhost:3000"
echo "   Backend API:  http://localhost:5001"
echo "   Swagger Docs: http://localhost:5001/api/docs"
echo "   PostgreSQL:   localhost:5432 (user/user)"
echo ""
echo "📝 Useful Commands:"
echo "   View logs:       docker-compose logs -f backend"
echo "   Stop services:   docker-compose down"
echo "   Restart:         docker-compose restart backend"
echo ""
echo "🧪 Test API:"
echo "   curl http://localhost:5001/api/health"
echo "   curl http://localhost:5001/api/prices/latest"
echo ""
echo "🌐 Opening Swagger docs in browser..."
sleep 2
open http://localhost:5001/api/docs 2>/dev/null || echo "   Open manually: http://localhost:5001/api/docs"

echo ""
echo "✅ Setup complete!"

