"""本地静态服务器：所有响应禁缓存，用于开发预览。"""
import http.server
import socketserver

PORT = 5180


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


class DualStackServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    address_family = __import__("socket").AF_INET


if __name__ == "__main__":
    with DualStackServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"serving at http://127.0.0.1:{PORT} (no-cache)")
        httpd.serve_forever()
