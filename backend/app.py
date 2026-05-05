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
    """
    Load district boundaries for a given state.
    File naming convention: <lowercase-state-name>-districts-detailed.geojson
    e.g. odisha -> odisha-districts-detailed.geojson
    """
    safe_name = state_name.lower().replace(" ", "-")
    filename = f'{safe_name}-districts-detailed.geojson'
    data = load_json(filename)

    if not data:
        # Fallback: try underscore format
        safe_name_us = state_name.lower().replace(" ", "_")
        filename_us = f'{safe_name_us}-districts-detailed.geojson'
        data = load_json(filename_us)

    if not data:
        return jsonify({"error": f"District data not found for state: {state_name}"}), 404

    return jsonify(data)

# --- API: FRA Parcels for a specific district ---
@app.route('/api/fra_parcels/<district_name>')
def get_fra_parcels(district_name):
    """
    Load FRA parcel/claim data for a given district.
    File naming convention: fra-parcels-<lowercase-district>.geojson
    e.g. koraput -> fra-parcels-koraput.geojson
    """
    safe_name = district_name.lower().replace(" ", "-")
    filename = f'fra-parcels-{safe_name}.geojson'
    data = load_json(filename)

    if not data:
        # Fallback: try sample_data.geojson for demo
        data = load_json('sample_data.geojson')

    if not data:
        return jsonify({"error": f"FRA parcel data not found for district: {district_name}"}), 404

    return jsonify(data)

# --- API: FRA Summary stats for a district ---
@app.route('/api/fra_stats/<district_name>')
def get_fra_stats(district_name):
    """
    Returns summary statistics for FRA claims in a district.
    This can be extended to query a database or read from files.
    """
    # Placeholder: in production, query your DB or aggregate GeoJSON properties
    stats = {
        "district": district_name,
        "total_claims": 0,
        "approved_claims": 0,
        "rejected_claims": 0,
        "pending_claims": 0,
        "total_area_ha": 0,
        "individual_claims": 0,
        "community_claims": 0,
    }

    # Try to compute from parcel data if available
    safe_name = district_name.lower().replace(" ", "-")
    data = load_json(f'fra-parcels-{safe_name}.geojson')
    if data and data.get('features'):
        features = data['features']
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

    return jsonify(stats)

# --- Health check ---
@app.route('/api/health')
def health():
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
