"use client"

import { useState, useEffect, useRef } from "react"
import { AppHeader } from "@/components/app-header"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import L, { Layer } from "leaflet"
import { GeoJsonObject } from "geojson"

// Leaflet Icon Fix
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
})

// Map Controller to programmatically zoom
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

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Data layers and filter states
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableDistricts, setAvailableDistricts] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [mapViewData, setMapViewData] = useState<GeoJsonObject | null>(null);

  // Load states on initial render
  useEffect(() => {
    fetch("http://127.0.0.1:5000/api/states")
      .then(res => res.json())
      .then(data => {
        setAvailableStates(data.features.map((f: any) => f.properties.STATE));
        setMapViewData(data);
      }).catch(err => console.error("Failed to fetch states:", err));
  }, []);

  // Handle state selection
  const handleStateChange = (value: string) => {
    setSelectedState(value);
    setSelectedDistrict(""); // Reset district
    setAvailableDistricts([]);
    if (value) {
      fetch(`http://127.0.0.1:5000/api/districts/${value}`)
        .then(res => res.json())
        .then(data => {
          setAvailableDistricts(data.features.filter((f: any) => f.properties.DISTRICT !== 'FRA_DEMO_AREA').map((f: any) => f.properties.DISTRICT));
        }).catch(err => console.error("Failed to fetch districts:", err));
    }
  };

  // Handle "Apply Filters" click
  const handleApplyFilters = () => {
    if (selectedDistrict) {
      fetch(`http://127.0.0.1:5000/api/fra_parcels/${selectedDistrict}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setMapViewData(data));
    } else if (selectedState) {
      fetch(`http://127.0.0.1:5000/api/districts/${selectedState}`)
        .then(res => res.json())
        .then(data => setMapViewData({ type: "FeatureCollection", features: data.features.filter((f: any) => f.properties.DISTRICT !== 'FRA_DEMO_AREA')}));
    }
  };
  
  // Custom popup
  const onEachFeature = (feature: GeoJSON.Feature, layer: Layer) => {
    if (feature.properties?.holderName) {
      const { holderName, totalAreaAcres, asset_percentages, dss_recommendation } = feature.properties;
      const popupContent = `...`; // Your detailed popup HTML here
      layer.bindPopup(popupContent);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main className="flex min-h-0 flex-1">
        <aside className={cn("relative border-r transition-all duration-300", sidebarOpen ? "w-80" : "w-0")}>
          <div className={cn("h-full overflow-hidden p-4 space-y-4", sidebarOpen ? "opacity-100" : "opacity-0")}>
            <h3 className="text-lg font-medium">Filters</h3>
            
            <Select onValueChange={handleStateChange} value={selectedState}>
              <SelectTrigger><SelectValue placeholder="Select State" /></SelectTrigger>
              <SelectContent>
                {availableStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select onValueChange={setSelectedDistrict} value={selectedDistrict} disabled={!selectedState}>
              <SelectTrigger><SelectValue placeholder="Select District" /></SelectTrigger>
              <SelectContent>
                {availableDistricts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button className="w-full" onClick={handleApplyFilters}>Apply Filters</Button>
          </div>
        </aside>
        <section className="flex flex-1 flex-col">
          <div className="mx-4 mb-4 mt-2 flex-1 rounded-lg border">
            <MapContainer center={[20.5937, 78.9629]} zoom={5} scrollWheelZoom={true} className="h-full w-full rounded-lg bg-gray-100">
              <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; CARTO' />
              {mapViewData && <GeoJSON data={mapViewData} onEachFeature={onEachFeature} />}
              <MapController data={mapViewData} />
            </MapContainer>
          </div>
        </section>
      </main>
    </div>
  )
}