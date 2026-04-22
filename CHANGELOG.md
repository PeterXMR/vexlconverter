# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-22

### Added
- Multi-crypto conversion (Bitcoin plus additional cryptocurrencies) with fiat-to-fiat and
  reverse-conversion modes.
- Price alerts: create, list, delete, triggered-alert queue, and acknowledgement endpoint.
- Historical price charts with 24h / 7d / 30d ranges backed by a new `/api/prices/history`
  endpoint.
- Swagger UI served at `/api/docs` with a static OpenAPI document at `/static/swagger.json`.
- APScheduler background jobs for periodic price refresh and history backfill.

### Changed
- Expanded the public API from 3 endpoints to 13.
- Backend bumped to version `0.2.0`.

## [0.1.0] - 2025-12-10

### Added
- Initial MVP: BTC-to-fiat conversion backed by Flask, PostgreSQL, and a React frontend.
- Three REST endpoints: `GET /api/health`, `GET /api/prices/latest`, `POST /api/convert`.
- Docker Compose stack and CoinGecko-sourced price refresh.
