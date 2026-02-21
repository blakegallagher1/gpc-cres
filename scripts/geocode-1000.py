#!/usr/bin/env python3
"""
Geocode 1000 Louisiana parcel addresses via Google Maps API.
Pulls addresses from the gateway's parcel.bbox endpoint across 5 parishes,
geocodes each unique address, and saves results to JSON + CSV.
"""

import json, csv, time, sys, os
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import URLError

GATEWAY_URL = "https://api.gallagherpropco.com"
GATEWAY_KEY = os.environ.get("LOCAL_API_KEY", "Y9DgsDrlvfDfitSgfp0YtLwjlvY5ocKnYA_4X11tfkc")
GOOGLE_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "AIzaSyB2UtkBbR_ZB1XIwKyPbsAHTJMxd5m8YoE")

# Bounding boxes for 5 parishes — multiple sub-regions to get diverse addresses
PARISH_BBOXES = [
    # East Baton Rouge — downtown
    {"name": "EBR-downtown", "west": -91.195, "south": 30.440, "east": -91.170, "north": 30.460},
    # East Baton Rouge — midcity
    {"name": "EBR-midcity", "west": -91.175, "south": 30.450, "east": -91.150, "north": 30.470},
    # East Baton Rouge — college/tiger town
    {"name": "EBR-LSU", "west": -91.195, "south": 30.400, "east": -91.170, "north": 30.420},
    # East Baton Rouge — north
    {"name": "EBR-north", "west": -91.200, "south": 30.470, "east": -91.170, "north": 30.500},
    # East Baton Rouge — south/industriplex
    {"name": "EBR-south", "west": -91.120, "south": 30.370, "east": -91.090, "north": 30.400},
    # East Baton Rouge — Airline Hwy corridor
    {"name": "EBR-airline", "west": -91.130, "south": 30.420, "east": -91.100, "north": 30.450},
    # East Baton Rouge — Sherwood Forest
    {"name": "EBR-sherwood", "west": -91.090, "south": 30.420, "east": -91.060, "north": 30.450},
    # East Baton Rouge — Cortana / Scenic
    {"name": "EBR-cortana", "west": -91.130, "south": 30.450, "east": -91.100, "north": 30.480},
    # East Baton Rouge — Baker
    {"name": "EBR-baker", "west": -91.190, "south": 30.570, "east": -91.150, "north": 30.600},
    # East Baton Rouge — Zachary
    {"name": "EBR-zachary", "west": -91.180, "south": 30.640, "east": -91.140, "north": 30.670},
    # Ascension — Gonzales
    {"name": "ASC-gonzales", "west": -90.940, "south": 30.220, "east": -90.900, "north": 30.250},
    # Ascension — Prairieville
    {"name": "ASC-prairieville", "west": -90.990, "south": 30.280, "east": -90.950, "north": 30.310},
    # Ascension — Dutchtown / Sorrento
    {"name": "ASC-dutchtown", "west": -90.880, "south": 30.180, "east": -90.840, "north": 30.210},
    # Livingston — Denham Springs
    {"name": "LIV-denham", "west": -90.980, "south": 30.470, "east": -90.940, "north": 30.500},
    # Livingston — Walker
    {"name": "LIV-walker", "west": -90.890, "south": 30.480, "east": -90.850, "north": 30.510},
    # Livingston — central
    {"name": "LIV-central", "west": -90.820, "south": 30.500, "east": -90.780, "north": 30.530},
    # West Baton Rouge — Port Allen
    {"name": "WBR-portallen", "west": -91.230, "south": 30.440, "east": -91.200, "north": 30.470},
    # West Baton Rouge — Brusly
    {"name": "WBR-brusly", "west": -91.250, "south": 30.380, "east": -91.220, "north": 30.410},
    # Iberville — Plaquemine
    {"name": "IBV-plaquemine", "west": -91.260, "south": 30.270, "east": -91.220, "north": 30.300},
    # Iberville — White Castle
    {"name": "IBV-whitecastle", "west": -91.180, "south": 30.160, "east": -91.140, "north": 30.190},
]

TARGET = 1000


