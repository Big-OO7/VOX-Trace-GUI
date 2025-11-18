"use client";

import { useState, useEffect } from "react";
import TraceDashboard from "@/components/trace-dashboard";
import EvalResultsViewer from "@/components/eval-results-viewer";
import Login from "@/components/login";
import { BarChart3, Database, LogOut } from "lucide-react";

const cn = (...classes: Array<string | undefined | null | false>) =>
  classes.filter(Boolean).join(" ");

export default function Home() {
  const [activeTab, setActiveTab] = useState<"traces" | "results">("traces");
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

          {/* Tab Navigation */}
          <div className="mt-8 flex gap-2">
            <button
              onClick={() => setActiveTab("traces")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition",
                activeTab === "traces"
                  ? "bg-black text-white"
                  : "border border-black/10 bg-white text-black hover:bg-black/5"
              )}
            >
              <Database className="h-4 w-4" />
              Trace Explorer
            </button>
            <button
              onClick={() => setActiveTab("results")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition",
                activeTab === "results"
                  ? "bg-black text-white"
                  : "border border-black/10 bg-white text-black hover:bg-black/5"
              )}
            >
              <BarChart3 className="h-4 w-4" />
              Evaluation Results
            </button>
          </div>
        </header>

        {/* Keep both components mounted but hide inactive one to preserve state */}
        <div className={activeTab === "traces" ? "block" : "hidden"}>
          <TraceDashboard />
        </div>
        <div className={activeTab === "results" ? "block" : "hidden"}>
          <EvalResultsViewer />
        </div>
      </main>
    </div>
  );
}
