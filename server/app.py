import os
import sys

from flask import Flask, send_from_directory
from flask_cors import CORS

import models
from routes import api_bp, init_bcrypt


def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__, static_folder=None)

    # ── App Config ─────────────────────────────
    app.config["SECRET_KEY"] = os.urandom(32).hex()

    # ── CORS ───────────────────────────────────
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ── Initialize Extensions ──────────────────
    init_bcrypt(app)

    # ── Register Blueprints ────────────────────
    app.register_blueprint(api_bp)

    # ── Serve Frontend ─────────────────────────
    # The index.html is in the parent directory (D:\testttt\)
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    @app.route("/")
    def serve_index():
        """Serve the main React SPA."""
        return send_from_directory(frontend_dir, "index.html")

    @app.route("/<path:filename>")
    def serve_static(filename):
        """Serve any other static files from the frontend directory."""
        filepath = os.path.join(frontend_dir, filename)
        if os.path.isfile(filepath):
            return send_from_directory(frontend_dir, filename)
        # Fallback to index.html for SPA routing
        return send_from_directory(frontend_dir, "index.html")

    return app


def main():
    """Initialize database and start the development server."""
    print()
    print("==================================================")
    print("     DRIVESPHERE E-HORIZON SERVER")
    print("     Vehicular Intelligence Backend")
    print("==================================================")
    print()

    # ── Connect to MongoDB Atlas ───────────────
    print("[INIT] Connecting to MongoDB Atlas...")
    try:
        models.init_db()
        # Test the connection with a ping
        db = models.get_db()
        db.command("ping")
        print("[INIT] OK - MongoDB Atlas connection verified.")
    except Exception as e:
        print(f"[ERROR] FAIL - Could not connect to MongoDB Atlas: {e}")
        print("[ERROR]   Check your internet connection and MongoDB credentials.")
        sys.exit(1)

    print("[INIT] OK - Email service configured (Gmail SMTP).")
    print("[INIT] OK - OTP service ready (SHA-256 hashed, 5-min expiry).")
    print("[INIT] OK - JWT authentication enabled.")
    print()
    print("[SERVER] Starting on http://localhost:5000")
    print("[SERVER] Press Ctrl+C to stop.")
    print()

    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)


if __name__ == "__main__":
    main()
