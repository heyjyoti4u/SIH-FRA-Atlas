"use client"

import { useEffect } from "react"
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import L, { Layer } from "leaflet"
import { GeoJsonObject } from "geojson"

// Map Controller
const MapController = ({ data }: { data: GeoJsonObject | null }) => {
  const map = useMap();
  useEffect(() => {
    if (data && (data as any).features?.length > 0) {
      const bounds = L.geoJSON(data as any).getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
      }
    }
  }, [data, map]);
  return null;
};

export default function Map({ mapViewData }: { mapViewData: GeoJsonObject | null }) {
  useEffect(() => {
    // Leaflet Icon Fix - Isko useEffect mein daalna zaroori hai taaki ye server par run na ho
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
      iconUrl: require("leaflet/dist/images/marker-icon.png"),
      shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
    });
  }, []);

  const onEachFeature = (feature: GeoJSON.Feature, layer: Layer) => {
    if (feature.properties?.holderName) {
      const popupContent = `...`; // Apni popup HTML yahan daalna
      layer.bindPopup(popupContent);
    }
  };

  return (
    <MapContainer center={[20.5937, 78.9629]} zoom={5} scrollWheelZoom={true} className="h-full w-full rounded-lg bg-gray-100">
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; CARTO' />
      {mapViewData && <GeoJSON data={mapViewData} onEachFeature={onEachFeature} />}
      <MapController data={mapViewData} />
    </MapContainer>
  )
}
