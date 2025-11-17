"use client";

import { useCallback, useState, useMemo, useEffect } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileJson,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Upload,
  XCircle,
} from "lucide-react";

// Types for evaluation results
interface StoreEvaluation {
  store_id: string;
  evaluation?: {
    intent_match: {
      q1_menu_matches_query_intent: string;
      q2_covers_all_modifiers: string;
    };
    constraints: {
      q3_price_limit_met: string;
      q4_location_within_range: string;
      q5_speed_requirement_met: string;
      q6_quality_rating_met: string;
      q7_dietary_need_met: string;
    };
    personalization: {
      q8_matches_customer_preferences: string;
      q9_avoids_customer_hard_avoids: string;
    };
    reasoning: Record<string, string>;
  };
  score_pct: number;
  intent_match_score: number;
  is_relevant: boolean;
  answers: Record<string, string>;
  error?: string;
}

interface TraceEvaluation {
  trace_id: string;
  query: string;
  intent_category: string;
  q8_weight: number;
  num_stores_evaluated?: number;
  avg_satisfaction_score?: number;
  avg_intent_match_score?: number;
  irrelevance_rate?: number;
  ndcg?: number;
  store_evaluations?: StoreEvaluation[];
  error?: string;
}

interface ConversationResult {
  conversation_id: string;
  num_traces: number;
  avg_satisfaction_score?: number;
  avg_irrelevance_rate?: number;
  avg_ndcg?: number;
  trace_evaluations?: TraceEvaluation[];
  error?: string;
}

interface EvalResults {
  metadata: {
    input_file: string;
    num_conversations: number;
    num_valid: number;
    avg_satisfaction_score: number;
    avg_irrelevance_rate: number;
    avg_ndcg: number;
  };
  results: ConversationResult[];
}

const cn = (...classes: Array<string | undefined | null | false>) =>
  classes.filter(Boolean).join(" ");

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
};

const getScoreBgColor = (score: number) => {
  if (score >= 80) return "bg-green-50 border-green-200";
  if (score >= 60) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
};

const AnswerBadge = ({ answer }: { answer: string }) => {
  const normalized = answer.toUpperCase();
  if (normalized === "YES") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Yes
      </span>
    );
  }
  if (normalized === "NO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        <XCircle className="h-3 w-3" /> No
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      N/A
    </span>
  );
};

const MetricCard = ({
  label,
  value,
  icon: Icon,
  suffix = "",
  colorize = false,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  suffix?: string;
  colorize?: boolean;
}) => (
  <div className="rounded-lg border border-black/10 bg-white p-4">
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-black/40" />
      <p className="text-xs font-medium uppercase tracking-wider text-black/50">
        {label}
      </p>
    </div>
    <p
      className={cn(
        "mt-2 text-2xl font-bold",
        colorize && typeof value === "number" ? getScoreColor(value) : "text-black"
      )}
    >
      {typeof value === "number" ? value.toFixed(2) : value}
      {suffix}
    </p>
  </div>
);

