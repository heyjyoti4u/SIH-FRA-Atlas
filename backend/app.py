from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)

DATA_DIR = 'data'


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


# --- API: All State Boundaries ---
@app.route('/api/states')
def get_states():
    data = load_json('india-states-detailed.geojson')
    if not data:
        return jsonify({"error": "States data file not found"}), 404
    return jsonify(data)


# --- API: Districts for a specific state ---
@app.route('/api/districts/<state_name>')
def get_districts(state_name):
    safe_name = state_name.lower().replace(" ", "-")
    filename = f'{safe_name}-districts-detailed.geojson'
    data = load_json(filename)
    if not data:
        safe_name_us = state_name.lower().replace(" ", "_")
        filename_us = f'{safe_name_us}-districts-detailed.geojson'
        data = load_json(filename_us)
    if not data:
        return jsonify({"error": f"District data not found for state: {state_name}"}), 404
    return jsonify(data)


# --- API: FRA Parcels for a specific district ---
@app.route('/api/fra_parcels/<district_name>')
def get_fra_parcels(district_name):
    safe_name = district_name.lower().replace(" ", "-")
    filename = f'fra-parcels-{safe_name}.geojson'
    data = load_json(filename)
    if not data:
        data = load_json('sample_data.geojson')
    if not data:
        return jsonify({"error": f"FRA parcel data not found for district: {district_name}"}), 404
    return jsonify(data)


# --- Helper: compute stats from a list of features ---
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
    stats['total_claims'] = len(features)
    for f in features:
        props = f.get('properties', {})
        status = str(props.get('STATUS', '')).lower()
        claim_type = str(props.get('CLAIM_TYPE', '')).lower()
        area = props.get('AREA_HA', 0) or 0
        stats['total_area_ha'] += float(area)
        if 'approved' in status:
            stats['approved_claims'] += 1
        elif 'rejected' in status:
            stats['rejected_claims'] += 1
        else:
            stats['pending_claims'] += 1
        if 'community' in claim_type:
            stats['community_claims'] += 1
        else:
            stats['individual_claims'] += 1
    stats['total_area_ha'] = round(stats['total_area_ha'], 2)
    # Derived metrics
    if stats['total_claims'] > 0:
        stats['approval_rate'] = round(
            (stats['approved_claims'] / stats['total_claims']) * 100, 1
        )
        stats['rejection_rate'] = round(
            (stats['rejected_claims'] / stats['total_claims']) * 100, 1
        )
        stats['pending_rate'] = round(
            (stats['pending_claims'] / stats['total_claims']) * 100, 1
        )
    else:
        stats['approval_rate'] = 0
        stats['rejection_rate'] = 0
        stats['pending_rate'] = 0
    return stats


# --- API: FRA Summary stats for a district ---
@app.route('/api/fra_stats/<district_name>')
def get_fra_stats(district_name):
    stats = {"district": district_name}
    safe_name = district_name.lower().replace(" ", "-")
    data = load_json(f'fra-parcels-{safe_name}.geojson')
    if not data:
        data = load_json('sample_data.geojson')

    if data and data.get('features'):
        computed = compute_stats_from_features(data['features'])
        stats.update(computed)
    else:
        stats.update({
            "total_claims": 0,
            "approved_claims": 0,
            "rejected_claims": 0,
            "pending_claims": 0,
            "total_area_ha": 0,
            "individual_claims": 0,
            "community_claims": 0,
            "approval_rate": 0,
            "rejection_rate": 0,
            "pending_rate": 0,
        })
    return jsonify(stats)


# --- API: NEW — Aggregate FRA stats for all districts in a state ---
@app.route('/api/state_stats/<state_name>')
def get_state_stats(state_name):
    """
    Aggregates FRA claim stats across all districts of a given state.
    Reads the state's district list, then loads parcel files per district.
    Returns per-district breakdown + state-level totals.
    """
    safe_state = state_name.lower().replace(" ", "-")
    district_data = load_json(f'{safe_state}-districts-detailed.geojson')
    if not district_data:
        safe_state_us = state_name.lower().replace(" ", "_")
        district_data = load_json(f'{safe_state_us}-districts-detailed.geojson')
    if not district_data:
        return jsonify({"error": f"No district data found for state: {state_name}"}), 404

    district_names = []
    for f in district_data.get('features', []):
        props = f.get('properties', {})
        name = props.get('DISTRICT') or props.get('NAME')
        if name and name != 'FRA_DEMO_AREA':
            district_names.append(name)

    districts_stats = []
    state_totals = {
        "total_claims": 0,
        "approved_claims": 0,
        "rejected_claims": 0,
        "pending_claims": 0,
        "total_area_ha": 0.0,
        "individual_claims": 0,
        "community_claims": 0,
    }

    for district in district_names:
        safe_d = district.lower().replace(" ", "-")
        parcel_data = load_json(f'fra-parcels-{safe_d}.geojson')
        features = parcel_data.get('features', []) if parcel_data else []
        d_stats = compute_stats_from_features(features)
        d_stats['district'] = district

        districts_stats.append(d_stats)

        for key in ["total_claims", "approved_claims", "rejected_claims",
                    "pending_claims", "total_area_ha", "individual_claims", "community_claims"]:
            state_totals[key] += d_stats[key]

    state_totals['total_area_ha'] = round(state_totals['total_area_ha'], 2)
    total = state_totals['total_claims']
    state_totals['approval_rate'] = round(
        (state_totals['approved_claims'] / total * 100) if total else 0, 1)
    state_totals['rejection_rate'] = round(
        (state_totals['rejected_claims'] / total * 100) if total else 0, 1)
    state_totals['pending_rate'] = round(
        (state_totals['pending_claims'] / total * 100) if total else 0, 1)

    return jsonify({
        "state": state_name,
        "totals": state_totals,
        "districts": districts_stats,
    })


# --- Health check ---
@app.route('/api/health')
def health():
    return jsonify({"status": "ok"})


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
