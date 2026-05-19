FROM python:3.14-slim

WORKDIR /app

# Install system dependencies including PostgreSQL client for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Ensure entrypoint script has execute permission
RUN chmod +x entrypoint.sh

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV FLASK_ENV=development

# Expose port
EXPOSE 5001

# Healthcheck against the Flask /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT:-5001}/api/health" || exit 1

# Create non-root user and own the app directory (done late so pip had root)
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser:appuser /app
USER appuser

# Use entrypoint script
ENTRYPOINT ["./entrypoint.sh"]
