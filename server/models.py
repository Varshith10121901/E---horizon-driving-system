from datetime import datetime, timedelta, timezone

from pymongo import MongoClient, ASCENDING
from pymongo.errors import DuplicateKeyError

from config import Config

# ── Module-level connection ────────────────────────
_client = None
_db = None


def get_db():
    """Get the MongoDB database instance (lazy singleton)."""
    global _client, _db
    if _db is None:
        _client = MongoClient(Config.MONGO_URI)
        _db = _client[Config.DATABASE_NAME]
    return _db


def init_db():
    """
    Initialize the database: create collections and indexes.
    Call once on application startup.
    """
    db = get_db()

    # ── Users collection ───────────────────────────
    db.users.create_index("email", unique=True)

    # ── OTPs collection ────────────────────────────
    db.otps.create_index([
        ("email", ASCENDING),
        ("purpose", ASCENDING),
        ("is_used", ASCENDING),
    ])
    # Auto-delete expired OTPs after 1 hour past expiry
    db.otps.create_index("expires_at", expireAfterSeconds=3600)

    # ── Rate events collection ─────────────────────
    # Auto-delete events older than 24 hours
    db.rate_events.create_index("created_at", expireAfterSeconds=86400)
    db.rate_events.create_index([
        ("email", ASCENDING),
        ("event_type", ASCENDING),
        ("created_at", ASCENDING),
    ])

    print("[DB] MongoDB Atlas connected & indexes ensured.")


# ══════════════════════════════════════════════════
# USER OPERATIONS
# ══════════════════════════════════════════════════

def get_user_by_email(email):
    """Fetch a user document by email. Returns None if not found."""
    db = get_db()
    return db.users.find_one({"email": email.strip().lower()})


def email_exists(email):
    """Check if an email is already registered."""
    return get_user_by_email(email) is not None


def create_user(email, password_hash, display_name, is_google_user=False):
    """
    Create a new user document.
    Google users are auto-verified; regular users need OTP verification.
    Returns the inserted document ID.
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    user_doc = {
        "email": email.strip().lower(),
        "password_hash": password_hash,
        "display_name": display_name,
        "is_verified": is_google_user,  # Google users auto-verified
        "is_google_user": is_google_user,
        "failed_login_attempts": 0,
        "locked_until": None,
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = db.users.insert_one(user_doc)
        return result.inserted_id
    except DuplicateKeyError:
        return None


def verify_user(email):
    """Mark a user as email-verified."""
    db = get_db()
    db.users.update_one(
        {"email": email.strip().lower()},
        {"$set": {"is_verified": True, "updated_at": datetime.now(timezone.utc)}},
    )


def update_password(email, password_hash):
    """Update a user's password hash."""
    db = get_db()
    db.users.update_one(
        {"email": email.strip().lower()},
        {"$set": {
            "password_hash": password_hash,
            "updated_at": datetime.now(timezone.utc),
        }},
    )


def increment_failed_attempts(email):
    """Increment the failed login counter. Lock account if threshold reached."""
    db = get_db()
    user = get_user_by_email(email)
    if not user:
        return

    new_count = user.get("failed_login_attempts", 0) + 1
    update = {
        "$set": {
            "failed_login_attempts": new_count,
            "updated_at": datetime.now(timezone.utc),
        }
    }

    # Lock the account if too many failures
    if new_count >= Config.MAX_FAILED_LOGINS:
        lock_until = datetime.now(timezone.utc) + timedelta(minutes=Config.LOCKOUT_DURATION_MINUTES)
        update["$set"]["locked_until"] = lock_until

    db.users.update_one({"email": email.strip().lower()}, update)


def reset_failed_attempts(email):
    """Reset the failed login counter and unlock the account."""
    db = get_db()
    db.users.update_one(
        {"email": email.strip().lower()},
        {"$set": {
            "failed_login_attempts": 0,
            "locked_until": None,
            "updated_at": datetime.now(timezone.utc),
        }},
    )


def is_account_locked(email):
    """Check if the account is currently locked due to failed attempts."""
    user = get_user_by_email(email)
    if not user or not user.get("locked_until"):
        return False
    return datetime.now(timezone.utc) < user["locked_until"]


# ══════════════════════════════════════════════════
# OTP OPERATIONS
# ══════════════════════════════════════════════════

def create_otp(email, otp_hash, purpose="register"):
    """
    Store a new OTP. Invalidates any previous active OTPs for the same
    email + purpose combination first.
    """
    db = get_db()
    now = datetime.now(timezone.utc)

    # Invalidate all previous active OTPs for this email+purpose
    db.otps.update_many(
        {"email": email.strip().lower(), "purpose": purpose, "is_used": False},
        {"$set": {"is_used": True}},
    )

    otp_doc = {
        "email": email.strip().lower(),
        "otp_hash": otp_hash,
        "purpose": purpose,
        "attempts": 0,
        "max_attempts": Config.OTP_MAX_ATTEMPTS,
        "is_used": False,
        "expires_at": now + timedelta(minutes=Config.OTP_EXPIRY_MINUTES),
        "created_at": now,
    }
    db.otps.insert_one(otp_doc)


def get_active_otp(email, purpose="register"):
    """Get the most recent active (unused, unexpired) OTP for an email+purpose."""
    db = get_db()
    return db.otps.find_one(
        {
            "email": email.strip().lower(),
            "purpose": purpose,
            "is_used": False,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        },
        sort=[("created_at", -1)],
    )


def mark_otp_used(otp_id):
    """Mark an OTP as used (consumed or invalidated)."""
    db = get_db()
    db.otps.update_one({"_id": otp_id}, {"$set": {"is_used": True}})


def increment_otp_attempts(otp_id):
    """Increment the attempt counter on an OTP."""
    db = get_db()
    db.otps.update_one({"_id": otp_id}, {"$inc": {"attempts": 1}})


# ══════════════════════════════════════════════════
# RATE LIMITING
# ══════════════════════════════════════════════════

def count_recent_events(email, event_type, minutes=60):
    """Count how many events of a given type occurred in the last N minutes."""
    db = get_db()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    return db.rate_events.count_documents({
        "email": email.strip().lower(),
        "event_type": event_type,
        "created_at": {"$gte": cutoff},
    })


def log_rate_event(email, event_type):
    """Log a rate-limiting event."""
    db = get_db()
    db.rate_events.insert_one({
        "email": email.strip().lower(),
        "event_type": event_type,
        "created_at": datetime.now(timezone.utc),
    })
