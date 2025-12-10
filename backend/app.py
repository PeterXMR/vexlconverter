from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_swagger_ui import get_swaggerui_blueprint
from dotenv import load_dotenv
import os
from models import BTCPrice, SessionLocal
from scheduler import start_scheduler
from decimal import Decimal

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Swagger UI configuration
SWAGGER_URL = '/api/docs'
API_URL = '/static/swagger.json'

swaggerui_blueprint = get_swaggerui_blueprint(
    SWAGGER_URL,
    API_URL,
    config={
        'app_name': "Vexl Converter API"
    }
)

app.register_blueprint(swaggerui_blueprint, url_prefix=SWAGGER_URL)

# Serve swagger.json
@app.route('/static/swagger.json')
def swagger_json():
    import json
    with open('swagger.json', 'r') as f:
        return jsonify(json.load(f))

# Start price update scheduler
try:
    scheduler = start_scheduler()
    print("✓ Scheduler started successfully")
except Exception as e:
    print(f"⚠️  Warning: Scheduler failed to start: {e}")
    print("   API will still work, but prices won't auto-update")
    scheduler = None

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'version': '0.0.1'})

@app.route('/api/prices/latest', methods=['GET'])
def get_latest_prices():
    """Get the most recent BTC prices from database."""
    try:
        db = SessionLocal()
        latest_price = db.query(BTCPrice).order_by(
            BTCPrice.timestamp.desc()
        ).first()
        db.close()

        if not latest_price:
            return jsonify({
                'success': False,
                'error': 'No price data available'
            }), 404

        return jsonify({
            'success': True,
            'data': latest_price.to_dict()
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/convert', methods=['POST'])
def convert_btc():
    """Convert BTC amount to USD and EUR.

    Request body:
    {
        "btc_amount": 0.01
    }
    """
    try:
        data = request.get_json()
        btc_amount = Decimal(str(data.get('btc_amount', 0)))

        if btc_amount <= 0:
            return jsonify({
                'success': False,
                'error': 'BTC amount must be greater than 0'
            }), 400

        # Get latest prices
        db = SessionLocal()
        latest_price = db.query(BTCPrice).order_by(
            BTCPrice.timestamp.desc()
        ).first()
        db.close()

        if not latest_price:
            return jsonify({
                'success': False,
                'error': 'No price data available'
            }), 404

        # Calculate conversions
        usd_amount = float(btc_amount * latest_price.btc_usd)
        eur_amount = float(btc_amount * latest_price.btc_eur)

        return jsonify({
            'success': True,
            'data': {
                'btc_amount': float(btc_amount),
                'usd_amount': round(usd_amount, 2),
                'eur_amount': round(eur_amount, 2),
                'rates': {
                    'btc_usd': float(latest_price.btc_usd),
                    'btc_eur': float(latest_price.btc_eur)
                },
                'timestamp': latest_price.timestamp.isoformat()
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('FLASK_PORT', 5001))
    print(f"\n{'='*60}")
    print(f"  Bitcoin Converter API v0.0.1")
    print(f"  Running on http://localhost:{port}")
    print(f"{'='*60}")
    print("Available endpoints:")
    print(f"  GET  /api/health")
    print(f"  GET  /api/prices/latest")
    print(f"  POST /api/convert")
    print(f"\n  📖 Swagger API Docs: http://localhost:{port}/api/docs")
    print(f"{'='*60}\n")
    app.run(debug=True, port=port, host='0.0.0.0')

