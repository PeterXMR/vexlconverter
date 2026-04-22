#!/bin/bash

# Test script that mimics the GitHub Actions workflow locally
# This runs the same steps as .github/workflows/docker-image.yml

# Run from the repo root regardless of where the script is invoked from
cd "$(dirname "$0")/.." || exit 1

echo "🧪 Testing Docker Image CI workflow locally"
echo "=============================================="
echo ""

# Detect which docker compose command to use
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    echo "Using: docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
    echo "Using: docker compose (V2)"
else
    echo "❌ Neither docker-compose nor docker compose found"
    exit 1
fi
echo ""

# Step 1: Checkout (already done - we're in the repo)
echo "✓ Step 1: Checkout (using current directory)"
echo ""

# Step 2: Build Docker images with docker compose
echo "📦 Step 2: Build Docker images with docker compose"
if $DOCKER_COMPOSE build; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi
echo ""

# Step 3: Start services
echo "🚀 Step 3: Start services"
if $DOCKER_COMPOSE up -d; then
    echo "✅ Services started"
else
    echo "❌ Failed to start services"
    exit 1
fi
echo ""

# Step 4: Wait for services to be ready
echo "⏳ Step 4: Wait for services to be ready (20 seconds)"
sleep 20
echo ""

# Step 5: Check backend health
echo "🏥 Step 5: Check backend health"
if curl -f http://localhost:5001/api/health; then
    echo ""
    echo "✅ Backend is healthy"
    BACKEND_CHECK_PASSED=true
else
    echo ""
    echo "❌ Backend health check failed"
    BACKEND_CHECK_PASSED=false
fi
echo ""

# Step 6: Check frontend availability
echo "🌐 Step 6: Check frontend availability"
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend is serving"
    FRONTEND_CHECK_PASSED=true
else
    echo "❌ Frontend check failed"
    FRONTEND_CHECK_PASSED=false
fi
echo ""

# Step 7: Show logs if failed
if [ "$BACKEND_CHECK_PASSED" = false ] || [ "$FRONTEND_CHECK_PASSED" = false ]; then
    echo "📋 Step 7: Check service logs (because checks failed)"
    $DOCKER_COMPOSE logs
    echo ""
fi

# Step 8: Stop services
echo "🛑 Step 8: Stop services"
$DOCKER_COMPOSE down
echo ""

# Final result
echo "=============================================="
if [ "$BACKEND_CHECK_PASSED" = true ] && [ "$FRONTEND_CHECK_PASSED" = true ]; then
    echo "✅ Workflow test PASSED"
    echo "Backend and Frontend are healthy!"
    echo "Your workflow will work on GitHub Actions!"
    exit 0
else
    echo "❌ Workflow test FAILED"
    if [ "$BACKEND_CHECK_PASSED" = false ]; then
        echo "  - Backend check failed"
    fi
    if [ "$FRONTEND_CHECK_PASSED" = false ]; then
        echo "  - Frontend check failed"
    fi
    echo "Fix the issues before pushing to GitHub"
    exit 1
fi

