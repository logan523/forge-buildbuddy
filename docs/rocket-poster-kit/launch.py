#!/usr/bin/env python3
"""
Launch Library 2 -> normalized record -> poster, with a cache that respects a
very small budget.

The policy here is not invented; it is the same policy the build plan
(`src/data/rocket-launch-art.json`, steps 6 and 7) tells the builder to put in
firmware, implemented once so the tooling and the device cannot disagree:

  * API 2.2.0, NOT 2.3.0. 2.2.0 returns the complete field set in ~4.5KB;
    2.3.0 inflates the same data to 15-50KB with agency statistics nothing
    here displays.
  * `hide_recent_previous=true` on upcoming. Without it the "next" launch is
    often one that already flew.
  * The free tier allows ~15 requests/hour PER IP -- not per device. A whole
    household shares that budget. Poll adaptively and the peak is 12/hr.
  * Only re-render when the launch id or a displayed field actually changed.
  * Stale-while-revalidate: a fetch failure serves the last good record. The
    wall piece must never blank because an API had a bad afternoon.

Runs on a laptop or a Pi. Deliberately NOT on the ESP32 -- the device
downloads pre-packed bytes; decoding and rendering cost RAM and awake time,
which is the battery budget.
"""

import argparse, hashlib, json, os, time, urllib.error, urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, ".cache")
BASE = "https://ll.thespacedevs.com/2.2.0/launch"
UA = "forge-rocket-poster/1.0 (+https://github.com/ personal wall display)"

# (hours until T-0, seconds between polls). Peak 12 req/hr against a 15/hr cap,
# leaving headroom for a retry rather than spending the whole budget.
POLL_LADDER = [(1, 300), (6, 900), (24, 1800), (float("inf"), 3600)]


