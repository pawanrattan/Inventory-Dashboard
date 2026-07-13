"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Chart from "chart.js/auto";
import apiClient from "@/lib/apiClient";
import {
  BomStockRow,
  ProductionPlanRow,
  ProcurementRecord,
  ProductionPlanGrid,
} from "@/types/procurement";
import {
  buildProductionPlanGrid,
  calculateProcurementData,
  calculateSummary,
} from "@/lib/procurement";

function fmtN(n: number | null | undefined) {
  return (n || 0).toLocaleString("en-IN");
}

export default function MonthlyProcurementPage() {
  const [bomStock, setBomStock] = useState<BomStockRow[]>([]);
  const [productionPlan, setProductionPlan] = useState<ProductionPlanRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [logicFilter, setLogicFilter] = useState("All");
  const [stockFilter, setStockFilter] = useState("All");
  const [visibleRows, setVisibleRows] = useState(100);

  const monthlyChartRef = useRef<HTMLCanvasElement>(null);
  const logicChartRef = useRef<HTMLCanvasElement>(null);
  const deviationChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstances = useRef<Record<string, Chart | null>>({});

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true); setError(null);
      const res = await apiClient.get("/procurement");
      if (res.data?.success) { setBomStock(res.data.data.bomStock || []); setProductionPlan(res.data.data.productionPlan || []); }
      else setError("Failed to load procurement data.");
    } catch { setError("Failed to load data."); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const grid = useMemo<ProductionPlanGrid>(() => buildProductionPlanGrid(productionPlan), [productionPlan]);
  const records = useMemo<ProcurementRecord[]>(() => bomStock.length === 0 ? [] : calculateProcurementData(bomStock, grid), [bomStock, grid]);
  const summary = useMemo(() => calculateSummary(records), [records]);

  const filteredRecords = useMemo(() => {
    let filtered = records;
    const q = search.trim().toLowerCase();
    if (q) filtered = filtered.filter((r) => `${r.partNo} ${r.partDescription} ${r.supplier}`.toLowerCase().includes(q));
    if (logicFilter !== "All") filtered = filtered.filter((r) => r.procurementLogic === logicFilter);
    if (stockFilter === "Critical") filtered = filtered.filter((r) => r.targetMSL > 0 && r.openingStock < r.targetMSL * 0.5);
    else if (stockFilter === "Low") filtered = filtered.filter((r) => r.mslDeviation < -0.2);
    else if (stockFilter === "Overstocked") filtered = filtered.filter((r) => r.mslDeviation > 0.2);
    else if (stockFilter === "OK") filtered = filtered.filter((r) => r.mslDeviation >= -0.2 && r.mslDeviation <= 0.2 && r.targetMSL > 0);
    return filtered;
  }, [records, search, logicFilter, stockFilter]);

  // Charts
  useEffect(() => {
    if (isLoading || records.length === 0) return;
    const destroy = (k: string) => { if (chartInstances.current[k]) { chartInstances.current[k]!.destroy(); chartInstances.current[k] = null; } };

    // Monthly production chart
    if (monthlyChartRef.current) {
      destroy("monthly");
      const monthlyData = grid.months.map((m) => ({ month: m, total: grid.totals[m] || 0 }));
      chartInstances.current["monthly"] = new Chart(monthlyChartRef.current, {
        type: "line",
        data: {
          labels: monthlyData.map((d) => d.month),
          datasets: [{
            label: "Planned Production", data: monthlyData.map((d) => d.total),
            borderColor: "#2563EB", backgroundColor: "rgba(37, 99, 235, 0.08)",
            fill: true, tension: 0.3, borderWidth: 2.5, pointRadius: 4,
            pointBackgroundColor: "#2563EB", pointBorderColor: "#FFFFFF", pointBorderWidth: 2,
          }],
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

    // Procurement logic pie
    if (logicChartRef.current) {
      destroy("logic");
      chartInstances.current["logic"] = new Chart(logicChartRef.current, {
        type: "doughnut",
        data: {
          labels: ["Regular Procurement", "No Procurement"],
          datasets: [{ data: [summary.regularProcurement, summary.noProcurement], backgroundColor: ["rgba(37, 99, 235, 0.8)", "rgba(156, 163, 175, 0.5)"], borderColor: ["#2563EB", "#9CA3AF"], borderWidth: 2, hoverOffset: 6 }],
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: { position: "bottom", labels: { color: "#57534E", font: { family: "JetBrains Mono", size: 10 }, padding: 16, usePointStyle: true, pointStyle: "circle" } } } },
      });
    }

    // MSL deviation distribution
    if (deviationChartRef.current) {
      destroy("dev");
      const buckets = { critical: summary.criticalParts, low: summary.lowStockParts, ok: summary.totalParts - summary.criticalParts - summary.lowStockParts - summary.overstockedParts, over: summary.overstockedParts };
      chartInstances.current["dev"] = new Chart(deviationChartRef.current, {
        type: "bar",
        data: {
          labels: ["Critical", "Low Stock", "Within Range", "Overstocked"],
          datasets: [{ data: [buckets.critical, buckets.low, buckets.ok, buckets.over], backgroundColor: ["rgba(220, 38, 38, 0.7)", "rgba(217, 119, 6, 0.7)", "rgba(22, 163, 74, 0.7)", "rgba(37, 99, 235, 0.7)"], borderRadius: 6, borderSkipped: false }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { ticks: { color: "#57534E", font: { family: "JetBrains Mono", size: 10 } }, grid: { display: false } }, y: { ticks: { color: "#57534E", font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "#F5F5F4" }, beginAtZero: true } },
        },
      });
    }

    return () => { destroy("monthly"); destroy("logic"); destroy("dev"); };
  }, [records, isLoading, grid, summary]);

  if (isLoading) {
    return (
      <div>
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 24 }}>
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
        </div>
        <div className="skeleton" style={{ height: 300, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 500 }} />
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
          <h1>Monthly Procurement</h1>
          <p className="page-subtitle">Jul&apos;26 · BOM Parts Working · Procurement Planning</p>
        </div>
        <button onClick={fetchData} className="btn btn-secondary">↻ Refresh</button>
      </div>

      {/* KPIs Row 1 */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 16 }}>
        <KpiCard label="Total Parts" value={fmtN(summary.totalParts)} sub="In BOM system" accent="var(--charcoal)" />
        <KpiCard label="Jul Consumption" value={fmtN(summary.totalRequiredQty)} sub="Total OE demand" accent="var(--warning)" />
        <KpiCard label="Procurement Qty" value={fmtN(Math.round(summary.totalProcurementQty))} sub="Estimated need" accent="var(--accent)" />
        <KpiCard label="Critical Parts" value={String(summary.criticalParts)} sub="Stock < 50% MSL" accent="var(--error)" />
        <KpiCard label="Overstocked" value={String(summary.overstockedParts)} sub="Above +20% MSL" accent="var(--purple)" />
      </div>

      {/* KPIs Row 2 */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 28 }}>
        <KpiCard label="Regular Procurement" value={String(summary.regularProcurement)} sub={`${((summary.regularProcurement / summary.totalParts) * 100).toFixed(0)}% of total`} accent="var(--accent)" />
        <KpiCard label="No Procurement" value={String(summary.noProcurement)} sub={`${((summary.noProcurement / summary.totalParts) * 100).toFixed(0)}% of total`} accent="var(--concrete)" />
        <KpiCard label="Jul Production" value={fmtN(grid.totals["Jul-26"] || 0)} sub="Firm plan (bikes)" accent="var(--success)" />
        <KpiCard label="Avg MSL Deviation" value={`${(summary.avgMSLDeviation * 100).toFixed(1)}%`} sub={summary.avgMSLDeviation >= 0 ? "Overall surplus" : "Overall deficit"} accent={summary.avgMSLDeviation >= 0 ? "var(--success)" : "var(--error)"} />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 16, marginBottom: 28 }}>
        <div className="chart-card">
          <h4>Production Plan Trend</h4>
          <p className="chart-subtitle">Bike-wise monthly planned units</p>
          <div style={{ height: 220 }}><canvas ref={monthlyChartRef} /></div>
        </div>
        <div className="chart-card">
          <h4>Procurement Logic</h4>
          <p className="chart-subtitle">Parts distribution by decision</p>
          <div style={{ height: 220 }}><canvas ref={logicChartRef} /></div>
        </div>
        <div className="chart-card">
          <h4>Stock Health (MSL)</h4>
          <p className="chart-subtitle">Parts by deviation bucket</p>
          <div style={{ height: 220 }}><canvas ref={deviationChartRef} /></div>
        </div>
      </div>

      {/* Production Plan Grid */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div className="card-header">
          <h3><span>🏭</span> Production Plan (Bike-wise Monthly)</h3>
          <span className="chip chip-info"><span className="chip-dot" />FIRM + FORECAST</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                {grid.months.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid.models.map((model) => {
                const rowTotal = grid.months.reduce((a, m) => a + (grid.values[model]?.[m] || 0), 0);
                return (
                  <tr key={model} style={{ borderLeft: rowTotal > 0 ? "3px solid var(--accent)" : "3px solid var(--border)" }}>
                    <td style={{ fontWeight: 600, color: rowTotal > 0 ? "var(--charcoal)" : "var(--concrete)" }}>{model}</td>
                    {grid.months.map((m) => {
                      const val = grid.values[model]?.[m] || 0;
                      return <td key={m} className="num" style={{ textAlign: "right", color: val > 0 ? "var(--charcoal)" : "var(--concrete)", fontWeight: val > 0 ? 600 : 400 }}>{val > 0 ? fmtN(val) : "—"}</td>;
                    })}
                  </tr>
                );
              })}
              <tr style={{ background: "var(--surface-alt)" }}>
                <td style={{ fontWeight: 700, color: "var(--charcoal)" }}>TOTAL</td>
                {grid.months.map((m) => <td key={m} className="num" style={{ textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>{fmtN(grid.totals[m] || 0)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Calculation Logic Reference */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div className="card-header">
          <h3><span>📐</span> Calculation Logic Reference</h3>
          <span className="tag">BUSINESS RULES</span>
        </div>
        <div style={{ padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          <FormulaCard title="Monthly OE Consumption" formula="Σ (Production_Plan[model][month] × BOM_Qty[part][model])" description="For each model, multiply planned production by part's BOM qty" />
          <FormulaCard title="TARGET MSL" formula="Next_Month_OE × Inv_Level_Factor" description="Minimum stock = next month demand × coverage factor" />
          <FormulaCard title="Jun Closing Stock" formula="Opening - Consumption + Arrivals - Transfers" description="End-of-month stock position" />
          <FormulaCard title="Jul Closing" formula="Jun_Closing - Jul_Total + Firm_Schedule" description="Projected month-end after receipts" />
          <FormulaCard title="Estimated Procurement" formula="Jun_Closing - Jul_Consumption - TARGET_MSL" description="Negative = surplus, Positive = gap to fill" />
          <FormulaCard title="MSL Deviation %" formula="(Jul_Closing - TARGET_MSL) / TARGET_MSL" description="±20% threshold for stock health" />
          <FormulaCard title="Vehicle Equivalent" formula="Jul_Closing / MAX(BOM_Qty)" description="Stock in terms of complete vehicles" />
          <FormulaCard title="Total Forecast" formula="OE_Month + SPD_Month + FC_Roundoff" description="Complete monthly demand estimate" />
        </div>
      </div>

      {/* Procurement Table */}
      <div className="card">
        <div className="card-header">
          <h3><span>📋</span> Procurement Plan — Part-wise</h3>
          <span className="tag">{fmtN(filteredRecords.length)} PARTS</span>
        </div>

        {/* Filters */}
        <div className="filter-group">
          <div style={{ flex: "1 1 260px", minWidth: 200 }}>
            <div className="filter-label">Search</div>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Part no, description, supplier..." />
          </div>
          <div style={{ minWidth: 160 }}>
            <div className="filter-label">Procurement Logic</div>
            <select className="input select" value={logicFilter} onChange={(e) => setLogicFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="Regular Procurement">Regular</option>
              <option value="No Procurement">No Procurement</option>
            </select>
          </div>
          <div style={{ minWidth: 140 }}>
            <div className="filter-label">Stock Status</div>
            <select className="input select" value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="Critical">Critical</option>
              <option value="Low">Low Stock</option>
              <option value="OK">Within Range</option>
              <option value="Overstocked">Overstocked</option>
            </select>
          </div>
          {(search || logicFilter !== "All" || stockFilter !== "All") && (
            <button onClick={() => { setSearch(""); setLogicFilter("All"); setStockFilter("All"); }} className="btn btn-ghost" style={{ marginTop: 18 }}>✕ Clear</button>
          )}
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto", maxHeight: 650, overflowY: "auto" }}>
          <table className="data-table" style={{ minWidth: 2000 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Part No.</th>
                <th style={{ minWidth: 200 }}>Description</th>
                <th>Supplier</th>
                {grid.models.map((m) => <th key={m} style={{ textAlign: "right", fontSize: 9, whiteSpace: "nowrap" }}>{m}</th>)}
                <th style={{ textAlign: "right" }}>MOQ</th>
                <th style={{ textAlign: "right" }}>Inv Level</th>
                <th style={{ textAlign: "right" }}>Warehouse Stock</th>
                <th style={{ textAlign: "right" }}>Target MSL</th>
                <th style={{ textAlign: "right" }}>Jul OE</th>
                <th style={{ textAlign: "right" }}>Aug OE</th>
                <th style={{ textAlign: "right" }}>Sep OE</th>
                <th style={{ textAlign: "right" }}>Est. Procurement</th>
                <th style={{ textAlign: "right" }}>Jul Closing</th>
                <th style={{ textAlign: "center" }}>MSL Status</th>
                <th>Logic</th>
                <th style={{ textAlign: "right" }}>Vehicles</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr><td colSpan={15 + grid.models.length} style={{ textAlign: "center", padding: 50, color: "var(--text-muted)" }}>No parts match filters.</td></tr>
              ) : filteredRecords.slice(0, visibleRows).map((r) => {
                const borderColor = r.targetMSL > 0 && r.mslDeviation < -0.2 ? "var(--error)" : r.procurementLogic === "Regular Procurement" ? "var(--accent)" : "var(--border)";
                return (
                  <tr key={`${r.partNo}-${r.sNo}`} style={{ borderLeft: `3px solid ${borderColor}` }}>
                    <td className="num" style={{ color: "var(--concrete)", fontSize: 11 }}>{r.sNo}</td>
                    <td className="num" style={{ color: "var(--text-muted)", fontSize: 11 }}>{r.partNo}</td>
                    <td style={{ fontWeight: 500, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.partDescription}>{r.partDescription}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.supplier || "—"}</td>
                    {grid.models.map((m) => {
                      const val = r.bomQty[m] || 0;
                      return <td key={m} className="num" style={{ textAlign: "right", color: val > 0 ? "var(--accent)" : "var(--concrete)", fontWeight: val > 0 ? 600 : 400, fontSize: 11 }}>{val > 0 ? val : "—"}</td>;
                    })}
                    <td className="num" style={{ textAlign: "right", color: r.moq > 0 ? "var(--charcoal)" : "var(--concrete)" }}>{r.moq > 0 ? fmtN(r.moq) : "—"}</td>
                    <td className="num" style={{ textAlign: "right", color: r.invLevel > 0 ? "var(--charcoal)" : "var(--concrete)" }}>{r.invLevel > 0 ? r.invLevel : "—"}</td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 500 }}>{r.openingStock > 0 ? fmtN(r.openingStock) : "—"}</td>
                    <td className="num" style={{ textAlign: "right", color: "var(--text-muted)" }}>{r.targetMSL > 0 ? fmtN(Math.round(r.targetMSL)) : "—"}</td>
                    <td className="num" style={{ textAlign: "right", color: r.julOE > 0 ? "var(--accent)" : "var(--concrete)", fontWeight: r.julOE > 0 ? 600 : 400 }}>{r.julOE > 0 ? fmtN(r.julOE) : "—"}</td>
                    <td className="num" style={{ textAlign: "right", color: r.augOE > 0 ? "var(--charcoal)" : "var(--concrete)" }}>{r.augOE > 0 ? fmtN(r.augOE) : "—"}</td>
                    <td className="num" style={{ textAlign: "right", color: r.sepOE > 0 ? "var(--charcoal)" : "var(--concrete)" }}>{r.sepOE > 0 ? fmtN(r.sepOE) : "—"}</td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 600, color: r.estimatedProcurement < 0 ? "var(--error)" : "var(--success)" }}>
                      {r.julTotalConsumption > 0 ? fmtN(Math.round(r.estimatedProcurement)) : "—"}
                    </td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 700, color: r.julClosing < 0 ? "var(--error)" : "var(--charcoal)" }}>{fmtN(r.julClosing)}</td>
                    <td style={{ textAlign: "center" }}>
                      {r.targetMSL > 0 ? <MslChip deviation={r.mslDeviation} /> : <span style={{ color: "var(--concrete)", fontSize: 10, fontFamily: "var(--font-mono)" }}>N/A</span>}
                    </td>
                    <td><LogicChip logic={r.procurementLogic} /></td>
                    <td className="num" style={{ textAlign: "right", fontSize: 11, color: "var(--text-muted)" }}>{r.maxBomQty > 0 ? Math.round(r.julClosingVehicles).toLocaleString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Load More */}
        {filteredRecords.length > visibleRows && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Showing {Math.min(visibleRows, filteredRecords.length)} of {fmtN(filteredRecords.length)}</span>
            <button onClick={() => setVisibleRows((v) => v + 100)} className="btn btn-secondary">Load More</button>
          </div>
        )}
        {filteredRecords.length > 0 && filteredRecords.length <= visibleRows && (
          <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border)", textAlign: "right" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{fmtN(filteredRecords.length)} parts displayed</span>
          </div>
        )}
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

function MslChip({ deviation }: { deviation: number }) {
  if (deviation > 0.2) return <span className="chip chip-purple"><span className="chip-dot" />OVER</span>;
  if (deviation < -0.2) return <span className="chip chip-error"><span className="chip-dot" />LOW</span>;
  return <span className="chip chip-success"><span className="chip-dot" />OK</span>;
}

function LogicChip({ logic }: { logic: string }) {
  if (logic === "Regular Procurement") return <span className="chip chip-info"><span className="chip-dot" />REGULAR</span>;
  return <span className="chip chip-neutral"><span className="chip-dot" />NONE</span>;
}

function FormulaCard({ title, formula, description }: { title: string; formula: string; description: string }) {
  return (
    <div style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "16px 18px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--charcoal)", marginBottom: 8, fontFamily: "var(--font-headline)" }}>{title}</div>
      <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent)", marginBottom: 8, wordBreak: "break-all", lineHeight: 1.5 }}>{formula}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{description}</div>
    </div>
  );
}
