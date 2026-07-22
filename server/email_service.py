import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from config import Config


class EmailService:
    """Handles sending verification and welcome emails via Gmail SMTP."""

    @staticmethod
    def send_otp_email(recipient_email, otp_code, recipient_name="", purpose="register"):
        """
        Send a professional HTML verification email containing the OTP.

        Args:
            recipient_email: The email address to send to
            otp_code: The 6-digit OTP code (plaintext, for email body only)
            recipient_name: Optional display name for personalization
            purpose: The purpose of the OTP ("register" or "reset")

        Returns:
            dict with keys:
                - success (bool): Whether email was sent
                - error (str|None): Error message if failed
        """
        if not Config.MAIL_USERNAME or not Config.MAIL_PASSWORD:
            return {
                "success": False,
                "error": "Email service not configured. Please set MAIL_USERNAME and MAIL_PASSWORD.",
            }

        html_body = EmailService._build_otp_email_html(
            recipient_email, otp_code, recipient_name, purpose
        )

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Verification Code: {otp_code}"
        msg["From"] = f"DriveSphere Platform <{Config.MAIL_USERNAME}>"
        msg["To"] = recipient_email

        name_display = recipient_name if recipient_name else "User"
        action_text = "reset your DriveSphere Account password" if purpose == "reset" else "access your DriveSphere Account"
        plain_text = (
            f"DriveSphere Platform\n\n"
            f"Verification Code\n\n"
            f"Dear {name_display},\n\n"
            f"We received a request to {action_text} {recipient_email} through your email address. "
            f"Your DriveSphere verification code is:\n\n"
            f"      {otp_code}\n\n"
            f"If you did not request this code, it is possible that someone else is trying to access the DriveSphere Account {recipient_email}. "
            f"Do not forward or give this code to anyone.\n\n"
            f"Sincerely yours,\n\n"
            f"The DriveSphere Accounts team"
        )

        msg.attach(MIMEText(plain_text, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        try:
            context = ssl.create_default_context()
            with smtplib.SMTP(Config.MAIL_SERVER, Config.MAIL_PORT) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(Config.MAIL_USERNAME, Config.MAIL_PASSWORD)
                server.sendmail(Config.MAIL_USERNAME, recipient_email, msg.as_string())

            return {"success": True, "error": None}

        except smtplib.SMTPAuthenticationError:
            return {
                "success": False,
                "error": "Email authentication failed. Check your Gmail App Password.",
            }
        except smtplib.SMTPException as e:
            return {"success": False, "error": f"Failed to send email: {str(e)}"}
        except Exception as e:
            return {"success": False, "error": f"Email service error: {str(e)}"}

    @staticmethod
    def _build_otp_email_html(recipient_email, otp_code, recipient_name="", purpose="register"):
        """Build the DriveSphere Platform branded OTP verification email matching the requested image design."""
        name_display = recipient_name if recipient_name else "operator"
        action_text = "reset your DriveSphere Account password" if purpose == "reset" else "access your DriveSphere Account"

        return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #333333;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px 20px 40px 20px; border-radius: 4px;">
        
        <!-- Logo Header -->
        <div style="font-size: 20px; margin-bottom: 24px; font-family: Arial, sans-serif;">
            <span style="font-weight: bold; color: #222222; letter-spacing: -0.5px;">DriveSphere</span>
            <span style="color: #b8860b; margin-left: 3px; font-weight: 500;">Platform</span>
        </div>

        <!-- Section Title -->
        <div style="font-size: 26px; color: #111111; font-weight: normal; margin-bottom: 24px; font-family: Arial, sans-serif;">
            Verification Code
        </div>
        
        <hr style="border: none; border-top: 1px solid #eaeaea; margin-bottom: 30px;">

        <!-- Message Body -->
        <div style="font-size: 14px; line-height: 1.6; color: #333333; font-family: Arial, sans-serif;">
            <p style="margin: 0 0 20px 0;">Dear {name_display},</p>
            
            <p style="margin: 0 0 20px 0;">
                We received a request to {action_text} 
                <a href="mailto:{recipient_email}" style="color: #1a73e8; text-decoration: none;">{recipient_email}</a> 
                through your email address. Your DriveSphere verification code is:
            </p>

            <!-- Large Verification Code -->
            <div style="text-align: center; font-size: 40px; font-weight: bold; color: #222222; letter-spacing: 2px; margin: 40px 0; font-family: Arial, sans-serif;">
                {otp_code}
            </div>

            <p style="margin: 0 0 20px 0;">
                If you did not request this code, it is possible that someone else is trying to access the DriveSphere Account 
                <a href="mailto:{recipient_email}" style="color: #1a73e8; text-decoration: none;">{recipient_email}</a>. 
                <strong>Do not forward or give this code to anyone.</strong>
            </p>

            <p style="margin: 0 0 30px 0; color: #555555; font-size: 13px;">
                You received this message because this email address is listed as the recovery email for the DriveSphere Account 
                <a href="mailto:{recipient_email}" style="color: #1a73e8; text-decoration: none;">{recipient_email}</a>.
            </p>

            <p style="margin: 0; line-height: 1.5;">
                Sincerely yours,<br><br>
                The DriveSphere Accounts team
            </p>
        </div>
    </div>
</body>
</html>
"""

    @staticmethod
    def send_welcome_email(recipient_email, recipient_name=""):
        """
        Send a welcome email when a user logs in or signs up.

        Args:
            recipient_email: The email address to send to
            recipient_name: Optional display name for personalization

        Returns:
            dict with keys:
                - success (bool): Whether email was sent
                - error (str|None): Error message if failed
        """
        if not Config.MAIL_USERNAME or not Config.MAIL_PASSWORD:
            return {"success": False, "error": "Email service not configured."}

        html_body = EmailService._build_welcome_email_html(
            recipient_email, recipient_name
        )

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Welcome to DriveSphere Platform, {recipient_name or 'Operator'}!"
        msg["From"] = f"DriveSphere Platform <{Config.MAIL_USERNAME}>"
        msg["To"] = recipient_email

        name_display = recipient_name if recipient_name else "Operator"
        plain_text = (
            f"DriveSphere Platform\n\n"
            f"Welcome to DriveSphere Platform\n\n"
            f"Dear {name_display},\n\n"
            f"Welcome to the DriveSphere Platform! Your operator account for {recipient_email} has been successfully created and verified.\n\n"
            f"You can now log in to the E-Horizon Vehicular Intelligence system, monitor real-time telemetry, track weather microclimates, and manage AI navigation paths.\n\n"
            f"Sincerely yours,\n\n"
            f"The DriveSphere Accounts team"
        )

        msg.attach(MIMEText(plain_text, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        try:
            context = ssl.create_default_context()
            with smtplib.SMTP(Config.MAIL_SERVER, Config.MAIL_PORT) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(Config.MAIL_USERNAME, Config.MAIL_PASSWORD)
                server.sendmail(Config.MAIL_USERNAME, recipient_email, msg.as_string())

            return {"success": True, "error": None}

        except Exception as e:
            return {"success": False, "error": f"Welcome email error: {str(e)}"}

    @staticmethod
    def _build_welcome_email_html(recipient_email, recipient_name=""):
        """Build the DriveSphere Platform branded welcome email matching the requested image design."""
        name_display = recipient_name if recipient_name else "operator"

        return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #333333;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px 20px 40px 20px; border-radius: 4px;">
        
        <!-- Logo Header -->
        <div style="font-size: 20px; margin-bottom: 24px; font-family: Arial, sans-serif;">
            <span style="font-weight: bold; color: #222222; letter-spacing: -0.5px;">DriveSphere</span>
            <span style="color: #b8860b; margin-left: 3px; font-weight: 500;">Platform</span>
        </div>

        <!-- Section Title -->
        <div style="font-size: 26px; color: #111111; font-weight: normal; margin-bottom: 24px; font-family: Arial, sans-serif;">
            Welcome to DriveSphere Platform
        </div>
        
        <hr style="border: none; border-top: 1px solid #eaeaea; margin-bottom: 30px;">

        <!-- Message Body -->
        <div style="font-size: 14px; line-height: 1.6; color: #333333; font-family: Arial, sans-serif;">
            <p style="margin: 0 0 20px 0;">Dear {name_display},</p>
            
            <p style="margin: 0 0 20px 0;">
                Welcome to the DriveSphere Platform! Your operator account for 
                <a href="mailto:{recipient_email}" style="color: #1a73e8; text-decoration: none;">{recipient_email}</a> 
                has been successfully created and verified.
            </p>

            <p style="margin: 0 0 20px 0;">
                You can now log in to the E-Horizon Vehicular Intelligence system, monitor real-time telemetry, track weather microclimates, and manage AI navigation paths.
            </p>

            <div style="background-color: #fafafa; border: 1px solid #eaeaea; border-radius: 4px; padding: 20px; margin: 30px 0;">
                <h3 style="margin-top: 0; color: #b8860b; font-size: 15px; font-family: Arial, sans-serif;">Getting Started</h3>
                <ul style="margin-bottom: 0; padding-left: 20px; color: #555555; font-size: 13px; line-height: 1.6;">
                    <li>Access your dashboard</li>
                    <li>Review active weather and disaster alerts along your routes</li>
                    <li>Initiate smart telemetry and Dijkstra rerouting tests</li>
                </ul>
            </div>

            <p style="margin: 0; line-height: 1.5;">
                Sincerely yours,<br><br>
                The DriveSphere Accounts team
            </p>
        </div>
    </div>
</body>
</html>
"""

