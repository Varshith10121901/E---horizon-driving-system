"""
DriveSphere API Routes
All authentication endpoints matching the React frontend contract:
  POST /api/register     — Create account + send OTP
  POST /api/login        — Sign in with JWT
  POST /api/verify-otp   — Verify 6-digit code
  POST /api/resend-otp   — Resend verification code
  POST /api/oauth/google — Mock Google OAuth
"""

from datetime import datetime, timedelta, timezone
import os
import socket
import subprocess

import jwt
from flask import Blueprint, jsonify, request
from flask_bcrypt import Bcrypt

import models
from config import Config
from email_service import EmailService
from otp_service import OTPService

api_bp = Blueprint("api", __name__)
bcrypt = Bcrypt()


def start_node_server():
    """Start the Node.js dashboard server if it is not already running on port 3000."""
    port = 3000
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        in_use = s.connect_ex(('127.0.0.1', port)) == 0

    if not in_use:
        print(f"[Flask] Node.js server is NOT running on port {port}. Starting it now...")
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        try:
            log_file_path = os.path.join(root_dir, "node_server.log")
            log_file = open(log_file_path, "w", encoding="utf-8")
            subprocess.Popen(["npm", "start"], cwd=root_dir, stdout=log_file, stderr=subprocess.STDOUT, shell=True)
            print(f"[Flask] Node.js server process spawned. Logs at {log_file_path}")
        except Exception as e:
            print(f"[Flask] Failed to start Node.js server: {e}")
    else:
        print(f"[Flask] Node.js server is already running on port {port}.")



def init_bcrypt(app):
    """Initialize bcrypt with the Flask app."""
    bcrypt.init_app(app)


