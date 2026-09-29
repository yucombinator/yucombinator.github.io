#!/usr/bin/env python3
"""Static dev server for the PUD map that never caches.

`python3 -m http.server` sends no cache headers, so browsers hold on to stale ES
modules while you are editing them and the page quietly runs yesterday's code.
This adds no-store to everything.

Usage:
    /tmp/transitenv/bin/python tools/serve.py [port]
"""
import functools
import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8848


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):        # keep the dev output quiet
        pass


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"serving {ROOT} at http://127.0.0.1:{PORT}/ (no-store)")
        httpd.serve_forever()
