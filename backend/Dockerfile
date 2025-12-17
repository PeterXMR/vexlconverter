FROM python:3.14-slim

WORKDIR /app

# Install system dependencies including PostgreSQL client for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
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
ENV DB_HOST=postgres
ENV DB_USER=user
ENV DB_NAME=btc_converter
ENV POSTGRES_PASSWORD=changeme
# Do NOT hardcode sensitive secrets like database passwords in the Dockerfile.
# Pass the real DB password at runtime (docker run -e POSTGRES_PASSWORD=...) or
# supply it from your deployment environment / GitHub Secrets instead. If you
# need the secret during build-time, use BuildKit secrets instead of ENV.

# Expose port
EXPOSE 5001

# Use entrypoint script
ENTRYPOINT ["./entrypoint.sh"]
