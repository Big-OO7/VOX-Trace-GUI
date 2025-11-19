"use client";

import { useCallback, useState, useMemo, useEffect } from "react";
import Papa from "papaparse";
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
  AlertTriangle,
} from "lucide-react";

// Types for TWO-PRONGED evaluation results
interface FuzzyEvaluation {
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

interface StructuredEvaluation {
  store_id: string;
  evaluation?: {
    main_dish_cuisine: {
      c1_serves_dish_or_cuisine: string;
      c2_primary_focus_3plus_items: string;
      c3_primary_offering_in_profile: string;
    };
    dietary_restrictions: {
      c4_meets_dietary_with_dish: string;
    };
    store_name: {
      c5_exact_store_match: string;
      c6_similar_store_cuisine: string;
    };
    flavor: {
      c7_has_dish_with_flavor: string;
    };
    prep_style: {
      c8_has_dish_with_prep_style: string;
    };
    portion: {
      c9_large_portions_in_reviews: string;
    };
    group: {
      c10_offers_large_quantities: string;
    };
    ingredients: {
      c11_has_dish_with_ingredients: string;
    };
    location: {
      c12_within_2_miles: string;
    };
    speed: {
      c13_meets_speed_requirement: string;
    };
    quality: {
      c14_good_ratings: string;
    };
    price: {
      c15_meets_price_requirement: string;
    };
    deals: {
      c16_has_relevant_deals: string;
    };
    store_open: {
      c17_is_store_open: string;
    };
    store_rating: {
      c18_rating_above_4_5: string;
    };
    all_modifiers: {
      c19_matches_all_modifiers: string;
    };
    reasoning: Record<string, string>;
  };
  score_pct: number;
  critical_failures: string[];
  answers: Record<string, string>;
  error?: string;
}

interface StoreEvaluation {
  store_id: string;
  fuzzy_evaluation: FuzzyEvaluation;
  structured_evaluation: StructuredEvaluation;
  combined_score: number;
}

interface TraceEvaluation {
  trace_id: string;
  fuzzy_query: string;
  structured_query: string;
  intent_category: string;
  q8_weight: number;
  num_stores_evaluated?: number;
  avg_fuzzy_score?: number;
  avg_structured_score?: number;
  avg_combined_score?: number;
  ndcg_fuzzy?: number;
  ndcg_structured?: number;
  ndcg_combined?: number;
  store_evaluations?: StoreEvaluation[];
  error?: string;
}

interface ConversationResult {
  conversation_id: string;
  num_traces: number;
  avg_fuzzy_score?: number;
  avg_structured_score?: number;
  avg_combined_score?: number;
  avg_ndcg_fuzzy?: number;
  avg_ndcg_structured?: number;
  avg_ndcg_combined?: number;
  trace_evaluations?: TraceEvaluation[];
  error?: string;
}

interface EvalResults {
  metadata: {
    input_file: string;
    num_conversations: number;
    num_valid: number;
    evaluation_type: string;
    avg_fuzzy_score: number;
    avg_structured_score: number;
    avg_combined_score: number;
    avg_ndcg_fuzzy: number;
    avg_ndcg_structured: number;
    avg_ndcg_combined: number;
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

const StoreEvaluationCard = ({ store, storeName }: { store: StoreEvaluation; storeName?: string }) => {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"fuzzy" | "structured" | "both">("both");

  const hasCriticalFailures = store.structured_evaluation.critical_failures?.length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition",
        getScoreBgColor(store.combined_score)
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
            <p className="font-medium text-black">
              {storeName ? (
                <>
                  {storeName}
                  <span className="ml-2 text-sm font-normal text-black/50">#{store.store_id}</span>
                </>
              ) : (
                `Store ${store.store_id}`
              )}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className={cn("font-semibold", getScoreColor(store.combined_score))}>
                Combined: {store.combined_score.toFixed(1)}%
              </span>
              <span className="text-black/50">|</span>
              <span className="text-blue-600">
                Fuzzy: {store.fuzzy_evaluation.score_pct.toFixed(1)}%
              </span>
              <span className="text-purple-600">
                Structured: {store.structured_evaluation.score_pct.toFixed(1)}%
              </span>
              {hasCriticalFailures && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                  <AlertTriangle className="h-3 w-3" /> Critical Issues
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-black/10 pt-4">
          {/* View Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("both")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                viewMode === "both"
                  ? "bg-black text-white"
                  : "border border-black/10 bg-white text-black hover:bg-black/5"
              )}
            >
              Both
            </button>
            <button
              onClick={() => setViewMode("fuzzy")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                viewMode === "fuzzy"
                  ? "bg-blue-600 text-white"
                  : "border border-black/10 bg-white text-black hover:bg-black/5"
              )}
            >
              Fuzzy (9 Questions)
            </button>
            <button
              onClick={() => setViewMode("structured")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                viewMode === "structured"
                  ? "bg-purple-600 text-white"
                  : "border border-black/10 bg-white text-black hover:bg-black/5"
              )}
            >
              Structured (19 Criteria)
            </button>
          </div>

          {/* Critical Failures Warning */}
          {hasCriticalFailures && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
                <AlertTriangle className="h-4 w-4" /> Critical Failures:
              </p>
              <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-red-600">
                {store.structured_evaluation.critical_failures.map((failure, idx) => (
                  <li key={idx}>{failure}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Fuzzy Evaluation (Q1-Q9) */}
          {(viewMode === "fuzzy" || viewMode === "both") && store.fuzzy_evaluation.evaluation && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="mb-3 text-sm font-bold text-blue-900">
                Fuzzy Query Evaluation (Q1-Q9)
              </h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                    Intent Match
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>Q1 Menu Match</span>
                      <AnswerBadge answer={store.fuzzy_evaluation.answers.q1} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Q2 All Modifiers</span>
                      <AnswerBadge answer={store.fuzzy_evaluation.answers.q2} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                    Constraints
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>Q3 Price</span>
                      <AnswerBadge answer={store.fuzzy_evaluation.answers.q3} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Q4 Location</span>
                      <AnswerBadge answer={store.fuzzy_evaluation.answers.q4} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Q5 Speed</span>
                      <AnswerBadge answer={store.fuzzy_evaluation.answers.q5} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Q6 Quality</span>
                      <AnswerBadge answer={store.fuzzy_evaluation.answers.q6} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Q7 Dietary</span>
                      <AnswerBadge answer={store.fuzzy_evaluation.answers.q7} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                    Personalization
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>Q8 Preferences</span>
                      <AnswerBadge answer={store.fuzzy_evaluation.answers.q8} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Q9 Hard Avoids</span>
                      <AnswerBadge answer={store.fuzzy_evaluation.answers.q9} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Structured Evaluation (C1-C19) */}
          {(viewMode === "structured" || viewMode === "both") && store.structured_evaluation.evaluation && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
              <h4 className="mb-3 text-sm font-bold text-purple-900">
                Structured Query Evaluation (C1-C19)
              </h4>
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                {Object.entries(store.structured_evaluation.answers).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded bg-white/50 px-2 py-1">
                    <span className="font-medium">{key.toUpperCase()}</span>
                    <AnswerBadge answer={value} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reasoning */}
          <details className="rounded-lg border border-black/10">
            <summary className="cursor-pointer p-3 text-sm font-medium text-black hover:bg-black/[0.02]">
              View Detailed Reasoning
            </summary>
            <div className="border-t border-black/10 p-3 space-y-4">
              {viewMode !== "structured" && store.fuzzy_evaluation.evaluation && (
                <div>
                  <h5 className="mb-2 text-sm font-bold text-blue-900">Fuzzy Evaluation Reasoning</h5>
                  <div className="space-y-2">
                    {Object.entries(store.fuzzy_evaluation.evaluation.reasoning).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs font-semibold uppercase text-black/50">
                          {key.toUpperCase()}
                        </p>
                        <p className="mt-1 text-sm text-black/70">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {viewMode !== "fuzzy" && store.structured_evaluation.evaluation && (
                <div>
                  <h5 className="mb-2 text-sm font-bold text-purple-900">Structured Evaluation Reasoning</h5>
                  <div className="space-y-2">
                    {Object.entries(store.structured_evaluation.evaluation.reasoning).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs font-semibold uppercase text-black/50">
                          {key.toUpperCase()}
                        </p>
                        <p className="mt-1 text-sm text-black/70">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

const TraceEvaluationCard = ({ trace, storeNames }: { trace: TraceEvaluation; storeNames: Map<string, string> }) => {
  const [expanded, setExpanded] = useState(false);

  if (trace.error && !trace.store_evaluations) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-700">{trace.fuzzy_query}</p>
        <p className="mt-1 text-sm text-red-600">{trace.error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 bg-white p-5">
      <div
        className="flex cursor-pointer items-start justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-black/40" />
            ) : (
              <ChevronRight className="h-4 w-4 text-black/40" />
            )}
            <div>
              <p className="font-semibold text-black">{trace.fuzzy_query}</p>
              <p className="text-sm text-black/60">→ {trace.structured_query}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs">
                  {trace.intent_category}
                </span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  Q8 Weight: {trace.q8_weight}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="ml-4 text-right">
          <p className="text-sm font-medium text-black/50">
            {trace.num_stores_evaluated || 0} stores
          </p>
          <div className="mt-1 space-y-0.5 text-xs">
            <p className="text-black/60">
              Fuzzy: {trace.avg_fuzzy_score?.toFixed(1) || "—"}% | NDCG: {trace.ndcg_fuzzy?.toFixed(4) || "—"}
            </p>
            <p className="text-black/60">
              Structured: {trace.avg_structured_score?.toFixed(1) || "—"}% | NDCG: {trace.ndcg_structured?.toFixed(4) || "—"}
            </p>
            <p className="font-medium text-black">
              Combined: {trace.avg_combined_score?.toFixed(1) || "—"}% | NDCG: {trace.ndcg_combined?.toFixed(4) || "—"}
            </p>
          </div>
        </div>
      </div>

      {expanded && trace.store_evaluations && (
        <div className="mt-4 space-y-3 border-t border-black/10 pt-4">
          {trace.store_evaluations.map((store, idx) => (
            <StoreEvaluationCard
              key={`${store.store_id}-${idx}`}
              store={store}
              storeName={storeNames.get(store.store_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const EvalResultsViewer = () => {
  const [results, setResults] = useState<EvalResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState("Loading results...");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedConvs, setExpandedConvs] = useState<Set<string>>(new Set());
  const [storeNames, setStoreNames] = useState<Map<string, string>>(new Map());

  // Score filtering state
  const [fuzzyMin, setFuzzyMin] = useState<number>(0);
  const [fuzzyMax, setFuzzyMax] = useState<number>(100);
  const [structuredMin, setStructuredMin] = useState<number>(0);
  const [structuredMax, setStructuredMax] = useState<number>(100);
  const [showFilters, setShowFilters] = useState(false);

  const extractStoreNamesFromConversation = (conversation: any, nameMap: Map<string, string>) => {
    const traces = conversation.traces || [];

    traces.forEach((trace: any) => {
      const storeRecs = trace.store_recommendations || [];

      storeRecs.forEach((carousel: any) => {
        const stores = carousel.stores || [];

        stores.forEach((store: any) => {
          const storeId = store.business_id?.toString();
          const storeName = store.store_name;

          if (storeId && storeName && !nameMap.has(storeId)) {
            nameMap.set(storeId, storeName);
          }
        });
      });
    });
  };

  const loadStoreNames = useCallback(async () => {
    const nameMap = new Map<string, string>();

    try {
      // Load from CSV file
      const csvResponse = await fetch("/data/om-trace-zesty.csv");
      if (csvResponse.ok) {
        const csvText = await csvResponse.text();

        await new Promise<void>((resolve) => {
          Papa.parse(csvText, {
            header: true,
            complete: (results) => {
              (results.data as Array<Record<string, unknown>>).forEach((row) => {
                const conversationJson = row.CONVERSATION_JSON as string;
                if (!conversationJson) return;

                try {
                  const conversation = JSON.parse(conversationJson);
                  extractStoreNamesFromConversation(conversation, nameMap);
                } catch (error) {
                  // Skip invalid JSON rows
                }
              });
              resolve();
            },
            error: () => resolve()
          });
        });
      }
    } catch (error) {
      console.warn("Failed to fetch CSV:", error);
    }

    try {
      // Load from sample traces
      const sampleResponse = await fetch("/data/sample_traces.json");
      if (sampleResponse.ok) {
        const sampleData = await sampleResponse.json();
        if (Array.isArray(sampleData)) {
          sampleData.forEach((conversation: any) => {
            extractStoreNamesFromConversation(conversation, nameMap);
          });
        }
      }
    } catch (error) {
      console.warn("Failed to fetch sample traces:", error);
    }

    try {
      // Load from trace manifest to get all chunk files
      const manifestResponse = await fetch("/data/traces/traces_manifest.json");
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        const chunks = manifest.chunks || [];

        // Load all chunk files in parallel
        const chunkPromises = chunks.map(async (chunk: any) => {
          try {
            const filename = chunk.filename || chunk;
            const chunkResponse = await fetch(`/data/traces/${filename}`);
            if (chunkResponse.ok) {
              const chunkData = await chunkResponse.json();
              if (Array.isArray(chunkData)) {
                chunkData.forEach((conversation: any) => {
                  extractStoreNamesFromConversation(conversation, nameMap);
                });
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch chunk ${chunk.filename || chunk}:`, error);
          }
        });

        await Promise.all(chunkPromises);
      }
    } catch (error) {
      console.warn("Failed to fetch trace chunks:", error);
    }

    setStoreNames(nameMap);
  }, []);

  const loadDefaultResults = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/data/two_pronged_eval_results.json");
      if (!response.ok) throw new Error("Unable to fetch evaluation results");
      const data = await response.json() as EvalResults;
      setResults(data);
      setSourceLabel("two_pronged_eval_results.json");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load results");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDefaultResults();
    loadStoreNames();
  }, [loadDefaultResults, loadStoreNames]);

  const handleUpload: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as EvalResults;
      setResults(data);
      setSourceLabel(file.name);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to parse file");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredResults = useMemo(() => {
    if (!results) return [];

    return results.results.filter((conv) => {
      // Score range filtering
      const fuzzyScore = conv.avg_fuzzy_score ?? 0;
      const structuredScore = conv.avg_structured_score ?? 0;

      if (fuzzyScore < fuzzyMin || fuzzyScore > fuzzyMax) return false;
      if (structuredScore < structuredMin || structuredScore > structuredMax) return false;

      // Search term filtering (conversation ID or queries)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        if (conv.conversation_id.toLowerCase().includes(term)) return true;
        const matchesQuery = conv.trace_evaluations?.some(
          (trace) =>
            trace.fuzzy_query.toLowerCase().includes(term) ||
            trace.structured_query.toLowerCase().includes(term)
        );
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [results, searchTerm, fuzzyMin, fuzzyMax, structuredMin, structuredMax]);

  const toggleConversation = (convId: string) => {
    const newSet = new Set(expandedConvs);
    if (newSet.has(convId)) {
      newSet.delete(convId);
    } else {
      newSet.add(convId);
    }
    setExpandedConvs(newSet);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-black/10 bg-white p-4">
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-black/50">
            Evaluation Results
          </p>
          <p className="mt-0.5 font-semibold text-black">{sourceLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadDefaultResults}
            className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black/5"
          >
            <RefreshCw className="h-4 w-4" /> Reload
          </button>
          <input
            id="eval-upload"
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleUpload}
          />
          <label
            htmlFor="eval-upload"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80"
          >
            <Upload className="h-4 w-4" /> Upload JSON
          </label>
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-black/10 bg-white py-16">
          <Loader2 className="h-6 w-6 animate-spin text-black" />
          <p className="text-sm text-black/60">Loading evaluation results...</p>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="font-medium text-red-700">Error</p>
          </div>
          <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
        </div>
      )}

      {results && !isLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Conversations"
              value={results.metadata.num_conversations}
              icon={BarChart3}
            />
            <MetricCard
              label="Valid Evaluations"
              value={results.metadata.num_valid}
              icon={CheckCircle2}
            />
            <MetricCard
              label="Evaluation Type"
              value={results.metadata.evaluation_type}
              icon={Target}
            />
          </div>

          {/* Score Summary */}
          <div className="rounded-lg border border-black/10 bg-white p-6">
            <h3 className="mb-4 text-lg font-bold text-black">Aggregate Scores</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                  Fuzzy Query
                </p>
                <p className="mt-2 text-3xl font-bold text-blue-900">
                  {results.metadata.avg_fuzzy_score.toFixed(2)}%
                </p>
                <p className="mt-1 text-sm text-blue-600">
                  NDCG: {results.metadata.avg_ndcg_fuzzy.toFixed(4)}
                </p>
              </div>
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-purple-700">
                  Structured Query
                </p>
                <p className="mt-2 text-3xl font-bold text-purple-900">
                  {results.metadata.avg_structured_score.toFixed(2)}%
                </p>
                <p className="mt-1 text-sm text-purple-600">
                  NDCG: {results.metadata.avg_ndcg_structured.toFixed(4)}
                </p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
                  Combined
                </p>
                <p className="mt-2 text-3xl font-bold text-green-900">
                  {results.metadata.avg_combined_score.toFixed(2)}%
                </p>
                <p className="mt-1 text-sm text-green-600">
                  NDCG: {results.metadata.avg_ndcg_combined.toFixed(4)}
                </p>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="space-y-3">
            <div className="relative">
              <input
                type="search"
                placeholder="Search by conversation ID or query text..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-white py-2.5 px-4 text-sm text-black placeholder:text-black/40 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black/5"
            >
              <Target className="h-4 w-4" />
              {showFilters ? "Hide Filters" : "Show Score Filters"}
              {showFilters ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>

            {/* Filter Controls */}
            {showFilters && (
              <div className="rounded-lg border border-black/10 bg-white p-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Fuzzy Score Filter */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-blue-700">
                        Fuzzy Score Range
                      </label>
                      <span className="text-sm text-black/60">
                        {fuzzyMin}% - {fuzzyMax}%
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-black/50 w-12">Min:</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={fuzzyMin}
                          onChange={(e) => setFuzzyMin(Number(e.target.value))}
                          className="flex-1"
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={fuzzyMin}
                          onChange={(e) => setFuzzyMin(Number(e.target.value))}
                          className="w-16 rounded border border-black/10 px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-black/50 w-12">Max:</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={fuzzyMax}
                          onChange={(e) => setFuzzyMax(Number(e.target.value))}
                          className="flex-1"
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={fuzzyMax}
                          onChange={(e) => setFuzzyMax(Number(e.target.value))}
                          className="w-16 rounded border border-black/10 px-2 py-1 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Structured Score Filter */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-purple-700">
                        Structured Score Range
                      </label>
                      <span className="text-sm text-black/60">
                        {structuredMin}% - {structuredMax}%
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-black/50 w-12">Min:</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={structuredMin}
                          onChange={(e) => setStructuredMin(Number(e.target.value))}
                          className="flex-1"
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={structuredMin}
                          onChange={(e) => setStructuredMin(Number(e.target.value))}
                          className="w-16 rounded border border-black/10 px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-black/50 w-12">Max:</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={structuredMax}
                          onChange={(e) => setStructuredMax(Number(e.target.value))}
                          className="flex-1"
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={structuredMax}
                          onChange={(e) => setStructuredMax(Number(e.target.value))}
                          className="w-16 rounded border border-black/10 px-2 py-1 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="space-y-2 border-t border-black/10 pt-3">
                  <p className="text-xs font-medium text-black/50">Quick Filters:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setFuzzyMin(80);
                        setFuzzyMax(100);
                        setStructuredMin(80);
                        setStructuredMax(100);
                      }}
                      className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
                    >
                      High Performers (80%+)
                    </button>
                    <button
                      onClick={() => {
                        setFuzzyMin(0);
                        setFuzzyMax(50);
                        setStructuredMin(0);
                        setStructuredMax(50);
                      }}
                      className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
                    >
                      Low Performers (&lt;50%)
                    </button>
                    <button
                      onClick={() => {
                        setFuzzyMin(80);
                        setFuzzyMax(100);
                        setStructuredMin(0);
                        setStructuredMax(50);
                      }}
                      className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-200"
                    >
                      Fuzzy Good, Structured Poor
                    </button>
                    <button
                      onClick={() => {
                        setFuzzyMin(0);
                        setFuzzyMax(50);
                        setStructuredMin(80);
                        setStructuredMax(100);
                      }}
                      className="rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-200"
                    >
                      Structured Good, Fuzzy Poor
                    </button>
                  </div>
                </div>

                {/* Reset Filters */}
                <div className="flex items-center justify-between border-t border-black/10 pt-3">
                  <p className="text-sm text-black/60">
                    Showing {filteredResults.length} of {results.results.length} conversations
                  </p>
                  <button
                    onClick={() => {
                      setFuzzyMin(0);
                      setFuzzyMax(100);
                      setStructuredMin(0);
                      setStructuredMax(100);
                    }}
                    className="text-sm font-medium text-black hover:underline"
                  >
                    Reset All Filters
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Conversation Results */}
          <div className="space-y-4">
            {filteredResults.map((conv) => (
              <div key={conv.conversation_id} className="rounded-lg border border-black/10 bg-white p-5">
                <div
                  className="flex cursor-pointer items-center justify-between"
                  onClick={() => toggleConversation(conv.conversation_id)}
                >
                  <div className="flex items-center gap-3">
                    {expandedConvs.has(conv.conversation_id) ? (
                      <ChevronDown className="h-5 w-5 text-black/40" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-black/40" />
                    )}
                    <div>
                      <p className="font-semibold text-black">{conv.conversation_id}</p>
                      <p className="text-sm text-black/60">{conv.num_traces} traces</p>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-blue-600">Fuzzy: {conv.avg_fuzzy_score?.toFixed(1)}%</p>
                    <p className="text-purple-600">Structured: {conv.avg_structured_score?.toFixed(1)}%</p>
                    <p className="font-semibold text-black">Combined: {conv.avg_combined_score?.toFixed(1)}%</p>
                  </div>
                </div>

                {expandedConvs.has(conv.conversation_id) && conv.trace_evaluations && (
                  <div className="mt-4 space-y-3 border-t border-black/10 pt-4">
                    {conv.trace_evaluations.map((trace, idx) => (
                      <TraceEvaluationCard key={`${trace.trace_id}-${idx}`} trace={trace} storeNames={storeNames} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default EvalResultsViewer;
