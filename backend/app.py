from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os

app = Flask(__name__)

# ── CORS: allow your Vercel frontend + local dev ──────────────────────────────
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# Pull extra allowed origins from environment variable set on Render dashboard
# e.g. ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-custom-domain.com
extra = os.environ.get("ALLOWED_ORIGINS", "")
if extra:
    ALLOWED_ORIGINS += [o.strip() for o in extra.split(",") if o.strip()]

CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

DATA_DIR = os.environ.get("DATA_DIR", "data")


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def compute_stats_from_features(features):
    stats = {
        "total_claims": 0,
        "approved_claims": 0,
        "rejected_claims": 0,
        "pending_claims": 0,
        "total_area_ha": 0.0,
        "individual_claims": 0,
        "community_claims": 0,
    }
    stats["total_claims"] = len(features)
    for f in features:
        props = f.get("properties", {})
        status = str(props.get("STATUS", "")).lower()
        claim_type = str(props.get("CLAIM_TYPE", "")).lower()
        area = props.get("AREA_HA", 0) or 0
        stats["total_area_ha"] += float(area)
        if "approved" in status:
            stats["approved_claims"] += 1
        elif "rejected" in status:
            stats["rejected_claims"] += 1
        else:
            stats["pending_claims"] += 1
        if "community" in claim_type:
            stats["community_claims"] += 1
        else:
            stats["individual_claims"] += 1
    stats["total_area_ha"] = round(stats["total_area_ha"], 2)
    total = stats["total_claims"]
    stats["approval_rate"] = round((stats["approved_claims"] / total * 100) if total else 0, 1)
    stats["rejection_rate"] = round((stats["rejected_claims"] / total * 100) if total else 0, 1)
    stats["pending_rate"] = round((stats["pending_claims"] / total * 100) if total else 0, 1)
    return stats


@app.route("/api/states")
def get_states():
    data = load_json("india-states-detailed.geojson")
    if not data:
        return jsonify({"error": "States data file not found"}), 404
    return jsonify(data)


@app.route("/api/districts/<state_name>")
def get_districts(state_name):
    safe = state_name.lower().replace(" ", "-")
    data = load_json(f"{safe}-districts-detailed.geojson")
    if not data:
        safe2 = state_name.lower().replace(" ", "_")
        data = load_json(f"{safe2}-districts-detailed.geojson")
    if not data:
        return jsonify({"error": f"District data not found for: {state_name}"}), 404
    return jsonify(data)


@app.route("/api/fra_parcels/<district_name>")
def get_fra_parcels(district_name):
    safe = district_name.lower().replace(" ", "-")
    data = load_json(f"fra-parcels-{safe}.geojson")
    if not data:
        data = load_json("sample_data.geojson")
    if not data:
        return jsonify({"error": f"FRA parcel data not found for: {district_name}"}), 404
    return jsonify(data)


@app.route("/api/fra_stats/<district_name>")
def get_fra_stats(district_name):
    safe = district_name.lower().replace(" ", "-")
    data = load_json(f"fra-parcels-{safe}.geojson")
    if not data:
        data = load_json("sample_data.geojson")
    features = data.get("features", []) if data else []
    stats = {"district": district_name}
    stats.update(compute_stats_from_features(features))
    return jsonify(stats)


@app.route("/api/state_stats/<state_name>")
def get_state_stats(state_name):
    safe = state_name.lower().replace(" ", "-")
    district_data = load_json(f"{safe}-districts-detailed.geojson")
    if not district_data:
        safe2 = state_name.lower().replace(" ", "_")
        district_data = load_json(f"{safe2}-districts-detailed.geojson")
    if not district_data:
        return jsonify({"error": f"No district data for: {state_name}"}), 404

    district_names = [
        f["properties"].get("DISTRICT") or f["properties"].get("NAME")
        for f in district_data.get("features", [])
        if (f["properties"].get("DISTRICT") or f["properties"].get("NAME"))
        and f["properties"].get("DISTRICT") != "FRA_DEMO_AREA"
    ]

    districts_stats = []
    state_totals = {
        "total_claims": 0, "approved_claims": 0, "rejected_claims": 0,
        "pending_claims": 0, "total_area_ha": 0.0,
        "individual_claims": 0, "community_claims": 0,
    }
    for district in district_names:
        safe_d = district.lower().replace(" ", "-")
        parcel_data = load_json(f"fra-parcels-{safe_d}.geojson")
        features = parcel_data.get("features", []) if parcel_data else []
        d_stats = compute_stats_from_features(features)
        d_stats["district"] = district
        districts_stats.append(d_stats)
        for key in ["total_claims", "approved_claims", "rejected_claims",
                    "pending_claims", "total_area_ha", "individual_claims", "community_claims"]:
            state_totals[key] += d_stats[key]

    state_totals["total_area_ha"] = round(state_totals["total_area_ha"], 2)
    total = state_totals["total_claims"]
    state_totals["approval_rate"] = round((state_totals["approved_claims"] / total * 100) if total else 0, 1)
    state_totals["rejection_rate"] = round((state_totals["rejected_claims"] / total * 100) if total else 0, 1)
    state_totals["pending_rate"] = round((state_totals["pending_claims"] / total * 100) if total else 0, 1)
    return jsonify({"state": state_name, "totals": state_totals, "districts": districts_stats})


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "data_dir": DATA_DIR, "allowed_origins": ALLOWED_ORIGINS})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
