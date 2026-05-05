"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { AppHeader } from "@/components/app-header"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { GeoJsonObject } from "geojson"
import { PanelLeftClose, PanelLeftOpen, Loader2, RotateCcw } from "lucide-react"

// SSR disabled — Leaflet requires browser APIs
const MapComponent = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-50 text-gray-500">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Loading Map...
    </div>
  ),
})

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000"

type LoadingState = "idle" | "loading" | "error"

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [availableStates, setAvailableStates] = useState<string[]>([])
  const [availableDistricts, setAvailableDistricts] = useState<string[]>([])
  const [selectedState, setSelectedState] = useState("")
  const [selectedDistrict, setSelectedDistrict] = useState("")
  const [mapViewData, setMapViewData] = useState<GeoJsonObject | null>(null)
  const [loadingStates, setLoadingStates] = useState<LoadingState>("idle")
  const [loadingDistricts, setLoadingDistricts] = useState<LoadingState>("idle")
  const [loadingMap, setLoadingMap] = useState<LoadingState>("idle")
  const [statusMessage, setStatusMessage] = useState("")

  // --- Load states on mount ---
  useEffect(() => {
    setLoadingStates("loading")
    fetch(`${API_BASE_URL}/api/states`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        const names: string[] = data.features
          ?.map((f: any) => f.properties?.STATE || f.properties?.NAME)
          .filter(Boolean)
          .sort()
        setAvailableStates(names)
        setMapViewData(data)
        setLoadingStates("idle")
      })
      .catch((err) => {
        console.error("Failed to fetch states:", err)
        setLoadingStates("error")
        setStatusMessage("Could not load state data. Check your backend connection.")
      })
  }, [])

  // --- Load districts when a state is selected ---
  const handleStateChange = (value: string) => {
    setSelectedState(value)
    setSelectedDistrict("")
    setAvailableDistricts([])
    if (!value) return

    setLoadingDistricts("loading")
    fetch(`${API_BASE_URL}/api/districts/${encodeURIComponent(value)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        const names: string[] = data.features
          ?.filter((f: any) => f.properties?.DISTRICT !== "FRA_DEMO_AREA")
          .map((f: any) => f.properties?.DISTRICT || f.properties?.NAME)
          .filter(Boolean)
          .sort()
        setAvailableDistricts(names)
        setLoadingDistricts("idle")
      })
      .catch((err) => {
        console.error("Failed to fetch districts:", err)
        setLoadingDistricts("error")
        setStatusMessage(`Could not load districts for "${value}".`)
      })
  }

  // --- Apply filters: zoom to state or load parcels for district ---
  const handleApplyFilters = async () => {
    if (!selectedState && !selectedDistrict) {
      setStatusMessage("Please select at least a state.")
      return
    }

    setLoadingMap("loading")
    setStatusMessage("")

    try {
      if (selectedDistrict) {
        // Show FRA parcels for the selected district
        const res = await fetch(
          `${API_BASE_URL}/api/fra_parcels/${encodeURIComponent(selectedDistrict)}`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setMapViewData(data)
        setStatusMessage(`Showing FRA parcels for ${selectedDistrict}`)
      } else if (selectedState) {
        // Zoom to district boundaries of the selected state
        const res = await fetch(
          `${API_BASE_URL}/api/districts/${encodeURIComponent(selectedState)}`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const filtered: GeoJsonObject = {
          type: "FeatureCollection",
          features: data.features.filter(
            (f: any) => f.properties?.DISTRICT !== "FRA_DEMO_AREA"
          ),
        } as GeoJsonObject
        setMapViewData(filtered)
        setStatusMessage(`Showing districts of ${selectedState}`)
      }
    } catch (err) {
      console.error("Failed to apply filters:", err)
      setLoadingMap("error")
      setStatusMessage("Failed to load data. Please try again.")
    } finally {
      setLoadingMap("idle")
    }
  }

  // --- Reset everything ---
  const handleReset = () => {
    setSelectedState("")
    setSelectedDistrict("")
    setAvailableDistricts([])
    setStatusMessage("")
    setLoadingMap("idle")
    // Reload states view
    fetch(`${API_BASE_URL}/api/states`)
      .then((r) => r.json())
      .then((data) => setMapViewData(data))
      .catch(() => setMapViewData(null))
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppHeader />

      <main className="flex min-h-0 flex-1 relative">
        {/* Sidebar toggle button — always visible */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="absolute left-0 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-r-md border border-l-0 bg-white shadow-sm hover:bg-gray-50 transition-colors"
          style={{ left: sidebarOpen ? "320px" : "0px" }}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-4 w-4 text-gray-600" />
          ) : (
            <PanelLeftOpen className="h-4 w-4 text-gray-600" />
          )}
        </button>

        {/* Sidebar */}
        <aside
          className={cn(
            "relative border-r bg-white transition-all duration-300 flex-shrink-0 overflow-hidden",
            sidebarOpen ? "w-80" : "w-0"
          )}
        >
          <div className="h-full overflow-y-auto p-4 space-y-4 w-80">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Filters</h3>
              <button
                onClick={handleReset}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
                title="Reset filters"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            </div>

            {/* State selector */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">State</label>
              <Select
                onValueChange={handleStateChange}
                value={selectedState}
                disabled={loadingStates === "loading"}
              >
                <SelectTrigger>
                  {loadingStates === "loading" ? (
                    <span className="flex items-center gap-2 text-gray-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading states…
                    </span>
                  ) : (
                    <SelectValue placeholder="Select State" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {availableStates.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* District selector */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">District</label>
              <Select
                onValueChange={setSelectedDistrict}
                value={selectedDistrict}
                disabled={!selectedState || loadingDistricts === "loading"}
              >
                <SelectTrigger>
                  {loadingDistricts === "loading" ? (
                    <span className="flex items-center gap-2 text-gray-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                    </span>
                  ) : (
                    <SelectValue
                      placeholder={
                        selectedState
                          ? "Select District (optional)"
                          : "Select a state first"
                      }
                    />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {availableDistricts.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Legend */}
            {selectedDistrict && (
              <div className="rounded-md border bg-gray-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  FRA Parcel Legend
                </p>
                {[
                  { color: "#22c55e", label: "Approved" },
                  { color: "#ef4444", label: "Rejected" },
                  { color: "#fbbf24", label: "Pending" },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2 text-sm">
                    <span
                      className="inline-block h-3 w-5 rounded-sm border"
                      style={{ backgroundColor: color }}
                    />
                    {label}
                  </div>
                ))}
              </div>
            )}

            {/* Apply button */}
            <Button
              className="w-full"
              onClick={handleApplyFilters}
              disabled={!selectedState || loadingMap === "loading"}
            >
              {loadingMap === "loading" ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </span>
              ) : (
                "Apply Filters"
              )}
            </Button>

            {/* Status / error message */}
            {statusMessage && (
              <p
                className={cn(
                  "text-xs rounded px-2 py-1",
                  loadingMap === "error" || loadingStates === "error"
                    ? "bg-red-50 text-red-600"
                    : "bg-green-50 text-green-700"
                )}
              >
                {statusMessage}
              </p>
            )}
          </div>
        </aside>

        {/* Map section */}
        <section className="flex flex-1 flex-col min-w-0">
          <div className="mx-4 mb-4 mt-2 flex-1 rounded-lg border overflow-hidden relative">
            <MapComponent mapViewData={mapViewData} />
          </div>
        </section>
      </main>
    </div>
  )
}
