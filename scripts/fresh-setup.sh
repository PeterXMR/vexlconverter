#!/bin/bash

# Run from the repo root regardless of where the script is invoked from
cd "$(dirname "$0")/.." || exit 1

echo "🚀 Vexl Converter - Fresh Docker Setup"
echo "=========================================="
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Stop and remove everything
echo "🧹 Cleaning up old containers..."
docker-compose down -v 2>/dev/null
docker rm -f btc_backend btc_postgres pythonproject 2>/dev/null
docker rmi -f pythonproject-backend pythonproject_backend 2>/dev/null
docker volume prune -f > /dev/null 2>&1

echo "✅ Cleanup complete"
echo ""

# Build from scratch
echo "🔨 Building Docker images from scratch (this may take 2-3 minutes)..."
docker-compose build --no-cache

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Check docker-compose.yml and Dockerfile"
    exit 1
fi

echo "✅ Build complete"
echo ""

# Start services
echo "🚀 Starting services..."
docker-compose up -d

echo "⏳ Waiting for services to initialize (30 seconds)..."
sleep 30

# Check status
echo ""
echo "📊 Service Status:"
docker-compose ps

# Check backend logs
echo ""
echo "📋 Backend Logs (last 20 lines):"
docker logs btc_backend --tail=20 2>&1

# Test API
echo ""
echo "🧪 Testing Backend API..."
HEALTH=$(curl -s http://localhost:5001/api/health 2>&1)

if echo "$HEALTH" | grep -q "healthy"; then
    echo "✅ Backend API is responding!"
    echo "$HEALTH"
else
    echo "⚠️  Backend not responding yet. Checking logs..."
    docker logs btc_backend --tail=10
fi

# Summary
echo ""
echo "=========================================="
echo "🎉 Setup Complete!"
echo "=========================================="
echo ""
echo "📍 Access URLs:"
echo "   Frontend:     http://localhost:3000"
echo "   Backend API:  http://localhost:5001"
echo "   Swagger Docs: http://localhost:5001/api/docs"
echo ""
echo "🔍 Useful Commands:"
echo "   Check status:     docker-compose ps"
echo "   View logs:        docker-compose logs -f backend"
echo "   Stop all:         docker-compose down"
echo "   Restart backend:  docker-compose restart backend"
echo ""
echo "🧪 Test Backend:"
echo "   curl http://localhost:5001/api/health"
echo "   open http://localhost:5001/api/docs"
echo ""

