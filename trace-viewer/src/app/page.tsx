"use client";

import { useState, useEffect } from "react";
import TraceDashboard from "@/components/trace-dashboard";
import Login from "@/components/login";
import { LogOut } from "lucide-react";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const authStatus = sessionStorage.getItem("vox_authenticated");
    if (authStatus === "true") {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleAuthenticated = () => {
    sessionStorage.setItem("vox_authenticated", "true");
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("vox_authenticated");
    setIsAuthenticated(false);
  };

  // Show loading state while checking authentication
  if (isLoading) {
    return null;
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-7xl px-6 py-12">
        <header className="mb-12 border-b border-black/10 pb-12">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                VOX Trace Observatory
              </p>
              <h1 className="text-5xl font-bold tracking-tight text-black">
                Trace Analytics
              </h1>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-black/5 transition"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </header>

        <TraceDashboard />
      </main>
    </div>
  );
}
