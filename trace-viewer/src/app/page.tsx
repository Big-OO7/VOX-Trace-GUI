import TraceDashboard from "@/components/trace-dashboard";

export default function Home() {
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
        </header>

        <TraceDashboard />
      </main>
    </div>
  );
}
