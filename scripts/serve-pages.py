#!/usr/bin/env python3
"""Serve dist/ the way GitHub Pages does.

`vite preview` answers every missing path with index.html, which hides exactly the 404s
worth checking. Pages does not: a missing path gets a 404 status and the body of 404.html,
with the address left alone. This does the same, so what works here works there.

    python3 scripts/serve-pages.py [port] [directory]
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
ROOT = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else "dist")


class Pages(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_error(self, code, message=None, explain=None):
        fallback = os.path.join(ROOT, "404.html")
        if code != 404 or not os.path.exists(fallback):
            return super().send_error(code, message, explain)
        with open(fallback, "rb") as page:
            body = page.read()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("", PORT), Pages) as server:
        print(f"Serving {ROOT} on http://localhost:{PORT}")
        server.serve_forever()