def poll_interval(t0_iso):
    """Seconds to wait before the next fetch, from how close the launch is."""
    try:
        t0 = datetime.strptime(t0_iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return 3600
    hours = (t0 - datetime.now(timezone.utc)).total_seconds() / 3600.0
    for limit, secs in POLL_LADDER:
        if hours < limit:
            return secs
    return 3600


def normalize(raw):
    """LL2's nested response -> the same flat 20-field shape as
    launch-samples.json, so the 24 curated records stay usable as offline
    fixtures and the renderer never learns two input shapes."""
    cfg = (raw.get("rocket") or {}).get("configuration") or {}
    mission = raw.get("mission") or {}
    orbit = mission.get("orbit") or {}
    pad = raw.get("pad") or {}
    loc = pad.get("location") or {}
    status = raw.get("status") or {}
    fam = (cfg.get("family") or "").strip()
    return {
        "id": raw.get("id"),
        "rocket": cfg.get("full_name") or cfg.get("name") or "Unknown vehicle",
        # `variant` is an EMPTY STRING on base models, not null -- concatenating
        # it unguarded yields a trailing space on most records.
        "rocket_short": (cfg.get("name") or "").strip() or None,
        "rocket_family": fam or None,
        "mission": mission.get("name") or raw.get("name") or "",
        "purpose": mission.get("type") or "Unknown",
        "destination": orbit.get("name") or "Unknown",
        "destination_abbrev": orbit.get("abbrev") or "",
        "description": mission.get("description") or "",
        "provider": (raw.get("launch_service_provider") or {}).get("name") or "",
        "provider_type": (raw.get("launch_service_provider") or {}).get("type") or "",
        "site": loc.get("name") or "",
        "pad": pad.get("name") or "",
        # The AGENCY's country, not the pad's -- an Electron flying from
        # Wallops is still a New Zealand vehicle, and a Soyuz from Kourou is
        # still Russian. Falls back to the pad's country when the provider has
        # none.
        "country": ((raw.get("launch_service_provider") or {}).get("country_code")
                    or loc.get("country_code") or ""),
        "lat": pad.get("latitude") or "",
        "lon": pad.get("longitude") or "",
        "t0_utc": raw.get("net") or "",
        "window_start": raw.get("window_start") or "",
        "window_end": raw.get("window_end") or "",
        # ~86% of upcoming launches are TBD. That is the normal state, not a
        # fault, and must never be rendered as an error.
        "status": status.get("abbrev") or "TBD",
        "status_full": status.get("name") or "To Be Determined",
    }


def _cache_path(key):
    return os.path.join(CACHE_DIR, f"{key}.json")


def _read_cache(key):
    try:
        with open(_cache_path(key)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


# The 15/hr cap is PER IP and shared with everything else on the household
# network, so the only safe assumption is that we are not the only spender.
# Persisted, because a server restart that forgot its spending would be free
# to blow the whole budget again immediately.
HOURLY_CAP = 15
_SPEND = os.path.join(CACHE_DIR, "spend.json")


def _spent(window=3600):
    """Upstream requests issued in the last hour."""
    try:
        with open(_SPEND) as f:
            stamps = json.load(f)
    except (OSError, ValueError):
        stamps = []
    cut = time.time() - window
    return [t for t in stamps if t > cut]


def _record_spend():
    stamps = _spent() + [time.time()]
    os.makedirs(CACHE_DIR, exist_ok=True)
    tmp = _SPEND + ".tmp"
    with open(tmp, "w") as f:
        json.dump(stamps, f)
    os.replace(tmp, _SPEND)


def budget():
    """(spent, cap, seconds until the oldest request ages out)."""
    stamps = _spent()
    frees_in = int(stamps[0] + 3600 - time.time()) if stamps else 0
    return len(stamps), HOURLY_CAP, max(0, frees_in)


class BudgetExhausted(RuntimeError):
    """Raised instead of issuing a request that would tip us into a 429.

    Being throttled is worse than being stale: a 429 blocks the household IP
    for everything, and the poll loop then cannot recover on its own schedule.
    """


def _write_cache(key, payload):
    os.makedirs(CACHE_DIR, exist_ok=True)
    tmp = _cache_path(key) + ".tmp"
    with open(tmp, "w") as f:
        json.dump(payload, f, indent=1)
    os.replace(tmp, _cache_path(key))      # atomic; a killed write cannot corrupt


def fetch(kind="upcoming", force=False):
    """Returns (record, meta). meta.source is 'cache' | 'network' | 'stale'.

    'stale' means the network failed and the last good record is being served
    anyway -- the honest state, surfaced rather than hidden.
    """
    key = kind
    cached = _read_cache(key)
    now = time.time()

    if cached and not force:
        age = now - cached.get("fetched_at", 0)
        due = cached.get("next_poll_after", 0)
        if now < due:
            return cached["record"], {"source": "cache", "age_s": int(age),
                                      "next_in_s": int(due - now)}

    url = (f"{BASE}/upcoming/?limit=1&hide_recent_previous=true"
           if kind == "upcoming" else f"{BASE}/previous/?limit=1")
    spent, cap, frees_in = budget()
    if spent >= cap:
        if cached:
            return cached["record"], {"source": "stale", "budget_exhausted": True,
                                      "error": f"{spent}/{cap} requests used this hour; "
                                               f"budget frees up in {frees_in//60}min"}
        raise BudgetExhausted(f"{spent}/{cap} requests used this hour, and nothing "
                              f"cached to fall back on; retry in {frees_in//60}min")

    req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip", "User-Agent": UA})
    _record_spend()          # count the attempt, not the success -- a request
                             # that 500s or times out still cost us a slot
    try:
        import gzip, io
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                body = gzip.GzipFile(fileobj=io.BytesIO(body)).read()
        results = json.loads(body).get("results") or []
        if not results:
            raise ValueError("no results in response")
        rec = normalize(results[0])
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError) as e:
        if cached:
            # Never retry-storm and never blank the wall. 429 in particular
            # means the household IP is already throttled; backing off is the
            # only correct move.
            return cached["record"], {"source": "stale", "error": str(e)}
        raise

    # previous/ changes only after something actually flies -- no reason to ask
    # again on the upcoming launch's cadence.
    interval = poll_interval(rec.get("t0_utc")) if kind == "upcoming" else 6 * 3600
    prior = (cached or {}).get("record") or {}
    _write_cache(key, {"fetched_at": now, "next_poll_after": now + interval,
                       "record": rec})
    return rec, {"source": "network", "next_in_s": interval,
                 "changed": digest(prior) != digest(rec)}


# Only the fields the poster actually draws. A description edit upstream must
# not burn a panel refresh -- e-ink refreshes are the expensive thing here.
SHOWN = ("id", "rocket", "mission", "purpose", "destination", "provider",
         "site", "t0_utc", "status")


def digest(rec):
    return hashlib.sha256(
        json.dumps({k: rec.get(k) for k in SHOWN}, sort_keys=True).encode()).hexdigest()[:12]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=os.path.join(HERE, "next-launch.png"))
    p.add_argument("--force", action="store_true", help="ignore the poll schedule")
    p.add_argument("--bin", action="store_true")
    p.add_argument("--offline", action="store_true", help="render from cache only")
    a = p.parse_args()

    from poster import render
    from spectra6 import verify, pack, index_map

    if a.offline:
        up, prev = (_read_cache("upcoming") or {}).get("record"), \
                   (_read_cache("previous") or {}).get("record")
        if not up:
            raise SystemExit("no cached upcoming launch; run once online first")
        meta = {"source": "cache"}
    else:
        up, meta = fetch("upcoming", force=a.force)
        prev, _ = fetch("previous", force=a.force)

    print(f"next     : {up['rocket']} · {up['mission']} -> {up['destination']}")
    print(f"           {up['t0_utc']}  [{up['status']}]  via {meta['source']}")
    if prev:
        print(f"previous : {prev['rocket']} · {prev['mission']}")

    img = render(up, previous=prev)
    bad = verify(img)
    img.save(a.out)
    print(f"poster   : {a.out}  {'OK' if not bad else f'OFF-INK {len(bad)}'}")

    if a.bin:
        b = pack(index_map(img))
        path = a.out.rsplit(".", 1)[0] + ".bin"
        open(path, "wb").write(b)
        print(f"panel    : {path}  ({len(b):,} bytes)")

    # Provenance: the record that produced this image, kept beside it so the
    # exact poster can be regenerated later.
    with open(a.out.rsplit(".", 1)[0] + ".json", "w") as f:
        json.dump({"digest": digest(up), "next": up, "previous": prev}, f, indent=1)


if __name__ == "__main__":
    main()
