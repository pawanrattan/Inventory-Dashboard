"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Login failed");
        return;
      }

      setAuth(data.data.token, { name: data.data.user.name, email: data.data.user.email });
      router.push("/production-plan");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* Background pattern */}
      <div className="login-bg-pattern" />

      <div className="login-card-wrapper">
        {/* Top accent border */}
        <div className="login-card-accent" />

        <div className="login-card-content">
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div className="login-logo-box">
              <img
                src="/images/revolt-motors-logo.png"
                alt="Revolt Motors"
                style={{ height: 36, objectFit: "contain", filter: "brightness(0) invert(1)" }}
              />
            </div>
          </div>

          {/* Brand Text */}
          <h1 className="login-title">REVOLT MOTORS</h1>
          <p className="login-subtitle">INVENTORY DASHBOARD</p>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ marginTop: 36 }}>
            {/* Employee ID */}
            <div className="login-field">
              <label className="login-label">EMPLOYEE ID</label>
              <input
                type="text"
                className="login-input"
                placeholder="Enter your employee ID"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                autoFocus
              />
            </div>

            {/* Password */}
            <div className="login-field">
              <label className="login-label">SECURITY PASSWORD</label>
              <input
                type="password"
                className="login-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {/* Error */}
            {error && (
              <div className="login-error">{error}</div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="login-btn"
              disabled={loading}
            >
              {loading ? "AUTHENTICATING..." : "ACCESS DASHBOARD"}
            </button>
          </form>

          {/* Footer */}
          <p className="login-footer">© 2026 Revolt Motors · Inventory Terminal</p>
        </div>
      </div>
    </div>
  );
}
