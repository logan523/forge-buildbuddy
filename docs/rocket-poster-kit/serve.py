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
# The last good poster, on disk. A frame on a wall outlives this process --
# power cuts, reboots, deploys -- and without persistence every restart threw
# away a poster that cost an API call to make and left the panel showing a 503
# until the next successful fetch. Worse on a cold boot with the router still
# coming up: the frame would get an error and show nothing indefinitely.
LAST = os.path.join(HERE, ".last-panel.bmp")
LAST_META = os.path.join(HERE, ".last-panel.json")
STATE = {"bmp": None, "etag": None, "record": None, "rendered_at": 0,
         "source": "never", "error": None, "restored": False}
LOCK = threading.Lock()


def _persist():
    """Write atomically -- a power cut mid-write must not leave a truncated
    BMP that the frame would then render as garbage."""
    with LOCK:
        bmp, etag, rec, at = STATE["bmp"], STATE["etag"], STATE["record"], STATE["rendered_at"]
    if not bmp:
        return
    tmp = LAST + ".tmp"
    with open(tmp, "wb") as f:
        f.write(bmp)
    os.replace(tmp, LAST)
    tmp = LAST_META + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"etag": etag, "record": rec, "rendered_at": at}, f)
    os.replace(tmp, LAST_META)


def restore():
    """Serve the last known poster immediately at startup, before any network
    call. A stale launch on the wall beats a blank panel, and the poll loop
    replaces it within one cycle if it has moved on."""
    try:
        with open(LAST, "rb") as f:
            bmp = f.read()
        with open(LAST_META) as f:
            meta = json.load(f)
    except (OSError, ValueError):
        return False
    if len(bmp) != 1152054:               # 800x480 24-bit + header
        return False                      # truncated; ignore rather than serve
    with LOCK:
        STATE.update(bmp=bmp, etag=meta.get("etag"), record=meta.get("record"),
                     rendered_at=meta.get("rendered_at", 0),
                     source="restored", restored=True)
    return True


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
                     error=None, restored=False)
    _persist()
    return True


def poll_loop(stop):
    """Adaptive polling, straight from the build plan: hourly when the launch
    is far out, tightening to every five minutes in the final hour. Peaks at 12
    requests/hour against a limit of 15 PER IP -- not per device."""
    while not stop.is_set():
        changed = rebuild()
        with LOCK:
            err = STATE["error"]
        if err:
            # Keep serving whatever is already loaded and retry sooner than
            # the normal cadence -- but not so fast that a 429 turns into a
            # retry storm against a 15-per-hour budget.
            print(f"[{time.strftime('%H:%M:%S')}] fetch failed ({err}); "
                  f"serving last known, retry in 5min", flush=True)
            stop.wait(300)
            continue
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

    if restore():
        with LOCK:
            age = int((time.time() - STATE["rendered_at"]) / 60)
        print(f"restored the last poster from disk ({age} min old) -- serving "
              f"it now, refreshing on the first successful fetch")

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