def _generate_jwt(user_doc):
    """Generate a JWT token for a verified user."""
    payload = {
        "user_id": str(user_doc["_id"]),
        "email": user_doc["email"],
        "name": user_doc.get("display_name", ""),
        "exp": datetime.now(timezone.utc) + timedelta(hours=Config.JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")


def _check_password_strength(password):
    """Validate password strength. Returns error message or None."""
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?/" for c in password)
    if not (has_upper and has_lower and has_digit):
        return "Password must contain uppercase, lowercase, and a number."
    if not has_special:
        return "Password must contain at least one special character (!@#$%^&* etc.)."
    return None


# ──────────────────────────────────────
# POST /api/register
# ──────────────────────────────────────
@api_bp.route("/api/register", methods=["POST"])
def register():
    """
    Create a new user account and send OTP verification email.

    Expects JSON: { "name": "...", "email": "...", "password": "..." }
    Returns:      { "requiresVerification": true, "message": "..." }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid request body."}), 400

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    # ── Validation ─────────────────────────────
    if not name or not email or not password:
        return jsonify({"error": "All fields are required."}), 400

    if "@" not in email or "." not in email:
        return jsonify({"error": "Please enter a valid email address."}), 400

    strength_error = _check_password_strength(password)
    if strength_error:
        return jsonify({"error": strength_error}), 400

    # Check if email already exists
    existing = models.get_user_by_email(email)
    if existing:
        if existing.get("is_verified"):
            return jsonify({"error": "An account with this email already exists."}), 409
        else:
            # User exists but never verified — delete old record and allow re-register
            models.get_db().users.delete_one({"_id": existing["_id"]})

    # Rate check for OTP requests
    otp_count = models.count_recent_events(email, "otp_request", minutes=60)
    if otp_count >= Config.MAX_OTP_REQUESTS_PER_HOUR:
        return jsonify({"error": "Too many requests. Please wait before trying again."}), 429

    # ── Create User ────────────────────────────
    password_hash = bcrypt.generate_password_hash(password).decode("utf-8")
    user_id = models.create_user(email, password_hash, name)

    if user_id is None:
        return jsonify({"error": "An account with this email already exists."}), 409

    # ── Send OTP Email ─────────────────────────
    otp_code = OTPService.create_and_store(email, purpose="register")
    email_result = EmailService.send_otp_email(email, otp_code, name)

    if not email_result["success"]:
        return jsonify({"error": email_result["error"]}), 500

    models.log_rate_event(email, "otp_request")

    return jsonify({
        "requiresVerification": True,
        "message": "Operator profile initiated. A verification code has been sent to your email.",
    })


# ──────────────────────────────────────
# POST /api/login
# ──────────────────────────────────────
@api_bp.route("/api/login", methods=["POST"])
def login():
    """
    Authenticate a user with email + password.

    Expects JSON: { "email": "...", "password": "..." }
    Returns:      { "token": "jwt...", "operator": {...}, "message": "..." }
    Error 403:    User not verified (frontend auto-switches to OTP mode)
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid request body."}), 400

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    # ── Check rate limiting ────────────────────
    failed_count = models.count_recent_events(
        email, "failed_login", minutes=Config.LOCKOUT_DURATION_MINUTES
    )
    if failed_count >= Config.MAX_FAILED_LOGINS:
        return jsonify({
            "error": f"Account temporarily locked due to too many failed attempts. "
                     f"Please try again in {Config.LOCKOUT_DURATION_MINUTES} minutes.",
        }), 429

    # ── Check if user exists ───────────────────
    user = models.get_user_by_email(email)
    if not user:
        return jsonify({"error": "No account found with this email address."}), 404

    # Check account lock
    if models.is_account_locked(email):
        return jsonify({
            "error": f"Account temporarily locked. Try again in {Config.LOCKOUT_DURATION_MINUTES} minutes.",
        }), 429

    # Check if Google-only account
    if user.get("is_google_user") and not user.get("password_hash"):
        return jsonify({
            "error": "This account was created with Google. Please use 'Sign in with Google'.",
        }), 401

    # ── Verify password ────────────────────────
    if not bcrypt.check_password_hash(user["password_hash"], password):
        models.increment_failed_attempts(email)
        models.log_rate_event(email, "failed_login")
        return jsonify({"error": "Invalid password. Please try again."}), 401

    # ── Check email verification ───────────────
    if not user.get("is_verified"):
        # Send a new OTP so the user can verify
        otp_count = models.count_recent_events(email, "otp_request", minutes=60)
        if otp_count < Config.MAX_OTP_REQUESTS_PER_HOUR:
            otp_code = OTPService.create_and_store(email, purpose="register")
            EmailService.send_otp_email(email, otp_code, user.get("display_name", ""))
            models.log_rate_event(email, "otp_request")

        return jsonify({
            "error": "Please verify your email first. A new verification code has been sent.",
        }), 403

    # ── Login success ──────────────────────────
    models.reset_failed_attempts(email)
    models.log_rate_event(email, "successful_login")

    token = _generate_jwt(user)

    # Send welcome email (fire-and-forget, don't block login)
    try:
        EmailService.send_welcome_email(email, user.get("display_name", ""))
    except Exception:
        pass  # Don't fail login if welcome email fails

    start_node_server()

    return jsonify({
        "token": token,
        "operator": {
            "name": user.get("display_name", ""),
            "email": user["email"],
        },
        "message": "Authentication successful. Welcome back, Operator.",
    })


# ──────────────────────────────────────
# POST /api/verify-otp
# ──────────────────────────────────────
@api_bp.route("/api/verify-otp", methods=["POST"])
def verify_otp():
    """
    Verify a 6-digit OTP code.

    Expects JSON: { "email": "...", "otp": "123456" }
    Returns:      { "message": "Account successfully verified!" }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid request body."}), 400

    email = (data.get("email") or "").strip().lower()
    otp_input = (data.get("otp") or "").strip()

    if not email:
        return jsonify({"error": "Email is required."}), 400

    if not otp_input or len(otp_input) != 6 or not otp_input.isdigit():
        return jsonify({"error": "Please enter a valid 6-digit verification code."}), 400

    # ── Verify OTP ─────────────────────────────
    result = OTPService.verify_otp(email, otp_input, purpose="register")

    if not result["valid"]:
        return jsonify({"error": result["error"]}), 400

    # ── Mark user as verified ──────────────────
    models.verify_user(email)

    return jsonify({
        "message": "Account successfully verified! Authorization granted.",
    })


# ──────────────────────────────────────
# POST /api/resend-otp
# ──────────────────────────────────────
@api_bp.route("/api/resend-otp", methods=["POST"])
def resend_otp():
    """
    Resend a new OTP verification code.

    Expects JSON: { "email": "..." }
    Returns:      { "message": "New verification code sent!" }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid request body."}), 400

    email = (data.get("email") or "").strip().lower()

    if not email:
        return jsonify({"error": "Email is required."}), 400

    # Check if user exists
    user = models.get_user_by_email(email)
    if not user:
        return jsonify({"error": "No account found with this email address."}), 404

    # Rate check
    otp_count = models.count_recent_events(email, "otp_request", minutes=60)
    if otp_count >= Config.MAX_OTP_REQUESTS_PER_HOUR:
        return jsonify({"error": "Too many requests. Please wait before trying again."}), 429

    # Generate and send new OTP
    otp_code = OTPService.create_and_store(email, purpose="register")
    email_result = EmailService.send_otp_email(
        email, otp_code, user.get("display_name", "")
    )

    if not email_result["success"]:
        return jsonify({"error": email_result["error"]}), 500

    models.log_rate_event(email, "otp_request")

    return jsonify({"message": "New verification code sent to your email!"})


# ──────────────────────────────────────
# POST /api/oauth/google
# ──────────────────────────────────────
@api_bp.route("/api/oauth/google", methods=["POST"])
def google_oauth():
    """
    Mock Google OAuth — creates or finds a user by the provided Google profile.

    Expects JSON: { "email": "...", "name": "...", "picture": "..." }
    Returns:      { "token": "jwt...", "operator": {...}, "message": "..." }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid request body."}), 400

    email = (data.get("email") or "").strip().lower()
    name = (data.get("name") or "").strip()

    if not email:
        return jsonify({"error": "Email is required for Google sign-in."}), 400

    # ── Find or create user ────────────────────
    user = models.get_user_by_email(email)

    if not user:
        # Create new Google user (auto-verified, no password)
        user_id = models.create_user(
            email, password_hash=None, display_name=name, is_google_user=True
        )
        user = models.get_user_by_email(email)
    else:
        # If existing user, mark as also having Google
        if not user.get("is_google_user"):
            models.get_db().users.update_one(
                {"_id": user["_id"]},
                {"$set": {
                    "is_google_user": True,
                    "is_verified": True,
                    "updated_at": datetime.now(timezone.utc),
                }},
            )
            user = models.get_user_by_email(email)

    if not user:
        return jsonify({"error": "Failed to create Google account."}), 500

    # ── Generate JWT ───────────────────────────
    token = _generate_jwt(user)

    models.log_rate_event(email, "successful_login")

    # Send welcome email (fire-and-forget)
    try:
        EmailService.send_welcome_email(email, user.get("display_name", name))
    except Exception:
        pass

    start_node_server()

    return jsonify({
        "token": token,
        "operator": {
            "name": user.get("display_name", name),
            "email": user["email"],
        },
        "message": "Google OAuth verified. Welcome to DriveSphere, Operator.",
    })


# ──────────────────────────────────────
# POST /api/forgot-password
# ──────────────────────────────────────
@api_bp.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    """
    Initiate password reset process by generating and sending OTP.
    Expects JSON: { "email": "..." }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid request body."}), 400

    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Email is required."}), 400

    user = models.get_user_by_email(email)
    if not user:
        return jsonify({"error": "No account found with this email address."}), 404

    if user.get("is_google_user") and not user.get("password_hash"):
         return jsonify({"error": "This account was created via Google Sign-In. You cannot reset its password."}), 400

    # Rate check for OTP requests
    otp_count = models.count_recent_events(email, "reset_otp_request", minutes=60)
    if otp_count >= Config.MAX_OTP_REQUESTS_PER_HOUR:
        return jsonify({"error": "Too many requests. Please wait before trying again."}), 429

    # Generate and store OTP with purpose "reset"
    otp_code = OTPService.create_and_store(email, purpose="reset")
    email_result = EmailService.send_otp_email(
        email, otp_code, user.get("display_name", ""), purpose="reset"
    )

    if not email_result["success"]:
        return jsonify({"error": email_result["error"]}), 500

    models.log_rate_event(email, "reset_otp_request")

    return jsonify({
        "message": "A reset code has been sent to your email.",
    })


# ──────────────────────────────────────
# POST /api/reset-password
# ──────────────────────────────────────
@api_bp.route("/api/reset-password", methods=["POST"])
def reset_password():
    """
    Verify OTP and reset the user's password.
    Expects JSON: { "email": "...", "otp": "...", "password": "..." }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid request body."}), 400

    email = (data.get("email") or "").strip().lower()
    otp_input = (data.get("otp") or "").strip()
    new_password = data.get("password") or ""

    if not email or not otp_input or not new_password:
        return jsonify({"error": "All fields are required."}), 400

    strength_error = _check_password_strength(new_password)
    if strength_error:
        return jsonify({"error": strength_error}), 400

    # Verify OTP
    result = OTPService.verify_otp(email, otp_input, purpose="reset")
    if not result["valid"]:
        return jsonify({"error": result["error"]}), 400

    # Update password in DB
    new_password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    models.get_db().users.update_one(
        {"email": email},
        {"$set": {
            "password_hash": new_password_hash,
            "updated_at": datetime.now(timezone.utc),
        }}
    )

    # Mark OTP as used
    otp_record = models.get_active_otp(email, "reset")
    if otp_record:
        models.mark_otp_used(otp_record["_id"])

    return jsonify({
        "message": "Password successfully updated! You can now log in.",
    })


# ──────────────────────────────────────
# GET /api/config
# ──────────────────────────────────────
@api_bp.route("/api/config", methods=["GET"])
def get_config():
    """
    Expose public config parameters (e.g. dashboard redirection URL) to the frontend client.
    """
    import os
    dashboard_url = os.environ.get("DASHBOARD_URL", "")
    return jsonify({
        "dashboard_url": dashboard_url,
    })
