"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  AlertCircle,
  Clock,
  FileDown,
  Loader2,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";

import type {
  CsvRow,
  TraceDetail,
  TraceRecord,
  TraceStore,
  TraceStoreMenuItem,
} from "@/lib/trace-utils";
import { buildTraceRecords } from "@/lib/trace-utils";

const cn = (...classes: Array<string | undefined | null | false>) =>
  classes.filter(Boolean).join(" ");

const friendlyDaypart = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatDateTime = (value?: string) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const getRangeLabel = (
  timestamps: Array<{ beginning?: string; ending?: string }>,
) => {
  if (!timestamps.length) return "Not available";
  const begins = timestamps
    .map((item) => (item.beginning ? new Date(item.beginning).getTime() : NaN))
    .filter((value) => !Number.isNaN(value));
  const ends = timestamps
    .map((item) => (item.ending ? new Date(item.ending).getTime() : NaN))
    .filter((value) => !Number.isNaN(value));

  if (!begins.length || !ends.length) return "Not available";
  const min = new Date(Math.min(...begins));
  const max = new Date(Math.max(...ends));
  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (formatter.format(min) === formatter.format(max)) {
    return `${formatter.format(min)} • ${min.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })} – ${max.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return `${formatter.format(min)} → ${formatter.format(max)}`;
};

const inferMenuItemName = (item: TraceStoreMenuItem) => {
  if (!item) return "Menu item";
  if (
    typeof item.profile === "object" &&
    item.profile !== null &&
    "identity" in item.profile &&
    typeof (item.profile as Record<string, unknown>).identity === "object"
  ) {
    const identity = (item.profile as { identity?: Record<string, unknown> })
      .identity;
    if (identity?.name && typeof identity.name === "string") {
      return identity.name;
    }
  }
  if ("name" in item && typeof item.name === "string") return item.name;
  return item.item_id ? `Item ${item.item_id}` : "Menu item";
};

const InsightCard = ({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) => (
  <div className="rounded-lg border border-black/10 bg-white p-4">
    <p className="text-xs font-medium uppercase tracking-wider text-black/50">
      {label}
    </p>
    <p className="mt-1 text-2xl font-semibold text-black">
      {value ?? "—"}
    </p>
  </div>
);

const TimelineItem = ({
  title,
  subtitle,
  timestamp,
}: {
  title: string;
  subtitle?: string;
  timestamp?: string;
}) => (
  <div className="relative pl-6 pb-6 last:pb-0">
    <div className="absolute left-0 top-2 h-2 w-2 rounded-full bg-black" />
    <div className="absolute left-[3px] top-4 bottom-0 w-px bg-black/10" />
    <div className="space-y-1">
      <p className="font-semibold text-black">{title}</p>
      {subtitle && (
        <p className="text-sm text-black/60">{subtitle.trim()}</p>
      )}
      {timestamp && (
        <p className="flex items-center gap-1.5 text-xs text-black/40">
          <Clock className="h-3 w-3" /> {formatDateTime(timestamp)}
        </p>
      )}
    </div>
  </div>
);

const StoreCard = ({ store, onDoubleClick }: { store: TraceStore; onDoubleClick?: (store: TraceStore) => void }) => {
  const primaryItems = (store.menu_items ?? []).slice(0, 3);
  return (
    <div
      className="rounded-lg border border-black/10 bg-white p-5 transition hover:border-black/30 cursor-pointer"
      onDoubleClick={() => onDoubleClick?.(store)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-semibold text-black">
            {store.store_name ?? "Unnamed store"}
          </p>
          {store.cuisine && (
            <p className="mt-0.5 text-sm text-black/60">{store.cuisine}</p>
          )}
        </div>
        <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
          {store.eta_minutes ?? "—"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-black/50">Distance</dt>
          <dd className="font-medium text-black">
            {store.distance_miles ? `${Number(store.distance_miles).toFixed(2)} mi` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-black/50">Dietary</dt>
          <dd className="font-medium text-black">
            {store.dietary_options ?? "Standard"}
          </dd>
        </div>
      </dl>

      {primaryItems.length > 0 && (
        <div className="mt-4 rounded border border-black/10 bg-black/[0.02] p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-black/50">
            Menu highlights
          </p>
          <ul className="mt-2 space-y-1 text-sm text-black/80">
            {primaryItems.map((item) => (
              <li key={`${store.business_id}-${item.item_id}`}>
                • {inferMenuItemName(item)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-black/20 bg-black/[0.02] px-6 py-16 text-center">
    <Upload className="h-10 w-10 text-black/30" />
    <p className="mt-4 text-lg font-semibold text-black/80">{message}</p>
    <p className="mt-2 max-w-md text-sm text-black/50">
      Upload a CSV export from your trace pipeline to view conversations and recommendations.
    </p>
  </div>
);

const StoreDetailModal = ({
  store,
  onClose,
}: {
  store: TraceStore;
  onClose: () => void;
}) => {
  const allMenuItems = store.menu_items ?? [];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-white p-6">
          <div>
            <h2 className="text-2xl font-bold text-black">
              {store.store_name ?? "Unnamed Store"}
            </h2>
            {store.cuisine && (
              <p className="mt-1 text-black/60">{store.cuisine}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition hover:bg-black/5"
            aria-label="Close"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Store Details Grid */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-black/10 bg-black/[0.02] p-4">
            <div>
              <dt className="text-sm font-medium text-black/50">Business ID</dt>
              <dd className="mt-1 text-black">{store.business_id ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-black/50">ETA</dt>
              <dd className="mt-1 text-black">{store.eta_minutes ?? "—"} min</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-black/50">Distance</dt>
              <dd className="mt-1 text-black">
                {store.distance_miles
                  ? `${Number(store.distance_miles).toFixed(2)} mi`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-black/50">Dietary Options</dt>
              <dd className="mt-1 text-black">
                {store.dietary_options ?? "Standard"}
              </dd>
            </div>
            {store.address && (
              <div className="col-span-2">
                <dt className="text-sm font-medium text-black/50">Address</dt>
                <dd className="mt-1 text-black">{store.address}</dd>
              </div>
            )}
          </div>

          {/* Full Menu Items */}
          {allMenuItems.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-black mb-3">
                Full Menu ({allMenuItems.length} items)
              </h3>
              <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {allMenuItems.map((item, idx) => (
                    <li
                      key={`${store.business_id}-menu-${idx}`}
                      className="text-sm text-black/80"
                    >
                      • {inferMenuItemName(item)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Raw Store Data */}
          <details className="rounded-lg border border-black/10">
            <summary className="cursor-pointer p-4 font-medium text-black hover:bg-black/[0.02]">
              View Raw Store Data
            </summary>
            <div className="border-t border-black/10 p-4">
              <pre className="overflow-x-auto text-xs text-black/70">
                {JSON.stringify(store, null, 2)}
              </pre>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

const TraceDashboard = () => {
  const [records, setRecords] = useState<TraceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [activeTraceIndex, setActiveTraceIndex] = useState(0);
  const [showAllTraces, setShowAllTraces] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceLabel, setSourceLabel] = useState("Loading demo data…");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedStoreDetail, setSelectedStoreDetail] = useState<TraceStore | null>(null);

  const parseCsv = useCallback(
    (text: string, label: string) => {
      const parsed = Papa.parse<CsvRow>(text, {
        header: true,
        skipEmptyLines: true,
      });

      if (parsed.errors.length) {
        throw new Error(parsed.errors[0].message);
      }

      const nextRecords = buildTraceRecords(parsed.data);
      if (!nextRecords.length) {
        throw new Error("No conversations detected in the CSV.");
      }

      setRecords(nextRecords);
      setSelectedId(nextRecords[0].conversationId);
      setActiveTraceIndex(0);
      setSourceLabel(label);
      setErrorMessage(null);
    },
    [],
  );

  const loadDemo = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/data/om-trace-zesty.csv");
      if (!response.ok) {
        // Demo CSV not available, just show upload prompt
        setSourceLabel("No data loaded");
        setIsLoading(false);
        return;
      }
      const text = await response.text();
      parseCsv(text, "om-trace-zesty.csv");
    } catch (error) {
      console.error(error);
      // Don't show error, just indicate no data loaded
      setSourceLabel("No data loaded");
    } finally {
      setIsLoading(false);
    }
  }, [parseCsv]);

  useEffect(() => {
    loadDemo();
  }, [loadDemo]);

  const selectedRecord = records.find(
    (record) => record.conversationId === selectedId,
  );

  useEffect(() => {
    if (
      selectedRecord &&
      selectedRecord.payload.traces &&
      selectedRecord.payload.traces.length <= activeTraceIndex
    ) {
      setActiveTraceIndex(0);
    }
  }, [selectedRecord, activeTraceIndex]);

  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const term = searchTerm.toLowerCase();
    return records.filter((record) => {
      if (record.conversationId.toLowerCase().includes(term)) return true;
      const consumerId = record.payload.ids?.consumer_id ?? "";
      if (consumerId.toLowerCase().includes(term)) return true;
      const traceMatch = record.payload.traces?.some((trace) =>
        (trace.original_query ?? "").toLowerCase().includes(term),
      );
      if (traceMatch) return true;
      const queryMatch = record.payload.query_log?.some(
        (item) =>
          item.original_query?.toLowerCase().includes(term) ||
          item.rewrites?.some((rewrite) =>
            rewrite.rewritten_query?.toLowerCase().includes(term),
          ),
      );
      return Boolean(queryMatch);
    });
  }, [records, searchTerm]);

  useEffect(() => {
    if (!filteredRecords.length) return;
    if (!selectedId || !filteredRecords.some((r) => r.conversationId === selectedId)) {
      setSelectedId(filteredRecords[0].conversationId);
    }
  }, [filteredRecords, selectedId]);

  const stats = useMemo(() => {
    const totalTraces = records.reduce(
      (sum, record) => sum + (record.payload.trace_count ?? record.traceCount),
      0,
    );
    const timestamps = records
      .map((record) => record.payload.timestamps)
      .filter(Boolean) as Array<{ beginning?: string; ending?: string }>;
    return {
      totalConversations: records.length,
      totalTraces,
      range: getRangeLabel(timestamps),
    };
  }, [records]);

  const consumerProfile = selectedRecord?.payload.consumer_profile;
  const overallProfile =
    consumerProfile?.profile && typeof consumerProfile.profile === "object"
      ? (consumerProfile.profile as Record<string, unknown>)
      : undefined;
  const overallDetails =
    overallProfile &&
    "overall_profile" in overallProfile &&
    typeof overallProfile.overall_profile === "object"
      ? (overallProfile.overall_profile as Record<string, unknown>)
      : undefined;

  const dietaryPreferences =
    overallDetails &&
    "dietary_preferences" in overallDetails &&
    typeof overallDetails.dietary_preferences === "object"
      ? (overallDetails.dietary_preferences as Record<string, unknown>)
      : undefined;

  const activeTrace: TraceDetail | undefined =
    selectedRecord?.payload.traces?.[activeTraceIndex];

  const handleUpload: React.ChangeEventHandler<HTMLInputElement> = async (
    event,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const text = await file.text();
      parseCsv(text, file.name);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to read the file.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const showEmpty =
    !isLoading && (!records.length || !selectedRecord || !filteredRecords.length);

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-black/10 bg-white p-4">
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-black/50">
            Data Source
          </p>
          <p className="mt-0.5 font-semibold text-black">{sourceLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="trace-upload"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleUpload}
          />
          <label
            htmlFor="trace-upload"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80"
          >
            <Upload className="h-4 w-4" /> Upload CSV
          </label>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <InsightCard
          label="Conversations"
          value={stats.totalConversations}
        />
        <InsightCard label="Traces" value={stats.totalTraces} />
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-black/50">
            Activity Window
          </p>
          <p className="mt-1 text-sm font-semibold text-black">{stats.range}</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Sidebar */}
        <div className="space-y-4 lg:col-span-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
            <input
              type="search"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-black/10 bg-white py-2.5 pl-10 pr-4 text-sm text-black placeholder:text-black/40 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>

          <div className="max-h-[600px] space-y-2 overflow-y-auto rounded-lg border border-black/10 bg-white p-3">
            {filteredRecords.map((record) => (
              <button
                key={record.conversationId}
                onClick={() => setSelectedId(record.conversationId)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition",
                  selectedId === record.conversationId
                    ? "border-black bg-black text-white"
                    : "border-black/10 bg-white text-black hover:border-black/30",
                )}
              >
                <p className="text-sm font-semibold">
                  {record.conversationId}
                </p>
                <p className="mt-0.5 text-xs opacity-60">
                  {record.payload.ids?.consumer_id ?? "Unknown"}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs opacity-60">
                  <span>{record.payload.trace_count ?? record.traceCount} traces</span>
                  <span>
                    {formatDateTime(record.payload.timestamps?.ending ?? "")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-6 lg:col-span-8">
          {isLoading && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-black/10 bg-white py-16">
              <Loader2 className="h-6 w-6 animate-spin text-black" />
              <p className="text-sm text-black/60">Loading trace data...</p>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {errorMessage}
            </div>
          )}

          {showEmpty && !errorMessage && (
            <EmptyState message="No conversation selected" />
          )}

          {!showEmpty && selectedRecord && (
            <div className="space-y-6">
              {/* Conversation Header */}
              <div className="rounded-lg border border-black/10 bg-white p-6">
                <div className="mb-4 border-b border-black/10 pb-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                    Conversation
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-black">
                    {selectedRecord.conversationId}
                  </h2>
                  {selectedRecord.payload.ids?.consumer_id && (
                    <p className="mt-1 text-sm text-black/60">
                      Consumer: {selectedRecord.payload.ids.consumer_id}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                      Session ID
                    </p>
                    <p className="mt-1 text-sm font-mono text-black">
                      {selectedRecord.payload.ids?.session_id ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                      Last Updated
                    </p>
                    <p className="mt-1 text-sm text-black">
                      {formatDateTime(selectedRecord.payload.timestamps?.ending ?? "")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Consumer Profile */}
              {overallDetails && (
                <div className="rounded-lg border border-black/10 bg-white p-6">
                  <h3 className="mb-4 text-lg font-bold text-black">Consumer Profile</h3>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                        Cuisine Preferences
                      </p>
                      <p className="mt-2 text-sm text-black">
                        {(overallDetails.cuisine_preferences as string) ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                        Meal Tendencies
                      </p>
                      <p className="mt-2 text-sm text-black">
                        {(overallDetails.food_preferences as string) ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                        Price Sensitivity
                      </p>
                      <p className="mt-2 text-sm text-black">
                        {(overallDetails.price_sensitivity as string) ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                        Reordering Pattern
                      </p>
                      <p className="mt-2 text-sm text-black">
                        {(overallDetails.reordering_tendency as string) ?? "—"}
                      </p>
                    </div>
                  </div>

                  {dietaryPreferences && (
                    <div className="mt-4 rounded-lg border border-black/10 bg-black/[0.02] p-4">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-black/50">
                        Dietary Profile
                      </p>
                      <dl className="grid gap-3 md:grid-cols-3">
                        {Object.entries(dietaryPreferences).map(([key, value]) => (
                          <div key={key}>
                            <dt className="text-xs text-black/50">
                              {friendlyDaypart(key)}
                            </dt>
                            <dd className="mt-0.5 text-sm font-medium text-black">
                              {String(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </div>
              )}

              {/* Daypart Breakdown */}
              {consumerProfile?.breakdown && (
                <div className="rounded-lg border border-black/10 bg-white p-6">
                  <h3 className="mb-4 text-lg font-bold text-black">Daypart Analysis</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {Object.entries(consumerProfile.breakdown).map(([key, value]) => {
                      const detail =
                        typeof value === "object" && value !== null
                          ? (value as Record<string, unknown>)
                          : {};
                      return (
                        <div
                          key={key}
                          className="rounded-lg border border-black/10 bg-black/[0.02] p-4"
                        >
                          <p className="font-semibold text-black">
                            {friendlyDaypart(key)}
                          </p>
                          <p className="mt-1 text-xs text-black/50">
                            {detail.cuisine_preferences ? String(detail.cuisine_preferences) : "—"}
                          </p>
                          <p className="mt-2 text-sm text-black/80">
                            {detail.food_preferences ? String(detail.food_preferences) : "No data"}
                          </p>
                          {Boolean(detail.lifestyle_summary) && (
                            <p className="mt-2 text-xs text-black/50">
                              {String(detail.lifestyle_summary)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Query Timeline */}
              {selectedRecord.payload.query_log && (
                <div className="rounded-lg border border-black/10 bg-white p-6">
                  <h3 className="mb-4 text-lg font-bold text-black">Query Timeline</h3>
                  <div className="space-y-0">
                    {selectedRecord.payload.query_log.map((entry, index) => (
                      <TimelineItem
                        key={`${entry.trace_id ?? index}-timeline`}
                        title={entry.original_query ?? "Unknown query"}
                        subtitle={
                          entry.rewrites && entry.rewrites.length > 0
                            ? `→ ${entry.rewrites
                                .map((rewrite) => rewrite.rewritten_query)
                                .join(", ")}`
                            : undefined
                        }
                        timestamp={entry.rewrites?.[0]?.timestamp}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Trace Explorer */}
              {selectedRecord.payload.traces && selectedRecord.payload.traces.length > 0 && (
                <div className="rounded-lg border border-black/10 bg-white p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-black">Trace Explorer</h3>
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black">
                        {selectedRecord.payload.traces.length} {selectedRecord.payload.traces.length === 1 ? 'trace' : 'traces'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setShowAllTraces(!showAllTraces)}
                        className={cn(
                          "rounded-lg px-4 py-1.5 text-sm font-medium transition",
                          showAllTraces
                            ? "bg-black text-white"
                            : "border border-black/10 bg-white text-black hover:bg-black/5",
                        )}
                      >
                        {showAllTraces ? "Single View" : "All Traces"}
                      </button>
                      {!showAllTraces && selectedRecord.payload.traces.map((_trace, index) => (
                        <button
                          key={`trace-pill-${index}`}
                          onClick={() => setActiveTraceIndex(index)}
                          className={cn(
                            "rounded-lg px-4 py-1.5 text-sm font-medium transition",
                            activeTraceIndex === index
                              ? "bg-black text-white"
                              : "border border-black/10 bg-white text-black hover:border-black/30",
                          )}
                        >
                          Trace {index + 1}
                        </button>
                      ))}
                    </div>
                  </div>

                  {showAllTraces ? (
                    <div className="space-y-8">
                      {selectedRecord.payload.traces.map((trace, traceIdx) => (
                        <div key={`all-trace-${traceIdx}`} className="relative">
                          {/* Trace Number Badge */}
                          <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
                              {traceIdx + 1}
                            </div>
                            <div className="h-px flex-1 bg-black/10" />
                          </div>

                          {/* Query and Rewrites */}
                          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-1 flex-shrink-0">
                                <Search className="h-5 w-5 text-black/40" />
                              </div>
                              <div className="flex-1 space-y-2">
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                                    Original Query
                                  </p>
                                  <p className="mt-1 text-xl font-semibold text-black">
                                    {trace.original_query || "No query"}
                                  </p>
                                </div>
                                {trace.rewritten_queries && trace.rewritten_queries.length > 0 && (
                                  <div className="border-t border-black/10 pt-2">
                                    <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                                      Rewrites
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      {trace.rewritten_queries.map((rewrite, rwIdx) => (
                                        <span
                                          key={`rw-${traceIdx}-${rwIdx}`}
                                          className="rounded-md border border-black/10 bg-white px-3 py-1 text-sm text-black"
                                        >
                                          {rewrite.rewritten_query}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Store Recommendations */}
                          {trace.store_recommendations && trace.store_recommendations.length > 0 && (
                            <div className="mt-4 space-y-4">
                              {trace.store_recommendations
                                .sort((a, b) => (a.carousel_index ?? 0) - (b.carousel_index ?? 0))
                                .map((carousel, carIdx) => (
                                  <div key={`carousel-${traceIdx}-${carIdx}`} className="rounded-lg border border-black/5 bg-black/[0.01] p-4">
                                    <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-black">
                                      <span className="rounded bg-black/10 px-2 py-0.5">
                                        Row {carousel.carousel_index ?? carIdx}
                                      </span>
                                      <span className="text-black/40">
                                        {carousel.stores?.length || 0} stores
                                      </span>
                                    </p>
                                    <div className="overflow-x-auto">
                                      <div className="flex gap-4 pb-2" style={{ minWidth: 'min-content' }}>
                                        {(carousel.stores ?? []).map((store, storeIdx) => (
                                          <div key={`${traceIdx}-${carIdx}-${storeIdx}-${store.business_id}`} className="w-80 flex-shrink-0">
                                            <StoreCard
                                              store={store}
                                              onDoubleClick={setSelectedStoreDetail}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}

                          {/* Divider between traces */}
                          {selectedRecord.payload.traces && traceIdx < selectedRecord.payload.traces.length - 1 && (
                            <div className="mt-8 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-black/30">
                              <div className="h-px flex-1 bg-black/10" />
                              <span>Follow-up Trace</span>
                              <div className="h-px flex-1 bg-black/10" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : activeTrace ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                          Original Query
                        </p>
                        <p className="mt-2 text-xl font-semibold text-black">
                          {activeTrace.original_query}
                        </p>
                        {activeTrace.rewritten_queries &&
                          activeTrace.rewritten_queries.length > 0 && (
                            <div className="mt-3 border-t border-black/10 pt-3">
                              <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                                Rewrites
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {activeTrace.rewritten_queries.map((rewrite, idx) => (
                                  <span
                                    key={`rewrite-${idx}`}
                                    className="rounded-md border border-black/10 bg-white px-3 py-1 text-sm text-black"
                                  >
                                    {rewrite.rewritten_query}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>

                      {activeTrace.store_recommendations && activeTrace.store_recommendations.length > 0 && (
                        <div className="space-y-4">
                          {activeTrace.store_recommendations
                            .sort((a, b) => (a.carousel_index ?? 0) - (b.carousel_index ?? 0))
                            .map((carousel, carIdx) => (
                              <div key={`carousel-${carIdx}`} className="rounded-lg border border-black/5 bg-black/[0.01] p-4">
                                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-black">
                                  <span className="rounded bg-black/10 px-2 py-0.5">
                                    Row {carousel.carousel_index ?? carIdx}
                                  </span>
                                  <span className="text-black/40">
                                    {carousel.stores?.length || 0} stores
                                  </span>
                                </p>
                                <div className="overflow-x-auto">
                                  <div className="flex gap-4 pb-2" style={{ minWidth: 'min-content' }}>
                                    {(carousel.stores ?? []).map((store, storeIdx) => (
                                      <div key={`${carIdx}-${storeIdx}-${store.business_id}`} className="w-80 flex-shrink-0">
                                        <StoreCard
                                          store={store}
                                          onDoubleClick={setSelectedStoreDetail}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyState message="Select a trace to view details" />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Store Detail Modal */}
      {selectedStoreDetail && (
        <StoreDetailModal
          store={selectedStoreDetail}
          onClose={() => setSelectedStoreDetail(null)}
        />
      )}
    </div>
  );
};

export default TraceDashboard;
