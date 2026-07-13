"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Chart from "chart.js/auto";
import apiClient from "@/lib/apiClient";

interface PlanRow {
  id: number;
  month: string;
  bike_model: string;
  bike_color: string;
  [key: string]: string | number;
}

interface BikeModel { id: number; model_name: string; }
interface BikeColor { id: number; color_name: string; }

function fmtN(n: number | null | undefined) {
  return (n || 0).toLocaleString("en-IN");
}

const DAY_KEYS = Array.from({ length: 31 }, (_, i) => `day_${String(i + 1).padStart(2, "0")}`);

export default function ProductionPlanPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [models, setModels] = useState<BikeModel[]>([]);
  const [colors, setColors] = useState<BikeColor[]>([]);
  const [month, setMonth] = useState(getCurrentMonth());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState("All");

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
        setColors(res.data.data.colors || []);
      } else setError("Failed to load production plan.");
    } catch { setError("Failed to load data."); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchData(month); }, [fetchData, month]);

  // Determine days in month
  const daysInMonth = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }, [month]);

  const activeDayKeys = useMemo(() => DAY_KEYS.slice(0, daysInMonth), [daysInMonth]);

  // Summary
  const summary = useMemo(() => {
    const totalUnits = plans.reduce((acc, row) => {
      return acc + activeDayKeys.reduce((s, k) => s + (Number(row[k]) || 0), 0);
    }, 0);

    const uniqueModels = new Set(plans.map((r) => r.bike_model)).size;
    const uniqueColors = new Set(plans.map((r) => r.bike_color)).size;

    // Daily totals
    const dailyTotals = activeDayKeys.map((k) =>
      plans.reduce((s, row) => s + (Number(row[k]) || 0), 0)
    );
    const peakDay = Math.max(...dailyTotals, 0);
    const peakDayIndex = dailyTotals.indexOf(peakDay);
    const avgDaily = totalUnits > 0 ? Math.round(totalUnits / dailyTotals.filter((d) => d > 0).length) : 0;

    // Per model totals
    const modelTotals = new Map<string, number>();
    plans.forEach((row) => {
      const total = activeDayKeys.reduce((s, k) => s + (Number(row[k]) || 0), 0);
      modelTotals.set(row.bike_model, (modelTotals.get(row.bike_model) || 0) + total);
    });

    return { totalUnits, uniqueModels, uniqueColors, dailyTotals, peakDay, peakDayIndex, avgDaily, modelTotals };
  }, [plans, activeDayKeys]);

  // Filtered
  const filteredPlans = useMemo(() => {
    if (modelFilter === "All") return plans;
    return plans.filter((r) => r.bike_model === modelFilter);
  }, [plans, modelFilter]);

  // Unique model names
  const modelNames = useMemo(() => [...new Set(plans.map((r) => r.bike_model))].sort(), [plans]);

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
          labels: activeDayKeys.map((_, i) => String(i + 1)),
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
          <p className="page-subtitle">{monthLabel} · Daily Bike-wise Color-wise Breakdown</p>
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
        <KpiCard label="Active Models" value={String(summary.uniqueModels)} sub={`${summary.uniqueColors} color variants`} accent="var(--success)" />
        <KpiCard label="Peak Day" value={fmtN(summary.peakDay)} sub={`Day ${summary.peakDayIndex + 1}`} accent="var(--warning)" />
        <KpiCard label="Avg Daily" value={fmtN(summary.avgDaily)} sub="Working days only" accent="var(--info)" />
        <KpiCard label="Plan Entries" value={String(plans.length)} sub="Model × Color rows" accent="var(--purple)" />
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
                <th style={{ position: "sticky", left: 0, zIndex: 10, background: "var(--surface-alt)", minWidth: 90 }}>Model</th>
                <th style={{ position: "sticky", left: 90, zIndex: 10, background: "var(--surface-alt)", minWidth: 160, borderRight: "2px solid var(--border)" }}>Color</th>
                {activeDayKeys.map((_, i) => (
                  <th key={i} style={{ textAlign: "center", minWidth: 38 }}>{i + 1}</th>
                ))}
                <th style={{ position: "sticky", right: 0, zIndex: 10, background: "var(--surface-alt)", textAlign: "right", fontWeight: 700, minWidth: 70, borderLeft: "2px solid var(--border)" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlans.length === 0 ? (
                <tr><td colSpan={daysInMonth + 3} style={{ textAlign: "center", padding: 50, color: "var(--text-muted)" }}>No production plan data for this month.</td></tr>
              ) : filteredPlans.map((row) => {
                const rowTotal = activeDayKeys.reduce((s, k) => s + (Number(row[k]) || 0), 0);
                return (
                  <tr key={row.id} style={{ borderLeft: `3px solid ${rowTotal > 0 ? "var(--accent)" : "var(--border)"}` }}>
                    <td style={{ position: "sticky", left: 0, zIndex: 5, background: "var(--surface)", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap", minWidth: 90 }}>{row.bike_model}</td>
                    <td style={{ position: "sticky", left: 90, zIndex: 5, background: "var(--surface)", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", minWidth: 160, borderRight: "2px solid var(--border-light)" }}>{row.bike_color}</td>
                    {activeDayKeys.map((k, i) => {
                      const val = Number(row[k]) || 0;
                      return (
                        <td key={i} className="num" style={{ textAlign: "center", fontSize: 11, color: val > 0 ? "var(--charcoal)" : "var(--concrete)", fontWeight: val > 0 ? 500 : 400, background: val === 0 ? "rgba(156,163,175,0.04)" : undefined }}>
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
                <td colSpan={2} style={{ fontWeight: 700, position: "sticky", left: 0, zIndex: 5, background: "var(--surface-alt)", borderRight: "2px solid var(--border)" }}>TOTAL</td>
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

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
