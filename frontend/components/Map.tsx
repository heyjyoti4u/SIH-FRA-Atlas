"use client"

import { useEffect, useRef } from "react"
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet"
import { GeoJsonObject } from "geojson"
import * as L from "leaflet"
import "leaflet/dist/leaflet.css"

// Fix Leaflet default icon paths broken by webpack
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

// --- Style for state/district boundaries ---
const boundaryStyle: L.PathOptions = {
  color: "#1a6b3c",
  weight: 1.5,
  opacity: 0.8,
  fillColor: "#4ade80",
  fillOpacity: 0.15,
}

// --- Style for FRA parcel claims ---
const parcelStyle = (feature?: GeoJSON.Feature): L.PathOptions => {
  const status = feature?.properties?.STATUS?.toLowerCase() || ""
  if (status.includes("approved")) return { color: "#16a34a", weight: 1, fillColor: "#22c55e", fillOpacity: 0.5 }
  if (status.includes("rejected")) return { color: "#dc2626", weight: 1, fillColor: "#ef4444", fillOpacity: 0.5 }
  return { color: "#d97706", weight: 1, fillColor: "#fbbf24", fillOpacity: 0.5 } // pending
}

// --- Popup content for each feature ---
const onEachFeature = (feature: GeoJSON.Feature, layer: L.Layer) => {
  const props = feature.properties || {}
  const rows = Object.entries(props)
    .filter(([key]) => !key.startsWith("_") && key !== "geometry")
    .map(([key, val]) => `<tr><td style="font-weight:600;padding:2px 8px 2px 0">${key}</td><td>${val ?? "—"}</td></tr>`)
    .join("")
  if (rows) {
    (layer as L.Path).bindPopup(`<table style="font-size:12px;min-width:160px">${rows}</table>`)
  }
}

// --- Inner component that reacts to new GeoJSON data and fits bounds ---
interface FitBoundsProps {
  data: GeoJsonObject | null
}

function FitBounds({ data }: FitBoundsProps) {
  const map = useMap()
  const geoJsonRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => {
    if (!data) return

    // Remove previous layer
    if (geoJsonRef.current) {
      geoJsonRef.current.remove()
    }

    // Detect if this is parcel data (has STATUS property) vs boundary
    const fc = data as GeoJSON.FeatureCollection
    const isParcel = fc.features?.[0]?.properties?.STATUS !== undefined

    const layer = L.geoJSON(data as any, {
      style: isParcel ? parcelStyle : () => boundaryStyle,
      onEachFeature,
      pointToLayer: (_feature, latlng) =>
        L.circleMarker(latlng, { radius: 6, color: "#1a6b3c", fillOpacity: 0.8 }),
    }).addTo(map)

    geoJsonRef.current = layer

    // Fit map to the bounds of the new data
    try {
      const bounds = layer.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 })
      }
    } catch (e) {
      console.warn("Could not fit bounds:", e)
    }

    return () => {
      layer.remove()
    }
  }, [data, map])

  return null
}

// --- Main exported Map component ---
interface MapComponentProps {
  mapViewData: GeoJsonObject | null
}

export default function MapComponent({ mapViewData }: MapComponentProps) {
  return (
    <MapContainer
      center={[20.5937, 78.9629]}   // Center of India
      zoom={5}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds data={mapViewData} />
    </MapContainer>
  )
}
