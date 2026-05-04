"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic" // Ye import zaroori hai
import { AppHeader } from "@/components/app-header"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { GeoJsonObject } from "geojson"

// Dynamic import with SSR disabled. Ye window is not defined error ko fix karega.
const MapComponent = dynamic(() => import("@/components/Map"), { 
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-gray-100">Loading Map...</div>
});

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableDistricts, setAvailableDistricts] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [mapViewData, setMapViewData] = useState<GeoJsonObject | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/states`)
      .then(res => res.json())
      .then(data => {
        setAvailableStates(data.features.map((f: any) => f.properties.STATE));
        setMapViewData(data);
      }).catch(err => console.error("Failed to fetch states:", err));
  }, []);

  const handleStateChange = (value: string) => {
    setSelectedState(value);
    setSelectedDistrict(""); 
    setAvailableDistricts([]);
    if (value) {
      fetch(`${API_BASE_URL}/api/districts/${value}`)
        .then(res => res.json())
        .then(data => {
          setAvailableDistricts(data.features.filter((f: any) => f.properties.DISTRICT !== 'FRA_DEMO_AREA').map((f: any) => f.properties.DISTRICT));
        }).catch(err => console.error("Failed to fetch districts:", err));
    }
  };

  const handleApplyFilters = () => {
    if (selectedDistrict) {
      fetch(`${API_BASE_URL}/api/fra_parcels/${selectedDistrict}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setMapViewData(data))
        .catch(err => console.error("Failed to fetch parcels:", err));
    } else if (selectedState) {
      fetch(`${API_BASE_URL}/api/districts/${selectedState}`)
        .then(res => res.json())
        .then(data => setMapViewData({ type: "FeatureCollection", features: data.features.filter((f: any) => f.properties.DISTRICT !== 'FRA_DEMO_AREA')}))
        .catch(err => console.error("Failed to fetch districts:", err));
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
            {/* Yahan direct component call karenge */}
            <MapComponent mapViewData={mapViewData} />
          </div>
        </section>
      </main>
    </div>
  )
}
