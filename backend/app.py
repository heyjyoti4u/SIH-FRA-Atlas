from flask import Flask, jsonify, request
from flask_cors import CORS
import json

app = Flask(__name__)
CORS(app)

# --- API to send State Boundaries ---
@app.route('/api/states')
def get_states():
    with open('data/india-states-detailed.geojson', 'r') as f:
        data = json.load(f)
    return jsonify(data)

# --- API to send District Boundaries for a specific state ---
@app.route('/api/districts/<state_name>')
def get_districts(state_name):
    if state_name.lower() == 'odisha':
        with open('data/odisha-districts-detailed.geojson', 'r') as f:
            data = json.load(f)
        return jsonify(data)
    return jsonify({"error": "State data not found"}), 404

if __name__ == '__main__':
    app.run(debug=True, port=5000)