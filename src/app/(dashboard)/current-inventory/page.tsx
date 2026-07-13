"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Chart from "chart.js/auto";
import apiClient from "@/lib/apiClient";
import { StockRecord, AggregatedStock } from "@/types/procurement";

function fmtN(n: number | null | undefined) {
  return (n || 0).toLocaleString("en-IN");
}

type SortKey = "warehouseQty" | "committedQty" | "onOrderQty" | "availableQty" | "description";
type SortDir = "asc" | "desc";

export default function CurrentInventoryPage() {
  const [rawData, setRawData] = useState<StockRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<"All" | "Healthy" | "Low" | "Critical" | "Zero">("All");
  const [warehouseFilter, setWarehouseFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("warehouseQty");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const warehouseChartRef = useRef<HTMLCanvasElement>(null);
  const healthChartRef = useRef<HTMLCanvasElement>(null);
  const topItemsChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstances = useRef<Record<string, Chart | null>>({});

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get("/inventory");
      if (res.data?.success) { setRawData(res.data.data || []); setError(null); }
      else setError("Failed to load inventory data.");
    } catch { setError("Failed to load inventory data."); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const aggregatedStock = useMemo((): AggregatedStock[] => {
    const map = new Map<string, AggregatedStock>();
    rawData.forEach((r) => {
      const code = String(r.ItemCode ?? "").trim();
      if (!code) return;
      const existing = map.get(code);
      if (existing) {
        existing.warehouseQty += Number(r["Warehouse Qty"]) || 0;
        existing.committedQty += Number(r["Committed Qty"]) || 0;
        existing.onOrderQty += Number(r["On Order Qty"]) || 0;
        existing.availableQty += Number(r["Available Qty"]) || 0;
        existing.warehouses.push({ code: r["Warehouse Code"], name: r["Warehouse Name"], qty: Number(r["Warehouse Qty"]) || 0 });
      } else {
        map.set(code, {
          itemCode: code, description: r.Description || "—", itemGroup: r["Item Group"] || "Raw Material",
          warehouseQty: Number(r["Warehouse Qty"]) || 0, committedQty: Number(r["Committed Qty"]) || 0,
          onOrderQty: Number(r["On Order Qty"]) || 0, availableQty: Number(r["Available Qty"]) || 0,
          warehouses: [{ code: r["Warehouse Code"], name: r["Warehouse Name"], qty: Number(r["Warehouse Qty"]) || 0 }],
          healthStatus: "Healthy",
        });
      }
    });
    const items = Array.from(map.values());
    items.forEach((item) => {
      if (item.warehouseQty <= 0) item.healthStatus = "Zero";
      else if (item.availableQty <= 0) item.healthStatus = "Critical";
      else if (item.committedQty > item.warehouseQty * 0.8) item.healthStatus = "Low";
      else item.healthStatus = "Healthy";
    });
    return items;
  }, [rawData]);

  const warehouses = useMemo(() => {
    const set = new Set<string>();
    rawData.forEach((r) => { if (r["Warehouse Code"]) set.add(r["Warehouse Code"]); });
    return Array.from(set).sort();
  }, [rawData]);

  const summary = useMemo(() => {
    const s = aggregatedStock;
    return {
      totalItems: s.length,
      totalQty: s.reduce((a, r) => a + r.warehouseQty, 0),
      totalCommitted: s.reduce((a, r) => a + r.committedQty, 0),
      totalOnOrder: s.reduce((a, r) => a + r.onOrderQty, 0),
      totalAvailable: s.reduce((a, r) => a + r.availableQty, 0),
      healthy: s.filter((r) => r.healthStatus === "Healthy").length,
      low: s.filter((r) => r.healthStatus === "Low").length,
      critical: s.filter((r) => r.healthStatus === "Critical").length,
      zero: s.filter((r) => r.healthStatus === "Zero").length,
    };
  }, [aggregatedStock]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dir = sortDir === "asc" ? 1 : -1;
    return aggregatedStock
      .filter((item) => {
        if (q && !`${item.itemCode} ${item.description}`.toLowerCase().includes(q)) return false;
        if (healthFilter !== "All" && item.healthStatus !== healthFilter) return false;
        if (warehouseFilter !== "All" && !item.warehouses.some((w) => w.code === warehouseFilter)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortKey === "description") return a.description.localeCompare(b.description) * dir;
        return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
      });
  }, [aggregatedStock, search, healthFilter, warehouseFilter, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return prev; }
      setSortDir(key === "description" ? "asc" : "desc");
      return key;
    });
  }, []);

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  // Charts
  useEffect(() => {
    if (isLoading || aggregatedStock.length === 0) return;
    const destroy = (k: string) => { if (chartInstances.current[k]) { chartInstances.current[k]!.destroy(); chartInstances.current[k] = null; } };

    // Warehouse bar chart
    if (warehouseChartRef.current) {
      destroy("wh");
      const warehouseTotals = warehouses.map((wh) => ({
        name: wh, qty: rawData.filter((r) => r["Warehouse Code"] === wh).reduce((a, r) => a + (Number(r["Warehouse Qty"]) || 0), 0),
      })).sort((a, b) => b.qty - a.qty);

      chartInstances.current["wh"] = new Chart(warehouseChartRef.current, {
        type: "bar",
        data: {
          labels: warehouseTotals.map((w) => w.name),
          datasets: [{ label: "Stock Qty", data: warehouseTotals.map((w) => w.qty), backgroundColor: "rgba(37, 99, 235, 0.7)", borderColor: "#2563EB", borderWidth: 1.5, borderRadius: 6 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: "#57534E", font: { family: "JetBrains Mono", size: 10 } }, grid: { display: false } },
            y: { ticks: { color: "#57534E", font: { family: "JetBrains Mono", size: 10 }, callback: (v: unknown) => fmtN(Number(v)) }, grid: { color: "#F5F5F4" }, beginAtZero: true },
          },
        },
      });
    }

    // Health doughnut
    if (healthChartRef.current) {
      destroy("hp");
      chartInstances.current["hp"] = new Chart(healthChartRef.current, {
        type: "doughnut",
        data: {
          labels: ["Healthy", "Low", "Critical", "Zero Stock"],
          datasets: [{
            data: [summary.healthy, summary.low, summary.critical, summary.zero],
            backgroundColor: ["rgba(22, 163, 74, 0.8)", "rgba(217, 119, 6, 0.8)", "rgba(220, 38, 38, 0.8)", "rgba(156, 163, 175, 0.6)"],
            borderColor: ["#16A34A", "#D97706", "#DC2626", "#9CA3AF"], borderWidth: 2, hoverOffset: 6,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: { position: "bottom", labels: { color: "#57534E", font: { family: "JetBrains Mono", size: 10 }, padding: 16, usePointStyle: true, pointStyle: "circle" } } } },
      });
    }

    // Top 10 items by stock
    if (topItemsChartRef.current) {
      destroy("top");
      const top10 = [...aggregatedStock].sort((a, b) => b.warehouseQty - a.warehouseQty).slice(0, 10);
      chartInstances.current["top"] = new Chart(topItemsChartRef.current, {
        type: "bar",
        data: {
          labels: top10.map((i) => i.description.length > 25 ? i.description.slice(0, 25) + "…" : i.description),
          datasets: [
            { label: "Stock", data: top10.map((i) => i.warehouseQty), backgroundColor: "rgba(37, 99, 235, 0.6)", borderRadius: 4 },
            { label: "Committed", data: top10.map((i) => i.committedQty), backgroundColor: "rgba(217, 119, 6, 0.6)", borderRadius: 4 },
          ],
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "top", labels: { color: "#57534E", font: { family: "JetBrains Mono", size: 10 }, usePointStyle: true, pointStyle: "circle" } } },
          scales: {
            x: { stacked: false, ticks: { color: "#57534E", font: { family: "JetBrains Mono", size: 9 }, callback: (v: unknown) => fmtN(Number(v)) }, grid: { color: "#F5F5F4" } },
            y: { ticks: { color: "#57534E", font: { family: "Inter", size: 11 } }, grid: { display: false } },
          },
        },
      });
    }

    return () => { destroy("wh"); destroy("hp"); destroy("top"); };
  }, [aggregatedStock, rawData, warehouses, isLoading, summary]);

  if (isLoading) {
    return (
      <div>
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(6, 1fr)", marginBottom: 24 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div className="skeleton" style={{ height: 300 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: "var(--text-muted)", marginBottom: 20, fontSize: 15 }}>{error}</p>
        <button onClick={fetchData} className="btn btn-accent">Try Again</button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Current Inventory</h1>
          <p className="page-subtitle">Live Warehouse Stock · Committed · On Order · Available</p>
        </div>
        <button onClick={fetchData} className="btn btn-secondary">↻ Refresh</button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(6, 1fr)", marginBottom: 28 }}>
        <KpiCard label="Total SKUs" value={fmtN(summary.totalItems)} sub="Unique items" accent="var(--accent)" />
        <KpiCard label="Total Stock" value={fmtN(summary.totalQty)} sub="Warehouse qty" accent="var(--success)" />
        <KpiCard label="Committed" value={fmtN(summary.totalCommitted)} sub="Reserved / allocated" accent="var(--warning)" />
        <KpiCard label="On Order" value={fmtN(summary.totalOnOrder)} sub="Incoming POs" accent="var(--info)" />
        <KpiCard label="Available" value={fmtN(summary.totalAvailable)} sub="Free to use" accent="var(--success-light)" />
        <KpiCard label="Critical Items" value={String(summary.critical + summary.zero)} sub="Need attention" accent="var(--error)" />
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 28 }}>
        <div className="chart-card">
          <h4>Stock by Warehouse</h4>
          <p className="chart-subtitle">Total qty per warehouse code</p>
          <div style={{ height: 220 }}><canvas ref={warehouseChartRef} /></div>
        </div>
        <div className="chart-card">
          <h4>Inventory Health</h4>
          <p className="chart-subtitle">Distribution by stock status</p>
          <div style={{ height: 220 }}><canvas ref={healthChartRef} /></div>
        </div>
        <div className="chart-card">
          <h4>Top 10 by Stock Volume</h4>
          <p className="chart-subtitle">Highest stock items vs committed</p>
          <div style={{ height: 220 }}><canvas ref={topItemsChartRef} /></div>
        </div>
      </div>

      {/* Bike Production Planning */}
      <BikeProductionPlanning aggregatedStock={aggregatedStock} />

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <h3><span>📦</span> Inventory Details</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="tag">{filteredItems.length} / {aggregatedStock.length} ITEMS</span>
          </div>
        </div>

        {/* Filters */}
        <div className="filter-group">
          <div style={{ flex: "1 1 240px", minWidth: 200 }}>
            <div className="filter-label">Search</div>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item code or description…" />
          </div>
          <div style={{ minWidth: 140 }}>
            <div className="filter-label">Health</div>
            <select className="input select" value={healthFilter} onChange={(e) => setHealthFilter(e.target.value as typeof healthFilter)}>
              <option value="All">All Statuses</option>
              <option value="Healthy">Healthy</option>
              <option value="Low">Low</option>
              <option value="Critical">Critical</option>
              <option value="Zero">Zero Stock</option>
            </select>
          </div>
          <div style={{ minWidth: 140 }}>
            <div className="filter-label">Warehouse</div>
            <select className="input select" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
              <option value="All">All Warehouses</option>
              {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          {(search || healthFilter !== "All" || warehouseFilter !== "All") && (
            <button onClick={() => { setSearch(""); setHealthFilter("All"); setWarehouseFilter("All"); }} className="btn btn-ghost" style={{ marginTop: 18 }}>✕ Clear</button>
          )}
        </div>

        {/* Data */}
        <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("description")}>Item{sortIcon("description")}</th>
                <th>Code</th>
                <th>Warehouses</th>
                <th className="sortable" style={{ textAlign: "right" }} onClick={() => toggleSort("warehouseQty")}>Stock Qty{sortIcon("warehouseQty")}</th>
                <th className="sortable" style={{ textAlign: "right" }} onClick={() => toggleSort("committedQty")}>Committed{sortIcon("committedQty")}</th>
                <th className="sortable" style={{ textAlign: "right" }} onClick={() => toggleSort("onOrderQty")}>On Order{sortIcon("onOrderQty")}</th>
                <th className="sortable" style={{ textAlign: "right" }} onClick={() => toggleSort("availableQty")}>Available{sortIcon("availableQty")}</th>
                <th style={{ textAlign: "center" }}>Health</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 50, color: "var(--text-muted)" }}>No items match the selected filters.</td></tr>
              ) : filteredItems.slice(0, 200).map((item, i) => (
                <tr key={`${item.itemCode}-${i}`} style={{ borderLeft: `3px solid ${HEALTH_COLORS[item.healthStatus]}` }}>
                  <td style={{ fontWeight: 500, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.description}>{item.description}</td>
                  <td className="num" style={{ color: "var(--text-muted)", fontSize: 11 }}>{item.itemCode}</td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.warehouses.map((w) => w.code).join(", ")}</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600, color: item.warehouseQty > 0 ? "var(--charcoal)" : "var(--error)" }}>{fmtN(item.warehouseQty)}</td>
                  <td className="num" style={{ textAlign: "right", color: item.committedQty > 0 ? "var(--warning)" : "var(--concrete)" }}>{item.committedQty > 0 ? fmtN(item.committedQty) : "—"}</td>
                  <td className="num" style={{ textAlign: "right", color: item.onOrderQty > 0 ? "var(--accent)" : "var(--concrete)" }}>{item.onOrderQty > 0 ? fmtN(item.onOrderQty) : "—"}</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 600, color: item.availableQty > 0 ? "var(--success)" : "var(--error)" }}>{fmtN(item.availableQty)}</td>
                  <td style={{ textAlign: "center" }}><HealthChip status={item.healthStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredItems.length > 200 && (
            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", textAlign: "right" }}>
              <span className="num" style={{ fontSize: 11, color: "var(--text-muted)" }}>Showing 200 of {fmtN(filteredItems.length)} items. Use filters to narrow.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="kpi-card" style={{ "--kpi-accent": accent } as React.CSSProperties}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

const HEALTH_COLORS: Record<string, string> = { Healthy: "#16A34A", Low: "#D97706", Critical: "#DC2626", Zero: "#9CA3AF" };
const HEALTH_CHIPS: Record<string, string> = { Healthy: "chip-success", Low: "chip-warning", Critical: "chip-error", Zero: "chip-neutral" };

function HealthChip({ status }: { status: string }) {
  return <span className={`chip ${HEALTH_CHIPS[status] || "chip-neutral"}`}><span className="chip-dot" />{status}</span>;
}

// ─── Bike Production Planning (What-If Tool) ────────────────────────────────

interface BomStockData {
  bomStock: Array<Record<string, string | number>>;
  productionPlan: Array<Record<string, string | number>>;
}

function BikeProductionPlanning({ aggregatedStock }: { aggregatedStock: AggregatedStock[] }) {
  const [bomStockData, setBomStockData] = useState<BomStockData | null>(null);
  const [isLoadingBom, setIsLoadingBom] = useState(true);
  const [planRows, setPlanRows] = useState<{ id: number; model: string; qty: number }[]>([]);
  const [planCalculated, setPlanCalculated] = useState(false);
  const planIdRef = useRef(1);

  useEffect(() => {
    const fetchBom = async () => {
      try {
        setIsLoadingBom(true);
        const res = await apiClient.get("/procurement");
        if (res.data?.success) setBomStockData(res.data.data);
      } catch { /* silent */ }
      finally { setIsLoadingBom(false); }
    };
    fetchBom();
  }, []);

  // Stock map from aggregated inventory
  const stockMap = useMemo(() => {
    const map = new Map<string, { warehouse: number; name: string }>();
    aggregatedStock.forEach((item) => map.set(item.itemCode, { warehouse: item.warehouseQty, name: item.description }));
    return map;
  }, [aggregatedStock]);

  // Extract bike model names from BOM pivot columns
  const bikeModels = useMemo(() => {
    if (!bomStockData?.bomStock || bomStockData.bomStock.length === 0) return [];
    const excludeKeys = new Set(["Part No", "Part Description", "Warehouse Qty", "Committed Qty", "On Order Qty", "Available Qty", "Inventory Level", "MOQ", "Supplier Name"]);
    return Object.keys(bomStockData.bomStock[0]).filter((k) => !excludeKeys.has(k) && k.includes("RV")).sort();
  }, [bomStockData]);

  // Model -> (partNo -> bomQty) map
  const modelBom = useMemo(() => {
    if (!bomStockData?.bomStock) return new Map<string, Map<string, { qty: number; name: string }>>();
    const map = new Map<string, Map<string, { qty: number; name: string }>>();
    bikeModels.forEach((bike) => {
      const parts = new Map<string, { qty: number; name: string }>();
      bomStockData.bomStock.forEach((row) => {
        const qty = Number(row[bike]) || 0;
        if (qty > 0) parts.set(String(row["Part No"]), { qty, name: String(row["Part Description"] || row["Part No"]) });
      });
      if (parts.size > 0) map.set(bike, parts);
    });
    return map;
  }, [bomStockData, bikeModels]);

  // Plan results
  const planResults = useMemo(() => {
    const active = planRows.filter((r) => r.model && (Number(r.qty) || 0) > 0);
    if (active.length === 0) return null;

    const required = new Map<string, { name: string; required: number; models: Set<string> }>();
    active.forEach((row) => {
      const bom = modelBom.get(row.model);
      if (!bom) return;
      bom.forEach((info, code) => {
        if (info.qty <= 0) return;
        const cur = required.get(code) ?? { name: info.name, required: 0, models: new Set<string>() };
        cur.required += row.qty * info.qty;
        cur.models.add(row.model);
        required.set(code, cur);
      });
    });

    // Shortage analysis
    const shortages = Array.from(required.entries())
      .map(([code, r]) => {
        const available = stockMap.get(code)?.warehouse ?? 0;
        return { itemCode: code, itemName: stockMap.get(code)?.name || r.name, required: r.required, available, shortage: Math.max(0, r.required - available), models: Array.from(r.models) };
      })
      .filter((s) => s.shortage > 0)
      .sort((a, b) => b.shortage - a.shortage);

    // Feasible production per model
    const remaining = new Map<string, number>();
    required.forEach((_r, code) => remaining.set(code, stockMap.get(code)?.warehouse ?? 0));

    const perModel = active.map((row) => {
      const bom = modelBom.get(row.model);
      const requested = row.qty;
      let cap = requested;
      let limitName = "", limitCode = "";
      if (bom) {
        bom.forEach((info, code) => {
          if (info.qty <= 0) return;
          const avail = remaining.get(code) ?? 0;
          const buildable = Math.floor(avail / info.qty);
          cap = Math.min(cap, buildable);
          if (buildable < requested && buildable <= cap) { limitName = stockMap.get(code)?.name || info.name; limitCode = code; }
        });
      }
      const possible = Math.max(0, Math.min(requested, cap));
      if (bom) bom.forEach((info, code) => { if (info.qty > 0) remaining.set(code, (remaining.get(code) ?? 0) - possible * info.qty); });
      const status: "Available" | "Partial" | "Shortage" = possible >= requested ? "Available" : possible > 0 ? "Partial" : "Shortage";
      return { model: row.model, requested, possible, status, limitingPart: possible >= requested ? "" : limitName, limitingCode: possible >= requested ? "" : limitCode };
    });

    const totalRequested = perModel.reduce((a, p) => a + p.requested, 0);
    const totalPossible = perModel.reduce((a, p) => a + p.possible, 0);
    return { perModel, shortages, totalRequested, totalPossible };
  }, [planRows, modelBom, stockMap]);

  const planReady = useMemo(() => planRows.filter((r) => r.model && r.qty > 0).length > 0, [planRows]);

  const addPlanRow = useCallback(() => setPlanRows((rows) => [...rows, { id: planIdRef.current++, model: "", qty: 0 }]), []);
  const updatePlanRow = useCallback((id: number, patch: Partial<{ model: string; qty: number }>) => setPlanRows((rows) => rows.map((r) => r.id === id ? { ...r, ...patch } : r)), []);
  const removePlanRow = useCallback((id: number) => setPlanRows((rows) => rows.filter((r) => r.id !== id)), []);
  const clearPlan = useCallback(() => { setPlanRows([]); setPlanCalculated(false); }, []);

  if (isLoadingBom) return <div className="skeleton" style={{ height: 200, marginBottom: 28 }} />;

  return (
    <div className="card" style={{ marginBottom: 28, border: "1px solid rgba(37, 99, 235, 0.2)" }}>
      <div className="card-header">
        <h3><span>🛠️</span> Bike Production Planning</h3>
        <span className="chip chip-info"><span className="chip-dot" />WHAT-IF · STOCK DRIVEN</span>
      </div>

      <div style={{ padding: "16px 24px" }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px", lineHeight: 1.5 }}>
          Select bike models and target quantities to see how many can be built from <strong>current inventory</strong>. BOM-driven, shared-pool aware — no part is counted twice.
        </p>

        {planRows.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--concrete)", fontFamily: "var(--font-mono)", margin: "0 0 12px" }}>
            No bike models added yet. Click &quot;+ Add Bike Model&quot; to start planning.
          </p>
        )}

        {planRows.map((row) => {
          const usedModels = planRows.filter((r) => r.id !== row.id).map((r) => r.model);
          const opts = bikeModels.filter((f) => f === row.model || !usedModels.includes(f));
          return (
            <div key={row.id} style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px", minWidth: 200 }}>
                <div className="filter-label">Bike Model</div>
                <select className="input select" value={row.model} onChange={(e) => updatePlanRow(row.id, { model: e.target.value })}>
                  <option value="">Select a model…</option>
                  {opts.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div style={{ width: 150 }}>
                <div className="filter-label">Production Qty</div>
                <input type="number" min={0} className="input" value={row.qty || ""} placeholder="0" onChange={(e) => updatePlanRow(row.id, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
              </div>
              <button onClick={() => removePlanRow(row.id)} className="btn btn-ghost" style={{ color: "var(--error)", height: 38 }}>✕</button>
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={addPlanRow} disabled={bikeModels.length === 0} className="btn btn-secondary">+ Add Bike Model</button>
          <button onClick={() => setPlanCalculated(true)} disabled={!planReady} className="btn btn-accent">CALCULATE</button>
          {planRows.length > 0 && <button onClick={clearPlan} className="btn btn-ghost">Clear</button>}
        </div>
      </div>

      {/* Results */}
      {planCalculated && planResults && (
        <>
          {/* Production Summary */}
          <div style={{ borderTop: "1px solid var(--border)", padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4>Production Summary</h4>
              <span className="chip chip-info"><span className="chip-dot" />{fmtN(planResults.totalPossible)} / {fmtN(planResults.totalRequested)} UNITS FEASIBLE</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bike Model</th>
                    <th style={{ textAlign: "right" }}>Requested</th>
                    <th style={{ textAlign: "right" }}>Possible</th>
                    <th>Limiting Component</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {planResults.perModel.map((p, i) => {
                    const color = p.status === "Available" ? "var(--success)" : p.status === "Partial" ? "var(--warning)" : "var(--error)";
                    const chipCls = p.status === "Available" ? "chip-success" : p.status === "Partial" ? "chip-warning" : "chip-error";
                    return (
                      <tr key={`${p.model}-${i}`} style={{ borderLeft: `3px solid ${color}` }}>
                        <td style={{ fontWeight: 600 }}>{p.model}</td>
                        <td className="num" style={{ textAlign: "right" }}>{fmtN(p.requested)}</td>
                        <td className="num" style={{ textAlign: "right", fontWeight: 700, color }}>{fmtN(p.possible)}</td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.limitingPart || "—"}</td>
                        <td><span className={`chip ${chipCls}`}><span className="chip-dot" />{p.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Parts Shortage */}
          <div style={{ borderTop: "1px solid var(--border)", padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4>Parts Shortage Analysis</h4>
              <span className={`chip ${planResults.shortages.length ? "chip-error" : "chip-success"}`}>
                <span className="chip-dot" />{planResults.shortages.length} PART{planResults.shortages.length === 1 ? "" : "S"} SHORT
              </span>
            </div>
            {planResults.shortages.length === 0 ? (
              <p style={{ color: "var(--success)", fontFamily: "var(--font-mono)", fontSize: 13 }}>✓ Current inventory fully covers the requested production plan.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Spare Part</th>
                      <th>Part No.</th>
                      <th style={{ textAlign: "right" }}>Required</th>
                      <th style={{ textAlign: "right" }}>Available</th>
                      <th style={{ textAlign: "right" }}>Shortage</th>
                      <th>Impacted Models</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planResults.shortages.slice(0, 50).map((s, i) => (
                      <tr key={`${s.itemCode}-${i}`} style={{ borderLeft: "3px solid var(--error)" }}>
                        <td style={{ fontWeight: 500 }}>{s.itemName}</td>
                        <td className="num" style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.itemCode}</td>
                        <td className="num" style={{ textAlign: "right" }}>{fmtN(s.required)}</td>
                        <td className="num" style={{ textAlign: "right", color: s.available <= 0 ? "var(--error)" : "var(--charcoal)" }}>{fmtN(s.available)}</td>
                        <td className="num" style={{ textAlign: "right", color: "var(--error)", fontWeight: 700 }}>{fmtN(s.shortage)}</td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.models.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
