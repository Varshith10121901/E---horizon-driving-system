import hashlib
import secrets
from datetime import datetime, timezone

import models
from config import Config


class OTPService:
    """Handles OTP lifecycle: generation, storage, and verification."""

    @staticmethod
    def generate_otp():
        """
        Generate a cryptographically secure 6-digit OTP.
        Uses secrets.randbelow() which is suitable for security-sensitive operations.
        """
        otp = secrets.randbelow(900000) + 100000  # Always 6 digits: 100000-999999
        return str(otp)

    @staticmethod
    def hash_otp(otp_code):
        """
        Hash OTP using SHA-256 before storing in database.
        We don't store plaintext OTPs — ever.
        """
        return hashlib.sha256(otp_code.encode("utf-8")).hexdigest()

    @staticmethod
    def create_and_store(email, purpose="register"):
        """
        Generate a new OTP, hash it, store in MongoDB, return the plaintext OTP.
        The plaintext OTP is only used to send via email — never stored.
        """
        otp_code = OTPService.generate_otp()
        otp_hash = OTPService.hash_otp(otp_code)
        models.create_otp(email, otp_hash, purpose)
        return otp_code

    @staticmethod
    def verify_otp(email, otp_input, purpose="register"):
        """
        Verify a user-submitted OTP code.

        Returns:
            dict with keys:
                - valid (bool): Whether OTP is valid
                - error (str|None): Error message if invalid
        """
        # Get the active OTP record
        otp_record = models.get_active_otp(email, purpose)

        if not otp_record:
            return {
                "valid": False,
                "error": "No active verification code found. Please request a new one.",
            }

        # Check if max attempts exceeded
        if otp_record["attempts"] >= otp_record["max_attempts"]:
            models.mark_otp_used(otp_record["_id"])
            return {
                "valid": False,
                "error": "Too many failed attempts. Please request a new code.",
            }

        # Check expiry
        expires_at = otp_record["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            models.mark_otp_used(otp_record["_id"])
            return {
                "valid": False,
                "error": "Verification code has expired. Please request a new one.",
            }

        # Hash the input and compare
        input_hash = OTPService.hash_otp(otp_input.strip())

        if input_hash != otp_record["otp_hash"]:
            models.increment_otp_attempts(otp_record["_id"])
            remaining = otp_record["max_attempts"] - otp_record["attempts"] - 1
            if remaining <= 0:
                models.mark_otp_used(otp_record["_id"])
                return {
                    "valid": False,
                    "error": "Too many failed attempts. Please request a new code.",
                }
            return {
                "valid": False,
                "error": f"Invalid verification code. {remaining} attempt(s) remaining.",
            }

        # OTP is valid — mark as used
        models.mark_otp_used(otp_record["_id"])
        return {"valid": True, "error": None}
