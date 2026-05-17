#!/usr/bin/env python3
"""Local server for Ali's WerAR Studio — static files + GLB upload for iPhone AR."""

import json
import os
import socket
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

PORT = 5500
ROOT = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(ROOT, "models")
CURRENT_MODEL = os.path.join(MODELS_DIR, "current.glb")


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/info":
            self.send_json(
                {
                    "ip": get_lan_ip(),
                    "port": PORT,
                    "modelUrl": f"/models/current.glb",
                    "hasModel": os.path.isfile(CURRENT_MODEL),
                }
            )
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/upload":
            self.handle_upload()
            return
        self.send_error(404)

    def handle_upload(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > 80 * 1024 * 1024:
            self.send_json({"ok": False, "error": "Invalid file size"}, 400)
            return

        body = self.rfile.read(length)
        os.makedirs(MODELS_DIR, exist_ok=True)
        with open(CURRENT_MODEL, "wb") as f:
            f.write(body)

        self.send_json({"ok": True, "modelUrl": "/models/current.glb"})

    def send_json(self, data, code=200):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    os.makedirs(MODELS_DIR, exist_ok=True)
    ip = get_lan_ip()
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print()
    print("  Ali's WerAR Studio")
    print("  ------------------")
    print(f"  On this PC:    http://localhost:{PORT}")
    print(f"  On iPhone:     http://{ip}:{PORT}")
    print("  (iPhone must use the Wi-Fi address above, same network)")
    print()
    server.serve_forever()


if __name__ == "__main__":
    main()
