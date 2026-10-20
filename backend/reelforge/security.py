"""Request filtering that keeps the API local and same-app only.

* Host header must be a loopback name, which blocks DNS-rebinding attacks.
* A browser Origin, when present, must be one of the configured frontends.
* State-changing requests must carry ``X-ReelForge-Client: 1``. Browsers
  cannot send custom headers cross-origin without a CORS preflight, and the
  preflight only succeeds for the configured frontends.
"""

from __future__ import annotations

import ipaddress
import json

from starlette.types import ASGIApp, Receive, Scope, Send

CLIENT_HEADER = "x-reelforge-client"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
LOOPBACK_NAMES = {"localhost", "127.0.0.1", "::1"}


def is_loopback(host: str) -> bool:
    if host in LOOPBACK_NAMES:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _host_only(value: str) -> str:
    value = value.strip().lower()
    if value.startswith("["):  # [::1]:8765
        return value[1 : value.find("]")] if "]" in value else value
    return value.rsplit(":", 1)[0] if value.count(":") == 1 else value


class LocalOnlyMiddleware:
    def __init__(self, app: ASGIApp, allowed_origins: list[str], extra_hosts: set[str] | None = None):
        self.app = app
        self.allowed_origins = set(allowed_origins)
        self.allowed_hosts = LOOPBACK_NAMES | (extra_hosts or set())

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        host = _host_only(headers.get("host", ""))
        if host not in self.allowed_hosts:
            await _reject(send, 421, "This server only answers requests addressed to localhost.")
            return
        origin = headers.get("origin")
        if origin is not None and origin not in self.allowed_origins:
            await _reject(send, 403, "Requests from this website are not allowed.")
            return
        if scope["method"] not in SAFE_METHODS and headers.get(CLIENT_HEADER) != "1":
            await _reject(send, 403, "Missing ReelForge client header.")
            return
        await self.app(scope, receive, send)


async def _reject(send: Send, status: int, message: str) -> None:
    body = json.dumps({"detail": message}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
