"""
DriveSphere Backend Configuration
MongoDB Atlas + Gmail SMTP + JWT + OTP settings.
"""

import os
import secrets


class Config:
    """Central configuration for the DriveSphere backend."""

    # ── MongoDB Atlas ──────────────────────────────
    MONGO_URI = os.environ.get(
        "MONGO_URI",
        "mongodb+srv://anandvarshithkumar_db_user:ZDlnTUDodTw5Q6dp"
        "@cluster0.h1nlb7b.mongodb.net/drivesphere?retryWrites=true&w=majority"
    )
    DATABASE_NAME = os.environ.get("DATABASE_NAME", "drivesphere")

    # ── Gmail SMTP ─────────────────────────────────
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "theauraailtd@gmail.com")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "wxxs mmne yocg snzh")
    MAIL_SENDER_NAME = os.environ.get("MAIL_SENDER_NAME", "DriveSphere")

    # ── JWT ────────────────────────────────────────
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "drivesphere_fallback_secret_key_10121901_varshith")
    JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", 24))

    # ── OTP ────────────────────────────────────────
    OTP_EXPIRY_MINUTES = 5
    OTP_MAX_ATTEMPTS = 5

    # ── Rate Limiting ──────────────────────────────
    MAX_OTP_REQUESTS_PER_HOUR = 5
    MAX_FAILED_LOGINS = 5
    LOCKOUT_DURATION_MINUTES = 15
