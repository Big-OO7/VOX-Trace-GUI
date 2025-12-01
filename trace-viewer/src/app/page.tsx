"use client";

import { useState, useEffect } from "react";
import TraceDashboard from "@/components/trace-dashboard";
import QREvaluation from "@/components/qr-evaluation";
import RLHFGrading from "@/components/rlhf-grading";
import AnalyticsComparison from "@/components/analytics-comparison";
import Login from "@/components/login";
import { LogOut } from "lucide-react";
import { loadGradeData } from "@/lib/grade-data";
import { GradeRecord } from "@/lib/grade-types";

type TabType = "traces" | "qr" | "rlhf" | "analytics";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("traces");
  const [gradeData, setGradeData] = useState<GradeRecord[]>([]);

  // Check for existing session on mount
  useEffect(() => {
    const authStatus = sessionStorage.getItem("vox_authenticated");
    if (authStatus === "true") {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  // Load grade data for RLHF and Analytics tabs
  useEffect(() => {
    if (isAuthenticated) {
      loadGradeData().then(setGradeData).catch(console.error);
    }
  }, [isAuthenticated]);

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
                {activeTab === "traces" && "Trace Analytics"}
                {activeTab === "qr" && "QR Evaluation"}
                {activeTab === "rlhf" && "RLHF Grading"}
                {activeTab === "analytics" && "Analytics & Comparison"}
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

        {/* Tab Navigation */}
        <div className="mb-8 border-b border-black/10">
          <div className="flex gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab("traces")}
              className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
                activeTab === "traces"
                  ? "border-black text-black"
                  : "border-transparent text-black/40 hover:text-black/60"
              }`}
            >
              Trace Analytics
            </button>
            <button
              onClick={() => setActiveTab("qr")}
              className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
                activeTab === "qr"
                  ? "border-black text-black"
                  : "border-transparent text-black/40 hover:text-black/60"
              }`}
            >
              QR Evaluation
            </button>
            <button
              onClick={() => setActiveTab("rlhf")}
              className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
                activeTab === "rlhf"
                  ? "border-black text-black"
                  : "border-transparent text-black/40 hover:text-black/60"
              }`}
            >
              RLHF Grading
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
                activeTab === "analytics"
                  ? "border-black text-black"
                  : "border-transparent text-black/40 hover:text-black/60"
              }`}
            >
              Analytics & Comparison
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "traces" && <TraceDashboard />}
        {activeTab === "qr" && <QREvaluation />}
        {activeTab === "rlhf" && <RLHFGrading datasetGrades={gradeData} />}
        {activeTab === "analytics" && <AnalyticsComparison datasetGrades={gradeData} />}
      </main>
    </div>
  );
}