const StoreEvaluationCard = ({ store }: { store: StoreEvaluation }) => {
  const [expanded, setExpanded] = useState(false);

  if (store.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-700">
          Store {store.store_id}: {store.error}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition",
        getScoreBgColor(store.score_pct)
      )}
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-black/40" />
          ) : (
            <ChevronRight className="h-4 w-4 text-black/40" />
          )}
          <div>
            <p className="font-medium text-black">Store {store.store_id}</p>
            <div className="mt-1 flex items-center gap-3 text-sm">
              <span className={cn("font-semibold", getScoreColor(store.score_pct))}>
                {store.score_pct.toFixed(1)}%
              </span>
              <span className="text-black/50">|</span>
              <span className="text-black/60">
                Intent: {store.intent_match_score.toFixed(1)}%
              </span>
              {!store.is_relevant && (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                  Irrelevant
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {expanded && store.evaluation && (
        <div className="mt-4 space-y-4 border-t border-black/10 pt-4">
          {/* Q1-Q9 Answers Grid */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/50">
                Intent Match
              </p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>Q1 Menu Match</span>
                  <AnswerBadge answer={store.answers.q1} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Q2 All Modifiers</span>
                  <AnswerBadge answer={store.answers.q2} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/50">
                Constraints
              </p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>Q3 Price</span>
                  <AnswerBadge answer={store.answers.q3} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Q4 Location</span>
                  <AnswerBadge answer={store.answers.q4} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Q5 Speed</span>
                  <AnswerBadge answer={store.answers.q5} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Q6 Quality</span>
                  <AnswerBadge answer={store.answers.q6} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Q7 Dietary</span>
                  <AnswerBadge answer={store.answers.q7} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/50">
                Personalization
              </p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>Q8 Preferences</span>
                  <AnswerBadge answer={store.answers.q8} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Q9 Hard Avoids</span>
                  <AnswerBadge answer={store.answers.q9} />
                </div>
              </div>
            </div>
          </div>

          {/* Reasoning */}
          <details className="rounded-lg border border-black/10">
            <summary className="cursor-pointer p-3 text-sm font-medium text-black hover:bg-black/[0.02]">
              View Reasoning
            </summary>
            <div className="border-t border-black/10 p-3 space-y-2">
              {Object.entries(store.evaluation.reasoning).map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs font-semibold uppercase text-black/50">
                    {key.toUpperCase()}
                  </p>
                  <p className="mt-1 text-sm text-black/70">{value}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

const TraceEvaluationCard = ({ trace }: { trace: TraceEvaluation }) => {
  const [expanded, setExpanded] = useState(false);

  if (trace.error && !trace.store_evaluations) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-700">{trace.query}</p>
        <p className="mt-1 text-sm text-red-600">{trace.error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 bg-white">
      <div
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-black/40" />
          ) : (
            <ChevronRight className="h-5 w-5 text-black/40" />
          )}
          <div>
            <p className="font-semibold text-black">&quot;{trace.query}&quot;</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/70">
                {trace.intent_category}
              </span>
              <span className="text-black/40">|</span>
              <span className="text-black/60">
                Q8 Weight: {trace.q8_weight}
              </span>
              <span className="text-black/40">|</span>
              <span className="text-black/60">
                {trace.num_stores_evaluated} stores
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "text-lg font-bold",
              trace.avg_satisfaction_score
                ? getScoreColor(trace.avg_satisfaction_score)
                : "text-black"
            )}
          >
            {trace.avg_satisfaction_score?.toFixed(1)}%
          </p>
          <p className="text-xs text-black/50">satisfaction</p>
        </div>
      </div>

      {expanded && trace.store_evaluations && (
        <div className="border-t border-black/10 p-4 space-y-4">
          {/* Trace Metrics */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-black/[0.02] p-3">
              <p className="text-xs font-medium text-black/50">Intent Match</p>
              <p
                className={cn(
                  "mt-1 text-xl font-bold",
                  trace.avg_intent_match_score
                    ? getScoreColor(trace.avg_intent_match_score)
                    : "text-black"
                )}
              >
                {trace.avg_intent_match_score?.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg bg-black/[0.02] p-3">
              <p className="text-xs font-medium text-black/50">Irrelevance Rate</p>
              <p
                className={cn(
                  "mt-1 text-xl font-bold",
                  trace.irrelevance_rate !== undefined
                    ? trace.irrelevance_rate < 20
                      ? "text-green-600"
                      : trace.irrelevance_rate < 40
                      ? "text-yellow-600"
                      : "text-red-600"
                    : "text-black"
                )}
              >
                {trace.irrelevance_rate?.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg bg-black/[0.02] p-3">
              <p className="text-xs font-medium text-black/50">NDCG</p>
              <p className="mt-1 text-xl font-bold text-black">
                {trace.ndcg?.toFixed(4)}
              </p>
            </div>
          </div>

          {/* Store Evaluations */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-black">
              Store Evaluations ({trace.store_evaluations.length})
            </p>
            {trace.store_evaluations.map((store, idx) => (
              <StoreEvaluationCard key={`${store.store_id}-${idx}`} store={store} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ConversationResultCard = ({ result }: { result: ConversationResult }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-black/10 bg-white">
      <div
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-black/40" />
          ) : (
            <ChevronRight className="h-5 w-5 text-black/40" />
          )}
          <div>
            <p className="font-semibold text-black">{result.conversation_id}</p>
            <p className="mt-0.5 text-sm text-black/60">
              {result.num_traces} traces
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {result.error ? (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              Error
            </span>
          ) : (
            <>
              <div className="text-right">
                <p
                  className={cn(
                    "text-lg font-bold",
                    result.avg_satisfaction_score
                      ? getScoreColor(result.avg_satisfaction_score)
                      : "text-black"
                  )}
                >
                  {result.avg_satisfaction_score?.toFixed(1)}%
                </p>
                <p className="text-xs text-black/50">satisfaction</p>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    "text-lg font-bold",
                    result.avg_irrelevance_rate !== undefined
                      ? result.avg_irrelevance_rate < 20
                        ? "text-green-600"
                        : result.avg_irrelevance_rate < 40
                        ? "text-yellow-600"
                        : "text-red-600"
                      : "text-black"
                  )}
                >
                  {result.avg_irrelevance_rate?.toFixed(1)}%
                </p>
                <p className="text-xs text-black/50">irrelevance</p>
              </div>
            </>
          )}
        </div>
      </div>

      {expanded && result.trace_evaluations && (
        <div className="border-t border-black/10 p-4 space-y-3">
          {result.trace_evaluations.map((trace, idx) => (
            <TraceEvaluationCard key={`${trace.trace_id}-${idx}`} trace={trace} />
          ))}
        </div>
      )}
    </div>
  );
};

const DistributionChart = ({
  results,
  metric,
  label,
}: {
  results: ConversationResult[];
  metric: "avg_satisfaction_score" | "avg_irrelevance_rate";
  label: string;
}) => {
  const buckets = useMemo(() => {
    const ranges = [
      { min: 0, max: 20, label: "0-20" },
      { min: 20, max: 40, label: "20-40" },
      { min: 40, max: 60, label: "40-60" },
      { min: 60, max: 80, label: "60-80" },
      { min: 80, max: 100, label: "80-100" },
    ];

    const counts = ranges.map((range) => ({
      ...range,
      count: results.filter((r) => {
        const value = r[metric];
        if (value === undefined) return false;
        return value >= range.min && value < range.max;
      }).length,
    }));

    // Handle 100% case
    const lastBucket = counts[counts.length - 1];
    lastBucket.count += results.filter((r) => r[metric] === 100).length;

    const maxCount = Math.max(...counts.map((b) => b.count));
    return counts.map((b) => ({
      ...b,
      percentage: maxCount > 0 ? (b.count / maxCount) * 100 : 0,
    }));
  }, [results, metric]);

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <p className="mb-4 text-sm font-semibold text-black">{label}</p>
      <div className="space-y-2">
        {buckets.map((bucket) => (
          <div key={bucket.label} className="flex items-center gap-3">
            <span className="w-16 text-xs text-black/60">{bucket.label}%</span>
            <div className="flex-1 h-6 bg-black/5 rounded overflow-hidden">
              <div
                className={cn(
                  "h-full rounded transition-all",
                  metric === "avg_satisfaction_score"
                    ? "bg-green-500"
                    : "bg-red-500"
                )}
                style={{ width: `${bucket.percentage}%` }}
              />
            </div>
            <span className="w-10 text-right text-xs font-medium text-black">
              {bucket.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const EvalResultsViewer = () => {
  const [results, setResults] = useState<EvalResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"id" | "satisfaction" | "irrelevance">("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sourceLabel, setSourceLabel] = useState("No data loaded");

  const loadResultsFromFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as EvalResults;

      if (!data.metadata || !data.results) {
        throw new Error("Invalid evaluation results format");
      }

      setResults(data);
      setSourceLabel(file.name);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load results"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDefaultResults = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/data/fuzzy_query_eval_results.json");
      if (!response.ok) {
        throw new Error("Unable to fetch default results");
      }
      const data = await response.json() as EvalResults;

      if (!data.metadata || !data.results) {
        throw new Error("Invalid evaluation results format");
      }

      setResults(data);
      setSourceLabel("fuzzy_query_eval_results.json");
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load default results"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-load default results on mount
  useEffect(() => {
    loadDefaultResults();
  }, [loadDefaultResults]);

  const handleUpload: React.ChangeEventHandler<HTMLInputElement> = async (
    event
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadResultsFromFile(file);
  };

  const filteredAndSortedResults = useMemo(() => {
    if (!results) return [];

    let filtered = results.results;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((r) => {
        if (r.conversation_id.toLowerCase().includes(term)) return true;
        if (
          r.trace_evaluations?.some((t) =>
            t.query.toLowerCase().includes(term)
          )
        )
          return true;
        return false;
      });
    }

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "satisfaction":
          comparison =
            (a.avg_satisfaction_score ?? 0) - (b.avg_satisfaction_score ?? 0);
          break;
        case "irrelevance":
          comparison =
            (a.avg_irrelevance_rate ?? 0) - (b.avg_irrelevance_rate ?? 0);
          break;
        default:
          comparison = a.conversation_id.localeCompare(b.conversation_id);
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [results, searchTerm, sortBy, sortOrder]);

  if (!results) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-black/20 bg-black/[0.02] px-6 py-16 text-center">
          <FileJson className="h-12 w-12 text-black/30" />
          <p className="mt-4 text-lg font-semibold text-black/80">
            Upload Evaluation Results
          </p>
          <p className="mt-2 max-w-md text-sm text-black/50">
            Upload a JSON file containing fuzzy query evaluation results to view
            detailed metrics, scores, and analysis.
          </p>

          <input
            id="eval-upload"
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleUpload}
          />
          <label
            htmlFor="eval-upload"
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-black/80"
          >
            <Upload className="h-4 w-4" /> Select JSON File
          </label>

          {isLoading && (
            <div className="mt-4 flex items-center gap-2 text-black/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading results...</span>
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Data Source */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-black/10 bg-white p-4">
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-black/50">
            Data Source
          </p>
          <p className="mt-0.5 font-semibold text-black">{sourceLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="eval-upload-header"
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleUpload}
          />
          <label
            htmlFor="eval-upload-header"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black hover:text-white"
          >
            <Upload className="h-4 w-4" /> Upload JSON
          </label>
          <button
            type="button"
            onClick={loadDefaultResults}
            className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black hover:text-white"
          >
            <RefreshCw className="h-4 w-4" /> Reload Default
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Conversations"
          value={results.metadata.num_conversations}
          icon={BarChart3}
        />
        <MetricCard
          label="Avg Satisfaction"
          value={results.metadata.avg_satisfaction_score}
          icon={TrendingUp}
          suffix="%"
          colorize
        />
        <MetricCard
          label="Irrelevance Rate"
          value={results.metadata.avg_irrelevance_rate}
          icon={Target}
          suffix="%"
          colorize
        />
        <MetricCard
          label="Avg NDCG"
          value={results.metadata.avg_ndcg}
          icon={BarChart3}
        />
      </div>

      {/* Distribution Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <DistributionChart
          results={results.results}
          metric="avg_satisfaction_score"
          label="Satisfaction Score Distribution"
        />
        <DistributionChart
          results={results.results}
          metric="avg_irrelevance_rate"
          label="Irrelevance Rate Distribution"
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-black/10 bg-white p-4">
        <div className="flex-1">
          <input
            type="search"
            placeholder="Search conversations or queries..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-black/10 bg-white px-4 py-2 text-sm placeholder:text-black/40 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "id" | "satisfaction" | "irrelevance")
            }
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
          >
            <option value="id">Sort by ID</option>
            <option value="satisfaction">Sort by Satisfaction</option>
            <option value="irrelevance">Sort by Irrelevance</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            {sortOrder === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-black/60">
            Showing {filteredAndSortedResults.length} of {results.results.length}{" "}
            conversations
          </p>
        </div>

        <div className="space-y-3">
          {filteredAndSortedResults.map((result) => (
            <ConversationResultCard
              key={result.conversation_id}
              result={result}
            />
          ))}
        </div>

        {filteredAndSortedResults.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-black/20 bg-black/[0.02] py-12 text-center">
            <AlertCircle className="h-8 w-8 text-black/30" />
            <p className="mt-3 text-sm text-black/60">
              No conversations match your search
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EvalResultsViewer;
