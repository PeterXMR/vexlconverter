#!/bin/bash

echo "🔍 Vexl Converter Backend Diagnostic Tool"
echo "=========================================="
echo ""

echo "1️⃣  Docker Container Status:"
echo "----------------------------"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "NAMES|btc" || echo "No containers found"

echo ""
echo "2️⃣  Backend Logs (last 30 lines):"
echo "-----------------------------------"
docker logs btc_backend --tail=30 2>&1 || echo "Backend container not found"

echo ""
echo "3️⃣  PostgreSQL Status:"
echo "----------------------"
docker logs btc_postgres --tail=10 2>&1 | grep -E "ready to accept|listening" || docker logs btc_postgres --tail=5 2>&1

echo ""
echo "4️⃣  API Health Check:"
echo "---------------------"
HEALTH=$(curl -s http://localhost:5001/api/health 2>&1)
if [ $? -eq 0 ]; then
    echo "✅ Backend is responding:"
    echo "$HEALTH"
else
    echo "❌ Backend not responding"
    echo "Error: $HEALTH"
fi

echo ""
echo "5️⃣  Port 5001 Status:"
echo "---------------------"
lsof -i :5001 2>/dev/null || echo "Port 5001 is not in use"

echo ""
echo "6️⃣  Swagger UI:"
echo "---------------"
SWAGGER=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5001/api/docs 2>&1)
if [ "$SWAGGER" = "200" ]; then
    echo "✅ Swagger UI is accessible at http://localhost:5001/api/docs"
else
    echo "❌ Swagger UI not accessible (HTTP $SWAGGER)"
fi

echo ""
echo "7️⃣  Quick Actions:"
echo "------------------"
echo "View live logs:    docker-compose logs -f backend"
echo "Restart backend:   docker-compose restart backend"
echo "Rebuild all:       docker-compose up --build -d"
echo "Stop all:          docker-compose down"
echo ""

