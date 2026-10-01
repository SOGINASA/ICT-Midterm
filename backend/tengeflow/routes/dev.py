"""Local email preview. This blueprint is never registered in production."""
import html
import ipaddress
import json
from pathlib import Path
from urllib.parse import urlsplit

from flask import Blueprint, current_app, jsonify, request

from ..validation import APIError

bp = Blueprint("dev", __name__)


def is_loopback(value):
    try:
        address = ipaddress.ip_address(value)
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        return address.is_loopback
    except (ValueError, TypeError):
        return False


@bp.before_request
def require_localhost():
    host = urlsplit("//" + request.host).hostname
    local = is_loopback(request.remote_addr)
    # CRA appends the actual client address. Reject every non-local hop so a
    # LAN client cannot spoof a localhost Host or a leading loopback XFF value.
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded is not None:
        addresses = forwarded.split(",")
        local = local and len(forwarded) <= 2048 and len(addresses) <= 16 and all(
            is_loopback(address.strip()) for address in addresses
        )
    if not local or host not in ("localhost", "127.0.0.1", "::1"):
        raise APIError("This page is available only on this computer.", "not_found", 404)


def messages():
    directory = Path(current_app.config["OUTBOX_DIR"])
    if not directory.exists():
        return []
    result = []
    for path in directory.glob("*.json"):
        try:
            result.append(json.loads(path.read_text()))
        except (OSError, ValueError):
            continue
    return sorted(result, key=lambda message: message["createdAt"], reverse=True)


@bp.get("/messages")
def get_messages():
    return jsonify(messages=messages())


@bp.get("/inbox")
def inbox():
    items = "".join(
        '<article><p class="to">To: ' + html.escape(message["to"]) + '</p><h2>'
        + html.escape(message["subject"]) + '</h2><p>' + html.escape(message["createdAt"])
        + '</p><iframe title="Email preview" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="'
        + html.escape(message["html"], quote=True) + '"></iframe></article>' for message in messages()
    )
    return '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TengeFlow local inbox</title><style>body{font:16px system-ui;background:#f7f6ef;color:#163d32;max-width:760px;margin:40px auto;padding:20px}article{background:white;padding:24px;border:1px solid #d8e2da;border-radius:16px;margin:24px 0}iframe{width:100%;height:280px;border:0}.to{font-weight:600}</style><h1>TengeFlow local inbox</h1><p>Development email stays on this computer. Refresh to see new messages.</p>' + (items or '<p>No messages yet. Register an account to begin.</p>') + '</html>'
