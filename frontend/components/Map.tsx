"use client"
import { useEffect, useRef } from "react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
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
const getParcelStyle = (feature?: GeoJSON.Feature): L.PathOptions => {
  const status = feature?.properties?.STATUS?.toLowerCase() || ""
  if (status.includes("approved"))
    return { color: "#16a34a", weight: 1.5, fillColor: "#22c55e", fillOpacity: 0.55 }
  if (status.includes("rejected"))
    return { color: "#dc2626", weight: 1.5, fillColor: "#ef4444", fillOpacity: 0.55 }
  return { color: "#d97706", weight: 1.5, fillColor: "#fbbf24", fillOpacity: 0.55 }
}

// --- Status badge HTML ---
const statusBadge = (status: string) => {
  const s = status.toLowerCase()
  if (s.includes("approved"))
    return `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">✓ Approved</span>`
  if (s.includes("rejected"))
    return `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">✗ Rejected</span>`
  return `<span style="background:#fef9c3;color:#854d0e;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">⏳ Pending</span>`
}

// --- Rich popup for FRA parcels ---
const parcelPopup = (props: Record<string, any>): string => {
  const status = props.STATUS || "Pending"
  const claimId = props.CLAIM_ID || props.claim_id || "—"
  const claimant = props.CLAIMANT || props.claimant || props.NAME || "—"
  const claimType = props.CLAIM_TYPE || props.claim_type || "Individual"
  const area = props.AREA_HA != null ? `${parseFloat(props.AREA_HA).toFixed(2)} ha` : "—"
  const village = props.VILLAGE || props.village || "—"
  const taluka = props.TALUKA || props.taluka || "—"
  const dateFiled = props.DATE_FILED || props.date_filed || "—"

  return `
    <div style="font-family:system-ui,sans-serif;min-width:200px;max-width:260px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:600;color:#111;">FRA Claim</span>
        ${statusBadge(status)}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr><td style="color:#6b7280;padding:3px 0;width:45%;">Claim ID</td><td style="color:#111;font-weight:500;padding:3px 0;">${claimId}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 0;">Claimant</td><td style="color:#111;padding:3px 0;">${claimant}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 0;">Type</td><td style="color:#111;padding:3px 0;text-transform:capitalize;">${claimType}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 0;">Area</td><td style="color:#111;font-weight:500;padding:3px 0;">${area}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 0;">Village</td><td style="color:#111;padding:3px 0;">${village}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 0;">Taluka</td><td style="color:#111;padding:3px 0;">${taluka}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 0;">Filed</td><td style="color:#111;padding:3px 0;">${dateFiled}</td></tr>
      </table>
    </div>
  `
}

// --- Popup for boundary features (state/district) ---
const boundaryPopup = (props: Record<string, any>): string => {
  const name = props.STATE || props.DISTRICT || props.NAME || "Unknown"
  const code = props.STATE_CODE || props.DISTRICT_CODE || props.CODE || ""
  return `
    <div style="font-family:system-ui,sans-serif;min-width:140px;">
      <div style="font-size:13px;font-weight:600;color:#111;margin-bottom:4px;">${name}</div>
      ${code ? `<div style="font-size:11px;color:#6b7280;">Code: ${code}</div>` : ""}
    </div>
  `
}

// --- onEachFeature: choose popup based on layer type ---
const onEachFeature = (isParcel: boolean) => (feature: GeoJSON.Feature, layer: L.Layer) => {
  const props = feature.properties || {}
  const html = isParcel ? parcelPopup(props) : boundaryPopup(props)
  ;(layer as L.Path).bindPopup(html, { maxWidth: 280 })

  // Highlight on hover for boundaries
  if (!isParcel) {
    (layer as L.Path).on({
      mouseover(e) {
        const l = e.target as L.Path
        l.setStyle({ fillOpacity: 0.35, weight: 2.5 })
        l.bringToFront()
      },
      mouseout(e) {
        const l = e.target as L.Path
        l.setStyle(boundaryStyle)
      },
    })
  }
}

// --- Inner component: renders GeoJSON and fits bounds ---
interface FitBoundsProps {
  data: GeoJsonObject | null
  visibleStatuses: string[]
}

function FitBounds({ data, visibleStatuses }: FitBoundsProps) {
  const map = useMap()
  const geoJsonRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => {
    if (!data) return

    if (geoJsonRef.current) {
      geoJsonRef.current.remove()
      geoJsonRef.current = null
    }

    const fc = data as GeoJSON.FeatureCollection
    const isParcel = fc.features?.[0]?.properties?.STATUS !== undefined

    // Filter features by visible status
    const filteredData: GeoJSON.FeatureCollection = isParcel
      ? {
          ...fc,
          features: fc.features.filter((f) => {
            const s = (f.properties?.STATUS || "pending").toLowerCase()
            if (s.includes("approved") && visibleStatuses.includes("approved")) return true
            if (s.includes("rejected") && visibleStatuses.includes("rejected")) return true
            if (!s.includes("approved") && !s.includes("rejected") && visibleStatuses.includes("pending")) return true
            return false
          }),
        }
      : (data as GeoJSON.FeatureCollection)

    const layer = L.geoJSON(filteredData as any, {
      style: isParcel ? getParcelStyle : () => boundaryStyle,
      onEachFeature: onEachFeature(isParcel),
      pointToLayer: (_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 7,
          color: "#1a6b3c",
          weight: 1.5,
          fillColor: "#4ade80",
          fillOpacity: 0.8,
        }),
    }).addTo(map)

    geoJsonRef.current = layer

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
  }, [data, visibleStatuses, map])

  return null
}

// --- Main exported Map component ---
interface MapComponentProps {
  mapViewData: GeoJsonObject | null
  visibleStatuses: string[]
}

export default function MapComponent({ mapViewData, visibleStatuses }: MapComponentProps) {
  return (
    <MapContainer
      center={[20.5937, 78.9629]}
      zoom={5}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds data={mapViewData} visibleStatuses={visibleStatuses} />
    </MapContainer>
  )
}
