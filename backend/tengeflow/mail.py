import html
import json
import os
import smtplib
import ssl
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from flask import current_app


def send_auth_mail(email, code, purpose):
    reset = purpose == "recovery"
    title = "Reset your TengeFlow password" if reset else "Confirm your TengeFlow email"
    path = "/reset-password" if reset else "/auth/callback"
    url = current_app.config["FRONTEND_URL"] + path + "?code=" + code
    content = (
        '<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#163d32;padding:32px">'
        f'<h1>{title}</h1><p>{"Choose a new password to get back to your workspace." if reset else "Confirm your email to start your own TengeFlow workspace."}</p>'
        f'<p><a target="_blank" rel="noopener noreferrer" href="{html.escape(url, quote=True)}">{"Reset password" if reset else "Confirm email"}</a></p>'
        f'<p>This link expires in {"15 minutes" if reset else "24 hours"} and can be used once.</p>'
        '<p>If you did not request this, you can ignore this email.</p></body></html>'
    )
    if current_app.config["SMTP_HOST"]:
        message = EmailMessage()
        message["Subject"], message["From"], message["To"] = title, current_app.config["MAIL_FROM"], email
        message.set_content(f"{title}\n\n{url}\n\nIf you did not request this, ignore this email.")
        message.add_alternative(content, subtype="html")
        smtp_type = smtplib.SMTP_SSL if current_app.config["SMTP_SSL"] else smtplib.SMTP
        kwargs = {"context": ssl.create_default_context()} if current_app.config["SMTP_SSL"] else {}
        with smtp_type(current_app.config["SMTP_HOST"], current_app.config["SMTP_PORT"], timeout=15, **kwargs) as server:
            if current_app.config["SMTP_STARTTLS"] and not current_app.config["SMTP_SSL"]:
                server.starttls(context=ssl.create_default_context())
            if current_app.config["SMTP_USERNAME"]:
                server.login(current_app.config["SMTP_USERNAME"], current_app.config["SMTP_PASSWORD"])
            server.send_message(message)
    elif not current_app.config["PRODUCTION"]:
        directory = Path(current_app.config["OUTBOX_DIR"])
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        identifier = str(uuid.uuid4())
        message = {"id": identifier, "to": email, "subject": title, "html": content,
                   "createdAt": datetime.now(timezone.utc).isoformat()}
        fd = os.open(directory / f"{identifier}.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(message, stream)
    else:
        raise RuntimeError("Mail delivery is not configured.")
