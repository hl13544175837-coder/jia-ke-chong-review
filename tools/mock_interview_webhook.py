"""仅用于本地验收的企业微信通知适配器替身。"""

import json
import os
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HOST = os.environ.get("MOCK_WEBHOOK_HOST", "0.0.0.0")
PORT = int(os.environ.get("MOCK_WEBHOOK_PORT", "8090"))
DATA_FILE = Path(os.environ.get("MOCK_WEBHOOK_DATA_FILE", "/data/events.json"))
MAX_BODY_BYTES = 1024 * 1024
LOCK = threading.Lock()


def _load_events():
    try:
        value = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []
    return value if isinstance(value, list) else []


def _save_events(events):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = DATA_FILE.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(events[-50:], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(temporary, DATA_FILE)


class Handler(BaseHTTPRequestHandler):
    server_version = "LocalWeComAdapter/1.0"

    def _json_response(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._json_response(200, {"ok": True})
            return
        if self.path == "/events":
            with LOCK:
                events = _load_events()
            self._json_response(200, {"events": events})
            return
        self._json_response(404, {"error": "not_found"})

    def do_POST(self):
        if self.path == "/reset":
            with LOCK:
                _save_events([])
            self._json_response(200, {"ok": True})
            return
        if self.path != "/webhook":
            self._json_response(404, {"error": "not_found"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json_response(400, {"error": "invalid_content_length"})
            return
        if content_length < 1 or content_length > MAX_BODY_BYTES:
            self._json_response(413, {"error": "invalid_body_size"})
            return
        try:
            payload = json.loads(self.rfile.read(content_length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json_response(400, {"error": "invalid_json"})
            return
        event = {
            "received_at": datetime.now(timezone.utc).isoformat(),
            "idempotency_key": self.headers.get("Idempotency-Key"),
            "payload": payload,
        }
        with LOCK:
            events = _load_events()
            events.append(event)
            _save_events(events)
        self._json_response(200, {"ok": True})

    def log_message(self, pattern, *args):
        print(f"本地企微适配器：{pattern % args}", flush=True)


if __name__ == "__main__":
    print(f"本地企微适配器已监听 {HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
