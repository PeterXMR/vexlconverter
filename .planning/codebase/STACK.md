# Technology Stack

**Analysis Date:** 2026-03-13

## Languages

**Primary:**
- Python 3.14 - Backend API and services
- JavaScript (ES6+) - Frontend React application

**Secondary:**
- SQL - PostgreSQL database schema and queries

## Runtime

**Environment:**
- Python 3.14 (Docker image: `python:3.14-slim`)
- Node.js 18+ (implied by React 19 support)

**Package Manager:**
- pip (Python) - Backend dependencies
- npm (Node.js) - Frontend dependencies
- Lockfile: `frontend/package-lock.json` present (npm v3 lockfile format)

## Frameworks

**Core:**
- Flask 3.0.0 - REST API backend server
- React 19.2.1 - Frontend UI framework
- SQLAlchemy 2.0.36+ - Python ORM for database operations

**API/Utility:**
- flask-cors 4.0.0 - Enable CORS for cross-origin requests
- flask-swagger-ui 4.11.1 - Interactive API documentation UI
- Axios 1.13.2 - HTTP client for frontend API calls
- react-dom 19.2.1 - React DOM rendering

**Testing:**
- @testing-library/react 16.3.0 - React component testing utilities
- @testing-library/jest-dom 6.9.1 - Jest DOM matchers
- @testing-library/user-event 13.5.0 - User interaction simulation
- @testing-library/dom 10.4.1 - DOM testing utilities

**Build/Dev:**
- react-scripts 5.0.1 - Create React App build tooling
- web-vitals 2.1.4 - Web performance metrics

## Key Dependencies

**Critical:**
- psycopg[binary] 3.2.0+ - PostgreSQL adapter for Python (binary version for performance)
- APScheduler 3.10.4 - Background task scheduling for price updates
- requests 2.31.0 - HTTP client for external API calls

**Infrastructure:**
- python-dotenv 1.0.0 - Environment variable loading from `.env`
- PostgreSQL 15-alpine (Docker image) - Relational database
- Docker & Docker Compose - Containerization and orchestration

## Configuration

**Environment:**
- `.env` file support via `python-dotenv` (backend)
- Environment variables configured in `docker-compose.yml`:
  - `DATABASE_URL` - PostgreSQL connection string
  - `FLASK_ENV` - Flask environment (development/production)
  - `FLASK_PORT` - Port for Flask app (default: 5001)
  - `COINGECKO_API_URL` - External API endpoint
  - `PRICE_UPDATE_INTERVAL` - Scheduler interval in seconds (default: 300)
  - `REACT_APP_API_URL` - Backend API URL for frontend (default: http://localhost:5001)
  - `POSTGRES_PASSWORD` - Database password

**Build:**
- Backend: `Dockerfile` in `backend/` - Multi-stage Python container
- Frontend: `Dockerfile` implied by docker-compose reference in `frontend/`
- `docker-compose.yml` - Defines all services (postgres, backend, flask, frontend)

## Platform Requirements

**Development:**
- Docker & Docker Compose (recommended for full stack)
- OR Python 3.11+ with pip for local backend development
- OR Node.js 18+ with npm for local frontend development
- PostgreSQL 15+ (for local development alternative)

**Production:**
- Docker & Docker Compose deployment
- Exposed ports:
  - 5432 - PostgreSQL (internal, not exposed in production)
  - 5001 - Flask backend API
  - 3000 - React frontend

**Database:**
- PostgreSQL 15-alpine with persistent volume (`postgres_data`)
- Database name: `btc_converter`
- Schema initialized via `database/init.sql` at container startup

---

*Stack analysis: 2026-03-13*
