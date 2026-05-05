"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { AppHeader } from "@/components/app-header"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { GeoJsonObject } from "geojson"
import {
  PanelLeftClose,
  PanelLeftOpen,
  Loader2,
  RotateCcw,
  Download,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

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

interface FraStats {
  district?: string
  state?: string
  total_claims: number
  approved_claims: number
  rejected_claims: number
  pending_claims: number
  total_area_ha: number
  individual_claims: number
  community_claims: number
  approval_rate: number
  rejection_rate: number
  pending_rate: number
}

interface DistrictStatRow {
  district: string
  total_claims: number
  approved_claims: number
  rejected_claims: number
  pending_claims: number
  approval_rate: number
  total_area_ha: number
}

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

  // FRA stats
  const [fraStats, setFraStats] = useState<FraStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [statsOpen, setStatsOpen] = useState(true)

  // State-level district table
  const [stateDistrictRows, setStateDistrictRows] = useState<DistrictStatRow[]>([])
  const [stateTableOpen, setStateTableOpen] = useState(false)

  // Status filter toggles for parcel layer
  const [visibleStatuses, setVisibleStatuses] = useState<string[]>([
    "approved",
    "rejected",
    "pending",
  ])

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
    setFraStats(null)
    setStateDistrictRows([])
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

  // --- Toggle a status filter ---
  const toggleStatus = (status: string) => {
    setVisibleStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    )
  }

  // --- Fetch FRA stats for a district ---
  const fetchDistrictStats = async (district: string) => {
    setLoadingStats(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/fra_stats/${encodeURIComponent(district)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: FraStats = await res.json()
      setFraStats(data)
      setStatsOpen(true)
    } catch (err) {
      console.error("Failed to fetch FRA stats:", err)
    } finally {
      setLoadingStats(false)
    }
  }

  // --- Fetch state-level aggregated stats ---
  const fetchStateStats = async (state: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/state_stats/${encodeURIComponent(state)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setFraStats({ ...data.totals, state })
      setStateDistrictRows(data.districts || [])
      setStateTableOpen(true)
      setStatsOpen(true)
    } catch (err) {
      console.error("Failed to fetch state stats:", err)
    }
  }

  // --- Apply filters: zoom to state or load parcels for district ---
  const handleApplyFilters = async () => {
    if (!selectedState && !selectedDistrict) {
      setStatusMessage("Please select at least a state.")
      return
    }

    setLoadingMap("loading")
    setStatusMessage("")
    setFraStats(null)
    setStateDistrictRows([])

    try {
      if (selectedDistrict) {
        const [parcelRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/fra_parcels/${encodeURIComponent(selectedDistrict)}`),
        ])
        if (!parcelRes.ok) throw new Error(`HTTP ${parcelRes.status}`)
        const data = await parcelRes.json()
        setMapViewData(data)
        setStatusMessage(`Showing FRA parcels for ${selectedDistrict}`)
        // Fetch stats in parallel
        await fetchDistrictStats(selectedDistrict)
      } else if (selectedState) {
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
        // Fetch aggregated state stats
        await fetchStateStats(selectedState)
      }
    } catch (err) {
      console.error("Failed to apply filters:", err)
      setLoadingMap("error")
      setStatusMessage("Failed to load data. Please try again.")
    } finally {
      setLoadingMap("idle")
    }
  }

  // --- Export stats as CSV ---
  const handleExportCSV = () => {
    if (!fraStats) return
    const rows = [
      ["Metric", "Value"],
      ["Total Claims", fraStats.total_claims],
      ["Approved", fraStats.approved_claims],
      ["Rejected", fraStats.rejected_claims],
      ["Pending", fraStats.pending_claims],
      ["Approval Rate (%)", fraStats.approval_rate],
      ["Total Area (ha)", fraStats.total_area_ha],
      ["Individual Claims", fraStats.individual_claims],
      ["Community Claims", fraStats.community_claims],
    ]
    const csv = rows.map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `fra-stats-${selectedDistrict || selectedState}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // --- Reset everything ---
  const handleReset = () => {
    setSelectedState("")
    setSelectedDistrict("")
    setAvailableDistricts([])
    setStatusMessage("")
    setLoadingMap("idle")
    setFraStats(null)
    setStateDistrictRows([])
    setVisibleStatuses(["approved", "rejected", "pending"])
    fetch(`${API_BASE_URL}/api/states`)
      .then((r) => r.json())
      .then((data) => setMapViewData(data))
      .catch(() => setMapViewData(null))
  }

  // --- Progress bar component ---
  const ProgressBar = ({
    value,
    color,
  }: {
    value: number
    color: string
  }) => (
    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden mt-1">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${value}%`, backgroundColor: color }}
      />
    </div>
  )

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppHeader />

      <main className="flex min-h-0 flex-1 relative">
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="absolute top-2 z-30 flex h-8 w-8 items-center justify-center rounded-r-md border border-l-0 bg-white shadow-sm hover:bg-gray-50 transition-colors"
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
            {/* Header */}
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

            {/* Status filter toggles — shown only when parcels are loaded */}
            {selectedDistrict && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Show on map
                </label>
                <div className="flex flex-col gap-1.5">
                  {[
                    { key: "approved", label: "Approved", color: "#22c55e", bg: "#dcfce7", text: "#166534" },
                    { key: "rejected", label: "Rejected", color: "#ef4444", bg: "#fee2e2", text: "#991b1b" },
                    { key: "pending",  label: "Pending",  color: "#fbbf24", bg: "#fef9c3", text: "#854d0e" },
                  ].map(({ key, label, color, bg, text }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={visibleStatuses.includes(key)}
                        onChange={() => toggleStatus(key)}
                        className="rounded"
                      />
                      <span
                        className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: bg, color: text }}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-sm"
                          style={{ backgroundColor: color }}
                        />
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
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

            {/* ── FRA Stats Panel ── */}
            {(loadingStats || fraStats) && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                {/* Panel header */}
                <button
                  onClick={() => setStatsOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    {selectedDistrict
                      ? `${selectedDistrict} — Stats`
                      : `${selectedState} — State Stats`}
                  </span>
                  <span className="flex items-center gap-1">
                    {fraStats && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleExportCSV()
                        }}
                        title="Export CSV"
                        className="text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {statsOpen ? (
                      <ChevronUp className="h-3.5 w-3.5 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                    )}
                  </span>
                </button>

                {statsOpen && (
                  <div className="p-3 space-y-3">
                    {loadingStats ? (
                      <div className="flex items-center justify-center py-4 text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading stats…
                      </div>
                    ) : fraStats ? (
                      <>
                        {/* Top summary numbers */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-50 rounded-md p-2">
                            <p className="text-xs text-gray-500">Total Claims</p>
                            <p className="text-lg font-semibold text-gray-900">
                              {fraStats.total_claims.toLocaleString()}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-md p-2">
                            <p className="text-xs text-gray-500">Total Area</p>
                            <p className="text-lg font-semibold text-gray-900">
                              {fraStats.total_area_ha.toLocaleString()} ha
                            </p>
                          </div>
                        </div>

                        {/* Status breakdown */}
                        <div className="space-y-2">
                          <div>
                            <div className="flex justify-between text-xs">
                              <span className="text-green-700 font-medium">✓ Approved</span>
                              <span className="text-gray-600">
                                {fraStats.approval_rate}% · {fraStats.approved_claims.toLocaleString()}
                              </span>
                            </div>
                            <ProgressBar value={fraStats.approval_rate} color="#22c55e" />
                          </div>
                          <div>
                            <div className="flex justify-between text-xs">
                              <span className="text-red-700 font-medium">✗ Rejected</span>
                              <span className="text-gray-600">
                                {fraStats.rejection_rate}% · {fraStats.rejected_claims.toLocaleString()}
                              </span>
                            </div>
                            <ProgressBar value={fraStats.rejection_rate} color="#ef4444" />
                          </div>
                          <div>
                            <div className="flex justify-between text-xs">
                              <span className="text-amber-700 font-medium">⏳ Pending</span>
                              <span className="text-gray-600">
                                {fraStats.pending_rate}% · {fraStats.pending_claims.toLocaleString()}
                              </span>
                            </div>
                            <ProgressBar value={fraStats.pending_rate} color="#fbbf24" />
                          </div>
                        </div>

                        {/* Claim type split */}
                        <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
                          <span>
                            Individual:{" "}
                            <span className="font-medium text-gray-800">
                              {fraStats.individual_claims.toLocaleString()}
                            </span>
                          </span>
                          <span>
                            Community:{" "}
                            <span className="font-medium text-gray-800">
                              {fraStats.community_claims.toLocaleString()}
                            </span>
                          </span>
                        </div>

                        {/* District breakdown table — state level only */}
                        {stateDistrictRows.length > 0 && (
                          <div>
                            <button
                              onClick={() => setStateTableOpen((o) => !o)}
                              className="w-full flex items-center justify-between text-xs font-semibold text-gray-600 uppercase tracking-wide py-1 border-t border-gray-100 pt-2"
                            >
                              District Breakdown
                              {stateTableOpen ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                            {stateTableOpen && (
                              <div className="mt-2 overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-gray-50">
                                      <th className="text-left p-1.5 text-gray-500 font-medium">District</th>
                                      <th className="text-right p-1.5 text-gray-500 font-medium">Claims</th>
                                      <th className="text-right p-1.5 text-gray-500 font-medium">Appr%</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {stateDistrictRows.map((row) => (
                                      <tr
                                        key={row.district}
                                        className="border-t border-gray-100 hover:bg-gray-50"
                                      >
                                        <td className="p-1.5 text-gray-800">{row.district}</td>
                                        <td className="p-1.5 text-right text-gray-700">
                                          {row.total_claims.toLocaleString()}
                                        </td>
                                        <td className="p-1.5 text-right">
                                          <span
                                            className={cn(
                                              "font-medium",
                                              row.approval_rate >= 60
                                                ? "text-green-700"
                                                : row.approval_rate >= 30
                                                ? "text-amber-700"
                                                : "text-red-700"
                                            )}
                                          >
                                            {row.approval_rate}%
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Map section */}
        <section className="flex flex-1 flex-col min-w-0">
          <div className="mx-4 mb-4 mt-2 flex-1 rounded-lg border overflow-hidden relative">
            <MapComponent
              mapViewData={mapViewData}
              visibleStatuses={visibleStatuses}
            />
          </div>
        </section>
      </main>
    </div>
  )
}
