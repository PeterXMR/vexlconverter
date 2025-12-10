#!/usr/bin/env python
"""Backend startup test script"""

import sys
print("Testing backend dependencies...")

try:
    from dotenv import load_dotenv
    print("✓ python-dotenv")
except ImportError as e:
    print(f"✗ python-dotenv: {e}")
    sys.exit(1)

try:
    from flask import Flask
    print("✓ Flask")
except ImportError as e:
    print(f"✗ Flask: {e}")
    sys.exit(1)

try:
    from flask_cors import CORS
    print("✓ flask-cors")
except ImportError as e:
    print(f"✗ flask-cors: {e}")
    sys.exit(1)

try:
    import psycopg
    print("✓ psycopg")
except ImportError as e:
    print(f"✗ psycopg: {e}")
    sys.exit(1)

try:
    from sqlalchemy import create_engine
    print("✓ SQLAlchemy")
except ImportError as e:
    print(f"✗ SQLAlchemy: {e}")
    sys.exit(1)

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    print("✓ APScheduler")
except ImportError as e:
    print(f"✗ APScheduler: {e}")
    sys.exit(1)

try:
    import requests
    print("✓ requests")
except ImportError as e:
    print(f"✗ requests: {e}")
    sys.exit(1)

print("\n✅ All dependencies installed!")
print("\nNow testing backend app...")

# Load environment variables
load_dotenv()

# Try importing the app
try:
    from models import BTCPrice, SessionLocal
    print("✓ Models imported")
except Exception as e:
    print(f"✗ Models import failed: {e}")
    sys.exit(1)

try:
    from scheduler import start_scheduler
    print("✓ Scheduler imported")
except Exception as e:
    print(f"✗ Scheduler import failed: {e}")
    sys.exit(1)

print("\n✅ Backend is ready to start!")
print("\nRun: python app.py")

