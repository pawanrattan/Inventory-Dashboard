"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";

const NAV_ITEMS = [
  { href: "/monthly-procurement", label: "Monthly Procurement" },
  { href: "/current-inventory", label: "Current Inventory" },
  { href: "/production-plan", label: "Production Plan" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("token");
    if (!stored) router.replace("/login");
    else setReady(true);
  }, [router]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="skeleton" style={{ width: 200, height: 24 }} />
      </div>
    );
  }

  return (
    <div>
      {/* Top Navbar */}
      <header className="topbar">
        <div className="topbar-inner">
          {/* Left: Brand + Nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <Link href="/monthly-procurement" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
              <img src="/images/revolt-motors-logo.png" alt="Revolt Motors" style={{ height: 28, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
              <span className="topbar-brand">Inventory Dashboard</span>
            </Link>
            <nav className="topbar-nav">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={pathname === item.href ? "active" : ""}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right: User + Logout */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {user && (
              <span style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {user.name}
              </span>
            )}
            <button onClick={handleLogout} className="btn btn-ghost" style={{ height: 32, fontSize: 12, padding: "0 12px" }}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content-top">{children}</main>
    </div>
  );
}
