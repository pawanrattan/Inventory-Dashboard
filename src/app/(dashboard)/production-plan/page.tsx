"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Chart from "chart.js/auto";
import * as XLSX from "xlsx";
import apiClient from "@/lib/apiClient";

interface PlanRow {
  id: number;
  bike_model_id: number;
  bike_model: string;
  month: string;
  data: Record<string, number>; // { "1": qty, "2": qty, ... }
}

interface BikeModel { id: number; model_name: string; }

// ─── BOM Types ───────────────────────────────────────────────────────────────
interface BomBike {
  bike_code: string;
  bike_name: string;
  bom_qty: number;
}

interface BomPart {
  part_no: string;
  part_description: string;
  nature: string | null;
  category: string | null;
  supplier: string | null;
  inventory_level: number | null;
  moq: number | null;
  quantity: string | number;
  bikes: BomBike[];
}

function fmtN(n: number | null | undefined) {
  return (n || 0).toLocaleString("en-IN");
}

export default function ProductionPlanPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [models, setModels] = useState<BikeModel[]>([]);
  const [month, setMonth] = useState(getCurrentMonth());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState("All");

  // BOM state
  const [bomData, setBomData] = useState<BomPart[]>([]);
  const [bomLoading, setBomLoading] = useState(true);
  const [bomError, setBomError] = useState<string | null>(null);

  // Production Data (actual produced bikes from revolt_sales_rawdata)
  const [productionData, setProductionData] = useState<{ description: string; year: number; month: number; quantity: number }[]>([]);
  const [bomSearch, setBomSearch] = useState("");
  const [bomCategoryFilter, setBomCategoryFilter] = useState("All");
  const [bomNatureFilter, setBomNatureFilter] = useState("All");
  const [bomStockFilter, setBomStockFilter] = useState("All");
  const [bomVisibleRows, setBomVisibleRows] = useState(100);
  const [selectedBikes, setSelectedBikes] = useState<Set<string>>(new Set());
  const [showBikeSelector, setShowBikeSelector] = useState(false);

  const dailyChartRef = useRef<HTMLCanvasElement>(null);
  const modelChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstances = useRef<Record<string, Chart | null>>({});

  const fetchData = useCallback(async (m: string) => {
    try {
      setIsLoading(true); setError(null);
      const res = await apiClient.get(`/production-plan?month=${m}`);
      if (res.data?.success) {
        setPlans(res.data.data.plans || []);
        setModels(res.data.data.models || []);
      } else setError("Failed to load production plan.");
    } catch { setError("Failed to load data."); }
    finally { setIsLoading(false); }
  }, []);

  const fetchBomData = useCallback(async () => {
    try {
      setBomLoading(true); setBomError(null);
      const res = await apiClient.get("/bom");
      if (res.data?.success) {
        const responseData = res.data.data;
        if (Array.isArray(responseData)) {
          setBomData(responseData);
        } else {
          setBomData(responseData?.parts || []);
          setProductionData(responseData?.productionData || []);
        }
      } else setBomError("Failed to load BOM data.");
    } catch { setBomError("Failed to load BOM data."); }
    finally { setBomLoading(false); }
  }, []);

  useEffect(() => { fetchData(month); }, [fetchData, month]);
  useEffect(() => { fetchBomData(); }, [fetchBomData]);

  // Determine days in month
  const daysInMonth = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }, [month]);

  // Day keys as strings: "1", "2", ..., "31"
  const activeDayKeys = useMemo(() =>
    Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    [daysInMonth]
  );

  // Helper to get quantity for a day from a plan row
  const getDayQty = (row: PlanRow, day: string): number => {
    return Number(row.data?.[day]) || 0;
  };

  // Summary
  const summary = useMemo(() => {
    const totalUnits = plans.reduce((acc, row) => {
      return acc + activeDayKeys.reduce((s, k) => s + getDayQty(row, k), 0);
    }, 0);

    const uniqueModels = new Set(plans.map((r) => r.bike_model)).size;

    // Daily totals
    const dailyTotals = activeDayKeys.map((k) =>
      plans.reduce((s, row) => s + getDayQty(row, k), 0)
    );
    const peakDay = Math.max(...dailyTotals, 0);
    const peakDayIndex = dailyTotals.indexOf(peakDay);
    const workingDays = dailyTotals.filter((d) => d > 0).length;
    const avgDaily = workingDays > 0 ? Math.round(totalUnits / workingDays) : 0;

    // Per model totals
    const modelTotals = new Map<string, number>();
    plans.forEach((row) => {
      const total = activeDayKeys.reduce((s, k) => s + getDayQty(row, k), 0);
      modelTotals.set(row.bike_model, (modelTotals.get(row.bike_model) || 0) + total);
    });

    return { totalUnits, uniqueModels, dailyTotals, peakDay, peakDayIndex, avgDaily, modelTotals };
  }, [plans, activeDayKeys]);

  // Filtered
  const filteredPlans = useMemo(() => {
    if (modelFilter === "All") return plans;
    return plans.filter((r) => r.bike_model === modelFilter);
  }, [plans, modelFilter]);

  // Unique model names
  const modelNames = useMemo(() => [...new Set(plans.map((r) => r.bike_model))].sort(), [plans]);

  // ─── Production Actuals (Current Month till today) ─────────────────────────
  const currentMonthProductionSummary = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const now = new Date();
    const todayDate = now.getDate();
    const isCurrentMonth = now.getFullYear() === y && (now.getMonth() + 1) === m;
    const tillDay = isCurrentMonth ? todayDate : daysInMonth;

    // Planned till today: sum of day 1 to tillDay from production plan
    const plannedTillDate: Record<string, number> = {};
    plans.forEach((row) => {
      let total = 0;
      for (let d = 1; d <= tillDay; d++) {
        total += getDayQty(row, String(d));
      }
      if (total > 0) {
        plannedTillDate[row.bike_model] = (plannedTillDate[row.bike_model] || 0) + total;
      }
    });

    // Actual produced: from productionData for current month/year
    const actualProduced: Record<string, number> = {};
    productionData.forEach((row) => {
      if (row.year === y && row.month === m) {
        actualProduced[row.description] = (actualProduced[row.description] || 0) + row.quantity;
      }
    });

    // Build summary table rows
    const allModels = new Set([...Object.keys(plannedTillDate), ...Object.keys(actualProduced)]);
    const rows = [...allModels].sort().map((model) => ({
      model,
      planned: plannedTillDate[model] || 0,
      produced: actualProduced[model] || 0,
    }));

    const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);
    const totalProduced = rows.reduce((s, r) => s + r.produced, 0);

    return { rows, totalPlanned, totalProduced, tillDay, isCurrentMonth };
  }, [month, plans, productionData, daysInMonth]);

  // ─── BOM Computed Data ───────────────────────────────────────────────────────
  const bomComputed = useMemo(() => {
    if (bomData.length === 0) return [];

    // Get production actuals for current month to subtract from requirement
    const [y, m] = month.split("-").map(Number);
    const actualProducedMap: Record<string, number> = {};
    productionData.forEach((row) => {
      if (row.year === y && row.month === m) {
        actualProducedMap[row.description] = (actualProducedMap[row.description] || 0) + row.quantity;
      }
    });

    return bomData.map((part) => {
      const totalBomQty = part.bikes.reduce((sum, b) => sum + b.bom_qty, 0);
      const bikesCount = part.bikes.length;
      const warehouseQty = Number(part.quantity) || 0;

      // Build per-bike BOM qty map
      const bomQtyPerBike: Record<string, number> = {};
      part.bikes.forEach((bike) => {
        bomQtyPerBike[bike.bike_name] = (bomQtyPerBike[bike.bike_name] || 0) + bike.bom_qty;
      });

      // Monthly requirement: for each bike in this part's bikes array,
      // find matching production plan row and multiply bom_qty × total planned units
      let monthlyRequirement = 0;
      part.bikes.forEach((bike) => {
        const matchingPlan = plans.find((p) => p.bike_model === bike.bike_name);
        if (matchingPlan) {
          const planTotal = activeDayKeys.reduce((s, k) => s + getDayQty(matchingPlan, k), 0);
          monthlyRequirement += bike.bom_qty * planTotal;
        }
      });

      // Already produced consumption: subtract BOM parts consumed by produced bikes
      let producedConsumption = 0;
      part.bikes.forEach((bike) => {
        const produced = actualProducedMap[bike.bike_name] || 0;
        if (produced > 0) {
          producedConsumption += bike.bom_qty * produced;
        }
      });

      // Adjusted requirement = full month requirement minus already consumed by production
      const adjustedRequirement = Math.max(0, monthlyRequirement - producedConsumption);

      // Balance = Warehouse Qty - Adjusted Requirement (remaining needed)
      const balance = warehouseQty - adjustedRequirement;

      // Stock status based on balance relative to adjusted requirement
      let stockStatus: "Out of Stock" | "Low" | "Medium" | "High";
      if (warehouseQty === 0) {
        stockStatus = "Out of Stock";
      } else if (adjustedRequirement === 0) {
        stockStatus = "High";
      } else if (balance <= 0) {
        stockStatus = "Out of Stock";
      } else if (balance < adjustedRequirement * 0.5) {
        stockStatus = "Low";
      } else if (balance < adjustedRequirement * 1.5) {
        stockStatus = "Medium";
      } else {
        stockStatus = "High";
      }

      return {
        ...part,
        totalBomQty,
        bikesCount,
        monthlyRequirement,
        producedConsumption,
        adjustedRequirement,
        bomQtyPerBike,
        warehouseQty,
        balance,
        stockStatus,
      };
    });
  }, [bomData, plans, activeDayKeys, month, productionData]);

  // All unique bike names across BOM data (used as column headers)
  // Split into production plan bikes (common with Daily Production Schedule) and others
  const { productionBikes, otherBikes, allBomBikes } = useMemo(() => {
    const bikeSet = new Set<string>();
    bomData.forEach((part) => part.bikes.forEach((b) => bikeSet.add(b.bike_name)));
    const allBomBikes = [...bikeSet].sort();

    const planBikeNames = new Set(plans.map((p) => p.bike_model));
    const productionBikes = allBomBikes.filter((b) => planBikeNames.has(b));
    const otherBikes = allBomBikes.filter((b) => !planBikeNames.has(b));

    return { productionBikes, otherBikes, allBomBikes };
  }, [bomData, plans]);

  // Initialize selectedBikes with production bikes when data loads
  useEffect(() => {
    if (productionBikes.length > 0) {
      setSelectedBikes(new Set(productionBikes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionBikes]);

  // The visible bike columns based on user selection
  const visibleBikeColumns = useMemo(() => {
    // Maintain order: production bikes first, then others
    return [...productionBikes.filter((b) => selectedBikes.has(b)), ...otherBikes.filter((b) => selectedBikes.has(b))];
  }, [selectedBikes, productionBikes, otherBikes]);

  // BOM Filters
  const bomCategories = useMemo(() => [...new Set(bomData.map((p) => p.category).filter((c): c is string => c != null))].sort(), [bomData]);
  const bomNatures = useMemo(() => [...new Set(bomData.map((p) => p.nature).filter((n): n is string => n != null))].sort(), [bomData]);

  const filteredBom = useMemo(() => {
    let filtered = bomComputed;
    const q = bomSearch.trim().toLowerCase();
    if (q) filtered = filtered.filter((r) => `${r.part_no} ${r.part_description} ${r.supplier}`.toLowerCase().includes(q));
    if (bomCategoryFilter !== "All") filtered = filtered.filter((r) => r.category === bomCategoryFilter);
    if (bomNatureFilter !== "All") filtered = filtered.filter((r) => r.nature === bomNatureFilter);
    if (bomStockFilter !== "All") filtered = filtered.filter((r) => r.stockStatus === bomStockFilter);
    return filtered;
  }, [bomComputed, bomSearch, bomCategoryFilter, bomNatureFilter, bomStockFilter]);

  // BOM KPI Summary
  const bomSummary = useMemo(() => {
    const totalParts = bomComputed.length;
    const totalMonthlyReq = bomComputed.reduce((s, r) => s + r.monthlyRequirement, 0);
    const totalAdjustedReq = bomComputed.reduce((s, r) => s + r.adjustedRequirement, 0);
    const totalProducedConsumption = bomComputed.reduce((s, r) => s + r.producedConsumption, 0);
    const zeroDemandParts = bomComputed.filter((r) => r.adjustedRequirement === 0).length;
    const uniqueSuppliers = new Set(bomComputed.map((r) => r.supplier).filter(Boolean)).size;
    const uniqueCategories = new Set(bomComputed.map((r) => r.category).filter(Boolean)).size;
    const outOfStock = bomComputed.filter((r) => r.stockStatus === "Out of Stock").length;
    const lowStock = bomComputed.filter((r) => r.stockStatus === "Low").length;
    return { totalParts, totalMonthlyReq, totalAdjustedReq, totalProducedConsumption, zeroDemandParts, uniqueSuppliers, uniqueCategories, outOfStock, lowStock };
  }, [bomComputed]);

  // ─── Export BOM Data ───────────────────────────────────────────────────────
  const exportBomData = useCallback((format: "xlsx" | "csv") => {
    if (filteredBom.length === 0) return;

    // Build rows matching visible table columns
    const rows = filteredBom.map((r, idx) => {
      const row: Record<string, string | number> = {
        "#": idx + 1,
        "Part No.": r.part_no,
        "Description": r.part_description,
        "Nature": r.nature || "",
        "Category": r.category || "",
        "Supplier": r.supplier || "",
      };

      // Add selected bike columns
      visibleBikeColumns.forEach((bike) => {
        row[bike] = r.bomQtyPerBike[bike] || 0;
      });

      row["Inv Level"] = r.inventory_level || 0;
      row["MOQ"] = r.moq || 0;
      row["Warehouse Qty"] = r.warehouseQty;
      row["Monthly Req."] = r.monthlyRequirement;
      row["Produced Consumption"] = r.producedConsumption;
      row["Remaining Req."] = r.adjustedRequirement;
      row["Balance"] = r.balance;
      row["Stock Status"] = r.stockStatus;

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOM Part-wise");

    const [y, m] = month.split("-").map(Number);
    const label = new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
    const fileName = `BOM_Part-wise_${label.replace(/\s+/g, "_")}`;

    if (format === "xlsx") {
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else {
      XLSX.writeFile(wb, `${fileName}.csv`, { bookType: "csv" });
    }
  }, [filteredBom, visibleBikeColumns, month]);

  // Charts
  useEffect(() => {
    if (isLoading || plans.length === 0) return;
    const destroy = (k: string) => { if (chartInstances.current[k]) { chartInstances.current[k]!.destroy(); chartInstances.current[k] = null; } };

    // Daily production area chart
    if (dailyChartRef.current) {
      destroy("daily");
      chartInstances.current["daily"] = new Chart(dailyChartRef.current, {
        type: "line",
        data: {
          labels: activeDayKeys,
          datasets: [{
            label: "Daily Production",
            data: summary.dailyTotals,
            borderColor: "#2563EB",
            backgroundColor: "rgba(37, 99, 235, 0.08)",
            fill: true, tension: 0.3, borderWidth: 2,
            pointRadius: 3, pointBackgroundColor: "#2563EB",
            pointBorderColor: "#FFFFFF", pointBorderWidth: 1.5,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { title: { display: true, text: "Day of Month", color: "#57534E", font: { size: 10, family: "JetBrains Mono" } }, ticks: { color: "#57534E", font: { size: 9, family: "JetBrains Mono" } }, grid: { display: false } },
            y: { ticks: { color: "#57534E", font: { size: 9, family: "JetBrains Mono" }, callback: (v: unknown) => fmtN(Number(v)) }, grid: { color: "#F5F5F4" }, beginAtZero: true },
          },
        },
      });
    }

    // Model-wise horizontal bar
    if (modelChartRef.current) {
      destroy("model");
      const sorted = [...summary.modelTotals.entries()].sort((a, b) => b[1] - a[1]);
      const COLORS = ["#2563EB", "#16A34A", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#EA580C", "#4F46E5"];
      chartInstances.current["model"] = new Chart(modelChartRef.current, {
        type: "bar",
        data: {
          labels: sorted.map(([m]) => m),
          datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: sorted.map((_, i) => COLORS[i % COLORS.length] + "99"), borderColor: sorted.map((_, i) => COLORS[i % COLORS.length]), borderWidth: 1.5, borderRadius: 6 }],
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: "#57534E", font: { size: 9, family: "JetBrains Mono" }, callback: (v: unknown) => fmtN(Number(v)) }, grid: { color: "#F5F5F4" }, beginAtZero: true },
            y: { ticks: { color: "#1C1917", font: { size: 11, family: "Inter" } }, grid: { display: false } },
          },
        },
      });
    }

    return () => { destroy("daily"); destroy("model"); };
  }, [plans, isLoading, activeDayKeys, summary]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  }, [month]);

  if (isLoading) {
    return (
      <div>
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 24 }}>
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
        </div>
        <div className="skeleton" style={{ height: 300, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: "var(--text-muted)", marginBottom: 20, fontSize: 15 }}>{error}</p>
        <button onClick={() => fetchData(month)} className="btn btn-accent">Try Again</button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Production Plan</h1>
          <p className="page-subtitle">{monthLabel} · Daily Bike-wise Breakdown</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="month"
            className="input"
            style={{ width: 180 }}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button onClick={() => fetchData(month)} className="btn btn-secondary">↻ Refresh</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 28 }}>
        <KpiCard label="Total Planned" value={fmtN(summary.totalUnits)} sub={`${monthLabel}`} accent="var(--accent)" />
        <KpiCard label="Active Models" value={String(summary.uniqueModels)} sub="Bike models" accent="var(--success)" />
        <KpiCard label="Peak Day" value={fmtN(summary.peakDay)} sub={`Day ${summary.peakDayIndex + 1}`} accent="var(--warning)" />
        <KpiCard label="Avg Daily" value={fmtN(summary.avgDaily)} sub="Working days only" accent="var(--info)" />
        <KpiCard label="Plan Entries" value={String(plans.length)} sub="Model rows" accent="var(--purple)" />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 28 }}>
        <div className="chart-card">
          <h4>Daily Production Trend</h4>
          <p className="chart-subtitle">Total units planned per day · {monthLabel}</p>
          <div style={{ height: 240 }}><canvas ref={dailyChartRef} /></div>
        </div>
        <div className="chart-card">
          <h4>Model-wise Total</h4>
          <p className="chart-subtitle">Aggregate planned units by bike model</p>
          <div style={{ height: 240 }}><canvas ref={modelChartRef} /></div>
        </div>
      </div>

      {/* Data Table */}
      <div className="card">
        <div className="card-header">
          <h3><span>🏭</span> Daily Production Schedule</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="input select" style={{ width: 160, height: 32, fontSize: 12 }} value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
              <option value="All">All Models</option>
              {modelNames.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="tag">{filteredPlans.length} ROWS</span>
          </div>
        </div>

        <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
          <table className="data-table" style={{ minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 10, background: "var(--surface-alt)", minWidth: 160, borderRight: "2px solid var(--border)" }}>Model</th>
                {activeDayKeys.map((day) => (
                  <th key={day} style={{ textAlign: "center", minWidth: 38 }}>{day}</th>
                ))}
                <th style={{ position: "sticky", right: 0, zIndex: 10, background: "var(--surface-alt)", textAlign: "right", fontWeight: 700, minWidth: 70, borderLeft: "2px solid var(--border)" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlans.length === 0 ? (
                <tr><td colSpan={daysInMonth + 2} style={{ textAlign: "center", padding: 50, color: "var(--text-muted)" }}>No production plan data for this month.</td></tr>
              ) : filteredPlans.map((row) => {
                const rowTotal = activeDayKeys.reduce((s, k) => s + getDayQty(row, k), 0);
                return (
                  <tr key={row.id} style={{ borderLeft: `3px solid ${rowTotal > 0 ? "var(--accent)" : "var(--border)"}` }}>
                    <td style={{ position: "sticky", left: 0, zIndex: 5, background: "var(--surface)", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap", minWidth: 160, borderRight: "2px solid var(--border-light)" }}>{row.bike_model}</td>
                    {activeDayKeys.map((day) => {
                      const val = getDayQty(row, day);
                      return (
                        <td key={day} className="num" style={{ textAlign: "center", fontSize: 11, color: val > 0 ? "var(--charcoal)" : "var(--concrete)", fontWeight: val > 0 ? 500 : 400, background: val === 0 ? "rgba(156,163,175,0.04)" : undefined }}>
                          {val > 0 ? val : "·"}
                        </td>
                      );
                    })}
                    <td className="num" style={{ position: "sticky", right: 0, zIndex: 5, background: "var(--surface)", textAlign: "right", fontWeight: 700, minWidth: 70, borderLeft: "2px solid var(--border-light)", color: rowTotal > 0 ? "var(--accent)" : "var(--concrete)" }}>{rowTotal > 0 ? fmtN(rowTotal) : "—"}</td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr style={{ background: "var(--surface-alt)", borderTop: "2px solid var(--charcoal)" }}>
                <td style={{ fontWeight: 700, position: "sticky", left: 0, zIndex: 5, background: "var(--surface-alt)", borderRight: "2px solid var(--border)" }}>TOTAL</td>
                {activeDayKeys.map((_, i) => (
                  <td key={i} className="num" style={{ textAlign: "center", fontWeight: 700, fontSize: 11, color: "var(--accent)" }}>
                    {summary.dailyTotals[i] > 0 ? summary.dailyTotals[i] : "·"}
                  </td>
                ))}
                <td className="num" style={{ position: "sticky", right: 0, zIndex: 5, background: "var(--surface-alt)", textAlign: "right", fontWeight: 700, fontSize: 14, color: "var(--accent)", minWidth: 70, borderLeft: "2px solid var(--border)" }}>{fmtN(summary.totalUnits)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Production Actuals – Current Month Summary ────────────────────────── */}
      <div className="card" style={{ marginTop: 28 }}>
        <div className="card-header">
          <h3><span>📊</span> Production Actuals — {monthLabel} (Till Day {currentMonthProductionSummary.tillDay})</h3>
          <span className="tag">{currentMonthProductionSummary.rows.length} MODELS</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: 500 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Bike Model</th>
                <th style={{ textAlign: "right", minWidth: 120 }}>Planned (Till Day {currentMonthProductionSummary.tillDay})</th>
                <th style={{ textAlign: "right", minWidth: 120 }}>Produced</th>
                <th style={{ textAlign: "right", minWidth: 100 }}>Difference</th>
              </tr>
            </thead>
            <tbody>
              {currentMonthProductionSummary.rows.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No production data available for this month.</td></tr>
              ) : (
                <>
                  {currentMonthProductionSummary.rows.map((row) => {
                    const diff = row.produced - row.planned;
                    return (
                      <tr key={row.model}>
                        <td style={{ fontWeight: 600, fontSize: 12 }}>{row.model}</td>
                        <td className="num" style={{ textAlign: "right", fontWeight: 500 }}>{fmtN(row.planned)}</td>
                        <td className="num" style={{ textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>{fmtN(row.produced)}</td>
                        <td className="num" style={{ textAlign: "right", fontWeight: 600, color: diff >= 0 ? "var(--success)" : "var(--error)" }}>
                          {diff >= 0 ? "+" : ""}{fmtN(diff)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "var(--surface-alt)", borderTop: "2px solid var(--charcoal)" }}>
                    <td style={{ fontWeight: 700 }}>TOTAL</td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{fmtN(currentMonthProductionSummary.totalPlanned)}</td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>{fmtN(currentMonthProductionSummary.totalProduced)}</td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 700, color: (currentMonthProductionSummary.totalProduced - currentMonthProductionSummary.totalPlanned) >= 0 ? "var(--success)" : "var(--error)" }}>
                      {(currentMonthProductionSummary.totalProduced - currentMonthProductionSummary.totalPlanned) >= 0 ? "+" : ""}{fmtN(currentMonthProductionSummary.totalProduced - currentMonthProductionSummary.totalPlanned)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── BOM — Part-wise Breakdown Section ─────────────────────────────────── */}
      <div className="card" style={{ marginTop: 28 }}>
        <div className="card-header">
          <h3><span>📋</span> BOM — Part-wise Breakdown</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!bomLoading && filteredBom.length > 0 && (
              <>
                <button onClick={() => exportBomData("xlsx")} className="btn btn-secondary" style={{ fontSize: 11, padding: "5px 10px" }}>⬇ Excel</button>
                <button onClick={() => exportBomData("csv")} className="btn btn-secondary" style={{ fontSize: 11, padding: "5px 10px" }}>⬇ CSV</button>
              </>
            )}
            <span className="tag">{bomLoading ? "LOADING..." : `${fmtN(filteredBom.length)} PARTS`}</span>
          </div>
        </div>

        {bomLoading ? (
          <div style={{ padding: 40 }}>
            <div className="skeleton" style={{ height: 80, marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 300 }} />
          </div>
        ) : bomError ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 14 }}>{bomError}</p>
            <button onClick={fetchBomData} className="btn btn-accent">Try Again</button>
          </div>
        ) : (
          <>
            {/* BOM KPI Cards */}
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(6, 1fr)", margin: "20px 24px 0" }}>
              <KpiCard label="Total Parts" value={fmtN(bomSummary.totalParts)} sub="In BOM" accent="var(--charcoal)" />
              <KpiCard label="Full Month Req." value={fmtN(bomSummary.totalMonthlyReq)} sub={`${monthLabel} (Plan)`} accent="var(--info)" />
              <KpiCard label="Remaining Req." value={fmtN(bomSummary.totalAdjustedReq)} sub="After produced deduction" accent="var(--accent)" />
              <KpiCard label="Out of Stock" value={String(bomSummary.outOfStock)} sub="Need immediate action" accent="var(--error)" />
              <KpiCard label="Low Stock" value={String(bomSummary.lowStock)} sub="Below 50% coverage" accent="var(--warning)" />
              <KpiCard label="Unique Suppliers" value={String(bomSummary.uniqueSuppliers)} sub="Active suppliers" accent="var(--success)" />
            </div>

            {/* BOM Filters */}
            <div className="filter-group">
              <div style={{ flex: "1 1 260px", minWidth: 200 }}>
                <div className="filter-label">Search</div>
                <input className="input" value={bomSearch} onChange={(e) => { setBomSearch(e.target.value); setBomVisibleRows(100); }} placeholder="Part no, description, supplier..." />
              </div>
              <div style={{ minWidth: 160 }}>
                <div className="filter-label">Category</div>
                <select className="input select" value={bomCategoryFilter} onChange={(e) => { setBomCategoryFilter(e.target.value); setBomVisibleRows(100); }}>
                  <option value="All">All Categories</option>
                  {bomCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 140 }}>
                <div className="filter-label">Nature</div>
                <select className="input select" value={bomNatureFilter} onChange={(e) => { setBomNatureFilter(e.target.value); setBomVisibleRows(100); }}>
                  <option value="All">All</option>
                  {bomNatures.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 150 }}>
                <div className="filter-label">Stock Status</div>
                <select className="input select" value={bomStockFilter} onChange={(e) => { setBomStockFilter(e.target.value); setBomVisibleRows(100); }}>
                  <option value="All">All</option>
                  <option value="Out of Stock">Out of Stock</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              {(bomSearch || bomCategoryFilter !== "All" || bomNatureFilter !== "All" || bomStockFilter !== "All") && (
                <button onClick={() => { setBomSearch(""); setBomCategoryFilter("All"); setBomNatureFilter("All"); setBomStockFilter("All"); setBomVisibleRows(100); }} className="btn btn-ghost" style={{ marginTop: 18 }}>✕ Clear</button>
              )}
            </div>

            {/* Bike Column Selector */}
            <div style={{ padding: "0 24px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <button
                  onClick={() => setShowBikeSelector((v) => !v)}
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: "6px 12px" }}
                >
                  🏍️ Bike Columns ({selectedBikes.size}/{allBomBikes.length}) {showBikeSelector ? "▲" : "▼"}
                </button>
                <button onClick={() => setSelectedBikes(new Set(allBomBikes))} className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }}>Select All</button>
                <button onClick={() => setSelectedBikes(new Set(productionBikes))} className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }}>Production Only</button>
                <button onClick={() => setSelectedBikes(new Set())} className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }}>Clear All</button>
              </div>
              {showBikeSelector && (
                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 16, background: "var(--surface-alt)", maxHeight: 240, overflowY: "auto" }}>
                  {productionBikes.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        In Production Plan ({productionBikes.length})
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginBottom: 12 }}>
                        {productionBikes.map((bike) => (
                          <label key={bike} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, cursor: "pointer", color: "var(--charcoal)" }}>
                            <input
                              type="checkbox"
                              checked={selectedBikes.has(bike)}
                              onChange={(e) => {
                                const next = new Set(selectedBikes);
                                e.target.checked ? next.add(bike) : next.delete(bike);
                                setSelectedBikes(next);
                              }}
                              style={{ accentColor: "var(--accent)" }}
                            />
                            {bike}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {otherBikes.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                        Other Bikes ({otherBikes.length})
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
                        {otherBikes.map((bike) => (
                          <label key={bike} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, cursor: "pointer", color: "var(--text-muted)" }}>
                            <input
                              type="checkbox"
                              checked={selectedBikes.has(bike)}
                              onChange={(e) => {
                                const next = new Set(selectedBikes);
                                e.target.checked ? next.add(bike) : next.delete(bike);
                                setSelectedBikes(next);
                              }}
                            />
                            {bike}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* BOM Table */}
            <div style={{ overflowX: "auto", maxHeight: 650, overflowY: "auto" }}>
              <table className="data-table" style={{ minWidth: 1600 + visibleBikeColumns.length * 60 }}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Part No.</th>
                    <th style={{ minWidth: 200 }}>Description</th>
                    <th>Nature</th>
                    <th>Category</th>
                    <th>Supplier</th>
                    {visibleBikeColumns.map((bike) => <th key={bike} style={{ textAlign: "right", fontSize: 9, whiteSpace: "nowrap" }}>{bike}</th>)}
                    <th style={{ textAlign: "right" }}>Inv Level</th>
                    <th style={{ textAlign: "right" }}>MOQ</th>
                    <th style={{ textAlign: "right" }}>Warehouse Qty</th>
                    <th style={{ textAlign: "right" }}>Monthly Req.</th>
                    <th style={{ textAlign: "right" }}>Produced</th>
                    <th style={{ textAlign: "right" }}>Remaining Req.</th>
                    <th style={{ textAlign: "right" }}>Balance</th>
                    <th style={{ textAlign: "center" }}>Stock Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBom.length === 0 ? (
                    <tr><td colSpan={14 + visibleBikeColumns.length} style={{ textAlign: "center", padding: 50, color: "var(--text-muted)" }}>No parts match filters.</td></tr>
                  ) : filteredBom.slice(0, bomVisibleRows).map((r, idx) => {
                    const borderColor = r.stockStatus === "Out of Stock" ? "var(--error)" : r.stockStatus === "Low" ? "var(--warning)" : r.adjustedRequirement > 0 ? "var(--accent)" : "var(--border)";
                    return (
                      <tr key={`${r.part_no}-${idx}`} style={{ borderLeft: `3px solid ${borderColor}` }}>
                        <td className="num" style={{ color: "var(--concrete)", fontSize: 11 }}>{idx + 1}</td>
                        <td className="num" style={{ color: "var(--text-muted)", fontSize: 11 }}>{r.part_no}</td>
                        <td style={{ fontWeight: 500, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.part_description}>{r.part_description}</td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "capitalize" }}>{r.nature || "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.category || "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.supplier || ""}>{r.supplier || "—"}</td>
                        {visibleBikeColumns.map((bike) => {
                          const val = r.bomQtyPerBike[bike] || 0;
                          return <td key={bike} className="num" style={{ textAlign: "right", color: val > 0 ? "var(--accent)" : "var(--concrete)", fontWeight: val > 0 ? 600 : 400, fontSize: 11 }}>{val > 0 ? val : "—"}</td>;
                        })}
                        <td className="num" style={{ textAlign: "right", color: r.inventory_level && r.inventory_level > 0 ? "var(--charcoal)" : "var(--concrete)" }}>{r.inventory_level && r.inventory_level > 0 ? r.inventory_level : "—"}</td>
                        <td className="num" style={{ textAlign: "right", color: r.moq && r.moq > 0 ? "var(--charcoal)" : "var(--concrete)" }}>{r.moq && r.moq > 0 ? fmtN(r.moq) : "—"}</td>
                        <td className="num" style={{ textAlign: "right", fontWeight: 500, color: r.warehouseQty > 0 ? "var(--charcoal)" : "var(--error)" }}>{fmtN(r.warehouseQty)}</td>
                        <td className="num" style={{ textAlign: "right", fontWeight: 500, color: r.monthlyRequirement > 0 ? "var(--charcoal)" : "var(--concrete)" }}>{r.monthlyRequirement > 0 ? fmtN(r.monthlyRequirement) : "—"}</td>
                        <td className="num" style={{ textAlign: "right", fontWeight: 600, color: r.producedConsumption > 0 ? "var(--success)" : "var(--concrete)" }}>{r.producedConsumption > 0 ? fmtN(r.producedConsumption) : "—"}</td>
                        <td className="num" style={{ textAlign: "right", fontWeight: 700, color: r.adjustedRequirement > 0 ? "var(--accent)" : "var(--concrete)" }}>{r.adjustedRequirement > 0 ? fmtN(r.adjustedRequirement) : "—"}</td>
                        <td className="num" style={{ textAlign: "right", fontWeight: 700, color: r.balance < 0 ? "var(--error)" : r.balance === 0 ? "var(--warning)" : "var(--success)" }}>{fmtN(r.balance)}</td>
                        <td style={{ textAlign: "center" }}><StockStatusChip status={r.stockStatus} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Load More */}
            {filteredBom.length > bomVisibleRows && (
              <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Showing {Math.min(bomVisibleRows, filteredBom.length)} of {fmtN(filteredBom.length)}</span>
                <button onClick={() => setBomVisibleRows((v) => v + 100)} className="btn btn-secondary">Load More</button>
              </div>
            )}
            {filteredBom.length > 0 && filteredBom.length <= bomVisibleRows && (
              <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border)", textAlign: "right" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{fmtN(filteredBom.length)} parts displayed</span>
              </div>
            )}
          </>
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

function StockStatusChip({ status }: { status: "Out of Stock" | "Low" | "Medium" | "High" }) {
  if (status === "Out of Stock") return <span className="chip chip-error"><span className="chip-dot" />OUT</span>;
  if (status === "Low") return <span className="chip chip-warning" style={{ background: "rgba(217, 119, 6, 0.1)", color: "#D97706", border: "1px solid rgba(217, 119, 6, 0.3)" }}><span className="chip-dot" style={{ background: "#D97706" }} />LOW</span>;
  if (status === "Medium") return <span className="chip chip-info"><span className="chip-dot" />MED</span>;
  return <span className="chip chip-success"><span className="chip-dot" />HIGH</span>;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
