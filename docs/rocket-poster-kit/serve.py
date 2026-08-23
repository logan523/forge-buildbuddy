#!/usr/bin/env python3
"""
The server the frame polls: render on a schedule, serve the BMP with an ETag.

    python3 serve.py --port 8080

Then point the frame's firmware at http://<this-host>:8080/panel.bmp.

Two jobs, and the ETag is what makes them cheap. The frame wakes on its own
schedule and asks for the image; if the launch data has not changed, the ETag
matches and this returns 304 Not Modified with no body. The frame goes straight
back to sleep WITHOUT a panel refresh -- which matters because a refresh takes
~25 seconds and is by far the most expensive thing the device does. A poster
only gets redrawn when something real changed.

The ETag is the content digest of the fields actually DRAWN (launch.digest),
not of the whole API record. An upstream description edit or a lat/lon
correction must not burn a refresh.

Stdlib only, deliberately -- no framework for two routes, and nothing new to
install on whatever Pi or spare machine this ends up on.
"""

import argparse, http.server, io, json, os, threading, time

from PIL import Image

import export_bmp, launch, poster

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = {"bmp": None, "etag": None, "record": None, "rendered_at": 0,
         "source": "never", "error": None}
LOCK = threading.Lock()


def rebuild(force=False):
    """Fetch, render, pack. Returns True when the image actually changed."""
    try:
        up, meta = launch.fetch("upcoming", force=force)
        prev, _ = launch.fetch("previous", force=force)
    except Exception as e:
        with LOCK:
            STATE["error"] = f"{type(e).__name__}: {e}"
        return False

    etag = launch.digest(up)
    with LOCK:
        unchanged = etag == STATE["etag"] and STATE["bmp"] is not None
    if unchanged and not force:
        with LOCK:
            STATE["source"], STATE["error"] = meta.get("source", "?"), None
        return False

    img = poster.render(up, previous=prev)
    stray = export_bmp.to_panel_bmp(img)          # raises if any pixel is off-ink
    buf = io.BytesIO()
    stray.save(buf, "BMP")
    with LOCK:
        STATE.update(bmp=buf.getvalue(), etag=etag, record=up,
                     rendered_at=time.time(), source=meta.get("source", "?"),
                     error=None)
    return True


def poll_loop(stop):
    """Adaptive polling, straight from the build plan: hourly when the launch
    is far out, tightening to every five minutes in the final hour. Peaks at 12
    requests/hour against a limit of 15 PER IP -- not per device."""
    while not stop.is_set():
        changed = rebuild()
        with LOCK:
            rec = STATE["record"]
        wait = launch.poll_interval(rec.get("t0_utc")) if rec else 900
        print(f"[{time.strftime('%H:%M:%S')}] "
              f"{'redrew' if changed else 'unchanged'} · next check in {wait//60}min",
              flush=True)
        stop.wait(wait)


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass                                      # quiet; the poll loop narrates

    def _send(self, code, body=b"", ctype="text/plain", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if body and self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = self.path.split("?")[0]
        with LOCK:
            bmp, etag, rec = STATE["bmp"], STATE["etag"], STATE["record"]
            snap = dict(STATE); snap.pop("bmp")

        if path in ("/panel.bmp", "/image.bmp", "/"):
            if bmp is None:
                return self._send(503, b"no poster rendered yet")
            # The whole point: an unchanged launch costs the frame nothing and
            # spares it a 25-second refresh.
            if self.headers.get("If-None-Match") == f'"{etag}"':
                return self._send(304)
            return self._send(200, bmp, "image/bmp",
                              {"ETag": f'"{etag}"', "Cache-Control": "no-cache"})

        if path == "/status":
            snap["record"] = {k: rec.get(k) for k in
                              ("rocket", "mission", "destination", "t0_utc", "status")} if rec else None
            snap["age_s"] = int(time.time() - snap["rendered_at"]) if snap["rendered_at"] else None
            return self._send(200, json.dumps(snap, indent=1).encode(), "application/json")

        if path == "/refresh":
            changed = rebuild(force=True)
            return self._send(200, json.dumps({"changed": changed}).encode(), "application/json")

        self._send(404, b"not found")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--once", action="store_true", help="render once and exit")
    a = ap.parse_args()

    if a.once:
        rebuild(force=True)
        with LOCK:
            print(f"etag {STATE['etag']}  {len(STATE['bmp'] or b''):,} bytes  "
                  f"{STATE['record']['rocket']} · {STATE['record']['mission']}")
        return

    stop = threading.Event()
    threading.Thread(target=poll_loop, args=(stop,), daemon=True).start()
    srv = http.server.ThreadingHTTPServer((a.host, a.port), Handler)
    print(f"serving on http://{a.host}:{a.port}/panel.bmp   (status at /status)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        stop.set()


if __name__ == "__main__":
    main()
