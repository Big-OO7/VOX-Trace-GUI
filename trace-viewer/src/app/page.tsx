"use client";

import { useState } from "react";
import TraceDashboard from "@/components/trace-dashboard";
import EvalResultsViewer from "@/components/eval-results-viewer";
import { BarChart3, Database } from "lucide-react";

const cn = (...classes: Array<string | undefined | null | false>) =>
  classes.filter(Boolean).join(" ");

export default function Home() {
  const [activeTab, setActiveTab] = useState<"traces" | "results">("traces");

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-7xl px-6 py-12">
        <header className="mb-12 border-b border-black/10 pb-12">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-black/50">
              VOX Trace Observatory
            </p>
            <h1 className="text-5xl font-bold tracking-tight text-black">
              Trace Analytics
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-black/60">
              Analyze trace data from Om Trace CSV exports with consumer profiles,
              query rewrites, and recommendation insights.
            </p>
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

        {activeTab === "traces" ? <TraceDashboard /> : <EvalResultsViewer />}
      </main>
    </div>
  );
}