def gateway_post(path, body):
    """POST to gateway and return parsed JSON."""
    data = json.dumps(body).encode()
    req = Request(
        f"{GATEWAY_URL}{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {GATEWAY_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "EntitlementOS/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  Gateway error: {e}", file=sys.stderr)
        return None


def geocode_google(address):
    """Geocode an address via Google Maps. Returns (lat, lng) or None."""
    params = urlencode({
        "address": address,
        "key": GOOGLE_KEY,
        "components": "country:US",
    })
    url = f"https://maps.googleapis.com/maps/api/geocode/json?{params}"
    try:
        with urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
        if data.get("status") == "OK" and data.get("results"):
            loc = data["results"][0]["geometry"]["location"]
            return loc["lat"], loc["lng"]
    except Exception as e:
        print(f"  Geocode error for '{address}': {e}", file=sys.stderr)
    return None


def main():
    print(f"=== Geocoding {TARGET} Louisiana parcel addresses ===\n")

    # Phase 1: Pull addresses from gateway
    print("Phase 1: Pulling addresses from gateway...")
    all_parcels = {}  # address -> parcel_id (dedup by address)

    for bbox in PARISH_BBOXES:
        if len(all_parcels) >= TARGET * 2:  # pull extra to account for no-address parcels
            break
        result = gateway_post("/tools/parcel.bbox", {
            "west": bbox["west"],
            "south": bbox["south"],
            "east": bbox["east"],
            "north": bbox["north"],
            "limit": 100,
        })
        if not result or "parcels" not in result:
            print(f"  {bbox['name']}: no results")
            continue
        count = 0
        for p in result["parcels"]:
            addr = (p.get("address") or "").strip()
            if addr and addr != "(no address)" and addr not in all_parcels:
                all_parcels[addr] = p.get("parcel_id", "")
                count += 1
        print(f"  {bbox['name']}: +{count} addresses (total: {len(all_parcels)})")

    # If we don't have enough, do denser searches
    if len(all_parcels) < TARGET:
        print(f"\n  Need more addresses ({len(all_parcels)}/{TARGET}), doing denser grid...")
        # Sub-divide EBR into smaller boxes
        for lat_start in [30.38, 30.40, 30.42, 30.44, 30.46, 30.48, 30.50, 30.52, 30.54, 30.56]:
            for lng_start in [-91.22, -91.19, -91.16, -91.13, -91.10, -91.07]:
                if len(all_parcels) >= TARGET * 1.5:
                    break
                result = gateway_post("/tools/parcel.bbox", {
                    "west": lng_start,
                    "south": lat_start,
                    "east": lng_start + 0.03,
                    "north": lat_start + 0.02,
                    "limit": 100,
                })
                if not result or "parcels" not in result:
                    continue
                for p in result["parcels"]:
                    addr = (p.get("address") or "").strip()
                    if addr and addr != "(no address)" and addr not in all_parcels:
                        all_parcels[addr] = p.get("parcel_id", "")
            if len(all_parcels) >= TARGET * 1.5:
                break

    addresses = list(all_parcels.items())[:TARGET]
    print(f"\nPhase 1 complete: {len(addresses)} unique addresses to geocode\n")

    # Phase 2: Geocode each address
    print("Phase 2: Geocoding via Google Maps API...")
    results = []
    errors = 0
    batch_start = time.time()

    for i, (addr, parcel_id) in enumerate(addresses):
        full_addr = f"{addr}, Louisiana"
        coords = geocode_google(full_addr)

        if coords:
            results.append({
                "address": addr,
                "parcel_id": parcel_id,
                "lat": coords[0],
                "lng": coords[1],
                "geocoder": "google",
            })
        else:
            errors += 1
            results.append({
                "address": addr,
                "parcel_id": parcel_id,
                "lat": None,
                "lng": None,
                "geocoder": "failed",
            })

        # Progress every 50
        if (i + 1) % 50 == 0:
            elapsed = time.time() - batch_start
            rate = (i + 1) / elapsed
            print(f"  {i+1}/{len(addresses)} geocoded ({rate:.1f}/sec, {errors} errors)")

        # Rate limit: ~40/sec to stay safe
        if (i + 1) % 40 == 0:
            time.sleep(1.0)

    elapsed = time.time() - batch_start
    successful = len([r for r in results if r["lat"] is not None])
    print(f"\nPhase 2 complete: {successful}/{len(results)} geocoded in {elapsed:.1f}s ({errors} errors)\n")

    # Phase 3: Save results
    out_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(out_dir, "geocoded-addresses.json")
    csv_path = os.path.join(out_dir, "geocoded-addresses.csv")

    with open(json_path, "w") as f:
        json.dump({
            "count": len(results),
            "successful": successful,
            "errors": errors,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "addresses": results,
        }, f, indent=2)

    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["parcel_id", "address", "lat", "lng", "geocoder"])
        writer.writeheader()
        writer.writerows(results)

    print(f"Saved: {json_path}")
    print(f"Saved: {csv_path}")
    print(f"\nDone! {successful} addresses geocoded successfully.")


if __name__ == "__main__":
    main()
